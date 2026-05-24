import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildInviteLink,
  clampPaddleY,
  generateRoomCode,
  isMatchWinner,
  losingSide,
  messageForSocketClose,
  paddleScaleAfterPoint,
  paddleHeightForEffect,
  paddleSpeedForEffect,
  powerItemHitsPaddle,
  resolveSignalingUrl,
  shouldSuppressSocketCloseMessage,
  fruitForRound,
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

test('resolveSignalingUrl rewrites github.dev forwarded host to signaling port host', () => {
  const value = resolveSignalingUrl({
    currentUrl: 'https://crispy-invention-7v4p6p4g9wqgf9gj-5173.app.github.dev/play/pong-online',
    baseUri: 'https://fallback.example.com/app/',
    override: null,
  });
  assert.equal(value, 'wss://crispy-invention-7v4p6p4g9wqgf9gj-8787.app.github.dev');
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


test('shouldSuppressSocketCloseMessage only suppresses normal close after explicit error', () => {
  assert.equal(shouldSuppressSocketCloseMessage({ suppressNextSocketCloseMessage: true, socketCloseCode: 1000 }), true);
  assert.equal(shouldSuppressSocketCloseMessage({ suppressNextSocketCloseMessage: false, socketCloseCode: 1000 }), false);
  assert.equal(shouldSuppressSocketCloseMessage({ suppressNextSocketCloseMessage: true, socketCloseCode: 1006 }), false);
});


test('messageForSocketClose returns actionable message for reachable signaling on 1006', () => {
  const message = messageForSocketClose({
    closeCode: 1006,
    signalingUrl: 'ws://localhost:8787',
    diagnosis: { reachable: true, probeUrl: 'http://localhost:8787/' },
  });
  assert.match(message, /reachable/);
  assert.match(message, /check signaling server logs/);
});

test('messageForSocketClose returns restart guidance for unreachable signaling on 1006', () => {
  const message = messageForSocketClose({
    closeCode: 1006,
    signalingUrl: 'ws://localhost:8787',
    diagnosis: { reachable: false },
  });
  assert.match(message, /Could not reach signaling host/);
  assert.match(message, /start\/restart signaling/);
});

test('messageForSocketClose returns generic message for other codes', () => {
  const message = messageForSocketClose({
    closeCode: 1001,
    signalingUrl: 'ws://localhost:8787',
  });
  assert.equal(message, 'Signaling connection closed (code 1001). Retry create/join.');
});

test('paddleScaleAfterPoint shrinks by 5%', () => {
  assert.equal(paddleScaleAfterPoint(1), 0.95);
});

test('paddleScaleAfterPoint respects minimum', () => {
  assert.equal(paddleScaleAfterPoint(0.41, 0.05, 0.4), 0.4);
});

test('powerItemHitsPaddle detects collision', () => {
  assert.equal(powerItemHitsPaddle(20, 100, 26, 100, 80), true);
  assert.equal(powerItemHitsPaddle(200, 100, 26, 100, 80), false);
});

test('fruitForRound picks based on random value', () => {
  const fruits = ['🍎', '🍊', '🍌'];
  assert.equal(fruitForRound(fruits, 0.0), '🍎');
  assert.equal(fruitForRound(fruits, 0.5), '🍊');
  assert.equal(fruitForRound(fruits, 0.9), '🍌');
});
