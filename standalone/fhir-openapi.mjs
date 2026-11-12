const releases = new Map([['4.0.1', 'R4'], ['4.3.0', 'R4B'], ['5.0.0', 'R5']]);

export function capabilityOpenApi(source) {
  let statement;
  try { statement = JSON.parse(source); }
  catch { throw new Error('Approved record must contain a JSON CapabilityStatement.'); }
  const release = releases.get(statement?.fhirVersion);
  if (statement?.resourceType !== 'CapabilityStatement' || !release ||
      !Array.isArray(statement.rest)) throw new Error('Expected a FHIR R4 (4.0.1), R4B (4.3.0), or R5 (5.0.0) CapabilityStatement.');

  const paths = {}, omitted = new Set(), resources = new Set();
  const response = resourceType => ({
    description: 'Successful FHIR response',
    content: { 'application/fhir+json': { schema: { type:'object', required:['resourceType'],
      properties:{resourceType:{const:resourceType}} } } },
  });
  for (const rest of statement.rest) {
    if (rest?.mode !== 'server') continue;
    if (rest.resource !== undefined && !Array.isArray(rest.resource)) throw new Error('Invalid server resource list.');
    for (const resource of rest.resource ?? []) {
      const type = resource?.type;
      if (typeof type !== 'string' || !/^[A-Z][A-Za-z]{0,63}$/.test(type) || resources.has(type) ||
          (resource.interaction !== undefined && !Array.isArray(resource.interaction))) {
        throw new Error('Invalid or duplicate server resource declaration.');
      }
      resources.add(type);
      for (const interaction of resource.interaction ?? []) {
        const code = interaction?.code;
        if (typeof code !== 'string' || !/^[a-z][a-z-]{0,31}$/.test(code)) throw new Error('Invalid resource interaction.');
        if (code === 'read') {
          paths['/' + type + '/{id}'] = { get: { operationId:'read' + type,
            parameters:[{name:'id',in:'path',required:true,schema:{type:'string',pattern:'^[A-Za-z0-9.-]{1,64}$'}}],
            responses:{200:response(type)} } };
        } else if (code === 'search-type') {
          paths['/' + type] = { get:{operationId:'search' + type,responses:{200:response('Bundle')}} };
        } else {
          omitted.add(type + ': ' + code);
        }
      }
    }
  }
  if (!Object.keys(paths).length) throw new Error('No supported server read or search interactions advertised.');
  return {
    document: { openapi:'3.1.0', info:{title:`FHIR ${release} advertised read and search interactions`,version:'1.0.0'},
      paths:Object.fromEntries(Object.entries(paths).sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0)) },
    omitted:[...omitted].sort(),
    scope:'Advertised server operations only. Search parameters, profiles, system operations, servers, authentication and live behavior are outside this export.',
  };
}
