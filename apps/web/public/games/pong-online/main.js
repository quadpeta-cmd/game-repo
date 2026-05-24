import { buildInviteLink, winnerFromOutOfBounds } from './game-logic.mjs';

function resolveSignalingUrls() {
  const params = new URLSearchParams(window.location.search);
  const override = params.get('signaling');
  if (override) return [override];
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return [`${wsProtocol}//${window.location.host}/ws`, `${wsProtocol}//${window.location.hostname}:8787`, `${wsProtocol}//localhost:8787`];
}

const SIGNALING_URLS = resolveSignalingUrls();
let signalingUrlIndex = 0;
const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];
const GAME_WIDTH = 800;
const GAME_HEIGHT = 500;
const BASE_PADDLE_HEIGHT = 90;
const WIN_SCORE = 8;
const EFFECT_MS = 20000;

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const params = new URLSearchParams(window.location.search);

const statusEl = document.getElementById('status');
const roleEl = document.getElementById('role');
const roomLabelEl = document.getElementById('room-label');
const messageEl = document.getElementById('message');
const signalLogEl = document.getElementById('signal-log');
const patternSelectEl = document.getElementById('pattern-select');
const createRoomBtn = document.getElementById('create-room');
const joinRoomBtn = document.getElementById('join-room');
const leaveRoomBtn = document.getElementById('leave-room');
const copyCodeBtn = document.getElementById('copy-code');
const roomCodeInput = document.getElementById('room-code');
const debugPanelEl = document.getElementById('debug-panel');
const debugLogEl = document.getElementById('debug-log');

const patternLibrary = [
  { id: 'flowers', label: '🌸 Flower Bloom', colors: ['#f472b6', '#f9a8d4', '#fbcfe8'] },
  { id: 'aurora', label: '🌌 Aurora', colors: ['#22d3ee', '#06b6d4', '#0ea5e9'] },
  { id: 'sunset', label: '🌇 Sunset', colors: ['#fb7185', '#f97316', '#facc15'] },
  { id: 'forest', label: '🌿 Forest', colors: ['#22c55e', '#4ade80', '#86efac'] },
  { id: 'violet', label: '💜 Violet', colors: ['#a78bfa', '#8b5cf6', '#c4b5fd'] },
];

function defaultState() {
  return { leftY: GAME_HEIGHT / 2, rightY: GAME_HEIGHT / 2, ballX: GAME_WIDTH / 2, ballY: GAME_HEIGHT / 2, ballVX: 280, ballVY: 160, leftScore: 0, rightScore: 0, tick: 0 };
}

let role = null, status = 'disconnected', roomCode = null, pendingRoomCode = null, socket = null, pc = null, dataChannel = null;
let remoteDescriptionSet = false, pendingCandidates = [];
let state = defaultState(), renderState = defaultState();
let hostInputs = { host: 0, guest: 0 }, guestInput = 0;
let keys = { up: false, down: false }, lastSimTime = performance.now(), lastSnapshotTime = 0, latestSnapshot = null;
let pendingSignalAction = null, reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 3;
let heartbeatIntervalId = null;
const DEBUG_MODE = params.get('debug') === '1';
const debugLines = [];
let winnerText = null;
let powerItems = [];
let selectedPatternId = patternLibrary[0].id;
let leftEffects = { until: 0, kind: null };
let rightEffects = { until: 0, kind: null };

