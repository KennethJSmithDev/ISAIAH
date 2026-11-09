// Destructive interruption is restricted to the explicitly labelled disposable test container.
// Uses a fixed synthetic source and real production dispatch, never model inference.
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
const exec=promisify(execFile), container=process.env.ISAIAH_RECOVERY_CONTAINER;
assert.match(container??'',/^isaiah-interop013-final-iris-1$/);
const [inspection]=JSON.parse((await exec('docker',['inspect',container])).stdout);
assert.equal(inspection.Config.Labels['dev.isaiah.owner'],'interop013');
assert.ok(inspection.Config.Env.includes('ISAIAH_RECOVERY_TEST_HOOKS=1'));
const proofText=await readFile(process.env.ISAIAH_CONTRACT_PROOF,'utf8');
const proof=JSON.parse(proofText.split(/\r?\n/).find(line=>line.startsWith('CONTRACT-PROOF {')).slice('CONTRACT-PROOF '.length));
assert.equal(proof.status,'pass');
const credentials=JSON.parse(await readFile('.local/compose-credentials.json','utf8'));
const [sandbox,operatorKey]=(await readFile('.local/apply-operator.txt','utf8')).trim().split(/\r?\n/);
assert.equal(proof.apply.plan.target.sandbox,sandbox);
const origin='http://127.0.0.1:18875/isaiah';
const headers={'Content-Type':'application/json',Authorization:'Basic '+Buffer.from('IsaiahAdapter:'+credentials.password).toString('base64')};
const evidence={kind:'actual-IRIS-HTTP-fixed-source-zero-inference',status:'running',container:inspection.Id,sandbox};
const resume=process.env.ISAIAH_RECOVERY_RESUME;
if(resume)assert.match(resume,/^[a-f0-9-]{36}$/);
const artifact=process.env.ISAIAH_RECOVERY_EVIDENCE;
assert.ok(artifact);
assert.equal(await readFile(artifact,'utf8').catch(()=>''),'','Preserve earlier evidence; use a new output.');
async function checkpoint(){await writeFile(artifact,JSON.stringify(evidence,null,2)+'\n',{mode:0o600})}
async function request(path,data,status=200){
  const response=await fetch(origin+path,{method:data?'POST':'GET',headers,body:data?JSON.stringify(data):undefined,signal:AbortSignal.timeout(22000),redirect:'error'});
  const body=await response.json();assert.equal(response.status,status,body.error);return body;
}
const change=(operation,plan,extra={},status=200)=>request('/change',{operation,id:plan.plan.id,fingerprint:plan.fingerprint,...extra},status);
const read=plan=>request('/change/'+plan.plan.id);
async function restart(){
  await exec('docker',['restart',container],{timeout:55000});
  for(let attempt=0;attempt<40;attempt++){
    try{const ready=(await request('/health')).ready;if(ready===true||ready===1)return}catch{}
    await delay(1000);
  }
  throw new Error('Same disposable sandbox did not return after restart');
}
async function plan(kind,apply){
  return request('/change',{operation:'plan-'+kind,id:randomUUID(),sourceRun:kind==='apply'?proof.apply.plan.sourceRun:'',
    replayId:kind==='apply'?proof.apply.plan.replayId:'',appliedId:apply?.plan.id??''});
}
async function commit(kind,apply){
  const record=await plan(kind,apply);
  await change('execute',record,{},409);
  await change('approve',record,{operatorKey});
  assert.equal((await change('execute',record)).phase,'committed');return record;
}
async function consoleRead(command){
  return new Promise((resolve,reject)=>{
    const child=spawn('docker',['exec','-i','--user','51773',container,'iris','session','IRIS','-U','ISAIAH'],{windowsHide:true});
    let output='';const timer=setTimeout(()=>{child.kill();reject(Error('Qualification console timeout'))},8000);
    child.stdout.on('data',chunk=>output+=chunk);child.once('error',reject);child.once('close',code=>{clearTimeout(timer);code?reject(Error('Qualification console failed')):resolve(output)});
    child.stdin.end(command+'\nhalt\n');
  });
}
async function interrupt(record,point){
  assert.match(point,/^(before-claim|after-claim|after-receipt)$/);
  const id=record.plan.id;
  evidence.pendingInterruption={id,point};await checkpoint();
  await consoleRead(`set ^IsaiahChange("fault","${id}")="${point}"`);
  const pending=change('verify',record).then(()=>({success:true}),()=>({interrupted:true}));
  let pid;
  for(let attempt=0;attempt<20;attempt++){
    const text=await consoleRead(`write !,"FAULT_JOB=",+$get(^IsaiahChange("fault-hit","${id}")),!`);
    pid=Number(/^FAULT_JOB=(\d+)/m.exec(text)?.[1]);if(pid)break;await delay(200);
  }
  assert.ok(Number.isSafeInteger(pid)&&pid>100);
  assert.equal((await exec('docker',['exec',container,'ps','-p',String(pid),'-o','comm='])).stdout.trim(),'irisdb');
  await exec('docker',['exec',container,'kill','-KILL',String(pid)]);
  const outcome=await pending;assert.equal(outcome.interrupted,true);
  await restart();
  let receipt;
  for(let attempt=0;attempt<12;attempt++){
    try{receipt=await read(record);break}catch(error){if(!/busy/.test(error.message))throw error;await delay(250)}
  }
  assert.ok(receipt,'Interrupted request lock must be released within the bounded read window');
  return {point,pid,receipt};
}
function delivered(record,destination){
  assert.equal(record.phase,'verified');assert.equal(record.verification.status,'pass');
  assert.deepEqual(record.verification.trace.receipts,[{destination,status:'delivered'}]);
  assert.ok(record.verification.originalEvidenceIntact);
}
async function loseReply(record){
  let upstream,attempts=0;
  const relay=createServer(async(req,res)=>{
    attempts++;
    try{upstream=await change('execute',record)}finally{res.socket.destroy()}
  });
  await new Promise(resolve=>relay.listen(0,'127.0.0.1',resolve));
  try{
    await assert.rejects(fetch('http://127.0.0.1:'+relay.address().port,{method:'POST',body:'execute-once',signal:AbortSignal.timeout(23000)}));
    assert.equal(attempts,1);assert.equal(upstream.phase,'committed');
    const recovered=await read(record);assert.deepEqual(recovered,upstream);
    assert.deepEqual((await change('execute',record)).commit,recovered.commit);
    return {attempts,recovered};
  }finally{relay.closeAllConnections();await new Promise(resolve=>relay.close(resolve))}
}
try{
  if(resume)await restart();
  const apply=resume?await request('/change/'+resume):await commit('apply');
  evidence.beforeClaim=resume?{point:'before-claim',resumed:true,receipt:await read(apply)}:await interrupt(apply,'before-claim');
  assert.equal(evidence.beforeClaim.receipt.phase,'committed');assert.equal(evidence.beforeClaim.receipt.dispatch,undefined);
  await checkpoint();
  evidence.afterReceipt=await interrupt(apply,'after-receipt');
  assert.equal(evidence.afterReceipt.receipt.phase,'verifying');await checkpoint();
  evidence.recoveredApply=await change('reconcile',apply);delivered(evidence.recoveredApply,'Express');
  assert.deepEqual(await change('reconcile',apply),evidence.recoveredApply);await checkpoint();
  const rollback=await commit('rollback',apply);
  evidence.afterClaim=await interrupt(rollback,'after-claim');
  evidence.ambiguous=await change('reconcile',rollback);
  assert.equal(evidence.ambiguous.phase,'verification_unknown');assert.equal(evidence.ambiguous.verification,undefined);
  await change('verify',rollback,{},409);assert.deepEqual(await change('reconcile',rollback),evidence.ambiguous);await checkpoint();
  const control=await plan('apply');await change('approve',control,{operatorKey});
  evidence.lostApply=await loseReply(control);delivered(await change('verify',control),'Express');
  const finalRollback=await plan('rollback',control);await change('approve',finalRollback,{operatorKey});
  evidence.lostRollback=await loseReply(finalRollback);
  evidence.finalRollback=await change('verify',finalRollback);delivered(evidence.finalRollback,'Standard');
  const expired=await plan('apply');await change('approve',expired,{operatorKey});
  await consoleRead(`set r={}.%FromJSON(^IsaiahChange("record","${expired.plan.id}")),r.approval.expiresAt=##class(Isaiah.State).Now()-1 do ##class(Isaiah.Change).Store(r)`);
  await change('execute',expired,{},409);
  evidence.expiredApproval='refused';evidence.status='pass';await checkpoint();
  console.log('PASS recovery: pre-claim resume, durable post-receipt recovery, ambiguity retained, lost replies, duplicates, expiry and final Standard delivery.');
}catch(error){evidence.status='failed';evidence.error=error.message;await checkpoint();throw error}
