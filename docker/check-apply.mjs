import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';

const origin = 'http://127.0.0.1:' + (process.env.ISAIAH_STANDALONE === '1' ? 18757 : 18747);
const [sandbox, operatorKey] = (await readFile(new URL('../.local/apply-operator.txt', import.meta.url), 'utf8')).trim().split(/\r?\n/);
const evidence = { status: 'incomplete', sandbox, origin };
const artifact = new URL('../.local/apply-qualification.json', import.meta.url);
const scratch = new URL('../.local/apply-qualification.json.tmp', import.meta.url);
const headers = { Origin: origin, 'X-Isaiah-Request': 'browser', 'Content-Type': 'application/json' };

async function checkpoint() {
  await writeFile(scratch, JSON.stringify(evidence, null, 2) + '\n', { mode: 0o600 });
  await rename(scratch, artifact);
}

async function api(path, data, status = 200, errorPattern) {
  const response = await fetch(origin + path, {
    ...(data === undefined ? {} : { method: 'POST', headers, body: JSON.stringify(data) }),
    signal: AbortSignal.timeout(28_000)
  });
  const result = await response.json();
  assert.equal(response.status, status, `${path} ${data?.operation ?? ''}: ${result.error ?? 'unexpected status'}`);
  if (errorPattern) assert.match(result.error, errorPattern);
  return result;
}

const post = (request, status, pattern) => api('/api/changes', request, status, pattern);
const read = id => api('/api/changes/' + id);
const operation = (name, record) => ({ operation: name, id: record.plan.id, fingerprint: record.fingerprint });
const approval = record => ({ ...operation('approve', record), operatorKey });

async function loseResponse(request) {
  let upstream;
  let relayError;
  let attempts = 0;
  const relay = createServer(async (req, res) => {
    try {
      attempts++;
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const response = await fetch(origin + '/api/changes', {
        method: 'POST', headers, body: Buffer.concat(chunks), signal: AbortSignal.timeout(25_000)
      });
      upstream = { status: response.status, record: await response.json() };
    } catch (error) { relayError = error; }
    finally { res.socket.destroy(); }
  });
  relay.listen(0, '127.0.0.1');
  await once(relay, 'listening');
  try {
    await assert.rejects(fetch(`http://127.0.0.1:${relay.address().port}/`, {
      method: 'POST', headers, body: JSON.stringify(request), signal: AbortSignal.timeout(28_000)
    }), error => error.cause?.code === 'UND_ERR_SOCKET');
    assert.ifError(relayError);
    assert.equal(attempts, 1);
    assert.equal(upstream.status, 200);
    assert.equal(upstream.record.phase, 'committed');
    const recovered = await read(request.id);
    assert.deepEqual(recovered, upstream.record);
    return { transport: 'UND_ERR_SOCKET', attempts, recovered };
  } finally {
    relay.close();
    relay.closeAllConnections();
  }
}

async function verifyDelivery(record, predicate, revision, destination) {
  const request = operation('verify', record);
  const [result, duplicate] = await Promise.all([post(request), post(request)]);
  assert.deepEqual(duplicate, result);
  assert.deepEqual(await read(record.plan.id), result);
  assert.equal(result.phase, 'verified');
  assert.deepEqual(result.current, { value: predicate, revision });
  assert.equal(result.verification.status, 'pass');
  assert.ok(result.verification.originalEvidenceIntact);
  assert.equal(result.verification.traceId, 'change:' + record.plan.id);
  assert.deepEqual(result.verification.trace.router, { matchPriority: predicate, selectedDestination: destination });
  assert.deepEqual(result.verification.trace.receipts, [{ destination, status: 'delivered' }]);
  return result;
}

const existing = await readFile(artifact, 'utf8').catch(error => {
  if (error.code !== 'ENOENT') throw error;
  return '';
});
assert.equal(existing, '', 'Retain the existing receipt file and use a fresh sandbox for another qualification.');
assert.ok((await api('/api/state')).environment.applyEnabled, 'Start the disposable Build 154U apply stack first.');
const started = await api('/api/start', { incident: 'R17', objective: 'Investigate why the synthetic R17 message reached the wrong destination. Compare priority, matchPriority, selected route and actual destination receipt. Propose the smallest rule correction.' }, 202);
console.log('R17 native investigation', started.id);
const deadline = Date.now() + 315_000;
let run;
do {
  await delay(1500);
  run = (await api('/api/state')).run;
  assert.equal(run.id, started.id);
} while (run.active && Date.now() < deadline);
assert.equal(run.verification?.status, 'pass', JSON.stringify(run.activity));
assert.ok(run.metrics.modelResponses > 0 && run.repairAvailable);
evidence.source = { id: run.id, decision: run.decision, metrics: run.metrics, verification: run.verification };
await checkpoint();

