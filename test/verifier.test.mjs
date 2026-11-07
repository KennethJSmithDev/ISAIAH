import assert from 'node:assert/strict';
import test from 'node:test';
import { repairBaseline, verify, verifyReplay } from '../verifier.mjs';

const refs = ['trace:R17', 'receipts:R17'];
const data = {
  incident: 'R17', incomingPriority: 'P1', predicate: 'PRIORITY', requested: 'Express', selected: 'Standard',
  receipts: [{ destination: 'Standard', status: 'delivered' }],
  branch: { mode: 'diagnostic', observedMatchPriority: 'PRIORITY' }
};
const result = {
  decision: { finding: 'rule_mismatch', branch: 'diagnostic', proposal: { action: 'align_match_priority', from: 'PRIORITY', to: 'P1' }, evidence: refs },
  branchReceipt: data.branch,
  audit: [{ tool: 'ReadIncident', input: { incident: 'R17' }, output: { incident: 'R17', references: refs } }]
};
test('accepts a decision and branch corroborated by the independent records', () => {
  assert.equal(verify('R17', result, data).status, 'pass');
});
test('rejects a wrong decision even when the model called the real evidence tool', () => {
  const wrong = { ...result, decision: { ...result.decision, finding: 'downstream_fallback', branch: 'review' } };
  assert.equal(verify('R17', wrong, data).status, 'fail');
  assert.equal(verify('R17', { ...result, audit: [] }, data).status, 'fail');
  const wrongRemedy = { ...result, decision: { ...result.decision, proposal: { ...result.decision.proposal, to: 'Express' } } };
  assert.equal(verify('R17', wrongRemedy, data).status, 'fail');
  assert.equal(verify('R17', result, { ...data, receipts: [] }).status, 'fail');
});

test('repair replay needs the original and control traces and an actual Express receipt', () => {
  const run = { ...result, id: 'source', incident: 'R17', verification: { independent: data }, metrics: { modelResponses: 1 } };
  const proposed = { ...run, decision: { ...run.decision, proposal: { ...run.decision.proposal, to: 'P2' } } };
  assert.deepEqual(repairBaseline(proposed), result.decision.proposal);
  assert.equal(repairBaseline({ ...run, audit: [] }), null);
  assert.equal(repairBaseline({ ...run, incident: 'R29' }), null);
  const attempt = { id: 'replay', to: 'P1' };
  const ingress = { priority: 'P1', requestedDestination: 'Express' };
  const incident = { incident: 'R17', ingress, router: { matchPriority: 'PRIORITY', selectedDestination: 'Standard' }, receipts: data.receipts };
  const snapshot = { incident, control: { incident: 'R29', receipts: [{ destination: 'Standard', status: 'delivered' }] } };
  const evidence = {
    id: attempt.id, sourceRun: run.id, before: snapshot, after: structuredClone(snapshot),
    replay: { ingress, router: { matchPriority: 'P1', selectedDestination: 'Express' }, receipts: [{ destination: 'Express', status: 'delivered' }] }
  };
  assert.equal(verifyReplay(run, attempt, evidence).status, 'pass');
  assert.equal(verifyReplay(run, attempt, { ...evidence, replay: { ...evidence.replay, receipts: [] } }).status, 'fail');
  evidence.after.control.receipts[0].destination = 'Express';
  assert.equal(verifyReplay(run, attempt, evidence).status, 'fail');
});
