import { CLAW, CLAW_STATES, OBJECT_TYPES, WORLD } from './constants.mjs';
import { findClosestHit } from './collision.mjs';
import { reelSpeedPxPerSec } from './scoring.mjs';

export function createPlayer(id = 1) {
  return { id, clawState: CLAW_STATES.AIMING, angle: 0, dir: 1, length: 0, dynamite: 0, effects: {}, carryingId: null };
}

export function clawTip(player, origin) {
  return { x: origin.x + Math.sin(player.angle) * player.length, y: origin.y + Math.cos(player.angle) * player.length };
}

export function stepClaw(player, origin, objects, dtSec) {
  if (player.clawState === CLAW_STATES.AIMING) {
    player.angle += player.dir * CLAW.swingSpeedRadPerSec * dtSec;
    if (player.angle < CLAW.minAngleRad || player.angle > CLAW.maxAngleRad) {
      player.dir *= -1;
      player.angle = Math.max(CLAW.minAngleRad, Math.min(CLAW.maxAngleRad, player.angle));
    }
    return null;
  }

  if (player.clawState === CLAW_STATES.EXTENDING) {
    player.length += CLAW.extendSpeedPxPerSec * dtSec;
    const hit = findClosestHit(origin, clawTip(player, origin), objects, CLAW.hitRadiusPx, player.id);
    if (hit) {
      player.carryingId = hit.objectId;
      const obj = objects.find((o) => o.id === hit.objectId);
      if (obj) obj.claimedBy = player.id;
      player.clawState = CLAW_STATES.GRABBED_RETRACTING;
      return { type: 'hit', objectId: hit.objectId };
    }
    if (player.length >= CLAW.maxLengthPx) player.clawState = CLAW_STATES.EMPTY_RETRACTING;
    return null;
  }

  if (player.clawState === CLAW_STATES.EMPTY_RETRACTING) {
    player.length = Math.max(0, player.length - CLAW.emptyRetractSpeedPxPerSec * dtSec);
    if (player.length === 0) player.clawState = CLAW_STATES.AIMING;
    return null;
  }

  if (player.clawState === CLAW_STATES.GRABBED_RETRACTING) {
    const obj = objects.find((o) => o.id === player.carryingId);
    const speed = reelSpeedPxPerSec(obj ? OBJECT_TYPES[obj.type].weight : 1, player.effects);
    player.length = Math.max(0, player.length - speed * dtSec);
    if (player.length === 0) {
      player.clawState = CLAW_STATES.AIMING;
      const objectId = player.carryingId;
      player.carryingId = null;
      return { type: 'returned', objectId };
    }
  }

  return null;
}

export function getOriginForPlayer(index, playerCount) {
  if (playerCount === 1) return WORLD.clawOrigin1P;
  return index === 0 ? WORLD.clawOriginP1 : WORLD.clawOriginP2;
}
