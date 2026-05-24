function resolveSignalingUrl({ currentUrl, baseUri, override }) {
  if (override) return override;
  const protocol = new URL(currentUrl).protocol === 'https:' ? 'wss:' : 'ws:';

  const fromUrl = (rawUrl) => {
    try {
      const base = new URL(rawUrl);
      if (!base.hostname) return null;
      const codespacesLikeHost = base.hostname.match(/^(.*)-(\d+)\.app\.github\.dev$/);
      if (codespacesLikeHost) {
        base.hostname = `${codespacesLikeHost[1]}-8787.app.github.dev`;
        base.port = '';
      } else {
        base.port = '8787';
      }
      base.protocol = protocol;
      base.pathname = '';
      base.search = '';
      base.hash = '';
      return base.toString().replace(/\/$/, '');
    } catch {
      return null;
    }
  };

  return fromUrl(currentUrl) || fromUrl(baseUri) || `${protocol}//localhost:8787`;
}

function generateRoomCode(randomValues) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(randomValues, (value) => alphabet[value % alphabet.length]).join('');
}

function shouldSuppressSocketCloseMessage({ suppressNextSocketCloseMessage, socketCloseCode }) {
  return Boolean(suppressNextSocketCloseMessage && socketCloseCode === 1000);
}

const signalingOverride = new URLSearchParams(window.location.search).get('signaling');
const SIGNALING_URL = resolveSignalingUrl({
  currentUrl: window.location.href,
  baseUri: document.baseURI,
  override: signalingOverride,
});
const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const statusEl = document.getElementById('status');
const roleEl = document.getElementById('role');
const roomLabelEl = document.getElementById('room-label');
const messageEl = document.getElementById('message');

const createRoomBtn = document.getElementById('create-room');
const joinRoomBtn = document.getElementById('join-room');
const leaveRoomBtn = document.getElementById('leave-room');
const copyCodeBtn = document.getElementById('copy-code');
const roomCodeInput = document.getElementById('room-code');
const patternSelectEl = document.getElementById('pattern-select');
const debugPanelEl = document.getElementById('debug-panel');
const debugLogEl = document.getElementById('debug-log');

const GAME_WIDTH = canvas.width;
const GAME_HEIGHT = canvas.height;
const PADDLE_HEIGHT = 90;
const WIN_SCORE = 8;
const POWER_DURATION = 20000;
const POWER_ITEM_SIZE = 10;

const PATTERN_PALETTES = [
  { name: '🌸 Bloom', colors: ['#f9a8d4', '#f472b6', '#fb7185', '#fef08a'] },
  { name: '🌺 Sunset Petals', colors: ['#f97316', '#fb7185', '#f43f5e', '#fde68a'] },
  { name: '🌼 Daisy Pop', colors: ['#fef9c3', '#fde047', '#60a5fa', '#a3e635'] },
  { name: '🌷 Lavender Garden', colors: ['#c4b5fd', '#a78bfa', '#22d3ee', '#f9a8d4'] },
  { name: '🌿 Forest Fern', colors: ['#4ade80', '#22c55e', '#a3e635', '#bef264'] },
  { name: '🌌 Aurora', colors: ['#38bdf8', '#22d3ee', '#a78bfa', '#34d399'] },
];

canvas.addEventListener('pointerdown', () => {
  canvas.focus();
});


const defaultState = () => ({
  leftY: GAME_HEIGHT / 2,
  rightY: GAME_HEIGHT / 2,
  ballX: GAME_WIDTH / 2,
  ballY: GAME_HEIGHT / 2,
  ballVX: 280,
  ballVY: 160,
  leftScore: 0,
  rightScore: 0,
  tick: 0,
  winner: null,
  effects: { left: {}, right: {} },
  powerItems: [],
  stretchWrappedBy: null,
  selectedPatterns: [],
  patterns: { left: '#e2e8f0', right: '#e2e8f0' },
});

