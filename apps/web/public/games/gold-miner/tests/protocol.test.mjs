import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, stepGame, checksumState } from '../core/simulation.mjs';
import { PROTOCOL_VERSION, encodeMessage, decodeMessage, validateMessage, makeSnapshot, applySnapshot, compareChecksums, queueInputsByTick } from '../core/net-protocol.mjs';
import { runReplay } from '../core/replay.mjs';

test('protocol version is 1', () => assert.equal(PROTOCOL_VERSION, 1));

test('encode/decode message roundtrip', () => {
  const msg = { type: 'gm_hello', version: 1 };
  assert.deepEqual(decodeMessage(encodeMessage(msg)), msg);
});

test('validate accepts gm_hello', () => assert.equal(validateMessage({ type: 'gm_hello', version: 1 }).ok, true));
test('validate rejects unknown type', () => assert.equal(validateMessage({ type: 'nope' }).ok, false));
test('validate rejects wrong protocol version', () => assert.equal(validateMessage({ type: 'gm_hello', version: 9 }).ok, false));
test('validate gm_ready required fields', () => assert.equal(validateMessage({ type: 'gm_ready', playerId: 1 }).ok, true));
test('validate gm_level_start required fields', () => assert.equal(validateMessage({ type: 'gm_level_start', seed: 1, level: 1, variant: 'coop' }).ok, true));
test('validate gm_input required fields', () => assert.equal(validateMessage({ type: 'gm_input', tick: 1, playerId: 1, action: 'fire' }).ok, true));
test('validate gm_snapshot required fields', () => assert.equal(validateMessage({ type: 'gm_snapshot', tick: 1, checksum: 'abc', compactState: '{}' }).ok, true));
test('validate gm_desync required fields', () => assert.equal(validateMessage({ type: 'gm_desync', localChecksum: 'a', remoteChecksum: 'b', tick: 1 }).ok, true));
test('validate gm_pause required fields', () => assert.equal(validateMessage({ type: 'gm_pause', reason: 'peer_left' }).ok, true));

test('snapshot includes checksum and compact state', () => {
  const s = createGame({ seed: 3 });
  const snap = makeSnapshot(s);
  assert.equal(snap.type, 'gm_snapshot');
  assert.equal(typeof snap.checksum, 'string');
  assert.equal(typeof snap.compactState, 'string');
});

test('applySnapshot restores serialized state', () => {
  const s = createGame({ seed: 11 });
  stepGame(s, [{ tick: 1, playerId: 1, action: 'fire' }]);
  const snap = makeSnapshot(s);
  const out = applySnapshot(createGame({ seed: 99 }), snap);
  assert.equal(out.applied, true);
  assert.equal(checksumState(out.state), snap.checksum);
});

test('applySnapshot fails when compact state missing', () => {
  const out = applySnapshot(createGame(), { type: 'gm_snapshot' });
  assert.equal(out.applied, false);
});

test('compareChecksums ok on identical states', () => {
  const s = createGame({ seed: 2 });
  const c = checksumState(s);
  assert.equal(compareChecksums(s, c).ok, true);
});

test('compareChecksums fails on divergent states', () => {
  const a = createGame({ seed: 2 });
  const b = createGame({ seed: 2 });
  stepGame(b, [{ tick: 1, playerId: 1, action: 'fire' }]);
  assert.equal(compareChecksums(a, checksumState(b)).ok, false);
});

test('queueInputsByTick groups multiple events', () => {
  const map = queueInputsByTick([{ tick: 10, playerId: 1, action: 'fire' }, { tick: 10, playerId: 2, action: 'fire' }, { tick: 12, playerId: 1, action: 'dynamite' }]);
  assert.equal(map.get(10).length, 2);
  assert.equal(map.get(12).length, 1);
});

test('deterministic replay remains equal for same input stream', () => {
  const frames = [{ tick: 6, playerId: 1, action: 'fire' }, { tick: 19, playerId: 1, action: 'dynamite' }];
  const a = runReplay({ seed: 55, frames, maxTicks: 300 });
  const b = runReplay({ seed: 55, frames, maxTicks: 300 });
  assert.equal(a.checksum, b.checksum);
});

test('deterministic replay diverges for different input stream', () => {
  const a = runReplay({ seed: 55, mode: 'local-two-player', variant: 'coop', frames: [{ tick: 6, playerId: 1, action: 'fire' }], maxTicks: 120 });
  const b = runReplay({ seed: 55, mode: 'local-two-player', variant: 'coop', frames: [{ tick: 6, playerId: 2, action: 'fire' }], maxTicks: 120 });
  assert.notEqual(a.checksum, b.checksum);
});

test('snapshot correction aligns divergent state', () => {
  const host = createGame({ seed: 77 });
  const guest = createGame({ seed: 77 });
  stepGame(host, [{ tick: 1, playerId: 1, action: 'fire' }]);
  const snap = makeSnapshot(host);
  const before = compareChecksums(guest, snap.checksum).ok;
  const corrected = applySnapshot(guest, snap);
  const after = compareChecksums(corrected.state, snap.checksum).ok;
  assert.equal(before, false);
  assert.equal(after, true);
});
