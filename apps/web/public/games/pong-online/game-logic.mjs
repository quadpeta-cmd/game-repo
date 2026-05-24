export function buildInviteLink(currentHref, roomCode) {
  const invite = new URL(currentHref);
  invite.searchParams.set('room', roomCode);
  return invite.toString();
}

export function resolveSignalingUrl({ currentUrl, baseUri, override }) {
  if (override) return override;
  const protocol = new URL(currentUrl).protocol === 'https:' ? 'wss:' : 'ws:';

  const resolveCodespacesHost = (host) => {
    const codespacesMatch = host.match(/^(.*)-(\d+)\.app\.github\.dev$/);
    if (!codespacesMatch) return null;
    return `${codespacesMatch[1]}-8787.app.github.dev`;
  };

  const fromUrl = (rawUrl) => {
    try {
      const base = new URL(rawUrl);
      if (!base.hostname) return null;
      const codespacesLikeHost = base.hostname.match(/^(.*)-(\d+)\.app\.github\.dev$/);
      if (codespacesLikeHost) {
        base.hostname = `${codespacesLikeHost[1]}-8787.app.github.dev`;
        base.port = '';
      } else {
        base.port = '8787';
      }
      base.protocol = protocol;
      const codespacesHost = resolveCodespacesHost(base.host);
      if (codespacesHost) {
        base.host = codespacesHost;
        base.port = '';
      } else {
        base.port = '8787';
      }
      base.pathname = '';
      base.search = '';
      base.hash = '';
      return base.toString().replace(/\/$/, '');
    } catch {
      return null;
    }
  };

  return fromUrl(currentUrl) || fromUrl(baseUri) || `${protocol}//localhost:8787`;
}

export function generateRoomCode(randomValues) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(randomValues, (value) => alphabet[value % alphabet.length]).join('');
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

export function shouldSuppressSocketCloseMessage({ suppressNextSocketCloseMessage, socketCloseCode }) {
  return Boolean(suppressNextSocketCloseMessage && socketCloseCode === 1000);
}


export function messageForSocketClose({ closeCode, signalingUrl, diagnosis }) {
  if (closeCode === 1006) {
    if (diagnosis?.reachable) {
      return `Signaling dropped unexpectedly (1006). Server ${diagnosis.probeUrl} is reachable, so check signaling server logs for socket errors and then retry create/join.`;
    }

    return `Signaling dropped unexpectedly (1006). Could not reach signaling host at ${signalingUrl} — start/restart signaling and retry create/join.`;
  }

  return `Signaling connection closed (code ${closeCode || 'unknown'}). Retry create/join.`;
}
