import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInviteLink, winnerFromOutOfBounds } from './game-logic.mjs';

test('buildInviteLink sets room query param', () => {
  const url = buildInviteLink('https://example.com/play/pong-online?debug=1', 'ABCD12');
  assert.equal(new URL(url).searchParams.get('room'), 'ABCD12');
});

test('winnerFromOutOfBounds returns right when ball exits left', () => {
  assert.equal(winnerFromOutOfBounds(-1, 800), 'right');
});

test('winnerFromOutOfBounds returns left when ball exits right', () => {
  assert.equal(winnerFromOutOfBounds(801, 800), 'left');
});
