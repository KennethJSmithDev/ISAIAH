import { createHash } from 'node:crypto';

const ref = (key, health = false) => `https://docs.intersystems.com/${health ? 'irisforhealth' : 'iris'}20262/csp/docbook/DocBook.UI.Page.cls?KEY=${key}`;
const topics = {
  production: ['Production components', 'Think of a production as a relay team. A business service takes the request, a business process decides where it goes, and a business operation connects to the destination.', 'Look at the source and target columns for the first hop.', 'EGIN_basics'],
  session: ['Session ID and message ID', 'A session is the trail for one request. The Session ID groups its messages. A message ID points to one message in that trail.', 'Open the Session ID in Visual Trace and compare the first and last hops.', 'EMONITOR_concepts'],
  status: ['Trace and error states', 'A message status is a progress label. A message can be waiting, processed, or in trouble. Read the recorded status before deciding what happened.', 'Compare the status and error marker on the hop you are checking.', 'EMONITOR_message'],
  delivery: ['Delivery and receipts', 'A hop is like a parcel scan. It shows a place the message reached in IRIS. A receipt from the destination is the evidence that the destination actually received it.', 'Open the destination receipt and check that it matches this run.', 'EMONITOR_message_trace'],
  replay: ['Replay and its limits', 'A replay is a practice run using a separate test message. It lets you see what a proposed change would do in that test.', 'Compare the replay receipt with the original trace before planning a change.', 'EMONITOR_message_trace'],
  recovery: ['Approval and interrupted verification', 'Approval gives permission for one exact plan. If the reply is lost, look for the saved receipt before taking the next step.', 'Read the change receipt and the recorded revision before choosing another action.', 'EMONITOR_concepts'],
  monitor: ['Production monitoring', 'A production monitor is a snapshot of how the relay team is doing. A queue count tells you how many messages are waiting at that moment; it does not by itself explain why.', 'Inspect the approved production monitor and compare its queue count with a later snapshot.', 'EMONITOR_production'],
  adapters: ['Adapters and connections', 'An adapter handles how a production component talks to another system, such as a file or a network service. The business host decides what to do with the message.', 'Inspect the approved component class and connection type without changing its settings.', 'EGIN_options_connectivity'],
  hl7: ['HL7 version 2 messages', 'HL7 version 2 is a common way healthcare systems exchange structured messages. In an IRIS production, a service can receive one and a routing process can send it onward.', 'Inspect a permitted synthetic message trace and its configured schema before considering a change.', 'EHL72_intro', true],
  fhir: ['FHIR and productions', 'FHIR describes healthcare information as resources. An IRIS FHIR endpoint may handle a request directly or route it through a production; the two paths have different traces.', 'Inspect the endpoint configuration and identify its actual path before looking for a production trace.', 'HXFHIRPROD_production', true],
  dicom: ['DICOM in productions', 'DICOM is used to exchange medical images and related information. A production can use DICOM components to communicate with another imaging system.', 'Inspect the configured component and an approved synthetic trace; a query alone does not establish image retrieval.', 'EDICOM_tasks', true]
};

