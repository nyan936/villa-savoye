import { spawn } from 'node:child_process';
import fs from 'node:fs';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const base = process.argv[2];
const cfgPath = process.argv[3];
const shots = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
const port = 9400 + Math.floor(Math.random() * 400);
const profile = (process.env.TEMP || '/tmp') + '\\cvcdp' + port;

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--enable-unsafe-swiftshader', '--no-first-run',
  '--no-default-browser-check', '--hide-scrollbars', '--mute-audio',
  '--remote-debugging-port=' + port, '--user-data-dir=' + profile,
  '--window-size=1440,810', 'about:blank'
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(path) {
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch('http://127.0.0.1:' + port + path);
      if (r.ok) return await r.json();
    } catch (e) { /* not up yet */ }
    await sleep(250);
  }
  throw new Error('chrome devtools not reachable on ' + port);
}

const version = await getJson('/json/version');
const list = await getJson('/json/list');
const page = list.find((t) => t.type === 'page') || list[0];
const ws = new WebSocket(page.webSocketDebuggerUrl);
let nextId = 1;
const pending = new Map();
const events = [];
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  else events.push(msg);
});
await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });

function send(method, params) {
  const id = nextId++;
  return new Promise((res) => { pending.set(id, res); ws.send(JSON.stringify({ id, method, params: params || {} })); });
}

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 810, deviceScaleFactor: 1, mobile: false });

async function waitFor(sel, timeout) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const r = await send('Runtime.evaluate', { expression: '!!document.querySelector(' + JSON.stringify(sel) + ')', returnByValue: true });
    if (r.result && r.result.result && r.result.result.value) return true;
    await sleep(200);
  }
  return false;
}

for (const shot of shots) {
  await send('Page.navigate', { url: shot.url || base });
  await sleep(500);
  await waitFor('#loader', 15000);
  await sleep(shot.settle || 2500);
  if (shot.eval) {
    const r = await send('Runtime.evaluate', { expression: shot.eval, returnByValue: true, awaitPromise: true });
    if (r.result && r.result.exceptionDetails) console.log('EVAL ERR', JSON.stringify(r.result.exceptionDetails).slice(0, 300));
    else if (shot.probe) console.log('PROBE', JSON.stringify(r.result && r.result.result && r.result.result.value));
    await sleep(shot.after || 1800);
  }
  const cap = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  if (!cap.result || !cap.result.data) { console.log('capture failed', shot.out, JSON.stringify(cap).slice(0, 200)); continue; }
  fs.writeFileSync(shot.out, Buffer.from(cap.result.data, 'base64'));
  const st = fs.statSync(shot.out);
  console.log('shot', shot.out, st.size);
}

ws.close();
chrome.kill();
await sleep(400);
process.exit(0);
