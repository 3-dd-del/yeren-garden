import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { sampleTime, getTimeDescription } from './time.js';

const skyVertex = /* glsl */`
varying vec3 vWorld;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}`;
const skyFragment = /* glsl */`
precision highp float;
varying vec3 vWorld;
uniform vec3 uTop;
uniform vec3 uMiddle;
uniform vec3 uHorizon;
uniform vec3 uCloud;
uniform vec3 uCloudEdge;
uniform float uNight;
uniform float uDay;
float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float noise(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);
}
float fbm(vec3 p) {
  float value = 0.0, amplitude = 0.5;
  for (int i=0; i<5; i++) { value += amplitude * noise(p); p = p * 2.03 + vec3(13.1,7.7,2.2); amplitude *= .5; }
  return value;
}
void main() {
  vec3 dir = normalize(vWorld - cameraPosition);
  float height = max(dir.y, 0.0);
  vec3 color = mix(uHorizon, uMiddle, smoothstep(-.06, .12, dir.y));
  color = mix(color, uTop, smoothstep(.10, .40, dir.y));
  vec3 cloudPosition = vec3(dir.x * 5.1 + 2.0, dir.y * 13.0, dir.z * 4.8);
  float cloudNoise = fbm(cloudPosition);
  float veil = smoothstep(.39,.68,cloudNoise) * smoothstep(-.02,.1,dir.y) * (1.0-smoothstep(.65,.95,dir.y));
  vec3 cloudColor = mix(uCloudEdge, uCloud, smoothstep(.40,.66,cloudNoise));
  color = mix(color, cloudColor, veil * .78);
  // Small stable stars belong to the late-night scene only.
  vec3 cell = floor(dir * 510.0);
  float star = step(.9987, hash(cell)) * pow(max(0.0, 1.0-length(fract(dir*510.0)-.5)*2.0),2.0);
  color += star * uNight * smoothstep(.06,.3,dir.y) * vec3(.55,.57,.65);
  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

function makeSky() {
  const uniforms = {
    uTop: { value: new THREE.Color() }, uMiddle: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() }, uCloud: { value: new THREE.Color() },
    uCloudEdge: { value: new THREE.Color() }, uNight: { value: 0 }, uDay: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({ vertexShader: skyVertex, fragmentShader: skyFragment, uniforms, side: THREE.BackSide, depthWrite: false, toneMapped: false });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(650, 32, 24), material);
  mesh.renderOrder = -1;
  return { mesh, uniforms };
}

// Repeated Blender pieces are baked together per material, keeping the complete
// editable assembly in the .blend while minimizing draw calls in the browser.
function batchModel(model) {
  model.updateMatrixWorld(true);
  const batches = new Map(), root = new THREE.Group(), staticGroup = new THREE.Group();
  const roofs = new Map(['east','west','entry'].map(id => { const group = new THREE.Group(); group.name=id; group.userData.mode='assembled'; group.userData.targetY=0; root.add(group); return [id,group]; }));
  root.add(staticGroup);
  const upperGroup=new THREE.Group();upperGroup.name="二层楼板与室内构件";root.add(upperGroup);
  let sourceMeshes=0, interiorMeshes=0;
  const sourceGeometries=new Set();
  model.traverse(object=>{
    if(!object.isMesh) return;
    sourceMeshes++;
    if(object.userData.component==='interior') interiorMeshes++;
    const part=object.userData.component==='roof'?object.userData.building:object.userData.layer==='upper'?'upper':'static';
    const material=object.material;
    if(Array.isArray(material)) throw new Error('模型存在不支持的多材质网格。');
    let geo=object.geometry.clone().applyMatrix4(object.matrixWorld);
    for(const attribute of Object.keys(geo.attributes)) if(!['position','normal','uv'].includes(attribute)) geo.deleteAttribute(attribute);
    if(!geo.getAttribute('uv')) geo.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(geo.getAttribute('position').count*2),2));
    if(!geo.getAttribute('normal')) geo.computeVertexNormals();
    if(geo.index){const expanded=geo.toNonIndexed();geo.dispose();geo=expanded;}
    const key=part+material.uuid;
    if(!batches.has(key)) batches.set(key,{part,material,geometries:[]});
    batches.get(key).geometries.push(geo);
    sourceGeometries.add(object.geometry);
  });
  const pickables=[];
  for(const {part,material,geometries} of batches.values()){
    const combined=mergeGeometries(geometries,false);
    geometries.forEach(g=>g.dispose());
    if(!combined) throw new Error('无法合并建筑构件。');
    combined.computeBoundingSphere();
    const mesh=new THREE.Mesh(combined,material);
    mesh.name=part+'｜'+material.name;
    mesh.userData={component:part==='static'||part==='upper'?'body':'roof',building:part};
    mesh.castShadow=!material.name.includes('暖光')&&!material.name.includes('灯罩');
    mesh.receiveShadow=true;material.side=THREE.DoubleSide;
    (part==='upper'?upperGroup:roofs.get(part)||staticGroup).add(mesh);pickables.push(mesh);
  }
  sourceGeometries.forEach(g=>g.dispose());
  return {group:root,roofs,upperGroup,pickables,sourceMeshes,interiorMeshes,batchedMeshes:pickables.length};
}

export async function createCampusScene(container, { initialMinutes = 1100, onProgress = () => {} } = {}) {
  let disposed = false;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.03;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // On-demand rendering continues only while camera or roof easing is active.
  renderer.shadowMap.autoUpdate = false;
  renderer.domElement.setAttribute('aria-hidden', 'true');
  container.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2('#8b7482', 0.008);
  const camera = new THREE.PerspectiveCamera(36, 1, .2, 1100);
  camera.position.set(25.5, 9.0, 55.5);
  camera.lookAt(0, 3.8, -1.0);
  const controls=new OrbitControls(camera,renderer.domElement);
  controls.target.set(0,3.8,-1);
  controls.enableDamping=true;controls.dampingFactor=.13;
  controls.enablePan=true;controls.minDistance=25;controls.maxDistance=115;
  controls.minPolarAngle=.10;controls.maxPolarAngle=Math.PI/2-.08;
  controls.rotateSpeed=.68;controls.zoomSpeed=.75;controls.panSpeed=.55;
  controls.update();
  renderer.domElement.style.touchAction='none';
  renderer.domElement.style.cursor='grab';
  let inspecting=false, cameraTransition=null;
  let viewOffset={x:-.12,y:-.10}, offsetTarget={x:-.12,y:-.10};
  const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sky = makeSky();
  scene.add(sky.mesh);

  const hemisphere = new THREE.HemisphereLight('#b3bfdd', '#3f3c45', 1.25);
  const ambient = new THREE.AmbientLight('#b7b0c7', .35);
  const sun = new THREE.DirectionalLight('#ffd0a1', .8);
  sun.position.set(-22, 18, -16);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -44;
  sun.shadow.camera.right = 44;
  sun.shadow.camera.top = 42;
  sun.shadow.camera.bottom = -42;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 170;
  sun.shadow.bias = -.00025;
  sun.shadow.normalBias = .065;
  sun.shadow.radius = 3;
  const fill = new THREE.DirectionalLight('#a4afd0', .28);
  fill.position.set(15, 20, 32);
  scene.add(hemisphere, ambient, sun, sun.target, fill);

  // Lamps, like emissive windows, are tied to the daylight state.
  const lamps = [];
  for (const z of [13.5, 20, 26.5]) {
    for (const x of [-4.25, 4.25]) {
      const light = new THREE.PointLight('#ffc088', 0, 7.4, 2);
      light.position.set(x, 1.9, z);
      scene.add(light);
      lamps.push(light);
    }
  }
  const entrance = new THREE.PointLight('#ffc486', 0, 12, 2);
  entrance.position.set(0, 2.8, 4.5);
  scene.add(entrance);
  const interiorLights=[-10.2,10.2].map(x=>{const light=new THREE.PointLight('#ffe0b5',0,16,2);light.position.set(x,6.9,-2.25);scene.add(light);return light;});

  let minutes = initialMinutes;
  let loadedModel;
  let modelInfo;
  const emissiveMaterials = [];
  let drawPending = false;
  let frame;
  let drawCount = 0;

  let previousFrame=0;
  const render = (now=performance.now()) => {
    drawPending=false;
    if(disposed||document.hidden)return;
    const dt=Math.min(.05,Math.max(.001,(now-previousFrame)/1000));previousFrame=now;
    let moving=false;
    if(cameraTransition){
      const t=Math.min(1,(now-cameraTransition.start)/(reducedMotion?1:650));
      const eased=1-Math.pow(1-t,3);
      camera.position.lerpVectors(cameraTransition.from,cameraTransition.to,eased);
      controls.target.lerpVectors(cameraTransition.targetFrom,cameraTransition.targetTo,eased);
      if(t===1)cameraTransition=null;else moving=true;
    }
    for(const axis of ['x','y']){
      const delta=offsetTarget[axis]-viewOffset[axis];
      if(Math.abs(delta)>.0001){viewOffset[axis]+=reducedMotion?delta:delta*Math.min(1,dt*12);moving=true;}else viewOffset[axis]=offsetTarget[axis];
    }
    applyProjection();
    if(modelInfo)for(const group of modelInfo.roofs.values()){
      const delta=group.userData.targetY-group.position.y;
      if(Math.abs(delta)>.005){group.position.y+=reducedMotion?delta:delta*Math.min(1,dt*11);moving=true;renderer.shadowMap.needsUpdate=true;}else group.position.y=group.userData.targetY;
    }
    const changed=controls.update();
    renderer.render(scene,camera);drawCount++;
    container.dataset.renderCount=String(drawCount);
    container.dataset.drawCalls=String(renderer.info.render.calls);
    container.dataset.triangles=String(renderer.info.render.triangles);
    container.dataset.camera=JSON.stringify(camera.position.toArray().map(n=>+n.toFixed(3)));
    container.dataset.cameraTarget=JSON.stringify(controls.target.toArray().map(n=>+n.toFixed(3)));
    if(modelInfo)container.dataset.roofTransforms=JSON.stringify(Object.fromEntries([...modelInfo.roofs].map(([id,g])=>[id,{visible:g.visible,y:+g.position.y.toFixed(3),mode:g.userData.mode}])));
    if(moving||changed)requestDraw();
  };
  const requestDraw=()=>{if(disposed||drawPending)return;drawPending=true;frame=requestAnimationFrame(render);};
  const onControlChange=()=>{controls.target.x=THREE.MathUtils.clamp(controls.target.x,-18,18);controls.target.y=THREE.MathUtils.clamp(controls.target.y,2,9);controls.target.z=THREE.MathUtils.clamp(controls.target.z,-18,18);requestDraw();};
  const onControlStart=()=>{cameraTransition=null;renderer.domElement.style.cursor='grabbing';};
  const onControlEnd=()=>{renderer.domElement.style.cursor='grab';requestDraw();};
  controls.addEventListener('change',onControlChange);controls.addEventListener('start',onControlStart);controls.addEventListener('end',onControlEnd);

  function applyProjection(){
    const {width,height}=container.getBoundingClientRect();
    camera.setViewOffset(width,height,width*viewOffset.x,height*viewOffset.y,width,height);
  }
  function moveCamera(position,target){
    // Flush residual orbit damping before a deterministic preset transition.
    controls.enableDamping=false;controls.update();controls.enableDamping=true;
    cameraTransition={from:camera.position.clone(),to:position,targetFrom:controls.target.clone(),targetTo:target,start:performance.now()};
    requestDraw();
  }
  function setInspection(active,{move=true}={}){
    inspecting=active;container.dataset.inspecting=String(active);
    offsetTarget=active?{x:0,y:.04}:{x:-.12,y:-.10};
    container.dispatchEvent(new CustomEvent('campus-inspection-change',{detail:{active}}));
    if(move){
      const {width,height}=container.getBoundingClientRect(),f=Math.max(1,1.5/(width/height));
      const fit=THREE.MathUtils.clamp(height/Math.max(250,height-480)*.67,1.2,1.72);
      moveCamera(active?new THREE.Vector3(15*fit,60*fit,21*fit):new THREE.Vector3(25.5*f,3.8+5.2*f,-1+56.5*f),new THREE.Vector3(0,active?3.1:3.8,-1));
    }
    setTime(minutes);
    requestDraw();
  }
  function roofState(){return Object.fromEntries([...modelInfo.roofs].map(([id,g])=>[id,g.userData.mode]));}
  function setRoofMode(mode,id=null,{focus=true}={}){
    if(!modelInfo||!['assembled','lifted','hidden'].includes(mode))return;
    const groups=id?[modelInfo.roofs.get(id)]:[...modelInfo.roofs.values()];
    for(const group of groups){if(!group)continue;group.userData.mode=mode;group.visible=mode!=='hidden';group.userData.targetY=mode==='lifted'?4.5:0;if(mode==='hidden')group.position.y=0;}
    renderer.shadowMap.needsUpdate=true;
    const state=roofState();container.dataset.roofState=JSON.stringify(state);
    container.dataset.visibleRoofs=String([...modelInfo.roofs.values()].filter(g=>g.visible).length);
    container.dispatchEvent(new CustomEvent('campus-roof-change',{detail:{state,id,mode}}));
    if(focus&&mode!=='assembled'&&!inspecting)setInspection(true);
    requestDraw();
  }
  function setFloor(level){
    if(!modelInfo||!['upper','ground'].includes(level))return;
    modelInfo.upperGroup.visible=level!=='ground';
    container.dataset.floor=level;
    renderer.shadowMap.needsUpdate=true;
    container.dispatchEvent(new CustomEvent('campus-floor-change',{detail:{level}}));
    requestDraw();
  }
  function resetView(){setInspection(false);}
  const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();
  function hitRoof(event){
    if(!modelInfo)return null;
    const rect=renderer.domElement.getBoundingClientRect();
    pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);
    camera.updateMatrixWorld();loadedModel.updateMatrixWorld(true);
    raycaster.setFromCamera(pointer,camera);
    const hit=raycaster.intersectObjects(modelInfo.pickables.filter(mesh=>mesh.parent.visible),false)[0];
    return hit?.object.userData.component==='roof'?hit.object.userData.building:null;
  }
  let down=null;
  const onPointerDown=event=>{if(event.button===0)down={x:event.clientX,y:event.clientY,id:event.pointerId,moved:false};};
  const onPointerMove=event=>{
    if(down&&Math.hypot(event.clientX-down.x,event.clientY-down.y)>5)down.moved=true;
    if(event.buttons)return;
    const id=hitRoof(event);container.dataset.hoverRoof=id||'';
    renderer.domElement.style.cursor=id?'pointer':'grab';
    renderer.domElement.title=id?'点击'+({east:'东翼',west:'西翼',entry:'中央门厅'}[id])+'屋顶，隐藏查看内部':'左键拖动环绕 · 滚轮缩放 · 右键平移';
  };
  const onPointerUp=event=>{if(down&&down.id===event.pointerId&&!down.moved&&Math.hypot(event.clientX-down.x,event.clientY-down.y)<6){const id=hitRoof(event);if(id)setRoofMode('hidden',id);}down=null;};
  const onPointerCancel=()=>{down=null;};
  renderer.domElement.addEventListener('pointerdown',onPointerDown);
  renderer.domElement.addEventListener('pointermove',onPointerMove);
  renderer.domElement.addEventListener('pointerup',onPointerUp);
  renderer.domElement.addEventListener('pointercancel',onPointerCancel);

  function setTime(nextMinutes) {
    minutes = Math.max(0, Math.min(1439, Math.round(nextMinutes)));
    const state = sampleTime(minutes);
    sky.uniforms.uTop.value.set(state.top);
    sky.uniforms.uMiddle.value.set(state.middle);
    sky.uniforms.uHorizon.value.set(state.horizon);
    sky.uniforms.uCloud.value.set(state.cloud);
    sky.uniforms.uCloudEdge.value.set(state.edge);
    sky.uniforms.uNight.value = state.night;
    sky.uniforms.uDay.value = state.day;
    const angle = (minutes / 1440 - .25) * Math.PI * 2;
    sun.position.set(-Math.cos(angle) * 52, Math.max(2, Math.sin(angle) * 57), -24 + Math.sin(angle) * 6);
    sun.intensity = state.sun;
    sun.color.set(state.sunColor);
    hemisphere.intensity = state.ambient;
    hemisphere.color.set(state.skyLight);
    hemisphere.groundColor.set(state.groundLight);
    ambient.intensity = state.fill * .43;
    ambient.color.set(state.skyLight);
    fill.intensity = state.fill;
    fill.color.set(state.skyLight);
    scene.fog.color.set(state.fog);
    scene.fog.density = .006 + state.night * .0018;
    renderer.toneMappingExposure = state.exposure;
    for (const { material, baseIntensity } of emissiveMaterials) material.emissiveIntensity = baseIntensity * state.lights;
    for (const light of lamps) light.intensity = state.lights * 10;
    entrance.intensity = state.lights * 20;
    interiorLights.forEach(light=>light.intensity=state.lights*18+(inspecting?18:0));
    renderer.shadowMap.needsUpdate = true;
    const description = getTimeDescription(minutes);
    container.dataset.sceneTime = description.time;
    container.dataset.sunIntensity = String(sun.intensity);
    container.dataset.artificialLight = String(lamps[0].intensity);
    container.dataset.skyColor = state.top;
    container.setAttribute('aria-label', `${description.label}，${description.time}的野人花园三维庭院`);
    requestDraw();
  }

  function resize() {
    const { width, height } = container.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    const framing = Math.max(1, 1.5 / camera.aspect);
    // Resizing preserves the user's orbit and zoom.
    if(!loadedModel&&!inspecting){camera.position.set(25.5*framing,3.8+5.2*framing,-1+56.5*framing);controls.target.set(0,3.8,-1);controls.update();}
    // The architecture occupies the open right half; the left sky holds the headline.
    applyProjection();
    camera.updateProjectionMatrix();
    requestDraw();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  const resume = () => { if (!document.hidden) requestDraw(); };
  document.addEventListener('visibilitychange', resume);
  const contextLost = event => {
    event.preventDefault();
    container.dispatchEvent(new CustomEvent('campus-context-lost'));
  };
  renderer.domElement.addEventListener('webglcontextlost', contextLost);
  resize();
  setTime(initialMinutes);

  try {
    const loader = new GLTFLoader();
    let gltf;
    if(location.protocol==='file:'){
      if(!window.__CAMPUS_MODEL_BASE64__)throw new Error('本地模型数据没有加载。');
      const binary=Uint8Array.from(atob(window.__CAMPUS_MODEL_BASE64__),c=>c.charCodeAt(0));
      onProgress(100);gltf=await loader.parseAsync(binary.buffer,'');
    }else{
      gltf=await loader.loadAsync(new URL('./assets/campus.glb',document.baseURI).href,event=>{if(event.total)onProgress(Math.round(event.loaded/event.total*100));});
    }
    if (disposed) return null;
    modelInfo = batchModel(gltf.scene);
    loadedModel = modelInfo.group;
    container.dataset.sourceMeshes = String(modelInfo.sourceMeshes);
    container.dataset.batchedMeshes = String(modelInfo.batchedMeshes);
    container.dataset.interiorMeshes=String(modelInfo.interiorMeshes);
    loadedModel.traverse(object => {
      if (!object.isMesh) return;
      const material = object.material;
      if (material.emissive && material.emissiveIntensity > 0 && material.emissive.getHex() !== 0) {
        material.emissive.set(material.name.includes("灯罩") ? "#ffc081" : "#e99d58");
        material.color.set("#4d4540");
        emissiveMaterials.push({ material, baseIntensity: material.name.includes("灯罩") ? 1.6 : .70 });
      }
    });
    scene.add(loadedModel);
    setRoofMode('assembled',null,{focus:false});
    setFloor('upper');
    setTime(minutes);
    // Resolve only once a frame containing the model has actually been submitted.
    await new Promise(resolve => requestAnimationFrame(() => { render(); resolve(); }));
  } catch (error) {
    observer.disconnect();
    document.removeEventListener('visibilitychange', resume);
    renderer.dispose();
    renderer.domElement.remove();
    throw error;
  }

  return {
    setTime, setRoofMode, resetView, setFloor,
    inspectInterior(){setRoofMode('hidden',null,{focus:false});setInspection(true);setTime(minutes);},
    getDiagnostics() {
      return {
        ready: !!loadedModel, minutes, time: getTimeDescription(minutes).time,
        sourceMeshes: modelInfo.sourceMeshes, batchedMeshes: modelInfo.batchedMeshes,
        emissiveMaterials: emissiveMaterials.length, drawCalls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles, drawCount,
        drawingBuffer: renderer.getDrawingBufferSize(new THREE.Vector2()).toArray(),
        sunPosition: sun.position.toArray(), sunIntensity: sun.intensity,
        artificialLights: lamps[0].intensity, skyTop: sky.uniforms.uTop.value.getHexString(),
      };
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener('visibilitychange', resume);
      renderer.domElement.removeEventListener('webglcontextlost', contextLost);
      controls.dispose();
      renderer.domElement.removeEventListener('pointerdown',onPointerDown);
      renderer.domElement.removeEventListener('pointermove',onPointerMove);
      renderer.domElement.removeEventListener('pointerup',onPointerUp);
      renderer.domElement.removeEventListener('pointercancel',onPointerCancel);
      scene.traverse(object => {
        if (!object.isMesh) return;
        object.geometry?.dispose();
        object.material?.dispose();
      });
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}







