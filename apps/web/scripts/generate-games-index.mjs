import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const gamesDir = path.resolve(__dirname, '../public/games');
const indexFile = path.join(gamesDir, 'index.json');

async function generateGamesIndex() {
  const entries = await readdir(gamesDir, { withFileTypes: true });

  const gameIds = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const manifestPath = path.join(gamesDir, entry.name, 'manifest.json');

        try {
          const manifestRaw = await readFile(manifestPath, 'utf-8');
          const manifest = JSON.parse(manifestRaw);
          return typeof manifest.id === 'string' ? manifest.id : entry.name;
        } catch {
          return null;
        }
      })
  );

  const normalizedGameIds = gameIds
    .filter((id) => Boolean(id))
    .sort((a, b) => a.localeCompare(b));

  await writeFile(indexFile, JSON.stringify(normalizedGameIds, null, 2) + '\n', 'utf-8');

  console.log(`Generated ${path.relative(process.cwd(), indexFile)} with ${normalizedGameIds.length} game(s).`);
}

generateGamesIndex().catch((error) => {
  console.error('Failed to generate games index.', error);
  process.exitCode = 1;
});
