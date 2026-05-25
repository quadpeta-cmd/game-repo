import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const TEST_DIR = fileURLToPath(new URL('.', import.meta.url));
const DIST_DIR = join(TEST_DIR, '..', 'dist');

async function fileExists(pathname: string): Promise<boolean> {
  try {
    await access(pathname, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

test('built hub includes Gold Miner playable entry in dist output', async () => {
  const builtGameEntry = join(DIST_DIR, 'games', 'gold-miner', 'index.html');
  const hasBuiltOutput = await fileExists(builtGameEntry);

  assert.ok(
    hasBuiltOutput,
    'Missing dist/games/gold-miner/index.html. Run `npm run build` before this smoke test.',
  );

  const gameEntryHtml = await readFile(builtGameEntry, 'utf8');
  assert.match(gameEntryHtml, /<canvas[^>]*id="game"/i, 'Built Gold Miner entry should include game canvas');
  assert.match(
    gameEntryHtml,
    /<script[^>]*type="module"[^>]*src="\.\/main\.js"/i,
    'Built Gold Miner entry should load runtime module',
  );
});
