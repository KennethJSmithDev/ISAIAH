import test from 'node:test';
import assert from 'node:assert/strict';
import { traceObservations } from '../standalone/trace-observations.mjs';

test('authorized recorded headers yield bounded observations without claiming production health or delivery',()=>{
  const trace={session:'2',hops:[{source:'Intake',target:'Router',status:'9',error:0},{source:'Router',target:'Sink',status:'9',error:1},{source:'Sink',target:'Intake',status:'?',error:undefined}]};
  assert.deepEqual(traceObservations(trace),{basis:'recorded-headers-only',session:'2',hopCount:3,observedEndpoints:['Intake','Router','Sink'],statuses:[{status:'9',count:2},{status:'?',count:1}],errorMarkers:{marked:1,unreported:1},delivery:'unverified'});
  assert.equal(traceObservations({...trace,hops:[]}),null);
  assert.equal(traceObservations({...trace,hops:Array(41).fill(trace.hops[0])}),null);
  assert.equal(traceObservations({...trace,session:'../../2'}),null);
  assert.equal(traceObservations({...trace,hops:[{source:'',target:'x',status:'9'}]}),null);
});
