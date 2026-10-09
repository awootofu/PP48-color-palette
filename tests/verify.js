/**
 * End-to-end verification for the PP48 Color Palette Identifier.
 *
 * Drives the real page in Chromium (real canvas, real Color Thief build) and
 * asserts the two required features plus the colour accuracy of the output.
 *
 * One-time setup:
 *   npm install
 *   npx playwright install chromium
 *
 * Run (the page must be served over http:// — file:// blocks canvas reads):
 *   npx http-server .. -p 8787      # or: python -m http.server 8787
 *   node verify.js http://127.0.0.1:8787/
 *
 * Optional: PW_CHROME=/path/to/chrome.exe to use a specific browser build.
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright-core');

const BASE = process.argv[2] || 'http://127.0.0.1:8787/';
const ROOT = path.join(__dirname, '..');
const SAMPLES = path.join(ROOT, 'images', 'samples');
const SHOTS = path.join(__dirname, 'shots');

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok });
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (detail !== undefined ? '  ->  ' + detail : ''));
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });

  const launchOpts = { args: ['--no-sandbox', '--disable-dev-shm-usage'] };
  if (process.env.PW_CHROME) launchOpts.executablePath = process.env.PW_CHROME;

  const browser = await chromium.launch(launchOpts);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = await ctx.newPage();

  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await page.goto(BASE, { waitUntil: 'load' });

  check('library: ColorThief global loaded from vendor/',
        await page.evaluate(() => typeof window.ColorThief === 'function'));
  check('feature 1: image sources offered',
        (await page.locator('.sample').count()) === 4);

  // Requirement 2: selecting an image identifies the palette automatically.
  await page.locator('.sample').nth(3).click();          // deterministic color blocks
  await page.waitForFunction(
    () => document.querySelectorAll('#palette .swatch').length > 0, null, { timeout: 20000 });

  const dominant = await page.locator('#dominant-hex').innerText();
  const status = await page.locator('#status').innerText();
  const swatches = await page.$$eval('#palette .swatch', els => els.map(e => ({
    hex: e.dataset.hex,
    rgb: e.querySelector('.sw-rgb').textContent.trim()
  })));

  check('feature 2: palette identified automatically, without an extra click',
        swatches.length === 8, swatches.length + ' swatches');
  check('feature 2: dominant color reported with its hex code',
        /^#[0-9A-F]{6}$/.test(dominant), dominant);
  check('feature 2: every palette entry carries a valid #RRGGBB hex code',
        swatches.every(s => /^#[0-9A-F]{6}$/.test(s.hex)),
        swatches.map(s => s.hex).join(' '));
  check('feature 2: hex code agrees with the displayed rgb() value',
        swatches.every(s => {
          const m = s.rgb.match(/rgb\((\d+), (\d+), (\d+)\)/);
          return m && '#' + [m[1], m[2], m[3]]
            .map(n => (+n).toString(16).padStart(2, '0').toUpperCase()).join('') === s.hex;
        }), swatches[0].hex + ' = ' + swatches[0].rgb);
  check('feature 2: dominant color is the first palette entry',
        dominant === swatches[0].hex, dominant);
  check('status confirms the automatic extraction',
        /Palette extracted automatically/.test(status));

  // Colours must actually come from the image: compare against a reference
  // palette computed independently in Python (PIL median-cut).
  const ref = JSON.parse(fs.readFileSync(path.join(__dirname, 'reference-palettes.json'), 'utf8'));
  const refColors = ref['color-blocks.png'];
  const near = (hex, list, tol) => list.some(r => {
    const a = hex.slice(1).match(/../g).map(h => parseInt(h, 16));
    const b = r.slice(1).match(/../g).map(h => parseInt(h, 16));
    return a.every((v, i) => Math.abs(v - b[i]) <= tol);
  });
  const matched = swatches.filter(s => near(s.hex, refColors, 40)).length;
  check('feature 2: extracted colors correspond to the colors in the image',
        matched >= 6, matched + '/' + swatches.length + ' within tolerance of the reference');

  // Changing the number of colors re-runs the identification automatically.
  await page.locator('#count').fill('4');
  await page.locator('#count').dispatchEvent('change');
  await page.waitForFunction(
    () => document.querySelectorAll('#palette .swatch').length === 4, null, { timeout: 10000 });
  check('feature 2: color-count control re-identifies automatically',
        (await page.locator('#palette .swatch').count()) === 4);

  // Click-to-copy the hex code.
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(BASE).origin });
  await page.locator('#palette .swatch').first().click();
  const firstHex = await page.locator('#palette .swatch').first().getAttribute('data-hex');
  check('feature 2: clicking a swatch copies its hex code',
        (await page.evaluate(() => navigator.clipboard.readText())) === firstHex);

  // Requirement 1: loading from a local image file.
  await page.setInputFiles('#file-input', {
    name: 'sunset.png',
    mimeType: 'image/png',
    buffer: fs.readFileSync(path.join(SAMPLES, 'sunset.png'))
  });
  await page.waitForFunction(
    () => document.querySelector('#meta').textContent.includes('sunset.png'), null, { timeout: 20000 });
  const fileSwatches = await page.$$eval('#palette .swatch', els => els.map(e => e.dataset.hex));
  check('feature 1: loading an image from a local file works',
        fileSwatches.length > 0,
        fileSwatches.length + ' colors: ' + fileSwatches.slice(0, 3).join(' '));

  check('no uncaught page/console errors', errors.length === 0, errors.join(' | '));

  await page.screenshot({ path: path.join(SHOTS, 'app.png'), fullPage: true });
  await browser.close();

  const failed = results.filter(r => !r.ok);
  console.log('\n' + (results.length - failed.length) + '/' + results.length + ' checks passed');
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });