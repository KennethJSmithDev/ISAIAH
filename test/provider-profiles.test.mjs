import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadProviderProfile, providerReady } from '../provider-profiles.mjs';
import { createRuntime, ceilings } from '../runtime.mjs';

const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
const close = server => new Promise(resolve => server.close(resolve));

test('legacy default stays pinned and profile validation refuses nonlocal or secret-bearing configuration', async () => {
  const legacy = await loadProviderProfile({ standalone: true, file: '' });
  assert.equal(legacy.kind, 'ollama'); assert.equal(legacy.model, 'gpt-oss:20b');
  assert.equal(legacy.origin, 'http://127.0.0.1:18758');
  assert.equal(legacy.version, '0.40.6'); assert.match(legacy.digest, /^[a-f0-9]{64}$/);
  const dir = await mkdtemp(join(tmpdir(), 'isaiah-provider-test-')), path = join(dir, 'profile.json');
  try {
    const base = { id:'local',kind:'openai-compatible',origin:'http://127.0.0.1:1234',model:'example/model' };
    for (const bad of [
      {...base,origin:'https://example.com:443'}, {...base,origin:'http://127.0.0.1:1234/v1'},
      {...base,origin:'http://user:password@127.0.0.1:1234'}, {...base,origin:'http://192.168.1.1:1234'},
      {...base,model:'bad model'}, {...base,apiKey:'must-not-be-in-profile'}, {...base,id:123}
    ]) {
      await writeFile(path, JSON.stringify(bad)); await assert.rejects(loadProviderProfile({file:path}));
    }
    await writeFile(path, JSON.stringify(base));
    const valid = await loadProviderProfile({file:path}); assert.deepEqual(valid,base);
    await assert.rejects(loadProviderProfile({file:path,compose:true}));
    assert.equal(await providerReady(valid, null, async () => ({ok:true,json:async()=>({data:[{id:'different'}]})})),false);
  } finally { await rm(dir,{recursive:true,force:true}); }
});

