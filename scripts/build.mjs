import { build } from 'esbuild';
import { mkdir, readFile, writeFile, cp } from 'node:fs/promises';
import { resolve } from 'node:path';
const root=resolve(import.meta.dirname,'..');
await mkdir(resolve(root,'dist/assets'),{recursive:true});
await mkdir(resolve(root,'artifacts'),{recursive:true});
const iconNames=['building-pavilion','maximize','minimize','arrow-down-right','clock-hour-5','moon','moon-stars','hand-move','sunrise','sun-high','sunset','refresh','building-community','rotate-3d','rotate-360','eye-off','chevron-up'];
const icons=Object.fromEntries(await Promise.all(iconNames.map(async name=>[name,await readFile(resolve(root,'node_modules/@tabler/icons/icons/outline',`${name}.svg`),'utf8')])));
const model=await readFile(resolve(root,'assets/campus.glb'));
// A separate classic-script payload is used only when the page is opened as a file.
// HTTP pages fetch the compact binary GLB instead.
await writeFile(resolve(root,'dist/assets/campus-model.js'),`window.__CAMPUS_MODEL_BASE64__=${JSON.stringify(model.toString('base64'))};\n`);
await build({entryPoints:[resolve(root,'src/main.js')],bundle:true,outfile:resolve(root,'dist/app.js'),format:'iife',target:['chrome110','edge110'],minify:true,sourcemap:true,define:{__ICONS__:JSON.stringify(icons)},logLevel:'info'});
await Promise.all([
  cp(resolve(root,'src/index.html'),resolve(root,'dist/index.html')),
  cp(resolve(root,'src/styles.css'),resolve(root,'dist/app.css')),
  cp(resolve(root,'assets/campus.glb'),resolve(root,'dist/assets/campus.glb')),
  cp(resolve(root,'assets/favicon.svg'),resolve(root,'dist/assets/favicon.svg')),
]);
await writeFile(resolve(root,'artifacts/build-summary.json'),JSON.stringify({builtAt:new Date().toISOString(),modelBytes:model.length,iconCount:iconNames.length,separateFileModelPayload:true},null,2));
console.log(`Campus built: dist/index.html. Model ${(model.length/1024).toFixed(1)} KB.`);