const failed = await api('/api/repair', { runId: run.id, to: 'PRIORITY' });
assert.equal(failed.status, 'fail');
const plan = (replayId = evidence.replay.id) => ({ operation: 'plan-apply', id: randomUUID(), sourceRun: run.id, replayId });
evidence.failedReplay = failed;
evidence.failedReplayRejected = await post(plan(failed.id), 409, /passing replay/);
const replay = await api('/api/repair', { runId: run.id, to: 'P1' });
assert.equal(replay.status, 'pass');
assert.deepEqual(replay.evidence.after, replay.evidence.before);
evidence.replay = replay;
await checkpoint();

const request = plan();
const apply = await post(request);
assert.deepEqual(await post(request), apply);
assert.deepEqual(apply.plan.target, { sandbox, build: '154U', namespace: 'ISAIAH', production: 'Isaiah.Production', item: 'Router', setting: 'R17.matchPriority' });
assert.deepEqual(apply.plan.before, { value: 'PRIORITY', revision: 1 });
evidence.unapprovedApply = await post(operation('execute', apply), 409, /explicit operator approval/i);
evidence.wrongOperator = await post({ ...approval(apply), operatorKey: 'IA!' + '0'.repeat(64) }, 403, /approval key was refused/);
evidence.wrongFingerprint = await post({ ...approval(apply), fingerprint: 'substituted' }, 409, /fingerprint/);
const rival = await post(plan());
const [approved, duplicateApproval, stale] = await Promise.all([post(approval(apply)), post(approval(apply)), post(approval(rival))]);
assert.deepEqual(approved.approval, duplicateApproval.approval);
assert.equal(approved.phase, 'approved');
assert.equal(stale.phase, 'approved');
assert.equal(stale.plan.before.revision, 1);
evidence.applyApproval = approved;
evidence.staleApproval = stale;
await checkpoint();

const executeApply = operation('execute', approved);
evidence.lostApply = await loseResponse(executeApply);
const duplicates = await Promise.all([post(executeApply), post(executeApply)]);
for (const duplicate of duplicates) assert.deepEqual(duplicate, evidence.lostApply.recovered);
assert.ok(evidence.lostApply.recovered.approval.consumed);
evidence.duplicateApplyCommits = duplicates.map(result => result.commit);
evidence.staleAtV2 = await post(operation('execute', stale), 409, /before-state is stale/);
assert.equal((await read(stale.plan.id)).phase, 'stale');
evidence.apply = await verifyDelivery(approved, 'P1', 2, 'Express');
await checkpoint();
console.log('Verified Express delivery after apply', evidence.apply.plan.id);

const rollback = await post({ operation: 'plan-rollback', id: randomUUID(), appliedId: apply.plan.id });
assert.equal(rollback.plan.appliedId, apply.plan.id);
assert.equal(rollback.plan.basisHash, apply.plan.basisHash);
assert.deepEqual(rollback.plan.before, apply.plan.after);
evidence.unapprovedRollback = await post(operation('execute', rollback), 409, /explicit operator approval/i);
const approvedRollback = await post(approval(rollback));
assert.equal(approvedRollback.phase, 'approved');
const executeRollback = operation('execute', approvedRollback);
evidence.lostRollback = await loseResponse(executeRollback);
assert.deepEqual(await post(executeRollback), evidence.lostRollback.recovered);
assert.ok(evidence.lostRollback.recovered.approval.consumed);
evidence.rollback = await verifyDelivery(approvedRollback, 'PRIORITY', 3, 'Standard');
evidence.staleAfterRollback = await post(operation('execute', stale), 409, /before-state is stale/);
const old = await post(executeApply);
assert.deepEqual(old.commit, evidence.apply.commit);
assert.deepEqual(old.current, evidence.rollback.current);
assert.deepEqual(old.verification, evidence.apply.verification);
evidence.priorApplyAfterRollback = old;
evidence.status = 'pass';
await checkpoint();
console.log('Verified restored Standard delivery after rollback', evidence.rollback.plan.id);
console.log('R17 approval, retries, lost responses and delivery qualification passed.');
