import { GAME_WIDTH, GAME_HEIGHT, PADDLE_HEIGHT, clampPaddle, nextBotInput, resetBallToward } from './game-logic.mjs';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

let state = {
  leftY: GAME_HEIGHT / 2,
  rightY: GAME_HEIGHT / 2,
  ballX: GAME_WIDTH / 2,
  ballY: GAME_HEIGHT / 2,
  ballVX: 280,
  ballVY: 160,
  leftScore: 0,
  rightScore: 0,
};
let keys = { up: false, down: false };
let botInput = 1;
let lastBotFlip = performance.now();
let last = performance.now();

function draw() {
  ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  ctx.fillStyle = '#020617'; ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(20, state.leftY - PADDLE_HEIGHT / 2, 12, PADDLE_HEIGHT);
  ctx.fillRect(GAME_WIDTH - 32, state.rightY - PADDLE_HEIGHT / 2, 12, PADDLE_HEIGHT);
  ctx.beginPath(); ctx.arc(state.ballX, state.ballY, 8, 0, Math.PI * 2); ctx.fill();
}

function tick(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  if (now - lastBotFlip > 400) { botInput = nextBotInput(); lastBotFlip = now; }
  const playerInput = keys.up && !keys.down ? -1 : keys.down && !keys.up ? 1 : 0;
  state.leftY = clampPaddle(state.leftY + playerInput * 350 * dt);
  state.rightY = clampPaddle(state.rightY + botInput * 300 * dt);
  state.ballX += state.ballVX * dt;
  state.ballY += state.ballVY * dt;
  if (state.ballY < 8 || state.ballY > GAME_HEIGHT - 8) state.ballVY *= -1;
  const leftHit = state.ballX < 36 && Math.abs(state.ballY - state.leftY) <= PADDLE_HEIGHT / 2;
  if (leftHit && state.ballVX < 0) state.ballVX *= -1.04;
  const rightHit = state.ballX > GAME_WIDTH - 36 && Math.abs(state.ballY - state.rightY) <= PADDLE_HEIGHT / 2;
  if (rightHit && state.ballVX > 0) state.ballVX *= -1.04;
  if (state.ballX < 0) { state.rightScore += 1; Object.assign(state, resetBallToward('right')); }
  if (state.ballX > GAME_WIDTH) { state.leftScore += 1; Object.assign(state, resetBallToward('left')); }
  draw();
  requestAnimationFrame(tick);
}

window.addEventListener('keydown', (e) => { if (['w', 'W', 'ArrowUp'].includes(e.key)) keys.up = true; if (['s', 'S', 'ArrowDown'].includes(e.key)) keys.down = true; });
window.addEventListener('keyup', (e) => { if (['w', 'W', 'ArrowUp'].includes(e.key)) keys.up = false; if (['s', 'S', 'ArrowDown'].includes(e.key)) keys.down = false; });
requestAnimationFrame(tick);
