import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(process.argv[2] || 'pages-preview');
await mkdir(output);
execFileSync(process.execPath, ['simulation/build.mjs', output], { cwd: root, stdio: 'inherit' });

const index = join(output, 'index.html');
const html = await readFile(index, 'utf8');
const environment = '  <dl class="environment"';
if (!html.includes(environment)) throw new Error('Missing simulation navigation anchor.');
const navigation = `  <nav aria-label="ISAIAH surfaces"><a href="./media/">Media gallery</a> · <a href="https://github.com/KennethJSmithDev/ISAIAH">Repository</a> · <a href="https://github.com/KennethJSmithDev/ISAIAH#start">Installation</a></nav>
`;
await writeFile(index, html.replace(environment, navigation + environment));

const media = join(output, 'media');
await mkdir(media);
for (const name of ['index.html', 'gallery.css', 'isaiah-r17.png', 'isaiah-judge-demo.webm']) {
  await copyFile(join(root, 'docs', 'media', name), join(media, name));
}
for (const name of ['LICENSE', 'NOTICE.md']) await copyFile(join(root, name), join(output, name));
await writeFile(join(output, '.nojekyll'), '');
