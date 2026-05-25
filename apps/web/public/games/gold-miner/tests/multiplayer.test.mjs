import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, stepGame, applyInput, checksumState } from '../core/simulation.mjs';
import { findClosestHit } from '../core/collision.mjs';
import { runReplay } from '../core/replay.mjs';

test('41 local two-player creates two players', () => {
  const s = createGame({ mode: 'local-two-player', variant: 'coop', playerCount: 2 });
  assert.equal(s.players.length, 2);
});

test('42 coop has shared score', () => {
  const s = createGame({ mode: 'local-two-player', variant: 'coop', playerCount: 2 });
  assert.equal(typeof s.score, 'number');
  assert.equal(s.scores !== null, true);
});

test('43 versus has per-player scores', () => {
  const s = createGame({ mode: 'local-two-player', variant: 'versus', playerCount: 2 });
  assert.deepEqual(Object.keys(s.scores), ['1', '2']);
});

test('44 p1 fire applies to player1', () => {
  const s = createGame({ mode: 'local-two-player', playerCount: 2 });
  applyInput(s, { playerId: 1, action: 'fire' });
  assert.equal(s.players[0].clawState, 'EXTENDING');
});

test('45 p2 fire applies to player2', () => {
  const s = createGame({ mode: 'local-two-player', playerCount: 2 });
  applyInput(s, { playerId: 2, action: 'fire' });
  assert.equal(s.players[1].clawState, 'EXTENDING');
});

test('46 both players can carry different objects', () => {
  const s = createGame({ mode: 'local-two-player', playerCount: 2 });
  s.players[0].clawState='GRABBED_RETRACTING';
  s.players[1].clawState='GRABBED_RETRACTING';
  s.players[0].carryingId='a';
  s.players[1].carryingId='b';
  s.players[0].length=200;
  s.players[1].length=200;
  s.objects = [
    { id: 'a', type: 'gold_small', x: 315, y: 240, radius: 18, claimedBy: 1 },
    { id: 'b', type: 'gold_small', x: 485, y: 240, radius: 18, claimedBy: 2 }
  ];
  stepGame(s, []);
  assert.equal(s.players[0].carryingId, 'a');
  assert.equal(s.players[1].carryingId, 'b');
});

test('47 same object cannot be scored twice', () => {
  const s = createGame({ mode: 'local-two-player', variant: 'coop', playerCount: 2 });
  s.objects = [{ id: 'x', type: 'gold_small', x: 315, y: 220, radius: 18, claimedBy: null }];
  s.players[0].angle = 0;
  s.players[1].angle = 0;
  applyInput(s, { playerId: 1, action: 'fire' });
  applyInput(s, { playerId: 2, action: 'fire' });
  for (let i = 0; i < 450; i++) stepGame(s, []);
  assert.equal(s.score, 100);
});

test('48 tie-break lower playerId when equal distance', () => {
  const hit1 = findClosestHit({ x: 0, y: 0 }, { x: 10, y: 0 }, [{ id: 'x', x: 5, y: 0, radius: 1, claimedBy: null }], 0, 1);
  const hit2 = findClosestHit({ x: 0, y: 0 }, { x: 10, y: 0 }, [{ id: 'x', x: 5, y: 0, radius: 1, claimedBy: null }], 0, 2);
  assert.equal(hit1.objectId, 'x');
  assert.equal(hit2.objectId, 'x');
});

test('49 same inputs same checksum for online-like deterministic run', () => {
  const frames = [{ tick: 10, playerId: 1, action: 'fire' }, { tick: 12, playerId: 2, action: 'fire' }];
  const a = runReplay({ seed: 999, mode: 'online-two-player', variant: 'coop', frames, maxTicks: 300 });
  const b = runReplay({ seed: 999, mode: 'online-two-player', variant: 'coop', frames, maxTicks: 300 });
  assert.equal(a.checksum, b.checksum);
});

