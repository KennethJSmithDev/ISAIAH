// Assemble a separate static simulation from the same workspace presentation.
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const output = resolve(process.argv[2] || 'simulation-dist');
await mkdir(output, { recursive: true });
for (const name of ['app.js', 'app.css']) await cp(resolve('web', name), resolve(output, name));
for (const name of ['provider.js', 'teaching.js']) await cp(resolve('simulation', name), resolve(output, name));
let html = await readFile('web/index.html', 'utf8');
html = html.replace('<title>ISAIAH | Investigation workspace</title>', '<title>ISAIAH | Offline simulation</title>');
html = html.replace('<script type="module" src="./app.js"></script>', '<script type="module" src="./app.js"></script>\n  <script type="module" src="./teaching.js"></script>');
html = html.replace('INTEROPERABILITY / INVESTIGATION', 'OFFLINE SIMULATION · NO LIVE IRIS OR MODEL');
html = html.replace('v0.2.0 candidate', 'SIMULATION ONLY');
html = html.replace(/<p id="chatgpt-settings"[^>]*>[\s\S]*?<\/p>/, '');
html = html.replace('Follow the message. Inspect the agent\'s recommendation. Check what the production records actually prove.', 'Explore authored synthetic examples. No agent, verifier, IRIS production, real approval, or delivery runs in this simulation.');
html = html.replace('<button type="button" data-view="learning" aria-pressed="false">Learning review</button>', '<button type="button" data-view="learning" aria-pressed="false">Learning review</button>\n    <button type="button" data-view="teaching" aria-pressed="false">Teaching example</button>');
html = html.replace('<label for="operator-key">Sandbox operator approval key</label>\n        <input id="operator-key" type="password" required maxlength="67" autocomplete="off">', '<p class="hint">Simulated approval only. No credentials are requested or accepted.</p>');
html = html.replace('Approve this sealed plan', 'Simulate approval');
html = html.replace('Execute approved plan', 'Simulate execution');
html = html.replace('Verify synthetic delivery', 'Show simulated delivery');
const teaching = `<section class="panel learning" data-panel="teaching"><h2 tabindex="-1">Teaching example · fixture only</h2>
<p>This offline example is separate from the gated native teaching feature. It does not inspect an IRIS session.</p>
<label for="simulation-mode">Explanation mode</label><select id="simulation-mode"><option value="coach">Coach</option><option value="focus">Focus</option><option value="companion">Companion</option></select>
<p id="simulation-coach">A recorded hop tells you where a message was seen. <button id="simulation-dismiss" type="button">Dismiss tip</button></p>
<button id="simulation-explain" type="button">Explain this</button><p id="simulation-reaction"></p>
<div id="simulation-lesson" hidden><p>This example shows a recorded hop in a synthetic trace. The session groups messages; each message has its own ID.</p>
<p><strong>Delivery is unverified</strong> when the example has no destination receipt. A recorded hop alone does not prove delivery.</p>
<p>Next, inspect the last recorded message and look for a receiving-system receipt.</p><details><summary>IRIS terms and source</summary><p>Session ID, message ID, message header and Visual Trace. This common-concept reference does not establish Build 154-specific behavior.</p><a href="https://docs.intersystems.com/iris20262/csp/docbook/DocBook.UI.Page.cls?KEY=EMONITOR_message_trace">InterSystems Visual Trace documentation (2026.2)</a></details></div></section>`;
html = html.replace('  </div>\n<footer class="workspace-footer">', `    ${teaching}\n  </div>\n<footer class="workspace-footer">`);
if (html.includes('id="operator-key"') || html.includes('id="chatgpt-settings"') || !html.includes('OFFLINE SIMULATION') || !html.includes('data-panel="teaching"')) throw new Error('Simulation build invariants failed.');
await writeFile(resolve(output, 'index.html'), html);
console.log(`Static simulation assembled at ${output}`);
