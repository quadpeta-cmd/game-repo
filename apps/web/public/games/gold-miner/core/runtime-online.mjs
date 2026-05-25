import { applySnapshot, compareChecksums, decodeMessage, encodeMessage, makeSnapshot, validateMessage } from './net-protocol.mjs';
import { createOnlineSession, enqueueLocalInput, flushOutgoingInputs, onReceiveMessage, startLevelAsHost, stepOnlineSession } from './online-sync.mjs';

export const ONLINE_UI_STATES = {
  ONLINE_WAITING: 'ONLINE_WAITING',
  PLAYING: 'PLAYING',
  ONLINE_DISCONNECTED: 'ONLINE_DISCONNECTED'
};

export function safeDecodeGameplayPacket(raw) {
  try {
    const decoded = decodeMessage(raw);
    const validation = validateMessage(decoded);
    if (!validation.ok) return { ok: false, error: validation.error };
    return { ok: true, message: decoded };
  } catch {
    return { ok: false, error: 'decode_failed' };
  }
}

export function createRuntimeOnlineController({ role, seed = 123456, snapshotEveryTicks = 30 }) {
  const session = createOnlineSession({ role, seed, variant: 'coop' });
  return {
    role,
    session,
    snapshotEveryTicks,
    uiState: ONLINE_UI_STATES.ONLINE_WAITING,
    lastError: null,
  };
}

export function hostStart(controller) {
  const msg = startLevelAsHost(controller.session);
  controller.uiState = ONLINE_UI_STATES.PLAYING;
  return encodeMessage(msg);
}

export function enqueueLocalGameplayInput(controller, input) {
  enqueueLocalInput(controller.session, input);
  return flushOutgoingInputs(controller.session).map((m) => encodeMessage(m));
}

export function handleIncomingGameplayPacket(controller, raw) {
  const parsed = safeDecodeGameplayPacket(raw);
  if (!parsed.ok) return { ok: false, ignored: true, reason: parsed.error };

  const out = onReceiveMessage(controller.session, parsed.message);
  if (!out.ok && out.error === 'desync' && parsed.message.type === 'gm_snapshot') {
    const corrected = applySnapshot(controller.session.game, parsed.message);
    if (corrected.applied) {
      controller.session.game = corrected.state;
      controller.session.status = 'playing';
      controller.uiState = ONLINE_UI_STATES.PLAYING;
      return { ok: true, corrected: true };
    }
    controller.uiState = ONLINE_UI_STATES.ONLINE_DISCONNECTED;
    return { ok: false, desynced: true };
  }

  if (parsed.message.type === 'gm_level_start') controller.uiState = ONLINE_UI_STATES.PLAYING;
  if (parsed.message.type === 'gm_pause' && parsed.message.reason === 'peer_left') controller.uiState = ONLINE_UI_STATES.ONLINE_DISCONNECTED;
  return { ok: out.ok, ignored: false, out };
}

export function tickRuntimeOnline(controller, fixedDtMs) {
  stepOnlineSession(controller.session, fixedDtMs);
  const outbound = flushOutgoingInputs(controller.session).map((m) => encodeMessage(m));
  const extras = [];
  if (controller.role === 'host' && controller.session.game && controller.session.game.tick > 0 && controller.session.game.tick % controller.snapshotEveryTicks === 0) {
    extras.push(encodeMessage(makeSnapshot(controller.session.game)));
  }
  return [...outbound, ...extras];
}

export function checksumsMatch(localState, remoteChecksum) {
  return compareChecksums(localState, remoteChecksum).ok;
}
