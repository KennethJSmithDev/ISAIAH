import { readFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { openLedger } from './ledger.mjs';
import { createTeaching } from './teaching.mjs';

export async function developerProfile(compose) {
  const path = compose ? '/run/secrets/isaiah-developer' : process.env.ISAIAH_DEV_PROFILE;
  if (!path) return null;
  const profile = JSON.parse(await readFile(path, 'utf8'));
  if (!/^[0-9a-f-]{36}$/.test(profile.instance) || !/^[A-Z][A-Z0-9_-]{0,30}$/.test(profile.namespace) ||
      !/^[\w.]{3,100}$/.test(profile.production) || !/^Tr![A-F0-9]{28}$/.test(profile.tracePassword)) throw new Error('Invalid developer trace profile.');
  checkEndpoint(profile.traceUrl, '/isaiah-trace', compose);
  if (!compose && profile.agentUrl) checkEndpoint(profile.agentUrl, '/isaiah', false);
  return profile;
}

function checkEndpoint(address, path, compose) {
  const url = new URL(address);
  const local = ['127.0.0.1', 'localhost'].includes(url.hostname);
  const internal = compose && url.origin === 'http://trace:52773';
  if (url.pathname !== path || url.username || url.password || url.search || url.hash ||
      !(url.protocol === 'https:' || (url.protocol === 'http:' && local) || internal)) throw new Error('Invalid developer endpoint.');
}

export function createDeveloper({ directory, profile, edition, assist, persist, readRun }) {
  const ledger = openLedger(directory);
  const teaching = createTeaching(ledger, edition);
  const scope = profile ? [edition, '154U', profile.instance, profile.namespace, profile.production, 'trace-v1'].join('/') : '';

  async function read(path) {
    if (!profile) throw Object.assign(new Error('Configure an approved developer target.'), { statusCode: 409 });
    const response = await fetch(profile.traceUrl + path, {
      redirect: 'error', signal: AbortSignal.timeout(6500),
      headers: { Authorization: 'Basic ' + Buffer.from('IsaiahTraceClient:' + profile.tracePassword).toString('base64'),
        'X-Isaiah-Target': profile.instance }
    });
    const data = await response.json();
    if (!response.ok) throw Object.assign(new Error(data.error ?? 'Developer trace access refused.'), { statusCode: response.status });
    return data;
  }
  function check(target) {
    if (target.instance !== profile.instance || target.namespace !== profile.namespace || target.production !== profile.production ||
        !target.nativeHub || !target.build.includes('2026.3.0AI (Build 154U)') || target.edition !== edition) {
      throw new Error('The running target differs from its qualified developer profile.');
    }
  }
  async function doctor() {
    try { const target = await read('/health'); check(target); return { ready: true, edition, target, mode: teaching.mode() }; }
    catch (error) { return { ready: false, edition, reason: error.message, mode: teaching.mode() }; }
  }
  async function trace(session) {
    if (typeof session !== 'string' || !/^[1-9][0-9]{0,14}$/.test(session)) throw Object.assign(new Error('Enter a numeric Session ID.'), { statusCode: 400 });
    const initial = await read('/session/' + session);
    check(initial.target);
    if (String(initial.session) !== session || !initial.hops?.length) throw new Error('The approved session trace is incomplete.');
    const skill = ledger.use(scope);
    const { id, started, metrics, result } = await assist('trace', initial, skill?.guidance);
    const independent = await read('/session/' + session);
    check(independent.target);
    const { id: hopId, source, target, status } = independent.hops.at(-1);
    const lastHop = { id: String(hopId), source, target, status: String(status) };
    const modelHop = result.lastHop && { ...result.lastHop, id: String(result.lastHop.id), status: String(result.lastHop.status) };
    const passed = metrics.modelResponses > 0 && isDeepStrictEqual(initial, independent) && isDeepStrictEqual(lastHop, modelHop);
    const order = ['id', 'source', 'target', 'status'];
    const run = { id, started, kind: 'trace', compatibility: scope, session, active: false, status: passed ? 'Verified' : 'Verifier rejected decision',
      metrics, verification: { status: passed ? 'pass' : 'fail', independent, claim: 'recorded-hop-only' },
      decision: { lastHop: result.lastHop }, learning: { revision: skill?.id ?? null, used: !!skill && isDeepStrictEqual(result.order, order) } };
    if (passed) run.finding = `The last recorded hop is ${source} → ${target}, with IRIS status ${status}.`;
    await persist(run);
    if (passed) {
      const review = ledger.propose(run);
      run.learningReview = { status: review.status, revision: review.revision, evidence: { kind: 'run', id } };
      if (review.proposal) run.skillProposal = review.proposal;
      await persist(run);
    }
    const reference = { kind: 'run', id };
    return { ...run, workState: { version: 1, state: passed ? 'verified' : 'failed', evidence: reference },
      teaching: teaching.cue('session', reference), reaction: passed && teaching.mode() === 'companion' ? 'The trail is accounted for.' : undefined };
  }

  async function handle(action, data) {
    if (action === 'trace') return trace(data.session);
    if (action === 'preferences') return teaching.preference(data);
    if (action === 'sources') return teaching.importPack(data.sources);
    if (action === 'explain') return teaching.explain(data, async context => (await assist('explain', context)).result);
    if (action === 'review') {
      if (!scope || typeof data.id !== 'string' || !/^[a-f0-9]{24}$/.test(data.id)) throw new Error('Invalid scoped revision ID.');
      return ledger.review(scope, data.id, data.action);
    }
    if (action === 'card') {
      const run = await readRun(data.runId);
      if (run?.compatibility !== scope) throw new Error('The run is outside this teaching profile.');
      return teaching.card(data.topic, { kind: 'run', id: run.id });
    }
    throw Object.assign(new Error('Developer route unavailable.'), { statusCode: 404 });
  }
  return { doctor, handle, cue: teaching.cue };
}
