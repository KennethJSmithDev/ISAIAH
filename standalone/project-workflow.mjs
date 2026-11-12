import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { checkProjectPatch, projectFacts } from './project.mjs';
import { patchIdentity } from './ledger.mjs';
import { syntheticDevelopmentContract, verifyDevelopmentPlan } from './development-plan.mjs';
import { syntheticApplication, syntheticEmitterRevision } from './synthetic-app.mjs';
import { emitOrganizationTest } from './organization-test-emitter.mjs';
import { capabilityOpenApi } from './fhir-openapi.mjs';
import { inspectMessageTypes } from './message-types.mjs';
import { compileInterfaceSpec, interfaceEmitterRevision } from './interface-spec.mjs';

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
    if (data.operation === 'interface-plan') {
      exact(data,['operation','key']);
      if (typeof data.key !== 'string') error('Choose an approved interface specification record.');
      const snapshot = await project.snapshot(data.key);
      if (!snapshot.permissions.design) error('Interface planning is disabled for this project.');
      let spec, compiled;
      try { spec = JSON.parse(snapshot.selected.content); compiled = compileInterfaceSpec(spec); }
      catch (exception) { error(exception.message); }
      const run = { id:randomUUID(), started:Date.now(), kind:'interface-plan', compatibility:project.scope, active:false,
        source:{key:snapshot.selected.key,sha256:snapshot.selected.sha256}, decision:spec,
        proposal:{emitterRevision:interfaceEmitterRevision,files:Object.keys(compiled.files),facilityField:compiled.field,automaticApply:false},
        verification:{status:'pass',claim:'bounded-interface-spec',compilation:'not-run',delivery:'unverified'},
        metrics:{modelRequests:0,modelResponses:0} };
      await persist(run);
      return run;
    }
    if (data.operation === 'component-types') {
      exact(data,['operation','key','traceKey','component']);
      if (![data.key,data.traceKey,data.component].every(value => typeof value === 'string')) error('Choose approved source and trace records and one component.');
      const source = (await project.snapshot(data.key)).selected;
      const trace = (await project.snapshot(data.traceKey)).selected;
      let result;
      try { result = inspectMessageTypes(source.content, JSON.parse(trace.content), data.component); }
      catch (exception) { error(exception.message); }
      const run = { id:randomUUID(), started:Date.now(), kind:'component-types', compatibility:project.scope, active:false,
        records:[source,trace].map(({key,sha256}) => ({key,sha256})), ...result,
        metrics:{modelRequests:0,modelResponses:0} };
      await persist(run);
      return run;
    }
    if (data.operation === 'fhir-openapi') {
      exact(data,['operation','key']);
      if (typeof data.key !== 'string') error('Choose an approved CapabilityStatement record.');
      const capability = await project.readCapability(data.key);
      let result;
      try { result = capabilityOpenApi(capability.content); }
      catch (exception) { error(exception.message); }
      const run = { id:randomUUID(), started:Date.now(), kind:'fhir-openapi', compatibility:project.scope, active:false,
        source:{key:capability.key,sha256:capability.sha256}, ...result,
        verification:{status:'pass',claim:'advertised-interactions-only',liveBehavior:'unverified'},
        metrics:{modelRequests:0,modelResponses:0} };
      await persist(run);
      return run;
    }
    if (data.operation === 'design' || data.operation === 'test-propose') {
      exact(data,['operation','objective']);
      if (typeof data.objective !== 'string' || !data.objective.trim() || data.objective.length > 1500) error('Enter a bounded synthetic development objective.');
      const selected = ledger.use(contextScope), snapshot = await project.snapshot('mapping');
      if (!snapshot.permissions.design || !assist) error('Native design is not enabled for this selected project.');
      const included = selected?.guidance === JSON.stringify(projectFacts(snapshot));
      const context = { objective: data.objective, project: projectFacts(snapshot), source: snapshot.selected,
        ...(included ? {reviewedProjectContext:JSON.parse(selected.guidance)} : {}), contract: syntheticDevelopmentContract };
      if (Buffer.byteLength(JSON.stringify(context)) > 16000) error('Selected source/context exceeds the bounded native design budget.');
      const testProposal = data.operation === 'test-propose';
      const response = await assist(testProposal ? 'propose-test' : 'develop',context);
      if (testProposal) {
        const run = { id:response.id, started:response.started, kind:'organization-test', compatibility:project.scope, active:false,
          status:'Native test input proposed · IRIS execution pending', decision:response.result, metrics:response.metrics, provider:response.provider,
          source: snapshot.selected, verification:{status:'fail',claim:'test-input-contract',execution:'not-run'} };
        try {
          run.proposal = { ...emitOrganizationTest(response.result), automaticApply:false };
          run.verification.status = 'pass';
        } catch (error) {
          run.status = 'Native test input refused';
          run.verification.reason = error.message;
        }
        await persist(run);
        return run;
      }
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
