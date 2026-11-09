// Offline experiment: caller-supplied fixture approvals are not production authorization.
// Keep this separate from the deployed verifier and the IRIS apply/rollback gate.
import { createHash } from 'node:crypto';
import { verify } from '../verifier.mjs';

const fields=['instance','namespace','production','sender','schema','field','action'];
const iso=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;
const validTime=value=>typeof value==='string' && iso.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString()===value;
const equalScope=(a,b)=>a && b && fields.every(k=>typeof a[k]==='string' && a[k].length>0 && a[k]===b[k]);
const review=reason=>({status:'review-required',reason,correctionAuthorized:false});

/**
 * Compare a frozen, already-observed routing proposal with a fixture contract.
 * approvals is an independently supplied fixture registry, not a model claim.
 * This function grants no permission to change an IRIS production.
 */
export function evaluateContractExperiment({incident,result,independent,context,contracts,approvals}) {
  const factual=verify(incident,result,independent);
  if(factual.status!=='pass')return {factual,contract:review('Factual verification failed.')};
  if(!context || !fields.every(k=>typeof context[k]==='string'&&context[k]) || !validTime(context.at) ||
     !Array.isArray(contracts)||!Array.isArray(approvals))return {factual,contract:review('Contract authority or applicability is unavailable.')};
  const candidates=[];
  for(const entry of contracts) {
    if(!entry || typeof entry.bytes!=='string' || entry.bytes.length>16000) return {factual,contract:review('Contract representation is invalid.')};
    let parsed;try{parsed=JSON.parse(entry.bytes)}catch{return {factual,contract:review('Contract representation is invalid.')}}
    if(!equalScope(parsed.scope,context))continue;
    const metadata=approvals.filter(a=>a?.id===parsed.id && a?.revision===parsed.revision);
    const digest=createHash('sha256').update(entry.bytes,'utf8').digest('hex');
    if(metadata.length!==1 || metadata[0].approved!==true || metadata[0].active!==true ||
       !metadata[0].source || metadata[0].digest!==digest) return {factual,contract:review('Applicable contract is not independently approved or its digest differs.')};
    if(!validTime(parsed.effectiveFrom)||!validTime(parsed.effectiveUntil)||parsed.effectiveFrom>=parsed.effectiveUntil) return {factual,contract:review('Contract interval is invalid.')};
    if(context.at<parsed.effectiveFrom||context.at>=parsed.effectiveUntil)continue;
    candidates.push({document:parsed,digest,source:metadata[0].source});
  }
  if(candidates.length!==1)return {factual,contract:review(candidates.length?'Conflicting applicable contracts.':'No applicable approved contract.')};
  const {document:c,digest,source}=candidates[0], proposal=result.decision.proposal;
  const identity={id:c.id,revision:c.revision,digest,source};
  if(!c.id || !c.revision || typeof c.expectedIncoming!=='string' || !c.expectedIncoming ||
     typeof c.expectedPredicate!=='string' || !c.expectedPredicate || c.destination!==independent.requested ||
     context.action!=='predicate-correction' || proposal.action!=='align_match_priority') {
    return {factual,contract:{...review('Contract requirement is incomplete or outside this experiment.'),identity}};
  }
  if(independent.incomingPriority!==c.expectedIncoming) return {factual,contract:{status:'rejected',reason:'Incoming priority disagrees with the sender contract.',identity,discrepancy:{field:'incomingPriority',expected:c.expectedIncoming,observed:independent.incomingPriority},correctionAuthorized:false}};
  if(independent.predicate===c.expectedPredicate || proposal.from!==independent.predicate || proposal.to!==c.expectedPredicate) return {factual,contract:{status:'rejected',reason:'The proposed predicate correction is not required by the contract.',identity,correctionAuthorized:false}};
  return {factual,contract:{status:'permitted',reason:'The predicate proposal agrees with the reviewed synthetic contract.',identity,correctionAuthorized:false}};
}