function nowMs() {
  return Date.now();
}

function hasEffect(effects, name) {
  return effects[name] && effects[name] > nowMs();
}

let role = null;
let status = 'disconnected';
let roomCode = null;
let pendingRoomCode = null;
let socket = null;
let pc = null;
let dataChannel = null;
let remoteDescriptionSet = false;
let pendingCandidates = [];
let suppressNextSocketCloseMessage = false;

let state = defaultState();
let renderState = defaultState();
let hostInputs = { host: 0, guest: 0 };
let guestInput = 0;
let lastIntent = { host: 0, guest: 0 };
let keys = { up: false, down: false };
let lastSimTime = performance.now();
let lastSnapshotTime = 0;
let latestSnapshot = null;
let activePatternChoices = [];
const DEBUG_MODE = new URLSearchParams(window.location.search).get('debug') === '1';
const MAX_DEBUG_LINES = 300;
const debugLines = [];

function debugLog(message, data) {
  if (!DEBUG_MODE) {
    return;
  }

  const stamp = new Date().toISOString().slice(11, 23);
  let suffix = '';
  if (typeof data !== 'undefined') {
    if (typeof data === 'string') {
      suffix = ` ${data}`;
    } else {
      try {
        suffix = ` ${JSON.stringify(data)}`;
      } catch {
        suffix = ' [unserializable data]';
      }
    }
  }
  const line = `[${stamp}] ${message}${suffix}`;
  debugLines.push(line);
  if (debugLines.length > MAX_DEBUG_LINES) {
    debugLines.shift();
  }
  if (debugLogEl) {
    debugLogEl.textContent = debugLines.join('\n');
  }
  console.debug(`[pong-online] ${message}`, data ?? '');
}

async function createAndSendOffer() {
  if (!pc || !socket || socket.readyState !== WebSocket.OPEN || !roomCode) {
    return;
  }

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  socket.send(JSON.stringify({ type: 'offer', roomCode, offer }));
}

function setStatus(next) {
  status = next;
  statusEl.textContent = status;
  debugLog('status', next);
}

function setMessage(text) {
  messageEl.textContent = text;
  debugLog('message', text);
}

function setRole(nextRole) {
  role = nextRole;
  roleEl.textContent = role ? `(${role})` : '-';
  debugLog('role', role ?? '-');
}

function updateRoomLabel() {
  const displayCode = roomCode || pendingRoomCode;
  roomLabelEl.textContent = displayCode || '-';
  copyCodeBtn.disabled = !displayCode;
}

function updateControlState() {
  const active = Boolean(roomCode || pendingRoomCode);
  leaveRoomBtn.disabled = !active;
  createRoomBtn.disabled = false;
  joinRoomBtn.disabled = active;
  roomCodeInput.disabled = active;
}

function randomCode() {
  const values = new Uint32Array(6);
  if (window.crypto?.getRandomValues) {
    window.crypto.getRandomValues(values);
  } else {
    for (let i = 0; i < values.length; i += 1) {
      values[i] = Math.floor(Math.random() * 0xffffffff);
    }
  }

  return generateRoomCode(values);
}

function closePeerConnection() {
  if (dataChannel) {
    dataChannel.close();
  }
  dataChannel = null;

  if (pc) {
    pc.onicecandidate = null;
    pc.ondatachannel = null;
    pc.onconnectionstatechange = null;
    pc.close();
  }
  pc = null;
  remoteDescriptionSet = false;
  pendingCandidates = [];
}

function disconnectLocal(isRemote = false) {
  closePeerConnection();

  if (socket && socket.readyState === WebSocket.OPEN && roomCode) {
    socket.send(JSON.stringify({ type: 'leave', roomCode }));
  }

  setRole(null);
  pendingRoomCode = null;
  if (!isRemote) {
    roomCode = null;
  }
  updateRoomLabel();
  updateControlState();
  setStatus('disconnected');
  setMessage(isRemote ? 'Peer disconnected. You can rejoin with the room code.' : 'Disconnected. Create or join a room.');
  state = defaultState();
  renderState = defaultState();
  latestSnapshot = null;
}

