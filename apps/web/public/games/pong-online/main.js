function resolveSignalingUrls() {
  const params = new URLSearchParams(window.location.search);
  const override = params.get('signaling');

  if (override) {
    return [override];
  }

  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const sameOriginPath = `${wsProtocol}//${window.location.host}/ws`;
  const sameHostPort = `${wsProtocol}//${window.location.hostname}:8787`;

  return [sameOriginPath, sameHostPort, `${wsProtocol}//localhost:8787`];
}

const SIGNALING_URLS = resolveSignalingUrls();
let signalingUrlIndex = 0;
const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const statusEl = document.getElementById('status');
const roleEl = document.getElementById('role');
const roomLabelEl = document.getElementById('room-label');
const messageEl = document.getElementById('message');
const signalLogEl = document.getElementById('signal-log');

const createRoomBtn = document.getElementById('create-room');
const joinRoomBtn = document.getElementById('join-room');
const leaveRoomBtn = document.getElementById('leave-room');
const copyCodeBtn = document.getElementById('copy-code');
const roomCodeInput = document.getElementById('room-code');
const debugPanelEl = document.getElementById('debug-panel');
const debugLogEl = document.getElementById('debug-log');

const GAME_WIDTH = canvas.width;
const GAME_HEIGHT = canvas.height;
const PADDLE_HEIGHT = 90;

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
});

let role = null;
let status = 'disconnected';
let roomCode = null;
let pendingRoomCode = null;
let socket = null;
let pc = null;
let dataChannel = null;
let remoteDescriptionSet = false;
let pendingCandidates = [];

let state = defaultState();
let renderState = defaultState();
let hostInputs = { host: 0, guest: 0 };
let guestInput = 0;
let keys = { up: false, down: false };
let lastSimTime = performance.now();
let lastSnapshotTime = 0;
let latestSnapshot = null;
let pendingSignalAction = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 3;
const DEBUG_MODE = new URLSearchParams(window.location.search).get('debug') === '1';
const MAX_DEBUG_LINES = 300;
const debugLines = [];

function setSignalLog(text) {
  if (signalLogEl) {
    signalLogEl.textContent = text;
  }
}

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
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const values = new Uint32Array(6);
  if (window.crypto?.getRandomValues) {
    window.crypto.getRandomValues(values);
  } else {
    for (let i = 0; i < values.length; i += 1) {
      values[i] = Math.floor(Math.random() * 0xffffffff);
    }
  }

  let code = '';
  for (let i = 0; i < values.length; i += 1) {
    code += alphabet[values[i] % alphabet.length];
  }
  return code;
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
  pendingSignalAction = null;
  reconnectAttempts = 0;
}

