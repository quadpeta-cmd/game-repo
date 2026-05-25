import { checksumState } from './checksum.mjs';
import { deserializeState, serializeState } from './simulation.mjs';

export const PROTOCOL_VERSION = 1;

const REQUIRED = {
  gm_hello: ['type', 'version'],
  gm_ready: ['type', 'playerId'],
  gm_level_start: ['type', 'seed', 'level', 'variant'],
  gm_input: ['type', 'tick', 'playerId', 'action'],
  gm_snapshot: ['type', 'tick', 'checksum', 'compactState'],
  gm_desync: ['type', 'localChecksum', 'remoteChecksum', 'tick'],
  gm_pause: ['type', 'reason']
};

export function encodeMessage(message) { return JSON.stringify(message); }
export function decodeMessage(raw) { return JSON.parse(raw); }

export function validateMessage(message) {
  if (!message || typeof message !== 'object' || typeof message.type !== 'string') return { ok: false, error: 'invalid_message' };
  const req = REQUIRED[message.type];
  if (!req) return { ok: false, error: 'unknown_type' };
  for (const key of req) if (!(key in message)) return { ok: false, error: `missing_${key}` };
  if (message.type === 'gm_hello' && message.version !== PROTOCOL_VERSION) return { ok: false, error: 'unsupported_version' };
  return { ok: true };
}

export function makeSnapshot(state) {
  return {
    type: 'gm_snapshot',
    tick: state.tick,
    checksum: checksumState(state),
    compactState: serializeState(state)
  };
}

export function applySnapshot(localState, snapshot) {
  if (!snapshot?.compactState) return { applied: false, reason: 'missing_state' };
  const restored = deserializeState(snapshot.compactState);
  return { applied: true, state: restored };
}

export function compareChecksums(localState, remoteChecksum) {
  const localChecksum = checksumState(localState);
  return { ok: localChecksum === remoteChecksum, localChecksum, remoteChecksum };
}

export function queueInputsByTick(frames = []) {
  const byTick = new Map();
  for (const f of frames) {
    if (!byTick.has(f.tick)) byTick.set(f.tick, []);
    byTick.get(f.tick).push(f);
  }
  return byTick;
}
