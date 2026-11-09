import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rmdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { ChatGPTAccount } from '../chatgpt/account.mjs';
import { completedEvent, fromResponses, toResponses } from '../chatgpt/translation.mjs';

test('ChatGPT translation preserves scoped tool identity and stateless reasoning through a complete synthetic turn',()=>{
  const prior=new Map(),tools=[{type:'function',function:{name:'ReadIncident',parameters:{type:'object',properties:{incident:{type:'string'}}}}}];
  const chat={model:'selected',messages:[{role:'system',content:'instructions'},{role:'user',content:'R17'}],tools};
  const first=toResponses(chat,prior);assert.equal(first.input[0].role,'developer');assert.equal(first.stream,true);assert.equal(first.store,false);
  assert.equal(first.tools[0].type,'namespace');assert.equal(first.tools[0].tools[0].name,'ReadIncident');assert.equal(first.temperature,undefined);
  const output=[{type:'reasoning',id:'rs_1',encrypted_content:'synthetic-opaque'},{type:'function_call',namespace:'isaiah',name:'ReadIncident',call_id:'call_1',arguments:'{"incident":"R17"}'}];
  const completion=fromResponses({id:'response',model:'selected',status:'completed',output},tools,prior);
  assert.equal(completion.choices[0].message.tool_calls[0].function.name,'ReadIncident');
  assert.equal(completion.usage.total_tokens,0);
  const next=toResponses({...chat,messages:[...chat.messages,completion.choices[0].message,{role:'tool',tool_call_id:'call_1',content:'synthetic evidence'}]},prior);
  assert.deepEqual(next.input.slice(2,4),output);assert.equal(next.input[4].call_id,'call_1');
  assert.throws(()=>toResponses({...chat,messages:[{role:'assistant',tool_calls:[{id:'forged'}]}]},prior),/continuation/);
  assert.throws(()=>fromResponses({status:'completed',output:[{type:'function_call',namespace:'other',name:'ReadIncident',call_id:'x',arguments:'{}'}]},tools,prior),/Unexpected/);
  assert.throws(()=>toResponses({...chat,messages:[{role:'user',content:[{type:'image'}]}]},prior),/text/);
});

test('ChatGPT stream requires a completed terminal event and fails closed on interruption or error',async()=>{
  const stream=s=>Readable.from([Buffer.from(s.slice(0,8)),Buffer.from(s.slice(8))]);
  const good='data: {"type":"response.created"}\n\ndata: {"type":"response.completed","response":{"status":"completed","output":[]}}\n\n';
  assert.equal((await completedEvent(stream(good))).status,'completed');
  await assert.rejects(completedEvent(stream('data: {"type":"response.created"}\n\n')),/before/);
  await assert.rejects(completedEvent(stream('data: {"type":"response.failed"}\n\n')),/failed/);
  await assert.rejects(completedEvent(stream(good),10),/large/);
});

test('Windows account secrets are protected and concurrent use is refused', {skip:process.platform!=='win32'},async()=>{
  await mkdir('.local',{recursive:true});
  const dir=await mkdtemp(join(process.cwd(),'.local','account-fixture-'));
  let a=new ChatGPTAccount(dir),b=new ChatGPTAccount(dir);const realFetch=globalThis.fetch;
  try {
    await a.init();await assert.rejects(b.init(),/Another/);
    a.current={clientId:'synthetic-client',subject:'synthetic-user',scopes:['chatgpt.tokens.use.direct'],accessToken:'synthetic-secret-token',refreshToken:'synthetic-refresh',expiresAt:Date.now()+120000};await a.save();
    const bytes=await readFile(join(dir,'account.dpapi'));assert.equal(bytes.includes(Buffer.from('synthetic-secret-token')),false);
    await a.close();b=new ChatGPTAccount(dir);await b.init();assert.equal(await b.accessToken(),'synthetic-secret-token');
    b.current.expiresAt=0;let refreshes=0;
    globalThis.fetch=async url=>{assert.equal(url,'https://auth.openai.com/api/accounts/oauth/token');refreshes++;return {ok:true,json:async()=>({access_token:'replacement',refresh_token:'replacement-refresh',expires_in:3600})}};
    assert.deepEqual(await Promise.all([b.accessToken(),b.accessToken()]),['replacement','replacement']);assert.equal(refreshes,1);
    globalThis.fetch=async url=>String(url).includes('.well-known/openid-configuration')?{ok:true,json:async()=>({revocation_endpoint:'https://auth.openai.com/revoke'})}:{status:200};
    assert.deepEqual(await b.disconnect(),{revoked:true});assert.equal(b.status().connected,false);assert.equal(b.current.clientId,'synthetic-client');assert.equal(b.current.accessToken,undefined);
  } finally {globalThis.fetch=realFetch;await a.close();await b.close();for(const name of ['account.dpapi','host-id'])await unlink(join(dir,name)).catch(()=>{});await rmdir(dir)}
});
