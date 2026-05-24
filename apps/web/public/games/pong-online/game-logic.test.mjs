import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildInviteLink,
  clampPaddleY,
  generateRoomCode,
  isMatchWinner,
  losingSide,
  paddleHeightForEffect,
  paddleSpeedForEffect,
  resolveSignalingUrl,
  winnerFromOutOfBounds,
  winningSide,
} from './game-logic.mjs';

test('buildInviteLink sets room query param', () => {
  const url = buildInviteLink('https://example.com/play/pong-online?debug=1', 'ABCD12');
  assert.equal(new URL(url).searchParams.get('room'), 'ABCD12');
});

test('resolveSignalingUrl prefers explicit override', () => {
  const value = resolveSignalingUrl({
    currentUrl: 'https://example.com/play/pong-online',
    baseUri: 'https://fallback.example.com/app/',
    override: 'wss://custom.example/ws',
  });
  assert.equal(value, 'wss://custom.example/ws');
});

test('resolveSignalingUrl uses current URL host + ws port', () => {
  const value = resolveSignalingUrl({
    currentUrl: 'https://play.example.com/games/pong-online?room=ABCD',
    baseUri: 'https://fallback.example.com/app/',
    override: null,
  });
  assert.equal(value, 'wss://play.example.com:8787');
});

test('generateRoomCode maps values into allowed alphabet', () => {
  const code = generateRoomCode(Uint32Array.from([0, 1, 2, 30, 31, 32]));
  assert.equal(code, 'ABC89A');
});

test('winnerFromOutOfBounds returns right when ball exits left', () => {
  assert.equal(winnerFromOutOfBounds(-1, 800), 'right');
});

test('winnerFromOutOfBounds returns left when ball exits right', () => {
  assert.equal(winnerFromOutOfBounds(801, 800), 'left');
});

test('winnerFromOutOfBounds returns null when in bounds', () => {
  assert.equal(winnerFromOutOfBounds(400, 800), null);
});

test('clampPaddleY clamps low', () => {
  assert.equal(clampPaddleY(-10, 500, 90), 45);
});

test('clampPaddleY clamps high', () => {
  assert.equal(clampPaddleY(999, 500, 90), 455);
});

test('paddleHeightForEffect big', () => {
  assert.equal(paddleHeightForEffect(90, 'big'), 130.5);
});

test('paddleHeightForEffect small', () => {
  assert.ok(Math.abs(paddleHeightForEffect(90, 'small') - 63) < 1e-9);
});

test('paddleHeightForEffect none', () => {
  assert.equal(paddleHeightForEffect(90, null), 90);
});

test('paddleSpeedForEffect speed', () => {
  assert.equal(paddleSpeedForEffect(350, 'speed'), 480);
});

test('paddleSpeedForEffect default', () => {
  assert.equal(paddleSpeedForEffect(350, 'big'), 350);
});

test('losingSide resolves left', () => {
  assert.equal(losingSide(1, 3), 'left');
});

test('losingSide resolves right', () => {
  assert.equal(losingSide(5, 2), 'right');
});

test('losingSide tie uses random', () => {
  assert.equal(losingSide(2, 2, 0.2), 'left');
  assert.equal(losingSide(2, 2, 0.9), 'right');
});

test('winningSide maps opposite', () => {
  assert.equal(winningSide(1, 3), 'right');
  assert.equal(winningSide(7, 2), 'left');
});

test('isMatchWinner left', () => {
  assert.equal(isMatchWinner(8, 7, 8), 'left');
});

test('isMatchWinner right', () => {
  assert.equal(isMatchWinner(4, 8, 8), 'right');
});

test('isMatchWinner none', () => {
  assert.equal(isMatchWinner(7, 7, 8), null);
});
