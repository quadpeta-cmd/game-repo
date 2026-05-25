import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import { App } from '../src/App';

async function flush() {
  await new Promise((r) => setTimeout(r, 0));
}

test('hub catalog Play click navigates to gold miner play route and renders iframe', async () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'http://localhost/',
  });

  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Node = dom.window.Node;
  Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });

  const manifests = [
    { id: 'pong-solo', name: 'Pong Solo', description: 'desc', entry: 'index.html', permissions: [] },
    { id: 'gold-miner', name: 'Gold Miner', description: 'desc', entry: 'index.html', permissions: [] },
  ];

  globalThis.fetch = async (url) => {
    if (String(url).includes('/games/index.json')) {
      return new Response(JSON.stringify(['pong-solo', 'gold-miner']), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (String(url).includes('/games/gold-miner/manifest.json')) {
      return new Response(JSON.stringify(manifests[1]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (String(url).includes('/games/pong-solo/manifest.json')) {
      return new Response(JSON.stringify(manifests[0]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response('not found', { status: 404 });
  };

  const container = document.getElementById('root');
  const root = createRoot(container);

  await act(async () => {
    root.render(
      React.createElement(MemoryRouter, { initialEntries: ['/'] }, React.createElement(App))
    );
    await flush();
    await flush();
  });

  const links = [...document.querySelectorAll('a')];
  const goldPlayLink = links.find((a) => a.getAttribute('href') === '/play/gold-miner');
  assert.ok(goldPlayLink, 'Gold Miner Play link should exist in catalog');

  await act(async () => {
    goldPlayLink.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    await flush();
    await flush();
  });

  const iframe = document.querySelector('iframe.game-frame');
  assert.ok(iframe, 'Play page iframe should render after clicking Play');
  assert.equal(iframe.getAttribute('sandbox'), 'allow-scripts allow-pointer-lock');
  assert.equal(iframe.getAttribute('referrerpolicy'), 'no-referrer');
  const src = iframe.getAttribute('src') || '';
  assert.ok(src.startsWith('/games/gold-miner/index.html'), `Expected gold miner iframe src, got ${src}`);

  root.unmount();
});
