// Presentation-only HTTP fixture. No account, provider, IRIS or inference is contacted.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
let provider={id:'fixture-bridge',kind:'openai-compatible',model:'fixture-only',qualification:'experimental-unqualified',
  account:{protocol:'local-account-bridge.v1',name:'Synthetic Provider',managementOrigin:'http://127.0.0.1:18879'}};
const paths=new Map([['/','web/index.html'],['/app.js','web/app.js'],['/app.css','web/app.css'],['/provider.js','web/provider.js']]);
const server=createServer(async(req,res)=>{
 if(req.method!=='GET'){res.writeHead(403).end();return}
 if(req.url==='/api/state'){res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({environment:{target:'Synthetic UI transport',runtime:'No inference',connection:'Fixture only',ready:false},scope:{provider},learning:{summary:'No procedure changes',reviews:[]}}));return}
 const path=paths.get(req.url);if(!path){res.writeHead(404).end();return}
 res.writeHead(200,{'Content-Type':path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':'text/html'}).end(await readFile(path));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({channel:'msedge',headless:true});
const evidence=resolve(process.env.ISAIAH_SOCKET_BROWSER_EVIDENCE);await mkdir(evidence,{recursive:true});
const report={kind:'UI-transport-fixture-zero-inference',browser:browser.version(),checks:[],errors:[]};
try{
 const page=await browser.newPage({viewport:{width:320,height:568},reducedMotion:'reduce'});
 page.on('pageerror',e=>report.errors.push(e.message));
 const origin='http://127.0.0.1:'+server.address().port;
 await page.goto(origin);await page.locator('#chatgpt-settings').waitFor({state:'visible'});
 assert.equal(await page.locator('#chatgpt-settings a').getAttribute('href'),'http://127.0.0.1:18879');
 assert.match(await page.locator('#chatgpt-settings').innerText(),/experimental bridge/);
 report.checks.push('Experimental bridge has a labelled loopback management link');
 provider.account.name='X'.repeat(60);await page.reload();await page.locator('#chatgpt-settings').waitFor({state:'visible'});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Long provider names must fit narrow layout');
 await page.screenshot({path:resolve(evidence,'provider-socket-320.png')});
 report.checks.push('Maximum provider name fits the narrow workspace');
 provider={id:'chatgpt-plan',kind:'openai-compatible',model:'fixture-only'};
 await page.reload();await page.locator('#chatgpt-settings').waitFor({state:'visible'});
 assert.equal(await page.locator('#chatgpt-settings a').getAttribute('href'),'http://127.0.0.1:18759/');
 assert.equal(await page.locator('#chatgpt-settings a').innerText(),'Manage ChatGPT account and plan usage');
 report.checks.push('Qualified ChatGPT management presentation remains unchanged');
 provider={id:'ollama-pinned',kind:'ollama',model:'fixture-only'};
 await page.reload();await page.locator('#chatgpt-settings').waitFor({state:'hidden'});
 report.checks.push('Non-account profiles do not display account controls');
 assert.equal(report.errors.length,0);report.status='pass';
}catch(error){report.status='failed';report.error=error.message;throw error}
finally{await writeFile(resolve(evidence,'provider-socket-browser.json'),JSON.stringify(report,null,2));await browser.close();await new Promise(resolve=>server.close(resolve))}
