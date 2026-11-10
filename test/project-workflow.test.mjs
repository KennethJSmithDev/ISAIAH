import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, access, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openLedger } from '../standalone/ledger.mjs';
import { loadProject, projectPatchDiff } from '../standalone/project.mjs';
import { createProjectWorkflow } from '../standalone/project-workflow.mjs';

async function fixture(t, allowApply = true) {
  const home = await mkdtemp(join(tmpdir(),'isaiah-project-'));
  let ledger;
  t.after(async () => { ledger?.close(); await rm(home,{recursive:true,force:true}); });
  const source = join(home,'source'); await mkdir(source);
  const original = 'export const value = 1;\n'; await writeFile(join(source,'logic.mjs'),original);
  const config = {version:1,id:'synthetic-project',root:source,records:[{key:'logic',path:'logic.mjs'}],allowApply};
  const path = join(home,'profile.json'); await writeFile(path,JSON.stringify(config));
  const project = await loadProject(path), records = new Map(); ledger = openLedger(home);
  const state = { failAfterWrite:false, beforeApply:null };
  const persist = async run => {
    if (run.phase === 'applying') await state.beforeApply?.();
    if (run.phase === 'applied' && state.failAfterWrite) throw new Error('Synthetic lost recording response');
    records.set(run.id,structuredClone(run));
  };
  const workflow = createProjectWorkflow({project,ledger,directory:home,persist,readRun:async id=>structuredClone(records.get(id))});
  const propose = content => workflow.handle({operation:'patch-propose',key:'logic',content});
  const action = (operation,run) => workflow.handle({operation,runId:run.id,revision:run.patchReview.revision});
  return {home,source,original,config,path,project,records,ledger,state,workflow,propose,action};
}

test('project map context uses existing explicit ledger acceptance, precise facts and restoration',async t=>{
  const f=await fixture(t);const map=await f.workflow.handle({operation:'map'});
  assert.equal(map.verification.claim,'approved-file-bytes');assert.equal(map.context.included,false);
  const first=await f.workflow.handle({operation:'context-propose',runId:map.id});
  assert.equal(first.status,'proposed');
  await f.workflow.handle({operation:'context-accept',revision:first.revision});
  const fresh=await f.workflow.handle({operation:'read',key:'logic'});assert.equal(fresh.context.included,true);
  assert.equal((await f.workflow.handle({operation:'context-propose',runId:fresh.id})).status,'unchanged');
  await writeFile(join(f.source,'logic.mjs'),'export const value = 2;\n');
  const changed=await f.workflow.handle({operation:'map'});assert.equal(changed.context.included,false);
  const next=await f.workflow.handle({operation:'context-propose',runId:changed.id});await f.workflow.handle({operation:'context-accept',revision:next.revision});
  await f.workflow.handle({operation:'context-restore',revision:next.revision});
  assert.equal(f.ledger.use('context-v1/'+f.project.scope).id,first.revision);
  await assert.rejects(f.workflow.handle({operation:'context-restore',revision:next.revision}),/stale/);
  const foreign={...map,compatibility:'project-v1/foreign'};f.records.set('foreign',foreign);
  await assert.rejects(f.workflow.handle({operation:'context-propose',runId:'foreign'}),/outside/);
});

test('scope refuses traversal, private records, symlinks, unknown fields and unsupported compiler claims',async t=>{
  const f=await fixture(t);
  await assert.rejects(f.workflow.handle({operation:'read',key:'other'}),/outside/);
  await assert.rejects(f.workflow.handle({operation:'map',approve:true}),/Unexpected/);
  for(const path of ['../outside.mjs','private/logic.mjs','credentials.json','.local/hidden.py']){
    await writeFile(f.path,JSON.stringify({...f.config,records:[{key:'logic',path}]}));await assert.rejects(loadProject(f.path),/Invalid/);
  }
  await writeFile(join(f.source,'helper.test.py'),'def helper():\n    return 1\n');
  await writeFile(f.path,JSON.stringify({...f.config,records:[{key:'helper',path:'helper.test.py'}]}));
  const pythonSource=await (await loadProject(f.path)).snapshot('helper');assert.ok(pythonSource.selected.content.includes('def helper'));
  await rm(join(f.source,'logic.mjs'));await symlink(f.home,join(f.source,'logic.mjs'),'junction');
  await assert.rejects(f.workflow.handle({operation:'read',key:'logic'}),/escaped/);
});

test('syntax checks never execute source and unchanged bytes retain evidence without a patch revision',async t=>{
  const f=await fixture(t);const unchanged=await f.propose(f.original);
  assert.equal(unchanged.patchReview.status,'unchanged');assert.equal(unchanged.patchReview.revision,null);
  assert.equal(projectPatchDiff(unchanged.patch),'');
  assert.ok(f.records.has(unchanged.id));assert.equal(f.ledger.use('patch-v1/'+f.project.scope),null);
  const p=await f.propose("throw new Error('Must not execute');\n");assert.equal(p.patch.checks.codeExecuted,false);
  assert.equal(p.verification.claim,'syntax-only');
  await assert.rejects(f.propose('export const = ;'),/failed.*syntax/);
  assert.equal(await readFile(join(f.source,'logic.mjs'),'utf8'),f.original);
});

