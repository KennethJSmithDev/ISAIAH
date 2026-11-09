import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const name = /^[a-z0-9][a-z0-9-]{0,39}$/;
const uid = /^[0-9]+(?:\.[0-9]+)+$/;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const denied = () => Object.assign(new Error('Interoperability target or record is outside the configured scope.'), { statusCode: 403 });

// Only operator-selected loopback endpoints and exact records are available in this slice.
// Credentials are loaded separately and are never returned in evidence or errors.
export async function loadInterop(file = process.env.ISAIAH_INTEROP_PROFILE, secret = process.env.ISAIAH_INTEROP_CREDENTIALS) {
  if (!file && !secret) return null;
  if (!file || !secret) throw new Error('Interoperability profiles require a separate credential file.');
  let profiles, credentials;
  try { profiles = JSON.parse(await readFile(file, 'utf8')); credentials = JSON.parse(await readFile(secret, 'utf8')); }
  catch { throw new Error('Interoperability configuration could not be read.'); }
  if (!Array.isArray(profiles) || !profiles.length || profiles.length > 8) throw denied();
  const configured = new Map();
  for (const profile of profiles) {
    const url = new URL(profile.origin);
    if (!name.test(profile.id) || configured.has(profile.id) || !['fhir','dicomweb'].includes(profile.kind) ||
        url.protocol !== 'http:' || !['127.0.0.1','localhost','[::1]'].includes(url.hostname) || !url.port ||
        url.username || url.password || url.pathname !== '/' || url.search || url.hash ||
        !/^\/[a-zA-Z0-9/_-]*\/$/.test(profile.base) || !profile.version || !profile.instance ||
        !Array.isArray(profile.records) || !profile.records.length || profile.records.length > 16) throw denied();
    const records = new Map();
    for (const record of profile.records) {
      if (!name.test(record.key) || records.has(record.key)) throw denied();
      if (profile.kind === 'fhir' && (!/^[A-Z][a-zA-Z]+$/.test(record.type) || !/^[a-zA-Z0-9.-]{1,64}$/.test(record.id) ||
          ['.','..'].includes(record.id) || !record.version || !/^[a-f0-9]{64}$/.test(record.sha256))) throw denied();
      if (profile.kind === 'dicomweb' && (![record.study,record.series,record.instance].every(x => typeof x === 'string' && x.length <= 64 && uid.test(x)) || !/^[a-f0-9]{64}$/.test(record.sha256))) throw denied();
      records.set(record.key, { ...record });
    }
    const credential = credentials[profile.id];
    if (!credential || typeof credential.username !== 'string' || !credential.username || /[:\r\n]/.test(credential.username) ||
        typeof credential.password !== 'string' || !credential.password || /[\r\n]/.test(credential.password)) throw denied();
    configured.set(profile.id, { ...profile, origin: url.origin, records,
      authorization: 'Basic ' + Buffer.from(credential.username + ':' + credential.password).toString('base64') });
  }
  return createInterop(configured);
}

