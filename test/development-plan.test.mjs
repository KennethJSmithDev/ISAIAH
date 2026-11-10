import test from 'node:test';import assert from 'node:assert/strict';
import { syntheticDevelopmentContract, verifyDevelopmentPlan, generateSyntheticMapping } from '../standalone/development-plan.mjs';

test('bounded native mapping plans reject unsupported fields before emitting executable source',()=>{
  assert.throws(()=>syntheticDevelopmentContract.requiredPaths.push('PID:5'),TypeError);
  assert.equal(verifyDevelopmentPlan(structuredClone(syntheticDevelopmentContract)).claim,'bounded-plan-contract');
  for(const plan of [{...syntheticDevelopmentContract,namePath:'PID:5'},{...syntheticDevelopmentContract,resourceType:'Patient'},{...syntheticDevelopmentContract,command:'arbitrary'},{...syntheticDevelopmentContract,requiredPaths:[]}]) {
    assert.throws(()=>generateSyntheticMapping(plan),/does not match/);
  }
  const source=generateSyntheticMapping(syntheticDevelopmentContract);
  assert.ok(source.includes('Class IsaiahDevx.Mapping'));assert.ok(source.includes('MSH:4'));assert.ok(!source.includes('PID:'));
});
