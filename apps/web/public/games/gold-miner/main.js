import { createGame, stepGame, applyInput, getRenderableFrame, startNextLevel, buyShopItem, checksumState } from './core/simulation.mjs';
import { GAME_STATES, WORLD } from './core/constants.mjs';
import { runReplay } from './core/replay.mjs';
import { createRuntimeOnlineController, enqueueLocalGameplayInput, handleIncomingGameplayPacket, hostStart, ONLINE_UI_STATES, safeDecodeGameplayPacket, tickRuntimeOnline } from './core/runtime-online.mjs';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const params = new URLSearchParams(window.location.search);
const debug = params.get('debug') === '1';
const routeName = window.location.pathname.split('/').filter(Boolean).at(-2) || '';
const forcedMode = routeName === 'gold-miner-coop' ? 'coop' : routeName === 'gold-miner-online' ? 'online' : null;
const modeParam = forcedMode || params.get('mode') || 'solo';
const isOnlineMode = modeParam === 'online';

function baseConfig(seed = 123456) {
  if (modeParam === 'coop') return { mode: 'local-two-player', variant: 'coop', seed, level: 1, playerCount: 2 };
  if (modeParam === 'versus') return { mode: 'local-two-player', variant: 'versus', seed, level: 1, playerCount: 2 };
  if (modeParam === 'online') return { mode: 'online-two-player', variant: 'coop', seed, level: 1, playerCount: 2 };
  return { mode: 'one-player', variant: 'solo', seed, level: 1, playerCount: 1 };
}

let state = createGame(baseConfig());
let paused = false;
let queued = [];
let accumulator = 0;
let last = performance.now();
const FIXED_DT_MS = 1000 / 60;

