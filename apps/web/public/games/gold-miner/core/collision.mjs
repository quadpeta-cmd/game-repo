export function segmentCircleHit(ax, ay, bx, by, cx, cy, r) {
  const abx = bx - ax, aby = by - ay, acx = cx - ax, acy = cy - ay;
  const ab2 = abx * abx + aby * aby;
  let t = ab2 === 0 ? 0 : (acx * abx + acy * aby) / ab2;
  t = Math.max(0, Math.min(1, t));
  const px = ax + abx * t, py = ay + aby * t;
  const dx = cx - px, dy = cy - py;
  const hit = dx * dx + dy * dy <= r * r;
  return hit ? { hit: true, t, distance: Math.sqrt((px-ax)**2+(py-ay)**2) } : { hit: false };
}
export function findClosestHit(origin, tip, objects, clawRadius, playerId) {
  let best = null;
  for (const obj of objects) {
    if (obj.claimedBy && obj.claimedBy !== playerId) continue;
    const r = (obj.radius || 0) + clawRadius;
    const hit = segmentCircleHit(origin.x, origin.y, tip.x, tip.y, obj.x, obj.y, r);
    if (!hit.hit) continue;
    if (!best || hit.distance < best.distance || (hit.distance === best.distance && playerId < best.playerId)) best = { objectId: obj.id, distance: hit.distance, playerId };
  }
  return best;
}