function ensureSocket() {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return;
  }

  try {
    socket = new WebSocket(SIGNALING_URL);
    debugLog('socket:connect', SIGNALING_URL);
  } catch (error) {
    setStatus('disconnected');
    setMessage(error instanceof Error ? `Invalid signaling URL: ${SIGNALING_URL}` : 'Invalid signaling URL.');
    socket = null;
    return;
  }

  socket.addEventListener('open', () => {
    debugLog('socket:open');
    if (status === 'connecting') {
      setMessage('Connected to signaling. Finishing handshake…');
    }
  });

  socket.addEventListener('message', async (event) => {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch (error) {
      debugLog('socket:bad-json', String(event.data));
      setMessage('Received invalid signaling message.');
      return;
    }
    debugLog('socket:message', message.type || 'unknown');

    if (message.type === 'room_created') {
      pendingRoomCode = null;
      roomCode = message.roomCode;
      updateRoomLabel();
      updateControlState();
      setRole('host');
      await createPeer(true);
      setStatus('waiting');
      setMessage('Room ready. Share the code and wait for a guest…');
      return;
    }

    if (message.type === 'room_joined') {
      roomCode = message.roomCode;
      updateRoomLabel();
      updateControlState();
      setRole('guest');
      await createPeer(false);
      return;
    }

    if (message.type === 'peer_joined' && role === 'host') {
      setStatus('connecting');
      setMessage('Guest joined. Starting WebRTC handshake…');
      await createAndSendOffer();
      return;
    }

    if (message.type === 'offer' && role === 'guest' && pc) {
      await pc.setRemoteDescription(new RTCSessionDescription(message.offer));
      remoteDescriptionSet = true;
      await flushPendingCandidates();
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.send(JSON.stringify({ type: 'answer', roomCode, answer }));
      return;
    }

    if (message.type === 'answer' && role === 'host' && pc) {
      await pc.setRemoteDescription(new RTCSessionDescription(message.answer));
      remoteDescriptionSet = true;
      await flushPendingCandidates();
      return;
    }

    if (message.type === 'ice_candidate' && pc) {
      if (!remoteDescriptionSet) {
        pendingCandidates.push(message.candidate);
      } else {
        await pc.addIceCandidate(new RTCIceCandidate(message.candidate));
      }
      return;
    }

    if (message.type === 'peer_left') {
      setStatus('disconnected');
      setMessage('Peer left the room. You can reconnect.');
      closePeerConnection();
      return;
    }

    if (message.type === 'error') {
      suppressNextSocketCloseMessage = true;
      setMessage(`Error: ${message.message}`);
      setStatus('disconnected');
    }
  });

  socket.addEventListener('close', (event) => {
    debugLog('socket:close');
    socket = null;
    setStatus('disconnected');
    if (shouldSuppressSocketCloseMessage({ suppressNextSocketCloseMessage, socketCloseCode: event.code })) {
      suppressNextSocketCloseMessage = false;
      return;
    }
    setMessage(`Signaling connection closed (code ${event.code || 'unknown'}). Retry create/join.`);
  });

  socket.addEventListener('error', () => {
    debugLog('socket:error');
    setMessage('Signaling error. Check server and retry.');
  });
}

