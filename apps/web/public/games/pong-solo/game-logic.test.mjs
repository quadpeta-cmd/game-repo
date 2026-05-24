import test from 'node:test';
import assert from 'node:assert/strict';
import { GAME_HEIGHT, PADDLE_HEIGHT, clampPaddle, nextBotInput, resetBallToward } from './game-logic.mjs';

test('clampPaddle clamps low bound', () => {
  assert.equal(clampPaddle(-100), PADDLE_HEIGHT / 2);
});

test('clampPaddle clamps high bound', () => {
  assert.equal(clampPaddle(9999), GAME_HEIGHT - PADDLE_HEIGHT / 2);
});

test('resetBallToward right sends ball right', () => {
  assert.equal(resetBallToward('right').ballVX > 0, true);
});

test('resetBallToward left sends ball left', () => {
  assert.equal(resetBallToward('left').ballVX < 0, true);
});

test('nextBotInput only emits -1 or 1', () => {
  for (let i = 0; i < 100; i += 1) {
    const value = nextBotInput();
    assert.ok(value === -1 || value === 1);
  }
});
