import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { ChatGPTAccount } from './account.mjs';
import { toResponses, fromResponses, completedEvent } from './translation.mjs';

const accountDir=process.env.ISAIAH_CHATGPT_ACCOUNT_DIR, secretFile=process.env.ISAIAH_CHATGPT_BRIDGE_SECRET_FILE;
const model=process.env.ISAIAH_CHATGPT_MODEL, port=Number(process.env.ISAIAH_CHATGPT_BRIDGE_PORT ?? 18759);
if (!accountDir || !secretFile || !model || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(model) || !Number.isInteger(port) || port<1024 || port>65535) throw new Error('Configure the local account, bridge secret, model and port.');
const secret=(await readFile(secretFile,'utf8')).trim();
if (!/^[A-F0-9]{64}$/.test(secret)) throw new Error('Invalid local bridge credential.');
const expected=Buffer.from('Bearer '+secret),account=new ChatGPTAccount(accountDir);await account.init();
const prior=new Map();let modelCache=null, inFlight=false, accountAction=false;
const send=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data))};
const uiFiles=new Map([['/',['account-page.html','text/html']],['/account-ui.js',['account-ui.js','text/javascript']],['/account.css',['account.css','text/css']]]);
async function listModels() {
  if(modelCache && modelCache.until>Date.now())return modelCache.value;
  const token=await account.accessToken();
  const res=await fetch('https://api.openai.com/v1/models',{headers:{Authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(15000)});
  if(!res.ok)throw new Error('ChatGPT model discovery failed.');
  const body=await res.json();if(!Array.isArray(body.models))throw new Error('Invalid ChatGPT model catalog.');
  const value=body.models.filter(m=>m.visibility==='list' && typeof m.slug==='string').map(m=>m.slug);
  modelCache={value,until:Date.now()+300000};return value;
}
const server=createServer(async(req,res)=>{
  const localOrigin=`http://127.0.0.1:${port}`;
  if(req.headers.host===`127.0.0.1:${port}` && req.method==='GET' && uiFiles.has(req.url)) {
    const [file,type]=uiFiles.get(req.url);res.writeHead(200,{'Content-Type':type+'; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'",'X-Content-Type-Options':'nosniff'});return res.end(await readFile(new URL(file,import.meta.url)));
  }
  if(req.headers.host===`127.0.0.1:${port}` && req.method==='GET' && req.url==='/account/status') return send(res,200,{...account.status(),model});
  if(req.headers.host===`127.0.0.1:${port}` && req.method==='POST' && ['/account/connect','/account/disconnect'].includes(req.url)) {
    if(req.headers.origin!==localOrigin || req.headers['x-isaiah-account']!=='local')return send(res,403,{error:'Local account page required.'});
    if(inFlight || account.pending || account.refreshing || accountAction)return send(res,409,{error:'Wait for the active operation to finish.'});
    accountAction=true;
    try { const outcome=req.url==='/account/connect'?await account.login():await account.disconnect();modelCache=null;return send(res,200,outcome) }
    catch {return send(res,400,{error:'Account operation was not completed.'})}
    finally {accountAction=false}
  }
  const supplied=Buffer.from(req.headers.authorization??'');
  if(supplied.length!==expected.length || !timingSafeEqual(supplied,expected))return send(res,401,{error:'Local bridge credential required.'});
  try {
    if(req.method==='POST' && req.url==='/shutdown') {
      if(inFlight)return send(res,409,{error:'Wait for the active request.'});
      send(res,200,{stopping:true});return server.close(async()=>{await account.close();process.exit(0)});
    }
    if(accountAction)return send(res,409,{error:'Wait for the account operation to finish.'});
    if(req.method==='GET' && req.url==='/v1/models') {
      return send(res,200,{data:(await listModels()).includes(model)?[{id:model}]:[]});
    }
    if(req.method!=='POST' || req.url!=='/v1/chat/completions')return send(res,404,{error:'Unavailable.'});
    if(inFlight)return send(res,429,{error:'Only one model request may run at a time.'});
    inFlight=true;
    try {
      const chunks=[];let size=0;for await(const c of req){size+=c.length;if(size>96000)throw new Error('Request too large.');chunks.push(c)}
      const chat=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(chat.model!==model)throw new Error('Model outside profile.');
      const request=toResponses(chat,prior), token=await account.accessToken();
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),300000);
      const cancel=()=>{if(!res.writableEnded)controller.abort()};res.once('close',cancel);
      try {
        const upstream=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(request),signal:controller.signal,redirect:'error'});
        if(!upstream.ok)throw new Error(`ChatGPT request failed (HTTP ${upstream.status}).`);
        const result=fromResponses(await completedEvent(upstream.body),chat.tools,prior);
        if(prior.size>20)prior.delete(prior.keys().next().value);
        return send(res,200,result);
      } finally {clearTimeout(timer);res.off('close',cancel)}
    } finally {inFlight=false}
  } catch(error) {
    const safe=/^(ChatGPT request failed \(HTTP \d{3}\)\.|Response did not complete\.|Response failed or was incomplete\.|Stream ended before response\.completed\.|Unexpected function call\.|Unexpected response item\.|Tool continuation does not match this active response\.|Unsupported .*\.|Empty response\.)$/.test(error.message) ? error.message : 'ChatGPT plan request failed or was interrupted.';
    console.error(safe);
    if(!res.destroyed)send(res,502,{error:safe});
  }
});
server.listen(port,'127.0.0.1',()=>console.log(`ISAIAH ChatGPT bridge listening on 127.0.0.1:${port}.`));
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>server.close(async()=>{await account.close();process.exit(0)}));
