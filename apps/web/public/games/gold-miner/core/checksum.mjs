function fnv1a(str) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

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

  const json = JSON.stringify(compact);
  return fnv1a(json).toString(16).padStart(8, '0');
}
