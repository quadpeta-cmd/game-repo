import { createHash } from 'node:crypto';
import { createServer } from 'node:http';

const port = Number(process.env.PORT || 8787);
const rooms = new Map();

function wsAcceptKey(key) {
  return createHash('sha1')
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest('base64');
}

function encodeFrame(payload) {
  const data = Buffer.from(payload);
  const len = data.length;

  if (len < 126) {
    return Buffer.concat([Buffer.from([0x81, len]), data]);
  }

  if (len < 65536) {
    const header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
    return Buffer.concat([header, data]);
  }

  const header = Buffer.alloc(10);
  header[0] = 0x81;
  header[1] = 127;
  header.writeBigUInt64BE(BigInt(len), 2);
  return Buffer.concat([header, data]);
}

function decodeFrame(buffer) {
  const first = buffer[0];
  const opcode = first & 0x0f;
  if (opcode === 0x8) {
    return { close: true };
  }

  const second = buffer[1];
  const masked = Boolean(second & 0x80);
  let offset = 2;
  let length = second & 0x7f;

  if (length === 126) {
    length = buffer.readUInt16BE(offset);
    offset += 2;
  } else if (length === 127) {
    length = Number(buffer.readBigUInt64BE(offset));
    offset += 8;
  }

  let payload = buffer.subarray(offset);
  if (masked) {
    const mask = payload.subarray(0, 4);
    payload = payload.subarray(4, 4 + length);
    for (let i = 0; i < payload.length; i += 1) {
      payload[i] ^= mask[i % 4];
    }
  } else {
    payload = payload.subarray(0, length);
  }

  return { text: payload.toString('utf8') };
}

function send(client, payload) {
  if (!client.destroyed) {
    client.write(encodeFrame(JSON.stringify(payload)));
  }
}

function cleanupRoom(code) {
  const room = rooms.get(code);
  if (room && !room.host && !room.guest) {
    rooms.delete(code);
  }
}

function relayToPeer(client, payload) {
  if (!client.roomCode) return;
  const room = rooms.get(client.roomCode);
  if (!room) return;

  const peer = client.role === 'host' ? room.guest : room.host;
  if (peer) send(peer, payload);
}

function leave(client) {
  if (!client.roomCode) return;
  const room = rooms.get(client.roomCode);
  if (!room) return;

  if (client.role === 'host') {
    room.host = null;
    if (room.guest) {
      send(room.guest, { type: 'peer_left' });
      room.guest.roomCode = null;
      room.guest.role = null;
      room.guest = null;
    }
  } else if (client.role === 'guest') {
    room.guest = null;
    if (room.host) send(room.host, { type: 'peer_left' });
  }

  const code = client.roomCode;
  client.roomCode = null;
  client.role = null;
  cleanupRoom(code);
}

function onMessage(client, text) {
  let message;
  try {
    message = JSON.parse(text);
  } catch {
    send(client, { type: 'error', message: 'Invalid JSON payload' });
    return;
  }

  if (message.type === 'create_room') {
    const code = String(message.roomCode || '').trim().toUpperCase();
    if (!code) {
      send(client, { type: 'error', message: 'Missing room code' });
      return;
    }
    const room = rooms.get(code) || { host: null, guest: null };
    if (room.host) {
      send(client, { type: 'error', message: 'Room already exists' });
      return;
    }
    rooms.set(code, room);
    room.host = client;
    client.roomCode = code;
    client.role = 'host';
    send(client, { type: 'room_created', roomCode: code });
    return;
  }

  if (message.type === 'join_room') {
    const code = String(message.roomCode || '').trim().toUpperCase();
    const room = rooms.get(code);
    if (!room || !room.host) {
      send(client, { type: 'error', message: 'Room not found' });
      return;
    }
    if (room.guest) {
      send(client, { type: 'error', message: 'Room already full' });
      return;
    }
    room.guest = client;
    client.roomCode = code;
    client.role = 'guest';
    send(client, { type: 'room_joined', roomCode: code });
    send(room.host, { type: 'peer_joined', roomCode: code });
    return;
  }

  if (message.type === 'offer' || message.type === 'answer' || message.type === 'ice_candidate') {
    relayToPeer(client, message);
    return;
  }

  if (message.type === 'leave') {
    leave(client);
    return;
  }

  send(client, { type: 'error', message: `Unsupported message type: ${String(message.type)}` });
}

const server = createServer();

server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  if (!key || req.headers.upgrade?.toLowerCase() !== 'websocket') {
    socket.destroy();
    return;
  }

  const accept = wsAcceptKey(key);
  socket.write(
    [
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${accept}`,
      '\r\n',
    ].join('\r\n'),
  );

  socket.roomCode = null;
  socket.role = null;

  socket.on('data', (chunk) => {
    const frame = decodeFrame(chunk);
    if (frame.close) {
      leave(socket);
      socket.end();
      return;
    }

    if (frame.text) {
      onMessage(socket, frame.text);
    }
  });

  socket.on('close', () => leave(socket));
  socket.on('end', () => leave(socket));
  socket.on('error', () => leave(socket));
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Signaling server listening on ws://0.0.0.0:${port}`);
});
