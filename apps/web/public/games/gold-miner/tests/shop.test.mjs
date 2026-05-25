import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, stepGame, buyShopItem, startNextLevel, applyInput } from '../core/simulation.mjs';

test('shop opens on success at timer end', () => {
  const s = createGame({ seed: 1 });
  s.score = s.target;
  s.timeLeftMs = 1;
  stepGame(s, []);
  assert.equal(s.gameState, 'SHOP');
  assert.ok(s.shop.prices);
});

test('fail does not open shop', () => {
  const s = createGame({ seed: 1 });
  s.score = 0;
  s.timeLeftMs = 1;
  stepGame(s, []);
  assert.equal(s.gameState, 'LEVEL_FAIL');
});

test('shop buy decreases score', () => {
  const s = createGame();
  s.score = s.target;
  s.timeLeftMs = 1;
  stepGame(s, []);
  const [id, price] = Object.entries(s.shop.prices)[0];
  const before = s.score;
  assert.equal(buyShopItem(s, id, 1), true);
  assert.equal(s.score, before - price);
});

test('cannot buy without funds', () => {
  const s = createGame();
  s.score = s.target;
  s.timeLeftMs = 1;
  stepGame(s, []);
  s.score = 0;
  const id = Object.keys(s.shop.prices)[0];
  assert.equal(buyShopItem(s, id, 1), false);
});

test('dynamite purchase adds inventory', () => {
  const s = createGame();
  s.score = 9999;
  s.gameState = 'SHOP';
  s.shop.prices = { dynamite: 10 };
  buyShopItem(s, 'dynamite', 1);
  assert.equal(s.players[0].dynamite, 1);
});

test('strength drink applies effect', () => {
  const s = createGame();
  s.score = 9999;
  s.gameState = 'SHOP';
  s.shop.prices = { strength_drink: 10 };
  buyShopItem(s, 'strength_drink', 1);
  assert.equal(s.players[0].effects.strengthDrink, true);
});

test('magic clock adds next level time', () => {
  const s = createGame();
  s.score = 9999;
  s.gameState = 'SHOP';
  s.shop.prices = { magic_clock: 10 };
  buyShopItem(s, 'magic_clock', 1);
  startNextLevel(s);
  assert.equal(s.timeLeftMs, 70000);
});

test('start next level increments level and resets shop', () => {
  const s = createGame();
  s.gameState = 'SHOP';
  s.shop.prices = { dynamite: 10 };
  const before = s.level;
  startNextLevel(s);
  assert.equal(s.level, before + 1);
  assert.equal(s.gameState, 'PLAYING');
  assert.equal(s.shop.prices, null);
});

test('effects clear on level start', () => {
  const s = createGame();
  s.gameState = 'SHOP';
  s.players[0].effects.strengthDrink = true;
  startNextLevel(s);
  assert.equal(Boolean(s.players[0].effects.strengthDrink), false);
});

test('shop_buy input works', () => {
  const s = createGame();
  s.score = 9999;
  s.gameState = 'SHOP';
  s.shop.prices = { lucky_clover: 10 };
  applyInput(s, { playerId: 1, action: 'shop_buy', value: 'lucky_clover' });
  assert.equal(s.players[0].effects.luckyClover, true);
});

test('select input starts next level from shop', () => {
  const s = createGame();
  s.gameState = 'SHOP';
  applyInput(s, { playerId: 1, action: 'select' });
  assert.equal(s.gameState, 'PLAYING');
  assert.equal(s.level, 2);
});

test('shop prices deterministic for same seed and level', () => {
  const a = createGame({ seed: 8 });
  const b = createGame({ seed: 8 });
  a.score = a.target; b.score = b.target;
  a.timeLeftMs = 1; b.timeLeftMs = 1;
  stepGame(a, []); stepGame(b, []);
  assert.deepEqual(a.shop.prices, b.shop.prices);
});

test('shop cannot buy outside shop state', () => {
  const s = createGame();
  const result = buyShopItem(s, 'dynamite', 1);
  assert.equal(result, false);
});

test('startNextLevel denied outside success/shop states', () => {
  const s = createGame();
  const before = s.level;
  const ok = startNextLevel(s);
  assert.equal(ok, false);
  assert.equal(s.level, before);
});

test('buying unknown item fails', () => {
  const s = createGame();
  s.gameState = 'SHOP';
  s.score = 100;
  s.shop.prices = { dynamite: 50 };
  assert.equal(buyShopItem(s, 'not_real', 1), false);
});

test('shop bought list records item ids', () => {
  const s = createGame();
  s.gameState = 'SHOP';
  s.score = 100;
  s.shop.prices = { dynamite: 50 };
  buyShopItem(s, 'dynamite', 1);
  assert.deepEqual(s.shop.bought, ['dynamite']);
});

test('next level regenerates object field', () => {
  const s = createGame();
  s.gameState = 'SHOP';
  const beforeIds = s.objects.map((o) => o.id + o.type).join(',');
  startNextLevel(s);
  const afterIds = s.objects.map((o) => o.id + o.type).join(',');
  assert.notEqual(beforeIds, afterIds);
});

test('select input ignored while playing', () => {
  const s = createGame();
  const before = s.level;
  applyInput(s, { playerId: 1, action: 'select' });
  assert.equal(s.level, before);
});
