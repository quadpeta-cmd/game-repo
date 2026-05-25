import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { loadManifest, type GameManifest } from '../lib/games';

export function PlayPage() {
  const { gameId } = useParams<{ gameId: string }>();
  const location = useLocation();
  const [manifest, setManifest] = useState<GameManifest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    if (!gameId || !manifest) {
      return;
    }

    type GameHubRequest = {
      kind: 'GameHub.request';
      requestId: string;
      type: 'storage';
      payload: {
        action: 'get' | 'set' | 'remove' | 'clear';
        key?: string;
        value?: string;
      };
    };

    type GameHubResponse = {
      kind: 'GameHub.response';
      requestId: string;
      ok: boolean;
      result?: unknown;
      error?: string;
    };

    const sendResponse = (
      source: WindowProxy,
      requestId: string,
      response: Omit<GameHubResponse, 'kind' | 'requestId'>,
    ) => {
      const payload: GameHubResponse = {
        kind: 'GameHub.response',
        requestId,
        ...response,
      };
      source.postMessage(payload, '*');
    };

    const hasStoragePermission = manifest.permissions?.storage === true;
    const storagePrefix = `gamehub:${gameId}:`;
    const namespacedKey = (key: string) => `${storagePrefix}${key}`;

    const onMessage = (event: MessageEvent<unknown>) => {
      const frameWindow = iframeRef.current?.contentWindow;

      if (!frameWindow || event.source !== frameWindow) {
        return;
      }

      const data = event.data;
      if (!data || typeof data !== 'object') {
        return;
      }

      const request = data as Partial<GameHubRequest>;
      if (
        request.kind !== 'GameHub.request' ||
        request.type !== 'storage' ||
        typeof request.requestId !== 'string' ||
        !request.payload ||
        typeof request.payload !== 'object'
      ) {
        return;
      }

      if (!hasStoragePermission) {
        sendResponse(frameWindow, request.requestId, {
          ok: false,
          error: 'Permission denied: storage',
        });
        return;
      }

      const payload = request.payload as GameHubRequest['payload'];
      const action = payload.action;

      if (!action) {
        sendResponse(frameWindow, request.requestId, {
          ok: false,
          error: 'Missing storage action',
        });
        return;
      }

      if ((action === 'get' || action === 'set' || action === 'remove') && typeof payload.key !== 'string') {
        sendResponse(frameWindow, request.requestId, {
          ok: false,
          error: 'Storage key must be a string',
        });
        return;
      }

      if (action === 'set' && typeof payload.value !== 'string') {
        sendResponse(frameWindow, request.requestId, {
          ok: false,
          error: 'Storage value must be a string',
        });
        return;
      }

      if (action === 'get') {
        const { key } = payload;
        if (typeof key !== 'string') {
          sendResponse(frameWindow, request.requestId, {
            ok: false,
            error: 'Storage key must be a string',
          });
          return;
        }

        sendResponse(frameWindow, request.requestId, {
          ok: true,
          result: localStorage.getItem(namespacedKey(key)),
        });
        return;
      }

      if (action === 'set') {
        const { key, value } = payload;
        if (typeof key !== 'string' || typeof value !== 'string') {
          sendResponse(frameWindow, request.requestId, {
            ok: false,
            error: 'Storage key and value must be strings',
          });
          return;
        }

        localStorage.setItem(namespacedKey(key), value);
        sendResponse(frameWindow, request.requestId, { ok: true, result: true });
        return;
      }

      if (action === 'remove') {
        const { key } = payload;
        if (typeof key !== 'string') {
          sendResponse(frameWindow, request.requestId, {
            ok: false,
            error: 'Storage key must be a string',
          });
          return;
        }

        localStorage.removeItem(namespacedKey(key));
        sendResponse(frameWindow, request.requestId, { ok: true, result: true });
        return;
      }

      if (action === 'clear') {
        const keysToRemove: string[] = [];

        for (let i = 0; i < localStorage.length; i += 1) {
          const key = localStorage.key(i);
          if (key?.startsWith(storagePrefix)) {
            keysToRemove.push(key);
          }
        }

        keysToRemove.forEach((key) => localStorage.removeItem(key));
        sendResponse(frameWindow, request.requestId, { ok: true, result: true });
        return;
      }

      sendResponse(frameWindow, request.requestId, {
        ok: false,
        error: `Unsupported storage action: ${String(action)}`,
      });
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [gameId, manifest]);

  useEffect(() => {
    if (!gameId) {
      setError('Missing game id.');
      return;
    }

    loadManifest(gameId)
      .then((nextManifest) => {
        setManifest(nextManifest);
        setError(null);
      })
      .catch((err: unknown) => {
        setManifest(null);
        setError(err instanceof Error ? err.message : 'Unknown game load error');
      });
  }, [gameId]);

  if (error) {
    return (
      <section>
        <p className="error">{error}</p>
        <Link to="/">Back to catalog</Link>
      </section>
    );
  }

  if (!manifest || !gameId) {
    return <p>Loading game…</p>;
  }

  const gameSrc = new URL(
    `games/${gameId}/${manifest.entry}${location.search}`,
    window.location.origin,
  ).toString();

  return (
    <section className="play-page">
      <div className="play-page-header">
        <h2>{manifest.name}</h2>
        <Link to="/">Back to catalog</Link>
      </div>
      <iframe
        ref={iframeRef}
        title={manifest.name}
        src={gameSrc}
        sandbox="allow-scripts allow-pointer-lock"
        referrerPolicy="no-referrer"
        className="game-frame"
      />
    </section>
  );
}
