import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { openLedger } from '../standalone/ledger.mjs';
import { createTeaching } from '../standalone/teaching.mjs';

test('standard IRIS documentation profile keeps common lessons and refuses health-only starters',async()=>{
  await mkdir('.local',{recursive:true});
  const dir=await mkdtemp(join('.local','standard-teaching-fixture-'));
  const ledger=openLedger(dir);
  try {
    const teaching=createTeaching(ledger,'iris');
    assert.equal((await teaching.explain({topic:'monitor'})).kind,'starter');
    assert.equal((await teaching.explain({topic:'adapters'})).kind,'starter');
    for(const topic of ['hl7','fhir','dicom'])assert.equal((await teaching.explain({topic})).kind,'unsupported');
    teaching.preference({mode:'focus'});assert.equal(teaching.cue('monitor',null),null);
    assert.equal((await teaching.explain({topic:'monitor'})).kind,'starter');
  } finally {ledger.close()}
});
