import { readFile } from 'node:fs/promises';

export const legacyModel = 'gpt-oss:20b';
const legacyDigest = '9ba9cc2b4e02463b933096090530aef679d534dd91ecc9afadfb2dbfdc59f3c5';
const modelPattern = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;

// Profile data selects a local route; secrets live in a different file.
export async function loadProviderProfile({ compose, repairLocal, applySandbox, standalone, file = process.env.ISAIAH_PROVIDER_PROFILE_FILE } = {}) {
  const legacyOrigin = standalone ? (compose ? 'http://host.docker.internal:18758' : 'http://127.0.0.1:18758') :
    (compose ? 'http://host.docker.internal:' + (applySandbox ? 18752 : 18746) : (repairLocal ? 'http://127.0.0.1:18746' : 'http://127.0.0.1:18744'));
  if (!file) return Object.freeze({ id: 'ollama-pinned', kind: 'ollama', origin: legacyOrigin, model: legacyModel, version: '0.40.6', digest: legacyDigest });
  let value;
  try { value = JSON.parse(await readFile(file, 'utf8')); } catch { throw new Error('Provider profile could not be read.'); }
  return validateProviderProfile(value, { compose });
}

export function validateProviderProfile(value, { compose = false } = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid provider profile.');
  const allowed = value.kind === 'ollama' ? ['id','kind','origin','model','version','digest'] : ['id','kind','origin','model','account'];
  if (!['ollama','openai-compatible'].includes(value.kind) || Object.keys(value).some(key => !allowed.includes(key)) ||
      typeof value.id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,39}$/.test(value.id) ||
      typeof value.model !== 'string' || !modelPattern.test(value.model) || typeof value.origin !== 'string') throw new Error('Invalid provider profile.');
  let url;
  try { url = new URL(value.origin); } catch { throw new Error('Invalid local provider origin.'); }
  const hosts = compose ? ['host.docker.internal'] : ['127.0.0.1','localhost','[::1]'];
  if (url.protocol !== 'http:' || !hosts.includes(url.hostname) || !url.port || url.username || url.password ||
      url.pathname !== '/' || url.search || url.hash) throw new Error('Provider origin must be an explicitly configured local HTTP endpoint.');
  if (value.kind === 'ollama' && (!/^\d+\.\d+\.\d+$/.test(value.version ?? '') || !/^[a-f0-9]{64}$/.test(value.digest ?? ''))) {
    throw new Error('Ollama profile requires an exact version and model digest.');
  }
  let account;
  if (Object.hasOwn(value, 'account')) {
    const entry = value.account;
    if (value.id === 'chatgpt-plan' || !entry || typeof entry !== 'object' || Array.isArray(entry) ||
        Object.keys(entry).some(key => !['protocol','name','managementOrigin'].includes(key)) || entry.protocol !== 'local-account-bridge.v1' ||
        typeof entry.name !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9 ._-]{0,59}$/.test(entry.name) || typeof entry.managementOrigin !== 'string') throw new Error('Invalid experimental account bridge descriptor.');
    let management;
    try { management = new URL(entry.managementOrigin); } catch { throw new Error('Invalid account management origin.'); }
    if (management.protocol !== 'http:' || !['127.0.0.1','localhost','[::1]'].includes(management.hostname) ||
        !management.port || +management.port < 1024 || management.port !== url.port || management.pathname !== '/' ||
        management.username || management.password || management.search || management.hash) throw new Error('Account management must use the selected bridge port on loopback.');
    account = Object.freeze({ ...entry, managementOrigin: management.origin });
  }
  return Object.freeze({ ...value, origin: url.origin, ...(account ? { account } : {}) });
}

export async function loadProviderCredential(file = process.env.ISAIAH_PROVIDER_CREDENTIAL_FILE) {
  if (!file) return null;
  let token;
  try { token = (await readFile(file, 'utf8')).trim(); } catch { throw new Error('Provider credential could not be read.'); }
  if (!token || token.length > 4096 || /[\x00-\x20\x7f]/.test(token)) throw new Error('Invalid provider credential.');
  return token;
}

export async function readProviderJson(response, maximum = 2_000_000) {
  if (!response.body) return response.json();
  const chunks = []; let size = 0;
  for await (const chunk of response.body) {
    size += chunk.byteLength;
    if (size > maximum) throw new Error('Provider response exceeds the configured limit.');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export async function providerReady(profile, credential, request = fetch) {
  const headers = credential ? { Authorization: 'Bearer ' + credential } : {};
  const get = async path => {
    const response = await request(profile.origin + path, { headers, signal: AbortSignal.timeout(2500), redirect: 'error' });
    if (!response.ok) throw new Error('Provider unavailable.');
    return readProviderJson(response, 512_000);
  };
  if (profile.kind === 'ollama') {
    const [version, tags] = await Promise.all([get('/api/version'), get('/api/tags')]);
    return version.version === profile.version && tags.models?.some(item => item.name === profile.model && item.digest === profile.digest) === true;
  }
  const models = await get('/v1/models');
  return Array.isArray(models.data) && models.data.some(item => item.id === profile.model);
}
