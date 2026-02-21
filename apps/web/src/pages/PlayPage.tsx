import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { loadManifest, type GameManifest } from '../lib/games';

export function PlayPage() {
  const { gameId } = useParams<{ gameId: string }>();
  const [manifest, setManifest] = useState<GameManifest | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <section className="play-page">
      <div className="play-page-header">
        <h2>{manifest.name}</h2>
        <Link to="/">Back to catalog</Link>
      </div>
      <iframe
        title={manifest.name}
        src={`/games/${gameId}/${manifest.entry}`}
        sandbox="allow-scripts allow-pointer-lock"
        referrerPolicy="no-referrer"
        className="game-frame"
      />
    </section>
  );
}
