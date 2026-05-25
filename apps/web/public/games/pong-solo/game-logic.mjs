export const GAME_WIDTH = 800;
export const GAME_HEIGHT = 500;
export const PADDLE_HEIGHT = 90;
export const PADDLE_WIDTH = 12;
export const PADDLE_MARGIN = 20;
export const BALL_RADIUS = 8;
export const PLAYER_SPEED = 350;
export const BOT_SPEED = 300;
export const WINNING_SCORE = 10;

export function clampPaddle(y) {
  return Math.max(PADDLE_HEIGHT / 2, Math.min(GAME_HEIGHT - PADDLE_HEIGHT / 2, y));
}

export function resetBallToward(winner) {
  return {
    ballX: GAME_WIDTH / 2,
    ballY: GAME_HEIGHT / 2,
    ballVX: winner === 'left' ? -280 : 280,
    ballVY: 160,
  };
}

export function nextBotInput(random = Math.random) {
  return random() < 0.5 ? -1 : 1;
}

export function createInitialState() {
  return {
    leftY: GAME_HEIGHT / 2,
    rightY: GAME_HEIGHT / 2,
    ballX: GAME_WIDTH / 2,
    ballY: GAME_HEIGHT / 2,
    ballVX: 280,
    ballVY: 160,
    leftScore: 0,
    rightScore: 0,
    winner: null,
  };
}

export function getPlayerInput(keys) {
  if (keys.up && !keys.down) return -1;
  if (keys.down && !keys.up) return 1;
  return 0;
}

export function stepGame(state, { dt, playerInput = 0, botInput = 0 }) {
  if (state.winner) return { ...state };
  const next = { ...state };
  next.leftY = clampPaddle(next.leftY + playerInput * PLAYER_SPEED * dt);
  next.rightY = clampPaddle(next.rightY + botInput * BOT_SPEED * dt);

  next.ballX += next.ballVX * dt;
  next.ballY += next.ballVY * dt;

  if (next.ballY < BALL_RADIUS || next.ballY > GAME_HEIGHT - BALL_RADIUS) {
    next.ballVY *= -1;
    next.ballY = Math.max(BALL_RADIUS, Math.min(GAME_HEIGHT - BALL_RADIUS, next.ballY));
  }

  const leftFace = PADDLE_MARGIN + PADDLE_WIDTH + BALL_RADIUS;
  const rightFace = GAME_WIDTH - PADDLE_MARGIN - PADDLE_WIDTH - BALL_RADIUS;
  const leftHit = next.ballX <= leftFace && Math.abs(next.ballY - next.leftY) <= PADDLE_HEIGHT / 2;
  if (leftHit && next.ballVX < 0) next.ballVX *= -1.04;

  const rightHit = next.ballX >= rightFace && Math.abs(next.ballY - next.rightY) <= PADDLE_HEIGHT / 2;
  if (rightHit && next.ballVX > 0) next.ballVX *= -1.04;

  if (next.ballX < 0) {
    next.rightScore += 1;
    Object.assign(next, resetBallToward('right'));
  } else if (next.ballX > GAME_WIDTH) {
    next.leftScore += 1;
    Object.assign(next, resetBallToward('left'));
  }

  if (next.leftScore >= WINNING_SCORE) next.winner = 'player';
  if (next.rightScore >= WINNING_SCORE) next.winner = 'bot';

  return next;
}