test('apply requires exact acceptance, deduplicates, and reverse requires separate acceptance',async t=>{
  const f=await fixture(t),p=await f.propose('export const value = 2;\n');
  const diff=projectPatchDiff(p.patch);assert.ok(diff.includes('-export const value = 1;'));assert.ok(diff.includes('+export const value = 2;'));
  await assert.rejects(f.action('patch-apply',p),/Explicit acceptance/);
  await f.action('patch-accept',p);assert.equal((await f.action('patch-apply',p)).application.status,'applied');
  assert.equal((await f.action('patch-apply',p)).application.status,'already-applied');
  const reverse=await f.workflow.handle({operation:'patch-reverse',runId:p.id});
  await assert.rejects(f.action('patch-apply',reverse),/Explicit acceptance/);
  await f.action('patch-accept',reverse);await f.action('patch-apply',reverse);
  assert.equal(await readFile(join(f.source,'logic.mjs'),'utf8'),f.original);
  await assert.rejects(f.action('patch-apply',p),/Explicit acceptance/);
});

test('stale acceptance, source drift and in-flight acceptance changes refuse replacement',async t=>{
  const f=await fixture(t),p=await f.propose('export const value = 2;\n'),stale=await f.propose('export const value = 3;\n');
  await f.action('patch-accept',p);await assert.rejects(f.action('patch-accept',stale),/stale/);
  const next=await f.propose('export const value = 4;\n');
  f.state.beforeApply=async()=>{f.state.beforeApply=null;await f.action('patch-accept',next)};
  await assert.rejects(f.action('patch-apply',p),/accepted patch changed/);
  assert.equal(await readFile(join(f.source,'logic.mjs'),'utf8'),f.original);
  await writeFile(join(f.source,'logic.mjs'),'export const value = 99;\n');
  await assert.rejects(f.action('patch-apply',next),/Source changed/);
});

test('lost post-write response reconciles durable bytes without repeating the action',async t=>{
  const f=await fixture(t),p=await f.propose('export const value = 2;\n');await f.action('patch-accept',p);
  f.state.failAfterWrite=true;await assert.rejects(f.action('patch-apply',p),/lost recording/);
  assert.equal(f.records.get(p.id).phase,'applying');f.state.failAfterWrite=false;
  const recovered=await f.action('patch-reconcile',p);
  assert.equal(recovered.phase,'applied');assert.equal(recovered.reconciliation.actionRepeated,false);
  assert.equal(await readFile(join(f.source,'logic.mjs'),'utf8'),p.patch.content);
});

test('read-only profile and a pre-existing lock cannot authorize or lose a write',async t=>{
  const f=await fixture(t,false),p=await f.propose('export const value = 2;\n');await f.action('patch-accept',p);
  await assert.rejects(f.action('patch-apply',p),/does not permit/);
  const writable=await fixture(t),other=await writable.propose('export const value = 2;\n');await writable.action('patch-accept',other);
  const lock=join(writable.source,'.isaiah-patch.lock');await writeFile(lock,'another owner');
  await assert.rejects(writable.action('patch-apply',other),/EEXIST/);assert.equal(await readFile(lock,'utf8'),'another owner');
});

test('returned project data cannot mutate the configured target authority',async t=>{
  const f=await fixture(t);const target={instance:'00000000-0000-4000-8000-000000000001',namespace:'ISAIAH',production:'Synthetic.Production'};
  await writeFile(f.path,JSON.stringify({...f.config,target}));const project=await loadProject(f.path);
  const view=await project.snapshot();view.configuredTarget.namespace='FOREIGN';
  assert.equal((await project.snapshot()).configuredTarget.namespace,'ISAIAH');
});

test('design integration emits the complete scaffold without applying it (synthetic response fixture)',async t=>{
  const f=await fixture(t);await writeFile(f.path,JSON.stringify({...f.config,allowDesign:true,records:[{key:'mapping',path:'logic.mjs'}]}));
  const project=await loadProject(f.path),{syntheticDevelopmentContract}=await import('../standalone/development-plan.mjs');
  const workflow=createProjectWorkflow({project,ledger:f.ledger,directory:f.home,persist:async r=>f.records.set(r.id,r),readRun:async id=>f.records.get(id),
    assist:async()=>({id:'synthetic-response-fixture',started:1,metrics:{modelResponses:1},provider:{kind:'fixture'},result:structuredClone(syntheticDevelopmentContract)})});
  const run=await workflow.handle({operation:'design',objective:'Synthetic fixed-contract fixture'});
  assert.equal(run.proposal.files.length,9);assert.equal(run.proposal.automaticApply,false);assert.equal(run.verification.codeCompilation,'not-run');
  assert.equal(await readFile(join(f.source,'logic.mjs'),'utf8'),f.original);
});
