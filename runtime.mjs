import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { legacyModel, loadProviderCredential, loadProviderProfile, providerReady, readProviderJson } from './provider-profiles.mjs';

export const ceilings = Object.freeze({ modelRequests: 12, toolDispatches: 24, elapsedSeconds: 300 });
export const model = legacyModel;
const containerImage = 'sha256:bbea4364ab6fbd7810219780fa76730fc2977d8cf76f3e01b92c5d4291a2feae';

function docker(args, data, timeout = 6500) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', args, { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
    let output = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('Timed out waiting for the task-owned IRIS transport.'));
    }, timeout);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      output += chunk;
      if (output.length > 220_000) child.kill();
    });
    child.stdin.on('error', () => {});
    child.on('error', () => {
      clearTimeout(timer);
      reject(new Error('Docker could not start the task-owned IRIS transport.'));
    });
    child.on('close', code => {
      clearTimeout(timer);
      if (code) return reject(new Error('The task-owned IRIS transport exited before returning a result.'));
      try { resolve(JSON.parse(output)); }
      catch { reject(new Error('The task-owned IRIS transport returned malformed output.')); }
    });
    child.stdin.end(data === undefined ? undefined : JSON.stringify(data));
  });
}

export async function requestBody(req, maximum) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > maximum) throw new Error('Request body exceeds the configured limit.');
    chunks.push(chunk);
  }
  return { data: JSON.parse(Buffer.concat(chunks).toString('utf8')), bytes };
}

export function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