function setSignalLog(text) { if (signalLogEl) signalLogEl.textContent = text; }
function debugLog(message, data) { if (!DEBUG_MODE) return; const stamp = new Date().toISOString().slice(11, 23); const line = `[${stamp}] ${message}${typeof data !== 'undefined' ? ` ${JSON.stringify(data)}` : ''}`; debugLines.push(line); if (debugLines.length > 300) debugLines.shift(); if (debugLogEl) debugLogEl.textContent = debugLines.join('\n'); }
function setStatus(next) { status = next; statusEl.textContent = status; }
function setMessage(text) { messageEl.textContent = text; }
function setRole(nextRole) { role = nextRole; roleEl.textContent = role ? `(${role})` : '-'; }
function patternById(id) { return patternLibrary.find((p) => p.id === id) || patternLibrary[0]; }
function clampPaddle(y) { return Math.max(BASE_PADDLE_HEIGHT / 2, Math.min(GAME_HEIGHT - BASE_PADDLE_HEIGHT / 2, y)); }
function randomCode() { const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; const values = new Uint32Array(6); window.crypto.getRandomValues(values); return Array.from(values).map((v) => alphabet[v % alphabet.length]).join(''); }
function intersects(a,b){return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;}
function effectActive(e){return e.kind && e.until > performance.now();}
function paddleHeightFor(side){const e = side==='left'?leftEffects:rightEffects; if(!effectActive(e)) return BASE_PADDLE_HEIGHT; if(e.kind==='big') return BASE_PADDLE_HEIGHT*1.45; if(e.kind==='small') return BASE_PADDLE_HEIGHT*0.7; return BASE_PADDLE_HEIGHT;}
function paddleSpeedFor(side){const e = side==='left'?leftEffects:rightEffects; return effectActive(e)&&e.kind==='speed'?480:350;}
function applyEffect(side,kind){const t = side==='left'?leftEffects:rightEffects; t.kind=kind;t.until=performance.now()+EFFECT_MS;}
function losingSide(){if(state.leftScore===state.rightScore) return Math.random()<0.5?'left':'right'; return state.leftScore<state.rightScore?'left':'right';}
function winningSide(){return losingSide()==='left'?'right':'left';}

function initPatternPicker(){
  if (!patternSelectEl) return;
  const options=[...patternLibrary].sort(()=>Math.random()-0.5).slice(0,3);
  options.forEach((p)=>{const opt=document.createElement('option'); opt.value=p.id; opt.textContent=p.label; patternSelectEl.appendChild(opt);});
  selectedPatternId=options[0].id; patternSelectEl.value=selectedPatternId;
  patternSelectEl.addEventListener('change',()=>{selectedPatternId=patternSelectEl.value; if(dataChannel?.readyState==='open'){dataChannel.send(JSON.stringify({type:'pattern', value:selectedPatternId}));}});
}

function updateRoomLabel(){const displayCode=roomCode||pendingRoomCode; roomLabelEl.textContent=displayCode||'-'; copyCodeBtn.disabled=!displayCode; copyCodeBtn.textContent=displayCode?'Copy invite link':'Copy';}
function updateControlState(){const active=Boolean(roomCode||pendingRoomCode); leaveRoomBtn.disabled=!active; joinRoomBtn.disabled=active; roomCodeInput.disabled=active; if (patternSelectEl) patternSelectEl.disabled=active;}

function closePeerConnection(){if(dataChannel) dataChannel.close(); dataChannel=null; if(pc){pc.close();} pc=null; remoteDescriptionSet=false; pendingCandidates=[];}
function disconnectLocal(isRemote=false){closePeerConnection(); if(heartbeatIntervalId){clearInterval(heartbeatIntervalId); heartbeatIntervalId=null;} if(socket&&socket.readyState===WebSocket.OPEN&&roomCode){socket.send(JSON.stringify({type:'leave', roomCode}));} setRole(null); pendingRoomCode=null; if(!isRemote) roomCode=null; updateRoomLabel(); updateControlState(); setStatus('disconnected'); setMessage(isRemote?'Peer disconnected.':'Disconnected.'); state=defaultState(); renderState=defaultState(); latestSnapshot=null; pendingSignalAction=null; reconnectAttempts=0; winnerText=null; powerItems=[]; leftEffects={until:0,kind:null}; rightEffects={until:0,kind:null};}