function ensureSocket() {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return;
  }

  try {
    const signalingUrl = SIGNALING_URLS[signalingUrlIndex] || SIGNALING_URLS[0];
    socket = new WebSocket(signalingUrl);
    debugLog('socket:connect', signalingUrl);
    setSignalLog(`connect -> ${signalingUrl}`);
  } catch (error) {
    setStatus('disconnected');
    setMessage(error instanceof Error ? 'Invalid signaling URL.' : 'Invalid signaling URL.');
    socket = null;
    return;
  }

  socket.addEventListener('open', () => {
    debugLog('socket:open');
    setSignalLog('open');
    reconnectAttempts = 0;
    if (pendingSignalAction) {
      debugLog('socket:replay-action', pendingSignalAction.type);
      socket.send(JSON.stringify(pendingSignalAction));
    }
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
    setSignalLog(`message:${message.type || 'unknown'}`);

    if (message.type === 'room_created') {
      pendingSignalAction = null;
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
      pendingSignalAction = null;
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
      pendingSignalAction = null;
      setMessage(`Error: ${message.message}`);
      setStatus('disconnected');
    }
  });

  socket.addEventListener('close', (event) => {
    debugLog('socket:close', { code: event.code, reason: event.reason, wasClean: event.wasClean });
    setSignalLog(`close:${event.code || 'unknown'} clean=${event.wasClean ? 'yes' : 'no'}`);
    socket = null;
    setStatus('disconnected');
    if (pendingSignalAction && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      reconnectAttempts += 1;
      signalingUrlIndex = (signalingUrlIndex + 1) % SIGNALING_URLS.length;
      const delayMs = 300 * reconnectAttempts;
      setMessage(`Signaling dropped (code ${event.code || 'unknown'}). Retrying ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}…`);
      setSignalLog(`retry ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}`);
      window.setTimeout(() => {
        ensureSocket();
      }, delayMs);
      return;
    }
    setMessage(`Signaling connection closed (code ${event.code || 'unknown'}). Retry create/join.`);
  });

  socket.addEventListener('error', () => {
    debugLog('socket:error');
    setSignalLog('error');
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

function simulateHost(dt) {
  state.leftY = clampPaddle(state.leftY + hostInputs.host * 350 * dt);
  state.rightY = clampPaddle(state.rightY + hostInputs.guest * 350 * dt);

  state.ballX += state.ballVX * dt;
  state.ballY += state.ballVY * dt;

  if (state.ballY < 8 || state.ballY > GAME_HEIGHT - 8) {
    state.ballVY *= -1;
    state.ballY = Math.max(8, Math.min(GAME_HEIGHT - 8, state.ballY));
  }

  const leftHit = state.ballX < 36 && Math.abs(state.ballY - state.leftY) <= PADDLE_HEIGHT / 2;
  if (leftHit && state.ballVX < 0) {
    state.ballVX *= -1.04;
    state.ballX = 36;
  }

  const rightHit = state.ballX > GAME_WIDTH - 36 && Math.abs(state.ballY - state.rightY) <= PADDLE_HEIGHT / 2;
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

  ctx.fillRect(20, renderState.leftY - PADDLE_HEIGHT / 2, 12, PADDLE_HEIGHT);
  ctx.fillRect(GAME_WIDTH - 32, renderState.rightY - PADDLE_HEIGHT / 2, 12, PADDLE_HEIGHT);

  ctx.beginPath();
  ctx.arc(renderState.ballX, renderState.ballY, 8, 0, Math.PI * 2);
  ctx.fill();

  ctx.font = 'bold 40px sans-serif';
  ctx.fillText(String(renderState.leftScore), GAME_WIDTH / 2 - 80, 48);
  ctx.fillText(String(renderState.rightScore), GAME_WIDTH / 2 + 52, 48);
}

function tick(now) {
  const dt = Math.min((now - lastSimTime) / 1000, 0.05);
  lastSimTime = now;

  const inputValue = keys.up && !keys.down ? -1 : keys.down && !keys.up ? 1 : 0;
  if (inputValue !== guestInput || (role === 'host' && inputValue !== hostInputs.host)) {
    sendInput(inputValue);
  }

  if (role === 'host' && status === 'connected') {
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
    pendingSignalAction = { type: 'create_room', roomCode: code };
    socket.send(JSON.stringify(pendingSignalAction));
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
    pendingSignalAction = { type: 'join_room', roomCode: code };
    socket.send(JSON.stringify(pendingSignalAction));
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

setStatus('disconnected');
updateControlState();
updateRoomLabel();
setSignalLog('idle');
if (DEBUG_MODE && debugPanelEl) {
  debugPanelEl.classList.remove('hidden');
  debugLog('debug-mode', 'enabled via ?debug=1');
  debugLog('signaling-candidates', SIGNALING_URLS);
}
window.addEventListener('error', (event) => {
  debugLog('window:error', event.message || 'unknown');
});
window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason instanceof Error ? event.reason.message : String(event.reason);
  debugLog('window:unhandledrejection', reason);
});
requestAnimationFrame(tick);
