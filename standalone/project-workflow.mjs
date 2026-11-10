import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { checkProjectPatch, projectFacts } from './project.mjs';
import { patchIdentity } from './ledger.mjs';
import { syntheticDevelopmentContract, verifyDevelopmentPlan } from './development-plan.mjs';
import { syntheticApplication, syntheticEmitterRevision } from './synthetic-app.mjs';

export function createProjectWorkflow({ project, ledger, directory, persist, readRun, assist }) {
  const error = text => { throw Object.assign(new Error(text), { statusCode: 409 }); };
  const exact = (data, names) => { if (!data || Object.keys(data).some(k => !names.includes(k))) error('Unexpected project action fields.'); };
  const contextScope = 'context-v1/' + project.scope, patchScope = 'patch-v1/' + project.scope;
  const scopedRun = async (id, kind) => {
    const run = await readRun(id);
    if (!run || run.kind !== kind || run.compatibility !== project.scope) error('Evidence is outside the selected project.');
    return run;
  };
  async function propose(key, content) {
    const patch = await checkProjectPatch({ project, directory: join(directory, 'project-checks'), key, content });
    const run = { id: randomUUID(), started: Date.now(), kind: 'project-patch', compatibility: project.scope, active: false,
      phase: 'review', status: 'Syntax checked · runtime behavior unverified', patch,
      verification: { status: 'pass', claim: 'syntax-only', runtimeBehavior: 'unverified' }, metrics: { modelRequests: 0, modelResponses: 0 } };
    await persist(run);
    if (patch.before === patch.after) {
      run.phase = 'unchanged'; run.patchReview = { status: 'unchanged', revision: null, evidence: { kind: 'run', id: run.id } };
      await persist(run); return run;
    }
    const review = ledger.proposePatch(run);
    run.patchReview = { status: review.status, revision: review.revision, evidence: { kind: 'run', id: run.id } };
    await persist(run);
    return run;
  }
  async function handle(data) {
    if (data.operation === 'design') {
      exact(data,['operation','objective']);
      if (typeof data.objective !== 'string' || !data.objective.trim() || data.objective.length > 1500) error('Enter a bounded synthetic development objective.');
      const selected = ledger.use(contextScope), snapshot = await project.snapshot('mapping');
      if (!snapshot.permissions.design || !assist) error('Native design is not enabled for this selected project.');
      const included = selected?.guidance === JSON.stringify(projectFacts(snapshot));
      const context = { objective: data.objective, project: projectFacts(snapshot), source: snapshot.selected,
        ...(included ? {reviewedProjectContext:JSON.parse(selected.guidance)} : {}), contract: syntheticDevelopmentContract };
      if (Buffer.byteLength(JSON.stringify(context)) > 16000) error('Selected source/context exceeds the bounded native design budget.');
      const response = await assist('develop',context);
      const run = { id:response.id,started:response.started,kind:'development-plan',compatibility:project.scope,active:false,
        status:'Native proposal · application not qualified',decision:response.result,metrics:response.metrics,provider:response.provider,
        context:{revision:selected?.id??null,included:!!included} };
      try {
        run.verification=verifyDevelopmentPlan(response.result);
        run.proposal={kind:'constrained-template',emitterRevision:syntheticEmitterRevision,files:Object.entries(syntheticApplication(response.result)).map(([path,content])=>({path,content})),automaticApply:false};
      } catch(error) {
        run.verification={status:'fail',claim:'bounded-plan-contract',reason:error.message};
      }
      await persist(run);return run;
    }
    if (['map','read'].includes(data.operation)) {
      exact(data, data.operation === 'map' ? ['operation'] : ['operation','key']);
      if (data.operation === 'read' && typeof data.key !== 'string') error('Choose an approved source key.');
      const selected = ledger.use(contextScope), snapshot = await project.snapshot(data.key);
      const included = selected?.guidance === JSON.stringify(projectFacts(snapshot));
      const run = { id: randomUUID(), started: Date.now(), kind: 'project-read', compatibility: project.scope, active: false,
        status: 'Approved local source inspected', project: snapshot, verification: { status: 'pass', claim: 'approved-file-bytes', targetRuntime: 'not-attested' },
        context: { revision: selected?.id ?? null, included: !!included }, metrics: { modelRequests: 0, modelResponses: 0 } };
      await persist(run); return run;
    }
    if (data.operation === 'context-propose') {
      exact(data,['operation','runId']);
      const run = await scopedRun(data.runId,'project-read'), review = ledger.proposeProject(run);
      run.contextReview = { status: review.status, revision: review.revision, evidence: { kind: 'run', id: run.id } };
      await persist(run); return review;
    }
    if (['context-accept','context-restore'].includes(data.operation)) {
      exact(data,['operation','revision']);
      return ledger.review(contextScope,data.revision,data.operation.slice(8));
    }
    if (data.operation === 'patch-propose') {
      exact(data,['operation','key','content']); return propose(data.key,data.content);
    }
    if (data.operation === 'patch-reverse') {
      exact(data,['operation','runId']);
      const prior = await scopedRun(data.runId,'project-patch');
      const snapshot = await project.snapshot(prior.patch.key);
      if (snapshot.selected.sha256 !== prior.patch.after) error('The prior applied bytes are no longer current.');
      return propose(prior.patch.key,prior.patch.original);
    }
    if (['patch-accept','patch-apply','patch-reconcile'].includes(data.operation)) {
      exact(data,['operation','runId','revision']);
      const run = await scopedRun(data.runId,'project-patch');
      if (run.patchReview?.revision !== data.revision) error('Select the exact proposed revision.');
      if (data.operation === 'patch-accept') return ledger.review(patchScope,data.revision,'accept');
      const accepted = ledger.use(patchScope);
      if (accepted?.id !== data.revision || accepted.guidance !== patchIdentity(run.patch)) error('Explicit acceptance of this exact patch is required.');
      if (data.operation === 'patch-apply') {
        run.phase = 'applying'; await persist(run);
        const result = await project.replace(run.patch, action => ledger.withAcceptedPatch(patchScope,data.revision,patchIdentity(run.patch),action));
        run.phase = 'applied'; run.application = result; await persist(run); return run;
      }
      const snapshot = await project.snapshot(run.patch.key), current = snapshot.selected.sha256;
      run.phase = current === run.patch.after ? 'applied' : current === run.patch.before ? 'not-applied' : 'review';
      run.reconciliation = { current, status: run.phase, actionRepeated: false };
      await persist(run); return run;
    }
    error('Unsupported project operation.');
  }
  return { handle };
}
