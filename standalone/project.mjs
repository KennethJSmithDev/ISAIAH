import { createHash, randomUUID } from 'node:crypto';
import { lstat, open, readFile, realpath, writeFile, unlink, mkdir } from 'node:fs/promises';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { lstatSync, realpathSync, readFileSync, renameSync } from 'node:fs';

const hash = value => createHash('sha256').update(value).digest('hex');
const fields = (value, keys) => value && !Array.isArray(value) && Object.keys(value).every(k => keys.includes(k));
const fail = message => { throw Object.assign(new Error(message), { statusCode: 409 }); };
const sourceLimit = 64 * 1024;
const capabilityLimit = 8 * 1024 * 1024;
const capabilityRecord = record => record.kind === 'fhir-capability';
function checkReadBound(stat, limit) {
  if (!stat.isFile() || stat.size > limit) {
    fail(limit === capabilityLimit ? 'CapabilityStatement must be a regular file no larger than 8 MiB.'
      : 'Source must be a regular file no larger than 64 KiB.');
  }
}

export async function loadProject(path = process.env.ISAIAH_PROJECT_PROFILE) {
  if (!path) return null;
  const profile = JSON.parse(await readFile(path, 'utf8'));
  if (!fields(profile, ['version','id','root','records','allowApply','allowDesign','target']) || profile.version !== 1 ||
      !/^[a-z][a-z0-9-]{2,40}$/.test(profile.id ?? '') || !isAbsolute(profile.root ?? '') ||
      !Array.isArray(profile.records) || !profile.records.length || profile.records.length > 32 ||
      (profile.allowApply !== undefined && typeof profile.allowApply !== 'boolean') ||
      (profile.allowDesign !== undefined && typeof profile.allowDesign !== 'boolean')) fail('Invalid operator-selected project profile.');
  if (profile.target && (!fields(profile.target,['instance','namespace','production']) ||
      !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(profile.target.instance ?? '') ||
      !/^[A-Z][A-Z0-9_-]{0,30}$/.test(profile.target.namespace ?? '') || !/^[\w.]{3,100}$/.test(profile.target.production ?? ''))) fail('Invalid configured project target.');
  const root = await realpath(profile.root);
  if (!(await lstat(root)).isDirectory() || (await lstat(profile.root)).isSymbolicLink()) fail('Select a real project directory.');
  const records = new Map();
  for (const record of profile.records) {
    if (!fields(record, ['key','path','kind']) || !/^[a-z][a-z0-9-]{0,39}$/.test(record.key ?? '') ||
        !/^[A-Za-z0-9_/-][A-Za-z0-9_./-]*\.(?:cls|mjs|js|md|json|html|css|xml|yaml|yml|txt|py|ps1|sh)$/.test(record.path ?? '') ||
        (record.kind !== undefined && (!capabilityRecord(record) || extname(record.path) !== '.json')) ||
        /(?:^|\/)(?:node_modules|private)(?:\/|$)|credential|password|secret|token/i.test(record.path) ||
        record.path.split('/').some(x => !x || x.startsWith('.')) || records.has(record.key)) fail('Invalid approved source record.');
    records.set(record.key, { ...record });
  }
  if (new Set([...records.values()].map(x => x.path.toLowerCase())).size !== records.size) fail('Source records must be distinct.');
  const identity = hash(JSON.stringify([root, profile.id, [...records.values()], !!profile.allowApply, !!profile.allowDesign,profile.target??null]));
  async function read(record, limit = sourceLimit) {
    const file = resolve(root, ...record.path.split('/'));
    for (let current = file; current !== root; current = dirname(current)) {
      const rel = relative(root, current);
      if (rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel) || (await lstat(current)).isSymbolicLink()) fail('Source path escaped the approved project.');
    }
    if (await realpath(root) !== root || await realpath(file) !== file) fail('Source identity changed.');
    checkReadBound(await lstat(file), limit);
    const handle = await open(file, 'r');
    let bytes, stat;
    try {
      stat = await handle.stat();
      checkReadBound(stat, limit);
      const buffer = Buffer.alloc(stat.size + 1);
      let count = 0;
      while (count < buffer.length) {
        const { bytesRead } = await handle.read(buffer, count, buffer.length - count, count);
        if (!bytesRead) break;
        count += bytesRead;
      }
      if (count !== stat.size) fail('Source size changed while reading.');
      bytes = buffer.subarray(0, count);
    } finally {
      await handle.close();
    }
    const content = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return { file, content, mode: stat.mode, summary: { ...record, bytes: bytes.length, sha256: hash(bytes) } };
  }
  async function snapshot(key) {
    if (key !== undefined && !records.has(key)) fail('Source record is outside the approved project.');
    const files = []; let selected;
    for (const record of records.values()) {
      const limit = capabilityRecord(record) && record.key !== key ? capabilityLimit : sourceLimit;
      const value = await read(record, limit); files.push(value.summary);
      if (record.key === key) selected = { key, content: value.content, sha256: value.summary.sha256 };
    }
    return { kind: 'project-map.v1', id: profile.id, rootIdentity: identity, configuredTarget:profile.target?{...profile.target}:null, permissions: { read: true, propose: true, apply: !!profile.allowApply, design: !!profile.allowDesign }, files, ...(selected ? { selected } : {}) };
  }
  async function readCapability(key) {
    const record = records.get(key);
    if (!record) fail('Source record is outside the approved project.');
    const value = await read(record, capabilityRecord(record) ? capabilityLimit : sourceLimit);
    return { key, content:value.content, sha256:value.summary.sha256 };
  }
  let busy = false;
  async function replace(change, commit) {
    if (!profile.allowApply) fail('This project profile does not permit applying a reviewed patch.');
    if (busy) fail('Another project patch is in progress.');
    busy = true; let lock, temporary, acquired = false;
    try {
      lock = join(root, '.isaiah-patch.lock');
      await writeFile(lock, identity, { flag: 'wx', mode: 0o600 });
      acquired = true;
      const record = records.get(change.key);
      if (!record || record.path !== change.path) fail('Patch record is outside the approved project.');
      const current = await read(record);
      if (current.summary.sha256 === change.after) return commit(() => ({ status: 'already-applied', sha256: change.after }));
      if (current.summary.sha256 !== change.before) fail('Source changed after review; inspect a new proposal.');
      if (hash(Buffer.from(change.content)) !== change.after) fail('Patch content identity is invalid.');
      temporary = join(dirname(current.file), '.isaiah-patch-' + randomUUID());
      await writeFile(temporary, change.content, { flag: 'wx', mode: current.mode });
      // Keep accepted-revision selection and the final bounded file replacement in one ledger lock.
      commit(() => {
        const stat = lstatSync(current.file);
        if (realpathSync(current.file) !== current.file || stat.isSymbolicLink() || stat.size > sourceLimit || hash(readFileSync(current.file)) !== change.before) fail('Source changed before replacement.');
        renameSync(temporary, current.file);
      });
      temporary = undefined;
      return { status: 'applied', sha256: change.after };
    } finally {
      if (temporary) await unlink(temporary).catch(() => {});
      if (acquired) await unlink(lock).catch(() => {});
      busy = false;
    }
  }
  return { id: profile.id, scope: 'project-v1/' + identity, snapshot, readCapability, replace };
}

