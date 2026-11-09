import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { developerProfile } from '../standalone/developer.mjs';

test('target profile accepts a canonical scoped identity and refuses malformed identifiers',async()=>{
  await mkdir('.local',{recursive:true});
  const dir=await mkdtemp(join(process.cwd(),'.local','target-profile-'));
  const file=join(dir,'profile.json');
  const original=process.env.ISAIAH_DEV_PROFILE;
  const profile={instance:'11111111-2222-4333-8444-555555555555',namespace:'ISAIAHDEV',production:'DevTrace.Production',tracePassword:'Tr!'+'A'.repeat(28),traceUrl:'http://127.0.0.1:18812/isaiah-trace'};
  try{
    process.env.ISAIAH_DEV_PROFILE=file;
    await writeFile(file,JSON.stringify(profile));assert.equal((await developerProfile(false)).instance,profile.instance);
    for(const instance of ['-'.repeat(36),'1'.repeat(36),'111111112-222-4333-8444-555555555555']){
      await writeFile(file,JSON.stringify({...profile,instance}));await assert.rejects(developerProfile(false),/Invalid developer trace profile/);
    }
  }finally{if(original===undefined)delete process.env.ISAIAH_DEV_PROFILE;else process.env.ISAIAH_DEV_PROFILE=original;}
});
