import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { evaluateContractExperiment } from '../standalone/contract-experiment.mjs';

// Original synthetic fixtures; no external private contract texts are included.
const scope={instance:'fixture-instance',namespace:'ISAIAH',production:'Isaiah.Production',sender:'fixture-sender',schema:'fixture-v1',field:'priority',action:'predicate-correction'};
const context={...scope,at:'2026-01-01T12:00:00.000Z'};
const refs=['trace:R17','receipts:R17'];
const independent={incident:'R17',incomingPriority:'P1',predicate:'PRIORITY',requested:'Express',selected:'Standard',receipts:[{destination:'Standard',status:'delivered'}],branch:{mode:'diagnostic',observedMatchPriority:'PRIORITY'}};
const result={decision:{finding:'rule_mismatch',branch:'diagnostic',proposal:{action:'align_match_priority',from:'PRIORITY',to:'P1'},evidence:refs},branchReceipt:independent.branch,audit:[{tool:'ReadIncident',input:{incident:'R17'},output:{incident:'R17',references:refs}}]};
const fixed=Object.freeze({incident:'R17',context,result,independent});
const digest=x=>createHash('sha256').update(x).digest('hex');
function fixture(id,expectedIncoming,expectedPredicate,other={}){
  const document={id,revision:'1',scope,effectiveFrom:'2025-01-01T00:00:00.000Z',effectiveUntil:'2027-01-01T00:00:00.000Z',expectedIncoming,expectedPredicate,destination:'Express',...other};
  const bytes=JSON.stringify(document);
  return {entry:{bytes},approval:{id,revision:'1',digest:digest(bytes),approved:true,active:true,source:'independently-reviewed-synthetic-fixture'}};
}
function assess(fixtures,overrides={}){return evaluateContractExperiment({...fixed,contracts:fixtures.map(f=>f.entry),approvals:fixtures.map(f=>f.approval),...overrides})}
test('frozen proposal is eligible under A, rejected under B, and requires review without a contract',()=>{
  const before=digest(JSON.stringify(fixed));
  const a=assess([fixture('A','P1','P1')]), b=assess([fixture('B','PRIORITY','PRIORITY')]), missing=assess([]);
  assert.equal(digest(JSON.stringify(fixed)),before);
  for(const item of [a,b,missing])assert.equal(item.factual.status,'pass');
  assert.equal(a.contract.status,'permitted');assert.equal(a.contract.correctionAuthorized,false);
  assert.equal(b.contract.status,'rejected');assert.deepEqual(b.contract.discrepancy,{field:'incomingPriority',expected:'PRIORITY',observed:'P1'});
  assert.equal(missing.contract.status,'review-required');
});
test('conflict, wrong scope, stale, unreviewed, changed bytes, and incomplete requirements cannot authorize a correction',()=>{
  const a=fixture('A','P1','P1'),b=fixture('B','PRIORITY','PRIORITY');
  assert.equal(assess([a,b]).contract.status,'review-required');
  assert.equal(assess([fixture('other','P1','P1',{scope:{...scope,sender:'another'}})]).contract.status,'review-required');
  assert.equal(assess([fixture('old','P1','P1',{effectiveFrom:'2024-01-01T00:00:00.000Z',effectiveUntil:'2025-01-01T00:00:00.000Z'})]).contract.status,'review-required');
  assert.equal(assess([{...a,approval:{...a.approval,approved:false}}]).contract.status,'review-required');
  assert.equal(assess([{...a,approval:{...a.approval,active:false}}]).contract.status,'review-required');
  assert.equal(assess([{...a,entry:{bytes:a.entry.bytes+' '}}]).contract.status,'review-required');
  assert.equal(assess([fixture('incomplete','P1','')]).contract.status,'review-required');
  assert.equal(assess([a],{independent:{...independent,receipts:[]}}).contract.status,'review-required');
});
