import { build } from 'esbuild';
import { mkdir, cp, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
await mkdir(resolve(root, 'dist/assets'), { recursive: true });
await mkdir(resolve(root, 'artifacts'), { recursive: true });

await build({
  entryPoints: [resolve(root, 'src/main.js')],
  bundle: true,
  outfile: resolve(root, 'dist/app.js'),
  format: 'iife',
  target: ['chrome110', 'edge110'],
  minify: true,
  sourcemap: true,
  logLevel: 'info',
});

await Promise.all([
  cp(resolve(root, 'src/index.html'), resolve(root, 'dist/index.html')),
  cp(resolve(root, 'src/styles.css'), resolve(root, 'dist/app.css')),
  cp(resolve(root, 'assets/favicon.svg'), resolve(root, 'dist/assets/favicon.svg')),
]);

await writeFile(resolve(root, 'artifacts/build-summary.json'), JSON.stringify({
  builtAt: new Date().toISOString(),
  scene: 'rain-night-convenience-store',
  externalRuntimeAssets: false,
}, null, 2));

console.log('Built rain-night convenience diorama: dist/index.html');
