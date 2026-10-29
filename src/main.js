import { createNightScene } from './night-scene.js';

const container = document.querySelector('#scene');
let scene = null;

try {
  scene = createNightScene(container);
  window.__NIGHT_SCENE__ = scene;
} catch (error) {
  console.error('雨夜便利店场景初始化失败：', error);
  container.dataset.error = 'true';
}

window.addEventListener('beforeunload', () => scene?.dispose(), { once: true });