function waitForSocketOpen() {
  return new Promise((resolve, reject) => {
    if (!socket) {
      reject(new Error('Signaling socket not initialized'));
      return;
    }

    if (socket.readyState === WebSocket.OPEN) {
      resolve();
      return;
    }

    if (socket.readyState !== WebSocket.CONNECTING) {
      reject(new Error('Signaling socket unavailable'));
      return;
    }

    let settled = false;

    const cleanup = () => {
      socket?.removeEventListener('open', handleOpen);
      socket?.removeEventListener('error', handleError);
      socket?.removeEventListener('close', handleClose);
    };

    const finish = (fn) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      fn();
    };

    const handleOpen = () => {
      finish(resolve);
    };

    const handleError = () => {
      finish(() => reject(new Error('Signaling connection error')));
    };

    const handleClose = () => {
      finish(() => reject(new Error('Signaling connection closed')));
    };

    socket.addEventListener('open', handleOpen);
    socket.addEventListener('error', handleError);
    socket.addEventListener('close', handleClose);
  });
}

async function flushPendingCandidates() {
  if (!pc || !remoteDescriptionSet || pendingCandidates.length === 0) {
    return;
  }

  while (pendingCandidates.length > 0) {
    const candidate = pendingCandidates.shift();
    await pc.addIceCandidate(new RTCIceCandidate(candidate));
  }
}

async function createPeer(isHost) {
  closePeerConnection();
  pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  debugLog('webrtc:peer-created', { isHost });

  pc.onicecandidate = (event) => {
    if (event.candidate && socket && socket.readyState === WebSocket.OPEN && roomCode) {
      debugLog('webrtc:ice-local-candidate');
      socket.send(JSON.stringify({
        type: 'ice_candidate',
        roomCode,
        candidate: event.candidate,
      }));
    }
  };

  pc.onconnectionstatechange = () => {
    if (!pc) {
      return;
    }
    debugLog('webrtc:connectionState', pc.connectionState);

    if (pc.connectionState === 'connected') {
      setStatus('connected');
      setMessage(`Connected as ${role}. ${role === 'host' ? 'You run simulation.' : 'Receiving host snapshots.'}`);
    } else if (pc.connectionState === 'connecting') {
      setStatus('connecting');
    } else if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
      setStatus('disconnected');
      setMessage('WebRTC disconnected. Leave and rejoin room.');
    }
  };

  if (isHost) {
    dataChannel = pc.createDataChannel('pong');
    setupDataChannel(dataChannel);
  } else {
    pc.ondatachannel = (event) => {
      dataChannel = event.channel;
      setupDataChannel(dataChannel);
    };
  }
}

function setupDataChannel(channel) {
  channel.onopen = () => {
    debugLog('webrtc:datachannel-open', channel.label);
    setStatus('connected');
  };

  channel.onclose = () => {
    debugLog('webrtc:datachannel-close', channel.label);
    setStatus('disconnected');
    setMessage('Data channel closed. Leave and reconnect.');
  };

  channel.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === 'input' && role === 'host') {
      hostInputs.guest = Number(msg.value) || 0;
    }
    if (msg.type === 'snapshot' && role === 'guest') {
      latestSnapshot = msg.state;
    }
  };
}

function sendInput(value) {
  if (role === 'host') {
    hostInputs.host = value;
    return;
  }

  guestInput = value;
  if (dataChannel && dataChannel.readyState === 'open') {
    dataChannel.send(JSON.stringify({ type: 'input', value: guestInput }));
  }
}

function clampPaddle(y) {
  return Math.max(PADDLE_HEIGHT / 2, Math.min(GAME_HEIGHT - PADDLE_HEIGHT / 2, y));
}

function pickPatternChoices() {
  const pool = [...PATTERN_PALETTES].sort(() => Math.random() - 0.5);
  return pool.slice(0, 4);
}

function setupPatternSelect() {
  if (!patternSelectEl) return;
  activePatternChoices = pickPatternChoices();
  patternSelectEl.innerHTML = '';
  activePatternChoices.forEach((pattern, index) => {
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = pattern.name;
    patternSelectEl.appendChild(option);
  });
}

function selectedPatternColor() {
  const idx = Number(patternSelectEl?.value || 0);
  const pattern = activePatternChoices[idx] || activePatternChoices[0];
  return pattern?.colors[0] ?? '#e2e8f0';
}

