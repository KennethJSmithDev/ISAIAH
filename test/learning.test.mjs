import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { createLearning } from '../learning.mjs';

const configured = !!(process.env.ISAIAH_HERMES_SOURCE && process.env.ISAIAH_HERMES_PYTHON);

test('the isolated Hermes review survives restart, checks applicability and restores the prior skill', {
  skip: configured ? false : 'Set ISAIAH_HERMES_SOURCE and ISAIAH_HERMES_PYTHON for the real Hermes check.',
  timeout: 60_000
}, async t => {
  await mkdir('.local', { recursive: true });
  const dataDir = await mkdtemp(join('.local', 'learning-test-'));
  const compatibility = 'IRIS-154/ISAIAH/routing-v1';
  const options = { dataDir, compatibility };
  const start = await createLearning(options);
  const baseline = await start.context();
  assert.equal(baseline.applicability, 'baseline', start.snapshot().summary);
  const run = {
    id: randomUUID(),
    incident: 'R17',
    contract: { compatibility },
    verification: { status: 'pass' }
  };
  // This is a test of learning storage. The live IRIS verifier is exercised separately.
  assert.equal(await start.propose({ ...run, verification: { status: 'fail' } }), false);
  assert.equal(await start.propose(run), true);
  const review = start.snapshot().reviews[0];
  assert.equal(review.status, 'proposed');
  assert.deepEqual(review.evidence, [`run:${run.id}#verification`, `run:${run.id}#decision`]);
  assert.equal(review.expectedRevision, baseline.revisions.skill);
  const accept = { id: review.id, action: 'accept' };

  const changedContract = await createLearning({ ...options, compatibility: 'IRIS-154/ISAIAH/routing-v2' });
  assert.equal(changedContract.snapshot().reviews[0].actions.accept, undefined);
  await assert.rejects(changedContract.change(accept), /scope or expected prior revision changed/);

  const profile = join(dataDir, 'hermes-learning');
  const skill = join(profile, 'skills', 'isaiah-routing-evidence', 'SKILL.md');
  const original = await readFile(skill);
  await writeFile(skill, Buffer.concat([original, Buffer.from('\nTest-owned revision drift.\n')]));
  try {
    await assert.rejects(start.change(accept), /scope or expected prior revision changed/);
    assert.equal((await start.context()).guidance, '');
  } finally { await writeFile(skill, original); }

  const reviewStarted = performance.now();
  const accepted = (await start.change(accept)).reviews[0];
  t.diagnostic(`Hermes accepted review in ${Math.round(performance.now() - reviewStarted)} ms.`);
  assert.equal(accepted.status, 'accepted');
  assert.match(accepted.ledgerEntry, /^[0-9a-f]{12}$/);
  await assert.rejects(start.change(accept), /no longer proposed/);

  const fresh = await createLearning(options);
  const learned = await fresh.context();
  assert.equal(learned.applicability, 'applicable');
  assert.equal(learned.revisions.skill, accepted.revision);
  assert.equal(learned.revisions.memory, baseline.revisions.memory);
  assert.notEqual(learned.revisions.context, baseline.revisions.context);
  assert.equal(learned.guidance, accepted.lesson);
  t.diagnostic(`Active guidance measured ${baseline.bytes} baseline bytes and ${learned.bytes} reviewed bytes.`);
  const stale = await changedContract.context();
  assert.equal(stale.applicability, 'inapplicable');
  assert.equal(stale.guidance, baseline.guidance);
  assert.equal(stale.revisions.skill, baseline.revisions.skill);
  assert.deepEqual(changedContract.snapshot().reviews[0].evidence, review.evidence);

  const restored = (await fresh.change({ id: review.id, action: 'restore' })).reviews[0];
  assert.equal(restored.status, 'restored');
  assert.match(restored.restoreEntry, /^[0-9a-f]{12}$/);
  assert.deepEqual((await fresh.context()).revisions, baseline.revisions);
  assert.deepEqual(restored.evidence, review.evidence);

  const policy = join(profile, 'config.yaml');
  const reviewPolicy = await readFile(policy);
  await writeFile(policy, 'skills:\n  write_approval: false\n');
  try {
    assert.equal((await fresh.context()).applicability, 'unavailable');
    assert.match(fresh.snapshot().summary, /reviewed learning policy or skill ledger is disabled/);
  } finally { await writeFile(policy, reviewPolicy); }
});

test('a qualified correction can revise and restore an already accepted skill', {
  skip: !configured, timeout: 60_000
}, async () => {
  await mkdir('.local', { recursive: true });
  const dataDir = await mkdtemp(join('.local', 'repair-learning-test-'));
  const compatibility = 'IRIS-154/ISAIAH/routing-v1';
  const options = { dataDir, compatibility };
  const store = await createLearning(options);
  const run = { id: randomUUID(), incident: 'R17', contract: { compatibility }, verification: { status: 'pass' } };
  assert.equal(await store.propose(run), true);
  const original = store.snapshot().reviews[0];
  await store.change({ action: 'accept', id: original.id });
  const prior = await store.context();
  const receipt = { id: randomUUID(), sourceRun: run.id, status: 'fail', correctedFrom: { value: 'P2' } };
  run.repairs = [receipt];
  assert.equal(await store.proposeRepair(run, receipt), false);
  receipt.status = 'pass';
  assert.equal(await store.proposeRepair(run, receipt), true);
  const correction = store.snapshot().reviews[0];
  assert.equal(correction.expectedRevision, prior.revisions.skill);
  assert.deepEqual(await store.context(), prior);
  assert.ok(correction.evidence.includes(`run:${run.id}#repair:${receipt.id}`));
  await store.change({ action: 'accept', id: correction.id });
  const fresh = await createLearning(options);
  const revised = await fresh.context();
  assert.equal(revised.repairLesson, true);
  assert.equal(revised.revisions.skill, correction.revision);
  await fresh.change({ action: 'restore', id: correction.id });
  assert.deepEqual(await fresh.context(), prior);
});
