import { createServer } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLearning } from './learning.mjs';
import { ceilings, createRuntime, json, requestBody } from './runtime.mjs';
import { repairBaseline, verify, verifyReplay } from './verifier.mjs';
import { createDeveloper, developerProfile } from './standalone/developer.mjs';
import { standalonePort } from './standalone/loopback.mjs';
import { traceObservations } from './standalone/trace-observations.mjs';
import { loadInterop } from './standalone/interop.mjs';
import { loadMonitor } from './standalone/monitor.mjs';
import { loadProject } from './standalone/project.mjs';

const compose = process.env.ISAIAH_COMPOSE === '1';
const repairLocal = !compose && process.env.ISAIAH_REPAIR_LOCAL === '1';
const applySandbox = compose && process.env.ISAIAH_APPLY_SANDBOX === '1';
const standalone = process.env.ISAIAH_STANDALONE === '1';
const port = standalone ? (compose ? 18757 : standalonePort()) : (compose ? 18747 : (repairLocal ? 18749 : 18743));
const host = '127.0.0.1';
const origin = 'http://' + host + ':' + port;
const compatibility = 'IRIS-2026.3.0AI.154.0/ISAIAH/routing-v1';
const dataDir = compose ? '/home/node/.isaiah' : (standalone && process.env.ISAIAH_HOME || fileURLToPath(new URL('./.local/', import.meta.url)));
const runsDir = join(dataDir, 'runs');
const changeIdPattern = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;
const changeFields = new Map([
  ['plan-apply', ['sourceRun', 'replayId']], ['plan-rollback', ['appliedId']],
  ['approve', ['fingerprint', 'operatorKey']], ['execute', ['fingerprint']], ['verify', ['fingerprint']], ['reconcile', ['fingerprint']]
]);
await mkdir(runsDir, { recursive: true, mode: 0o700 });
const learning = await createLearning({ dataDir, compatibility });
const web = new Map([
  ['/', ['index.html', 'text/html']],
  ['/app.css', ['app.css', 'text/css']],
  ['/app.js', ['app.js', 'text/javascript']],
  ['/provider.js', ['provider.js', 'text/javascript']]
]);
const scope = {
  data: 'Synthetic only', namespace: 'ISAIAH', compatibility, decisionSchema: 2,
  actions: ['Read selected incident trace and destination receipts', 'Dispatch a read-only diagnostic or record human review',
    'Replay a candidate predicate under a separate synthetic trace ID'],
  ceilings
};
if (applySandbox) scope.actions.push('Approve, execute and verify an R17 apply or rollback in the disposable Build 154U sandbox');
let control;
let latest;
let reviewing = false;
const savedRuns = (await readdir(runsDir)).filter(name => /^\d{13}-[0-9a-f-]{36}\.json$/.test(name)).sort();
for (const name of savedRuns.reverse()) {
  try {
    const candidate = JSON.parse(await readFile(join(runsDir, name), 'utf8'));
    if (['trace','interop-read','teaching','project-read','project-patch','development-plan'].includes(candidate.kind)) continue;
    latest = candidate;
    if (latest.active) {
      latest.active = latest.cancellable = false;
      latest.phase = 'failed';
      latest.status = 'Interrupted · consult the independent receipts before rerunning';
    }
    break;
  } catch { console.error('A previous ISAIAH run record could not be loaded.'); }
}
const profile = standalone ? await developerProfile(compose) : null;
const edition = process.env.ISAIAH_EDITION ?? 'iris-for-health';
if (!['iris', 'iris-for-health'].includes(edition)) throw new Error('Unknown ISAIAH edition profile.');
const runtime = await createRuntime(dataDir, () => control, compose, repairLocal, applySandbox, standalone, profile);
scope.model = runtime.model;
scope.provider = runtime.provider;
const endpoints = standalone ? await loadInterop() : null;
const monitor = standalone ? await loadMonitor() : null;
if (monitor && endpoints?.targets.includes(monitor.id)) throw new Error('Monitoring and endpoint target IDs must be distinct.');
const interop = monitor ? { inspect: (target, record) => target === monitor.id ? monitor.inspect(target, record) :
  endpoints ? endpoints.inspect(target, record) : Promise.reject(Object.assign(new Error('Unknown configured inspection target.'), { statusCode: 403 })) } : endpoints;