function applyEffect(side, type) {
  state.effects[side][type] = nowMs() + POWER_DURATION;
}

function spawnPowerItem(kind) {
  const trailing = state.leftScore === state.rightScore ? (Math.random() > 0.5 ? 'left' : 'right') : (state.leftScore < state.rightScore ? 'left' : 'right');
  const winning = trailing === 'left' ? 'right' : 'left';
  const targetSide = kind === 'powerUp' ? trailing : winning;
  const powerTypes = kind === 'powerUp'
    ? ['bigger', 'faster', 'minis', 'stretch']
    : ['wavy', 'smaller', 'gaps', 'icy'];
  state.powerItems.push({
    kind,
    type: powerTypes[Math.floor(Math.random() * powerTypes.length)],
    targetSide,
    x: GAME_WIDTH / 2,
    y: 40 + Math.random() * (GAME_HEIGHT - 80),
    vx: kind === 'powerDown' ? (targetSide === 'left' ? -140 : 140) : 0,
    vy: (Math.random() * 2 - 1) * 100,
    radius: POWER_ITEM_SIZE,
  });
}

function simulateHost(dt) {
  if (state.winner) {
    return;
  }
  if (Math.random() < dt * 0.18) {
    spawnPowerItem(Math.random() > 0.5 ? 'powerUp' : 'powerDown');
  }
  const leftControl = hasEffect(state.effects.left, 'icy') && hostInputs.host === 0 ? lastIntent.host : hostInputs.host;
  const rightControl = hasEffect(state.effects.right, 'icy') && hostInputs.guest === 0 ? lastIntent.guest : hostInputs.guest;
  if (hostInputs.host !== 0) lastIntent.host = hostInputs.host;
  if (hostInputs.guest !== 0) lastIntent.guest = hostInputs.guest;
  const leftSpeed = hasEffect(state.effects.left, 'faster') ? 500 : 350;
  const rightSpeed = hasEffect(state.effects.right, 'faster') ? 500 : 350;
  state.leftY += leftControl * leftSpeed * dt;
  state.rightY += rightControl * rightSpeed * dt;
  state.leftY = hasEffect(state.effects.left, 'stretch')
    ? ((state.leftY + GAME_HEIGHT) % GAME_HEIGHT)
    : clampPaddle(state.leftY);
  state.rightY = hasEffect(state.effects.right, 'stretch')
    ? ((state.rightY + GAME_HEIGHT) % GAME_HEIGHT)
    : clampPaddle(state.rightY);

  state.ballX += state.ballVX * dt;
  state.ballY += state.ballVY * dt;

  if (state.ballY < 8 || state.ballY > GAME_HEIGHT - 8) {
    state.ballVY *= -1;
    state.ballY = Math.max(8, Math.min(GAME_HEIGHT - 8, state.ballY));
  }

  const leftHit = state.ballX < 36 && Math.abs(state.ballY - state.leftY) <= (hasEffect(state.effects.left, 'bigger') ? PADDLE_HEIGHT * 0.7 : PADDLE_HEIGHT / 2);
  if (leftHit && state.ballVX < 0) {
    state.ballVX *= -1.04;
    state.ballX = 36;
  }

  const rightHit = state.ballX > GAME_WIDTH - 36 && Math.abs(state.ballY - state.rightY) <= (hasEffect(state.effects.right, 'bigger') ? PADDLE_HEIGHT * 0.7 : PADDLE_HEIGHT / 2);
  if (rightHit && state.ballVX > 0) {
    state.ballVX *= -1.04;
    state.ballX = GAME_WIDTH - 36;
  }

  if (state.ballX < 0) {
    state.rightScore += 1;
    resetBall(-1);
  }

  if (state.ballX > GAME_WIDTH) {
    state.leftScore += 1;
    resetBall(1);
  }
  if (state.leftScore >= WIN_SCORE || state.rightScore >= WIN_SCORE) {
    state.winner = state.leftScore > state.rightScore ? 'left' : 'right';
  }

  state.powerItems = state.powerItems.filter((item) => {
    item.x += item.vx * dt;
    item.y += item.vy * dt;
    if (item.y < 10 || item.y > GAME_HEIGHT - 10) item.vy *= -1;
    const paddleY = item.targetSide === 'left' ? state.leftY : state.rightY;
    const paddleX = item.targetSide === 'left' ? 26 : GAME_WIDTH - 26;
    if (item.kind === 'powerUp' && Math.abs(item.x - paddleX) < 16 && Math.abs(item.y - paddleY) < PADDLE_HEIGHT / 2) {
      applyEffect(item.targetSide, item.type);
      return false;
    }
    if (item.kind === 'powerDown') {
      if (Math.abs(item.x - paddleX) < 16 && Math.abs(item.y - paddleY) < PADDLE_HEIGHT / 2) {
        item.vx *= -1;
        item.targetSide = item.targetSide === 'left' ? 'right' : 'left';
      }
      const goalHit = (item.targetSide === 'left' && item.x < 0) || (item.targetSide === 'right' && item.x > GAME_WIDTH);
      if (goalHit) {
        applyEffect(item.targetSide, item.type);
        return false;
      }
    }
    return item.x > -40 && item.x < GAME_WIDTH + 40;
  });

  state.tick += 1;
  renderState = { ...state };
}

