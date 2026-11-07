function fail(reason) {
  return { status: 'fail', reason };
}

export function verify(incident, result, independent) {
  const { decision, branchReceipt, audit } = result ?? {};
  if (!decision || !branchReceipt || !Array.isArray(audit) || independent?.incident !== incident) {
    return fail('The decision, audit, or independent incident receipt is missing.');
  }
  const references = ['trace:' + incident, 'receipts:' + incident];
  const observed = audit.find(entry => entry.tool === 'ReadIncident' && entry.input?.incident === incident &&
    entry.output?.incident === incident && references.every(ref => entry.output.references?.includes(ref)));
  if (!observed || !Array.isArray(decision.evidence) || decision.evidence.length !== references.length ||
      !references.every(ref => decision.evidence.includes(ref))) {
    return fail('The decision did not cite the trace and receipts from an observed scoped tool call.');
  }

  const { incomingPriority, predicate, requested, selected, receipts, branch } = independent;
  if (!incomingPriority || !predicate || !requested || !selected || !Array.isArray(receipts) || !branch) {
    return fail('The production has incomplete independent readback.');
  }
  const delivered = receipts.filter(receipt => receipt.status === 'delivered');
  if (delivered.length !== 1 || delivered[0].destination === requested) {
    return fail('The receipts do not establish a single misdelivery.');
  }
  const ruleMismatch = incomingPriority !== predicate && selected !== requested && delivered[0].destination === selected;
  const downstreamFallback = incomingPriority === predicate && selected === requested &&
    receipts.some(receipt => receipt.destination === selected && receipt.status === 'unavailable');
  if (!ruleMismatch && !downstreamFallback) return fail('The expected fixture evidence is incomplete or contradictory.');
  const expected = ruleMismatch
    ? { finding: 'rule_mismatch', branch: 'diagnostic' }
    : { finding: 'downstream_fallback', branch: 'review' };
  if (decision.finding !== expected.finding || decision.branch !== expected.branch ||
      branch.mode !== expected.branch || branchReceipt.mode !== branch.mode) {
    return fail('The agent finding or executed branch disagrees with the independent production readback.');
  }
  const proposal = decision.proposal;
  const expectedProposal = ruleMismatch
    ? { action: 'align_match_priority', from: predicate, to: incomingPriority }
    : { action: 'review_destination_availability', from: selected, to: '' };
  if (!proposal || Object.entries(expectedProposal).some(([key, value]) => proposal[key] !== value)) {
    return fail('The proposed correction or review disagrees with the independent production readback.');
  }
  if (expected.branch === 'diagnostic' &&
      (branch.observedMatchPriority !== predicate || branchReceipt.observedMatchPriority !== predicate)) {
    return fail('The diagnostic branch did not read back the deployed predicate.');
  }
  return {
    status: 'pass',
    reason: ruleMismatch ? 'The deployed comparison missed the incoming priority and the selected destination received the message.'
      : 'The router selected the requested destination. Its unavailable receipt and the Standard delivery establish downstream fallback.',
    expected: { ...expected, proposal: expectedProposal },
    independent
  };
}
import { isDeepStrictEqual } from 'node:util';


export function repairBaseline(run) {
  const source = run?.verification?.independent;
  if (run?.incident !== 'R17' || !(run.metrics?.modelResponses > 0) || !source) return null;
  const proposal = { action: 'align_match_priority', from: source.predicate, to: source.incomingPriority };
  const evidenceOnly = { ...run, decision: { ...run.decision, proposal } };
  return verify(run.incident, evidenceOnly, source).status === 'pass' ? proposal : null;
}

export function verifyReplay(run, attempt, evidence) {
  const source = run.verification.independent;
  const before = evidence?.before?.incident;
  const control = evidence?.before?.control;
  const replay = evidence?.replay;
  if (evidence?.id !== attempt.id || evidence.sourceRun !== run.id ||
      before?.incident !== run.incident || control?.incident !== 'R29' || !replay) {
    return fail('The replay evidence does not identify the approved source and control.');
  }
  if (before.router?.matchPriority !== source.predicate || before.router?.selectedDestination !== source.selected ||
      before.ingress?.priority !== source.incomingPriority || before.ingress?.requestedDestination !== source.requested ||
      !isDeepStrictEqual(before.receipts, source.receipts) || !isDeepStrictEqual(evidence.before, evidence.after)) {
    return fail('The original incident or control changed or no longer matches the source run.');
  }
  if (replay.router?.matchPriority !== attempt.to || replay.router?.selectedDestination !== source.requested ||
      !isDeepStrictEqual(replay.ingress, before.ingress) ||
      !isDeepStrictEqual(replay.receipts, [{ destination: source.requested, status: 'delivered' }])) {
    return fail('The candidate did not deliver the replay to the requested destination.');
  }
  return { status: 'pass', reason: 'The synthetic replay delivered to Express. The original R17 and R29 receipts are unchanged.' };
}
