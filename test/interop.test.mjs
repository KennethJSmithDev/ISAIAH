import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { loadInterop } from '../standalone/interop.mjs';

test('scoped FHIR reads enforce identity, version, response bounds and authority without writes', async () => {
  let calls = 0, scenario = 'good';
  const server = createServer((req,res) => {
    calls++;
    assert.equal(req.method, 'GET');
    assert.equal(req.headers.authorization, 'Basic ' + Buffer.from('fixture:separate-secret').toString('base64'));
    if (scenario === 'redirect') { res.writeHead(302, { Location: 'http://example.invalid/' }); return res.end(); }
    res.setHeader('Content-Type','application/fhir+json');
    if (scenario === 'oversize') return res.end(' '.repeat(2_000_001));
    if (req.url.endsWith('/metadata')) return res.end(JSON.stringify({resourceType:'CapabilityStatement',fhirVersion:scenario === 'version'?'4.0.1':'5.0.0'}));
    res.end(JSON.stringify({resourceType:'Organization',id:scenario === 'identity'?'other':'1',meta:{versionId:'1'}}));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const directory = await mkdtemp(join(tmpdir(),'isaiah-interop-'));
  try {
    const profile = [{id:'synthetic-fhir',kind:'fhir',instance:'fixture-instance',origin:'http://127.0.0.1:'+server.address().port,
      base:'/fhir/r5/',version:'5.0.0',records:[{key:'organization',type:'Organization',id:'1',version:'1',
        sha256:createHash('sha256').update(JSON.stringify({resourceType:'Organization',id:'1',meta:{versionId:'1'}})).digest('hex')}]}];
    const profileFile=join(directory,'profile.json'), credentialFile=join(directory,'credentials.json');
    await writeFile(profileFile,JSON.stringify(profile));
    await writeFile(credentialFile,JSON.stringify({'synthetic-fhir':{username:'fixture',password:'separate-secret'}}));
    const interop=await loadInterop(profileFile,credentialFile);
    const observed=await interop.inspect('synthetic-fhir','organization');
    assert.equal(observed.verification.status,'pass');
    assert.equal(observed.productionDeliveryClaim,false);
    assert.equal(observed.approval,false);
    assert.ok(!JSON.stringify(observed).includes('separate-secret'));
    const before=calls;
    await assert.rejects(interop.inspect('other','organization'),/outside/);
    await assert.rejects(interop.inspect('synthetic-fhir','../Patient'),/outside/);
    assert.equal(calls,before);
    const running = interop.inspect('synthetic-fhir','organization');
    await assert.rejects(interop.inspect('synthetic-fhir','organization'),/already in progress/);
    await running;
    for (scenario of ['version','identity','redirect','oversize']) await assert.rejects(interop.inspect('synthetic-fhir','organization'));
    profile[0].origin='http://example.invalid';
    await writeFile(profileFile,JSON.stringify(profile));
    await assert.rejects(loadInterop(profileFile,credentialFile),/outside/);
  } finally { await new Promise(resolve=>server.close(resolve)); await rm(directory,{recursive:true}); }
});

test('DICOMweb transport validates exact query scope and rejects malformed, extra or altered parts',async()=>{
  const bytes=await readFile(new URL('./interop-fixture/synthetic-ct.dcm',import.meta.url));
  const uids=['1.2.826.0.1.3680043.8.498.45786507052889985556320167146456776863',
    '1.2.826.0.1.3680043.8.498.90486473850908010797667047489409788331',
    '1.2.826.0.1.3680043.8.498.837522752347865492905693577262860532'];
  let scenario='good';
  const server=createServer((req,res)=>{
    assert.equal(req.method,'GET');
    if(req.url.includes('?')){
      assert.ok(req.url.endsWith('?SOPInstanceUID='+uids[2]));
      res.setHeader('Content-Type','application/dicom+json');
      return res.end(JSON.stringify([{'00080018':{Value:[scenario==='uid'?'1.2.9':uids[2]]},
        '0020000D':{Value:[uids[0]]},'0020000E':{Value:[uids[1]]}}]));
    }
    res.setHeader('Content-Type','multipart/related; type="application/dicom"; boundary="isaiah-fixture"');
    const opening=Buffer.from('--isaiah-fixture\r\nContent-Type: '+(scenario==='type'?'text/plain':'application/dicom')+'\r\n\r\n');
    const content=scenario==='hash'?Buffer.from('altered-fixture'):bytes;
    const closing=Buffer.from('\r\n--isaiah-fixture--\r\n');
    if(scenario==='truncated')return res.end(Buffer.concat([opening,content]));
    if(scenario==='multiple')return res.end(Buffer.concat([opening,content,Buffer.from('\r\n'),opening,content,closing]));
    res.end(Buffer.concat([opening,content,closing]));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const directory=await mkdtemp(join(tmpdir(),'isaiah-dicomweb-'));
  try{
    const profile=[{id:'synthetic-pacs',kind:'dicomweb',instance:'fixture-pacs',origin:'http://127.0.0.1:'+server.address().port,
      base:'/dicom-web/',version:'transport-fixture',records:[{key:'ct',study:uids[0],series:uids[1],instance:uids[2],sha256:createHash('sha256').update(bytes).digest('hex')}]}];
    await writeFile(join(directory,'profile.json'),JSON.stringify(profile));
    await writeFile(join(directory,'secret.json'),JSON.stringify({'synthetic-pacs':{username:'fixture',password:'separate-secret'}}));
    const interop=await loadInterop(join(directory,'profile.json'),join(directory,'secret.json'));
    const result=await interop.inspect('synthetic-pacs','ct');assert.equal(result.verification.receipt.instance,uids[2]);
    assert.equal(result.versionSource,'configured-profile');assert.equal(result.verification.receipt.bytes,bytes.length);
    for(scenario of ['uid','type','hash','truncated','multiple'])await assert.rejects(interop.inspect('synthetic-pacs','ct'));
  }finally{await new Promise(resolve=>server.close(resolve));await rm(directory,{recursive:true})}
});
