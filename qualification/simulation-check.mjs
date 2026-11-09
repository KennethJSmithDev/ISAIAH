import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const root = resolve(process.env.ISAIAH_SIMULATION_DIR || 'simulation-dist');
const evidence = resolve(process.env.ISAIAH_MOBILE_EVIDENCE || '.local/mobile-evidence');
await mkdir(evidence, { recursive: true });
const server = createServer(async (req, res) => {
  const prefix = '/ISAIAH/';
  const path = new URL(req.url, 'http://localhost').pathname;
  if (req.method !== 'GET' || !path.startsWith(prefix)) { res.writeHead(404).end(); return; }
  const name = path.slice(prefix.length) || 'index.html';
  if (!['index.html', 'app.css', 'app.js', 'provider.js', 'teaching.js'].includes(name)) { res.writeHead(404).end(); return; }
  try { const body = await readFile(resolve(root, name)); res.writeHead(200, { 'Content-Type': name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html' }); res.end(body); }
  catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
await context.addInitScript(() => {
  window.__scheduled = 0;
  const timeout = window.setTimeout, interval = window.setInterval;
  window.setTimeout = (...args) => { window.__scheduled++; return timeout(...args); };
  window.setInterval = (...args) => { window.__scheduled++; return interval(...args); };
});
const page = await context.newPage(), requests = [], errors = [], checks = [];
page.setDefaultTimeout(10000);
page.on('request', req => requests.push(req.url()));
page.on('pageerror', error => errors.push(error.message));
const check = (name, condition) => { assert.ok(condition, name); checks.push(name); };
try {
  await page.goto(`http://127.0.0.1:${server.address().port}/ISAIAH/`);
  await page.locator('#start:not([disabled])').waitFor();
  check('simulation is explicitly labeled', (await page.locator('body').innerText()).includes('OFFLINE SIMULATION'));
  check('no credential entry exists', await page.locator('#operator-key, input[type=password]').count() === 0);
  check('no real provider account link exists', await page.locator('#chatgpt-settings').count() === 0);
  await page.locator('#task').focus();
  check('task input accepts focus for on-screen keyboard', await page.locator('#task').evaluate(node => document.activeElement === node));
  await page.locator('#start').click();
  await page.locator('[data-view="activity"]').click();
  await page.getByText('Independent verification: pass', { exact: false }).waitFor();
  check('R17 decision and simulated verification are visible', (await page.locator('#outcome').innerText()).includes('SIMULATED'));
  await page.locator('#repair-qualify').click();
  await page.waitForFunction(() => document.querySelector('#repair-outcome').textContent.includes('SIMULATION'));
  await page.locator('[data-view="change"]').click();
  await page.locator('#plan-apply:not([disabled])').click();
  await page.locator('#approve-change:not([disabled])').click();
  await page.locator('#execute-change:not([disabled])').click();
  await page.locator('#verify-change:not([disabled])').click();
  await page.waitForFunction(() => document.querySelector('#change-status').textContent.includes('verified'));
  await page.locator('#plan-rollback:not([disabled])').click();
  await page.locator('#approve-change:not([disabled])').click();
  await page.locator('#execute-change:not([disabled])').click();
  await page.locator('#verify-change:not([disabled])').click();
  await page.waitForFunction(() => document.querySelector('#change-status').textContent.includes('rollback') && document.querySelector('#change-status').textContent.includes('verified'));
  check('simulated apply and rollback complete without a credential', true);
  await page.locator('[data-view="investigation"]').click();
  await page.locator('#incident').selectOption('R29');
  await page.locator('#start').click();
  await page.locator('[data-view="activity"]').click();
  await page.waitForFunction(() => document.querySelector('#outcome').textContent.includes('Recommended review'));
  check('R29 shows the review branch', (await page.locator('#outcome').innerText()).includes('Express'));
  check('R29 status and branch retain their simulated review identity', await page.locator('#run-status').getAttribute('data-tone') === 'review' && (await page.locator('#branch-identity').textContent()).includes('review'));
  await page.locator('[data-view="change"]').click();
  check('R29 cannot plan an R17 apply without its passing replay', await page.locator('#plan-apply').isDisabled());
  await page.locator('[data-view="teaching"]').click();
  for (const mode of ['coach', 'focus', 'companion']) {
    await page.locator('#simulation-mode').selectOption(mode);
    await page.locator('#simulation-explain').click();
    check(`${mode} keeps missing delivery unverified`, (await page.locator('#simulation-lesson').innerText()).includes('Delivery is unverified'));
  }
  await page.screenshot({ path: resolve(evidence, 'simulation-teaching-390.png') });
  await page.addStyleTag({ content: 'body { font-size: 20px; }' });
  check('larger body text does not overflow the mobile viewport', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.waitForTimeout(1500);
  check('simulation makes no API requests', requests.every(url => !new URL(url).pathname.includes('/api/')));
  check('simulation schedules no polling timers', await page.evaluate(() => window.__scheduled === 0));
  check('simulation has no page errors', errors.length === 0);
  await writeFile(resolve(evidence, 'simulation-check.json'), JSON.stringify({ browser: browser.version(), checks, requests, errors, mode: 'headless Edge, offline simulation only' }, null, 2));
  console.log(JSON.stringify({ checks, requests, errors }, null, 2));
} finally { await context.close(); await browser.close(); await new Promise(resolve => server.close(resolve)); }
