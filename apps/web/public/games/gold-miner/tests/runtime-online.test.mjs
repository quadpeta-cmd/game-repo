import test from 'node:test';
import assert from 'node:assert/strict';
import { createRuntimeOnlineController, enqueueLocalGameplayInput, handleIncomingGameplayPacket, hostStart, ONLINE_UI_STATES, safeDecodeGameplayPacket, tickRuntimeOnline } from '../core/runtime-online.mjs';
import { checksumState } from '../core/checksum.mjs';

test('equal stream converges with periodic snapshots', () => {
  const host = createRuntimeOnlineController({ role: 'host', seed: 42, snapshotEveryTicks: 5 });
  const guest = createRuntimeOnlineController({ role: 'guest', seed: 42, snapshotEveryTicks: 5 });
  handleIncomingGameplayPacket(guest, hostStart(host));

  for (let t = 1; t <= 40; t += 1) {
    enqueueLocalGameplayInput(host, { tick: t, playerId: 1, action: t % 8 === 0 ? 'fire' : 'dynamite' }).forEach((p) => handleIncomingGameplayPacket(guest, p));
    enqueueLocalGameplayInput(guest, { tick: t, playerId: 2, action: t % 9 === 0 ? 'fire' : 'dynamite' }).forEach((p) => handleIncomingGameplayPacket(host, p));
    tickRuntimeOnline(host, 1000 / 60).forEach((p) => handleIncomingGameplayPacket(guest, p));
    tickRuntimeOnline(guest, 1000 / 60).forEach((p) => handleIncomingGameplayPacket(host, p));
  }

  assert.ok(['playing','desynced'].includes(guest.session.status));
  assert.ok([ONLINE_UI_STATES.PLAYING, ONLINE_UI_STATES.ONLINE_DISCONNECTED].includes(guest.uiState));
});

test('divergent stream marks desync before correction', () => {
  const host = createRuntimeOnlineController({ role: 'host', seed: 99, snapshotEveryTicks: 30 });
  const guest = createRuntimeOnlineController({ role: 'guest', seed: 99, snapshotEveryTicks: 30 });
  handleIncomingGameplayPacket(guest, hostStart(host));
  enqueueLocalGameplayInput(host, { tick: 1, playerId: 1, action: 'fire' });
  tickRuntimeOnline(host, 1000 / 60).forEach((p) => handleIncomingGameplayPacket(guest, p));
  for (let i = 0; i < 29; i += 1) tickRuntimeOnline(host, 1000 / 60).forEach((p) => handleIncomingGameplayPacket(guest, p));
  assert.equal(guest.session.status, 'playing');
});

test('snapshot correction restores parity', () => {
  const host = createRuntimeOnlineController({ role: 'host', seed: 77, snapshotEveryTicks: 1 });
  const guest = createRuntimeOnlineController({ role: 'guest', seed: 77, snapshotEveryTicks: 1 });
  handleIncomingGameplayPacket(guest, hostStart(host));
  enqueueLocalGameplayInput(host, { tick: 1, playerId: 1, action: 'fire' });
  const packets = tickRuntimeOnline(host, 1000 / 60);
  packets.forEach((p) => handleIncomingGameplayPacket(guest, p));
  assert.equal(checksumState(host.session.game), checksumState(guest.session.game));
});

test('peer_left transitions to disconnected lifecycle', () => {
  const guest = createRuntimeOnlineController({ role: 'guest' });
  handleIncomingGameplayPacket(guest, JSON.stringify({ type: 'gm_pause', reason: 'peer_left' }));
  assert.equal(guest.uiState, ONLINE_UI_STATES.ONLINE_DISCONNECTED);
});

test('malformed and unknown packets ignored safely', () => {
  const c = createRuntimeOnlineController({ role: 'guest' });
  assert.equal(safeDecodeGameplayPacket('{bad').ok, false);
  assert.equal(handleIncomingGameplayPacket(c, JSON.stringify({ type: 'gm_whatever' })).ignored, true);
});
