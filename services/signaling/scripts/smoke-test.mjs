import { spawn } from 'node:child_process';

const PORT = 8791;
const WS_URL = `ws://127.0.0.1:${PORT}`;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function onceOpen(ws) {
  return new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', () => reject(new Error('socket error before open')), { once: true });
  });
}

function onceMessage(ws, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => reject(new Error('timed out waiting for message')), timeoutMs);
    ws.addEventListener(
      'message',
      (event) => {
        clearTimeout(timeoutId);
        resolve(JSON.parse(event.data));
      },
      { once: true },
    );
  });
}

async function run() {
  const server = spawn('node', ['server.js'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const serverLogs = [];
  server.stdout.on('data', (chunk) => serverLogs.push(chunk.toString('utf8')));
  server.stderr.on('data', (chunk) => serverLogs.push(chunk.toString('utf8')));

  try {
    await wait(300);

    const host = new WebSocket(WS_URL);
    const guest = new WebSocket(WS_URL);
    await Promise.all([onceOpen(host), onceOpen(guest)]);

    host.send(JSON.stringify({ type: 'create_room', roomCode: 'ROOM01' }));
    const hostCreated = await onceMessage(host);
    if (hostCreated.type !== 'room_created') throw new Error(`expected room_created, got ${hostCreated.type}`);

    guest.send(JSON.stringify({ type: 'join_room', roomCode: 'ROOM01' }));
    const guestJoined = await onceMessage(guest);
    if (guestJoined.type !== 'room_joined') throw new Error(`expected room_joined, got ${guestJoined.type}`);
    const hostPeerJoined = await onceMessage(host);
    if (hostPeerJoined.type !== 'peer_joined') throw new Error(`expected peer_joined, got ${hostPeerJoined.type}`);

    const offer = { type: 'offer', roomCode: 'ROOM01', offer: { sdp: 'fake-sdp', type: 'offer' } };
    host.send(JSON.stringify(offer));
    const guestRelayed = await onceMessage(guest);
    if (guestRelayed.type !== 'offer') throw new Error(`expected relayed offer, got ${guestRelayed.type}`);

    guest.close();
    const hostPeerLeft = await onceMessage(host);
    if (hostPeerLeft.type !== 'peer_left') throw new Error(`expected peer_left, got ${hostPeerLeft.type}`);

    host.close();
    console.log('PASS signaling smoke test');
  } finally {
    server.kill('SIGTERM');
    await wait(150);
    if (serverLogs.length > 0) {
      console.log('--- signaling logs ---');
      process.stdout.write(serverLogs.join(''));
    }
  }
}

run().catch((error) => {
  console.error('FAIL signaling smoke test:', error.message);
  process.exitCode = 1;
});
