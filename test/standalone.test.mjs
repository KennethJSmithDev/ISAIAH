import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { openLedger } from '../standalone/ledger.mjs';
import { createTeaching } from '../standalone/teaching.mjs';

test('reviewed learning has durable prior revision checks and profile applicability', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'isaiah-ledger-'));
  let ledger = openLedger(directory);
  try {
    const source = { id: 'run-1', kind: 'trace', compatibility: 'health-fixture', verification: { status: 'pass' } };
    const first = ledger.propose(source).proposal;
    const stale = ledger.propose({ ...source, id: 'run-2' }).proposal;
    assert.equal(ledger.use('health-fixture'), null);
    assert.throws(() => ledger.review('different', first.id, 'accept'), /outside/);
    assert.equal(ledger.review('health-fixture', first.id, 'accept').active, first.id);
    assert.throws(() => ledger.review('health-fixture', stale.id, 'accept'), /stale/);
    const inspect = new DatabaseSync(join(directory, 'standalone.sqlite'));
    const before = inspect.prepare('SELECT COUNT(*) AS count FROM skill').get().count;
    assert.deepEqual(ledger.propose({ ...source, id: 'run-3' }), { status: 'unchanged', revision: first.id });
    assert.equal(inspect.prepare('SELECT COUNT(*) AS count FROM skill').get().count, before);
    assert.equal(inspect.prepare('SELECT state FROM skill WHERE id=?').get(stale.id).state, 'proposed');
    inspect.close();
    const other = ledger.propose({ ...source, id: 'other-run', compatibility: 'different' });
    assert.equal(other.status, 'proposed');
    assert.equal(ledger.use('different'), null);
    ledger.close();
    ledger = openLedger(directory);
    assert.equal(ledger.use('health-fixture').evidence, source.id);
    assert.equal(ledger.use('different'), null);
    assert.equal(ledger.review('health-fixture', first.id, 'restore').active, null);
    assert.equal(ledger.use('health-fixture'), null);
  } finally { ledger.close(); await rm(directory, { recursive: true }); }
});

test('restoration compares exact content against the accepted active revision', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'isaiah-legacy-'));
  const ledger = openLedger(directory);
  const fixture = new DatabaseSync(join(directory, 'standalone.sqlite'));
  try {
    const run = { id: 'initial', kind: 'trace', compatibility: 'legacy-fixture', verification: { status: 'pass' } };
    const first = ledger.propose(run).proposal;
    ledger.review(run.compatibility, first.id, 'accept');
    // Synthetic legacy revision. The trailing space is deliberately different content.
    fixture.prepare('INSERT INTO skill VALUES (?,?,?,?,?,?)').run('legacy-child', run.compatibility,
      first.id, 'legacy-synthetic-run', first.guidance + ' ', 'accepted');
    fixture.prepare('UPDATE active_skill SET id=? WHERE scope=?').run('legacy-child', run.compatibility);
    const different = ledger.propose({ ...run, id: 'different-content' });
    assert.equal(different.status, 'proposed');
    assert.equal(different.proposal.parent, 'legacy-child');
    assert.equal(ledger.use(run.compatibility).id, 'legacy-child');
    ledger.review(run.compatibility, different.revision, 'accept');
    assert.equal(ledger.review(run.compatibility, different.revision, 'restore').active, 'legacy-child');
    assert.equal(ledger.review(run.compatibility, 'legacy-child', 'restore').active, first.id);
    assert.deepEqual(ledger.propose({ ...run, id: 'after-restore' }), { status: 'unchanged', revision: first.id });
    ledger.review(run.compatibility, first.id, 'restore');
    assert.equal(ledger.propose({ ...run, id: 'historical-only' }).status, 'proposed');
    for (const state of ['proposed', 'rejected', 'restored']) {
      fixture.prepare('UPDATE skill SET state=? WHERE id=?').run(state, first.id);
      fixture.prepare('INSERT INTO active_skill VALUES (?,?) ON CONFLICT(scope) DO UPDATE SET id=excluded.id').run(run.compatibility, first.id);
      assert.equal(ledger.use(run.compatibility), null);
      assert.equal(ledger.propose({ ...run, id: 'nonaccepted-' + state }).status, 'proposed');
    }
  } finally { fixture.close(); ledger.close(); await rm(directory, { recursive: true }); }
});

