// Native MCP calls against a disposable synthetic target. This makes no inference request.
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import assert from 'node:assert/strict';
const container = process.env.ISAIAH_MONITOR_CONTAINER;
const scope = JSON.parse(process.env.ISAIAH_MONITOR_SCOPE ?? '{}');
assert.ok(container && scope.instance && scope.namespace && scope.production);
const child = spawn('docker',['exec','-i','--user','51773',container,'/usr/irissys/bin/iris-mcp-server',
  '--config','/tmp/mcp009/private/mcp.toml','run'],{windowsHide:true,stdio:['pipe','pipe','ignore']});
let sequence=0;const pending=new Map();
createInterface({input:child.stdout}).on('line',line=>{
  let message;try{message=JSON.parse(line)}catch{return}
  pending.get(message.id)?.(message);
});
function call(method,params){return new Promise((resolve,reject)=>{
  const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error('MCP timeout'))},20000);
  pending.set(id,message=>{clearTimeout(timer);pending.delete(id);message.error?reject(Error('MCP protocol failure')):resolve(message.result)});
  child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');
})}
try {
  await call('initialize',{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'isaiah-monitor-qualification',version:'1'}});
  child.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');
  const listed=await call('tools/list',{}), evidence={};
  const invoke=async(name,args,refused=false)=>{
    const tool=listed.tools.find(tool=>tool.name.endsWith(name));assert.ok(tool,name+' discovered');
    const reply=await call('tools/call',{name:tool.name,arguments:{...scope,...args}});
    if(refused){assert.equal(reply.isError,true);return 'refused'}
    assert.notEqual(reply.isError,true,JSON.stringify(reply));
    return reply.structuredContent??JSON.parse(reply.content[0].text);
  };
  evidence.queue=await invoke('ReadQueueSnapshot',{queue:'Fixture Sink'});
  assert.equal(evidence.queue.count,Number(process.env.ISAIAH_EXPECTED_QUEUE_COUNT??0));
  assert.equal(evidence.queue.audit,'recorded');
  evidence.component=await invoke('ReadComponentSnapshot',{component:'Fixture Sink'});
  assert.deepEqual(evidence.component.component,{name:'Fixture Sink',class:'DevTrace.Sink',enabled:1,poolSize:1});
  evidence.trace=await invoke('ReadSessionTrace',{session:'2'});
  assert.equal(evidence.trace.session,'2');assert.equal(evidence.trace.hops.length,2);
  evidence.refusals=[];
  for(const name of ['ReadQueueSnapshot','ReadComponentSnapshot']){
    evidence.refusals.push(await invoke(name,{queue:'No Grant',component:'No Grant'},true));
    evidence.refusals.push(await invoke(name,{queue:'Fixture Sink',component:'Fixture Sink',instance:'wrong'},true));
  }
  evidence.refusals.push(await invoke('ReadSessionTrace',{session:'4'},true));
  assert.ok(!listed.tools.some(tool=>/approve|apply|rollback|accept/i.test(tool.name)));
  console.log(JSON.stringify({status:'pass',kind:'native-MCP-zero-inference',...evidence},null,2));
} finally {child.stdin.end();child.kill()}
