import { OBJECT_TYPES } from './constants.mjs';
export function reelSpeedPxPerSec(objectWeight, effects = {}) { const base = 410; const m = effects.strengthDrink ? 1.45 : 1; return Math.max(75, (base / (1 + objectWeight)) * m); }
export function objectValue(type, effects = {}, rng = null) {
  if (type === 'mystery_bag') {
    const values = effects.luckyClover ? [80, 120, 200, 350, 600] : [5, 20, 50, 100, 300];
    return values[Math.floor((rng?.next?.() ?? Math.random()) * values.length)];
  }
  const base = OBJECT_TYPES[type]?.value ?? 0;
  if (type === 'diamond_blue' && effects.diamondPolish) return Math.round(base * 1.5);
  if (type.startsWith('rock_') && effects.rockBook) return base * 3;
  return base;
}