function resetBall(direction) {
  state.ballX = GAME_WIDTH / 2;
  state.ballY = GAME_HEIGHT / 2;
  state.ballVX = 280 * direction;
  state.ballVY = (Math.random() > 0.5 ? 1 : -1) * (120 + Math.random() * 120);
}

function updateGuestRender(dt) {
  if (!latestSnapshot) {
    return;
  }

  const smoothing = Math.min(1, dt * 10);
  renderState.leftY += (latestSnapshot.leftY - renderState.leftY) * smoothing;
  renderState.rightY += (latestSnapshot.rightY - renderState.rightY) * smoothing;
  renderState.ballX += (latestSnapshot.ballX - renderState.ballX) * smoothing;
  renderState.ballY += (latestSnapshot.ballY - renderState.ballY) * smoothing;
  renderState.leftScore = latestSnapshot.leftScore;
  renderState.rightScore = latestSnapshot.rightScore;
}

function draw() {
  ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  ctx.fillStyle = '#020617';
  ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

  ctx.fillStyle = '#e2e8f0';
  for (let y = 0; y < GAME_HEIGHT; y += 28) {
    ctx.fillRect(GAME_WIDTH / 2 - 2, y, 4, 16);
  }

  const leftPadHeight = hasEffect(renderState.effects.left || {}, 'bigger') ? PADDLE_HEIGHT * 1.4 : hasEffect(renderState.effects.left || {}, 'smaller') ? PADDLE_HEIGHT * 0.65 : PADDLE_HEIGHT;
  const rightPadHeight = hasEffect(renderState.effects.right || {}, 'bigger') ? PADDLE_HEIGHT * 1.4 : hasEffect(renderState.effects.right || {}, 'smaller') ? PADDLE_HEIGHT * 0.65 : PADDLE_HEIGHT;
  ctx.fillStyle = renderState.patterns.left || '#e2e8f0';
  ctx.fillRect(20, renderState.leftY - leftPadHeight / 2, 12, leftPadHeight);
  if (hasEffect(renderState.effects.left || {}, 'gaps')) {
    ctx.clearRect(20, renderState.leftY - leftPadHeight * 0.2, 12, leftPadHeight * 0.1);
  }
  if (hasEffect(renderState.effects.left || {}, 'minis')) {
    ctx.fillRect(40, renderState.leftY - 8, 6, 10);
    ctx.fillRect(40, renderState.leftY + 6, 6, 10);
  }
  ctx.fillStyle = renderState.patterns.right || '#e2e8f0';
  ctx.fillRect(GAME_WIDTH - 32, renderState.rightY - rightPadHeight / 2, 12, rightPadHeight);
  if (hasEffect(renderState.effects.right || {}, 'gaps')) {
    ctx.clearRect(GAME_WIDTH - 32, renderState.rightY - rightPadHeight * 0.2, 12, rightPadHeight * 0.1);
  }
  if (hasEffect(renderState.effects.right || {}, 'minis')) {
    ctx.fillRect(GAME_WIDTH - 46, renderState.rightY - 8, 6, 10);
    ctx.fillRect(GAME_WIDTH - 46, renderState.rightY + 6, 6, 10);
  }

  ctx.beginPath();
  ctx.arc(renderState.ballX, renderState.ballY, 8, 0, Math.PI * 2);
  ctx.fill();

  ctx.font = 'bold 40px sans-serif';
  ctx.fillStyle = '#e2e8f0';
  ctx.fillText(String(renderState.leftScore), GAME_WIDTH / 2 - 80, 48);
  ctx.fillText(String(renderState.rightScore), GAME_WIDTH / 2 + 52, 48);
  for (const item of renderState.powerItems || []) {
    ctx.font = '20px serif';
    const iconMap = { bigger: '🛡️', faster: '⚡', minis: '✨', stretch: '🌀', wavy: '🌊', smaller: '🪶', gaps: '🧩', icy: '❄️' };
    ctx.fillText(iconMap[item.type] || '⭐', item.x - 10, item.y + 7);
  }
  if (renderState.winner) {
    const winnerLabel = renderState.winner === 'left' ? 'LEFT PLAYER' : 'RIGHT PLAYER';
    ctx.save();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.65)';
    ctx.fillRect(80, GAME_HEIGHT / 2 - 80, GAME_WIDTH - 160, 160);
    const g = ctx.createLinearGradient(120, 0, GAME_WIDTH - 120, 0);
    g.addColorStop(0, '#f472b6');
    g.addColorStop(0.5, '#fef08a');
    g.addColorStop(1, '#22d3ee');
    ctx.fillStyle = g;
    ctx.font = 'bold 44px cursive';
    ctx.fillText('CONGRATULATIONS :)', 145, GAME_HEIGHT / 2 - 6);
    ctx.font = 'bold 28px sans-serif';
    ctx.fillText(`${winnerLabel} WINS`, 260, GAME_HEIGHT / 2 + 42);
    ctx.restore();
  }
}

