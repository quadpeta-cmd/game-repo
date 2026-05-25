export const WORLD = {
  width: 800,
  height: 500,
  hudHeight: 64,
  mineTop: 72,
  mineBottom: 492,
  clawOrigin1P: { x: 400, y: 76 },
  clawOriginP1: { x: 315, y: 76 },
  clawOriginP2: { x: 485, y: 76 }
};

export const TIMING = {
  fixedDtMs: 1000 / 60,
  levelSecondsBase: 60,
  timerWarningSeconds: 10
};

export const CLAW = {
  minAngleRad: -1.15,
  maxAngleRad: 1.15,
  swingSpeedRadPerSec: 1.65,
  extendSpeedPxPerSec: 520,
  emptyRetractSpeedPxPerSec: 650,
  maxLengthPx: 455,
  hitRadiusPx: 16
};

export const LEVEL_TARGETS = [650, 1000, 1500, 2200, 3100, 4300, 5600, 7200, 9000, 11000];

export const OBJECT_TYPES = {
  gold_tiny: { value: 50, weight: 0.55, radius: 14 },
  gold_small: { value: 100, weight: 0.8, radius: 18 },
  gold_medium: { value: 250, weight: 1.75, radius: 28 },
  gold_large: { value: 500, weight: 3.3, radius: 42 },
  gold_huge: { value: 800, weight: 5, radius: 52 },
  rock_small: { value: 11, weight: 1.2, radius: 18 },
  rock_medium: { value: 20, weight: 2.2, radius: 28 },
  rock_large: { value: 40, weight: 3.7, radius: 40 },
  diamond_blue: { value: 600, weight: 0.5, radius: 16 },
  mystery_bag: { value: 0, weight: 0.95, radius: 20 },
  bone: { value: 7, weight: 0.8, radius: 22 },
  skull: { value: 10, weight: 1.4, radius: 24 },
  mouse_diamond: { value: 700, weight: 0.85, radius: 18, moving: true },
  dynamite: { value: 0, weight: 0.7, radius: 16, grantsDynamite: 1 }
};

export const GAME_STATES = Object.freeze({
  BOOT: 'BOOT', MENU: 'MENU', LEVEL_INTRO: 'LEVEL_INTRO', PLAYING: 'PLAYING', LEVEL_SUCCESS: 'LEVEL_SUCCESS', LEVEL_FAIL: 'LEVEL_FAIL', SHOP: 'SHOP', GAME_OVER: 'GAME_OVER', PAUSED: 'PAUSED', ONLINE_WAITING: 'ONLINE_WAITING', ONLINE_DISCONNECTED: 'ONLINE_DISCONNECTED'
});

export const CLAW_STATES = Object.freeze({
  AIMING: 'AIMING', EXTENDING: 'EXTENDING', EMPTY_RETRACTING: 'EMPTY_RETRACTING', GRABBED_RETRACTING: 'GRABBED_RETRACTING', DYNAMITE_EXPLODING: 'DYNAMITE_EXPLODING', DISABLED: 'DISABLED'
});
