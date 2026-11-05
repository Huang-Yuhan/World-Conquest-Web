import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { chromium } from 'playwright';

const host = 'http://127.0.0.1:4173/World-Conquest-Web/';
const server = spawn(process.execPath, ['./node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '4173', '--strictPort'], {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: process.env,
});
server.stdout.on('data', data => process.stdout.write(data));
server.stderr.on('data', data => process.stderr.write(data));

let browser;
try {
  let responding = false;
  for (let i = 0; i < 80; i++) {
    if (server.exitCode !== null) throw new Error('Vite preview exited early');
    try {
      responding = (await fetch(host)).ok;
      if (responding) break;
    } catch {}
    await sleep(250);
  }
  assert.ok(responding, 'Vite preview not responding');

  browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', error => errors.push('pageerror: ' + error.stack));
  page.on('console', message => { if (message.type() === 'error') errors.push('console: ' + message.text()); });
  page.on('requestfailed', request => errors.push('requestfailed: ' + request.url() + ' ' + request.failure()?.errorText));
  page.on('response', response => { if (response.status() >= 400) errors.push('HTTP ' + response.status() + ': ' + response.url()); });
  await page.goto(host, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2500);

  const canvas = await page.locator('.map-canvas canvas').first().count();
  assert.equal(canvas, 1, 'PixiJS canvas missing');
  const dims = await page.locator('.map-canvas canvas').first().evaluate(c => ({ width: c.width, height: c.height }));
  assert.ok(dims.width > 100 && dims.height > 100, 'PixiJS canvas has invalid dimensions');
  console.log('Canvas dimensions:', dims, 'Errors:', errors);

  // Screenshot and sample pixels in Chromium so a rendered Canvas is tested,
  // rather than merely asserting DOM node existence.
  const screenshot = await page.screenshot({ animations: 'disabled' });
  const colors = await page.evaluate(async encoded => {
    const image = new Image();
    image.src = 'data:image/png;base64,' + encoded;
    await image.decode();
    const c = document.createElement('canvas');
    c.width = image.naturalWidth;
    c.height = image.naturalHeight;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('2D screenshot readback not available');
    ctx.drawImage(image, 0, 0);
    const result = new Set();
    for (let y = 80; y < c.height - 80; y += 40) {
      for (let x = 80; x < c.width - 80; x += 40) {
        const rgba = ctx.getImageData(x, y, 1, 1).data;
        result.add([Math.round(rgba[0] / 16), Math.round(rgba[1] / 16), Math.round(rgba[2] / 16)].join(','));
      }
    }
    return result.size;
  }, screenshot.toString('base64'));
  console.log('Screenshot approximate distinct RGB colors:', colors);
  assert.ok(colors > 8, 'Canvas looks blank: screenshot has too few color variations');
  assert.deepEqual(errors, [], 'Browser had runtime or asset errors');

  // Exercise actual PixiJS map picking, movement range highlight and moving
  // one unit. Coordinates are derived from the loaded map's axial grid.
  const definition = JSON.parse(readFileSync(
    new URL('../public/maps/asteria/map.json', import.meta.url), 'utf8',
  ));
  const g = definition.grid;
  const fit = Math.min((1280 - 24) / g.worldWidth, (800 - 24) / g.worldHeight);
  const cameraX = (1280 - g.worldWidth * fit) / 2;
  const cameraY = (800 - g.worldHeight * fit) / 2;
  const screen = (q, r) => ({
    x: cameraX + (g.originX + Math.sqrt(3) * g.radius * (q + r / 2)) * fit,
    y: cameraY + (g.originY + 1.5 * g.radius * r) * fit,
  });
  const screenshotBeforeClick = await page.screenshot({ animations: 'disabled' });
  await page.mouse.click(screen(6, 5).x, screen(6, 5).y); // Aurelia infantry
  await page.waitForTimeout(180);
  const screenshotAfterSelection = await page.screenshot({ animations: 'disabled' });
  assert.notDeepEqual(screenshotAfterSelection, screenshotBeforeClick,
    'Selecting a ground unit must visibly highlight reachable Hexes');
  await page.mouse.click(screen(5, 5).x, screen(5, 5).y); // adjacent empty land
  await page.waitForTimeout(180);
  const screenshotAfterMove = await page.screenshot({ animations: 'disabled' });
  assert.notDeepEqual(screenshotAfterMove, screenshotAfterSelection,
    'Clicking a reachable Hex must move the selected unit');
  assert.deepEqual(errors, [], 'Browser movement interaction caused an error');
  console.log('Ground unit selection and click-to-move changed the rendered map');


  const failing = await browser.newPage({ viewport: { width: 1000, height: 700 } });
  await failing.goto(host + '?scenario=does-not-exist', { waitUntil: 'domcontentloaded' });
  await failing.getByRole('alert').waitFor({ timeout: 12000 });
  assert.match(await failing.getByRole('alert').innerText(), /地图加载失败/);
  console.log('Missing scenario displays a visible error instead of a blank screen');
  await failing.close();
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