async function gatewayContract(experimental = false) {
  const dir = await mkdtemp(join(tmpdir(), 'isaiah-provider-gate-')), profilePath=join(dir,'profile.json'), secretPath=join(dir,'secret.txt');
  const syntheticProviderSecret='test-provider-secret', syntheticGateSecret='A'.repeat(64), syntheticIrisSecret='Is!'+'A'.repeat(28);
  let available=true, oversized=false, calls=0, received;
  const upstream=createServer(async(req,res)=>{
    if (req.url === '/isaiah/health') { res.writeHead(200,{'content-type':'application/json'});return res.end(JSON.stringify({ready:true,namespace:'ISAIAH',build:'2026.3.0AI (Build 154U)',edition:'iris-for-health'})); }
    if(req.headers.authorization!=='Bearer '+syntheticProviderSecret){res.writeHead(401);return res.end()}
    if(req.url==='/v1/models'){res.writeHead(available?200:503,{'content-type':'application/json'});return res.end(JSON.stringify({data:[{id:'alternate-local'}]}))}
    if(req.url==='/v1/chat/completions'){
      calls++;let body='';for await(const chunk of req)body+=chunk;received=JSON.parse(body);
      res.writeHead(200,{'content-type':'application/json'});
      return res.end(oversized ? 'x'.repeat(2_000_001) : JSON.stringify({choices:[{message:{role:'assistant',content:'ok'}}],usage:{prompt_tokens:2,completion_tokens:1}}));
    }
    res.writeHead(404);res.end();
  });
  const port=await listen(upstream);
  const account={protocol:'local-account-bridge.v1',name:'Synthetic Provider',managementOrigin:'http://127.0.0.1:'+port};
  await writeFile(profilePath,JSON.stringify({id:'alternate',kind:'openai-compatible',origin:'http://127.0.0.1:'+port,model:'alternate-local',...(experimental?{account}:{})}));
  await writeFile(secretPath,syntheticProviderSecret+'\n');
  const savedProfile=process.env.ISAIAH_PROVIDER_PROFILE_FILE,savedSecret=process.env.ISAIAH_PROVIDER_CREDENTIAL_FILE;
  process.env.ISAIAH_PROVIDER_PROFILE_FILE=profilePath;process.env.ISAIAH_PROVIDER_CREDENTIAL_FILE=secretPath;
  const controller=new AbortController(), run={id:'test-run',active:true,metrics:{modelRequests:0,modelResponses:0,modelFailures:0,providerInputBytes:0,promptTokens:0,completionTokens:0}};
  const active={run,providerSignal:controller.signal};
  let runtime;
  try {
    if(experimental){
      delete process.env.ISAIAH_PROVIDER_CREDENTIAL_FILE;
      await assert.rejects(createRuntime(dir,()=>active),/separate local bridge credential/);
      process.env.ISAIAH_PROVIDER_CREDENTIAL_FILE=secretPath;
    }
    await writeFile(secretPath,syntheticGateSecret);
    await assert.rejects(createRuntime(dir,()=>active,false,false,false,false,{agentUrl:'http://127.0.0.1:'+port+'/isaiah',agentPassword:syntheticIrisSecret,providerToken:syntheticGateSecret}),/must be separate/);
    await writeFile(secretPath,syntheticProviderSecret);
    runtime=await createRuntime(dir,()=>active,false,false,false,false,{agentUrl:'http://127.0.0.1:'+port+'/isaiah',agentPassword:syntheticIrisSecret,providerToken:syntheticGateSecret});
    assert.deepEqual(runtime.provider,{id:'alternate',kind:'openai-compatible',model:'alternate-local',
      ...(experimental?{account,qualification:'experimental-unqualified'}:{})});
    assert.equal((await runtime.health()).ready,true);
    available=false;assert.equal((await runtime.health()).ready,false);available=true;assert.equal((await runtime.health()).ready,true);
    const post=(path,body,token=syntheticGateSecret)=>fetch('http://127.0.0.1:18745'+path,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body)});
    const body={model:'alternate-local',messages:[{role:'user',content:'synthetic'}],stream:false,tools:[{type:'function',function:{name:'evidence'}}]};
    assert.equal((await post('/test-run/v1/chat/completions',body,'wrong')).status,401);
    assert.equal((await post('/other/v1/chat/completions',body)).status,403);
    assert.equal((await post('/test-run/v1/chat/completions',{...body,model:'other'})).status,400);
    assert.equal((await post('/test-run/v1/chat/completions',{...body,stream:true})).status,400);
    const reply=await post('/test-run/v1/chat/completions',body);assert.equal(reply.status,200);
    assert.equal((await reply.json()).choices[0].message.content,'ok');
    assert.equal(received.model,'alternate-local');assert.deepEqual(received.tools,body.tools);assert.equal(calls,1);
    assert.equal(run.metrics.modelResponses,1);
    oversized=true;assert.equal((await post('/test-run/v1/chat/completions',body)).status,502);
    assert.equal(run.metrics.modelFailures,1);oversized=false;
    run.metrics.modelRequests=ceilings.modelRequests;
    assert.equal((await post('/test-run/v1/chat/completions',body)).status,429);
    controller.abort();run.metrics.modelRequests=0;
    assert.equal((await post('/test-run/v1/chat/completions',body)).status,409);
    assert.equal(calls,2);
  } finally {
    if(runtime) await runtime.close();await close(upstream);
    if(savedProfile===undefined)delete process.env.ISAIAH_PROVIDER_PROFILE_FILE;else process.env.ISAIAH_PROVIDER_PROFILE_FILE=savedProfile;
    if(savedSecret===undefined)delete process.env.ISAIAH_PROVIDER_CREDENTIAL_FILE;else process.env.ISAIAH_PROVIDER_CREDENTIAL_FILE=savedSecret;
    await rm(dir,{recursive:true,force:true});
  }
}

test('scoped gateway selects one local provider and isolates its credential',()=>gatewayContract());
test('experimental account socket preserves the same native gateway bounds and requires a separate credential',()=>gatewayContract(true));

test('experimental descriptors cannot claim qualification, contain credentials or redirect account management away from loopback',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'isaiah-account-descriptor-')),file=join(dir,'profile.json');
  const account={protocol:'local-account-bridge.v1',name:'Synthetic Provider',managementOrigin:'http://127.0.0.1:18879'};
  const profile={id:'test-bridge',kind:'openai-compatible',origin:'http://127.0.0.1:18879',model:'fixture-model',account};
  try{
    await writeFile(file,JSON.stringify(profile));assert.deepEqual(await loadProviderProfile({file}),profile);
    for(const bad of [
      {...profile,id:'chatgpt-plan'}, {...profile,account:{...account,qualified:true}}, {...profile,account:{...account,token:'secret'}},
      {...profile,account:{...account,protocol:'other'}}, {...profile,account:{...account,managementOrigin:'https://example.com'}},
      {...profile,account:{...account,managementOrigin:'http://127.0.0.1:18880'}},
      {...profile,account:{...account,managementOrigin:'http://user:secret@127.0.0.1:18879'}},
      {...profile,account:{...account,name:'<script>unsafe</script>'}}
    ]){await writeFile(file,JSON.stringify(bad));await assert.rejects(loadProviderProfile({file}));}
  }finally{await rm(dir,{recursive:true})}
});
