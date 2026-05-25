import test from 'node:test';
import assert from 'node:assert/strict';

function makeCtx() {
  return {
    fillStyle: '',
    font: '',
    lineWidth: 1,
    clearRect() {}, fillRect() {}, fillText() {}, beginPath() {}, arc() {}, fill() {}, stroke() {}, moveTo() {}, lineTo() {},
  };
}

test('gold-miner main bootstraps and schedules first render frame', async () => {
  let rafScheduled = false;
  const ctx = makeCtx();
  const canvas = {
    width: 800,
    height: 600,
    getContext: () => ctx,
  };

  globalThis.performance = { now: () => 0 };
  globalThis.requestAnimationFrame = () => { rafScheduled = true; return 1; };
  globalThis.Image = class MockImage {
    constructor() {
      this.complete = false;
      this.src = '';
    }

    addEventListener() {}
  };
  class MockAudioContext {
    constructor() {
      this.currentTime = 0;
      this.state = 'running';
      this.destination = {};
    }

    createOscillator() {
      return { type: 'sine', frequency: { setValueAtTime() {} }, connect() { return this; }, start() {}, stop() {} };
    }

    createGain() {
      return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() { return this; } };
    }

    resume() { this.state = 'running'; }
  }
  globalThis.window = {
    location: { search: '', protocol: 'http:', hostname: 'localhost', reload() {} },
    addEventListener() {},
    AudioContext: MockAudioContext,
    webkitAudioContext: MockAudioContext,
    __goldMinerTest: undefined,
  };
  globalThis.document = {
    getElementById(id) {
      if (id === 'game') return canvas;
      return null;
    },
  };

  await import(`../main.js?test_render=${Date.now()}`);

  assert.equal(typeof window.__goldMinerTest?.getState, 'function');
  assert.equal(rafScheduled, true);
});
