import { GAME_STATES, TIMING } from './constants.mjs';
import { levelTarget, generateLevel } from './level-generator.mjs';
import { createPlayer, stepClaw, getOriginForPlayer } from './claw-system.mjs';
import { createRng } from './rng.mjs';
import { objectValue } from './scoring.mjs';
import { checksumState } from './checksum.mjs';
import { generateShopPrices } from './shop.mjs';

function createPlayers(count) { return Array.from({ length: count }, (_, i) => createPlayer(i + 1)); }

export function createGame(config = {}) {
  const seed = config.seed ?? 123456;
  const level = config.level ?? 1;
  const playerCount = config.playerCount ?? (config.mode === 'one-player' ? 1 : 2);
  const generated = generateLevel(seed, level);
  return {
    mode: config.mode ?? 'one-player',
    variant: config.variant ?? 'solo',
    playerCount,
    seed,
    level,
    tick: 0,
    gameState: GAME_STATES.PLAYING,
    timeLeftMs: TIMING.levelSecondsBase * 1000,
    target: levelTarget(level),
    objects: generated.objects,
    score: 0,
    scores: playerCount === 2 ? { 1: 0, 2: 0 } : null,
    rngState: seed,
    players: createPlayers(playerCount),
    shop: { prices: null, bought: [] },
    events: []
  };
}

function nextRand(state) {
  const rng = createRng(state.rngState);
  const v = rng.next();
  state.rngState = rng.seed();
  return v;
}

function applyPlayerEffect(player, itemId) {
  if (itemId === 'dynamite') player.dynamite += 1;
  if (itemId === 'strength_drink') player.effects.strengthDrink = true;
  if (itemId === 'lucky_clover') player.effects.luckyClover = true;
  if (itemId === 'diamond_polish') player.effects.diamondPolish = true;
  if (itemId === 'rock_book') player.effects.rockBook = true;
  if (itemId === 'magic_clock') player.effects.magicClock = true;
}

export function buyShopItem(state, itemId, playerId = 1) {
  if (state.gameState !== GAME_STATES.SHOP) return false;
  const price = state.shop.prices?.[itemId];
  if (!price || state.score < price) return false;
  state.score -= price;
  state.shop.bought.push(itemId);
  applyPlayerEffect(state.players[playerId - 1], itemId);
  return true;
}

export function startNextLevel(state) {
  if (![GAME_STATES.LEVEL_SUCCESS, GAME_STATES.SHOP].includes(state.gameState)) return false;
  state.level += 1;
  state.target = levelTarget(state.level);
  state.objects = generateLevel(state.seed, state.level).objects;
  state.timeLeftMs = TIMING.levelSecondsBase * 1000 + (state.players[0].effects.magicClock ? 10_000 : 0);
  state.players.forEach((p) => { p.effects = {}; p.length = 0; p.carryingId = null; p.clawState = 'AIMING'; });
  state.shop = { prices: null, bought: [] };
  state.gameState = GAME_STATES.PLAYING;
  return true;
}

function resolveLevelEnd(state) {
  const resolved = state.variant === 'versus' && state.scores ? Math.max(state.scores[1], state.scores[2]) : state.score;
  state.gameState = resolved >= state.target ? GAME_STATES.LEVEL_SUCCESS : GAME_STATES.LEVEL_FAIL;
  if (state.gameState === GAME_STATES.LEVEL_SUCCESS) {
    state.shop.prices = generateShopPrices(state.seed, state.level);
    state.gameState = GAME_STATES.SHOP;
  }
}

export function applyInput(state, input) {
  const player = state.players[input.playerId - 1];
  if (!player) return;
  if (input.action === 'fire' && player.clawState === 'AIMING' && state.gameState === GAME_STATES.PLAYING) player.clawState = 'EXTENDING';
  if (input.action === 'dynamite' && player.clawState === 'GRABBED_RETRACTING' && player.carryingId) {
    state.objects = state.objects.filter((o) => o.id !== player.carryingId);
    player.carryingId = null;
    player.clawState = 'EMPTY_RETRACTING';
  }
  if (input.action === 'select' && state.gameState === GAME_STATES.SHOP) startNextLevel(state);
  if (input.action === 'shop_buy' && state.gameState === GAME_STATES.SHOP && input.value) buyShopItem(state, input.value, input.playerId);
}

function applyScore(state, playerId, objType, rand) {
  const effects = state.players[playerId - 1].effects;
  const value = objectValue(objType, effects, { next: () => rand });
  if (state.variant === 'versus' && state.scores) state.scores[playerId] += value;
  else state.score += value;
}

export function stepGame(state, inputFrame = [], fixedDtMs = TIMING.fixedDtMs) {
  for (const input of inputFrame) applyInput(state, input);
  if (state.gameState !== GAME_STATES.PLAYING) return state;

  state.tick += 1;
  const dt = fixedDtMs / 1000;
  for (let i = 0; i < state.players.length; i += 1) {
    const p = state.players[i];
    const result = stepClaw(p, getOriginForPlayer(i, state.playerCount), state.objects, dt);
    if (result?.type === 'returned' && result.objectId) {
      const obj = state.objects.find((o) => o.id === result.objectId);
      if (obj) {
        applyScore(state, p.id, obj.type, nextRand(state));
        state.objects = state.objects.filter((o) => o.id !== obj.id);
      }
    }
  }

  state.timeLeftMs = Math.max(0, state.timeLeftMs - fixedDtMs);
  if (state.timeLeftMs === 0) resolveLevelEnd(state);
  return state;
}

export const serializeState = (state) => JSON.stringify(state);
export const deserializeState = (snapshot) => JSON.parse(snapshot);
export { checksumState };
export function getRenderableFrame(state) { return { tick: state.tick, players: state.players, objects: state.objects, score: state.score, scores: state.scores, gameState: state.gameState, shop: state.shop, level: state.level, target: state.target, timeLeftMs: state.timeLeftMs }; }
