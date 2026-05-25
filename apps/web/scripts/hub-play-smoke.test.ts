import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import { App } from '../src/App';

const TEST_DIR = fileURLToPath(new URL('.', import.meta.url));
const PUBLIC_DIR = join(TEST_DIR, '..', 'public');

async function flush() {
  await new Promise((r) => setTimeout(r, 0));
}

async function readPublicJson(pathname: string): Promise<unknown> {
  const raw = await readFile(join(PUBLIC_DIR, pathname), 'utf8');
  return JSON.parse(raw) as unknown;
}

async function waitFor<T>(getValue: () => T | null | undefined, timeoutMs = 1000): Promise<T> {
  const end = Date.now() + timeoutMs;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const value = getValue();
    if (value) return value;
    if (Date.now() > end) throw new Error('Timed out waiting for expected UI state');
    await flush();
  }
}

test('hub play click reaches Gold Miner iframe and references a renderable game entry file', async () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'http://localhost/',
  });

  globalThis.window = dom.window as unknown as typeof window;
  globalThis.document = dom.window.document;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Node = dom.window.Node;
  Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });

  globalThis.fetch = async (url) => {
    const u = String(url);

    if (u.includes('/games/index.json')) {
      return new Response(JSON.stringify(['pong-solo', 'gold-miner']), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    const manifestMatch = u.match(/\/games\/([^/]+)\/manifest\.json/);
    if (manifestMatch) {
      const manifest = await readPublicJson(`games/${manifestMatch[1]}/manifest.json`);
      return new Response(JSON.stringify(manifest), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    return new Response('not found', { status: 404 });
  };

  const container = document.getElementById('root');
  assert.ok(container, 'Root container should exist');
  const root = createRoot(container);

  await act(async () => {
    root.render(React.createElement(MemoryRouter, { initialEntries: ['/'] }, React.createElement(App)));
    await flush();
    await flush();
  });

  const goldPlayLink = await waitFor(() => document.querySelector('a[href="/play/gold-miner"]') as HTMLAnchorElement | null);
  assert.ok(goldPlayLink, 'Gold Miner Play link should exist in catalog');

  await act(async () => {
    goldPlayLink.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    await flush();
    await flush();
  });

  const iframe = await waitFor(() => document.querySelector('iframe.game-frame') as HTMLIFrameElement | null);
  assert.ok(iframe, 'Play page iframe should render after clicking Play');
  assert.equal(iframe.getAttribute('sandbox'), 'allow-scripts allow-pointer-lock');
  assert.equal(iframe.getAttribute('referrerpolicy'), 'no-referrer');

  const src = iframe.getAttribute('src') || '';
  assert.ok(src.startsWith('/games/gold-miner/index.html'), `Expected gold miner iframe src, got ${src}`);

  const srcPath = src.split('?')[0].replace(/^\//, '');
  const gameEntryHtml = await readFile(join(PUBLIC_DIR, srcPath), 'utf8');
  assert.match(gameEntryHtml, /<canvas[^>]*id="game"/i, 'Gold Miner entry should include a game canvas');
  assert.match(gameEntryHtml, /<script[^>]*src="\.\/main\.bundle\.js"/i, 'Gold Miner entry should load the bundled game runtime');

  root.unmount();
});
