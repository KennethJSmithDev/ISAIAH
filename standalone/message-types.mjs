const className = /^[A-Za-z%][\w%]*(?:\.[A-Za-z%][\w%]*)*$/;

export function inspectMessageTypes(source, trace, component) {
  if (!/^[A-Za-z][A-Za-z0-9 ._-]{0,79}$/.test(component) ||
      !trace || !/^[1-9][0-9]{0,14}$/.test(String(trace.session ?? '')) ||
      !Array.isArray(trace.hops) || !trace.hops.length || trace.hops.length > 40) {
    throw new Error('Expected one named component and a bounded approved trace record.');
  }
  const owner = /^Class\s+([\w%.]+)\s+Extends\s+(Ens\.Business(?:Operation|Service))\b/m.exec(source);
  const map = /^XData\s+MessageMap\s*\{\s*<MapItems>([\s\S]*?)<\/MapItems>\s*\}/m.exec(source);
  const entry = /<MapItem\s+MessageType="([\w%.]+)"\s*>\s*<Method>([A-Za-z][\w]*)<\/Method>\s*<\/MapItem>/g;
  const mapped = map ? [...map[1].matchAll(entry)] : [];
  const simpleMap = owner && mapped.length && !map[1].replace(entry,'').trim();
  const declared = simpleMap ? mapped.map(([,request,method]) => {
    const signature = new RegExp('^Method\\s+' + method + '\\(([^)]*)\\)', 'm').exec(source);
    const outputs = signature ? [...signature[1].matchAll(/\bOutput\s+\w+\s+As\s+([\w%.]+)(?=\s*(?:,|$))/gi)] : [];
    return { method, request, response:outputs.length === 1 ? outputs[0][1] : null };
  }) : [];
  const projectDirection = direction => {
    const rows = trace.hops.filter(hop => hop?.[direction] === component);
    const types = [...new Set(rows.map(hop => hop.messageClass).filter(type => typeof type === 'string' && className.test(type)))].sort();
    return { types, status: types.length > 1 ? 'multiple' : types.length === 1 &&
      rows.every(hop => hop.messageClass === types[0]) ? 'observed' : 'unknown' };
  };
  const incoming = projectDirection('target'), outgoing = projectDirection('source');
  const matched = incoming.status === 'observed' && outgoing.status === 'observed' &&
    declared.length === 1 && declared[0].request === incoming.types[0] && declared[0].response === outgoing.types[0];
  return { component, declared:{className:owner?.[1] ?? null,status:declared.length ? 'declared' : 'unknown',handlers:declared},
    observed:{session:String(trace.session),incoming,outgoing},
    suggestion:matched ? { sourceType:incoming.types[0],targetType:outgoing.types[0],status:'candidate-for-review' } : null,
    scope:'Approved source declaration and supplied trace record. Installed class identity and delivery are unverified.' };
}
