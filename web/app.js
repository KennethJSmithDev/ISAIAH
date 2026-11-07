const byId = id => document.getElementById(id);
let state;
let busy = false;
let localError = '';
let repairRunId;
let changeRecord;
let changeError = '';
let changeBusy = false;
let receiptId = sessionStorage.getItem('isaiah.changeId') || '';
const passingReplay = run => run?.active ? undefined : run?.repairs?.findLast(receipt => receipt.status === 'pass');
async function api(path, data) {
  const response = await fetch(path, data === undefined ? {} : {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Isaiah-Request': 'browser' },
    body: JSON.stringify(data)
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  return result;
}
function append(parent, element, content) {
  const node = document.createElement(element);
  node.textContent = content;
  parent.append(node);
  return node;
}
function render() {
  const { environment, run, learning, scope } = state;
  byId('target').textContent = environment.target;
  byId('runtime').textContent = environment.runtime;
  byId('connection').textContent = environment.connection;
  byId('scope').textContent = JSON.stringify(scope, null, 2);
  byId('start').disabled = busy || !environment.ready || !!run?.active;
  byId('cancel').disabled = busy || !run?.cancellable;
  byId('feedback').textContent = localError;
  byId('run-status').textContent = run ? run.status + ' · ' + run.incident : 'No investigation started.';
  byId('activity').replaceChildren();
  for (const event of run?.activity || []) append(byId('activity'), 'li', event);
  const outcome = byId('outcome');
  outcome.replaceChildren();
  if (run?.decision) {
    const { finding, proposal } = run.decision;
    const titles = { rule_mismatch: 'Routing condition mismatch', downstream_fallback: 'Downstream fallback', insufficient_evidence: 'Insufficient evidence' };
    append(outcome, 'p', 'Agent finding: ' + (titles[finding] || finding));
    if (proposal?.action === 'align_match_priority') {
      append(outcome, 'p', 'Proposed fixture correction: compare with ' + proposal.to + ' instead of ' + proposal.from + '.');
    }
    if (proposal?.action === 'review_destination_availability') {
      append(outcome, 'p', 'Recommended review: ' + proposal.from + ' availability and downstream fallback.');
    }
    if (proposal?.action === 'request_more_evidence') append(outcome, 'p', 'Recommended review: gather more evidence.');
  }
  if (run?.verification) append(outcome, 'p', 'Independent verification: ' + run.verification.status + ' · ' + run.verification.reason);
  if (run?.learningUse) append(outcome, 'p', run.learningUse.confirmed
    ? 'The agent followed the reviewed comparison order.'
    : 'The reviewed revision was loaded. Its comparison order was not observed.');
  if (run?.learningUse?.repairCheck !== undefined) append(outcome, 'p', run.learningUse.repairCheck
    ? 'The agent reported the reviewed replay requirement.'
    : 'The repair lesson was loaded. Its replay requirement was not reported.');
  const showRepair = !!run?.repairAvailable && !run.active;
  byId('repair-form').hidden = !showRepair;
  byId('repair-qualify').disabled = busy || !environment.ready || (run?.repairs?.length ?? 0) >= 6;
  if (showRepair && repairRunId !== run.id) {
    repairRunId = run.id;
    byId('repair-value').value = run.decision.proposal?.to || '';
  }
  const repairs = byId('repair-outcome');
  repairs.replaceChildren();
  for (const receipt of run?.repairs || []) {
    append(repairs, 'p', (receipt.status === 'pass' ? 'Qualified synthetic repair' : 'Replay ' + receipt.status)
      + ' · ' + receipt.from + ' → ' + receipt.to + '. ' + receipt.reason);
  }
  const correction = run?.repairs?.findLast(receipt => receipt.status === 'pass' && receipt.correctedFrom);
  if (correction && !learning.reviews.some(review => review.kind === 'repair')) {
    const stage = append(repairs, 'button', 'Prepare correction lesson');
    stage.disabled = busy;
    stage.addEventListener('click', () => change('/api/learning', { action: 'propose-repair', id: correction.id, runId: run.id }));
  }
  byId('evidence').textContent = run ? JSON.stringify(run, null, 2) : 'No evidence recorded.';
  renderChange();
  byId('lesson').textContent = learning.summary;
  const reviews = byId('reviews');
  const reviewKey = JSON.stringify(learning.reviews);
  if (reviews.dataset.snapshot === reviewKey) return;
  reviews.dataset.snapshot = reviewKey;
  reviews.replaceChildren();
  for (const review of learning.reviews) {
    const row = append(reviews, 'div', '');
    row.className = 'review';
    append(row, 'p', review.status + ' · ' + review.lesson);
    const detail = append(row, 'details', '');
    append(detail, 'summary', 'Revision, applicability and evidence');
    append(detail, 'pre', JSON.stringify(review, null, 2));
    const source = /^run:([0-9a-f-]{36})#verification$/.exec(review.evidence[0]);
    if (source) {
      const inspect = append(detail, 'button', 'Inspect source run');
      const receipt = append(detail, 'pre', '');
      inspect.addEventListener('click', async () => {
        inspect.disabled = true;
        try {
          const { decision, verification, metrics, repairs } = await api('/api/runs/' + source[1]);
          receipt.textContent = JSON.stringify({ decision, verification, metrics, repairs }, null, 2);
        } catch (error) { receipt.textContent = error.message; }
        finally { inspect.disabled = false; }
      });
    }
    for (const [action, label] of Object.entries(review.actions)) {
      const button = append(row, 'button', label);
      button.addEventListener('click', () => change('/api/learning', { action, id: review.id }));
    }
  }
}
function renderChange() {
  const enabled = !!state?.environment.applyEnabled;
  const { plan, fingerprint, phase, commit, verification, current } = changeRecord ?? {};
  byId('change-panel').hidden = !enabled && !receiptId;
  byId('plan-apply').disabled = changeBusy || !enabled || !passingReplay(state?.run);
  byId('plan-rollback').disabled = changeBusy || !enabled || plan?.kind !== 'apply' || !commit || current?.revision !== commit.revision;
  byId('read-change').disabled = changeBusy;
  byId('approve-form').hidden = phase !== 'planned';
  byId('approve-change').disabled = changeBusy || !enabled;
  byId('execute-change').disabled = changeBusy || !enabled || phase !== 'approved';
  byId('verify-change').disabled = changeBusy || !enabled || phase !== 'committed';
  byId('change-status').textContent = changeError || (plan
    ? `${plan.kind} · ${phase} · ${plan.before.value} v${plan.before.revision} → ${plan.after.value} v${plan.after.revision} · ${plan.expectedDestination} expected · `
      + `sandbox ${plan.target.sandbox} · fingerprint ${fingerprint} · deployed ${current.value} v${current.revision}`
      + (verification ? ` · delivery ${verification.status}` : '')
    : (receiptId ? 'Read the receipt for the retained ID before continuing.' : 'No change loaded.'));
  byId('change-evidence').textContent = changeRecord ? JSON.stringify(changeRecord, null, 2) : 'No receipt loaded.';
}
async function changeSandbox(data, id = data?.id) {
  if (changeBusy || !id) return;
  changeBusy = true;
  changeError = '';
  if (receiptId !== id) changeRecord = undefined;
  receiptId = byId('change-receipt-id').value = id;
  sessionStorage.setItem('isaiah.changeId', id);
  renderChange();
  try { changeRecord = data ? await api('/api/changes', data) : await api('/api/changes/' + encodeURIComponent(id)); }
  catch (error) {
    changeRecord = undefined;
    changeError = `${error.message} Read the receipt for ${id} before continuing.`;
  } finally { changeBusy = false; renderChange(); }
}
let requestSequence = 0;
async function refresh() {
  const sequence = ++requestSequence;
  try {
    const next = await api('/api/state');
    if (sequence !== requestSequence) return;
    state = next;
    render();
  } catch {
    if (sequence !== requestSequence) return;
    byId('connection').textContent = 'Backend unavailable';
    byId('start').disabled = true;
    byId('cancel').disabled = true;
    byId('repair-qualify').disabled = true;
  }
}
async function change(path, data) {
  if (busy) return;
  busy = true;
  localError = '';
  render();
  try { await api(path, data); }
  catch (error) { localError = error.message; }
  finally { busy = false; await refresh(); }
}
byId('task-form').addEventListener('submit', event => {
  event.preventDefault();
  change('/api/start', { objective: byId('task').value, incident: byId('incident').value });
});
byId('cancel').addEventListener('click', () => change('/api/cancel', {}));
byId('repair-form').addEventListener('submit', event => {
  event.preventDefault();
  change('/api/repair', { runId: state.run.id, to: byId('repair-value').value });
});
byId('change-receipt-id').value = receiptId;
byId('plan-apply').addEventListener('click', () => {
  const replay = passingReplay(state.run);
  if (replay) changeSandbox({ operation: 'plan-apply', id: crypto.randomUUID(), sourceRun: state.run.id, replayId: replay.id });
});
byId('plan-rollback').addEventListener('click', () => changeSandbox({ operation: 'plan-rollback', id: crypto.randomUUID(), appliedId: changeRecord.plan.id }));
byId('read-change').addEventListener('click', () => changeSandbox(undefined, byId('change-receipt-id').value.trim()));
byId('approve-form').addEventListener('submit', event => {
  event.preventDefault();
  const operatorKey = byId('operator-key').value;
  byId('operator-key').value = '';
  changeSandbox({ operation: 'approve', id: changeRecord.plan.id, fingerprint: changeRecord.fingerprint, operatorKey });
});
for (const operation of ['execute', 'verify']) {
  byId(operation + '-change').addEventListener('click', () => changeSandbox({ operation, id: changeRecord.plan.id, fingerprint: changeRecord.fingerprint }));
}
await refresh();
setInterval(refresh, 1200);
