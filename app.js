import { api, eventDriven, requiresOperatorKey } from './provider.js';

const byId = id => document.getElementById(id);
let state;
let busy = false;
let localError = '';
let repairRunId;
let changeRecord;
let changeError = '';
let changeBusy = false;
let observing = false;
let visibilityVersion = 0;
let refreshPromise;
let refreshAgain = false;
let refreshTimer;
let receiptId = eventDriven ? '' : (sessionStorage.getItem('isaiah.changeId') || '');
const passingReplay = run => run?.active ? undefined : run?.repairs?.findLast(receipt => receipt.status === 'pass');
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
  const accountSettings = byId('chatgpt-settings');
  if (accountSettings) {
    const account = scope.provider?.account;
    accountSettings.hidden = scope.provider?.id !== 'chatgpt-plan' && !account;
    const link = accountSettings.querySelector('a');
    link.href = account?.managementOrigin ?? 'http://127.0.0.1:18759/';
    link.textContent = account ? `Manage ${account.name} account · experimental bridge` : 'Manage ChatGPT account and plan usage';
  }
  byId('scope').textContent = JSON.stringify(scope, null, 2);
  byId('start').disabled = !observing || busy || !environment.ready || !!run?.active;
  byId('cancel').disabled = !observing || busy || !run?.cancellable;
  byId('feedback').textContent = localError;
  byId('run-status').textContent = run ? run.status + ' · ' + run.incident : 'No investigation started.';
  // Presentation reads the existing run; it adds no verification or authority.
  byId('run-identity').textContent = run ? 'Run ' + run.id : 'No run selected.';
  byId('branch-identity').textContent = run?.branchReceipt
    ? 'Recorded branch: ' + run.branchReceipt.mode + ' · ' + run.branchReceipt.operation
    : 'No branch receipt recorded.';
  byId('run-metrics').textContent = run?.metrics
    ? (run.metrics.modelResponses ?? 'Unknown') + ' recorded model responses · ' + (run.audit?.length ?? 'Unknown') + ' tool audit entries'
    : '';
  byId('run-status').dataset.tone = run?.active ? 'working'
    : run?.verification?.status === 'fail' || run?.phase === 'failed' ? 'failed'
    : run?.verification?.status === 'pass' ? (run.branchReceipt?.mode === 'review' ? 'review' : 'verified') : 'idle';
  const activity = byId('activity'), activityKey = JSON.stringify(run?.activity || []);
  if (activity.dataset.snapshot !== activityKey) {
    activity.dataset.snapshot = activityKey;
    activity.replaceChildren();
    for (const event of run?.activity || []) append(activity, 'li', event);
  }
  const outcome = byId('outcome');
  const outcomeKey = JSON.stringify([run?.decision, run?.verification, run?.learningUse, run?.branchReceipt]);
  if (outcome.dataset.snapshot !== outcomeKey) {
  outcome.dataset.snapshot = outcomeKey;
  outcome.replaceChildren();
  if (run?.decision) {
    const { finding, proposal } = run.decision;
    const titles = { rule_mismatch: 'Routing condition mismatch', downstream_fallback: 'Downstream fallback', insufficient_evidence: 'Insufficient evidence' };
    append(outcome, 'p', 'Agent finding: ' + (titles[finding] || finding)).className = 'agent-finding';
    if (proposal?.action === 'align_match_priority') {
      append(outcome, 'p', 'Proposed fixture correction: compare with ' + proposal.to + ' instead of ' + proposal.from + '.').className = 'agent-proposal';
    }
    if (proposal?.action === 'review_destination_availability') {
      append(outcome, 'p', 'Recommended review: ' + proposal.from + ' availability and downstream fallback.').className = 'agent-proposal';
    }
    if (proposal?.action === 'request_more_evidence') append(outcome, 'p', 'Recommended review: gather more evidence.').className = 'agent-proposal';
  }
  if (run?.verification) {
    const verified = append(outcome, 'p', 'Independent verification: ' + run.verification.status + ' · ' + run.verification.reason);
    verified.className = 'verification-result';
    verified.dataset.status = run.verification.status;
  }
  if (run?.branchReceipt?.notification) {
    const status = run.branchReceipt.notification.status;
    append(outcome, 'p', 'Local review notice at dispatch: ' + status + '. ' +
      (status === 'written' ? 'The synthetic outbox file was written; delivery and approval are not implied.'
        : 'Inspect the scoped notification record; an IRIS administrator can retry safely.'));
  }
  if (run?.learningUse) append(outcome, 'p', run.learningUse.confirmed
    ? 'The agent followed the reviewed comparison order.'
    : 'The reviewed revision was loaded. Its comparison order was not observed.');
  if (run?.learningUse?.repairCheck !== undefined) append(outcome, 'p', run.learningUse.repairCheck
    ? 'The agent reported the reviewed replay requirement.'
    : 'The repair lesson was loaded. Its replay requirement was not reported.');
  }
  const showRepair = !!run?.repairAvailable && !run.active;
  byId('repair-form').hidden = !showRepair;
  byId('repair-qualify').disabled = !observing || busy || !environment.ready || (run?.repairs?.length ?? 0) >= 6;
  if (showRepair && repairRunId !== run.id) {
    repairRunId = run.id;
    byId('repair-value').value = run.decision.proposal?.to || '';
  }
  const repairs = byId('repair-outcome');
  const repairKey = JSON.stringify([run?.id, run?.repairs, learning.reviews, busy, observing]);
  if (repairs.dataset.snapshot !== repairKey) {
  repairs.dataset.snapshot = repairKey;
  repairs.replaceChildren();
  for (const receipt of run?.repairs || []) {
    append(repairs, 'p', (receipt.status === 'pass' ? 'Qualified synthetic repair' : 'Replay ' + receipt.status)
      + ' · ' + receipt.from + ' → ' + receipt.to + '. ' + receipt.reason);
  }
  const correction = run?.repairs?.findLast(receipt => receipt.status === 'pass' && receipt.correctedFrom);
  if (correction && !learning.reviews.some(review => review.kind === 'repair')) {
    const stage = append(repairs, 'button', 'Prepare correction lesson');
    stage.disabled = busy || !observing;
    stage.addEventListener('click', () => change('/api/learning', { action: 'propose-repair', id: correction.id, runId: run.id }));
  }
  }
  const evidence = run ? JSON.stringify(run, null, 2) : 'No evidence recorded.';
  if (byId('evidence').textContent !== evidence) byId('evidence').textContent = evidence;
  renderChange();
  byId('lesson').textContent = learning.summary;
  const reviews = byId('reviews');
  const reviewKey = JSON.stringify([learning.reviews, observing, busy]);
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
      button.disabled = busy || !observing;
      button.addEventListener('click', () => change('/api/learning', { action, id: review.id }));
    }
  }
}
function renderChange() {
  const enabled = !!state?.environment.applyEnabled;
  const { plan, fingerprint, phase, commit, verification, current } = changeRecord ?? {};
  byId('change-panel').hidden = !enabled && !receiptId;
  byId('plan-apply').disabled = !observing || changeBusy || !enabled || !passingReplay(state?.run);
  byId('plan-rollback').disabled = !observing || changeBusy || !enabled || plan?.kind !== 'apply' || !commit || current?.revision !== commit.revision;
  byId('read-change').disabled = changeBusy;
  byId('approve-form').hidden = phase !== 'planned';
  byId('approve-change').disabled = !observing || changeBusy || !enabled;
  byId('execute-change').disabled = !observing || changeBusy || !enabled || phase !== 'approved';
  byId('verify-change').disabled = !observing || changeBusy || !enabled || phase !== 'committed';
  byId('change-status').textContent = changeError || (plan
    ? `${plan.kind} · ${phase} · ${plan.before.value} v${plan.before.revision} → ${plan.after.value} v${plan.after.revision} · ${plan.expectedDestination} expected · `
      + `sandbox ${plan.target.sandbox} · fingerprint ${fingerprint} · deployed ${current.value} v${current.revision}`
      + (verification ? ` · delivery ${verification.status}` : '')
    : (receiptId ? 'Read the receipt for the retained ID before continuing.' : 'No change loaded.'));
  const evidence = changeRecord ? JSON.stringify(changeRecord, null, 2) : 'No receipt loaded.';
  if (byId('change-evidence').textContent !== evidence) byId('change-evidence').textContent = evidence;
}
async function changeSandbox(data, id = data?.id) {
  if (changeBusy || !id || (data && !observing)) return;
  changeBusy = true;
  changeError = '';
  if (receiptId !== id) changeRecord = undefined;
  receiptId = byId('change-receipt-id').value = id;
  if (!eventDriven) sessionStorage.setItem('isaiah.changeId', id);
  renderChange();
  const version = visibilityVersion;
  try {
    const receipt = data ? await api('/api/changes', data) : await api('/api/changes/' + encodeURIComponent(id));
    if (version !== visibilityVersion || document.hidden) {
      changeRecord = undefined;
      changeError = `Read the receipt for ${id} before continuing.`;
    } else changeRecord = receipt;
  }
  catch (error) {
    changeRecord = undefined;
    changeError = `${error.message} Read the receipt for ${id} before continuing.`;
    if (data) observing = false;
  } finally {
    changeBusy = false;
    renderChange();
    if (!observing && !document.hidden) await reconcile();
    scheduleRefresh();
  }
}
let requestSequence = 0;
async function refresh() {
  if (document.hidden) return false;
  if (refreshPromise) { refreshAgain = true; return refreshPromise; }
  refreshPromise = (async () => {
    let ok = false;
    do {
      refreshAgain = false;
      const sequence = ++requestSequence;
      try {
        const next = await api('/api/state');
        if (sequence !== requestSequence || document.hidden) continue;
        state = next;
        render();
        ok = true;
      } catch {
        if (sequence !== requestSequence) continue;
        observing = false;
        if (state) render();
        byId('connection').textContent = 'Backend unavailable';
        byId('start').disabled = true;
        byId('cancel').disabled = true;
        byId('repair-qualify').disabled = true;
        ok = false;
      }
    } while (refreshAgain && !document.hidden);
    return ok;
  })();
  try { return await refreshPromise; } finally { refreshPromise = undefined; }
}