export function projectFacts(snapshot) {
  const { selected, ...facts } = snapshot;
  return facts;
}

export function projectPatchDiff(change) {
  if (change.original === change.content) return '';
  const lines = (text, prefix) => {
    if (!text) return [];
    const terminated = text.endsWith('\n'), rows = (terminated ? text.slice(0,-1) : text).split('\n').map(line => prefix + line);
    if (!terminated) rows.push('\\ No newline at end of file');
    return rows;
  };
  const oldCount = change.original ? change.original.split('\n').length - Number(change.original.endsWith('\n')) : 0;
  const newCount = change.content ? change.content.split('\n').length - Number(change.content.endsWith('\n')) : 0;
  return ['--- a/' + change.path, '+++ b/' + change.path, `@@ -${oldCount ? 1 : 0},${oldCount} +${newCount ? 1 : 0},${newCount} @@`, ...lines(change.original,'-'), ...lines(change.content,'+')].join('\n') + '\n';
}

export async function checkProjectPatch({ project, directory, key, content }) {
  if (typeof content !== 'string' || Buffer.byteLength(content) > 16000 || content.includes('\0')) fail('A text replacement up to 16,000 bytes is required.');
  const snapshot = await project.snapshot(key), record = snapshot.files.find(x => x.key === key);
  if (!['.mjs','.js'].includes(extname(record.path))) fail('This first patch gate checks JavaScript only; ObjectScript requires an independently qualified compiler gate.');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, randomUUID() + extname(record.path));
  try {
    await writeFile(path, content, { flag: 'wx', mode: 0o600 });
    try { await promisify(execFile)(process.execPath, ['--check', path], { timeout: 5000, maxBuffer: 16000, windowsHide: true }); }
    catch { fail('The proposed source failed its bounded syntax check. No code was executed.'); }
  } finally { await unlink(path).catch(() => {}); }
  return { project: snapshot.rootIdentity, key, path: record.path, before: record.sha256, after: hash(Buffer.from(content)), content, original: snapshot.selected.content,
    checks: { status: 'pass', kind: 'syntax-only', codeExecuted: false, runtimeBehavior: 'unverified' } };
}
