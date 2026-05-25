import { createGame, stepGame, checksumState } from './simulation.mjs';

export function runReplay({ seed, mode = 'one-player', variant = 'solo', frames = [], maxTicks = 3600 }) {
  const state = createGame({ seed, mode, variant, playerCount: mode === 'one-player' ? 1 : 2 });
  const byTick = new Map();
  for (const frame of frames) {
    if (!byTick.has(frame.tick)) byTick.set(frame.tick, []);
    byTick.get(frame.tick).push(frame);
  }

  while (state.tick < maxTicks && state.gameState === 'PLAYING') {
    stepGame(state, byTick.get(state.tick + 1) ?? []);
  }

  return { state, checksum: checksumState(state) };
}

export function recordInputFrame(_state, input) {
  return { tick: input.tick, playerId: input.playerId, action: input.action, value: input.value };
}