const project = standalone ? await loadProject() : null;
const developer = standalone ? createDeveloper({ directory: dataDir, profile, edition, assist, persist, readRun, interop, project }) : null;
let environment = { target: 'ISAIAH · synthetic only', runtime: 'Native AI Hub · ' + runtime.model, connection: 'Checking local services…', ready: false };
let healthCheck;
function refreshHealth() {
  healthCheck ??= runtime.health().then(result => { environment = result; }).finally(() => { healthCheck = undefined; });
  return healthCheck;
}
void refreshHealth();
setInterval(refreshHealth, 5000).unref();

async function persist(run) {
  const path = join(runsDir, run.started + '-' + run.id + '.json');
  await writeFile(path + '.tmp', JSON.stringify(run, null, 2), { mode: 0o600 });
  await rename(path + '.tmp', path);
}

async function readRun(id) {
  if (typeof id !== 'string' || !changeIdPattern.test(id)) return null;
  const filename = (await readdir(runsDir)).find(name => /^\d{13}-[0-9a-f-]{36}\.json$/.test(name) && name.endsWith('-' + id + '.json'));
  return filename ? JSON.parse(await readFile(join(runsDir, filename), 'utf8')) : null;
}

function presentChange(receipt) {
  const states = { planned: 'review', approved: 'review', committed: 'review', stale: 'review', verifying: 'verifying',
    verification_unknown: 'review', verification_failed: 'failed', verified: 'verified' };
  const evidence = { kind: 'change', id: receipt.plan.id };
  return { ...receipt, workState: { version: 1, state: states[receipt.phase] ?? 'review', evidence },
    teaching: developer && ['stale', 'verification_unknown'].includes(receipt.phase) ? developer.cue('recovery', evidence) : undefined };
}

function metrics() {
  return { modelRequests: 0, modelResponses: 0, modelFailures: 0, providerInputBytes: 0, promptTokens: 0, completionTokens: 0 };
}

async function assist(kind, context, guidance = '') {
  if (!environment.ready) throw new Error(environment.connection);
  if (control || reviewing) throw Object.assign(new Error('Wait for the active task to finish.'), { statusCode: 409 });
  const run = { id: randomUUID(), started: Date.now(), active: true, metrics: metrics() };
  const controller = new AbortController();
  control = { run, controller, providerSignal: controller.signal };
  const timer = setTimeout(() => controller.abort(), ceilings.elapsedSeconds * 1000);
  try {
    const result = await runtime.iris('POST', '/developer/assist', { runId: run.id, kind, context: JSON.stringify(context), guidance, model: runtime.model });
    if (!run.metrics.modelResponses) throw new Error('No native AI Hub model response was recorded.');
    return { id: run.id, started: run.started, metrics: run.metrics, result, provider: runtime.provider };
  } finally {
    clearTimeout(timer);
    controller.abort();
    control = undefined;
  }
}

