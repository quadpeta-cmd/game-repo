import { createGame, stepGame } from './simulation.mjs';
import { validateMessage, makeSnapshot, compareChecksums } from './net-protocol.mjs';

export function createOnlineSession({ role, seed = 123456, level = 1, variant = 'coop' }) {
  return {
    role,
    status: 'waiting',
    peerReady: false,
    localReady: false,
    seed,
    level,
    variant,
    game: null,
    pendingInputs: [],
    outgoingInputBuffer: [],
    sentMessages: []
  };
}

export function onLocalReady(session, playerId = 1) {
  session.localReady = true;
  session.sentMessages.push({ type: 'gm_ready', playerId });
}

export function onReceiveMessage(session, message) {
  const valid = validateMessage(message);
  if (!valid.ok) return { ok: false, error: valid.error };

  if (message.type === 'gm_ready') {
    session.peerReady = true;
    return { ok: true };
  }

  if (message.type === 'gm_level_start') {
    session.seed = message.seed;
    session.level = message.level;
    session.variant = message.variant;
    session.game = createGame({ mode: 'online-two-player', variant: session.variant, seed: session.seed, level: session.level, playerCount: 2 });
    session.status = 'playing';
    return { ok: true };
  }

  if (message.type === 'gm_input') {
    session.pendingInputs.push(message);
    return { ok: true };
  }

  if (message.type === 'gm_pause') {
    session.status = message.reason === 'peer_left' ? 'disconnected' : 'paused';
    return { ok: true };
  }

  if (message.type === 'gm_snapshot' && session.game) {
    const cmp = compareChecksums(session.game, message.checksum);
    if (!cmp.ok) {
      session.status = 'desynced';
      return { ok: false, error: 'desync', localChecksum: cmp.localChecksum, remoteChecksum: cmp.remoteChecksum };
    }
    return { ok: true };
  }

  return { ok: true };
}

export function startLevelAsHost(session) {
  const msg = { type: 'gm_level_start', seed: session.seed, level: session.level, variant: session.variant };
  session.game = createGame({ mode: 'online-two-player', variant: session.variant, seed: session.seed, level: session.level, playerCount: 2 });
  session.status = 'playing';
  session.sentMessages.push(msg);
  return msg;
}

export function stepOnlineSession(session, fixedDtMs) {
  if (!session.game || session.status !== 'playing') return;
  const inputs = session.pendingInputs.splice(0, session.pendingInputs.length);
  stepGame(session.game, inputs, fixedDtMs);
}

export function makePeriodicSnapshot(session) {
  if (!session.game) return null;
  const snap = makeSnapshot(session.game);
  session.sentMessages.push(snap);
  return snap;
}


export function enqueueLocalInput(session, input) {
  session.outgoingInputBuffer.push({ type: 'gm_input', ...input });
}

export function flushOutgoingInputs(session) {
  if (session.outgoingInputBuffer.length === 0) return [];
  const batch = session.outgoingInputBuffer.splice(0, session.outgoingInputBuffer.length);
  session.sentMessages.push(...batch);
  return batch;
}
