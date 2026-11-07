#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { standalonePort } from './loopback.mjs';

const origin = 'http://127.0.0.1:' + standalonePort();
const usage = `ISAIAH standalone developer harness
  isaiah serve
  isaiah doctor
  isaiah trace --session <id>
  isaiah run show <id>
  isaiah explain --topic <name> [--live]
  isaiah explain --question <text> [--live]
  isaiah teach <coach|focus|companion>
  isaiah teach less <topic>
  isaiah docs import <approved-pack.json>
  isaiah skill <accept|restore> <revision>`;

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
    session: { type: 'string' }, topic: { type: 'string' }, question: { type: 'string' }, live: { type: 'boolean' }
  } });
  const [action, id] = positionals;
  if (!command || command === '--help' || command === 'help') console.log(usage);
  else if (command === 'serve' && !args.length) {
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
  else if (command === 'explain' && !positionals.length && (!!values.topic !== !!values.question) && !values.session) {
    output(await request('developer/explain', values));
  } else if (command === 'teach' && ['coach', 'focus', 'companion'].includes(action) && args.length === 1) {
    output(await request('developer/preferences', { mode: action }));
  } else if (command === 'teach' && action === 'less' && id && args.length === 2) output(await request('developer/preferences', { less: id }));
  else if (command === 'docs' && action === 'import' && id && args.length === 2) {
    output(await request('developer/sources', { sources: JSON.parse(await readFile(id, 'utf8')) }));
  } else if (command === 'skill' && ['accept', 'restore'].includes(action) && id && args.length === 2) {
    output(await request('developer/review', { id, action }));
  } else throw new Error(usage);
} catch (error) {
  console.error(error.message === 'fetch failed' ? 'ISAIAH is not reachable on the standalone loopback port. Start isaiah serve or the standalone Compose project.' : error.message);
  process.exitCode = 1;
}