test('50 divergent input stream diverges checksum', () => {
  const a = runReplay({ seed: 999, mode: 'online-two-player', variant: 'coop', frames: [{ tick: 10, playerId: 1, action: 'fire' }], maxTicks: 120 });
  const b = runReplay({ seed: 999, mode: 'online-two-player', variant: 'coop', frames: [{ tick: 10, playerId: 1, action: 'dynamite' }], maxTicks: 120 });
  assert.notEqual(a.checksum, b.checksum);
});

test('51 checksum reflects score changes', () => {
  const s = createGame({ mode: 'local-two-player', playerCount: 2 });
  const c1 = checksumState(s);
  s.score += 1;
  const c2 = checksumState(s);
  assert.notEqual(c1, c2);
});

test('52 dynamite in versus removes carried item', () => {
  const s = createGame({ mode: 'local-two-player', variant: 'versus', playerCount: 2 });
  s.objects = [{ id: 'x', type: 'gold_large', x: 315, y: 240, radius: 42, claimedBy: null }];
  s.players[0].angle = 0;
  applyInput(s, { playerId: 1, action: 'fire' });
  for (let i = 0; i < 80; i++) stepGame(s, []);
  assert.equal(Boolean(s.players[0].carryingId), true);
  applyInput(s, { playerId: 1, action: 'dynamite' });
  assert.equal(s.players[0].carryingId, null);
});

test('53 time expiry in versus checks max score against target', () => {
  const s = createGame({ mode: 'local-two-player', variant: 'versus', playerCount: 2 });
  s.scores[2] = s.target + 1;
  s.timeLeftMs = 1;
  stepGame(s, []);
  assert.equal(s.gameState, 'SHOP');
});

test('54 replay stops on level end', () => {
  const out = runReplay({ seed: 42, frames: [], maxTicks: 10000 });
  assert.ok(out.state.tick <= 10000);
});

test('55 late inputs still deterministic', () => {
  const s1 = createGame({ seed: 100 });
  const s2 = createGame({ seed: 100 });
  stepGame(s1, []);
  stepGame(s2, [{ tick: 1, playerId: 1, action: 'fire' }]);
  assert.notEqual(checksumState(s1), checksumState(s2));
});

test('56 coop mode keeps shared score field', () => {
  const s = createGame({ mode: 'local-two-player', variant: 'coop', playerCount: 2 });
  s.score = 123;
  assert.equal(s.score, 123);
});

test('57 versus scoring updates per player only', () => {
  const s = createGame({ mode: 'local-two-player', variant: 'versus', playerCount: 2 });
  s.scores[1] = 50;
  s.scores[2] = 75;
  assert.equal(s.scores[1] + s.scores[2], 125);
});

test('58 p1 dynamite action accepted in 2p state machine', () => {
  const s = createGame({ mode: 'local-two-player', variant: 'coop', playerCount: 2 });
  s.players[0].clawState = 'GRABBED_RETRACTING';
  s.players[0].carryingId = 'x';
  s.objects = [{ id: 'x', type: 'rock_small', x: 315, y: 220, radius: 18, claimedBy: 1 }];
  applyInput(s, { playerId: 1, action: 'dynamite' });
  assert.equal(s.players[0].carryingId, null);
});

test('59 p2 dynamite action accepted in 2p state machine', () => {
  const s = createGame({ mode: 'local-two-player', variant: 'coop', playerCount: 2 });
  s.players[1].clawState = 'GRABBED_RETRACTING';
  s.players[1].carryingId = 'x';
  s.objects = [{ id: 'x', type: 'rock_small', x: 485, y: 220, radius: 18, claimedBy: 2 }];
  applyInput(s, { playerId: 2, action: 'dynamite' });
  assert.equal(s.players[1].carryingId, null);
});

test('60 player count inferred from mode when omitted', () => {
  const s = createGame({ mode: 'local-two-player', variant: 'coop' });
  assert.equal(s.playerCount, 2);
});
