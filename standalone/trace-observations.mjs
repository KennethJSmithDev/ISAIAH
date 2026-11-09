// Derived only from the already-authorized header projection; no additional IRIS access.
export function traceObservations(trace) {
  if(!trace || !/^[1-9][0-9]{0,14}$/.test(String(trace.session ?? '')) || !Array.isArray(trace.hops) || !trace.hops.length || trace.hops.length>40) return null;
  const endpoints=new Set(),statuses=new Map();let markedErrors=0,unreportedErrors=0;
  for(const hop of trace.hops) {
    if(!hop || typeof hop.source!=='string'||!hop.source || typeof hop.target!=='string'||!hop.target ||
       !['string','number'].includes(typeof hop.status))return null;
    endpoints.add(hop.source);endpoints.add(hop.target);
    const status=String(hop.status);statuses.set(status,(statuses.get(status)??0)+1);
    if(hop.error===1 || hop.error===true)markedErrors++;
    else if(hop.error!==0 && hop.error!==false)unreportedErrors++;
  }
  return {basis:'recorded-headers-only',session:String(trace.session),hopCount:trace.hops.length,
    observedEndpoints:[...endpoints],statuses:[...statuses].map(([status,count])=>({status,count})),
    errorMarkers:{marked:markedErrors,unreported:unreportedErrors},delivery:'unverified'};
}
