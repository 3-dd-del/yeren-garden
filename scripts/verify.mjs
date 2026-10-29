import { readFile, writeFile, stat } from 'node:fs/promises';
import assert from 'node:assert/strict';

const root = new URL('../', import.meta.url);
const [html, js, css, sceneSource] = await Promise.all([
  readFile(new URL('dist/index.html', root), 'utf8'),
  readFile(new URL('dist/app.js', root), 'utf8'),
  readFile(new URL('dist/app.css', root), 'utf8'),
  readFile(new URL('src/night-scene.js', root), 'utf8'),
]);

assert(html.includes('雨夜便利店 · 微缩街角'), 'Page title must identify the new scene.');
assert(html.includes('<main id="scene"'), 'The page must contain a single full-screen scene root.');
assert(!/<button|<h1|<nav|<footer/i.test(html), 'No visible UI control or page chrome is allowed.');
assert(html.includes('app.js') && html.includes('app.css'), 'Built entry files must be linked.');
assert(js.length > 100_000, 'Bundled Three.js scene is unexpectedly small.');
assert(css.length > 100, 'Scene stylesheet is missing.');
for (const token of ['OrbitControls', 'UnrealBloomPass', 'RoundedBoxGeometry', 'rainCount', 'vending', 'bicycle', 'guardrails', 'Utility poles']) {
  assert(sceneSource.includes(token), `Scene source is missing expected element: ${token}`);
}
const requiredDetails = [
  '便利店招牌', '玻璃橱窗', '自动门', '屋檐雨棚', '门口地垫', '自动贩卖机', '自行车', '雨伞架',
  '垃圾桶', '路灯', '电线杆', '电线', '路牌', '街角护栏', '停车位', '排水沟', '积水路面',
  '反光斑马线', '小巷入口', '空调外机', '公告栏', '海报栏', '雨夜路面反射', '湿润积水', '环境雨滴',
];
for (const detail of requiredDetails) assert(sceneSource.includes(detail), `Missing required scene element: ${detail}`);
const joinedSource = `${sceneSource}\n${html}`;
for (const detail of requiredDetails) {
  if (!joinedSource.includes(detail)) console.warn(`Optional detail label not found: ${detail}`);
}
const info = await stat(new URL('dist/app.js', root));
const report = {
  checkedAt: new Date().toISOString(),
  scene: 'rain-night-convenience-store',
  noUiMarkup: true,
  orbitControls: true,
  fullScreenCanvas: true,
  bundleBytes: info.size,
  checksPassed: true,
};
await writeFile(new URL('artifacts/scene-static-validation.json', root), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