function ensureSocket(){
  if(socket&&(socket.readyState===WebSocket.OPEN||socket.readyState===WebSocket.CONNECTING)) return;
  const signalingUrl = SIGNALING_URLS[signalingUrlIndex]||SIGNALING_URLS[0];
  socket = new WebSocket(signalingUrl); setSignalLog(`connect -> ${signalingUrl}`);
  socket.addEventListener('open',()=>{setSignalLog('open'); reconnectAttempts=0; if(pendingSignalAction) socket.send(JSON.stringify(pendingSignalAction)); if(!heartbeatIntervalId){heartbeatIntervalId=setInterval(()=>{if(socket?.readyState===WebSocket.OPEN) socket.send(JSON.stringify({type:'heartbeat', roomCode}));},20000);} });
  socket.addEventListener('message', async (event)=>{const message=JSON.parse(event.data); setSignalLog(`message:${message.type||'unknown'}`);
    if(message.type==='room_created'){pendingSignalAction=null; pendingRoomCode=null; roomCode=message.roomCode; updateRoomLabel(); updateControlState(); setRole('host'); await createPeer(true); setStatus('waiting'); return;}
    if(message.type==='room_joined'){pendingSignalAction=null; roomCode=message.roomCode; updateRoomLabel(); updateControlState(); setRole('guest'); await createPeer(false); return;}
    if(message.type==='peer_joined'&&role==='host'){setStatus('connecting'); const offer=await pc.createOffer(); await pc.setLocalDescription(offer); socket.send(JSON.stringify({type:'offer',roomCode,offer})); return;}
    if(message.type==='offer'&&role==='guest'&&pc){await pc.setRemoteDescription(new RTCSessionDescription(message.offer)); remoteDescriptionSet=true; await flushPendingCandidates(); const answer=await pc.createAnswer(); await pc.setLocalDescription(answer); socket.send(JSON.stringify({type:'answer',roomCode,answer})); return;}
    if(message.type==='answer'&&role==='host'&&pc){await pc.setRemoteDescription(new RTCSessionDescription(message.answer)); remoteDescriptionSet=true; await flushPendingCandidates(); return;}
    if(message.type==='ice_candidate'&&pc){ if(!remoteDescriptionSet) pendingCandidates.push(message.candidate); else await pc.addIceCandidate(new RTCIceCandidate(message.candidate)); return;}
    if(message.type==='peer_left'){disconnectLocal(true); return;}
    if(message.type==='error'){pendingSignalAction=null; setStatus('disconnected'); setMessage(`Error: ${message.message}`);} });
  socket.addEventListener('close',(event)=>{setSignalLog(`close:${event.code}`); socket=null; setStatus('disconnected'); if(pendingSignalAction&&reconnectAttempts<MAX_RECONNECT_ATTEMPTS){reconnectAttempts+=1; signalingUrlIndex=(signalingUrlIndex+1)%SIGNALING_URLS.length; setTimeout(ensureSocket,300*reconnectAttempts); return;} if(heartbeatIntervalId){clearInterval(heartbeatIntervalId); heartbeatIntervalId=null;} setMessage(`Signaling connection closed (code ${event.code||'unknown'}). Retry create/join.`);});
}

function waitForSocketOpen(){return new Promise((resolve,reject)=>{if(!socket) return reject(new Error('Signaling socket not initialized')); if(socket.readyState===WebSocket.OPEN) return resolve(); if(socket.readyState!==WebSocket.CONNECTING) return reject(new Error('Signaling socket unavailable')); socket.addEventListener('open',resolve,{once:true}); socket.addEventListener('error',()=>reject(new Error('Signaling connection error')),{once:true}); socket.addEventListener('close',()=>reject(new Error('Signaling connection closed')),{once:true});});}
async function flushPendingCandidates(){if(!pc||!remoteDescriptionSet) return; while(pendingCandidates.length){await pc.addIceCandidate(new RTCIceCandidate(pendingCandidates.shift()));}}