function tick(now) {
  const dt = Math.min((now - lastSimTime) / 1000, 0.05);
  lastSimTime = now;

  const inputValue = keys.up && !keys.down ? -1 : keys.down && !keys.up ? 1 : 0;
  if (inputValue !== guestInput || (role === 'host' && inputValue !== hostInputs.host)) {
    sendInput(inputValue);
  }

  if (role === 'host' && status === 'connected') {
    state.patterns.left = selectedPatternColor();
    if (!state.patterns.right || state.patterns.right === '#e2e8f0') {
      state.patterns.right = activePatternChoices[1]?.colors[1] ?? '#93c5fd';
    }
    simulateHost(dt);
    if (dataChannel && dataChannel.readyState === 'open' && now - lastSnapshotTime > 40) {
      dataChannel.send(JSON.stringify({ type: 'snapshot', state }));
      lastSnapshotTime = now;
    }
  }

  if (role === 'guest' && status === 'connected') {
    updateGuestRender(dt);
  }

  draw();
  const localSide = role === 'host' ? 'left' : 'right';
  const wavy = hasEffect(renderState.effects?.[localSide] || {}, 'wavy');
  canvas.classList.toggle('wavy', wavy);
  requestAnimationFrame(tick);
}

function isControlKey(key) {
  return key === 'w' || key === 'W' || key === 'ArrowUp' || key === 's' || key === 'S' || key === 'ArrowDown';
}

