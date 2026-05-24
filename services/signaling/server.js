import { createHash } from 'node:crypto';
import { createServer } from 'node:http';

const port = Number(process.env.PORT || 8787);
const rooms = new Map();
let nextClientId = 1;

function log(event, details = {}) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${event} ${JSON.stringify(details)}`);
}

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

function parseFrames(buffer) {
  const frames = [];
  let offset = 0;

  while (offset + 2 <= buffer.length) {
    const first = buffer[offset];
    const opcode = first & 0x0f;
    const second = buffer[offset + 1];
    const masked = Boolean(second & 0x80);
    let payloadLen = second & 0x7f;
    let cursor = offset + 2;

    if (payloadLen === 126) {
      if (cursor + 2 > buffer.length) break;
      payloadLen = buffer.readUInt16BE(cursor);
      cursor += 2;
    } else if (payloadLen === 127) {
      if (cursor + 8 > buffer.length) break;
      payloadLen = Number(buffer.readBigUInt64BE(cursor));
      cursor += 8;
    }

    const maskLen = masked ? 4 : 0;
    const frameLen = (cursor - offset) + maskLen + payloadLen;
    if (offset + frameLen > buffer.length) break;

    if (opcode === 0x8) {
      frames.push({ close: true });
      offset += frameLen;
      continue;
    }

    if (opcode === 0x9) {
      frames.push({ ping: true });
      offset += frameLen;
      continue;
    }

    let payloadStart = cursor;
    let payload = buffer.subarray(payloadStart, payloadStart + payloadLen);

    if (masked) {
      const mask = buffer.subarray(cursor, cursor + 4);
      payloadStart += 4;
      payload = Buffer.from(buffer.subarray(payloadStart, payloadStart + payloadLen));
      for (let i = 0; i < payload.length; i += 1) {
        payload[i] ^= mask[i % 4];
      }
    }

    if (opcode === 0x1) {
      frames.push({ text: payload.toString('utf8') });
    }

    offset += frameLen;
  }

  return { frames, remaining: buffer.subarray(offset) };
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
  if (peer) {
    log('relay', { fromClientId: client.clientId, toClientId: peer.clientId, type: payload.type, roomCode: client.roomCode });
    send(peer, payload);
  }
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
    log('room_created', { roomCode: code, hostClientId: client.clientId });
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
    log('room_joined', { roomCode: code, hostClientId: room.host.clientId, guestClientId: client.clientId });
    return;
  }

  if (message.type === 'offer' || message.type === 'answer' || message.type === 'ice_candidate') {
    relayToPeer(client, message);
    return;
  }

  if (message.type === 'leave') {
    log('leave_requested', { clientId: client.clientId, role: client.role, roomCode: client.roomCode });
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
  socket.frameBuffer = Buffer.alloc(0);
  socket.clientId = nextClientId;
  nextClientId += 1;
  log('socket_connected', { clientId: socket.clientId, remoteAddress: socket.remoteAddress });

  socket.on('data', (chunk) => {
    try {
      socket.frameBuffer = Buffer.concat([socket.frameBuffer, chunk]);
      const { frames, remaining } = parseFrames(socket.frameBuffer);
      socket.frameBuffer = remaining;

      for (const frame of frames) {
        if (frame.close) {
          log('socket_close_frame', { clientId: socket.clientId, roomCode: socket.roomCode, role: socket.role });
          leave(socket);
          socket.end();
          return;
        }

        if (frame.ping) {
          socket.write(Buffer.from([0x8a, 0x00]));
          continue;
        }

        if (frame.text) {
          onMessage(socket, frame.text);
        }
      }
    } catch {
      log('socket_parse_error', { clientId: socket.clientId, roomCode: socket.roomCode, role: socket.role });
      leave(socket);
      socket.destroy();
    }
  });

  socket.on('close', () => {
    log('socket_closed', { clientId: socket.clientId, roomCode: socket.roomCode, role: socket.role });
    leave(socket);
  });
  socket.on('end', () => {
    log('socket_end', { clientId: socket.clientId, roomCode: socket.roomCode, role: socket.role });
    leave(socket);
  });
  socket.on('error', (error) => {
    log('socket_error', { clientId: socket.clientId, roomCode: socket.roomCode, role: socket.role, message: error.message });
    leave(socket);
  });
});

server.listen(port, '0.0.0.0', () => {
  log('server_listening', { url: `ws://0.0.0.0:${port}` });
});