async function createPeer(isHost){
  closePeerConnection(); pc = new RTCPeerConnection({iceServers: ICE_SERVERS});
  pc.onicecandidate=(event)=>{if(event.candidate&&socket?.readyState===WebSocket.OPEN&&roomCode){socket.send(JSON.stringify({type:'ice_candidate',roomCode,candidate:event.candidate}));}};
  pc.onconnectionstatechange=()=>{if(pc.connectionState==='connected'){setStatus('connected');} else if(['disconnected','failed','closed'].includes(pc.connectionState)){setStatus('disconnected');}};
  if(isHost){dataChannel=pc.createDataChannel('pong'); setupDataChannel(dataChannel);} else {pc.ondatachannel=(event)=>{dataChannel=event.channel; setupDataChannel(dataChannel);};}
}

function setupDataChannel(channel){
  channel.onopen=()=>setStatus('connected');
  channel.onmessage=(event)=>{const msg=JSON.parse(event.data); if(msg.type==='input'&&role==='host') hostInputs.guest=Number(msg.value)||0; if(msg.type==='snapshot'&&role==='guest') latestSnapshot=msg.state; if(msg.type==='pattern') selectedPatternId=msg.value;};
}

function maybeSpawnItems(){
  if(state.tick%180!==0||winnerText) return;
  if(Math.random()<0.55){
    powerItems.push({type:'up',targetSide:losingSide(),effect:['big','speed','mini'][Math.floor(Math.random()*3)],x:GAME_WIDTH/2,y:70+Math.random()*(GAME_HEIGHT-140),vx:(Math.random()<0.5?-1:1)*2,vy:(Math.random()-0.5)*2,icon:'⬆️'});
  } else {
    powerItems.push({type:'down',targetSide:winningSide(),effect:['wavy','small','gaps'][Math.floor(Math.random()*3)],x:GAME_WIDTH/2,y:70+Math.random()*(GAME_HEIGHT-140),vx:(winningSide()==='left'?-2:2),vy:(Math.random()-0.5)*2,icon:'⬇️'});
  }
}

function simulateHost(dt){
  if(winnerText) return;
  state.leftY = clampPaddle(state.leftY + hostInputs.host * paddleSpeedFor('left') * dt);
  state.rightY = clampPaddle(state.rightY + hostInputs.guest * paddleSpeedFor('right') * dt);
  state.ballX += state.ballVX * dt; state.ballY += state.ballVY * dt;
  if(state.ballY<8||state.ballY>GAME_HEIGHT-8){state.ballVY*=-1; state.ballY=Math.max(8,Math.min(GAME_HEIGHT-8,state.ballY));}
  const leftH=paddleHeightFor('left'); const rightH=paddleHeightFor('right');
  const leftHit = state.ballX < 36 && Math.abs(state.ballY - state.leftY) <= leftH/2;
  if(leftHit&&state.ballVX<0){state.ballVX*=-1.04; state.ballX=36;}
  const rightHit = state.ballX > GAME_WIDTH-36 && Math.abs(state.ballY - state.rightY) <= rightH/2;
  if(rightHit&&state.ballVX>0){state.ballVX*=-1.04; state.ballX=GAME_WIDTH-36;}
  if(winnerFromOutOfBounds(state.ballX,GAME_WIDTH)==='right'){state.rightScore+=1; resetBall(1);} if(winnerFromOutOfBounds(state.ballX,GAME_WIDTH)==='left'){state.leftScore+=1; resetBall(-1);} if(state.leftScore>=WIN_SCORE||state.rightScore>=WIN_SCORE){winnerText=state.leftScore>=WIN_SCORE?'Left player':'Right player'; setStatus('finished');}
  state.tick += 1; maybeSpawnItems(); updatePowerItems(); renderState={...state};
}