async function execute(current, objective) {
  const { run, controller } = current;
  const deadline = setTimeout(() => {
    current.expired = true;
    controller.abort();
  }, ceilings.elapsedSeconds * 1000);
  const poll = setInterval(async () => {
    if (current.polling || !current.dispatched) return;
    current.polling = true;
    try {
      const progress = await runtime.iris('GET', '/state/' + run.id);
      if (run.active) {
        if (!run.activity.includes(progress.stage)) run.activity.push(progress.stage);
        run.audit = progress.tools;
      }
    } catch { /* The primary request supplies the terminal transport result. */ }
    finally { current.polling = false; }
  }, 2000);
  try {
    const knowledge = await learning.context();
    run.contract.learning = { revisions: knowledge.revisions, applicability: knowledge.applicability };
    run.metrics.guidanceBytes = knowledge.bytes;
    await persist(run);
    if (controller.signal.aborted) throw new Error('Investigation stopped before production dispatch.');
    current.dispatched = true;
    const result = await runtime.iris('POST', '/run', { runId: run.id, incident: run.incident, objective, guidance: knowledge.guidance, model: runtime.model });
    if (controller.signal.aborted) throw new Error('Investigation stopped before verification.');
    run.decision = result.decision;
    run.branchReceipt = result.branchReceipt;
    run.audit = result.audit;
    run.activity.push('Production returned a decision and a branch receipt');
    run.status = 'Verifying independent production records';
    run.phase = 'verifying';
    const independent = await runtime.iris('GET', '/verify/' + run.id);
    if (controller.signal.aborted) throw new Error('Investigation stopped during verification.');
    run.verification = { ...verify(run.incident, result, independent), independent };
    if (knowledge.applicability === 'applicable') {
      const used = JSON.stringify(result.decision.comparisonOrder) === JSON.stringify(['priority', 'matchPriority', 'selected', 'delivered']);
      run.learningUse = { revision: knowledge.revisions.skill, reportedComparisonOrder: result.decision.comparisonOrder ?? [], confirmed: used };
      if (knowledge.repairLesson && result.decision.finding === 'rule_mismatch') {
        run.learningUse.repairCheck = result.decision.repairCheck === 'replay_required';
      }
    }
    if (run.metrics.modelResponses < 1) {
      run.verification = { status: 'fail', reason: 'The scoped provider recorded no model completion.' };
    }
    run.repairAvailable = !!repairBaseline(run);
    run.status = run.verification.status === 'pass' ? 'Verified' : 'Verifier rejected decision';
    run.phase = run.verification.status !== 'pass' ? 'failed' : (run.decision.branch === 'review' ? 'review' : 'verified');
  } catch (error) {
    run.phase = 'failed';
    if (current.cancellation) {
      const receipt = await current.cancellation;
      run.cancellation = receipt;
      run.status = receipt.confirmed
        ? (receipt.branchAlreadyRecorded ? 'Cancelled · branch had already recorded a receipt' : 'Cancelled')
        : 'Cancelled locally · IRIS acknowledgement unavailable';
    } else if (current.expired) {
      run.status = 'Timed out · inspect IRIS records before rerunning';
    } else {
      run.status = 'Failed';
    }
    if (current.dispatched && !run.audit) {
      try { run.audit = (await runtime.iris('GET', '/state/' + run.id)).tools; }
      catch { /* Retain the primary failure. */ }
    }
    run.activity.push(error.message);
  } finally {
    clearTimeout(deadline);
    clearInterval(poll);
    controller.abort();
    run.cancellable = false;
    run.metrics.toolDispatches = Array.isArray(run.audit) ? run.audit.length : 0;
    run.metrics.elapsedMs = Date.now() - run.started;
    try {
      await persist({ ...run, active: false });
      if (run.verification?.status === 'pass' && await learning.propose(run)) run.activity.push('Proposed an evidence-linked skill revision for review');
    } catch { run.activity.push('Local run evidence or learning could not be saved.'); }
    run.active = false;
    if (control === current) control = undefined;
  }
}

