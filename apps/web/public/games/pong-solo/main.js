import {
  BALL_RADIUS,
  GAME_HEIGHT,
  GAME_WIDTH,
  PADDLE_HEIGHT,
  PADDLE_MARGIN,
  PADDLE_WIDTH,
  createInitialState,
  getPlayerInput,
  nextBotInput,
  stepGame,
} from './game-logic.mjs';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

let state = createInitialState();
let keys = { up: false, down: false };
let botInput = 1;
let lastBotFlip = performance.now();
let last = performance.now();

function drawCenterLine() {
  ctx.fillStyle = '#1e293b';
  for (let y = 0; y < GAME_HEIGHT; y += 24) {
    ctx.fillRect(GAME_WIDTH / 2 - 2, y, 4, 14);
  }
}

function drawHud() {
  ctx.fillStyle = '#e2e8f0';
  ctx.font = '24px system-ui, sans-serif';
  ctx.fillText(`Player ${state.leftScore}`, 120, 36);
  ctx.fillText(`Bot ${state.rightScore}`, GAME_WIDTH - 210, 36);

  if (state.winner) {
    ctx.font = 'bold 38px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(state.winner === 'player' ? 'You Win!' : 'Bot Wins!', GAME_WIDTH / 2, GAME_HEIGHT / 2 - 6);
    ctx.font = '20px system-ui, sans-serif';
    ctx.fillText('Press R to restart', GAME_WIDTH / 2, GAME_HEIGHT / 2 + 28);
    ctx.textAlign = 'left';
  }
}

function draw() {
  ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  ctx.fillStyle = '#020617';
  ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

  drawCenterLine();

  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(PADDLE_MARGIN, state.leftY - PADDLE_HEIGHT / 2, PADDLE_WIDTH, PADDLE_HEIGHT);
  ctx.fillRect(GAME_WIDTH - PADDLE_MARGIN - PADDLE_WIDTH, state.rightY - PADDLE_HEIGHT / 2, PADDLE_WIDTH, PADDLE_HEIGHT);
  ctx.beginPath();
  ctx.arc(state.ballX, state.ballY, BALL_RADIUS, 0, Math.PI * 2);
  ctx.fill();

  drawHud();
}

function tick(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  if (!state.winner && now - lastBotFlip > 400) {
    botInput = nextBotInput();
    lastBotFlip = now;
  }
  const playerInput = getPlayerInput(keys);
  state = stepGame(state, { dt, playerInput, botInput });
  draw();
  requestAnimationFrame(tick);
}

window.addEventListener('keydown', (e) => {
  if (['w', 'W', 'ArrowUp'].includes(e.key)) keys.up = true;
  if (['s', 'S', 'ArrowDown'].includes(e.key)) keys.down = true;
  if ((e.key === 'r' || e.key === 'R') && state.winner) state = createInitialState();
});
window.addEventListener('keyup', (e) => {
  if (['w', 'W', 'ArrowUp'].includes(e.key)) keys.up = false;
  if (['s', 'S', 'ArrowDown'].includes(e.key)) keys.down = false;
});
requestAnimationFrame(tick);