let onlineController = null;
let onlineRole = null;
let onlineSocket = null;
let onlinePc = null;
let onlineDc = null;
let onlineRoomCode = null;
let onlinePendingCandidates = [];
let onlineRemoteDescriptionSet = false;
let onlineHeartbeat = null;
const ONLINE_SIGNALING_URL = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.hostname}:8787`;
const ONLINE_ICE = [{ urls: 'stun:stun.l.google.com:19302' }];

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function sfx(freq = 440, duration = 0.08, type = 'sine', gain = 0.04) {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(gain, now + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.connect(g).connect(audioCtx.destination);
  osc.start(now); osc.stop(now + duration);
}
window.addEventListener('keydown', () => audioCtx?.state === 'suspended' && audioCtx.resume(), { once: true });


function onlineSend(payload) {
  if (onlineDc && onlineDc.readyState === 'open') onlineDc.send(payload);
}

function setOnlineDisconnected() {
  paused = true;
  if (state.gameState === GAME_STATES.PLAYING) state.gameState = GAME_STATES.ONLINE_DISCONNECTED;
}

function onlineOverlayText() {
  if (!isOnlineMode) return null;
  if (!onlineController) return 'ONLINE_WAITING';
  return onlineController.uiState;
}


function queue(playerId, action, value) { queued.push({ tick: state.tick + 1, playerId, action, value });
  if (action === 'fire') sfx(220, 0.06, 'square', 0.03);
  if (action === 'dynamite') sfx(110, 0.2, 'sawtooth', 0.06);
}

function drawShop() {
  ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(0, 0, WORLD.width, WORLD.height);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 34px system-ui'; ctx.fillText('Shop', 350, 90);
  ctx.font = '18px system-ui';
  const items = Object.entries(state.shop.prices ?? {});
  items.forEach(([id, price], i) => { ctx.fillText(`${i + 1}. ${id} - $${price}`, 190, 150 + i * 34); });
  ctx.fillText('Press 1-6 to buy · Enter to continue', 210, 420);
}

function draw(frame) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const sky = ctx.createLinearGradient(0, 0, 0, WORLD.mineTop);
  sky.addColorStop(0, '#f59e0b');
  sky.addColorStop(1, '#fbbf24');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, WORLD.width, WORLD.hudHeight);
  const mine = ctx.createLinearGradient(0, WORLD.mineTop, 0, WORLD.height);
  mine.addColorStop(0, '#1f2937');
  mine.addColorStop(1, '#111827');
  ctx.fillStyle = mine; ctx.fillRect(0, WORLD.mineTop, WORLD.width, WORLD.height - WORLD.mineTop);
  for (let i = 0; i < 30; i += 1) {
    ctx.fillStyle = i % 3 === 0 ? 'rgba(253,224,71,0.15)' : 'rgba(156,163,175,0.12)';
    ctx.beginPath();
    ctx.arc((i * 53) % WORLD.width, WORLD.mineTop + ((i * 97) % (WORLD.height - WORLD.mineTop)), 2 + (i % 3), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#111827'; ctx.font = 'bold 20px system-ui';
  const scoreText = frame.scores ? `P1 $${frame.scores[1]} P2 $${frame.scores[2]}` : `$${state.score}`;
  ctx.fillText(scoreText, 16, 38);
  ctx.fillText(`Goal $${state.target}`, 260, 38); ctx.fillText(`Time ${Math.ceil(state.timeLeftMs / 1000)}`, 460, 38); ctx.fillText(`Lv ${state.level}`, 620, 38);

  for (const o of frame.objects) {
    const isGold = o.type.startsWith('gold_');
    const grad = ctx.createRadialGradient(o.x - o.radius * 0.3, o.y - o.radius * 0.4, 1, o.x, o.y, o.radius);
    if (isGold) { grad.addColorStop(0, '#fde68a'); grad.addColorStop(1, '#ca8a04'); }
    else { grad.addColorStop(0, '#d1d5db'); grad.addColorStop(1, '#6b7280'); }
    ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(o.x, o.y, o.radius, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = isGold ? '#92400e' : '#374151'; ctx.lineWidth = 2; ctx.stroke();
  }

  frame.players.forEach((p, idx) => {
    const origin = state.playerCount === 1 ? WORLD.clawOrigin1P : idx === 0 ? WORLD.clawOriginP1 : WORLD.clawOriginP2;
    const tipX = origin.x + Math.sin(p.angle) * p.length; const tipY = origin.y + Math.cos(p.angle) * p.length;
    ctx.strokeStyle = idx === 0 ? '#e5e7eb' : '#93c5fd';
    ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(origin.x, origin.y); ctx.lineTo(tipX, tipY); ctx.stroke();
    ctx.beginPath(); ctx.arc(tipX, tipY, 8, 0, Math.PI * 2); ctx.fillStyle = '#f3f4f6'; ctx.fill();
  });

  if (state.gameState === GAME_STATES.LEVEL_FAIL) { ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0,0,WORLD.width,WORLD.height); ctx.fillStyle='#fff'; ctx.font='bold 40px system-ui'; ctx.fillText('Level Failed', 280,250); }
  if (isOnlineMode) { const txt = onlineOverlayText(); if (txt) { ctx.fillStyle='rgba(0,0,0,0.35)'; ctx.fillRect(520,8,270,26); ctx.fillStyle='#fff'; ctx.font='14px monospace'; ctx.fillText(txt, 528,26);} }
  if (isOnlineMode && state.gameState === GAME_STATES.ONLINE_DISCONNECTED) { ctx.fillStyle='rgba(0,0,0,0.6)'; ctx.fillRect(0,0,WORLD.width,WORLD.height); ctx.fillStyle='#fff'; ctx.font='bold 32px system-ui'; ctx.fillText('ONLINE DISCONNECTED', 220, 250); }
  if (state.gameState === GAME_STATES.SHOP) drawShop();
  if (debug) { ctx.fillStyle = '#22c55e'; ctx.font = '14px monospace'; ctx.fillText(`tick:${state.tick} objs:${frame.objects.length} state:${state.gameState} mode:${state.variant}`, 10, WORLD.height - 12); }
}

function frame(now) {
  const elapsed = Math.min(100, now - last); last = now;
  if (!paused && state.gameState === GAME_STATES.PLAYING) {
    accumulator += elapsed;
    while (accumulator >= FIXED_DT_MS) {
      if (isOnlineMode && onlineController) {
        for (const q of queued) enqueueLocalGameplayInput(onlineController, q).forEach(onlineSend);
        const packets = tickRuntimeOnline(onlineController, FIXED_DT_MS);
        packets.forEach(onlineSend);
        if (onlineController.session.game) state = onlineController.session.game;
      } else {
        stepGame(state, queued, FIXED_DT_MS);
      }
      queued = []; accumulator -= FIXED_DT_MS;
    }
  } else if (queued.length) { stepGame(state, queued, FIXED_DT_MS); queued = []; }
  draw(getRenderableFrame(state)); requestAnimationFrame(frame);
}

window.addEventListener('keydown', (e) => {
  if (state.playerCount === 1) {
    if (e.key === 'ArrowDown' || e.key === ' ') queue(1, 'fire');
    if (e.key === 'ArrowUp' || e.key === 'd' || e.key === 'D') queue(1, 'dynamite');
  } else {
    if (e.key === 's' || e.key === 'S') queue(1, 'fire');
    if (e.key === 'w' || e.key === 'W') queue(1, 'dynamite');
    if (e.key === 'ArrowDown') queue(2, 'fire');
    if (e.key === 'ArrowUp') queue(2, 'dynamite');
  }
  if (e.key === 'p' || e.key === 'P') paused = !paused;
  if (e.key === 'r' || e.key === 'R') { state = createGame(baseConfig(state.seed)); if (isOnlineMode) window.location.reload(); }
  if (state.gameState === GAME_STATES.SHOP && e.key === 'Enter') startNextLevel(state);
  if (state.gameState === GAME_STATES.SHOP && /^[1-6]$/.test(e.key)) {
    const ids = Object.keys(state.shop.prices ?? {});
    buyShopItem(state, ids[Number(e.key) - 1], 1);
  }
});

window.__goldMinerTest = {
  step(ticks = 1) { for (let i = 0; i < ticks; i++) stepGame(state, [], FIXED_DT_MS); },
  press(playerId, action, value) { applyInput(state, { playerId, action, value }); },
  runReplay(frames = [], maxTicks = 3600) { return runReplay({ seed: state.seed, mode: state.mode, variant: state.variant, frames, maxTicks }); },
  getState() { return JSON.parse(JSON.stringify(state)); },
  getChecksum() { return checksumState(state); },
  setSeed(seed) { state = createGame(baseConfig(seed)); },
  reset(config = {}) { state = createGame({ ...baseConfig(config.seed ?? state.seed), ...config }); }
};


async function initOnlineMode() {
  if (!isOnlineMode) return;
  onlineRole = params.get('role') === 'guest' ? 'guest' : 'host';
  onlineController = createRuntimeOnlineController({ role: onlineRole, seed: state.seed });
  const room = params.get('room') || '';
  onlineRoomCode = room;
  onlineSocket = new WebSocket(ONLINE_SIGNALING_URL);
  onlineSocket.addEventListener('open', async () => {
    onlineHeartbeat = setInterval(() => onlineSocket?.send(JSON.stringify({ type: 'heartbeat' })), 15000);
    if (onlineRole === 'host') onlineSocket.send(JSON.stringify({ type: 'create_room', roomCode: room || `GM${Math.floor(Math.random()*10000)}` }));
    else onlineSocket.send(JSON.stringify({ type: 'join_room', roomCode: room }));
  });
  onlineSocket.addEventListener('message', async (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === 'room_created') { onlineRoomCode = msg.roomCode; }
    if (msg.type === 'room_joined') { onlineRoomCode = msg.roomCode; }
    if (msg.type === 'peer_joined' && onlineRole === 'host') {
      onlinePc = new RTCPeerConnection({ iceServers: ONLINE_ICE });
      onlineDc = onlinePc.createDataChannel('gold-miner');
      setupChannel();
      setupPc();
      const offer = await onlinePc.createOffer();
      await onlinePc.setLocalDescription(offer);
      onlineSocket.send(JSON.stringify({ type: 'offer', roomCode: onlineRoomCode, offer }));
    }
    if (msg.type === 'offer' && onlineRole === 'guest') {
      onlinePc = new RTCPeerConnection({ iceServers: ONLINE_ICE });
      setupPc();
      onlinePc.ondatachannel = (e) => { onlineDc = e.channel; setupChannel(); };
      await onlinePc.setRemoteDescription(new RTCSessionDescription(msg.offer));
      onlineRemoteDescriptionSet = true;
      while (onlinePendingCandidates.length) await onlinePc.addIceCandidate(new RTCIceCandidate(onlinePendingCandidates.shift()));
      const answer = await onlinePc.createAnswer();
      await onlinePc.setLocalDescription(answer);
      onlineSocket.send(JSON.stringify({ type: 'answer', roomCode: onlineRoomCode, answer }));
    }
    if (msg.type === 'answer' && onlinePc) { await onlinePc.setRemoteDescription(new RTCSessionDescription(msg.answer)); onlineRemoteDescriptionSet = true; }
    if (msg.type === 'ice_candidate' && onlinePc) {
      if (!onlineRemoteDescriptionSet) onlinePendingCandidates.push(msg.candidate);
      else await onlinePc.addIceCandidate(new RTCIceCandidate(msg.candidate));
    }
    if (msg.type === 'peer_left') { handleIncomingGameplayPacket(onlineController, JSON.stringify({ type: 'gm_pause', reason: 'peer_left' })); setOnlineDisconnected(); }
  });
}

function setupPc() {
  onlinePc.onicecandidate = (event) => { if (event.candidate) onlineSocket.send(JSON.stringify({ type: 'ice_candidate', roomCode: onlineRoomCode, candidate: event.candidate })); };
  onlinePc.onconnectionstatechange = () => { if (['failed','disconnected','closed'].includes(onlinePc.connectionState)) setOnlineDisconnected(); };
}

function setupChannel() {
  onlineDc.onopen = () => { if (onlineRole === 'host') onlineSend(hostStart(onlineController)); };
  onlineDc.onmessage = (event) => {
    const probe = safeDecodeGameplayPacket(event.data);
    if (!probe.ok) return;
    handleIncomingGameplayPacket(onlineController, event.data);
    if (onlineController.session.game) state = onlineController.session.game;
  };
  onlineDc.onclose = () => setOnlineDisconnected();
}

initOnlineMode();
requestAnimationFrame(frame);