// A child process gives the real developer factory its normal database lifetime.
// All trace/model responses below are explicitly synthetic and stay offline.
async function traceFixture() {
  const { default: assert } = await import('node:assert/strict');
  const { readFile, writeFile } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const { randomUUID } = await import('node:crypto');
  const { DatabaseSync } = await import('node:sqlite');
  const { createDeveloper } = await import(process.env.ISAIAH_TEST_DEVELOPER);
  const directory = process.env.ISAIAH_TEST_DIRECTORY;
  const target = { instance: '11111111-1111-1111-1111-111111111111', namespace: 'ISAIAHDEV',
    production: 'DevTrace.Production', build: '2026.3.0AI (Build 154U)', nativeHub: 1, edition: 'iris-for-health' };
  const hop = { id: '2', source: 'Synthetic Intake', target: 'Synthetic Sink', status: '9' };
  globalThis.fetch = async url => {
    assert.equal(url, 'http://synthetic.invalid/isaiah-trace/session/2');
    return { ok: true, json: async () => ({ target, session: '2', hops: [hop] }) };
  };
  let duringAssist;
  let failSave = false;
  const developer = createDeveloper({ directory, profile: { ...target, traceUrl: 'http://synthetic.invalid/isaiah-trace' },
    edition: 'iris-for-health', assist: async (kind, context, guidance) => {
      assert.equal(kind, 'trace');
      duringAssist?.();
      duringAssist = undefined;
      return { id: randomUUID(), started: Date.now(), metrics: { modelResponses: 1 },
        result: { lastHop: context.hops.at(-1), order: guidance ? ['id', 'source', 'target', 'status'] : undefined } };
    }, persist: async run => {
      if (failSave && run.learningReview) throw new Error('Synthetic recording failure');
      await writeFile(join(directory, run.id + '.json'), JSON.stringify(run));
    }, readRun: async id => JSON.parse(await readFile(join(directory, id + '.json'), 'utf8')) });
  const trace = () => developer.handle('trace', { session: '2' });
  const review = (id, action) => developer.handle('review', { id, action });
  const db = new DatabaseSync(join(directory, 'standalone.sqlite'));
  const count = () => db.prepare('SELECT COUNT(*) AS count FROM skill').get().count;
  const first = await trace();
  assert.equal(first.learningReview.status, 'proposed');
  assert.equal(first.observations.basis, 'recorded-headers-only');
  assert.equal(first.observations.delivery, 'unverified');
  assert.deepEqual(first.observations.observedEndpoints, ['Synthetic Intake', 'Synthetic Sink']);
  assert.equal(first.learning.revision, null);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM active_skill').get().count, 0);
  const revision = first.skillProposal.id;
  await review(revision, 'accept');
  const before = count();
  const second = await trace();
  assert.equal(second.verification.status, 'pass');
  assert.deepEqual(second.learning, { revision, used: true });
  assert.deepEqual(second.learningReview, { status: 'unchanged', revision, evidence: { kind: 'run', id: second.id } });
  assert.equal(second.skillProposal, undefined);
  const afterUnchanged = count();
  assert.equal(afterUnchanged, before);
  for (const run of [first, second]) {
    const recorded = JSON.parse(await readFile(join(directory, run.id + '.json'), 'utf8'));
    assert.equal(recorded.observations, undefined); // Re-derived from the retained independent headers.
    assert.deepEqual(recorded.learningReview, run.learningReview);
    assert.equal(recorded.verification.status, 'pass');
  }
  duringAssist = () => {
    // Synthetic historical duplicate models a revision accepted while the run is executing.
    const row = db.prepare('SELECT * FROM skill WHERE id=?').get(revision);
    db.prepare('INSERT INTO skill VALUES (?,?,?,?,?,?)').run('aaaaaaaaaaaaaaaaaaaaaaaa', row.scope, revision,
      'legacy-synthetic-run', row.guidance, 'accepted');
    db.prepare('UPDATE active_skill SET id=? WHERE scope=?').run('aaaaaaaaaaaaaaaaaaaaaaaa', row.scope);
  };
  const raced = await trace();
  assert.deepEqual(raced.learning, { revision, used: true });
  assert.equal(raced.learningReview.revision, 'aaaaaaaaaaaaaaaaaaaaaaaa');
  await review('aaaaaaaaaaaaaaaaaaaaaaaa', 'restore');
  const restored = await trace();
  assert.equal(restored.learningReview.status, 'unchanged');
  assert.equal(restored.learningReview.revision, revision);
  failSave = true;
  await assert.rejects(trace(), /Synthetic recording failure/);
  failSave = false;
  await review(revision, 'restore');
  db.exec("CREATE TRIGGER synthetic_learning_failure BEFORE INSERT ON skill BEGIN SELECT RAISE(ABORT, 'Synthetic learning failure'); END");
  await assert.rejects(trace(), /Synthetic learning failure/);
  db.close();
  console.log(JSON.stringify({ before, afterUnchanged, revision, first: first.id, second: second.id,
    raced: raced.id, restored: restored.id, recordingFailure: 'refused', learningFailure: 'refused' }));
}

