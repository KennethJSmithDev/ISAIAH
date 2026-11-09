import test from 'node:test';
import assert from 'node:assert/strict';
import { connectionPreset } from '../standalone/connections.mjs';
import { loadProviderProfile } from '../provider-profiles.mjs';
import { mkdtemp,writeFile,rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('connection presets feed the existing native gateway without changing credential ownership',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'isaiah-connections-'));
  try{
    for(const choice of ['ollama','compatible','chatgpt'])for(const compose of [false,true]){
      const profile=await connectionPreset(choice,{model:choice==='ollama'?undefined:'gpt-6.1-terra',compose});
      const file=join(directory,'profile.json');await writeFile(file,JSON.stringify(profile));
      assert.deepEqual(await loadProviderProfile({file,standalone:true,compose}),profile);
      assert.ok(!Object.keys(profile).some(key=>/token|password|credential/i.test(key)));
    }
    await assert.rejects(connectionPreset('chatgpt'),/exact model/);
    await assert.rejects(connectionPreset('claude-subscription',{model:'example'}),/Choose/);
    await assert.rejects(connectionPreset('ollama',{model:'other'}),/pinned/);
    await assert.rejects(connectionPreset('compatible',{model:'valid',port:'80'}),/unprivileged/);
    const external=await connectionPreset('compatible',{model:'fixture-model',port:'18879',accountName:'Synthetic Provider',accountOrigin:'http://127.0.0.1:18879'});
    assert.equal(external.account.protocol,'local-account-bridge.v1');
    await assert.rejects(connectionPreset('chatgpt',{model:'fixture-model',accountName:'Other'}),/qualified presets remain unchanged/);
  }finally{await rm(directory,{recursive:true})}
});
