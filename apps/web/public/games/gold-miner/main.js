import { createGame, stepGame, applyInput, getRenderableFrame, startNextLevel, buyShopItem, checksumState } from './core/simulation.mjs';
import { GAME_STATES, WORLD } from './core/constants.mjs';
import { runReplay } from './core/replay.mjs';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const params = new URLSearchParams(window.location.search);
const debug = params.get('debug') === '1';
const modeParam = params.get('mode') || 'solo';
const isOnlineMode = modeParam === 'online';

function baseConfig(seed = 123456) {
  if (modeParam === 'coop') return { mode: 'local-two-player', variant: 'coop', seed, level: 1, playerCount: 2 };
  if (modeParam === 'versus') return { mode: 'local-two-player', variant: 'versus', seed, level: 1, playerCount: 2 };
  if (modeParam === 'online') return { mode: 'online-two-player', variant: 'coop', seed, level: 1, playerCount: 2 };
  return { mode: 'one-player', variant: 'solo', seed, level: 1, playerCount: 1 };
}

let state = createGame(baseConfig());
let paused = false;
let queued = [];
let accumulator = 0;
let last = performance.now();
const FIXED_DT_MS = 1000 / 60;

function queue(playerId, action, value) { queued.push({ tick: state.tick + 1, playerId, action, value }); }

function drawShop() {
  ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(0, 0, WORLD.width, WORLD.height);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 34px system-ui'; ctx.fillText('Shop', 350, 90);
  ctx.font = '18px system-ui';
  const items = Object.entries(state.shop.prices ?? {});
  items.forEach(([id, price], i) => { ctx.fillText(`${i + 1}. ${id} - $${price}`, 190, 150 + i * 34); });
  ctx.fillText('Press 1-6 to buy · Enter to continue', 210, 420);
}

function draw(frame) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#f59e0b'; ctx.fillRect(0, 0, WORLD.width, WORLD.hudHeight);
  ctx.fillStyle = '#1f2937'; ctx.fillRect(0, WORLD.mineTop, WORLD.width, WORLD.height - WORLD.mineTop);
  ctx.fillStyle = '#111827'; ctx.font = 'bold 20px system-ui';
  const scoreText = frame.scores ? `P1 $${frame.scores[1]} P2 $${frame.scores[2]}` : `$${state.score}`;
  ctx.fillText(scoreText, 16, 38);
  ctx.fillText(`Goal $${state.target}`, 260, 38); ctx.fillText(`Time ${Math.ceil(state.timeLeftMs / 1000)}`, 460, 38); ctx.fillText(`Lv ${state.level}`, 620, 38);

  for (const o of frame.objects) { ctx.fillStyle = o.type.startsWith('gold_') ? '#facc15' : '#9ca3af'; ctx.beginPath(); ctx.arc(o.x, o.y, o.radius, 0, Math.PI * 2); ctx.fill(); }

  frame.players.forEach((p, idx) => {
    const origin = state.playerCount === 1 ? WORLD.clawOrigin1P : idx === 0 ? WORLD.clawOriginP1 : WORLD.clawOriginP2;
    const tipX = origin.x + Math.sin(p.angle) * p.length; const tipY = origin.y + Math.cos(p.angle) * p.length;
    ctx.strokeStyle = idx === 0 ? '#e5e7eb' : '#93c5fd';
    ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(origin.x, origin.y); ctx.lineTo(tipX, tipY); ctx.stroke();
    ctx.beginPath(); ctx.arc(tipX, tipY, 8, 0, Math.PI * 2); ctx.fillStyle = '#f3f4f6'; ctx.fill();
  });

  if (state.gameState === GAME_STATES.LEVEL_FAIL) { ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0,0,WORLD.width,WORLD.height); ctx.fillStyle='#fff'; ctx.font='bold 40px system-ui'; ctx.fillText('Level Failed', 280,250); }
  if (isOnlineMode && state.gameState === GAME_STATES.PLAYING) { ctx.fillStyle='rgba(0,0,0,0.35)'; ctx.fillRect(560,8,230,26); ctx.fillStyle='#fff'; ctx.font='14px monospace'; ctx.fillText('ONLINE_WAITING/PLAYING', 568,26); }
  if (isOnlineMode && state.gameState === GAME_STATES.ONLINE_DISCONNECTED) { ctx.fillStyle='rgba(0,0,0,0.6)'; ctx.fillRect(0,0,WORLD.width,WORLD.height); ctx.fillStyle='#fff'; ctx.font='bold 32px system-ui'; ctx.fillText('ONLINE DISCONNECTED', 220, 250); }
  if (state.gameState === GAME_STATES.SHOP) drawShop();
  if (debug) { ctx.fillStyle = '#22c55e'; ctx.font = '14px monospace'; ctx.fillText(`tick:${state.tick} objs:${frame.objects.length} state:${state.gameState} mode:${state.variant}`, 10, WORLD.height - 12); }
}

function frame(now) {
  const elapsed = Math.min(100, now - last); last = now;
  if (!paused && state.gameState === GAME_STATES.PLAYING) {
    accumulator += elapsed;
    while (accumulator >= FIXED_DT_MS) { stepGame(state, queued, FIXED_DT_MS); queued = []; accumulator -= FIXED_DT_MS; }
  } else if (queued.length) { stepGame(state, queued, FIXED_DT_MS); queued = []; }
  draw(getRenderableFrame(state)); requestAnimationFrame(frame);
}

window.addEventListener('keydown', (e) => {
  if (state.playerCount === 1) {
    if (e.key === 'ArrowDown' || e.key === ' ') queue(1, 'fire');
    if (e.key === 'ArrowUp' || e.key === 'd' || e.key === 'D') queue(1, 'dynamite');
  } else {
    if (e.key === 's' || e.key === 'S') queue(1, 'fire');
    if (e.key === 'w' || e.key === 'W') queue(1, 'dynamite');
    if (e.key === 'ArrowDown') queue(2, 'fire');
    if (e.key === 'ArrowUp') queue(2, 'dynamite');
  }
  if (e.key === 'p' || e.key === 'P') paused = !paused;
  if (e.key === 'r' || e.key === 'R') state = createGame(baseConfig(state.seed));
  if (state.gameState === GAME_STATES.SHOP && e.key === 'Enter') startNextLevel(state);
  if (state.gameState === GAME_STATES.SHOP && /^[1-6]$/.test(e.key)) {
    const ids = Object.keys(state.shop.prices ?? {});
    buyShopItem(state, ids[Number(e.key) - 1], 1);
  }
});

window.__goldMinerTest = {
  step(ticks = 1) { for (let i = 0; i < ticks; i++) stepGame(state, [], FIXED_DT_MS); },
  press(playerId, action, value) { applyInput(state, { playerId, action, value }); },
  runReplay(frames = [], maxTicks = 3600) { return runReplay({ seed: state.seed, mode: state.mode, variant: state.variant, frames, maxTicks }); },
  getState() { return JSON.parse(JSON.stringify(state)); },
  getChecksum() { return checksumState(state); },
  setSeed(seed) { state = createGame(baseConfig(seed)); },
  reset(config = {}) { state = createGame({ ...baseConfig(config.seed ?? state.seed), ...config }); }
};

requestAnimationFrame(frame);