test('verified traces retain evidence and truthful learning outcomes, including state races and failures', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'isaiah-trace-'));
  try {
    const { stdout } = await promisify(execFile)(process.execPath,
      ['--input-type=module', '-e', '(' + traceFixture.toString() + ')()'], {
        timeout: 15_000, env: { ...process.env, ISAIAH_TEST_DIRECTORY: directory,
          ISAIAH_TEST_DEVELOPER: new URL('../standalone/developer.mjs', import.meta.url).href }
      });
    const evidence = JSON.parse(stdout);
    assert.equal(evidence.before, 1);
    assert.equal(evidence.afterUnchanged, 1);
    const reopened = openLedger(directory);
    const first = JSON.parse(await readFile(join(directory, evidence.first + '.json'), 'utf8'));
    const second = JSON.parse(await readFile(join(directory, evidence.second + '.json'), 'utf8'));
    assert.equal(first.learningReview.status, 'proposed');
    assert.equal(second.learningReview.status, 'unchanged');
    // The fixture restored its baseline after checking persistence and failure propagation.
    assert.equal(reopened.use(first.compatibility), null);
    reopened.close();
    t.diagnostic(JSON.stringify(evidence));
  } finally { await rm(directory, { recursive: true }); }
});

test('teaching modes affect cues, and version boundaries and citation IDs constrain answers', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'isaiah-docs-'));
  const ledger = openLedger(directory);
  try {
    const teaching = createTeaching(ledger, 'iris-for-health');
    for (const topic of ['monitor','adapters','hl7','fhir','dicom']) {
      const lesson=await teaching.explain({topic});
      assert.equal(lesson.kind,'starter');
      assert.equal(lesson.docs[0].version,'2026.2');
      assert.ok(lesson.docs[0].url.startsWith('https://docs.intersystems.com/irisforhealth20262/'));
    }
    const reference = { kind: 'run', id: 'fixture' };
    assert.deepEqual(teaching.cue('session', reference).evidence, reference);
    teaching.preference({ mode: 'focus' });
    assert.equal(teaching.cue('session', reference), null);
    assert.equal((await teaching.explain({ topic: 'session' })).kind, 'starter');
    teaching.preference({ mode: 'companion' });
    assert.equal(teaching.cue('session', reference), null);
    teaching.preference({ mode: 'coach' });
    teaching.preference({ less: 'session' });
    assert.equal(teaching.cue('session', reference), null);
    const base = { id: 'local-test', title: 'Zyzzyva', content: 'Zyzzyva controls an example test.', edition: 'iris-for-health', section: 'Test', compatibility: 'exact' };
    teaching.importPack([{ ...base, version: '2026.2' }]);
    assert.equal((await teaching.explain({ question: 'zyzzyva' }, assert.fail)).kind, 'unsupported');
    teaching.importPack([{ ...base, version: '2026.3.0AI.154.0' }]);
    assert.equal((await teaching.explain({ question: 'zyzzyva' }, async () => ({ answer: 'Unbound answer', sources: ['foreign'] }))).kind, 'unsupported');
    const actual = await teaching.explain({ question: 'zyzzyva' }, async () => ({ answer: 'An example control.', sources: [base.id] }));
    assert.equal(actual.sources[0].version, '2026.3.0AI.154.0');
  } finally { ledger.close(); await rm(directory, { recursive: true }); }
});
