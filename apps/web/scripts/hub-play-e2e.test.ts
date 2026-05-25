import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const BASE_URL = process.env.HUB_E2E_BASE_URL ?? 'http://127.0.0.1:4173';

async function waitForPreviewReady(preview: ReturnType<typeof spawn>, timeoutMs = 20000) {
  let stdout = '';
  let stderr = '';

  preview.stdout?.on('data', (chunk) => {
    stdout += chunk.toString();
  });

  preview.stderr?.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  const started = await new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs);

    const onData = (chunk: Buffer) => {
      const line = chunk.toString();
      if (line.includes('Local:') || line.includes('ready in')) {
        clearTimeout(timer);
        resolve(true);
      }
    };

    preview.stdout?.on('data', onData);
    preview.stderr?.on('data', onData);
    preview.once('exit', () => {
      clearTimeout(timer);
      resolve(false);
    });
  });

  return { started, stdout, stderr };
}

test('gold miner loads in sandbox iframe without module/CORS runtime errors', async () => {
  const preview = spawn('npm', ['run', 'preview', '--', '--host', '127.0.0.1', '--port', '4173'], {
    cwd: new URL('..', import.meta.url).pathname,
    stdio: 'pipe',
  });

  let browser;
  const { started, stdout, stderr } = await waitForPreviewReady(preview);

  try {
    assert.ok(started, `preview server did not start\nstdout:\n${stdout}\nstderr:\n${stderr}`);

    try {
      browser = await chromium.launch();
    } catch (error) {
      const details = error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error);
      throw new Error(
        `Playwright Chromium failed to launch. Install browser binaries with 'npx playwright install chromium'.\n${details}`,
      );
    }

    const page = await browser.newPage();
    const errors: string[] = [];
    const assetResponses = new Map<string, number>();
    const assetRequestFailures: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    page.on('response', (response) => {
      const url = response.url();
      if (url.includes('/games/gold-miner/assets/')) {
        assetResponses.set(url, response.status());
      }
    });

    page.on('requestfailed', (request) => {
      const url = request.url();
      if (url.includes('/games/gold-miner/assets/')) {
        assetRequestFailures.push(`${url} :: ${request.failure()?.errorText ?? 'unknown failure'}`);
      }
    });

    await page.goto(`${BASE_URL}/play/gold-miner`, { waitUntil: 'domcontentloaded' });
    const frameHandle = await page.waitForSelector('iframe.game-frame');
    const frame = await frameHandle.contentFrame();
    assert.ok(frame, 'expected game iframe content frame');
    await frame.waitForSelector('canvas#game');
    await page.waitForTimeout(1000);

    assert.equal(assetRequestFailures.length, 0, `asset requests failed: ${assetRequestFailures.join('; ')}`);
    assert.ok(assetResponses.size >= 6, `expected at least 6 gold-miner asset responses, got ${assetResponses.size}`);
    for (const [url, status] of assetResponses.entries()) {
      assert.ok(status >= 200 && status < 400, `asset response not ok: ${url} -> ${status}`);
    }


    const blocked = errors.find((text) =>
      /CORS|ERR_FAILED|Unsafe attempt to load URL|blocked by CORS policy/i.test(text),
    );
    assert.equal(blocked, undefined, `unexpected runtime error: ${blocked}`);
  } finally {
    if (browser) {
      await browser.close();
    }

    preview.kill('SIGTERM');
  }
});
