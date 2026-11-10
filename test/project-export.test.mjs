import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm,readFile,writeFile,access} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {exportProject} from '../standalone/export-project.mjs';import {syntheticDevelopmentContract} from '../standalone/development-plan.mjs';

test('source export uses controlled emitter paths, refuses overwrite and does not confer deployment authority',async t=>{
 const root=await mkdtemp(join(tmpdir(),'isaiah-export-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const run={id:'synthetic-recorded-plan',kind:'development-plan',verification:{status:'pass',claim:'bounded-plan-contract'},decision:structuredClone(syntheticDevelopmentContract),proposal:{files:[{path:'../escape.mjs',content:'untrusted path'}]}};
 const result=await exportProject(run,join(root,'app'));assert.equal(result.status,'exported-source-only');assert.equal(result.deployed,false);assert.equal(result.files.length,9);assert.equal(result.emitterRevision,'synthetic-hl7-fhir.v2');assert.equal(result.newDerivation,true);
 assert.ok((await readFile(join(root,'app/module.xml'),'utf8')).includes('IsaiahDevx.PKG'));await assert.rejects(access(join(root,'escape.mjs')));
 const before=await readFile(join(root,'app/module.xml'),'utf8');await assert.rejects(exportProject(run,join(root,'app')),/EEXIST/);assert.equal(await readFile(join(root,'app/module.xml'),'utf8'),before);
 await assert.rejects(exportProject({...run,decision:{...run.decision,namePath:'PID:5'}},join(root,'bad')),/does not match/);await assert.rejects(access(join(root,'bad')));
});
