import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVEL_SECONDS, nextLevel, shouldRestartFromHp, speedBoostForLevel } from './game-logic.mjs';

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
