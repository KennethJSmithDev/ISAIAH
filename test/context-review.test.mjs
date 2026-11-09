import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openLedger } from '../standalone/ledger.mjs';
import { createTeaching } from '../standalone/teaching.mjs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

test('reviewed target context reuses the ledger, is scoped, survives reopen and restores prior facts', async () => {
  const directory=await mkdtemp(join(tmpdir(),'isaiah-context-'));
  let ledger=openLedger(directory);
  const target={instance:'synthetic-instance',namespace:'ISAIAHDEV',production:'DevTrace.Production',build:'154U',edition:'iris-for-health',nativeHub:1};
  const run={id:'synthetic-run-1',kind:'trace',compatibility:'health/context-fixture',verification:{status:'pass',independent:{target}}};
  const scope='context-v1/'+run.compatibility;
  try {
    const first=ledger.proposeContext(run);
    assert.equal(first.status,'proposed');assert.equal(ledger.use(scope),null);
    assert.throws(()=>ledger.review('wrong',first.revision,'accept'),/outside/);
    const stale=ledger.proposeContext({...run,id:'synthetic-stale'});
    ledger.review(scope,first.revision,'accept');
    assert.throws(()=>ledger.review(scope,stale.revision,'accept'),/stale/);
    assert.equal(ledger.use(run.compatibility),null);
    const database=new DatabaseSync(join(directory,'standalone.sqlite'));
    const before=database.prepare('SELECT COUNT(*) n FROM skill').get().n;
    assert.deepEqual(ledger.proposeContext({...run,id:'synthetic-run-2'}),{status:'unchanged',revision:first.revision});
    assert.equal(database.prepare('SELECT COUNT(*) n FROM skill').get().n,before);
    database.close();ledger.close();ledger=openLedger(directory);
    assert.equal(JSON.parse(ledger.use(scope).guidance).production,target.production);
    const child=await promisify(execFile)(process.execPath,['--input-type=module','-e',
      "const{openLedger}=await import(process.env.TEST_MODULE);const l=openLedger(process.env.TEST_DIRECTORY);console.log(JSON.stringify(l.use(process.env.TEST_SCOPE)));l.close();"],
      {env:{...process.env,TEST_MODULE:new URL('../standalone/ledger.mjs',import.meta.url).href,TEST_DIRECTORY:directory,TEST_SCOPE:scope},timeout:10000});
    assert.equal(JSON.parse(child.stdout).id,first.revision);
    const corrected=ledger.proposeContext({...run,id:'synthetic-new-build',verification:{status:'pass',independent:{target:{...target,build:'154U-corrected-fixture'}}}});
    ledger.review(scope,corrected.revision,'accept');
    assert.equal(JSON.parse(ledger.use(scope).guidance).build,'154U-corrected-fixture');
    ledger.review(scope,corrected.revision,'restore');
    assert.equal(ledger.use(scope).id,first.revision);
    assert.throws(()=>ledger.proposeContext({...run,verification:{status:'fail'}}),/verified/);
  } finally {ledger.close();await rm(directory,{recursive:true})}
});

test('workflow lessons retain identical receipt facts across the three modes',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'isaiah-receipt-teaching-')),ledger=openLedger(directory);
  try {
    const teaching=createTeaching(ledger,'iris-for-health');
    for(const kind of ['fhir','dicomweb']){
      const observation={target:{kind},verification:{status:'pass',receipt:{resourceType:'Organization',id:'synthetic-1',versionId:'1',instance:'1.2.3'}}};
      const results=[];
      for(const mode of ['coach','focus','companion']){
        teaching.preference({mode});results.push(teaching.observation(observation,{kind:'run',id:'synthetic-run'}));
      }
      assert.equal(new Set(results.map(r=>r.facts)).size,1);
      assert.equal(new Set(results.map(r=>r.limit)).size,1);
      assert.ok(results[0].lesson);assert.equal(results[1].lesson,null);assert.ok(results[2].reaction);
      for(const result of results)assert.equal(result.evidence.id,'synthetic-run');
    }
    assert.throws(()=>teaching.observation({verification:{status:'fail'}},{}),/verified/);
  }finally{ledger.close();await rm(directory,{recursive:true})}
});
