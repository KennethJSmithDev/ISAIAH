#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { connectionPreset } from './connections.mjs';
import { loadProviderProfile } from '../provider-profiles.mjs';
import { parseArgs } from 'node:util';
import { standalonePort } from './loopback.mjs';

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
    'account-name': {type:'string'}, 'account-origin': {type:'string'}
  } });
  const [action, id] = positionals;
  if (!command || command === '--help' || command === 'help') console.log(usage);
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
