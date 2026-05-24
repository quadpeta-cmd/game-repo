import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function checkSyntax(path) {
  const res = spawnSync('node', ['--check', path], { stdio: 'pipe', encoding: 'utf8' });
  assert(res.status === 0, `Syntax check failed for ${path}: ${res.stderr || res.stdout}`);
}

function checkHtmlContains(path, requiredSnippets) {
  const html = readFileSync(path, 'utf8');
  requiredSnippets.forEach((snippet) => {
    assert(html.includes(snippet), `${path} missing required snippet: ${snippet}`);
  });
}

function checkNginxMimeConfig(path) {
  const conf = readFileSync(path, 'utf8');
  assert(
    conf.includes('include /etc/nginx/mime.types;'),
    `${path} must include /etc/nginx/mime.types; to preserve default MIME mappings (e.g. text/css)`
  );
}

function run() {
  checkNginxMimeConfig('nginx.conf');

  checkHtmlContains('apps/web/public/games/pong-solo/index.html', [
    'canvas id="game"',
    'script type="module" src="./main.js"',
  ]);
  checkSyntax('apps/web/public/games/pong-solo/main.js');

  checkHtmlContains('apps/web/public/games/dodger/index.html', [
    'canvas id="game"',
    'function loop(',
    'LEVEL_SECONDS',
    '<script>',
    'function initialEnemyShotCooldownRange(level)',
  ]);

  checkHtmlContains('apps/web/public/games/pong-online/index.html', [
    'id="create-room"',
    'id="join-room"',
    'id="pattern-select"',
    'script src="./main.js"',
  ]);
  checkSyntax('apps/web/public/games/pong-online/main.js');
  checkSyntax('apps/web/public/games/pong-online/game-logic.mjs');

  console.log('PASS game runtime smoke checks');
}

run();
