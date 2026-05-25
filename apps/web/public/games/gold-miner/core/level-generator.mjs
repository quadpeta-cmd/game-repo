import { WORLD, OBJECT_TYPES, LEVEL_TARGETS } from './constants.mjs';
import { createRng } from './rng.mjs';
const TYPES = Object.keys(OBJECT_TYPES);
export function levelTarget(level) { return level <= 10 ? LEVEL_TARGETS[level - 1] : Math.round(LEVEL_TARGETS[9] * Math.pow(1.18, level - 10)); }
export function generateLevel(seed, level = 1) {
  const rng = createRng(seed + level * 1009);
  const count = Math.min(70, level === 1 ? rng.int(22, 28) : level < 5 ? rng.int(30, 42) : rng.int(42, 65));
  const objects = [];
  let guard = 0;
  while (objects.length < count && guard++ < 4000) {
    const t = TYPES[rng.int(0, TYPES.length - 1)];
    if (level < 2 && ['mouse_diamond','skull'].includes(t)) continue;
    const r = OBJECT_TYPES[t].radius;
    const x = rng.int(r + 10, WORLD.width - r - 10), y = rng.int(WORLD.mineTop + r + 16, WORLD.mineBottom - r);
    if (objects.some((o) => (o.x - x) ** 2 + (o.y - y) ** 2 < (o.radius + r + 8) ** 2)) continue;
    objects.push({ id: `o${objects.length+1}`, type: t, x, y, radius: r, claimedBy: null });
  }
  if (!objects.some(o=>o.type.startsWith('gold_'))) objects[0].type='gold_small';
  return { seed, level, target: levelTarget(level), objects };
}
