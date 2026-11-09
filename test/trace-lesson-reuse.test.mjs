import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,readFile,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDeveloper } from '../standalone/developer.mjs';

test('qualified trace grounding is reused without promoting the main teaching UI',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'isaiah-grounded-reuse-'));
  const target={instance:'11111111-1111-1111-1111-111111111111',namespace:'ISAIAHDEV',production:'DevTrace.Production',
    build:'2026.3.0AI (Build 154U)',edition:'iris-for-health',nativeHub:1};
  const scope=['iris-for-health','154U',target.instance,target.namespace,target.production,'trace-v1'].join('/');
  const source={id:'11111111-2222-4333-8444-555555555555',started:1,kind:'trace',session:'2',compatibility:scope,
    provenance:{kind:'offline-synthetic-fixture'},metrics:{modelResponses:0},learning:{revision:null,used:false},
    verification:{status:'pass',claim:'recorded-hop-only',independent:{target,session:'2',hops:[{id:'2',source:'Synthetic source',target:'Synthetic sink',status:'9'}]}},
    decision:{lastHop:{id:'2',source:'Synthetic source',target:'Synthetic sink',status:'9'}}};
  const persist=run=>writeFile(join(directory,run.id+'.json'),JSON.stringify(run));
  await persist(source);
  const open=()=>createDeveloper({directory,profile:target,edition:'iris-for-health',persist,
    readRun:async id=>JSON.parse(await readFile(join(directory,id+'.json'),'utf8')),assist:()=>{throw Error('No inference allowed')}});
  let developer=open();
  try{
    let identity;
    for(const mode of ['coach','focus','companion']){
      await developer.handle('preferences',{mode});
      const lesson=await developer.handle('card',{runId:source.id,topic:'delivery'});
      assert.equal(lesson.mode,mode);assert.equal(lesson.conclusion.delivery,'unverified');
      assert.equal(lesson.traceVerification.evidenceMode,'offline-synthetic-fixture');
      assert.equal(lesson.recording.status,'retained');
      identity??=lesson.context;assert.deepEqual(lesson.context,identity);
      developer.close();developer=open();
      assert.equal(JSON.parse(await readFile(join(directory,lesson.id+'.json'),'utf8')).sourceRun.id,source.id);
    }
    await assert.rejects(developer.handle('card',{runId:source.id,topic:'delivery',approve:true}),/Choose/);
    const context=await developer.handle('context',{action:'propose',runId:source.id});
    assert.equal(context.status,'proposed');
    await developer.handle('context',{action:'accept',id:context.revision});
    const unchanged=await developer.handle('context',{action:'propose',runId:source.id});
    assert.equal(unchanged.status,'unchanged');
    assert.equal(JSON.parse(await readFile(join(directory,source.id+'.json'),'utf8')).contextReview.status,'unchanged');
    await persist({...source,compatibility:'other'});
    await assert.rejects(developer.handle('card',{runId:source.id}),/outside/);
  }finally{developer.close();await rm(directory,{recursive:true})}
});