export async function createRuntime(directory, active, compose = false, repairLocal = false, applySandbox = false, standalone = false, profile = null) {
  const selected = await loadProviderProfile({ compose, repairLocal, applySandbox, standalone });
  const upstreamCredential = await loadProviderCredential();
  if (selected.account && !upstreamCredential) throw new Error('Experimental account bridges require a separate local bridge credential.');
  const providerIdentity = Object.freeze({ id: selected.id, kind: selected.kind, model: selected.model,
    ...(selected.account ? { account: selected.account, qualification: 'experimental-unqualified' } : {}) });
  const owner = repairLocal ? 'repair-local' : 'local-v010';
  const runtimeLabel = 'Native AI Hub · ' + selected.kind + ' · ' + selected.model + (selected.account ? ' · experimental bridge' : '');
  const disconnected = connection => ({ target: 'ISAIAH · synthetic only', runtime: runtimeLabel, connection, ready: false });
  let credentials;
  let id;
  try {
    credentials = profile?.agentUrl && !compose ? { password: profile.agentPassword, providerToken: profile.providerToken } :
      JSON.parse(await readFile(compose ? '/run/secrets/isaiah-credentials' : join(directory, 'credentials.json'), 'utf8'));
    if (!compose && !profile?.agentUrl) id = JSON.parse(await readFile(join(directory, 'target.json'), 'utf8')).id;
    if ((!compose && !profile?.agentUrl && !/^[0-9a-f]{64}$/.test(id)) || !/^Is![A-F0-9]{28}$/.test(credentials.password) ||
        !/^[A-F0-9]{64}$/.test(credentials.providerToken)) throw new Error('Invalid configuration');
  } catch {
    return { health: async () => disconnected('Disconnected · run sandbox setup'), model: selected.model, provider: providerIdentity, close: async () => {} };
  }
  if (upstreamCredential && [credentials.password, credentials.providerToken, profile?.tracePassword].includes(upstreamCredential)) {
    throw new Error('Provider credential must be separate from IRIS and gateway credentials.');
  }

  const iris = async (method, path, body) => {
    const timeout = ['/run', '/developer/assist'].includes(path) ? 307_000 : (['/repair', '/change'].includes(path) ? 22_000 : 6500);
    let reply;
    if (compose || profile?.agentUrl) {
      const response = await fetch((compose ? 'http://iris:52773/isaiah' : profile.agentUrl) + path, {
        method, body: method === 'POST' ? JSON.stringify(body) : undefined,
        headers: { Authorization: 'Basic ' + Buffer.from('IsaiahAdapter:' + credentials.password).toString('base64'),
          'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(timeout), redirect: 'error'
      });
      const payload = await response.json().catch(() => ({ error: 'IRIS gateway returned a non-JSON response.' }));
      reply = { code: response.status, payload };
    } else {
      reply = await docker(['exec', '-i', '--user', '65534:65534', id, 'python3', '/tmp/isaiah-http.py'],
        { method, path, password: credentials.password, body }, timeout);
    }
    if (reply.code !== 200) {
      const stage = reply.payload?.stage;
      const rejected = reply.code === 401 || (reply.code === 403 && !path.startsWith('/change'));
      const error = rejected ? 'Scoped IRIS credential rejected.' : (reply.payload?.error || 'IRIS request failed.');
      throw Object.assign(new Error(stage ? error + ' ' + stage + '.' : error), { statusCode: reply.code });
    }
    return reply.payload;
  };

  let providerStarted = false;
  const expected = Buffer.from('Bearer ' + credentials.providerToken);
  const provider = createServer(async (req, res) => {
    const header = Buffer.from(req.headers.authorization || '');
    if (header.length !== expected.length || !timingSafeEqual(header, expected)) {
      return json(res, 401, { error: 'Scoped local provider credential required.' });
    }
    const control = active();
    if (!control || req.method !== 'POST' || req.url !== '/' + control.run.id + '/v1/chat/completions') {
      return json(res, 403, { error: 'No matching active investigation.' });
    }
    if (control.providerSignal.aborted || !control.run.active) {
      return json(res, 409, { error: 'Investigation cancelled or expired.' });
    }
    const { metrics } = control.run;
    if (metrics.modelRequests >= ceilings.modelRequests) return json(res, 429, { error: 'Model request budget exhausted.' });
    metrics.modelRequests++;
    let counted = false;
    try {
      const { data, bytes } = await requestBody(req, 96_000);
      if (data.model !== selected.model || !Array.isArray(data.messages) || data.stream === true) {
        return json(res, 400, { error: 'Unapproved model or request shape.' });
      }
      metrics.providerInputBytes += bytes;
      const body = {
        model: selected.model, messages: data.messages, tools: data.tools, tool_choice: data.tool_choice,
        temperature: 0, stream: false, max_tokens: 1500,
        ...(selected.kind === 'ollama' ? { reasoning_effort: 'low' } : {})
      };
      const upstream = await fetch(selected.origin + '/v1/chat/completions', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(upstreamCredential ? { Authorization: 'Bearer ' + upstreamCredential } : {}) }, body: JSON.stringify(body),
        signal: control.providerSignal, redirect: 'error'
      });
      if (!upstream.ok) throw new Error('Local model rejected the provider request.');
      const completion = await readProviderJson(upstream);
      if (!Array.isArray(completion.choices) || !completion.choices.length) throw new Error('Malformed local model completion.');
      metrics.modelResponses++;
      counted = true;
      metrics.promptTokens += completion.usage?.prompt_tokens ?? 0;
      metrics.completionTokens += completion.usage?.completion_tokens ?? 0;
      return json(res, 200, completion);
    } catch {
      if (!counted) metrics.modelFailures++;
      const ended = control.providerSignal.aborted;
      return json(res, ended ? 409 : 502, { error: ended ? 'Investigation cancelled or expired.' : 'Local model request failed.' });
    }
  });
  provider.requestTimeout = 300_000;
  await new Promise((resolve, reject) => {
    provider.once('error', reject);
    provider.listen(repairLocal ? 18748 : 18745, compose ? '0.0.0.0' : '127.0.0.1', () => {
      providerStarted = true;
      resolve();
    });
  }).catch(() => {});

  const health = async () => {
    if (!providerStarted) return disconnected('Disconnected · local provider gate could not bind');
    let sandbox;
    try {
      if (!compose && !profile?.agentUrl) {
        const inspection = await docker(['inspect', '--type', 'container', id]);
        const target = inspection[0];
        if (target.Id !== id || target.Image !== containerImage || target.Config.Labels?.['dev.isaiah.owner'] !== owner ||
            target.HostConfig.Privileged || Object.keys(target.HostConfig.PortBindings || {}).length ||
            target.Mounts.some(mount => mount.Type === 'bind') || target.State.Health?.Status !== 'healthy') {
          return disconnected('Disconnected · sandbox identity or health check failed');
        }
      }
      sandbox = await iris('GET', '/health');
    } catch (error) { return disconnected('Disconnected · ' + error.message); }
    if (!sandbox.ready || sandbox.namespace !== 'ISAIAH' || !sandbox.build.includes('(Build 154U)')) {
      return disconnected('Disconnected · ISAIAH production or build check failed');
    }
    try {
      if (!await providerReady(selected, upstreamCredential)) return disconnected('Disconnected · selected provider model or runtime differs');
    } catch { return disconnected('Disconnected · selected local provider is unavailable'); }
    const edition = sandbox.edition === 'iris' ? 'IRIS' : 'IRIS for Health';
    return { target: `ISAIAH · ${edition} Build 154U`, runtime: runtimeLabel, connection: 'Connected · synthetic sandbox',
      ready: true, applyEnabled: applySandbox && !!sandbox.applyEnabled };
  };
  return { health, iris, model: selected.model, provider: providerIdentity,
    close: () => new Promise(resolve => provider.close(() => resolve())) };
}
