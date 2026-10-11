import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const base = fileURLToPath(new URL('.', import.meta.url));
const read = (p) => fs.readFileSync(base + p, 'utf8');
const guard = (s) => s.replace(/<\/script/gi, '<\\/script');

const three = guard(read('vendor/three.min.js'));
const app = guard(read('src/scene.js'));

const page = read('src/page.html')
  .replace('/*__THREE__*/', () => three)
  .replace('/*__APP__*/', () => app);

for (const name of ['index.html', 'Villa-Savoye.html']) {
  fs.writeFileSync(base + name, page);
  console.log('built', name, (page.length / 1024).toFixed(0) + ' KB');
}