export function createTeaching(ledger, edition) {
  const common = '2026.2';
  const catalog = Object.entries(topics).filter(([, values]) => !values[4] || edition === 'iris-for-health').map(([topic, [title, content, next, key]]) => ({
    id: 'starter-' + topic, topic, title, content, next, url: ref(key, edition === 'iris-for-health'),
    version: common, edition, section: title, compatibility: 'common-concept'
  }));
  ledger.importSources(catalog);
  const approved = source => source.edition === edition && (source.compatibility === 'common-concept' || source.version === '2026.3.0AI.154.0');
  const mode = () => ledger.preference('mode') ?? 'coach';
  const card = (topic, evidence = null) => {
    const source = catalog.find(entry => entry.topic === topic);
    if (!source) return null;
    return { version: 1, topic, title: source.title, explanation: source.content, next: source.next,
      docs: [citation(source)], evidence };
  };
  function cue(topic, evidence) {
    if (mode() !== 'coach' || ledger.preference('less:' + topic) === 'yes') return null;
    return card(topic, evidence);
  }
  function preference(input) {
    if (['coach', 'focus', 'companion'].includes(input.mode)) ledger.remember('mode', input.mode);
    else if (Object.hasOwn(topics, input.less)) ledger.remember('less:' + input.less, 'yes');
    else throw new Error('Choose a teaching mode or a known topic.');
    return { mode: mode() };
  }
  function importPack(sources) {
    if (!Array.isArray(sources) || !sources.length || sources.length > 24) throw new Error('Expected up to 24 approved document sections.');
    for (const source of sources) {
      if (!source || !/^local-[a-z0-9-]{1,50}$/.test(source.id) || typeof source.title !== 'string' || source.title.length > 150 ||
          typeof source.content !== 'string' || source.content.length > 6000 || !source.content.trim() ||
          !['iris', 'iris-for-health'].includes(source.edition) || !['2026.2', '2026.3.0AI.154.0'].includes(source.version) ||
          typeof source.section !== 'string' || !source.section || source.section.length > 180 || !['common-concept', 'exact'].includes(source.compatibility) ||
          Object.keys(source).some(key => !['id','title','content','edition','version','section','compatibility'].includes(key))) {
        throw new Error('Invalid approved documentation section.');
      }
    }
    ledger.importSources(sources);
    return { indexed: sources.length };
  }
  async function explain(input, assist) {
    if (Object.hasOwn(topics, input.topic) && !input.live) {
      const lesson=card(input.topic);
      return lesson ? { ...lesson, kind: 'starter' } : unsupported('This starter lesson is not available for the selected documentation profile.');
    }
    const query = input.question ?? input.topic;
    if (typeof query !== 'string' || !query.trim() || query.length > 280) throw new Error('Enter a short public topic or question.');
    let matches = ledger.findSources(query).filter(approved).slice(0, 3);
    if (input.live) {
      const source = catalog.find(entry => entry.topic === input.topic) ?? matches.find(entry => entry.url);
      if (!source) return unsupported('No registered official page matched this topic.');
      try { matches = [await officialPage(source)]; }
      catch { return unsupported('The registered official page could not be verified.'); }
    }
    if (!matches.length) return unsupported('No compatible documentation matched this question.');
    const result = await assist({ question: query, sources: matches.map(({ id, title, content }) => ({ id, title, content: content.slice(0, 3000) })) });
    if (!Array.isArray(result.sources) || !result.sources.length || !result.sources.every(id => matches.some(source => source.id === id)) ||
        typeof result.answer !== 'string' || !result.answer.trim() || result.answer.length > 1400) return unsupported('The available documentation did not support an answer.');
    return { kind: 'documentation', answer: result.answer, sources: matches.filter(source => result.sources.includes(source.id)).map(citation) };
  }
  function observation(result, evidence) {
    const receipt = result.verification?.receipt;
    if (result.verification?.status !== 'pass' || !receipt) throw new Error('A retained, verified read is required for this lesson.');
    if (!['fhir','dicomweb','iris-mcp'].includes(result.target?.kind)) throw new Error('No grounded lesson exists for this observation.');
    const topic = result.target.kind === 'iris-mcp' ? 'monitor' : result.target.kind === 'fhir' ? 'fhir' : 'dicom';
    const facts = topic === 'monitor' ? (receipt.queue !== undefined
      ? `The approved queue “${receipt.queue}” contained ${receipt.count} waiting messages at IRIS snapshot ${receipt.observedAt}.`
      : `The approved component “${receipt.component.name}” uses ${receipt.component.class}; its recorded configuration is ${receipt.component.enabled ? 'enabled' : 'disabled'}, with pool size ${receipt.component.poolSize}.`)
      : topic === 'fhir'
      ? `ISAIAH received ${receipt.resourceType}/${receipt.id}, version ${receipt.versionId}, from the approved FHIR endpoint.`
      : `ISAIAH retrieved the approved DICOM instance ${receipt.instance}. Its received bytes match the configured synthetic file hash.`;
    return { mode: mode(), facts, limit: topic === 'monitor'
      ? 'This is an audited snapshot, not an independent health diagnosis. A queue count or enabled configuration does not prove worker health, message delivery, or approval.'
      : 'This direct endpoint read does not prove delivery through an IRIS production and grants no approval.',
      evidence, lesson: cue(topic, evidence), explain: card(topic, evidence),
      reaction: mode() === 'companion' ? 'One receipt, accounted for.' : undefined };
  }
  return { mode, cue, card, preference, importPack, explain, observation };
}

function citation({ id, title, url, version, section, compatibility, digest }) {
  return { id, title, url, version, section, compatibility, digest };
}

function unsupported(reason) { return { kind: 'unsupported', reason, sources: [] }; }

async function officialPage(source) {
  // URLs come only from the registered catalog. Search terms and run data never enter the HTTP request.
  const response = await fetch(source.url, { redirect: 'error', signal: AbortSignal.timeout(8500) });
  if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) throw new Error('Unexpected official page response.');
  const chunks = [];
  let bytes = 0;
  for await (const part of response.body) {
    bytes += part.length;
    if (bytes > 1_200_000) throw new Error('Official page exceeded the size budget.');
    chunks.push(part);
  }
  const html = Buffer.concat(chunks).toString('utf8');
  if (!html.includes('2026.2')) throw new Error('Official source version differs.');
  const main = html.slice(Math.max(0, html.indexOf('<main')));
  const paragraphs = main.match(/<p\b[^>]*>[\s\S]*?<\/p>/gi) ?? [];
  const text = paragraphs.map(p => p.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(p => p.length > 50 && /session|trace|production|message|operation|status|queue|workflow|hl7|fhir|dicom/i.test(p)).slice(0, 14).join('\n');
  if (!text) throw new Error('No bounded documentation section was found.');
  return { ...source, id: 'official-' + source.topic, content: text, digest: createHash('sha256').update(html).digest('hex') };
}