function scheduleRefresh() {
  clearTimeout(refreshTimer);
  if (document.hidden || eventDriven) return;
  const delay = state?.run?.active ? 1200 : (['planned', 'approved', 'committed'].includes(changeRecord?.phase) ? 5000 : 15000);
  refreshTimer = setTimeout(async () => { if (observing) await refresh(); else await reconcile(); scheduleRefresh(); }, delay);
}

async function reconcile() {
  const version = ++visibilityVersion;
  observing = false;
  if (state) render();
  if (changeBusy) return;
  const ok = await refresh();
  if (!ok || document.hidden || version !== visibilityVersion) return;
  if (receiptId) {
    try {
      const receipt = await api('/api/changes/' + encodeURIComponent(receiptId));
      if (document.hidden || version !== visibilityVersion) return;
      changeRecord = receipt;
      changeError = '';
    } catch (error) {
      changeRecord = undefined;
      changeError = `${error.message} Read the receipt for ${receiptId} before continuing.`;
      render();
      return;
    }
  }
  observing = true;
  render();
}
async function change(path, data) {
  if (busy || !observing) return;
  busy = true;
  // An observation started before a mutation must not re-enable controls with stale state.
  requestSequence++;
  localError = '';
  render();
  try { await api(path, data); }
  catch (error) { localError = error.message; }
  finally { busy = false; await refresh(); scheduleRefresh(); }
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
  const operatorKey = requiresOperatorKey ? byId('operator-key').value : '';
  if (requiresOperatorKey) byId('operator-key').value = '';
  changeSandbox({ operation: 'approve', id: changeRecord.plan.id, fingerprint: changeRecord.fingerprint, operatorKey });
});
for (const operation of ['execute', 'verify']) {
  byId(operation + '-change').addEventListener('click', () => changeSandbox({ operation, id: changeRecord.plan.id, fingerprint: changeRecord.fingerprint }));
}
const lastPanelFocus = new Map();
document.addEventListener('focusin', event => {
  const panel = event.target.closest?.('[data-panel]');
  if (panel && event.target.tagName !== 'H2') lastPanelFocus.set(panel.dataset.panel, event.target);
});
for (const button of document.querySelectorAll('[data-view]')) button.addEventListener('click', () => {
  const view = button.dataset.view;
  document.querySelector('.workspace').dataset.mobileView = view;
  for (const item of document.querySelectorAll('[data-view]')) item.setAttribute('aria-pressed', String(item === button));
  const previous = lastPanelFocus.get(view);
  if (previous?.isConnected && !previous.disabled) previous.focus();
  else document.querySelector(`[data-panel="${view}"] h2`)?.focus();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    visibilityVersion++;
    requestSequence++;
    observing = false;
    clearTimeout(refreshTimer);
    if (state) render();
  } else void reconcile().finally(scheduleRefresh);
});
await reconcile();
scheduleRefresh();
