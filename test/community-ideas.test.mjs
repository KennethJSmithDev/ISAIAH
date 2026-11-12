import assert from 'node:assert/strict';
import { mkdtemp, rm, rmdir, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { emitOrganizationTest } from '../standalone/organization-test-emitter.mjs';
import { capabilityOpenApi } from '../standalone/fhir-openapi.mjs';
import { inspectMessageTypes } from '../standalone/message-types.mjs';
import { compileInterfaceSpec } from '../standalone/interface-spec.mjs';
import { syntheticDevelopmentContract } from '../standalone/development-plan.mjs';
import { syntheticApplication } from '../standalone/synthetic-app.mjs';
import { loadProject } from '../standalone/project.mjs';
import { openLedger } from '../standalone/ledger.mjs';
import { createTeaching } from '../standalone/teaching.mjs';

test('native test proposals can choose distinct inputs only', () => {
  const input = {sendingApplication:'APP-A',facility:'FACILITY-B',controlId:'isaiah017-a'};
  const output = emitOrganizationTest(input);
  assert.equal(output.expected.name,'FACILITY-B');
  assert.match(output.files[0].content,/message\.DocType="2\.5:ADT_A01"/);
  assert.throws(() => emitOrganizationTest({...input,facility:'APP-A'}), /distinct/);
  assert.throws(() => emitOrganizationTest({...input,facility:'A|BAD'}), /distinct/);
  assert.throws(() => emitOrganizationTest({...input,expected:'APP-A'}), /distinct/);
});

test('FHIR export checks version and bounds paths to advertised server read and search', () => {
  const organization = {type:'Organization',interaction:[{code:'read'},{code:'search-type'},{code:'update'}]};
  const data = {resourceType:'CapabilityStatement',fhirVersion:'4.0.1',rest:[
    {mode:'server',resource:[organization]},
    {mode:'client',resource:[{type:'Patient',interaction:[{code:'read'}]}]},
  ]};
  const output = capabilityOpenApi(JSON.stringify(data));
  assert.deepEqual(Object.keys(output.document.paths), ['/Organization','/Organization/{id}']);
  assert.deepEqual(output.omitted,['Organization: update']);
  const r5 = capabilityOpenApi(JSON.stringify({...data,fhirVersion:'5.0.0'}));
  assert.equal(r5.document.info.title, 'FHIR R5 advertised read and search interactions');
  assert.deepEqual(r5.document.paths, output.document.paths);
  assert.deepEqual(r5.omitted, output.omitted);
  assert.equal(output.document.info.title, 'FHIR R4 advertised read and search interactions');
  const r4b = capabilityOpenApi(JSON.stringify({...data,fhirVersion:'4.3.0'}));
  assert.equal(r4b.document.info.title, 'FHIR R4B advertised read and search interactions');
  assert.deepEqual(r4b.document.paths, output.document.paths);
  assert.deepEqual(r4b.omitted, output.omitted);
  assert.throws(() => capabilityOpenApi(JSON.stringify({...data,fhirVersion:'4.3.1'})), /FHIR R4.*R4B.*R5/);
  assert.throws(() => capabilityOpenApi(JSON.stringify({...data,fhirVersion:'constructor'})), /FHIR R4.*R5/);
  assert.throws(() => capabilityOpenApi(JSON.stringify({...data,rest:[{mode:'server',resource:[organization,organization]}]})), /duplicate/);
  assert.throws(() => capabilityOpenApi(JSON.stringify({...data,rest:[{mode:'server',resource:[{...organization,type:'../Admin'}]}]})), /resource declaration/);
});

test('large CapabilityStatements require explicit approval and ordinary source reads stay bounded', async t => {
  const root = await mkdtemp(join(tmpdir(), 'isaiah-fhir-capability-'));
  const file = join(root, 'capability.json'), profile = join(root, 'project.json');
  t.after(async () => {
    await Promise.all([file, profile].map(name => unlink(name)));
    await rmdir(root);
  });
  await writeFile(file, JSON.stringify({ resourceType:'CapabilityStatement', fhirVersion:'5.0.0',
    description:'x'.repeat(4_454_629), rest:[{mode:'server',resource:[{type:'Organization',interaction:[{code:'read'}]}]}] }));
  const record = {key:'fhir',path:'capability.json'};
  const select = async record => {
    await writeFile(profile, JSON.stringify({version:1,id:'capability-test',root,records:[record]}));
    return loadProject(profile);
  };
  const unmarked = await select(record);
  await assert.rejects(unmarked.readCapability('fhir'), /64 KiB/);
  const marked = await select({...record,kind:'fhir-capability'});
  const capability = await marked.readCapability('fhir');
  assert.deepEqual(Object.keys(capabilityOpenApi(capability.content).document.paths), ['/Organization/{id}']);
  assert.equal((await marked.snapshot()).files[0].sha256, capability.sha256);
  await assert.rejects(marked.snapshot('fhir'), /64 KiB/);
  await assert.rejects(marked.readCapability('unapproved'), /outside the approved project/);
  await writeFile(file, 'x'.repeat(8 * 1024 * 1024 + 1));
  await assert.rejects(marked.readCapability('fhir'), /8 MiB/);
});

test('type suggestions require unambiguous agreement between declared and observed directions', () => {
  const source = `Class Demo.Operation Extends Ens.BusinessOperation
{
Method Handle(input As Demo.Request, Output result As Demo.Response) As %Status
{
    Quit 1
}
XData MessageMap
{
<MapItems><MapItem MessageType="Demo.Request"><Method>Handle</Method></MapItem></MapItems>
}
}`;
  const incoming = {target:'Example',messageClass:'Demo.Request'};
  const outgoing = {source:'Example',messageClass:'Demo.Response'};
  const trace = {session:'1',hops:[incoming,outgoing]};
  assert.deepEqual(inspectMessageTypes(source,trace,'Example').suggestion,
    {sourceType:'Demo.Request',targetType:'Demo.Response',status:'candidate-for-review'});
  const mixed = inspectMessageTypes(source,{...trace,hops:[incoming,outgoing,{...outgoing,messageClass:'Demo.Other'}]},'Example');
  assert.equal(mixed.observed.outgoing.status,'multiple');
  assert.equal(mixed.suggestion,null);
  const incomplete = inspectMessageTypes(source,{...trace,hops:[incoming,outgoing,{source:'Example'}]},'Example');
  assert.equal(incomplete.observed.outgoing.status,'unknown');
  assert.equal(incomplete.suggestion,null);
});

test('interface spec exports two bounded mappings and retains the previous sending scaffold', () => {
  const spec = {schema:'isaiah.synthetic-interface.v1',facility:'sending'};
  const original = syntheticApplication(syntheticDevelopmentContract);
  const sending = compileInterfaceSpec(spec);
  const receiving = compileInterfaceSpec({...spec,facility:'receiving'});
  assert.equal(sending.field,'MSH:4');
  assert.equal(receiving.field,'MSH:6');
  assert.equal(receiving.expected.name,'ISAIAH-RECV-B');
  for (const [path,content] of Object.entries(original)) assert.equal(sending.files[path],content);
  assert.match(receiving.files['src/cls/IsaiahDevx/Mapping.cls'],/facility=input\.GetValueAt\("MSH:6"\)/);
  assert.throws(() => compileInterfaceSpec({...spec,endpoint:'https://example.invalid'}),/version 1/);
});

test('project lessons keep evidence and limits stable across teaching modes', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'isaiah-project-teaching-'));
  const ledger = openLedger(directory);
  t.after(async () => {
    ledger.close();
    await rm(directory, {recursive:true});
  });
  const teaching = createTeaching(ledger, 'iris-for-health');
  for (const run of [
    {id:'type-run',kind:'component-types',component:'Fixture',declared:{status:'unknown'},
      observed:{session:'2',incoming:{status:'observed'},outgoing:{status:'multiple'}},
      suggestion:null,scope:'Installed class identity and delivery are unverified.'},
    {id:'fhir-run',kind:'fhir-openapi',document:{paths:{'/Organization':{}}},
      verification:{status:'pass',liveBehavior:'unverified'}},
  ]) {
    const [coach, focus, companion] = ['coach','focus','companion'].map(mode => {
      teaching.preference({mode});
      const {teaching: card, ...unchanged} = teaching.projectObservation(run);
      assert.deepEqual(unchanged, run);
      assert.deepEqual(card.evidence, {kind:'run',id:run.id});
      assert.match(card.limit, /delivery (are|is) unverified/);
      return card;
    });
    assert.ok(coach.lesson);
    assert.equal(focus.lesson, null);
    assert.equal(companion.lesson, null);
    assert.ok(companion.reaction);
    for (const result of [focus,companion]) {
      assert.equal(result.facts, coach.facts);
      assert.deepEqual(result.explain, coach.explain);
    }
  }
});
