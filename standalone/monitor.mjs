import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

const id = /^[a-z0-9][a-z0-9-]{0,39}$/;
const methods = { queue: 'ReadQueueSnapshot', component: 'ReadComponentSnapshot' };
const refused = () => Object.assign(new Error('Monitoring target or record is outside the configured scope.'), { statusCode: 403 });

// The host owns Docker access. The native MCP principal and independent grants remain the read authority.
export async function loadMonitor(file = process.env.ISAIAH_MONITOR_PROFILE) {
  if (!file) return null;
  let profile;
  try { profile = JSON.parse(await readFile(file, 'utf8')); } catch { throw new Error('Monitoring profile could not be read.'); }
  if (Object.keys(profile).some(key => !['id','container','image','containerName','owner','instance','namespace','production','config','records'].includes(key)) ||
      !id.test(profile.id) || !/^[a-f0-9]{64}$/.test(profile.container) || !/^sha256:[a-f0-9]{64}$/.test(profile.image) ||
      !/^isaiah-[a-z0-9_-]+$/.test(profile.containerName) || !/^[a-z0-9_-]{1,80}$/.test(profile.owner) ||
      !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(profile.instance) ||
      !/^[A-Z][A-Z0-9_-]{0,30}$/.test(profile.namespace) || !/^[\w.]{3,100}$/.test(profile.production) ||
      !/^\/[a-zA-Z0-9_./-]+\.toml$/.test(profile.config) || profile.config.split('/').includes('..') ||
      !Array.isArray(profile.records) || !profile.records.length || profile.records.length > 16) throw refused();
  const records = new Map();
  for (const record of profile.records) {
    if (Object.keys(record).some(key => !['key','kind','name'].includes(key)) || !id.test(record.key) || records.has(record.key) || !Object.hasOwn(methods, record.kind) ||
        typeof record.name !== 'string' || !record.name.length || record.name.length > 100 || /[\x00-\x1f]/.test(record.name)) throw refused();
    records.set(record.key, { ...record });
  }
  let inFlight = false;
  return { id: profile.id, async inspect(target, key) {
    const record = records.get(key);
    if (target !== profile.id || !record) throw refused();
    if (inFlight) throw Object.assign(new Error('A monitoring read is already in progress.'), { statusCode: 409 });
    inFlight = true;
    try { return monitorObservation(profile, record, await nativeRead(profile, record)); }
    finally { inFlight = false; }
  } };
}

export function monitorObservation(profile, record, snapshot) {
  if (!Object.hasOwn(methods, record.kind)) throw refused();
  const target = snapshot?.target;
  if (!target || target.instance !== profile.instance || target.namespace !== profile.namespace || target.production !== profile.production ||
      target.edition !== 'iris-for-health' || !target.nativeHub || !target.build?.includes('2026.3.0AI (Build 154U)') ||
      snapshot.audit !== 'recorded' || typeof snapshot.observedAt !== 'string' || !snapshot.observedAt || snapshot.observedAt.length > 128 ||
      snapshot.kind !== (record.kind === 'queue' ? 'queue-snapshot' : 'component-config-snapshot')) throw refused();
  let receipt;
  if (record.kind === 'queue') {
    if (snapshot.queue !== record.name || snapshot.authority !== 'explicit-queue-grant' || !Number.isSafeInteger(snapshot.count) || snapshot.count < 0) throw refused();
    receipt = { claim: 'audited queue snapshot received', queue: snapshot.queue, count: snapshot.count };
  } else {
    const item = snapshot.component;
    if (!item || item.name !== record.name || snapshot.authority !== 'explicit-component-grant' || typeof item.class !== 'string' ||
        ![0, 1].includes(item.enabled) || !Number.isSafeInteger(item.poolSize) || item.poolSize < 0) throw refused();
    receipt = { claim: 'audited component configuration received', component: { name: item.name, class: item.class, enabled: item.enabled, poolSize: item.poolSize } };
  }
  return { target: { id: profile.id, kind: 'iris-mcp', instance: target.instance, namespace: target.namespace, production: target.production,
      version: target.build, edition: target.edition }, record: record.key, observedAt: new Date().toISOString(),
    snapshotAt: snapshot.observedAt, path: 'native-scoped-mcp', productionDeliveryClaim: false, approval: false,
    verification: { status: 'pass', claim: 'validated-audited-snapshot', independentComparison: false,
      receipt: { ...receipt, observedAt: snapshot.observedAt, audit: snapshot.audit } } };
}

async function nativeRead(profile, record) {
  const inspection = await command(['container', 'inspect', '--format', '{{json .Id}}|{{json .Name}}|{{json .Image}}|{{json .State.Running}}|{{json (index .Config.Labels "dev.isaiah.owner")}}', profile.container]);
  const fields = inspection.trim().split('|').map(x => JSON.parse(x));
  if (fields[0] !== profile.container || fields[1] !== '/' + profile.containerName || fields[2] !== profile.image || fields[3] !== true || fields[4] !== profile.owner) throw refused();
  const child = spawn('docker', ['exec', '-i', '--user', '51773', profile.container, '/usr/irissys/bin/iris-mcp-server', '--config', profile.config, 'run'],
    { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
  const pending = new Map(); let sequence = 0, bytes = 0;
  const fail = () => { for (const reject of pending.values()) reject.reject(new Error('The configured native MCP read was unavailable.')); pending.clear(); child.kill(); };
  child.on('error', fail); child.on('exit', () => { if (pending.size) fail(); }); child.stdin.on('error', fail);
  child.stdout.on('data', chunk => { bytes += chunk.length; if (bytes > 262144) fail(); });
  const lines = createInterface({ input: child.stdout });
  lines.on('line', line => {
    let message; try { message = JSON.parse(line); } catch { return; }
    const promise = pending.get(message.id); if (!promise) return;
    pending.delete(message.id);
    message.error ? promise.reject(new Error('Native MCP protocol refused the read.')) : promise.resolve(message.result);
  });
  const rpc = (method, params) => new Promise((resolve, reject) => {
    const request = ++sequence; pending.set(request, { resolve, reject });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: request, method, params }) + '\n');
  });
  const timer = setTimeout(fail, 20000);
  try {
    await rpc('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'isaiah-monitor-inspect', version: '1' } });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    const list = await rpc('tools/list', {}), matches = list.tools?.filter(t => t.name.endsWith(methods[record.kind]));
    if (matches?.length !== 1 || list.tools.some(t => /approve|apply|rollback|accept/i.test(t.name))) throw refused();
    const result = await rpc('tools/call', { name: matches[0].name, arguments: { instance: profile.instance, namespace: profile.namespace,
      production: profile.production, [record.kind]: record.name } });
    if (result.isError) throw refused();
    return result.structuredContent ?? JSON.parse(result.content[0].text);
  } finally { clearTimeout(timer); lines.close(); child.stdin.end(); child.kill(); }
}

function command(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', args, { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    let text = ''; const timer = setTimeout(() => { child.kill(); reject(new Error('Monitoring container inspection timed out.')); }, 6500);
    child.stdout.on('data', chunk => { text += chunk; if (text.length > 16384) child.kill(); });
    child.on('error', () => { clearTimeout(timer); reject(new Error('Monitoring container is unavailable.')); });
    child.on('close', code => { clearTimeout(timer); code ? reject(new Error('Monitoring container inspection was refused.')) : resolve(text); });
  });
}
