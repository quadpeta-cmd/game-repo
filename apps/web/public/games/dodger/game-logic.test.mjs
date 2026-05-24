import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LEVEL_SECONDS,
  enemyCanFireInLevel3,
  initialEnemyShotCooldownRange,
  isLevel4SideSpawnAllowed,
  level3SpawnShotCooldown,
  nextLevel,
  shouldRestartFromHp,
  speedBoostForLevel,
} from './game-logic.mjs';

test('speed boost is zero for level 1', () => {
  assert.equal(speedBoostForLevel(1, LEVEL_SECONDS / 2), 0);
});

test('speed boost increases over level duration', () => {
  const early = speedBoostForLevel(2, 80);
  const late = speedBoostForLevel(2, 10);
  assert.ok(late > early);
});

test('next level wraps after level 5', () => {
  assert.equal(nextLevel(5), 1);
  assert.equal(nextLevel(3), 4);
});

test('hp restart rule', () => {
  assert.equal(shouldRestartFromHp(0), true);
  assert.equal(shouldRestartFromHp(2), false);
});

test('level 3 enemies can fire when in top band and cooldown elapsed', () => {
  assert.equal(enemyCanFireInLevel3({
    enemyY: 20,
    canvasHeight: 480,
    shotCooldown: 0,
    pelletCount: 3,
    maxEnemyPellets: 18,
  }), true);
});

test('level 3 enemies cannot fire outside top band', () => {
  assert.equal(enemyCanFireInLevel3({
    enemyY: 120,
    canvasHeight: 480,
    shotCooldown: -1,
    pelletCount: 3,
    maxEnemyPellets: 18,
  }), false);
});

test('level 3 cooldown reset range is short enough for top-band firing', () => {
  const cooldown = level3SpawnShotCooldown();
  assert.deepEqual(cooldown, { min: 6, max: 22 });
});

test('level 4 side spawns are allowed only from top or top corners', () => {
  assert.equal(isLevel4SideSpawnAllowed(-20, 480), true);
  assert.equal(isLevel4SideSpawnAllowed(40, 480), true);
  assert.equal(isLevel4SideSpawnAllowed(200, 480), false);
  assert.equal(isLevel4SideSpawnAllowed(520, 480), false);
});


test('initial enemy shot cooldown is short in level 3+', () => {
  assert.deepEqual(initialEnemyShotCooldownRange(3), { min: 6, max: 22 });
  assert.deepEqual(initialEnemyShotCooldownRange(5), { min: 6, max: 22 });
});

test('initial enemy shot cooldown stays long before level 3', () => {
  assert.deepEqual(initialEnemyShotCooldownRange(1), { min: 50, max: 130 });
  assert.deepEqual(initialEnemyShotCooldownRange(2), { min: 50, max: 130 });
});
