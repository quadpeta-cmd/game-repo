export const GAME_WIDTH = 800;
export const GAME_HEIGHT = 500;
export const PADDLE_HEIGHT = 90;

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

export function nextBotInput() {
  return Math.random() < 0.5 ? -1 : 1;
}
