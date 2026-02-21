import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { CatalogPage } from './pages/CatalogPage';
import { PlayPage } from './pages/PlayPage';

export function App() {
  return (
    <div className="app-shell">
      <header>
        <h1>Game Hub MVP</h1>
        <nav>
          <Link to="/">Catalog</Link>
        </nav>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<CatalogPage />} />
          <Route path="/play/:gameId" element={<PlayPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