window.addEventListener('keydown', (event) => {
  if (isControlKey(event.key)) {
    event.preventDefault();
  }

  if (event.key === 'w' || event.key === 'W' || event.key === 'ArrowUp') {
    keys.up = true;
  }
  if (event.key === 's' || event.key === 'S' || event.key === 'ArrowDown') {
    keys.down = true;
  }
});

window.addEventListener('keyup', (event) => {
  if (isControlKey(event.key)) {
    event.preventDefault();
  }

  if (event.key === 'w' || event.key === 'W' || event.key === 'ArrowUp') {
    keys.up = false;
  }
  if (event.key === 's' || event.key === 'S' || event.key === 'ArrowDown') {
    keys.down = false;
  }
});

createRoomBtn.addEventListener('click', async () => {
  debugLog('ui:create-room-click');
  if (roomCode || pendingRoomCode) {
    disconnectLocal(false);
  }

  ensureSocket();
  setStatus('waiting');
  setMessage('Creating room…');

  const code = randomCode();
  pendingRoomCode = code;
  updateRoomLabel();
  updateControlState();
  setMessage(`Room code ${code} generated locally. Connecting to signaling…`);

  try {
    await waitForSocketOpen();
    socket.send(JSON.stringify({ type: 'create_room', roomCode: code }));
  } catch (error) {
    setStatus('disconnected');
    setMessage(error instanceof Error ? `${error.message}. Room code generated locally but not registered yet.` : 'Unable to connect to signaling. Room code generated locally but not registered yet.');
  }
});

joinRoomBtn.addEventListener('click', async () => {
  debugLog('ui:join-room-click');
  const code = roomCodeInput.value.trim().toUpperCase();
  if (!code) {
    setMessage('Enter a room code first.');
    return;
  }

  ensureSocket();
  pendingRoomCode = null;
  setStatus('connecting');
  setMessage('Joining room…');
  roomCode = code;
  updateRoomLabel();
  updateControlState();

  try {
    await waitForSocketOpen();
    socket.send(JSON.stringify({ type: 'join_room', roomCode: code }));
  } catch (error) {
    roomCode = null;
    updateRoomLabel();
    updateControlState();
    setStatus('disconnected');
    setMessage(error instanceof Error ? `${error.message}. Retry create/join.` : 'Unable to connect to signaling. Retry create/join.');
  }
});

leaveRoomBtn.addEventListener('click', () => {
  debugLog('ui:leave-room-click');
  disconnectLocal(false);
});

copyCodeBtn.addEventListener('click', async () => {
  const code = roomCode || pendingRoomCode;
  if (!code) {
    return;
  }

  try {
    await navigator.clipboard.writeText(code);
    setMessage(`Room code ${code} copied.`);
  } catch {
    const fallback = document.createElement('textarea');
    fallback.value = code;
    fallback.setAttribute('readonly', '');
    fallback.style.position = 'fixed';
    fallback.style.left = '-9999px';
    document.body.appendChild(fallback);
    fallback.select();

    const copied = document.execCommand('copy');
    document.body.removeChild(fallback);
    if (copied) {
      setMessage(`Room code ${code} copied.`);
      return;
    }

    setMessage(`Clipboard unavailable. Room code: ${code}`);
  }
});

setupPatternSelect();
patternSelectEl?.addEventListener('focus', setupPatternSelect);

setStatus('disconnected');
updateControlState();
updateRoomLabel();
if (DEBUG_MODE && debugPanelEl) {
  debugPanelEl.classList.remove('hidden');
  debugLog('debug-mode', 'enabled via ?debug=1');
  debugLog('signaling-url', SIGNALING_URL);
}
window.addEventListener('error', (event) => {
  debugLog('window:error', event.message || 'unknown');
});
window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason instanceof Error ? event.reason.message : String(event.reason);
  debugLog('window:unhandledrejection', reason);
});
requestAnimationFrame(tick);
