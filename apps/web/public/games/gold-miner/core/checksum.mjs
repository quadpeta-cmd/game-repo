import { createHash } from 'node:crypto';

export function checksumState(state) {
  const compact = {
    mode: state.mode,
    variant: state.variant,
    tick: state.tick,
    gameState: state.gameState,
    timeLeftMs: state.timeLeftMs,
    score: state.score,
    target: state.target,
    seed: state.seed,
    players: state.players,
    objects: state.objects.map(({ id, type, x, y, claimedBy }) => ({ id, type, x, y, claimedBy }))
  };
  return createHash('sha1').update(JSON.stringify(compact)).digest('hex').slice(0, 12);
}
