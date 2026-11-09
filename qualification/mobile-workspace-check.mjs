// Isolated transport-fixture browser checks. No IRIS, model, or real approvals.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const root = resolve('web');
const evidenceDir = process.env.ISAIAH_MOBILE_EVIDENCE || resolve('.local/mobile-evidence');
await mkdir(evidenceDir, { recursive: true });
let activeReads = 0, maxReads = 0, stateReads = 0, mutationCount = 0, receiptReads = 0;
let releaseReceipt, heldReceipt = false, loseApproval = false;
const runId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
let run = null, receipt;
const json = (res, status, data) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/api/state') {
    activeReads++; maxReads = Math.max(maxReads, activeReads); stateReads++;
    await new Promise(resolve => setTimeout(resolve, 150));
    activeReads--;
    return json(res, 200, { environment: { target: 'Synthetic transport fixture', runtime: 'No model', connection: 'Fixture only', ready: true, applyEnabled: true }, scope: { synthetic: true }, run, learning: { summary: 'Fixture learning', reviews: [] } });
  }
  if (req.method === 'GET' && url.pathname.startsWith('/api/changes/')) {
    receiptReads++;
    if (heldReceipt) await new Promise(resolve => { releaseReceipt = resolve; });
    return receipt ? json(res, 200, receipt) : json(res, 404, { error: 'Fixture receipt missing' });
  }
  if (req.method === 'POST') {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const input = JSON.parse(Buffer.concat(chunks)); mutationCount++;
    if (url.pathname === '/api/start') {
      run = { id: runId, incident: input.incident, status: 'Running fixture', active: true, cancellable: true, activity: ['Synthetic investigation started'] };
      return json(res, 200, { accepted: true });
    }
    if (url.pathname === '/api/changes') {
      if (input.operation === 'plan-apply') {
        receipt = { plan: { id: input.id, kind: 'apply', before: { value: 'PRIORITY', revision: 1 }, after: { value: 'P1', revision: 2 }, expectedDestination: 'Express', target: { sandbox: 'fixture-only' } }, fingerprint: 'f'.repeat(64), phase: 'planned', current: { value: 'PRIORITY', revision: 1 } };
        return json(res, 200, receipt);
      }
      if (input.operation === 'approve') {
        receipt = { ...receipt, phase: 'approved' };
        if (loseApproval) return json(res, 503, { error: 'Fixture: response lost' });
        return json(res, 200, receipt);
      }
    }
    return json(res, 409, { error: 'Fixture: action refused' });
  }
  const name = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  if (!['index.html', 'app.css', 'app.js', 'provider.js'].includes(name)) return json(res, 404, { error: 'Not found' });
  try { const body = await readFile(resolve(root, name)); res.writeHead(200, { 'Content-Type': name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html' }); res.end(body); }
  catch { json(res, 404, { error: 'Not found' }); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const report = { browser: browser.version(), mode: 'headless Edge; synthetic UI transport, not live inference', checks: [], errors: [] };
const check = (name, condition) => { assert.ok(condition, name); report.checks.push(name); };
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', isMobile: true, hasTouch: true });
const page = await context.newPage();
page.setDefaultTimeout(10000);
page.on('pageerror', error => report.errors.push(error.message));
try {
  await page.goto(base);
  await page.locator('#start:not([disabled])').waitFor();
  const initialReads = stateReads;
  await page.waitForTimeout(1400);
  check('idle does not use the former 1.2 second polling cadence', stateReads === initialReads);
  await page.waitForTimeout(14500);
  check('idle eventually refreshes without overlapping reads', stateReads === initialReads + 1 && maxReads === 1);
  await page.locator('#task').fill('A deliberately long synthetic objective that stays selected when this phone rotates.');
  await page.locator('#task').focus();
  await page.locator('#start').click();
  await page.waitForFunction(() => document.querySelector('#run-status').textContent.includes('Running fixture'));
  await page.locator('#task').focus();
  await page.locator('[data-view="activity"]').click();
  check('compact navigation shows the task activity', await page.locator('#activity').isVisible());
  await page.locator('[data-panel="activity"] summary').click();
  await page.setViewportSize({ width: 844, height: 390 });
  await page.setViewportSize({ width: 390, height: 844 });
  check('rotation retains objective and selected workspace', (await page.locator('#task').inputValue()).startsWith('A deliberately long') && await page.locator('[data-view="activity"]').getAttribute('aria-pressed') === 'true');
  await page.locator('[data-view="investigation"]').click();
  check('returning to a panel restores its prior input focus', await page.locator('#task').evaluate(node => document.activeElement === node));
  await page.locator('[data-view="activity"]').click();
  check('rotation retains the open evidence disclosure', await page.locator('[data-panel="activity"] details').evaluate(node => node.open));
  const activeCount = stateReads;
  await page.waitForTimeout(1700);
  check('running state continues observed polling', stateReads > activeCount);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForTimeout(250);
  const hiddenCount = stateReads;
  await page.waitForTimeout(1600);
  check('hidden page stops state polling', stateReads === hiddenCount);
  run = { id: runId, incident: 'R17', status: 'Verified fixture', active: false, cancellable: false, activity: ['Fixture finished'], decision: { finding: 'rule_mismatch', proposal: { action: 'align_match_priority', from: 'PRIORITY', to: 'P1' } }, verification: { status: 'pass', reason: 'Synthetic verifier fixture ' + 'X'.repeat(300) }, repairAvailable: true, repairs: [{ id: runId, status: 'pass', from: 'PRIORITY', to: 'P1', reason: 'Synthetic replay' }] };
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForFunction(() => document.querySelector('#run-status').textContent.includes('Verified fixture'));
  check('return reconciles the changed investigation and keeps reads serialized', maxReads === 1);
  await page.locator('[data-view="change"]').click();
  await page.locator('#plan-apply:not([disabled])').click();
  await page.locator('#approve-form:not([hidden])').waitFor();
  const plannedReads = stateReads, plannedMutations = mutationCount;
  await page.waitForTimeout(5600);
  check('awaiting approval observes without repeating a mutation', stateReads > plannedReads && mutationCount === plannedMutations);
  const beforeApproval = mutationCount;
  loseApproval = true; heldReceipt = true;
  await page.locator('#operator-key').fill('fixture-key');
  await page.locator('#approve-change').click();
  await page.waitForFunction(() => document.querySelector('#change-status').textContent.includes('response lost'));
  check('lost response blocks execute while receipt is unresolved', await page.locator('#execute-change').isDisabled());
  for (let i = 0; !releaseReceipt && i < 200; i++) await new Promise(resolve => setTimeout(resolve, 25));
  check('receipt reconciliation was requested', !!releaseReceipt);
  heldReceipt = false; releaseReceipt();
  await page.locator('#execute-change:not([disabled])').waitFor();
  check('lost response reconciles by read without retrying approval', mutationCount === beforeApproval + 1 && receiptReads > 0);
  check('approval field was cleared', (await page.locator('#operator-key').inputValue()) === '');
  for (const [width, height] of [[320,568], [390,844], [768,1024], [1440,900]]) {
    await page.setViewportSize({ width, height });
    await page.screenshot({ path: resolve(evidenceDir, `mobile-${width}.png`) });
    check(`no horizontal document overflow at ${width}`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  }
  check('no browser page errors', report.errors.length === 0);
  report.stateReads = stateReads; report.maxConcurrentStateReads = maxReads; report.receiptReads = receiptReads; report.mutationCount = mutationCount;
  await writeFile(resolve(evidenceDir, 'mobile-check.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally { await context.close(); await browser.close(); await new Promise(resolve => server.close(resolve)); }
