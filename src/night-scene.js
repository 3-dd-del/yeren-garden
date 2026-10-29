import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const TAU = Math.PI * 2;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function seededRandom(seed = 1) {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function makeCanvasTexture(width, height, draw, { repeat = null, anisotropy = 8 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  draw(context, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;
  if (repeat) {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeat[0], repeat[1]);
  }
  return texture;
}

function createToonGradient() {
  const data = new Uint8Array([
    42, 42, 42, 255,
    118, 118, 118, 255,
    204, 204, 204, 255,
    255, 255, 255, 255,
  ]);
  const texture = new THREE.DataTexture(data, 4, 1, THREE.RGBAFormat);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function createRadialTexture(inner = 'rgba(255,208,137,0.82)', outer = 'rgba(255,208,137,0)') {
  return makeCanvasTexture(256, 256, (ctx, width, height) => {
    const gradient = ctx.createRadialGradient(width / 2, height / 2, 2, width / 2, height / 2, width / 2);
    gradient.addColorStop(0, inner);
    gradient.addColorStop(0.42, inner);
    gradient.addColorStop(1, outer);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  });
}

function createReflectionTexture(color) {
  return makeCanvasTexture(256, 512, (ctx, width, height) => {
    ctx.clearRect(0, 0, width, height);
    const horizontal = ctx.createLinearGradient(0, 0, width, 0);
    horizontal.addColorStop(0, 'rgba(0,0,0,0)');
    horizontal.addColorStop(0.22, color);
    horizontal.addColorStop(0.5, color);
    horizontal.addColorStop(0.78, color);
    horizontal.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = horizontal;
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'destination-in';
    const vertical = ctx.createLinearGradient(0, 0, 0, height);
    vertical.addColorStop(0, 'rgba(255,255,255,0)');
    vertical.addColorStop(0.12, 'rgba(255,255,255,0.75)');
    vertical.addColorStop(0.48, 'rgba(255,255,255,0.34)');
    vertical.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = vertical;
    ctx.fillRect(0, 0, width, height);
  });
}

function createAsphaltTexture(renderer) {
  const random = seededRandom(31);
  return makeCanvasTexture(512, 512, (ctx, width, height) => {
    ctx.fillStyle = '#171e2a';
    ctx.fillRect(0, 0, width, height);
    for (let i = 0; i < 7000; i += 1) {
      const value = 25 + Math.floor(random() * 42);
      ctx.fillStyle = `rgba(${value},${value + 7},${value + 15},${0.08 + random() * 0.18})`;
      const size = random() * 2.1 + 0.4;
      ctx.fillRect(random() * width, random() * height, size, size);
    }
    for (let i = 0; i < 18; i += 1) {
      ctx.strokeStyle = `rgba(124,158,184,${0.025 + random() * 0.04})`;
      ctx.lineWidth = 1 + random() * 2;
      ctx.beginPath();
      const x = random() * width;
      ctx.moveTo(x, 0);
      ctx.bezierCurveTo(x + random() * 30, height * 0.35, x - random() * 22, height * 0.65, x + random() * 18, height);
      ctx.stroke();
    }
  }, { repeat: [5, 5], anisotropy: renderer.capabilities.getMaxAnisotropy() });
}

function createPaverTexture(renderer) {
  const random = seededRandom(93);
  return makeCanvasTexture(512, 512, (ctx, width, height) => {
    ctx.fillStyle = '#6b7681';
    ctx.fillRect(0, 0, width, height);
    const tile = 64;
    for (let y = 0; y < height; y += tile) {
      for (let x = 0; x < width; x += tile) {
        const shade = 105 + Math.floor(random() * 22);
        ctx.fillStyle = `rgb(${shade},${shade + 6},${shade + 11})`;
        ctx.fillRect(x + 2, y + 2, tile - 4, tile - 4);
        ctx.fillStyle = 'rgba(255,255,255,0.045)';
        ctx.fillRect(x + 3, y + 3, tile - 6, 3);
      }
    }
    ctx.strokeStyle = 'rgba(34,45,57,0.65)';
    ctx.lineWidth = 3;
    for (let y = 0; y <= height; y += tile) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    for (let x = 0; x <= width; x += tile) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let i = 0; i < 350; i += 1) {
      ctx.fillStyle = `rgba(28,38,48,${0.04 + random() * 0.08})`;
      ctx.fillRect(random() * width, random() * height, 1 + random() * 2, 1 + random() * 2);
    }
  }, { repeat: [6, 6], anisotropy: renderer.capabilities.getMaxAnisotropy() });
}

function createMainSignTexture(renderer) {
  return makeCanvasTexture(2048, 360, (ctx, width, height) => {
    ctx.fillStyle = '#f4f0df';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#3db6a6';
    ctx.fillRect(0, 0, 360, height);
    ctx.fillStyle = '#f27664';
    ctx.fillRect(360, 0, 18, height);
    ctx.fillStyle = '#154b4e';
    ctx.font = '900 160px "Yu Gothic", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('ほしみマート', 1170, 154);
    ctx.font = '700 47px "Arial", sans-serif';
    ctx.fillStyle = '#355b60';
    ctx.fillText('HOSHIMI MART  ·  OPEN 24 HOURS', 1170, 276);
    ctx.fillStyle = '#f8dfb6';
    ctx.beginPath();
    ctx.roundRect(74, 70, 214, 214, 44);
    ctx.fill();
    ctx.save();
    ctx.translate(181, 176);
    ctx.fillStyle = '#e76e5f';
    ctx.beginPath();
    for (let point = 0; point < 10; point += 1) {
      const radius = point % 2 === 0 ? 76 : 34;
      const angle = -Math.PI / 2 + point * Math.PI / 5;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (point === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = '#afc7bd';
    ctx.lineWidth = 7;
    ctx.strokeRect(16, 16, width - 32, height - 32);
  }, { anisotropy: renderer.capabilities.getMaxAnisotropy() });
}

function createVerticalSignTexture(renderer) {
  return makeCanvasTexture(360, 1024, (ctx, width, height) => {
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, '#2aa998');
    gradient.addColorStop(1, '#1d5961');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = '#bfe3d3';
    ctx.lineWidth = 18;
    ctx.strokeRect(18, 18, width - 36, height - 36);
    ctx.fillStyle = '#fff1cd';
    ctx.textAlign = 'center';
    ctx.font = '900 188px "Arial Black", sans-serif';
    ctx.fillText('24', width / 2, 325);
    ctx.font = '800 70px "Arial", sans-serif';
    ctx.fillText('HOURS', width / 2, 425);
    ctx.strokeStyle = '#f27b67';
    ctx.lineWidth = 24;
    ctx.beginPath();
    ctx.moveTo(60, 520);
    ctx.lineTo(width - 60, 520);
    ctx.stroke();
    ctx.save();
    ctx.translate(width / 2, 720);
    ctx.fillStyle = '#f8dfb6';
    for (let point = 0; point < 10; point += 1) {
      const radius = point % 2 === 0 ? 102 : 43;
      const angle = -Math.PI / 2 + point * Math.PI / 5;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (point === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#f8dfb6';
    ctx.font = '700 42px "Yu Gothic", sans-serif';
    ctx.fillText('ほしみ', width / 2, 915);
  }, { anisotropy: renderer.capabilities.getMaxAnisotropy() });
}

function createWindowDecalTexture(renderer) {
  return makeCanvasTexture(768, 512, (ctx, width, height) => {
    ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = 'rgba(239,248,237,0.95)';
    ctx.fillStyle = 'rgba(44,75,75,0.92)';
    ctx.lineWidth = 16;
    ctx.beginPath();
    ctx.roundRect(42, 64, 684, 384, 38);
    ctx.fill();
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f8e8bb';
    ctx.font = '900 220px "Arial Black", sans-serif';
    ctx.fillText('ATM', width / 2, 282);
    ctx.font = '700 48px "Yu Gothic", sans-serif';
    ctx.fillText('コーヒー  ·  おにぎり', width / 2, 365);
  }, { anisotropy: renderer.capabilities.getMaxAnisotropy() });
}

function createPosterBoardTexture(renderer) {
  return makeCanvasTexture(768, 960, (ctx, width, height) => {
    ctx.fillStyle = '#d9c8a4';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#604a3c';
    ctx.fillRect(20, 20, width - 40, height - 40);
    ctx.fillStyle = '#f2ead9';
    ctx.fillRect(50, 50, width - 100, height - 100);
    ctx.fillStyle = '#2b6d6a';
    ctx.fillRect(78, 78, 348, 220);
    ctx.fillStyle = '#f9e7b6';
    ctx.font = '900 60px "Yu Gothic", sans-serif';
    ctx.fillText('お知らせ', 104, 168);
    ctx.font = '700 34px "Yu Gothic", sans-serif';
    ctx.fillText('秋の新商品', 104, 232);
    ctx.fillStyle = '#f17b68';
    ctx.fillRect(446, 78, 244, 220);
    ctx.fillStyle = '#fff4d6';
    ctx.font = '900 44px "Yu Gothic", sans-serif';
    ctx.fillText('求人', 514, 170);
    ctx.font = '600 28px "Yu Gothic", sans-serif';
    ctx.fillText('スタッフ募集', 466, 228);
    ctx.fillStyle = '#d7e7d5';
    ctx.fillRect(78, 326, 612, 210);
    ctx.fillStyle = '#324b52';
    ctx.font = '800 38px "Yu Gothic", sans-serif';
    ctx.fillText('雨の日も、', 118, 402);
    ctx.fillText('あたたかい。', 118, 462);
    ctx.fillStyle = '#f5d29f';
    ctx.fillRect(78, 564, 612, 266);
    ctx.fillStyle = '#38565a';
    ctx.font = '900 68px "Yu Gothic", sans-serif';
    ctx.fillText('ほしみ町', 132, 664);
    ctx.font = '600 30px "Yu Gothic", sans-serif';
    ctx.fillText('街角の小さなお店', 132, 730);
    ctx.fillText('深夜も営業中です', 132, 778);
  }, { anisotropy: renderer.capabilities.getMaxAnisotropy() });
}

function createStreetSignTexture(renderer) {
  return makeCanvasTexture(640, 480, (ctx, width, height) => {
    ctx.fillStyle = '#215f8e';
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = '#dbe9e8';
    ctx.lineWidth = 18;
    ctx.strokeRect(18, 18, width - 36, height - 36);
    ctx.fillStyle = '#f5eed2';
    ctx.textAlign = 'center';
    ctx.font = '800 82px "Yu Gothic", sans-serif';
    ctx.fillText('ほしみ町', width / 2, 165);
    ctx.font = '700 38px "Arial", sans-serif';
    ctx.fillText('HOSHIMI-CHO', width / 2, 225);
    ctx.strokeStyle = '#f5eed2';
    ctx.lineWidth = 16;
    ctx.beginPath();
    ctx.moveTo(108, 337);
    ctx.lineTo(480, 337);
    ctx.lineTo(420, 276);
    ctx.moveTo(480, 337);
    ctx.lineTo(420, 398);
    ctx.stroke();
    ctx.font = '600 28px "Yu Gothic", sans-serif';
    ctx.fillText('駅方面', 145, 428);
  }, { anisotropy: renderer.capabilities.getMaxAnisotropy() });
}

function createVendingTexture(renderer) {
  return makeCanvasTexture(512, 1024, (ctx, width, height) => {
    ctx.fillStyle = '#e9e5d8';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#d34f4c';
    ctx.fillRect(0, 0, width, 155);
    ctx.fillStyle = '#fff5d8';
    ctx.font = '900 72px "Arial Black", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('DRINK', width / 2, 103);
    ctx.fillStyle = '#c9e8df';
    ctx.fillRect(34, 186, width - 68, 510);
    ctx.strokeStyle = '#24445a';
    ctx.lineWidth = 14;
    ctx.strokeRect(34, 186, width - 68, 510);
    const colors = ['#f17862', '#4bb5a7', '#f0bd5f', '#5286c3', '#ec87a1', '#72b36b'];
    for (let row = 0; row < 3; row += 1) {
      for (let column = 0; column < 6; column += 1) {
        ctx.fillStyle = colors[(row * 6 + column) % colors.length];
        ctx.beginPath();
        ctx.roundRect(60 + column * 68, 220 + row * 142, 44, 102, 13);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.72)';
        ctx.fillRect(71 + column * 68, 235 + row * 142, 20, 28);
      }
    }
    ctx.fillStyle = '#283a47';
    ctx.fillRect(34, 734, width - 68, 138);
    ctx.fillStyle = '#f5d77f';
    ctx.font = '700 30px "Arial", sans-serif';
    ctx.fillText('COLD  /  HOT', width / 2, 780);
    for (let i = 0; i < 4; i += 1) {
      ctx.fillStyle = i === 1 ? '#f15b52' : '#dce8dd';
      ctx.beginPath();
      ctx.arc(93 + i * 106, 837, 18, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = '#253540';
    ctx.fillRect(34, 902, width - 68, 78);
    ctx.fillStyle = '#f4edcf';
    ctx.font = '700 28px "Arial", sans-serif';
    ctx.fillText('24 HOURS  ·  ICE COLD', width / 2, 952);
  }, { anisotropy: renderer.capabilities.getMaxAnisotropy() });
}

function createPlaqueTexture(renderer) {
  return makeCanvasTexture(1400, 260, (ctx, width, height) => {
    ctx.fillStyle = '#121923';
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = '#8b744d';
    ctx.lineWidth = 6;
    ctx.strokeRect(14, 14, width - 28, height - 28);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#d8bc7a';
    ctx.font = '700 76px "Yu Gothic", serif';
    ctx.fillText('雨夜 · ほしみ街角', width / 2, 120);
    ctx.font = '500 32px "Arial", sans-serif';
    ctx.fillStyle = '#9c9a8f';
    ctx.fillText('HOSHIMI CORNER  /  MINIATURE DIORAMA', width / 2, 190);
  }, { anisotropy: renderer.capabilities.getMaxAnisotropy() });
}

export function createNightScene(container) {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x09101b, 0.0135);

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', stencil: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.setAttribute('aria-hidden', 'true');
  container.appendChild(renderer.domElement);

  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 150);
  camera.position.set(31, 31, 36);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, -4.8, -0.5);
  controls.enableDamping = true;
  controls.dampingFactor = 0.065;
  controls.minDistance = 14;
  controls.maxDistance = 86;
  controls.minPolarAngle = 0.22;
  controls.maxPolarAngle = Math.PI * 0.485;
  controls.enablePan = true;
  controls.screenSpacePanning = true;
  controls.zoomToCursor = true;
  controls.update();

  const toonGradient = createToonGradient();
  const world = new THREE.Group();
  world.name = '雨夜便利店微缩景观';
  world.userData.featureManifest = ['便利店招牌', '玻璃橱窗', '自动门', '屋檐雨棚', '门口地垫', '自动贩卖机', '自行车', '雨伞架', '垃圾桶', '路灯', '电线杆', '电线', '路牌', '街角护栏', '停车位', '排水沟', '积水路面', '反光斑马线', '小巷入口', '空调外机', '公告栏', '海报栏', '雨夜路面反射', '湿润积水', '环境雨滴'];
  scene.add(world);

  const mat = {};
  const toon = (color, extra = {}) => new THREE.MeshToonMaterial({ color, gradientMap: toonGradient, ...extra });
  mat.cream = toon(0xeee6d2);
  mat.wall = toon(0xd8d6cb);
  mat.white = toon(0xf0eee5);
  mat.teal = toon(0x2f9b93);
  mat.deepTeal = toon(0x194e57);
  mat.coral = toon(0xe66e5c);
  mat.amber = toon(0xe4a85e);
  mat.road = new THREE.MeshPhysicalMaterial({
    color: 0x18202c,
    map: createAsphaltTexture(renderer),
    roughness: 0.24,
    metalness: 0.12,
    clearcoat: 0.62,
    clearcoatRoughness: 0.16,
  });
  mat.sidewalk = toon(0xc6c9c5, { map: createPaverTexture(renderer) });
  mat.curb = toon(0xbfc2bb);
  mat.asphaltPad = new THREE.MeshStandardMaterial({ color: 0x46525f, roughness: 0.36, metalness: 0.08 });
  mat.metal = toon(0x6a7480);
  mat.darkMetal = toon(0x1d2730);
  mat.black = toon(0x11161d);
  mat.wood = toon(0x8b6447);
  mat.glass = new THREE.MeshPhysicalMaterial({
    color: 0xb8d7dc,
    transparent: true,
    opacity: 0.2,
    roughness: 0.06,
    metalness: 0.02,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  mat.glassBlue = new THREE.MeshPhysicalMaterial({
    color: 0x98d8df,
    transparent: true,
    opacity: 0.15,
    roughness: 0.08,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  mat.windowGlow = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd58f).multiplyScalar(1.75), toneMapped: false });
  mat.coolGlow = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x9ce2df).multiplyScalar(1.5), toneMapped: false });
  mat.warmGlow = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc278).multiplyScalar(1.85), toneMapped: false });
  mat.signGlow = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffe2a5).multiplyScalar(1.7), toneMapped: false });
  mat.outline = new THREE.LineBasicMaterial({ color: 0x6d8190, transparent: true, opacity: 0.5 });

  const store = new THREE.Group();
  store.name = 'ほしみマート';
  world.add(store);

  function addBox(parent, width, height, depth, material, x, y, z, { radius = 0.035, outline = false, cast = true, receive = true } = {}) {
    const size = Math.min(width, height, depth);
    const safeRadius = Math.min(radius, size * 0.22);
    const geometry = safeRadius > 0.006
      ? new RoundedBoxGeometry(width, height, depth, 2, safeRadius)
      : new THREE.BoxGeometry(width, height, depth);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    parent.add(mesh);
    if (outline) {
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 28), mat.outline);
      edges.renderOrder = 4;
      mesh.add(edges);
    }
    return mesh;
  }

  function addPlane(parent, width, height, material, x, y, z, rotationX = 0, rotationY = 0, rotationZ = 0) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rotationX, rotationY, rotationZ);
    mesh.receiveShadow = false;
    parent.add(mesh);
    return mesh;
  }

  function addCylinder(parent, radiusTop, radiusBottom, height, material, x, y, z, radialSegments = 12, rotation = null) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, height, radialSegments), material);
    mesh.position.set(x, y, z);
    if (rotation) mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  function cylinderBetween(parent, start, end, radius, material, segments = 8) {
    const direction = new THREE.Vector3().subVectors(end, start);
    const length = direction.length();
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, segments), material);
    mesh.position.copy(start).addScaledVector(direction, 0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  }

  function addTube(parent, points, radius, material, tubularSegments = 28) {
    const curve = new THREE.CatmullRomCurve3(points);
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, tubularSegments, radius, 5, false), material);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  }

  function addLabel(parent, texture, width, height, x, y, z, rotationY = 0) {
    const material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false, side: THREE.DoubleSide });
    return addPlane(parent, width, height, material, x, y, z, 0, rotationY, 0);
  }

  function addInstanced(parent, geometry, material, instances) {
    const mesh = new THREE.InstancedMesh(geometry, material, instances.length);
    const dummy = new THREE.Object3D();
    instances.forEach((item, index) => {
      dummy.position.set(item.x, item.y, item.z);
      dummy.rotation.set(item.rx || 0, item.ry || 0, item.rz || 0);
      dummy.scale.set(item.sx || 1, item.sy || 1, item.sz || 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      if (item.color) mesh.setColorAt(index, new THREE.Color(item.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    parent.add(mesh);
    return mesh;
  }

  // Sky dome: quiet blue-black rain atmosphere with a softly lit horizon.
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(90, 32, 20),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        topColor: { value: new THREE.Color(0x030611) },
        horizonColor: { value: new THREE.Color(0x142235) },
        lowerColor: { value: new THREE.Color(0x060a12) },
      },
      vertexShader: `
        varying vec3 vDirection;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vDirection = normalize(worldPosition.xyz - cameraPosition);
          gl_Position = projectionMatrix * viewMatrix * worldPosition;
        }
      `,
      fragmentShader: `
        varying vec3 vDirection;
        uniform vec3 topColor;
        uniform vec3 horizonColor;
        uniform vec3 lowerColor;
        void main() {
          float y = vDirection.y;
          vec3 color = mix(lowerColor, horizonColor, smoothstep(-0.22, 0.08, y));
          color = mix(color, topColor, smoothstep(0.08, 0.82, y));
          float cloud = sin(vDirection.x * 9.0 + vDirection.z * 4.0) * sin(vDirection.z * 13.0 - 1.8);
          cloud += sin(vDirection.x * 22.0 - vDirection.z * 7.0) * 0.35;
          color += horizonColor * smoothstep(0.2, 0.7, cloud) * 0.12;
          gl_FragColor = vec4(color, 1.0);
        }
      `,
    }),
  );
  scene.add(sky);

  // Soft contact shadow keeps the square diorama grounded in a dark display space.
  const contactShadow = makeCanvasTexture(512, 512, (ctx, width, height) => {
    const gradient = ctx.createRadialGradient(width / 2, height / 2, width * 0.1, width / 2, height / 2, width * 0.5);
    gradient.addColorStop(0, 'rgba(0,0,0,0.78)');
    gradient.addColorStop(0.5, 'rgba(0,0,0,0.32)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  });
  const shadowPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(48, 48),
    new THREE.MeshBasicMaterial({ map: contactShadow, transparent: true, depthWrite: false, opacity: 0.9 }),
  );
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.position.y = -1.205;
  scene.add(shadowPlane);

  // Layered square pedestal and miniature street surfaces.
  addBox(world, 34, 1.2, 34, toon(0x2b3745), 0, -0.6, 0, { radius: 0.4, outline: true });
  addBox(world, 33.2, 0.1, 33.2, toon(0x374452), 0, -0.04, 0, { radius: 0.12 });
  const baseTrim = new THREE.MeshBasicMaterial({ color: 0x526e82 });
  addBox(world, 33.6, 0.018, 0.07, baseTrim, 0, 0.015, 16.82, { radius: 0.004, cast: false });
  addBox(world, 33.6, 0.018, 0.07, baseTrim, 0, 0.015, -16.82, { radius: 0.004, cast: false });
  addBox(world, 0.07, 0.018, 33.6, baseTrim, 16.82, 0.015, 0, { radius: 0.004, cast: false });
  addBox(world, 0.07, 0.018, 33.6, baseTrim, -16.82, 0.015, 0, { radius: 0.004, cast: false });
  for (const x of [-15.5, 15.5]) {
    for (const z of [-15.5, 15.5]) addCylinder(world, 0.22, 0.22, 0.18, mat.darkMetal, x, -1.28, z, 12);
  }
  addBox(world, 31.8, 0.1, 0.18, mat.darkMetal, 0, -1.19, 16.92);
  addBox(world, 31.8, 0.1, 0.18, mat.darkMetal, 0, -1.19, -16.92);
  addBox(world, 0.18, 0.1, 31.8, mat.darkMetal, 16.92, -1.19, 0);
  addBox(world, 0.18, 0.1, 31.8, mat.darkMetal, -16.92, -1.19, 0);
  const plaque = addLabel(world, createPlaqueTexture(renderer), 8.3, 1.54, 0, -0.48, 17.011);
  plaque.renderOrder = 2;

  addBox(world, 34, 0.1, 7.5, mat.road, 0, 0.03, 11.25, { radius: 0.01, cast: false });
  addBox(world, 4.2, 0.1, 30, mat.road, 13, 0.035, 0, { radius: 0.01, cast: false });
  addBox(world, 24.3, 0.28, 5.2, mat.sidewalk, -1.2, 0.145, 4.9, { radius: 0.02, cast: false });
  addBox(world, 3.4, 0.28, 20.0, mat.sidewalk, 9.3, 0.145, -2.5, { radius: 0.02, cast: false });
  addBox(world, 24.3, 0.28, 2.5, mat.sidewalk, -1.2, 0.145, -9.55, { radius: 0.02, cast: false });
  addBox(world, 4.6, 0.12, 5.2, mat.asphaltPad, -10.4, 0.075, 4.9, { radius: 0.02, cast: false });
  addBox(world, 21.6, 0.08, 0.16, mat.curb, -1.5, 0.18, 7.55, { radius: 0.01, cast: false });
  addBox(world, 0.16, 0.08, 19.4, mat.curb, 10.68, 0.18, -2.3, { radius: 0.01, cast: false });
  addBox(world, 0.16, 0.08, 5.2, mat.curb, 11.08, 0.18, 4.9, { radius: 0.01, cast: false });

  const parkingLineMaterial = new THREE.MeshBasicMaterial({ color: 0xd3d8d2, transparent: true, opacity: 0.78 });
  addPlane(world, 4.35, 0.09, parkingLineMaterial, -10.4, 0.15, 2.72, -Math.PI / 2);
  addPlane(world, 0.09, 4.15, parkingLineMaterial, -8.25, 0.15, 4.78, -Math.PI / 2);
  addPlane(world, 0.09, 4.15, parkingLineMaterial, -12.55, 0.15, 4.78, -Math.PI / 2);
  addBox(world, 2.8, 0.14, 0.3, toon(0xd3aa54), -10.4, 0.21, 3.05, { radius: 0.07 });

  const roadPaint = new THREE.MeshBasicMaterial({ color: 0xdde3dc, transparent: true, opacity: 0.64 });
  for (let i = 0; i < 7; i += 1) addPlane(world, 3.9, 0.34, roadPaint, 8.15, 0.095, 8.15 + i * 0.94, -Math.PI / 2);
  addPlane(world, 0.14, 13.5, roadPaint, 12.0, 0.096, 1.8, -Math.PI / 2);
  addPlane(world, 0.14, 13.5, roadPaint, 14.4, 0.096, 1.8, -Math.PI / 2);
  addPlane(world, 2.6, 0.15, roadPaint, -7.4, 0.096, 12.2, -Math.PI / 2);
  addPlane(world, 2.6, 0.15, roadPaint, 1.8, 0.096, 12.2, -Math.PI / 2);

  const gutterMat = toon(0x333d47);
  const grateMat = toon(0x0f151c);
  addBox(world, 20.5, 0.035, 0.3, gutterMat, -1.4, 0.095, 7.82, { radius: 0.01, cast: false });
  addBox(world, 0.3, 0.035, 18.2, gutterMat, 10.88, 0.095, -2.9, { radius: 0.01, cast: false });
  for (const x of [-10.7, -5.2, 0.8, 6.6]) {
    addBox(world, 1.0, 0.02, 0.24, grateMat, x, 0.12, 7.82, { radius: 0.005, cast: false });
    for (let i = 0; i < 6; i += 1) addBox(world, 0.035, 0.018, 0.22, mat.metal, x - 0.4 + i * 0.16, 0.135, 7.82, { radius: 0, cast: false });
  }
  for (const z of [-7.5, -3.1, 1.2, 5.7]) {
    addBox(world, 0.24, 0.02, 1.1, grateMat, 10.88, 0.12, z, { radius: 0.005, cast: false });
    for (let i = 0; i < 6; i += 1) addBox(world, 0.22, 0.018, 0.035, mat.metal, 10.88, 0.135, z - 0.44 + i * 0.18, { radius: 0, cast: false });
  }

  // Store shell.
  addBox(store, 14.4, 0.34, 10.4, toon(0xa8a79e), 0, 0.28, -3, { radius: 0.08, outline: true });
  addBox(store, 13.9, 0.12, 9.9, toon(0xd7ceba), 0, 0.49, -3, { radius: 0.02 });
  addBox(store, 0.34, 4.65, 10.05, mat.wall, -7, 2.75, -3, { radius: 0.05, outline: true });
  addBox(store, 0.34, 4.65, 10.05, mat.wall, 7, 2.75, -3, { radius: 0.05, outline: true });
  addBox(store, 14, 4.65, 0.34, mat.wall, 0, 2.75, -8.05, { radius: 0.05, outline: true });
  addBox(store, 14.5, 0.38, 10.55, mat.cream, 0, 5.0, -3, { radius: 0.08, outline: true });
  addBox(store, 14.2, 0.24, 10.25, mat.teal, 0, 5.24, -3, { radius: 0.06 });

  const storefrontZ = 2.02;
  addBox(store, 6.85, 3.48, 0.05, mat.glass, -3.35, 2.28, storefrontZ, { radius: 0.01, cast: false });
  addBox(store, 2.95, 3.48, 0.05, mat.glass, 1.95, 2.28, storefrontZ, { radius: 0.01, cast: false });
  addBox(store, 2.75, 3.48, 0.05, mat.glass, 5.35, 2.28, storefrontZ, { radius: 0.01, cast: false });
  for (const x of [-6.9, -3.1, 0.18, 3.7, 6.78]) addBox(store, 0.14, 3.75, 0.16, mat.deepTeal, x, 2.26, storefrontZ + 0.04, { radius: 0.02, outline: true });
  for (const y of [0.55, 4.05]) addBox(store, 13.7, 0.13, 0.16, mat.deepTeal, 0, y, storefrontZ + 0.04, { radius: 0.02, outline: true });
  addBox(store, 3.2, 3.65, 0.14, mat.deepTeal, 1.95, 2.28, storefrontZ + 0.07, { radius: 0.02 });
  addBox(store, 2.9, 3.3, 0.06, mat.glassBlue, 1.95, 2.25, storefrontZ + 0.16, { radius: 0.01, cast: false });
  addBox(store, 0.07, 3.22, 0.08, toon(0x8cbfc2), 1.28, 2.25, storefrontZ + 0.2, { radius: 0.01 });
  addBox(store, 0.07, 3.22, 0.08, toon(0x8cbfc2), 2.67, 2.25, storefrontZ + 0.2, { radius: 0.01 });
  addBox(store, 0.62, 0.16, 0.18, mat.black, 1.95, 3.98, storefrontZ + 0.2, { radius: 0.04 });
  const sensorLed = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), mat.coolGlow);
  sensorLed.position.set(1.95, 3.96, storefrontZ + 0.31);
  store.add(sensorLed);
  addBox(store, 0.045, 0.82, 0.05, mat.metal, 2.52, 2.16, storefrontZ + 0.34, { radius: 0.005 });

  const decal = createWindowDecalTexture(renderer);
  addLabel(store, decal, 2.65, 1.76, -4.45, 2.73, storefrontZ + 0.06);
  const doorSticker = makeCanvasTexture(512, 256, (ctx, width, height) => {
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#f5e8bd';
    ctx.font = '900 94px "Arial Black", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('24H', width / 2, 120);
    ctx.font = '700 36px "Yu Gothic", sans-serif';
    ctx.fillStyle = '#d8eee0';
    ctx.fillText('OPEN', width / 2, 188);
  });
  addLabel(store, doorSticker, 1.04, 0.52, 2.08, 3.4, storefrontZ + 0.24);

  addBox(store, 12.7, 1.22, 0.28, mat.deepTeal, 0, 4.72, 2.2, { radius: 0.08, outline: true });
  addLabel(store, createMainSignTexture(renderer), 12.28, 1.03, 0, 4.72, 2.356);
  addBox(store, 0.34, 3.45, 1.05, mat.deepTeal, 7.3, 4.15, 0.65, { radius: 0.06, outline: true });
  addLabel(store, createVerticalSignTexture(renderer), 0.98, 3.15, 7.48, 4.16, 0.65, Math.PI / 2);
  addBox(store, 0.14, 3.55, 0.08, mat.metal, 7.49, 4.15, 0.65, { radius: 0.01 });

  addBox(store, 12.7, 0.16, 1.8, mat.teal, 0, 4.17, 3.05, { radius: 0.04, outline: true });
  const awningTexture = makeCanvasTexture(1024, 192, (ctx, width, height) => {
    ctx.fillStyle = '#f2ead8';
    ctx.fillRect(0, 0, width, height);
    for (let i = 0; i < 12; i += 1) {
      ctx.fillStyle = i % 2 ? '#efe2c9' : '#3ca79a';
      ctx.fillRect(i * width / 12, 0, width / 12, height);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillRect(0, 0, width, 14);
  }, { repeat: [1, 1] });
  addLabel(store, awningTexture, 12.6, 0.46, 0, 3.91, 3.96);
  for (let x = -5.8; x <= 5.8; x += 1.4) addCylinder(store, 0.035, 0.035, 0.56, mat.metal, x, 3.76, 3.98, 8);
  addBox(store, 11.9, 0.07, 0.11, mat.warmGlow, 0, 4.09, 2.55, { radius: 0.02, cast: false });

  // Interior floor, ceiling, fluorescent strips and warm product lighting.
  addBox(store, 13.45, 0.08, 9.4, toon(0xcabf9f), 0, 0.56, -3.1, { radius: 0.01, cast: false });
  addBox(store, 13.45, 0.12, 9.4, toon(0xf0e5c8), 0, 4.28, -3.1, { radius: 0.01, cast: false });
  addBox(store, 12.9, 0.08, 0.08, mat.windowGlow, 0, 4.18, -7.45, { radius: 0.01, cast: false });
  addBox(store, 0.08, 0.08, 8.7, mat.windowGlow, -6.2, 4.18, -3.15, { radius: 0.01, cast: false });
  for (const x of [-4.5, -1.1, 2.3]) {
    addBox(store, 2.25, 0.055, 0.42, mat.coolGlow, x, 4.15, -3.45, { radius: 0.01, cast: false });
    const light = new THREE.PointLight(0xffc98d, 18, 9, 2);
    light.position.set(x, 3.75, -2.1);
    store.add(light);
  }

  // Refrigerated drink wall.
  const bottleInstances = [];
  const bottleColors = ['#ef7460', '#5fbfa9', '#f1bd58', '#5b93d0', '#ea8eb1', '#85b963', '#e7d9a4'];
  for (let unit = 0; unit < 3; unit += 1) {
    const centerX = -4.4 + unit * 2.65;
    addBox(store, 2.34, 3.22, 0.52, mat.deepTeal, centerX, 2.35, -7.68, { radius: 0.04, outline: true });
    addBox(store, 2.12, 2.78, 0.06, mat.glassBlue, centerX, 2.42, -7.37, { radius: 0.01, cast: false });
    for (let row = 0; row < 4; row += 1) {
      addBox(store, 2.1, 0.055, 0.1, mat.metal, centerX, 1.18 + row * 0.67, -7.31, { radius: 0.005, cast: false });
      for (let column = 0; column < 6; column += 1) {
        bottleInstances.push({
          x: centerX - 0.82 + column * 0.33,
          y: 1.37 + row * 0.67,
          z: -7.23,
          sx: 0.18,
          sy: 0.3,
          sz: 0.15,
          color: bottleColors[(unit * 4 + row + column) % bottleColors.length],
        });
      }
    }
    addBox(store, 2.22, 0.12, 0.12, mat.coolGlow, centerX, 3.86, -7.28, { radius: 0.01, cast: false });
  }
  const bottleMaterial = toon(0xffffff, { vertexColors: true });
  addInstanced(store, new THREE.BoxGeometry(1, 1, 1), bottleMaterial, bottleInstances);

  // Island shelves stocked with bright, color-blocked merchandise.
  const productInstances = [];
  const productColors = ['#ef7a63', '#f1c561', '#76bca6', '#6ba1cf', '#e58ca6', '#d6d9c7', '#84ad63'];
  for (const shelfZ of [-4.7, -1.65]) {
    addBox(store, 5.1, 0.24, 1.1, mat.deepTeal, -3.1, 0.68, shelfZ, { radius: 0.05 });
    for (const y of [1.02, 1.48, 1.94]) {
      addBox(store, 4.95, 0.07, 1.18, mat.metal, -3.1, y, shelfZ, { radius: 0.01, cast: false });
      for (let column = 0; column < 7; column += 1) {
        for (let depth = 0; depth < 2; depth += 1) {
          productInstances.push({
            x: -5.35 + column * 0.72,
            y: y + 0.22,
            z: shelfZ - 0.24 + depth * 0.48,
            sx: 0.48,
            sy: 0.33,
            sz: 0.22,
            color: productColors[(column + depth + Math.round(y * 10)) % productColors.length],
          });
        }
      }
    }
    addBox(store, 0.12, 1.6, 0.12, mat.metal, -5.48, 1.38, shelfZ, { radius: 0.02 });
    addBox(store, 0.12, 1.6, 0.12, mat.metal, -0.72, 1.38, shelfZ, { radius: 0.02 });
  }
  const productMaterial = toon(0xffffff, { vertexColors: true });
  addInstanced(store, new THREE.BoxGeometry(1, 1, 1), productMaterial, productInstances);

  // Checkout counter, register and hot-snack case.
  addBox(store, 3.3, 1.12, 1.32, mat.white, 4.65, 1.08, -2.52, { radius: 0.08, outline: true });
  addBox(store, 3.18, 0.12, 1.22, mat.coral, 4.65, 1.7, -2.52, { radius: 0.03 });
  addBox(store, 0.9, 0.65, 0.55, mat.darkMetal, 4.72, 1.88, -2.52, { radius: 0.08 });
  addBox(store, 0.56, 0.2, 0.06, mat.windowGlow, 4.72, 2.02, -2.2, { radius: 0.01, cast: false });
  addBox(store, 0.95, 0.65, 0.72, toon(0x41545a), 5.65, 1.4, -4.15, { radius: 0.05 });
  addBox(store, 0.78, 0.36, 0.56, mat.coolGlow, 5.65, 1.5, -3.76, { radius: 0.03, cast: false });
  const registerLight = new THREE.PointLight(0xffd092, 8, 6, 2);
  registerLight.position.set(4.5, 3.1, -2.4);
  store.add(registerLight);

  const shelfPoster = makeCanvasTexture(512, 256, (ctx, width, height) => {
    ctx.fillStyle = '#f4e5bc';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#e66f5c';
    ctx.fillRect(0, 0, width, 62);
    ctx.fillStyle = '#fff4d2';
    ctx.font = '900 44px "Yu Gothic", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('本日のおすすめ', width / 2, 48);
    ctx.fillStyle = '#325e60';
    ctx.font = '800 60px "Yu Gothic", sans-serif';
    ctx.fillText('あたたかい', width / 2, 142);
    ctx.font = '700 42px "Yu Gothic", sans-serif';
    ctx.fillText('おでん  ・  肉まん', width / 2, 202);
  });
  addLabel(store, shelfPoster, 1.75, 0.88, -3.1, 2.63, -0.99);
  addCylinder(store, 0.31, 0.31, 0.08, mat.white, 3.2, 3.63, -7.77, 24, [Math.PI / 2, 0, 0]);
  addCylinder(store, 0.04, 0.04, 0.42, mat.black, 3.2, 3.77, -7.92, 8);
  addPlane(store, 0.52, 0.52, new THREE.MeshBasicMaterial({ color: 0xe8e4cc }), 3.2, 3.63, -7.71);
  addBox(store, 0.32, 0.025, 0.018, mat.black, 3.2, 3.71, -7.67, { radius: 0, cast: false });

  // Side-wall service area, noticeboard and the narrow alley threshold.
  addBox(store, 1.78, 2.16, 0.12, mat.wood, 7.24, 2.35, -1.65, { radius: 0.04 });
  addLabel(store, createPosterBoardTexture(renderer), 1.5, 1.86, 7.315, 2.35, -1.65, Math.PI / 2);
  addBox(store, 0.08, 2.85, 0.72, mat.glassBlue, 7.19, 2.3, -0.6, { radius: 0.01, cast: false });
  addBox(store, 0.75, 0.86, 0.64, mat.metal, 8.1, 0.91, -5.0, { radius: 0.06, outline: true });
  addBox(store, 0.55, 0.55, 0.05, mat.darkMetal, 8.1, 0.91, -4.65, { radius: 0.02, cast: false });
  addCylinder(store, 0.23, 0.23, 0.07, mat.metal, 8.1, 0.91, -4.61, 18, [Math.PI / 2, 0, 0]);
  addBox(store, 0.66, 0.76, 0.55, mat.metal, 8.1, 0.84, -6.05, { radius: 0.05, outline: true });
  addBox(store, 0.5, 0.5, 0.05, mat.darkMetal, 8.1, 0.84, -5.74, { radius: 0.02, cast: false });
  addTube(store, [
    new THREE.Vector3(7.14, 0.45, -5.7),
    new THREE.Vector3(7.14, 1.6, -5.7),
    new THREE.Vector3(7.14, 1.6, -4.2),
    new THREE.Vector3(7.25, 1.75, -4.2),
  ], 0.045, mat.metal);
  addBox(store, 2.7, 0.16, 0.12, mat.teal, 7.42, 3.35, -4.9, { radius: 0.02 });
  addBox(store, 0.7, 0.16, 0.84, mat.black, 7.42, 3.18, -4.05, { radius: 0.03 });
  addBox(store, 0.55, 0.07, 0.63, mat.warmGlow, 7.42, 3.11, -4.05, { radius: 0.01, cast: false });
  const alleyLight = new THREE.PointLight(0xffb76e, 10, 7, 2);
  alleyLight.position.set(7.7, 3.0, -4.1);
  store.add(alleyLight);

  // Rooftop equipment adds a readable second silhouette layer.
  addBox(world, 2.6, 0.8, 1.6, mat.metal, -4.2, 5.7, -4.5, { radius: 0.08, outline: true });
  addCylinder(world, 0.43, 0.43, 0.12, mat.darkMetal, -4.2, 6.06, -4.16, 20, [Math.PI / 2, 0, 0]);
  for (const x of [-4.65, -3.75]) addBox(world, 0.08, 0.42, 0.06, mat.metal, x, 5.7, -4.5, { radius: 0.01, cast: false });
  addBox(world, 1.2, 0.7, 1.2, mat.metal, 3.3, 5.65, -5.4, { radius: 0.06, outline: true });
  addCylinder(world, 0.34, 0.34, 0.1, mat.black, 3.3, 5.96, -5.4, 16);
  addCylinder(world, 0.1, 0.1, 1.15, mat.darkMetal, 5.2, 5.78, -6.2, 8);

  // A low neighboring apartment mass gives the alley and roofline real depth.
  const neighbor = new THREE.Group();
  neighbor.position.set(-11.7, 0, -8.9);
  world.add(neighbor);
  addBox(neighbor, 6.8, 7.4, 7.0, toon(0x4a5156), 0, 3.7, 0, { radius: 0.08, outline: true });
  addBox(neighbor, 7.1, 0.22, 7.3, mat.darkMetal, 0, 7.45, 0, { radius: 0.04 });
  for (let floor = 0; floor < 3; floor += 1) {
    for (let bay = 0; bay < 3; bay += 1) {
      const lit = (floor + bay) % 3 !== 0;
      addBox(neighbor, 1.08, 0.72, 0.06, lit ? mat.windowGlow : mat.darkMetal, -2.1 + bay * 2.1, 1.75 + floor * 2.0, 3.52, { radius: 0.015, cast: false });
      addBox(neighbor, 1.28, 0.08, 0.12, mat.cream, -2.1 + bay * 2.1, 2.17 + floor * 2.0, 3.56, { radius: 0.01, cast: false });
    }
  }
  addBox(neighbor, 0.9, 1.45, 0.08, mat.deepTeal, 2.2, 1.6, 3.53, { radius: 0.02 });
  addLabel(neighbor, makeCanvasTexture(512, 512, (ctx, width, height) => {
    ctx.fillStyle = '#1a4e58';
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = '#e9e0c1';
    ctx.lineWidth = 12;
    ctx.strokeRect(16, 16, width - 32, height - 32);
    ctx.fillStyle = '#f1ddb1';
    ctx.textAlign = 'center';
    ctx.font = '800 66px "Yu Gothic", sans-serif';
    ctx.fillText('住人募集中', width / 2, 190);
    ctx.font = '500 28px "Yu Gothic", sans-serif';
    ctx.fillText('静かな路地の小さな部屋', width / 2, 260);
    ctx.fillStyle = '#e87661';
    ctx.beginPath();
    ctx.arc(width / 2, 365, 72, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#fff3d0';
    ctx.font = '900 46px "Yu Gothic", sans-serif';
    ctx.fillText('空室', width / 2, 382);
  }), 0.78, 1.25, 2.2, 1.65, 3.58);

  // Door mat and a small welcome sticker at the entrance.
  addBox(world, 2.6, 0.035, 1.22, toon(0x355b58), 1.95, 0.32, 2.96, { radius: 0.03, cast: false });
  addBox(world, 2.18, 0.018, 0.92, toon(0x7b7b72), 1.95, 0.34, 2.96, { radius: 0.01, cast: false });
  addLabel(world, makeCanvasTexture(512, 192, (ctx, width, height) => {
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#233d43';
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = '#aac5b7';
    ctx.lineWidth = 6;
    ctx.strokeRect(10, 10, width - 20, height - 20);
    ctx.fillStyle = '#eadcae';
    ctx.textAlign = 'center';
    ctx.font = '800 54px "Yu Gothic", sans-serif';
    ctx.fillText('いらっしゃいませ', width / 2, 118);
  }), 1.55, 0.52, 1.95, 0.62, 2.17);

  // Umbrella rack beside the door.
  addBox(world, 1.42, 0.42, 0.55, mat.metal, -1.22, 0.48, 3.22, { radius: 0.05, outline: true });
  for (let i = 0; i < 4; i += 1) {
    const x = -1.72 + i * 0.33;
    addCylinder(world, 0.035, 0.035, 1.15, i % 2 ? mat.teal : mat.coral, x, 1.12, 3.22, 8);
    addCylinder(world, 0.045, 0.045, 0.28, mat.black, x, 1.78, 3.22, 8);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.095, 0.027, 6, 14, Math.PI), mat.black);
    handle.position.set(x + 0.07, 1.94, 3.22);
    handle.rotation.z = Math.PI / 2;
    world.add(handle);
  }

  // Vending machine with a bright printed front.
  const vending = new THREE.Group();
  vending.position.set(5.92, 0, 3.72);
  world.add(vending);
  addBox(vending, 1.36, 2.65, 0.82, toon(0xdeddd1), 0, 1.56, 0, { radius: 0.07, outline: true });
  addBox(vending, 1.2, 1.08, 0.03, new THREE.MeshBasicMaterial({ map: createVendingTexture(renderer), toneMapped: false }), 0, 1.82, 0.426, { radius: 0.01, cast: false });
  addBox(vending, 1.2, 0.23, 0.06, mat.deepTeal, 0, 0.63, 0.45, { radius: 0.02 });
  addBox(vending, 0.76, 0.12, 0.055, mat.black, 0, 0.69, 0.5, { radius: 0.015, cast: false });
  addBox(vending, 0.2, 0.025, 0.03, mat.coolGlow, 0.37, 1.44, 0.45, { radius: 0.005, cast: false });
  const vendingLight = new THREE.PointLight(0x8de1e4, 9, 5.5, 2);
  vendingLight.position.set(0, 1.7, 1.0);
  vending.add(vendingLight);
  addBox(world, 1.55, 0.08, 1.0, toon(0x313c42), 5.92, 0.19, 3.72, { radius: 0.02, cast: false });

  // Waste and recycling station.
  addBox(world, 1.1, 0.68, 0.64, mat.black, 6.1, 0.61, 2.78, { radius: 0.06, outline: true });
  const binColors = [0x4b94bd, 0xd6bd73, 0xe17a66];
  for (let index = 0; index < 3; index += 1) {
    addBox(world, 0.27, 0.44, 0.28, toon(binColors[index]), 5.77 + index * 0.33, 0.72, 2.82, { radius: 0.035 });
    addBox(world, 0.12, 0.035, 0.05, mat.black, 5.77 + index * 0.33, 0.94, 3.0, { radius: 0.005, cast: false });
  }
  addBox(world, 1.5, 0.06, 0.06, mat.teal, 6.1, 1.02, 2.49, { radius: 0.01, cast: false });
  addBox(world, 0.9, 0.025, 0.35, mat.metal, 6.1, 1.07, 2.78, { radius: 0.01, cast: false });

  // Bicycle assembled from two wheels, a readable frame and a small basket.
  const bicycle = new THREE.Group();
  bicycle.position.set(-5.45, 0.31, 4.65);
  bicycle.rotation.y = -0.2;
  bicycle.rotation.z = 0.08;
  world.add(bicycle);
  const frameMat = toon(0x4faaa0);
  for (const x of [-0.82, 0.82]) {
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.57, 0.035, 8, 24), mat.black);
    wheel.position.set(x, 0.58, 0);
    wheel.castShadow = true;
    bicycle.add(wheel);
    addCylinder(bicycle, 0.075, 0.075, 0.16, mat.metal, x, 0.58, 0, 12, [Math.PI / 2, 0, 0]);
    for (let spoke = 0; spoke < 6; spoke += 1) {
      const angle = spoke * Math.PI / 3;
      cylinderBetween(bicycle, new THREE.Vector3(x, 0.58, 0), new THREE.Vector3(x + Math.cos(angle) * 0.52, 0.58 + Math.sin(angle) * 0.52, 0.02), 0.007, mat.metal, 5);
    }
  }
  cylinderBetween(bicycle, new THREE.Vector3(-0.82, 0.58, 0), new THREE.Vector3(-0.12, 1.16, 0), 0.045, frameMat);
  cylinderBetween(bicycle, new THREE.Vector3(-0.12, 1.16, 0), new THREE.Vector3(0.5, 0.58, 0), 0.045, frameMat);
  cylinderBetween(bicycle, new THREE.Vector3(0.5, 0.58, 0), new THREE.Vector3(-0.48, 0.58, 0), 0.045, frameMat);
  cylinderBetween(bicycle, new THREE.Vector3(-0.48, 0.58, 0), new THREE.Vector3(-0.12, 1.16, 0), 0.045, frameMat);
  cylinderBetween(bicycle, new THREE.Vector3(-0.48, 0.58, 0), new THREE.Vector3(0.82, 0.58, 0), 0.035, frameMat);
  addBox(bicycle, 0.34, 0.08, 0.26, mat.black, -0.22, 1.28, 0, { radius: 0.04 });
  cylinderBetween(bicycle, new THREE.Vector3(0.82, 0.58, 0), new THREE.Vector3(0.82, 1.27, 0), 0.035, mat.metal);
  cylinderBetween(bicycle, new THREE.Vector3(0.82, 1.23, 0), new THREE.Vector3(0.53, 1.31, 0), 0.028, mat.metal);
  cylinderBetween(bicycle, new THREE.Vector3(0.82, 1.23, 0), new THREE.Vector3(1.11, 1.31, 0), 0.028, mat.metal);
  for (let i = 0; i < 6; i += 1) addBox(bicycle, 0.035, 0.26, 0.035, mat.metal, 1.05 + i * 0.09, 0.91, 0.15, { radius: 0.005, cast: false });
  addBox(bicycle, 0.56, 0.04, 0.36, mat.metal, 1.28, 1.05, 0.02, { radius: 0.01, cast: false });
  addBox(bicycle, 0.5, 0.04, 0.32, mat.metal, 1.28, 0.76, 0.02, { radius: 0.01, cast: false });

  // Street signs.
  addCylinder(world, 0.06, 0.06, 3.2, mat.metal, -12.05, 1.9, 6.8, 10);
  addBox(world, 1.43, 1.02, 0.09, mat.deepTeal, -12.05, 3.75, 6.8, { radius: 0.04, outline: true });
  addLabel(world, createStreetSignTexture(renderer), 1.28, 0.9, -12.05, 3.75, 6.87);
  addCylinder(world, 0.045, 0.045, 1.0, mat.metal, -10.35, 3.1, 6.85, 8);
  addCylinder(world, 0.31, 0.31, 0.06, mat.coral, -10.35, 3.62, 6.85, 28, [Math.PI / 2, 0, 0]);
  addLabel(world, makeCanvasTexture(512, 512, (ctx, width, height) => {
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#e9685f';
    ctx.beginPath();
    ctx.arc(width / 2, height / 2, 230, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#fff0d0';
    ctx.lineWidth = 22;
    ctx.beginPath();
    ctx.arc(width / 2, height / 2, 198, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = '#fff4d7';
    ctx.textAlign = 'center';
    ctx.font = '900 84px "Yu Gothic", sans-serif';
    ctx.fillText('止まれ', width / 2, 286);
  }), 0.58, 0.58, -10.35, 3.62, 6.89);

  // Street lamp with a curved arm and a warm pool of light.
  const lamp = new THREE.Group();
  lamp.position.set(9.28, 0, 6.32);
  world.add(lamp);
  addCylinder(lamp, 0.09, 0.13, 6.7, mat.darkMetal, 0, 3.35, 0, 12);
  addCylinder(lamp, 0.22, 0.22, 0.16, mat.metal, 0, 0.18, 0, 16);
  addTube(lamp, [
    new THREE.Vector3(0, 6.65, 0),
    new THREE.Vector3(-0.18, 7.17, 0),
    new THREE.Vector3(-0.85, 7.36, 0),
    new THREE.Vector3(-1.28, 7.17, 0),
  ], 0.075, mat.darkMetal, 18);
  addBox(lamp, 0.8, 0.15, 0.42, mat.black, -1.35, 7.03, 0, { radius: 0.08 });
  addBox(lamp, 0.55, 0.06, 0.3, mat.warmGlow, -1.35, 6.92, 0, { radius: 0.01, cast: false });
  addCylinder(lamp, 0.22, 0.31, 0.24, mat.darkMetal, -1.35, 7.19, 0, 12);
  const lampLight = new THREE.PointLight(0xffc67a, 54, 18, 2);
  lampLight.position.set(-1.35, 6.95, 0);
  lamp.add(lampLight);
  const lightPool = new THREE.Mesh(
    new THREE.PlaneGeometry(6.6, 5.4),
    new THREE.MeshBasicMaterial({ map: createRadialTexture('rgba(255,205,128,0.4)', 'rgba(255,205,128,0)'), transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  lightPool.rotation.x = -Math.PI / 2;
  lightPool.position.set(7.9, 0.17, 5.95);
  world.add(lightPool);

  // Curb-side guardrails.
  const railMat = toon(0x8ba6a2);
  const railPostGeo = new THREE.CylinderGeometry(0.06, 0.07, 0.92, 8);
  const railPosts = [];
  for (let x = -13.2; x <= -7.0; x += 1.15) railPosts.push({ x, y: 0.72, z: 7.32 });
  for (let x = 0.1; x <= 6.2; x += 1.15) railPosts.push({ x, y: 0.72, z: 7.32 });
  for (let z = -7.1; z <= 5.4; z += 1.2) railPosts.push({ x: 10.28, y: 0.72, z });
  addInstanced(world, railPostGeo, railMat, railPosts);
  addCylinder(world, 0.055, 0.055, 6.12, railMat, -10.1, 1.02, 7.32, 8, [0, 0, Math.PI / 2]);
  addCylinder(world, 0.055, 0.055, 6.1, railMat, 3.15, 1.02, 7.32, 8, [0, 0, Math.PI / 2]);
  addCylinder(world, 0.055, 0.055, 12.4, railMat, 10.28, 1.02, -0.85, 8, [Math.PI / 2, 0, 0]);
  addCylinder(world, 0.045, 0.045, 6.12, railMat, -10.1, 0.69, 7.32, 8, [0, 0, Math.PI / 2]);
  addCylinder(world, 0.045, 0.045, 6.1, railMat, 3.15, 0.69, 7.32, 8, [0, 0, Math.PI / 2]);
  addCylinder(world, 0.045, 0.045, 12.4, railMat, 10.28, 0.69, -0.85, 8, [Math.PI / 2, 0, 0]);

  // Utility poles, cross-arms, transformer drums and sagging wires.
  const poleLeft = new THREE.Vector3(-12.05, 0, -11.7);
  const poleRight = new THREE.Vector3(9.8, 0, -9.0);
  addCylinder(world, 0.15, 0.22, 8.5, toon(0x4b4a47), poleLeft.x, 4.2, poleLeft.z, 12);
  addCylinder(world, 0.15, 0.22, 8.9, toon(0x4b4a47), poleRight.x, 4.4, poleRight.z, 12);
  for (const [pole, y] of [[poleLeft, 7.58], [poleRight, 8.02]]) {
    addBox(world, 2.1, 0.14, 0.14, mat.darkMetal, pole.x, y, pole.z, { radius: 0.03 });
    for (const offset of [-0.82, 0, 0.82]) addCylinder(world, 0.07, 0.07, 0.22, mat.white, pole.x + offset, y + 0.15, pole.z, 8);
  }
  addCylinder(world, 0.34, 0.34, 0.92, mat.darkMetal, poleRight.x + 0.36, 6.68, poleRight.z, 12, [0, 0, Math.PI / 2]);
  addCylinder(world, 0.28, 0.28, 0.72, mat.darkMetal, poleRight.x + 0.34, 5.74, poleRight.z, 12, [0, 0, Math.PI / 2]);
  const wireMaterial = new THREE.MeshBasicMaterial({ color: 0x151a20 });
  for (let i = 0; i < 4; i += 1) {
    const yOffset = i * 0.14;
    addTube(world, [
      new THREE.Vector3(poleLeft.x - 0.78 + i * 0.52, 7.65 + yOffset, poleLeft.z),
      new THREE.Vector3((poleLeft.x + poleRight.x) / 2, 7.05 + yOffset, (poleLeft.z + poleRight.z) / 2),
      new THREE.Vector3(poleRight.x - 0.78 + i * 0.52, 8.1 + yOffset, poleRight.z),
    ], 0.022, wireMaterial, 40);
  }
  for (let i = 0; i < 3; i += 1) {
    addTube(world, [
      new THREE.Vector3(poleRight.x + 0.62, 8.06 + i * 0.12, poleRight.z),
      new THREE.Vector3(14.0, 7.2 + i * 0.1, -3.5),
      new THREE.Vector3(15.8, 6.7 + i * 0.08, 4.2),
    ], 0.018, wireMaterial, 30);
  }

  // Street tree and planting block.
  const tree = new THREE.Group();
  tree.position.set(-14.2, 0.15, 1.1);
  world.add(tree);
  addCylinder(tree, 0.16, 0.22, 3.8, mat.wood, 0, 1.9, 0, 9);
  const foliageMat = toon(0x365e58);
  for (const [x, y, z, scale] of [[-0.45, 3.8, 0, 1.1], [0.48, 4.15, 0.14, 1.0], [0.08, 4.65, -0.08, 0.8], [-0.62, 4.42, 0.22, 0.72], [0.25, 4.05, -0.48, 0.72]]) {
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1.05 * scale, 1), foliageMat);
    crown.position.set(x, y, z);
    crown.castShadow = true;
    tree.add(crown);
  }
  addBox(world, 1.6, 0.18, 1.6, toon(0x5e625b), -14.2, 0.23, 1.1, { radius: 0.04 });

  // Service clutter in the alley.
  addBox(world, 0.8, 0.55, 0.8, mat.deepTeal, 8.15, 0.54, -7.1, { radius: 0.05, outline: true });
  addBox(world, 0.7, 0.18, 0.7, mat.metal, 8.15, 0.9, -7.1, { radius: 0.02 });
  addBox(world, 0.65, 0.65, 0.65, toon(0xb78b58), 8.92, 0.6, -7.35, { radius: 0.04, outline: true });
  addCylinder(world, 0.12, 0.12, 1.9, mat.metal, 9.32, 1.18, -8.0, 10);
  addLabel(world, makeCanvasTexture(384, 512, (ctx, width, height) => {
    ctx.fillStyle = '#d9cfb4';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#364e51';
    ctx.fillRect(22, 22, width - 44, height - 44);
    ctx.fillStyle = '#f3e8c8';
    ctx.textAlign = 'center';
    ctx.font = '800 50px "Yu Gothic", sans-serif';
    ctx.fillText('路地', width / 2, 128);
    ctx.font = '600 26px "Yu Gothic", sans-serif';
    ctx.fillText('HOSHIMI ALLEY', width / 2, 182);
    ctx.strokeStyle = '#e26d5e';
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.moveTo(92, 320);
    ctx.lineTo(292, 320);
    ctx.moveTo(244, 272);
    ctx.lineTo(292, 320);
    ctx.lineTo(244, 368);
    ctx.stroke();
  }), 0.52, 0.7, 9.36, 2.1, -8.36, Math.PI / 2);

  // Painterly wet-road reflections under the warm shop and cool vending lights.
  const warmReflection = new THREE.Mesh(
    new THREE.PlaneGeometry(9.4, 7.2),
    new THREE.MeshBasicMaterial({ map: createReflectionTexture('rgba(255,176,92,0.32)'), transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
  );
  warmReflection.rotation.x = -Math.PI / 2;
  warmReflection.position.set(1.1, 0.1, 9.0);
  world.add(warmReflection);
  const coolReflection = new THREE.Mesh(
    new THREE.PlaneGeometry(4.8, 6.2),
    new THREE.MeshBasicMaterial({ map: createReflectionTexture('rgba(84,197,203,0.3)'), transparent: true, opacity: 0.62, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
  );
  coolReflection.rotation.x = -Math.PI / 2;
  coolReflection.position.set(8.0, 0.11, 7.2);
  world.add(coolReflection);
  const signReflection = new THREE.Mesh(
    new THREE.PlaneGeometry(5.3, 3.2),
    new THREE.MeshBasicMaterial({ map: createReflectionTexture('rgba(231,105,91,0.25)'), transparent: true, opacity: 0.66, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
  );
  signReflection.rotation.x = -Math.PI / 2;
  signReflection.position.set(-5.4, 0.25, 5.45);
  world.add(signReflection);

  // Puddles and reflective rims.
  const puddleMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x314b60,
    roughness: 0.04,
    metalness: 0.4,
    transparent: true,
    opacity: 0.48,
    depthWrite: false,
  });
  const puddleTransforms = [
    [-3.0, 0.11, 10.1, 2.3, 0.75, -0.15],
    [2.4, 0.11, 9.2, 1.3, 0.5, 0.35],
    [6.4, 0.11, 10.75, 2.0, 0.7, 0.1],
    [12.6, 0.11, 5.2, 0.8, 2.1, 0.0],
    [-8.3, 0.11, 11.4, 1.2, 0.42, -0.15],
  ];
  for (const [x, y, z, sx, sz, rotation] of puddleTransforms) {
    const puddle = new THREE.Mesh(new THREE.CircleGeometry(0.63, 28), puddleMaterial);
    puddle.rotation.x = -Math.PI / 2;
    puddle.rotation.z = rotation;
    puddle.scale.set(sx, sz, 1);
    puddle.position.set(x, y, z);
    world.add(puddle);
    const rim = new THREE.Mesh(new THREE.RingGeometry(0.61, 0.635, 32), new THREE.MeshBasicMaterial({ color: 0x9eb8c4, transparent: true, opacity: 0.16, depthWrite: false }));
    rim.rotation.x = -Math.PI / 2;
    rim.rotation.z = rotation;
    rim.scale.set(sx, sz, 1);
    rim.position.set(x, y + 0.004, z);
    world.add(rim);
  }

  const rippleGroup = new THREE.Group();
  world.add(rippleGroup);
  const rippleMaterials = [];
  const rippleData = [];
  const ripplePositions = [
    [-3.0, 0.125, 10.1], [2.4, 0.125, 9.2], [6.4, 0.125, 10.75], [12.6, 0.125, 5.2],
    [-8.3, 0.125, 11.4], [8.0, 0.125, 12.2], [-1.2, 0.125, 11.8], [4.6, 0.125, 8.2],
  ];
  for (let i = 0; i < 18; i += 1) {
    const point = ripplePositions[i % ripplePositions.length];
    const material = new THREE.MeshBasicMaterial({ color: 0xb2d5db, transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.305, 24), material);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(point[0] + (i % 3 - 1) * 0.52, point[1], point[2] + (i % 4 - 1) * 0.4);
    rippleGroup.add(ring);
    rippleMaterials.push(material);
    rippleData.push({ mesh: ring, phase: (i * 0.137) % 1, speed: 0.22 + (i % 4) * 0.025 });
  }

  // Suspended rain streaks.
  const rainCount = reducedMotion ? 260 : 560;
  const random = seededRandom(802);
  const rainPositions = new Float32Array(rainCount * 6);
  const rainState = [];
  for (let i = 0; i < rainCount; i += 1) {
    rainState.push({
      x: (random() - 0.5) * 35,
      y: random() * 18,
      z: (random() - 0.5) * 33,
      speed: 8.5 + random() * 7.5,
      length: 0.28 + random() * 0.65,
    });
  }
  const rainGeometry = new THREE.BufferGeometry();
  rainGeometry.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3));
  rainGeometry.attributes.position.setUsage(THREE.DynamicDrawUsage);
  const rainMaterial = new THREE.LineBasicMaterial({ color: 0xa7c9dc, transparent: true, opacity: 0.34, depthWrite: false, blending: THREE.AdditiveBlending });
  const rain = new THREE.LineSegments(rainGeometry, rainMaterial);
  rain.frustumCulled = false;
  scene.add(rain);

  // A subtle drifting mist layer near the base.
  const mistPositions = new Float32Array(180 * 3);
  for (let i = 0; i < 180; i += 1) {
    mistPositions[i * 3] = (random() - 0.5) * 28;
    mistPositions[i * 3 + 1] = 0.25 + random() * 3.2;
    mistPositions[i * 3 + 2] = (random() - 0.5) * 28;
  }
  const mistGeometry = new THREE.BufferGeometry();
  mistGeometry.setAttribute('position', new THREE.BufferAttribute(mistPositions, 3));
  const mist = new THREE.Points(mistGeometry, new THREE.PointsMaterial({ color: 0x78a5bc, size: 0.055, transparent: true, opacity: 0.28, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
  scene.add(mist);

  // Cool rainy ambience balanced by the warm shop interior.
  const hemisphere = new THREE.HemisphereLight(0x7188b2, 0x111722, 0.8);
  scene.add(hemisphere);
  const moon = new THREE.DirectionalLight(0x8fa6d8, 2.2);
  moon.position.set(16, 28, 10);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  moon.shadow.camera.left = -26;
  moon.shadow.camera.right = 26;
  moon.shadow.camera.top = 26;
  moon.shadow.camera.bottom = -26;
  moon.shadow.camera.near = 1;
  moon.shadow.camera.far = 60;
  moon.shadow.bias = -0.0004;
  scene.add(moon);
  const coolFill = new THREE.DirectionalLight(0x486a93, 0.7);
  coolFill.position.set(-20, 12, -16);
  scene.add(coolFill);
  const storeGlow = new THREE.PointLight(0xffc27f, 30, 15, 2);
  storeGlow.position.set(0, 4.6, 4.4);
  scene.add(storeGlow);
  const shopInteriorFill = new THREE.PointLight(0xffd69b, 22, 10, 2);
  shopInteriorFill.position.set(0, 3.1, -3.5);
  scene.add(shopInteriorFill);

  // Post-processing gives signs and lit windows a restrained neon bloom.
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.58, 0.58, 0.72);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const vignettePass = new ShaderPass({
    uniforms: { tDiffuse: { value: null } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `varying vec2 vUv; uniform sampler2D tDiffuse; void main(){ vec4 color = texture2D(tDiffuse, vUv); float d = distance(vUv, vec2(0.5)); color.rgb *= 1.0 - smoothstep(0.38, 0.84, d) * 0.24; gl_FragColor = color; }`,
  });
  composer.addPass(vignettePass);

  const clock = new THREE.Clock();
  let elapsed = 0;
  let disposed = false;
  let firstFrame = true;

  function resize() {
    const width = container.clientWidth || 1;
    const height = container.clientHeight || 1;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    composer.setSize(width, height);
  }

  function updateRain(delta) {
    const positions = rainGeometry.attributes.position.array;
    for (let i = 0; i < rainState.length; i += 1) {
      const drop = rainState[i];
      drop.y -= drop.speed * delta;
      drop.x += delta * 0.34;
      if (drop.y < -0.15) {
        drop.y = 16.5 + random() * 3.5;
        drop.x = (random() - 0.5) * 35;
        drop.z = (random() - 0.5) * 33;
      }
      const base = i * 6;
      positions[base] = drop.x;
      positions[base + 1] = drop.y;
      positions[base + 2] = drop.z;
      positions[base + 3] = drop.x - 0.055;
      positions[base + 4] = drop.y - drop.length;
      positions[base + 5] = drop.z - 0.035;
    }
    rainGeometry.attributes.position.needsUpdate = true;
  }

  updateRain(0);

  function animate() {
    if (disposed) return;
    const delta = Math.min(clock.getDelta(), 0.04);
    elapsed += delta;
    controls.update();
    if (!reducedMotion) updateRain(delta);
    for (let i = 0; i < rippleData.length; i += 1) {
      const ripple = rippleData[i];
      const phase = (ripple.phase + elapsed * ripple.speed) % 1;
      const scale = 0.58 + phase * 2.8;
      ripple.mesh.scale.setScalar(scale);
      rippleMaterials[i].opacity = (1 - phase) * 0.24;
    }
    storeGlow.intensity = 30 + Math.sin(elapsed * 1.6) * 1.8;
    alleyLight.intensity = 10 + Math.sin(elapsed * 2.1 + 1.2) * 0.8;
    mist.position.y = Math.sin(elapsed * 0.18) * 0.08;
    composer.render();
    if (firstFrame) {
      firstFrame = false;
      container.dataset.ready = 'true';
      container.dataset.drawCalls = String(renderer.info.render.calls);
      container.dataset.triangles = String(renderer.info.render.triangles);
      container.dataset.rainDrops = String(rainCount);
      let objects = 0;
      world.traverse((node) => { if (node.isMesh) objects += 1; });
      container.dataset.objects = String(objects);
    }
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  resize();
  renderer.setAnimationLoop(animate);
  container.dataset.ready = 'false';

  return {
    getDiagnostics() {
      return {
        ready: container.dataset.ready === 'true',
        rainDrops: rainCount,
        drawCalls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        camera: camera.position.toArray(),
        target: controls.target.toArray(),
      };
    },
    dispose() {
      disposed = true;
      renderer.setAnimationLoop(null);
      resizeObserver.disconnect();
      controls.dispose();
      composer.dispose();
      scene.traverse((object) => {
        if (object.geometry) object.geometry.dispose();
        if (object.material) {
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => material.dispose());
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
