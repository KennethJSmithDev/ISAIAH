#!/usr/bin/env node
import { readFile, writeFile, lstat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { connectionPreset } from './connections.mjs';
import { loadProviderProfile } from '../provider-profiles.mjs';
import { parseArgs } from 'node:util';
import { standalonePort } from './loopback.mjs';
import { exportProject } from './export-project.mjs';
import { projectPatchDiff } from './project.mjs';

const origin = 'http://127.0.0.1:' + standalonePort();
const usage = `ISAIAH standalone developer harness
  isaiah serve
  isaiah doctor
  isaiah trace --session <id>
  isaiah inspect --target <configured-target> --record <approved-record>
  isaiah run show <id>
  isaiah explain --topic <name> [--live]
  isaiah explain --question <text> [--live]
  isaiah explain --run <retained-trace-id> [--topic <session|delivery>]
  isaiah teach <coach|focus|companion>
  isaiah teach less <topic>
  isaiah docs import <approved-pack.json>
  isaiah skill <accept|restore> <revision>
  isaiah context propose <verified-trace-run>
  isaiah context <accept|restore> <revision>
  isaiah project map
  isaiah project design --objective <synthetic-HL7-to-FHIR-task>
  isaiah project export <retained-plan-run> --output <new-directory>
  isaiah project read --record <approved-key>
  isaiah project context <propose|accept|restore> <run-or-revision>
  isaiah project patch propose --record <approved-key> --replacement <local-file>
  isaiah project patch show <patch-run>
  isaiah project patch <accept|apply|reconcile> <run> <revision>
  isaiah project patch reverse <applied-run>
  isaiah provider show
  isaiah provider preset <ollama|compatible|chatgpt> --profile <new-private-file> [--model <id>] [--port <port>] [--compose]
    Experimental compatible bridges: --account-name <name> --account-origin <loopback-origin>
  isaiah account <status|login|models|disconnect>`;

async function request(path, data) {
  const response = await fetch(origin + '/api/' + path, {
    ...(data === undefined ? {} : { method: 'POST', body: JSON.stringify(data),
      headers: { Origin: origin, 'X-Isaiah-Request': 'browser', 'Content-Type': 'application/json' } }),
    signal: AbortSignal.timeout(315_000), redirect: 'error'
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`${response.status} ${body.error ?? 'Request failed.'}`);
  return body;
}
const output = value => console.log(JSON.stringify(value, null, 2));

try {
  const [command, ...args] = process.argv.slice(2);
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
    session: { type: 'string' }, topic: { type: 'string' }, question: { type: 'string' }, live: { type: 'boolean' },
    target: { type: 'string' }, record: { type: 'string' }, model: { type: 'string' },
    profile: { type: 'string' }, port: { type: 'string' }, compose: { type: 'boolean' }, run: {type:'string'},
    'account-name': {type:'string'}, 'account-origin': {type:'string'}, replacement: {type:'string'}, objective: {type:'string'}, output: {type:'string'}
  } });
  const [action, id] = positionals;
  if (!command || command === '--help' || command === 'help') console.log(usage);
  else if (command === 'project' && action === 'export' && positionals.length === 2 && values.output && Object.keys(values).length === 1) {
    output(await exportProject(await request('runs/' + encodeURIComponent(id)),values.output));
  }
  else if (command === 'project' && action === 'patch' && id === 'show' && positionals.length === 3 && !Object.keys(values).length) {
    const run = await request('runs/' + encodeURIComponent(positionals[2]));
    if (run.kind !== 'project-patch') throw new Error('Choose a retained project patch.');
    output({ id:run.id, recordedOutcome:run.patchReview.status, phase:run.phase, checks:run.patch.checks, before:run.patch.before, after:run.patch.after, diff:projectPatchDiff(run.patch) });
  }
  else if (command === 'project') {
    let input;
    if (action === 'map' && args.length === 1) input = { operation: 'map' };
    else if (action === 'design' && positionals.length === 1 && values.objective && Object.keys(values).length === 1) input = { operation:'design', objective:values.objective };
    else if (action === 'read' && positionals.length === 1 && values.record && Object.keys(values).length === 1) input = { operation: 'read', key: values.record };
    else if (action === 'context' && ['propose','accept','restore'].includes(id) && positionals.length === 3 && !Object.keys(values).length) {
      input = { operation: 'context-' + id, ...(id === 'propose' ? { runId: positionals[2] } : { revision: positionals[2] }) };
    } else if (action === 'patch' && id === 'propose' && positionals.length === 2 && values.record && values.replacement && Object.keys(values).length === 2) {
      const replacement = await lstat(values.replacement);
      if (!replacement.isFile() || replacement.isSymbolicLink() || replacement.size > 16000) throw new Error('Select a regular replacement file up to 16,000 bytes.');
      input = { operation: 'patch-propose', key: values.record, content: await readFile(values.replacement,'utf8') };
    } else if (action === 'patch' && ['accept','apply','reconcile'].includes(id) && positionals.length === 4 && !Object.keys(values).length) {
      input = { operation: 'patch-' + id, runId: positionals[2], revision: positionals[3] };
    } else if (action === 'patch' && id === 'reverse' && positionals.length === 3 && !Object.keys(values).length) input = { operation: 'patch-reverse', runId: positionals[2] };
    else throw new Error(usage);
    output(await request('developer/project',input));
  }
  else if (command === 'provider' && action === 'show' && args.length === 1) {
    output({ profile: await loadProviderProfile({standalone:true,compose:process.env.ISAIAH_COMPOSE==='1'}), restartRequiredForSelection:true });
  } else if (command === 'provider' && action === 'preset' && positionals.length === 2 && values.profile &&
      Object.keys(values).every(key=>['model','profile','port','compose','account-name','account-origin'].includes(key))) {
    const profile=await connectionPreset(id,{...values,accountName:values['account-name'],accountOrigin:values['account-origin']}), path=resolve(values.profile);
    await writeFile(path,JSON.stringify(profile,null,2)+'\n',{flag:'wx',mode:0o600});
    output({profile,profileFile:path,restartRequired:true,credentials:'Separate credential file and explicit account consent, when required.'});
  } else if (command === 'account' && ['status','login','models','disconnect'].includes(action) && args.length === 1) {
    const child=spawn(process.execPath,[fileURLToPath(new URL('../chatgpt/account-cli.mjs',import.meta.url)),action],{stdio:'inherit',windowsHide:true});
    process.exitCode=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',code=>resolve(code??1))});
  } else if (command === 'serve' && !args.length) {
    process.env.ISAIAH_STANDALONE = '1';
    process.env.ISAIAH_HOME ??= join(homedir(), '.isaiah');
    await import('../server.mjs');
  } else if (command === 'doctor' && !args.length) {
    const result = await request('developer/doctor');
    output(result);
    if (!result.ready || !result.agent) process.exitCode = 1;
  } else if (command === 'trace' && values.session && !positionals.length && Object.keys(values).length === 1) {
    const result = await request('developer/trace', { session: values.session });
    output(result);
    if (result.verification.status !== 'pass') process.exitCode = 1;
  } else if (command === 'run' && action === 'show' && id && args.length === 2) output(await request('runs/' + encodeURIComponent(id)));
  else if (command === 'inspect' && !positionals.length && values.target && values.record && Object.keys(values).length === 2) {
    output(await request('developer/inspect', values));
  }
  else if (command === 'explain' && !positionals.length && values.run && Object.keys(values).every(key=>['run','topic'].includes(key))) {
    output(await request('developer/card',{runId:values.run,topic:values.topic??'session'}));
  }
  else if (command === 'explain' && !positionals.length && (!!values.topic !== !!values.question) && Object.keys(values).every(key=>['topic','question','live'].includes(key))) {
    output(await request('developer/explain', values));
  } else if (command === 'teach' && ['coach', 'focus', 'companion'].includes(action) && args.length === 1) {
    output(await request('developer/preferences', { mode: action }));
  } else if (command === 'teach' && action === 'less' && id && args.length === 2) output(await request('developer/preferences', { less: id }));
  else if (command === 'docs' && action === 'import' && id && args.length === 2) {
    output(await request('developer/sources', { sources: JSON.parse(await readFile(id, 'utf8')) }));
  } else if (command === 'skill' && ['accept', 'restore'].includes(action) && id && args.length === 2) {
    output(await request('developer/review', { id, action }));
  } else if (command === 'context' && ['propose','accept','restore'].includes(action) && id && args.length === 2) {
    output(await request('developer/context', { action, ...(action === 'propose' ? { runId: id } : { id }) }));
  } else throw new Error(usage);
} catch (error) {
  console.error(error.message === 'fetch failed' ? 'ISAIAH is not reachable on the standalone loopback port. Start isaiah serve or the standalone Compose project.' : error.message);
  process.exitCode = 1;
}
