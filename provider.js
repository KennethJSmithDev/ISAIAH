// Simulation only: no fetch, credentials, real approvals, IRIS or model calls.
export const eventDriven = true;
export const requiresOperatorKey = false;
let run = null, receipt = null, deployed = { value: 'PRIORITY', revision: 1 };
const clone = value => structuredClone(value);
const fail = message => { throw new Error('SIMULATION: ' + message); };
const id = () => crypto.randomUUID();
const fixtures = {
  R17: { finding: 'rule_mismatch', branch: 'diagnostic', proposal: { action: 'align_match_priority', from: 'PRIORITY', to: 'P1' }, route: 'Standard', destination: 'Standard delivered' },
  R29: { finding: 'downstream_fallback', branch: 'review', proposal: { action: 'review_destination_availability', from: 'Express', to: '' }, route: 'Express unavailable', destination: 'Standard delivered after fallback' }
};

export async function api(path, data) {
  if (path === '/api/state' && data === undefined) return clone({
    environment: { target: 'SIMULATION · synthetic fixtures', runtime: 'No IRIS or model connection', connection: 'Local simulation', ready: true, applyEnabled: true },
    scope: { data: 'Synthetic only', disclaimer: 'Simulation; no native execution, real approval, or real deployment.' },
    run, learning: { summary: 'Simulation only. No procedure revision is created or accepted.', reviews: [] }
  });
  if (path === '/api/start' && data) {
    const f = fixtures[data.incident];
    if (!f || !data.objective?.trim()) fail('Select a fixture and provide an objective.');
    run = { id: id(), incident: data.incident, status: 'Simulated result', active: false, cancellable: false,
      activity: ['SIMULATION: local fixture selected', 'SIMULATION: example evidence compared'],
      decision: { finding: f.finding, branch: f.branch, proposal: f.proposal },
      branchReceipt: { mode: f.branch, operation: 'SIMULATION: example branch record' },
      verification: { status: 'pass', reason: 'SIMULATED comparison against example fixtures; no verifier ran.' },
      evidence: { recordedRoute: f.route, destinationReceipt: f.destination, provenance: 'authored example, not a runtime receipt' },
      repairAvailable: data.incident === 'R17', repairs: [] };
    return { simulated: true };
  }
  if (path === '/api/repair' && data && run?.incident === 'R17') {
    const pass = data.to === 'P1';
    run.repairs.push({ id: id(), status: pass ? 'pass' : 'fail', from: 'PRIORITY', to: data.to,
      reason: pass ? 'SIMULATION: example replay matches the requested fixture.' : 'SIMULATION: the example replay does not match.' });
    return { simulated: true };
  }
  if (path.startsWith('/api/changes/') && data === undefined) {
    if (!receipt || path.slice('/api/changes/'.length) !== receipt.plan.id) fail('No matching simulated receipt.');
    return clone(receipt);
  }
  if (path === '/api/changes' && data) {
    if (data.operation === 'plan-apply') {
      if (run?.incident !== 'R17' || !run.repairs.some(r => r.id === data.replayId && r.status === 'pass')) fail('A passing simulated replay is required.');
      receipt = { plan: { id: data.id, kind: 'apply', before: clone(deployed), after: { value: 'P1', revision: deployed.revision + 1 }, expectedDestination: 'Express', target: { sandbox: 'SIMULATION ONLY' } }, fingerprint: 'SIMULATED-NOT-AN-APPROVAL', phase: 'planned', current: clone(deployed) };
    } else if (data.operation === 'plan-rollback') {
      if (receipt?.phase !== 'verified' || receipt.plan.kind !== 'apply' || data.appliedId !== receipt.plan.id) fail('A verified simulated apply is required.');
      receipt = { plan: { id: data.id, kind: 'rollback', before: clone(deployed), after: { value: 'PRIORITY', revision: deployed.revision + 1 }, expectedDestination: 'Standard', target: { sandbox: 'SIMULATION ONLY' } }, fingerprint: 'SIMULATED-NOT-AN-APPROVAL', phase: 'planned', current: clone(deployed) };
    } else {
      if (!receipt || data.id !== receipt.plan.id || data.fingerprint !== receipt.fingerprint) fail('Simulated plan does not match.');
      if (data.operation === 'approve' && receipt.phase === 'planned') receipt.phase = 'approved';
      else if (data.operation === 'execute' && receipt.phase === 'approved') {
        deployed = clone(receipt.plan.after); receipt.phase = 'committed'; receipt.commit = clone(deployed); receipt.current = clone(deployed);
      } else if (data.operation === 'verify' && receipt.phase === 'committed') {
        receipt.phase = 'verified'; receipt.verification = { status: 'pass', note: 'SIMULATED delivery, not a real destination receipt.' };
      } else fail('Action is not available in the current simulated phase.');
    }
    return clone(receipt);
  }
  fail('This action is not available in the local simulation.');
}
