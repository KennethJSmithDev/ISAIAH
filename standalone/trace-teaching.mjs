import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const refuse = message => { throw Object.assign(new Error(message), { statusCode: 409 }); };
function identifier(value) {
  if (!['string', 'number'].includes(typeof value) || !/^[1-9][0-9]{0,14}$/.test(String(value))) refuse('A recorded numeric trace identifier is required.');
  return String(value);
}
function text(value, name) {
  if (typeof value !== 'string' || value.length > 200) refuse('The recorded ' + name + ' is unavailable or exceeds the teaching limit.');
  return value;
}

// WHY: teaching uses the already-authorized header projection, not arbitrary caller facts.
// INVARIANT: a passing header comparison never becomes proof of destination delivery.
export function groundTraceLesson(run, lesson, edition) {
  const verification = run.verification;
  const trace = verification?.independent;
  if (run.kind !== 'trace' || verification?.status !== 'pass' || verification.claim !== 'recorded-hop-only' ||
      !trace?.target || trace.target.edition !== edition || trace.truncated === true ||
      !Array.isArray(trace.hops) || !trace.hops.length || trace.hops.length > 40) {
    refuse('A passing, bounded recorded-hop trace is required for this lesson.');
  }
  const session = identifier(run.session);
  if (identifier(trace.session) !== session) refuse('The stored session and independent evidence disagree.');
  const hops = trace.hops.map(hop => {
    if (!hop || !/^[0-9]{1,6}$/.test(String(hop.status))) refuse('The recorded message status is unavailable.');
    return { id: identifier(hop.id), source: text(hop.source, 'source'), target: text(hop.target, 'target'), status: String(hop.status) };
  });
  if (hops.some((hop, index) => index && Number(hop.id) <= Number(hops[index - 1].id))) refuse('The bounded header sequence is inconsistent.');
  const lastHop = hops.at(-1);
  const selected = run.decision?.lastHop;
  const modelHop = selected && { ...selected, id: String(selected.id), status: String(selected.status) };
  if (!isDeepStrictEqual(modelHop, lastHop)) refuse('The recorded decision and independent last hop disagree.');
  const fixture = run.provenance?.kind === 'offline-synthetic-fixture';
  if (!fixture && !(run.metrics?.modelResponses > 0)) refuse('The stored trace lacks native execution evidence or an explicit offline-fixture label.');

  const reference = lesson?.docs?.[0];
  const key = lesson?.topic === 'session' ? 'EMONITOR_concepts' : 'EMONITOR_message_trace';
  const expectedUrl = `https://docs.intersystems.com/${edition === 'iris-for-health' ? 'irisforhealth' : 'iris'}20262/csp/docbook/DocBook.UI.Page.cls?KEY=${key}`;
  if (!['session', 'delivery'].includes(lesson?.topic) || reference?.id !== 'starter-' + lesson.topic ||
      reference.version !== '2026.2' || reference.compatibility !== 'common-concept' || reference.url !== expectedUrl ||
      typeof lesson.explanation !== 'string' || !lesson.explanation || typeof lesson.next !== 'string') {
    refuse('No applicable original starter source supports this teaching slice.');
  }
  const authored = { id: reference.id, title: lesson.title, explanation: lesson.explanation, next: lesson.next,
    edition, sourceVersion: reference.version, section: reference.section, compatibility: reference.compatibility, url: reference.url };
  const source = { authority: 'ISAIAH original starter lesson', revision: digest(authored), snapshot: authored,
    officialReference: { url: reference.url, edition, version: reference.version, section: reference.section, fetchedForThisAnswer: false } };
  const context = { target: { instance: trace.target.instance, namespace: trace.target.namespace, production: trace.target.production,
    edition, build: trace.target.build }, session, messageIds: hops.map(hop => hop.id), hops, lastHop,
    primaryHeaderIncluded: hops.some(hop => hop.id === session), evidenceMode: fixture ? 'offline-synthetic-fixture' : 'retained-native-trace' };
  const endpoint = value => value || '(endpoint not recorded)';
  return {
    contract: 'trace-teaching.v1', topic: lesson.topic, title: lesson.title, context,
    sourceRun: { id: run.id, started: run.started, compatibility: run.compatibility, evidenceDigest: digest(context),
      freshness: 'Stored trace snapshot; the current target was not reread for this lesson.',
      learning: { revision: run.learning?.revision ?? null, used: run.learning?.used === true } },
    observation: `Session ${session} contains ${hops.length} recorded header${hops.length === 1 ? '' : 's'} in this projection. Message IDs: ${context.messageIds.join(', ')}. The last recorded hop is ${endpoint(lastHop.source)} → ${endpoint(lastHop.target)} (message ${lastHop.id}, recorded status ${lastHop.status}).`,
    concept: { explanation: lesson.explanation,
      relationship: `Session ID ${session} groups related messages. Each header has its own message ID. The primary request's message ID is the Session ID; its header ${context.primaryHeaderIncluded ? 'is included' : 'is not included'} in this projection.` },
    conclusion: { claim: 'recorded-hop-only', delivery: 'unverified',
      text: 'The trace comparison supports the recorded hop and status. A receiving-system delivery receipt is not part of this approved header projection, so destination delivery is not established.' },
    unknowns: ['No receiving-system delivery receipt is supplied by this header-only endpoint.', 'Message-body meaning, destination health and repair effects are outside this lesson.'],
    next: { kind: 'inspect-existing-evidence', text: `Inspect message ${lastHop.id} in this stored trace and compare its source, target and recorded status.`,
      evidence: { kind: 'run', id: run.id, messageId: lastHop.id } },
    sources: [source],
    applicability: { status: 'common-concept', sourceVersion: '2026.2', targetBuild: trace.target.build,
      exactBuildApiConfirmed: false, note: 'This source explains common concepts; it does not confirm a Build 154-specific API.' },
    traceVerification: { status: verification.status, claim: verification.claim, sourceRunId: run.id, evidenceMode: context.evidenceMode },
    teachingSupport: { status: 'grounded', method: 'authored lesson plus checked header fields', modelGenerated: false },
    learningOutcome: { status: 'not-requested', reason: 'Teaching does not propose or accept procedure revisions.' }
  };
}
