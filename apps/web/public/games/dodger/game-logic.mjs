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

export function initialEnemyShotCooldownRange(level) {
  return level >= 3 ? { min: 6, max: 22 } : { min: 50, max: 130 };
}

export function enemyCanFireInLevel3({ enemyY, canvasHeight, shotCooldown, pelletCount, maxEnemyPellets }) {
  const inTopBand = enemyY < canvasHeight * 0.15;
  const hasPelletCapacity = pelletCount < maxEnemyPellets;
  return inTopBand && shotCooldown <= 0 && hasPelletCapacity;
}

export function level3SpawnShotCooldown() {
  return { min: 6, max: 22 };
}

export function isLevel4SideSpawnAllowed(spawnY, canvasHeight) {
  return spawnY <= 0 || spawnY < canvasHeight * 0.2;
}
