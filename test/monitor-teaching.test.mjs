import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadMonitor, monitorObservation } from '../standalone/monitor.mjs';
import { openLedger } from '../standalone/ledger.mjs';
import { createTeaching } from '../standalone/teaching.mjs';

const target = { instance: '11111111-1111-1111-1111-111111111111', namespace: 'ISAIAHDEV', production: 'DevTrace.Production',
  build: '2026.3.0AI (Build 154U)', edition: 'iris-for-health', nativeHub: 1 };
const queue = { key: 'queue', kind: 'queue', name: 'Fixture Sink' };
const component = { key: 'component', kind: 'component', name: 'Fixture Sink' };
const snapshot = { target, queue: queue.name, count: 3, observedAt: 'synthetic-snapshot-clock', kind: 'queue-snapshot', audit: 'recorded', authority: 'explicit-queue-grant' };

test('monitoring projects exact audited facts into all teaching modes without granting delivery or worker health', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'isaiah-monitor-teaching-')), ledger = openLedger(directory);
  try {
    const teaching = createTeaching(ledger, 'iris-for-health');
    for (const observation of [monitorObservation(target, queue, snapshot), monitorObservation(target, component, {
      target, component: { name: component.name, class: 'DevTrace.Sink', enabled: 1, poolSize: 1, unapprovedExtra: 'must not retain' },
      observedAt: snapshot.observedAt, kind: 'component-config-snapshot', audit: 'recorded', authority: 'explicit-component-grant' })]) {
      const results = [];
      for (const mode of ['coach','focus','companion']) {
        teaching.preference({ mode }); results.push(teaching.observation(observation, { kind: 'run', id: 'synthetic-monitor-run' }));
      }
      assert.equal(new Set(results.map(r => r.facts)).size, 1);
      assert.ok(results[0].lesson); assert.equal(results[1].lesson, null); assert.ok(results[2].reaction);
      assert.match(results[0].limit, /not an independent health diagnosis/);
      assert.equal(observation.verification.independentComparison, false);
      assert.equal(observation.productionDeliveryClaim, false); assert.equal(observation.approval, false);
      assert.ok(!JSON.stringify(observation).includes('unapprovedExtra'));
    }
    for (const invalid of [{ ...snapshot, audit: 'disabled' }, { ...snapshot, count: -1 }, { ...snapshot, count: 0.5 },
      { ...snapshot, queue: 'Other queue' }, { ...snapshot, authority: 'inferred' },
      { ...snapshot, target: { ...target, instance: 'other' } }, { ...snapshot, target: { ...target, production: 'Other.Production' } }]) {
      assert.throws(() => monitorObservation(target, queue, invalid), /scope/);
    }
    assert.throws(() => monitorObservation(target, { ...queue, kind: 'toString' }, snapshot), /scope/);
  } finally { ledger.close(); await rm(directory, { recursive: true }); }
});

test('monitor profile permits only owned exact containers and configured read tools; unknown records fail before Docker', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'isaiah-monitor-profile-')), file = join(directory, 'profile.json');
  const profile = { id: 'synthetic-monitor', container: 'a'.repeat(64), image: 'sha256:' + 'b'.repeat(64), containerName: 'isaiah-synthetic-monitor',
    owner: 'synthetic-fixture', instance: target.instance, namespace: target.namespace, production: target.production,
    config: '/tmp/scoped/mcp.toml', records: [queue, component] };
  try {
    await writeFile(file, JSON.stringify(profile)); const monitor = await loadMonitor(file);
    await assert.rejects(monitor.inspect('other', 'queue'), /scope/);
    await assert.rejects(monitor.inspect(profile.id, 'unapproved'), /scope/);
    for (const invalid of [{ ...profile, containerName: 'other-project' }, { ...profile, container: '--privileged' },
      { ...profile, config: '/tmp/../private.toml' }, { ...profile, records: [{ ...queue, kind: 'Approve' }] },
      { ...profile, records: [{ ...queue, kind: 'toString' }] }, { ...profile, password: 'not-allowed-here' }]) {
      await writeFile(file, JSON.stringify(invalid)); await assert.rejects(loadMonitor(file), /scope/);
    }
  } finally { await rm(directory, { recursive: true }); }
});
