export function buildInviteLink(currentHref, roomCode) {
  const invite = new URL(currentHref);
  invite.searchParams.set('room', roomCode);
  return invite.toString();
}

export function winnerFromOutOfBounds(ballX, gameWidth) {
  if (ballX < 0) return 'right';
  if (ballX > gameWidth) return 'left';
  return null;
}

export function clampPaddleY(y, gameHeight, basePaddleHeight) {
  return Math.max(basePaddleHeight / 2, Math.min(gameHeight - basePaddleHeight / 2, y));
}

export function paddleHeightForEffect(base, effect) {
  if (effect === 'big') return base * 1.45;
  if (effect === 'small') return base * 0.7;
  return base;
}

export function paddleSpeedForEffect(base, effect) {
  return effect === 'speed' ? 480 : base;
}

export function losingSide(leftScore, rightScore, random = 0.4) {
  if (leftScore === rightScore) return random < 0.5 ? 'left' : 'right';
  return leftScore < rightScore ? 'left' : 'right';
}

export function winningSide(leftScore, rightScore, random = 0.4) {
  return losingSide(leftScore, rightScore, random) === 'left' ? 'right' : 'left';
}

export function isMatchWinner(leftScore, rightScore, winScore = 8) {
  if (leftScore >= winScore) return 'left';
  if (rightScore >= winScore) return 'right';
  return null;
}