function updatePowerItems(){
  const leftPad={x:20,y:state.leftY-paddleHeightFor('left')/2,w:12,h:paddleHeightFor('left')};
  const rightPad={x:GAME_WIDTH-32,y:state.rightY-paddleHeightFor('right')/2,w:12,h:paddleHeightFor('right')};
  for(const item of powerItems){item.x+=item.vx; item.y+=item.vy; if(item.y<20||item.y>GAME_HEIGHT-20) item.vy*=-1;
    if(item.type==='up'){
      const pad=item.targetSide==='left'?leftPad:rightPad;
      if(intersects({x:item.x-10,y:item.y-10,w:20,h:20},pad)){applyEffect(item.targetSide,item.effect); item.dead=true;}
    } else {
      if(item.x<8){applyEffect('left',item.effect); item.dead=true;} else if(item.x>GAME_WIDTH-8){applyEffect('right',item.effect); item.dead=true;}
      if(intersects({x:item.x-10,y:item.y-10,w:20,h:20},leftPad)) item.vx=Math.abs(item.vx);
      if(intersects({x:item.x-10,y:item.y-10,w:20,h:20},rightPad)) item.vx=-Math.abs(item.vx);
    }
  }
  powerItems=powerItems.filter((i)=>!i.dead);
}

function resetBall(direction){state.ballX=GAME_WIDTH/2;state.ballY=GAME_HEIGHT/2;state.ballVX=280*direction;state.ballVY=(Math.random()>0.5?1:-1)*(120+Math.random()*120);}
function updateGuestRender(dt){if(!latestSnapshot)return; const s=Math.min(1,dt*10); renderState.leftY += (latestSnapshot.leftY-renderState.leftY)*s; renderState.rightY += (latestSnapshot.rightY-renderState.rightY)*s; renderState.ballX += (latestSnapshot.ballX-renderState.ballX)*s; renderState.ballY += (latestSnapshot.ballY-renderState.ballY)*s; renderState.leftScore=latestSnapshot.leftScore; renderState.rightScore=latestSnapshot.rightScore; }

function drawPaddle(x, centerY, side){
  const pattern = patternById(selectedPatternId); const h=paddleHeightFor(side); const top=centerY-h/2;
  const grad=ctx.createLinearGradient(x,0,x+12,0); grad.addColorStop(0,pattern.colors[0]); grad.addColorStop(0.5,pattern.colors[1]); grad.addColorStop(1,pattern.colors[2]); ctx.fillStyle=grad;
  if((side==='left'?leftEffects:rightEffects).kind==='gaps' && effectActive(side==='left'?leftEffects:rightEffects)){
    ctx.fillRect(x,top,12,h*0.3); ctx.fillRect(x,top+h*0.45,12,h*0.25); ctx.fillRect(x,top+h*0.8,12,h*0.2);
  } else { ctx.fillRect(x,top,12,h); }
  if((side==='left'?leftEffects:rightEffects).kind==='mini' && effectActive(side==='left'?leftEffects:rightEffects)){
    ctx.fillRect(x-8,centerY-h*0.2,4,h*0.18); ctx.fillRect(x+16,centerY+h*0.02,4,h*0.18);
  }
}

function draw(){
  ctx.clearRect(0,0,GAME_WIDTH,GAME_HEIGHT); ctx.fillStyle='#020617'; ctx.fillRect(0,0,GAME_WIDTH,GAME_HEIGHT);
  ctx.fillStyle='#e2e8f0'; for(let y=0;y<GAME_HEIGHT;y+=28) ctx.fillRect(GAME_WIDTH/2-2,y,4,16);
  if(effectActive(leftEffects)&&leftEffects.kind==='wavy'){ctx.save();ctx.translate(Math.sin(performance.now()/80)*4,0);} drawPaddle(20,renderState.leftY,'left'); if(effectActive(leftEffects)&&leftEffects.kind==='wavy') ctx.restore();
  if(effectActive(rightEffects)&&rightEffects.kind==='wavy'){ctx.save();ctx.translate(Math.sin(performance.now()/80)*-4,0);} drawPaddle(GAME_WIDTH-32,renderState.rightY,'right'); if(effectActive(rightEffects)&&rightEffects.kind==='wavy') ctx.restore();
  ctx.beginPath(); ctx.arc(renderState.ballX,renderState.ballY,8,0,Math.PI*2); ctx.fill();
  ctx.font='bold 40px sans-serif'; ctx.fillText(String(renderState.leftScore),GAME_WIDTH/2-80,48); ctx.fillText(String(renderState.rightScore),GAME_WIDTH/2+52,48);
  ctx.font='22px sans-serif'; for(const item of powerItems){ctx.fillText(item.icon,item.x-8,item.y+8);} 
  if(winnerText){ctx.fillStyle='rgba(255,255,255,0.95)'; ctx.font='bold 58px serif'; ctx.fillText('CONGRATULATIONS :)',120,GAME_HEIGHT/2); ctx.font='bold 28px serif'; ctx.fillText(`${winnerText} wins 8-point match`,205,GAME_HEIGHT/2+44);} 
}

