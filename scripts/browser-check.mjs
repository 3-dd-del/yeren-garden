import { writeFile } from 'node:fs/promises';

const endpoint = 'http://127.0.0.1:9223';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let pages;
for (let attempt = 0; attempt < 50; attempt += 1) {
  try {
    pages = await fetch(`${endpoint}/json/list`).then((response) => response.json());
    if (pages.length) break;
  } catch {}
  await sleep(200);
}
if (!pages?.length) throw new Error('Chrome DevTools endpoint did not become ready.');
const page = pages.find((item) => item.type === 'page' && item.url.includes('4174')) || pages.find((item) => item.type === 'page');
if (!page) throw new Error('No page target found.');

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});
let nextId = 1;
const pending = new Map();
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (!message.id) return;
  const waiter = pending.get(message.id);
  if (!waiter) return;
  pending.delete(message.id);
  if (message.error) waiter.reject(new Error(message.error.message));
  else waiter.resolve(message.result);
});
function send(method, params = {}) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Evaluation failed.');
  return result.result.value;
}

await send('Runtime.enable');
await send('Page.enable');
await evaluate(`new Promise((resolve, reject) => {
  const started = performance.now();
  const poll = () => {
    if (window.__NIGHT_SCENE__?.getDiagnostics().ready) return resolve(true);
    if (performance.now() - started > 15000) return reject(new Error('Scene readiness timeout'));
    setTimeout(poll, 100);
  };
  poll();
})`);

const before = await evaluate('window.__NIGHT_SCENE__.getDiagnostics()');
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 820, y: 470, button: 'left', buttons: 1, clickCount: 1 });
for (let step = 1; step <= 10; step += 1) {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 820 + step * 22, y: 470 - step * 8, button: 'left', buttons: 1 });
  await sleep(25);
}
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 1040, y: 390, button: 'left', buttons: 0, clickCount: 1 });
await sleep(700);
const afterOrbit = await evaluate('window.__NIGHT_SCENE__.getDiagnostics()');
await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 820, y: 470, deltaX: 0, deltaY: -520 });
await sleep(700);
const afterZoom = await evaluate('window.__NIGHT_SCENE__.getDiagnostics()');
const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
await writeFile(new URL('../artifacts/rain-night-store-interaction.png', import.meta.url), Buffer.from(shot.data, 'base64'));

const distance = (camera, target) => Math.hypot(camera[0] - target[0], camera[1] - target[1], camera[2] - target[2]);
const orbitChanged = before.camera.some((value, index) => Math.abs(value - afterOrbit.camera[index]) > 0.1);
const zoomChanged = Math.abs(distance(afterOrbit.camera, afterOrbit.target) - distance(afterZoom.camera, afterZoom.target)) > 0.25;
const report = {
  checkedAt: new Date().toISOString(),
  url: page.url,
  ready: before.ready,
  rainDrops: before.rainDrops,
  cameraBefore: before.camera,
  cameraAfterOrbit: afterOrbit.camera,
  cameraAfterZoom: afterZoom.camera,
  orbitChanged,
  zoomChanged,
  interactionPassed: orbitChanged && zoomChanged,
};
await writeFile(new URL('../artifacts/browser-interaction-validation.json', import.meta.url), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await send('Browser.close').catch(() => {});
