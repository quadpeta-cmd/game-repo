export const LEVEL_SECONDS = 90;

export function speedBoostForLevel(level, timeLeft) {
  const progress = 1 - (timeLeft / LEVEL_SECONDS);
  if (level <= 1) return 0;
  return progress * 2.4;
}

export function nextLevel(currentLevel) {
  return currentLevel >= 5 ? 1 : currentLevel + 1;
}

export function shouldRestartFromHp(hp) {
  return hp <= 0;
}