const server = createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  if (req.headers.host !== host + ':' + port) return json(res, 403, { error: 'Invalid localhost host.' });
  if (req.method === 'GET' && web.has(req.url)) {
    try {
      const [filename, type] = web.get(req.url);
      const page = await readFile(new URL('web/' + filename, import.meta.url));
      return res.writeHead(200, { 'Content-Type': type + '; charset=utf-8', 'Cache-Control': 'no-store' }).end(page);
    } catch { return json(res, 500, { error: 'Interface asset unavailable.' }); }
  }
  if (req.method === 'GET' && req.url === '/api/state') {
    const previous = latest?.verification?.status === 'pass' ? (latest.decision?.branch === 'review' ? 'review' : 'verified') :
      (latest?.verification?.status === 'fail' ? 'failed' : 'idle');
    const state = !environment.ready ? 'offline' : latest?.phase ?? previous;
    const evidence = latest ? { kind: 'run', id: latest.id } : null;
    const topic = { working: 'production', verifying: 'delivery', review: 'status' }[state];
    return json(res, 200, { environment, run: latest, learning: learning.snapshot(), scope,
      workState: { version: 1, state, evidence }, teaching: topic ? developer?.cue(topic, evidence) : undefined });
  }
  if (developer && req.method === 'GET' && req.url === '/api/developer/doctor') {
    return json(res, 200, { ...await developer.doctor(), agent: environment.ready });
  }
  const changeId = req.method === 'GET' && req.url.startsWith('/api/changes/') && req.url.slice('/api/changes/'.length);
  if (changeId && changeIdPattern.test(changeId) && applySandbox && runtime.iris) {
    try { return json(res, 200, presentChange(await runtime.iris('GET', '/change/' + changeId))); }
    catch (error) { return json(res, error.statusCode ?? 502, { error: error.statusCode ? error.message : 'Receipt unavailable. Try reading it again.' }); }
  }
  const evidenceId = req.method === 'GET' && /^\/api\/runs\/([0-9a-f-]{36})$/.exec(req.url)?.[1];
  if (evidenceId) {
    try {
      const source = await readRun(evidenceId);
      if (!source) return json(res, 404, { error: 'Source run unavailable.' });
      return json(res, 200, source.kind === 'trace' ? { ...source, observations: traceObservations(source.verification?.independent) } :
        (developer ? developer.present(source) : source));
    } catch { return json(res, 500, { error: 'Source run could not be read.' }); }
  }
  const developerAction = developer && /^\/api\/developer\/(trace|explain|review|preferences|sources|card|inspect|context|project)$/.exec(req.url)?.[1];
  if (req.method !== 'POST' || !(developerAction || ['/api/start', '/api/cancel', '/api/repair', '/api/learning'].includes(req.url) ||
      (applySandbox && req.url === '/api/changes'))) {
    return json(res, 404, { error: 'Route unavailable.' });
  }
  if (req.headers.origin !== origin || req.headers['x-isaiah-request'] !== 'browser' || req.headers['content-type'] !== 'application/json') {
    return json(res, 403, { error: 'Request rejected by localhost origin policy.' });
  }
  let input;
  try { input = (await requestBody(req, developerAction === 'sources' ? 400_000 : developerAction === 'project' ? 40_000 : 8192)).data; }
  catch { return json(res, 400, { error: 'Invalid or oversized JSON request.' }); }
  if (!input || typeof input !== 'object' || Array.isArray(input)) return json(res, 400, { error: 'Expected a JSON object.' });
  if (developerAction) {
    try { return json(res, 200, await developer.handle(developerAction, input)); }
    catch (error) { return json(res, error.statusCode ?? 409, { error: error.message }); }
  }

  if (req.url === '/api/changes') {
    if (!environment.applyEnabled) return json(res, 409, { error: 'The disposable change sandbox is unavailable.' });
    const fields = changeFields.get(input.operation);
    if (!fields || typeof input.id !== 'string' || !changeIdPattern.test(input.id) || Object.keys(input).length !== fields.length + 2 ||
        fields.some(field => typeof input[field] !== 'string' || !input[field] || input[field].length > 100) ||
        ['sourceRun', 'replayId', 'appliedId'].some(field => field in input && !changeIdPattern.test(input[field]))) {
      return json(res, 400, { error: 'Invalid change contract.' });
    }
    if (input.operation === 'plan-apply' &&
        (latest?.id !== input.sourceRun || latest.active || !latest.repairs?.some(attempt => attempt.id === input.replayId && attempt.status === 'pass'))) {
      return json(res, 409, { error: 'Use a passing replay from the current verified R17 investigation.' });
    }
    try { return json(res, 200, presentChange(await runtime.iris('POST', '/change', input))); }
    catch (error) {
      return json(res, error.statusCode ?? 502, { error: error.statusCode ? error.message : 'Change outcome unavailable. Read the receipt before continuing.' });
    }
  }

  if (req.url === '/api/start') {
    if (control || reviewing) return json(res, 409, { error: 'Another investigation or review is in progress.' });
    if (!environment.ready) return json(res, 409, { error: environment.connection });
    const { incident, objective } = input;
    if (Object.keys(input).length !== 2 || !['R17', 'R29'].includes(incident) ||
        typeof objective !== 'string' || objective.length > 1500 || !objective.trim()) {
      return json(res, 400, { error: 'Choose a synthetic incident and enter a task of up to 1,500 characters.' });
    }
    const controller = new AbortController();
    latest = {
      id: randomUUID(), incident, started: Date.now(), active: true, cancellable: true, status: 'Running', phase: 'working',
      contract: { ...scope, objectiveSha256: createHash('sha256').update(objective.trim()).digest('hex') },
      activity: ['Scoped investigation accepted'],
      metrics: metrics()
    };
    control = { run: latest, controller, providerSignal: controller.signal };
    void execute(control, objective.trim());
    return json(res, 202, { id: latest.id });
  }

  if (req.url === '/api/cancel') {
    const current = control;
    if (!current?.run.cancellable || current.cancellation) return json(res, 409, { error: 'No cancellable investigation.' });
    current.run.cancellable = false;
    current.run.status = 'Cancelling';
    current.cancellation = current.dispatched
      ? runtime.iris('POST', '/cancel/' + current.run.id, {}).then(
        receipt => ({ confirmed: receipt.cancelled === true, branchAlreadyRecorded: !!receipt.branchAlreadyRecorded }),
        () => ({ confirmed: false }))
      : Promise.resolve({ confirmed: true, branchAlreadyRecorded: false });
    current.controller.abort();
    return json(res, 202, { status: 'Cancelling' });
  }

  if (reviewing || control) return json(res, 409, { error: 'Wait for the current investigation or review to finish.' });
  reviewing = true;
  try {
    if (req.url === '/api/repair') {
      const run = latest;
      if (!run || run.active || input.runId !== run.id || !environment.ready) {
        return json(res, 409, { error: 'Use the current completed investigation on the connected sandbox.' });
      }
      if (Object.keys(input).length !== 2 || typeof input.to !== 'string' || !/^[A-Z0-9]{1,16}$/.test(input.to)) {
        return json(res, 400, { error: 'Enter a comparison value of up to 16 uppercase letters or digits.' });
      }
      const proposal = repairBaseline(run);
      const repairs = run.repairs ?? [];
      if (!proposal || repairs.length >= 6) return json(res, 409, { error: 'This run does not permit another repair replay.' });
      const previous = repairs.at(-1);
      const modelValue = run.decision.proposal?.to;
      const correctedFrom = previous?.status === 'fail' && previous.to !== input.to
        ? { value: previous.to, replay: previous.id }
        : (modelValue !== undefined && modelValue !== input.to ? { value: modelValue } : null);
      const attempt = { id: randomUUID(), sourceRun: run.id, from: proposal.from, to: input.to, correctedFrom };
      try {
        await runtime.iris('POST', '/repair', { id: attempt.id, sourceRun: run.id, from: attempt.from, to: attempt.to });
        const evidence = await runtime.iris('GET', '/repair/' + attempt.id);
        Object.assign(attempt, verifyReplay(run, attempt, evidence), { evidence });
      } catch (error) {
        Object.assign(attempt, { status: 'unavailable', reason: error.message });
      }
      const updated = { ...run, repairs: [...repairs, attempt] };
      await persist(updated);
      latest = updated;
      return json(res, 200, attempt);
    }
    if (input.action === 'propose-repair') {
      const receipt = latest?.id === input.runId && latest.repairs?.find(attempt => attempt.id === input.id);
      if (!receipt || receipt.status !== 'pass' || !receipt.correctedFrom) {
        return json(res, 409, { error: 'A verified correction receipt from the current run is required.' });
      }
      if (!await learning.proposeRepair(latest, receipt)) {
        return json(res, 409, { error: 'Correction learning is unavailable or this procedure is already current.' });
      }
      return json(res, 200, learning.snapshot());
    }
    return json(res, 200, await learning.change(input));
  }
  catch (error) { return json(res, 409, { error: error.message }); }
  finally { reviewing = false; }
});
server.requestTimeout = 12_000;
server.listen(port, compose ? '0.0.0.0' : host, () => console.log('ISAIAH listening at ' + origin));
