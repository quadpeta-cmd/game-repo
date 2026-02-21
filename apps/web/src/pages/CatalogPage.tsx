import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { gameIds, loadManifest, type GameManifest } from '../lib/games';

export function CatalogPage() {
  const [games, setGames] = useState<GameManifest[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all(gameIds.map((id) => loadManifest(id)))
      .then((result) => setGames(result))
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'Unknown catalog error')
      );
  }, []);

  if (error) {
    return <p className="error">Failed to load catalog: {error}</p>;
  }

  if (games.length === 0) {
    return <p>Loading games…</p>;
  }

  return (
    <section>
      <h2>Catalog</h2>
      <ul className="game-list">
        {games.map((game) => (
          <li key={game.id}>
            <h3>{game.name}</h3>
            <p>{game.description}</p>
            <Link to={`/play/${game.id}`}>Play</Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