function createInterop(profiles) {
  let inFlight = false;
  async function get(profile, path, accept) {
    let response;
    try { response = await fetch(profile.origin + profile.base + path, { method: 'GET', redirect: 'error',
      headers: { Authorization: profile.authorization, Accept: accept }, signal: AbortSignal.timeout(6500) }); }
    catch { throw new Error('The configured interoperability endpoint is unavailable.'); }
    if (!response.ok) throw new Error('The configured interoperability read was refused (' + response.status + ').');
    const chunks = []; let size = 0;
    for await (const part of response.body) {
      size += part.length;
      if (size > 2_000_000) throw new Error('Interoperability response exceeds its bound.');
      chunks.push(part);
    }
    return { bytes: Buffer.concat(chunks), type: response.headers.get('content-type') ?? '' };
  }
  const json = response => {
    if (!/^application\/(?:fhir\+json|dicom\+json|json)(?:;|$)/i.test(response.type)) throw new Error('Unexpected interoperability representation.');
    try { return JSON.parse(response.bytes.toString('utf8')); }
    catch { throw new Error('Invalid interoperability JSON response.'); }
  };
  async function inspect(target, key) {
    if (inFlight) throw Object.assign(new Error('An interoperability read is already in progress.'), { statusCode: 409 });
    inFlight = true;
    try { return await inspectRecord(target, key); }
    finally { inFlight = false; }
  }
  async function inspectRecord(target, key) {
    const profile = profiles.get(target), record = profile?.records.get(key);
    if (!record) throw denied();
    let receipt;
    if (profile.kind === 'fhir') {
      const metadata = json(await get(profile, 'metadata', 'application/fhir+json'));
      if (metadata.resourceType !== 'CapabilityStatement' || metadata.fhirVersion !== profile.version) throw new Error('FHIR version differs from the approved profile.');
      const response = await get(profile, record.type + '/' + record.id, 'application/fhir+json');
      const resource = json(response);
      if (resource.resourceType !== record.type || resource.id !== record.id || resource.meta?.versionId !== record.version) throw new Error('FHIR resource identity or version changed.');
      if (hash(response.bytes) !== record.sha256) throw new Error('FHIR content differs from the approved synthetic resource.');
      receipt = { claim: 'FHIR resource received', resourceType: resource.resourceType, id: resource.id,
        versionId: resource.meta.versionId, sha256: hash(response.bytes), bytes: response.bytes.length };
    } else {
      const path = 'studies/' + record.study + '/series/' + record.series + '/instances';
      const rows = json(await get(profile, path + '?SOPInstanceUID=' + record.instance, 'application/dicom+json'));
      if (!Array.isArray(rows) || rows.length !== 1 || !rows.some(row => row['00080018']?.Value?.[0] === record.instance &&
          row['0020000D']?.Value?.[0] === record.study && row['0020000E']?.Value?.[0] === record.series)) throw new Error('DICOM query did not establish the approved identity.');
      const response = await get(profile, path + '/' + record.instance, 'multipart/related; type="application/dicom"');
      const bytes = dicomPart(response);
      if (hash(bytes) !== record.sha256) throw new Error('Retrieved DICOM content differs from the approved synthetic instance.');
      receipt = { claim: 'DICOM instance received', study: record.study, series: record.series, instance: record.instance,
        sha256: hash(bytes), bytes: bytes.length };
    }
    return { target: { id: profile.id, kind: profile.kind, configuredInstance: profile.instance, version: profile.version },
      record: key, versionSource: profile.kind === 'fhir' ? 'capability-statement' : 'configured-profile',
      observedAt: new Date().toISOString(), verification: { status: 'pass', receipt },
      path: 'direct-endpoint', productionDeliveryClaim: false, approval: false };
  }
  return { targets: [...profiles.keys()], inspect };
}

function dicomPart({ type, bytes }) {
  const boundary = /^multipart\/related\s*;.*?boundary=(?:"([A-Za-z0-9'()+_,./:=?-]{1,70})"|([A-Za-z0-9'()+_,./:=?-]{1,70}))(?:;|$)/i.exec(type);
  if (!boundary) throw new Error('Unsupported DICOM multipart representation.');
  const marker = Buffer.from('--' + (boundary[1] ?? boundary[2]));
  if (!bytes.subarray(0, marker.length + 2).equals(Buffer.concat([marker, Buffer.from('\r\n')]))) throw new Error('Invalid DICOM multipart opening.');
  const start = bytes.indexOf('\r\n\r\n', marker.length);
  if (start < 0 || start > 4096 || !/\r\ncontent-type:\s*application\/dicom\s*\r\n/i.test(bytes.subarray(0,start + 2).toString('ascii'))) throw new Error('Invalid DICOM part headers.');
  const closing = Buffer.concat([Buffer.from('\r\n'), marker, Buffer.from('--\r\n')]);
  if (!bytes.subarray(-closing.length).equals(closing)) throw new Error('Invalid DICOM multipart closing.');
  const part = bytes.subarray(start + 4, -closing.length);
  if (part.indexOf(Buffer.concat([Buffer.from('\r\n'), marker])) >= 0) throw new Error('Only one DICOM instance may be retrieved.');
  return part;
}
