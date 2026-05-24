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
