function resolveSignalingUrl() {
  const params = new URLSearchParams(window.location.search);
  const override = params.get('signaling');

  if (override) {
    return override;
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

  const fromUrl = (rawUrl) => {
    try {
      const base = new URL(rawUrl);
      if (!base.hostname) {
        return null;
      }
      base.protocol = protocol;
      base.port = '8787';
      base.pathname = '';
      base.search = '';
      base.hash = '';
      return base.toString().replace(/\/$/, '');
    } catch {
      return null;
    }
  };

  const fromLocation = fromUrl(window.location.href);
  if (fromLocation) {
    return fromLocation;
  }

  const fromBaseUri = fromUrl(document.baseURI);
  if (fromBaseUri) {
    return fromBaseUri;
  }

  return `${protocol}//localhost:8787`;
}

const SIGNALING_URL = resolveSignalingUrl();
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
}

function setMessage(text) {
  messageEl.textContent = text;
}

function setRole(nextRole) {
  role = nextRole;
  roleEl.textContent = role ? `(${role})` : '-';
}

function updateRoomLabel() {
  const displayCode = roomCode || pendingRoomCode;
  roomLabelEl.textContent = displayCode || '-';
  copyCodeBtn.disabled = !displayCode;
}

function updateControlState() {
  const active = Boolean(roomCode || pendingRoomCode);
  leaveRoomBtn.disabled = !active;
  createRoomBtn.disabled = active;
  joinRoomBtn.disabled = active;
  roomCodeInput.disabled = active;
}

function randomCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
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
  } catch (error) {
    setStatus('disconnected');
    setMessage(error instanceof Error ? `Invalid signaling URL: ${SIGNALING_URL}` : 'Invalid signaling URL.');
    socket = null;
    return;
  }

  socket.addEventListener('open', () => {
    if (status === 'connecting') {
      setMessage('Connected to signaling. Finishing handshake…');
    }
  });

  socket.addEventListener('message', async (event) => {
    const message = JSON.parse(event.data);

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
      setMessage(`Error: ${message.message}`);
      setStatus('disconnected');
    }
  });

  socket.addEventListener('close', () => {
    socket = null;
    setStatus('disconnected');
    setMessage('Signaling connection closed. Retry create/join.');
  });

  socket.addEventListener('error', () => {
    setMessage('Signaling error. Check server and retry.');
  });
}

function waitForSocketOpen(timeoutMs = 5000) {
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
      clearTimeout(timeoutId);
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

    const timeoutId = window.setTimeout(() => {
      finish(() => reject(new Error('Timed out connecting to signaling')));
    }, timeoutMs);

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

  pc.onicecandidate = (event) => {
    if (event.candidate && socket && socket.readyState === WebSocket.OPEN && roomCode) {
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
    setStatus('connected');
  };

  channel.onclose = () => {
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
  ensureSocket();
  setStatus('waiting');
  setMessage('Creating room…');

  const code = randomCode();
  pendingRoomCode = code;
  updateRoomLabel();
  updateControlState();

  try {
    await waitForSocketOpen();
    socket.send(JSON.stringify({ type: 'create_room', roomCode: code }));
  } catch (error) {
    setStatus('disconnected');
    setMessage(error instanceof Error ? `${error.message}. Room code generated locally but not registered yet.` : 'Unable to connect to signaling. Room code generated locally but not registered yet.');
  }
});

joinRoomBtn.addEventListener('click', async () => {
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
    setMessage('Clipboard unavailable. Copy the room code manually.');
  }
});

setStatus('disconnected');
updateControlState();
updateRoomLabel();
requestAnimationFrame(tick);
