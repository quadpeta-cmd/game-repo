import test from 'node:test';
import assert from 'node:assert/strict';
import { runTwoClientTranscript } from '../core/online-transcript.mjs';
import { checksumState } from '../core/checksum.mjs';

test('transcript runs host/guest with deterministic outcomes', () => {
  const out = runTwoClientTranscript({ seed: 1, hostFrames: [{ tick: 10, action: 'fire' }], guestFrames: [{ tick: 16, action: 'fire' }], ticks: 90, snapshotEveryTicks: 30 });
  assert.equal(typeof checksumState(out.host.game), 'string');
  assert.equal(typeof checksumState(out.guest.game), 'string');
  assert.ok(['playing', 'desynced'].includes(out.guest.status));
});

test('transcript detects divergence without frequent snapshots', () => {
  const out = runTwoClientTranscript({ seed: 2, hostFrames: [{ tick: 5, action: 'fire' }], guestFrames: [{ tick: 55, action: 'dynamite' }], ticks: 59, snapshotEveryTicks: 0 });
  assert.notEqual(checksumState(out.host.game), checksumState(out.guest.game));
});

test('transcript with snapshots emits snapshot messages', () => {
  const out = runTwoClientTranscript({ seed: 3, hostFrames: [{ tick: 5, action: 'fire' }], guestFrames: [{ tick: 55, action: 'dynamite' }], ticks: 120, snapshotEveryTicks: 30 });
  assert.ok(out.host.sentMessages.some((m) => m.type === 'gm_snapshot'));
});

test('peer pause path reaches playing initially', () => {
  const out = runTwoClientTranscript({ seed: 4, ticks: 10 });
  assert.equal(out.guest.status, 'playing');
});
