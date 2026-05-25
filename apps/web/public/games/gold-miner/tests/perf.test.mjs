import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, stepGame } from '../core/simulation.mjs';

test('simulation runs 10k ticks under 1.5s budget', () => {
  const s = createGame({ seed: 123 });
  const start = Date.now();
  for (let i = 0; i < 10000; i++) stepGame(s, []);
  const elapsed = Date.now() - start;
  assert.ok(elapsed < 1500);
});