function sendInput(value){if(role==='host'){hostInputs.host=value; return;} guestInput=value; if(dataChannel?.readyState==='open') dataChannel.send(JSON.stringify({type:'input',value:guestInput}));}
function tick(now){const dt=Math.min((now-lastSimTime)/1000,0.05); lastSimTime=now; const input=keys.up&&!keys.down?-1:keys.down&&!keys.up?1:0; if(input!==guestInput||(role==='host'&&input!==hostInputs.host)) sendInput(input); if(role==='host'&&status==='connected') {simulateHost(dt); if(dataChannel?.readyState==='open'&&now-lastSnapshotTime>40){dataChannel.send(JSON.stringify({type:'snapshot',state})); if(dataChannel.readyState==='open') dataChannel.send(JSON.stringify({type:'pattern', value:selectedPatternId})); lastSnapshotTime=now;}} if(role==='guest'&&status==='connected') updateGuestRender(dt); draw(); requestAnimationFrame(tick);}

window.addEventListener('keydown',(e)=>{if(['w','W','ArrowUp'].includes(e.key)) keys.up=true; if(['s','S','ArrowDown'].includes(e.key)) keys.down=true;});
window.addEventListener('keyup',(e)=>{if(['w','W','ArrowUp'].includes(e.key)) keys.up=false; if(['s','S','ArrowDown'].includes(e.key)) keys.down=false;});

createRoomBtn.addEventListener('click', async ()=>{if(roomCode||pendingRoomCode) disconnectLocal(false); ensureSocket(); setStatus('waiting'); const code=randomCode(); pendingRoomCode=code; updateRoomLabel(); updateControlState(); try{await waitForSocketOpen(); pendingSignalAction={type:'create_room',roomCode:code}; socket.send(JSON.stringify(pendingSignalAction));}catch(error){setStatus('disconnected'); setMessage(error.message);}});
joinRoomBtn.addEventListener('click', async ()=>{const code=roomCodeInput.value.trim().toUpperCase(); if(!code){setMessage('Enter a room code first.');return;} ensureSocket(); pendingRoomCode=null; setStatus('connecting'); roomCode=code; updateRoomLabel(); updateControlState(); try{await waitForSocketOpen(); pendingSignalAction={type:'join_room',roomCode:code}; socket.send(JSON.stringify(pendingSignalAction));}catch(error){roomCode=null; updateRoomLabel(); updateControlState(); setStatus('disconnected'); setMessage(error.message);}});
leaveRoomBtn.addEventListener('click',()=>disconnectLocal(false));
copyCodeBtn.addEventListener('click',async ()=>{const code=roomCode||pendingRoomCode; if(!code) return; const inviteLink=buildInviteLink(window.location.href,code); try{await navigator.clipboard.writeText(inviteLink); setMessage('Invite link copied.');}catch{setMessage(`Clipboard unavailable. Invite link: ${inviteLink}`);}});

initPatternPicker();
setStatus('disconnected'); updateControlState(); updateRoomLabel(); const prefilledRoom=params.get('room'); if(prefilledRoom){roomCodeInput.value=prefilledRoom.toUpperCase();}
setSignalLog('idle'); if(DEBUG_MODE&&debugPanelEl){debugPanelEl.classList.remove('hidden'); debugLog('signaling-candidates',SIGNALING_URLS);} requestAnimationFrame(tick);
