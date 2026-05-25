import test from 'node:test';
import assert from 'node:assert/strict';
import { createOnlineSession, onLocalReady, onReceiveMessage, startLevelAsHost, stepOnlineSession, makePeriodicSnapshot, enqueueLocalInput, flushOutgoingInputs } from '../core/online-sync.mjs';
import { TIMING } from '../core/constants.mjs';

test('host start emits gm_level_start and creates game', () => {
  const host = createOnlineSession({ role: 'host', seed: 9, level: 2, variant: 'coop' });
  const msg = startLevelAsHost(host);
  assert.equal(msg.type, 'gm_level_start');
  assert.equal(host.status, 'playing');
  assert.ok(host.game);
});

test('guest accepts level_start and creates matching game config', () => {
  const guest = createOnlineSession({ role: 'guest' });
  const out = onReceiveMessage(guest, { type: 'gm_level_start', seed: 99, level: 3, variant: 'versus' });
  assert.equal(out.ok, true);
  assert.equal(guest.game.seed, 99);
  assert.equal(guest.game.variant, 'versus');
});

test('invalid message rejected', () => {
  const s = createOnlineSession({ role: 'guest' });
  const out = onReceiveMessage(s, { type: 'gm_level_start', seed: 1 });
  assert.equal(out.ok, false);
});

test('local ready emits gm_ready', () => {
  const s = createOnlineSession({ role: 'guest' });
  onLocalReady(s, 2);
  assert.equal(s.sentMessages.at(-1).type, 'gm_ready');
  assert.equal(s.sentMessages.at(-1).playerId, 2);
});

test('incoming gm_input queued and consumed in step', () => {
  const s = createOnlineSession({ role: 'guest' });
  onReceiveMessage(s, { type: 'gm_level_start', seed: 1, level: 1, variant: 'coop' });
  onReceiveMessage(s, { type: 'gm_input', tick: 1, playerId: 1, action: 'fire' });
  assert.equal(s.pendingInputs.length, 1);
  stepOnlineSession(s, TIMING.fixedDtMs);
  assert.equal(s.pendingInputs.length, 0);
  assert.equal(s.game.tick, 1);
});

test('snapshot detect desync from divergent guest', () => {
  const host = createOnlineSession({ role: 'host', seed: 7 });
  const guest = createOnlineSession({ role: 'guest' });
  const start = startLevelAsHost(host);
  onReceiveMessage(guest, start);
  onReceiveMessage(host, { type: 'gm_input', tick: 1, playerId: 1, action: 'fire' });
  stepOnlineSession(host, TIMING.fixedDtMs);
  const snap = makePeriodicSnapshot(host);
  const out = onReceiveMessage(guest, snap);
  assert.equal(out.ok, false);
  assert.equal(out.error, 'desync');
});

test('snapshot accepted when states are equal', () => {
  const host = createOnlineSession({ role: 'host', seed: 10 });
  const guest = createOnlineSession({ role: 'guest' });
  const start = startLevelAsHost(host);
  onReceiveMessage(guest, start);
  onReceiveMessage(host, { type: 'gm_input', tick: 1, playerId: 1, action: 'fire' });
  onReceiveMessage(guest, { type: 'gm_input', tick: 1, playerId: 1, action: 'fire' });
  stepOnlineSession(host, TIMING.fixedDtMs);
  stepOnlineSession(guest, TIMING.fixedDtMs);
  const snap = makePeriodicSnapshot(host);
  const out = onReceiveMessage(guest, snap);
  assert.equal(out.ok, true);
});

test('peer pause changes session state', () => {
  const s = createOnlineSession({ role: 'guest' });
  onReceiveMessage(s, { type: 'gm_pause', reason: 'manual' });
  assert.equal(s.status, 'paused');
});


test('peer_left pause sets disconnected status', () => {
  const s = createOnlineSession({ role: 'guest' });
  onReceiveMessage(s, { type: 'gm_pause', reason: 'peer_left' });
  assert.equal(s.status, 'disconnected');
});

test('enqueue/flush outgoing inputs batches and clears queue', () => {
  const s = createOnlineSession({ role: 'host' });
  enqueueLocalInput(s, { tick: 10, playerId: 1, action: 'fire' });
  enqueueLocalInput(s, { tick: 12, playerId: 1, action: 'dynamite' });
  const batch = flushOutgoingInputs(s);
  assert.equal(batch.length, 2);
  assert.equal(batch[0].type, 'gm_input');
  assert.equal(s.outgoingInputBuffer.length, 0);
});

test('flushOutgoingInputs returns empty when no buffered inputs', () => {
  const s = createOnlineSession({ role: 'host' });
  assert.deepEqual(flushOutgoingInputs(s), []);
});

test('stepOnlineSession no-op when not playing', () => {
  const s = createOnlineSession({ role: 'guest' });
  stepOnlineSession(s, TIMING.fixedDtMs);
  assert.equal(s.game, null);
});

test('ready handshake flags set independently', () => {
  const s = createOnlineSession({ role: 'host' });
  onLocalReady(s, 1);
  assert.equal(s.localReady, true);
  assert.equal(s.peerReady, false);
  onReceiveMessage(s, { type: 'gm_ready', playerId: 2 });
  assert.equal(s.peerReady, true);
});

test('startLevelAsHost message persisted to sentMessages', () => {
  const s = createOnlineSession({ role: 'host', seed: 5, level: 4, variant: 'coop' });
  const msg = startLevelAsHost(s);
  assert.deepEqual(s.sentMessages.at(-1), msg);
});

test('makePeriodicSnapshot returns null without game', () => {
  const s = createOnlineSession({ role: 'host' });
  assert.equal(makePeriodicSnapshot(s), null);
});

test('snapshot appended to sentMessages when available', () => {
  const s = createOnlineSession({ role: 'host', seed: 1 });
  startLevelAsHost(s);
  const snap = makePeriodicSnapshot(s);
  assert.equal(s.sentMessages.at(-1).type, 'gm_snapshot');
  assert.equal(typeof snap.checksum, 'string');
});
