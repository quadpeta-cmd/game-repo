import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BALL_RADIUS,
  BOT_SPEED,
  GAME_HEIGHT,
  GAME_WIDTH,
  PADDLE_HEIGHT,
  PLAYER_SPEED,
  WINNING_SCORE,
  clampPaddle,
  createInitialState,
  getPlayerInput,
  nextBotInput,
  resetBallToward,
  stepGame,
} from './game-logic.mjs';

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
  const randomValues = [0.1, 0.9, 0.2, 0.7];
  for (const randomValue of randomValues) {
    const value = nextBotInput(() => randomValue);
    assert.ok(value === -1 || value === 1);
  }
});

test('getPlayerInput resolves up/down combinations', () => {
  assert.equal(getPlayerInput({ up: true, down: false }), -1);
  assert.equal(getPlayerInput({ up: false, down: true }), 1);
  assert.equal(getPlayerInput({ up: true, down: true }), 0);
  assert.equal(getPlayerInput({ up: false, down: false }), 0);
});

test('stepGame moves paddles based on inputs and speed constants', () => {
  const state = createInitialState();
  const next = stepGame(state, { dt: 0.1, playerInput: -1, botInput: 1 });
  assert.equal(next.leftY, state.leftY - PLAYER_SPEED * 0.1);
  assert.equal(next.rightY, state.rightY + BOT_SPEED * 0.1);
});

test('stepGame bounces from top and bottom walls', () => {
  const topBounce = stepGame(
    { ...createInitialState(), ballY: BALL_RADIUS - 1, ballVY: -200 },
    { dt: 0.016, playerInput: 0, botInput: 0 }
  );
  assert.equal(topBounce.ballVY > 0, true);

  const bottomBounce = stepGame(
    { ...createInitialState(), ballY: GAME_HEIGHT - BALL_RADIUS + 1, ballVY: 200 },
    { dt: 0.016, playerInput: 0, botInput: 0 }
  );
  assert.equal(bottomBounce.ballVY < 0, true);
});

test('stepGame reflects from left paddle and accelerates ball', () => {
  const state = {
    ...createInitialState(),
    ballX: 30,
    ballY: GAME_HEIGHT / 2,
    ballVX: -280,
  };
  const next = stepGame(state, { dt: 0.016, playerInput: 0, botInput: 0 });
  assert.equal(next.ballVX > 0, true);
  assert.equal(Math.abs(next.ballVX) > 280, true);
});

test('stepGame reflects from right paddle and accelerates ball', () => {
  const state = {
    ...createInitialState(),
    ballX: GAME_WIDTH - 30,
    ballY: GAME_HEIGHT / 2,
    ballVX: 280,
  };
  const next = stepGame(state, { dt: 0.016, playerInput: 0, botInput: 0 });
  assert.equal(next.ballVX < 0, true);
  assert.equal(Math.abs(next.ballVX) > 280, true);
});

test('stepGame increments right score and resets ball when player misses', () => {
  const state = { ...createInitialState(), ballX: -1 };
  const next = stepGame(state, { dt: 0, playerInput: 0, botInput: 0 });
  assert.equal(next.rightScore, 1);
  assert.equal(next.ballX, GAME_WIDTH / 2);
  assert.equal(next.ballY, GAME_HEIGHT / 2);
  assert.equal(next.ballVX > 0, true);
});

test('stepGame increments left score and resets ball when bot misses', () => {
  const state = { ...createInitialState(), ballX: GAME_WIDTH + 1 };
  const next = stepGame(state, { dt: 0, playerInput: 0, botInput: 0 });
  assert.equal(next.leftScore, 1);
  assert.equal(next.ballVX < 0, true);
});

test('stepGame declares player winner at winning score', () => {
  const state = { ...createInitialState(), leftScore: WINNING_SCORE - 1, ballX: GAME_WIDTH + 1 };
  const next = stepGame(state, { dt: 0, playerInput: 0, botInput: 0 });
  assert.equal(next.winner, 'player');
});

test('stepGame declares bot winner at winning score', () => {
  const state = { ...createInitialState(), rightScore: WINNING_SCORE - 1, ballX: -1 };
  const next = stepGame(state, { dt: 0, playerInput: 0, botInput: 0 });
  assert.equal(next.winner, 'bot');
});

test('stepGame freezes motion after a winner exists', () => {
  const state = { ...createInitialState(), winner: 'player', ballX: 111, leftY: 222 };
  const next = stepGame(state, { dt: 1, playerInput: 1, botInput: -1 });
  assert.deepEqual(next, state);
});

test('nextBotInput maps threshold values correctly', () => {
  assert.equal(nextBotInput(() => 0.49), -1);
  assert.equal(nextBotInput(() => 0.5), 1);
});

test('stepGame clamps paddles when input would move outside playfield', () => {
  const state = {
    ...createInitialState(),
    leftY: PADDLE_HEIGHT / 2,
    rightY: GAME_HEIGHT - PADDLE_HEIGHT / 2,
  };
  const next = stepGame(state, { dt: 1, playerInput: -1, botInput: 1 });
  assert.equal(next.leftY, PADDLE_HEIGHT / 2);
  assert.equal(next.rightY, GAME_HEIGHT - PADDLE_HEIGHT / 2);
});

test('stepGame does not reflect from left paddle when ball moving right', () => {
  const state = {
    ...createInitialState(),
    ballX: 30,
    ballY: GAME_HEIGHT / 2,
    ballVX: 280,
  };
  const next = stepGame(state, { dt: 0.016, playerInput: 0, botInput: 0 });
  assert.equal(next.ballVX > 0, true);
});

test('stepGame does not reflect from right paddle when ball moving left', () => {
  const state = {
    ...createInitialState(),
    ballX: GAME_WIDTH - 30,
    ballY: GAME_HEIGHT / 2,
    ballVX: -280,
  };
  const next = stepGame(state, { dt: 0.016, playerInput: 0, botInput: 0 });
  assert.equal(next.ballVX < 0, true);
});
