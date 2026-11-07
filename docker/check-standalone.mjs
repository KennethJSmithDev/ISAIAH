import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';

const origin = 'http://127.0.0.1:18757';
const approved = process.env.ISAIAH_TEST_SESSION;
const denied = process.env.ISAIAH_TEST_DENIED_SESSION;
assert.match(approved ?? '', /^[1-9][0-9]{0,14}$/);
assert.match(denied ?? '', /^[1-9][0-9]{0,14}$/);
assert.notEqual(approved, denied);

async function call(path, data, status = 200) {
  const response = await fetch(origin + '/api/' + path, { signal: AbortSignal.timeout(315_000),
    ...(data === undefined ? {} : { method: 'POST', body: JSON.stringify(data),
      headers: { Origin: origin, 'X-Isaiah-Request': 'browser', 'Content-Type': 'application/json' } }) });
  const result = await response.json();
  assert.equal(response.status, status, result.error);
  return result;
}
const developer = (path, data, status) => call('developer/' + path, data, status);
const evidence = { status: 'running' };
const previous = await readFile('.local/standalone-qualification.json', 'utf8').then(JSON.parse, error => {
  if (error.code !== 'ENOENT') throw error;
  return null;
});
assert.ok(previous?.status !== 'pass', 'Preserve the accepted receipt and use a fresh qualification directory.');
async function checkpoint() { await writeFile('.local/standalone-qualification.json', JSON.stringify(evidence, null, 2) + '\n', { mode: 0o600 }); }

evidence.doctor = await developer('doctor');
assert.ok(evidence.doctor.ready && evidence.doctor.agent);
evidence.denial = await developer('trace', { session: denied }, 404);
assert.match(evidence.denial.error, /outside scope/);
await developer('preferences', { mode: 'coach' });
const first = await developer('trace', { session: approved });
evidence.first = first;
await checkpoint();
assert.equal(first.verification.status, 'pass');
assert.equal(first.verification.claim, 'recorded-hop-only');
assert.ok(first.metrics.modelResponses > 0);
assert.equal(first.teaching.topic, 'session');
assert.equal(first.learning.revision, null);
assert.deepEqual((await call('runs/' + first.id)).verification, first.verification);
await checkpoint();
const id = first.skillProposal.id;
assert.equal(first.learningReview.status, 'proposed');
assert.equal((await developer('review', { id, action: 'accept' })).active, id);
await developer('preferences', { mode: 'focus' });
const second = await developer('trace', { session: approved });
assert.equal(second.verification.status, 'pass');
assert.deepEqual(second.verification.independent, first.verification.independent);
assert.deepEqual(second.learning, { revision: id, used: true });
assert.equal(second.teaching, null);
assert.deepEqual(second.learningReview, { status: 'unchanged', revision: id, evidence: { kind: 'run', id: second.id } });
assert.equal(second.skillProposal, undefined);
assert.deepEqual((await call('runs/' + second.id)).learningReview, second.learningReview);
evidence.fresh = second;
assert.equal((await developer('review', { id, action: 'restore' })).active, null);
await developer('preferences', { mode: 'companion' });
const restored = await developer('trace', { session: approved });
assert.deepEqual(restored.verification, first.verification);
assert.deepEqual(restored.learning, { revision: null, used: false });
assert.equal(restored.learningReview.status, 'proposed');
assert.equal(restored.teaching, null);
assert.ok(restored.reaction);
evidence.restored = restored;
await checkpoint();

evidence.starter = await developer('explain', { topic: 'delivery' });
assert.equal(evidence.starter.kind, 'starter');
assert.match(evidence.starter.explanation, /destination.*received/);
const wrong = { id: 'local-zyzzyva-fixture', title: 'Zyzzyva', content: 'Zyzzyva example test text.',
  edition: evidence.doctor.edition, section: 'Fixture', version: '2026.2', compatibility: 'exact' };
await developer('sources', { sources: [wrong] });
evidence.wrongVersion = await developer('explain', { question: 'zyzzyva' });
assert.equal(evidence.wrongVersion.kind, 'unsupported');
evidence.unsupported = await developer('explain', { question: 'quasar turboencabulator' });
assert.equal(evidence.unsupported.kind, 'unsupported');
await checkpoint();
evidence.live = await developer('explain', { topic: 'session', live: true });
await checkpoint();
assert.equal(evidence.live.kind, 'documentation', evidence.live.reason);
assert.match(evidence.live.sources[0].digest, /^[a-f0-9]{64}$/);
await developer('preferences', { mode: 'coach' });
evidence.status = 'pass';
await checkpoint();
console.log('Standalone trace, review, restore, teaching modes, and official lookup passed.');
