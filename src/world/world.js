// 대장간 장면 조립: 재질, 지오메트리, 조명, 하늘, 환경 반사, 효과.
import * as THREE from 'three';
import { MaterialLibrary } from '../tex/bake.js';
import { Builder } from '../geo/builder.js';
import { buildRoom, ROOM, WINDOW } from './room.js';
import { buildAnvil, ANVIL } from './anvil.js';
import { buildForge, FORGE } from './forge.js';
import { buildProps, lantern, chain } from './props.js';
import { createFire } from '../fx/fire.js';
import { createDust } from '../fx/dust.js';
import { createSparks } from '../fx/sparks.js';
import { createBlade } from './blade.js';
import { buildArms } from './hands.js';

export const SUN_DIR = new THREE.Vector3(0.38, 0.42, -0.82).normalize(); // 장면 -> 태양

function makeSky() {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uSunDir: { value: SUN_DIR } },
    vertexShader: /* glsl */ `
varying vec3 vDir;
void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
uniform vec3 uSunDir;
varying vec3 vDir;
float h1(float x) { return fract(sin(x * 127.1) * 43758.5453); }
float n1(float x) { float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(h1(i), h1(i + 1.0), f); }
void main() {
  vec3 d = normalize(vDir);
  float az = atan(d.x, -d.z);
  float hills = 0.02 + 0.03 * sin(az * 3.0 + 1.0) + 0.018 * sin(az * 7.0 + 0.5);
  float trees = hills + 0.05 + 0.05 * n1(az * 9.0) + 0.025 * n1(az * 31.0) + 0.012 * n1(az * 90.0);
  vec3 sky = mix(vec3(1.0, 0.9, 0.74), vec3(0.3, 0.5, 0.95), smoothstep(-0.03, 0.55, d.y)) * 3.6;
  float s = max(dot(d, uSunDir), 0.0);
  sky += vec3(1.0, 0.82, 0.55) * (pow(s, 6.0) * 4.0 + pow(s, 60.0) * 14.0 + pow(s, 1200.0) * 400.0);
  vec3 col = sky;
  vec3 treeC = mix(vec3(0.05, 0.09, 0.035), vec3(0.2, 0.26, 0.09), n1(az * 47.0 + d.y * 60.0)) * 2.4;
  col = mix(col, mix(treeC, sky, 0.25), smoothstep(0.004, -0.004, d.y - trees));
  vec3 grass = vec3(0.3, 0.36, 0.14) * 2.6;
  col = mix(col, grass, smoothstep(0.003, -0.003, d.y - hills));
  col = mix(col, vec3(0.32, 0.27, 0.2) * 2.2, smoothstep(-0.02, -0.3, d.y));
  gl_FragColor = vec4(col, 1.0);
}`,
    side: THREE.BackSide,
    depthWrite: true,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(34, 48, 24), mat);
  m.position.set(0, 1.6, 0);
  m.layers.set(2);
  m.frustumCulled = false;
  m.name = 'sky';
  return m;
}

export function buildWorld(app) {
  const { scene, camera, pipeline, renderer } = app;
  const lib = new MaterialLibrary(renderer);
  const b = new Builder(lib, 20261111);
  const R = ROOM;

  b.material('hoodIron', lib.get('ironRust', { side: THREE.DoubleSide }, 'hoodIron'));
  const fire = createFire(app, lib, FORGE);
  b.material('ember', fire.emberMaterial);

  buildRoom(b);
  buildAnvil(b);
  buildForge(b);
  const props = buildProps(b);
  // 오른쪽 들보에 매단 등불
  chain(b, [1.7, R.H - 0.25, 0.75], [1.7, 2.33, 0.75]);
  const lanternPos = lantern(b, [1.7, 2.06, 0.75]);

  const statics = b.build('static');
  scene.add(statics);
  scene.add(fire.group);
  scene.add(makeSky());

  // ---- 물(담금질 통, 들통)
  const waterMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.012, 0.014, 0.013), roughness: 0.035, metalness: 0.0 });
  for (const w of [props.quench, props.bucket]) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(w.r, 32), waterMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(w.x, w.waterY, w.z);
    m.receiveShadow = true;
    scene.add(m);
  }

  // ---- 칼날과 1인칭 팔, 불꽃
  const blade = createBlade(lib);
  const arms = buildArms(app, lib, blade, ANVIL.faceY);
  const sparks = createSparks(app, { faceY: ANVIL.faceY });
  scene.add(sparks.mesh);

  // ---- 조명
  const sunCol = new THREE.Color(1.0, 0.9, 0.74);
  const sun = new THREE.DirectionalLight(sunCol, 24);
  const center = new THREE.Vector3(0, 2, 0.3);
  sun.position.copy(center).addScaledVector(SUN_DIR, 17);
  sun.target.position.copy(center);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  Object.assign(sun.shadow.camera, { left: -6.8, right: 6.8, top: 6.8, bottom: -6.8, near: 1, far: 36 });
  sun.shadow.bias = -0.0002;
  sun.shadow.normalBias = 0.012;
  sun.shadow.radius = 2.2;
  scene.add(sun, sun.target);

  // 창으로 드는 하늘빛(그림자 없는 넓은 스폿)
  const skyFill = new THREE.SpotLight(new THREE.Color(0.55, 0.7, 1.0), 26, 9, 1.05, 1, 2);
  skyFill.position.set((WINDOW.x0 + WINDOW.x1) / 2, (WINDOW.y0 + WINDOW.y1) / 2, R.z0 - 0.15);
  skyFill.target.position.set(0.2, 0.7, 0.4);
  scene.add(skyFill, skyFill.target);

  // 플레이어 뒤쪽 문으로 드는 하늘빛(형태를 드러내는 차가운 보조광)
  const doorFill = new THREE.SpotLight(new THREE.Color(0.62, 0.75, 1.0), 110, 12, 1.2, 1, 2);
  doorFill.position.set(0.6, 1.9, R.z1 - 0.1);
  doorFill.target.position.set(-0.3, 0.6, -1.6);
  scene.add(doorFill, doorFill.target);

  const fireCol = new THREE.Color(1.0, 0.47, 0.17);
  const fireLight = new THREE.PointLight(fireCol, 30, 12, 2);
  fireLight.position.copy(FORGE.fire).add(new THREE.Vector3(0, 0.14, 0.04));
  fireLight.castShadow = true;
  fireLight.shadow.mapSize.set(1024, 1024);
  fireLight.shadow.camera.near = 0.06;
  fireLight.shadow.camera.far = 12;
  fireLight.shadow.bias = -0.002;
  fireLight.shadow.normalBias = 0.03;
  fireLight.shadow.radius = 5;
  scene.add(fireLight);
  const firePos0 = fireLight.position.clone();

  // 간접광 흉내: 화덕 앞 바닥의 따뜻한 반사, 햇빛이 떨어진 바닥의 반사
  const bounceWarm = new THREE.PointLight(new THREE.Color(1.0, 0.5, 0.22), 1.6, 5, 2);
  bounceWarm.position.set(-1.3, 0.35, -1.25);
  const bounceSun = new THREE.PointLight(new THREE.Color(1.0, 0.92, 0.8), 2.6, 6, 2);
  bounceSun.position.set(0.25, 0.3, 0.2);
  const hotLight = new THREE.PointLight(new THREE.Color(1.0, 0.4, 0.1), 0.5, 2.2, 2);
  hotLight.position.copy(arms.pointOn(0.6, 0.07));
  const flashLight = new THREE.PointLight(new THREE.Color(1.0, 0.62, 0.28), 0, 3.5, 2);
  scene.add(flashLight);
  const lanternLight = new THREE.PointLight(new THREE.Color(1.0, 0.6, 0.25), 2.2, 6, 2);
  lanternLight.position.copy(lanternPos);
  // 문 쪽(플레이어 뒤) 벽이 완전히 검게 묻히지 않도록 약한 하늘빛
  const doorGlow = new THREE.PointLight(new THREE.Color(0.6, 0.72, 1.0), 5, 7, 2);
  doorGlow.position.set(0.2, 2.3, 2.5);
  scene.add(bounceWarm, bounceSun, hotLight, lanternLight, doorGlow);
  scene.add(new THREE.HemisphereLight(new THREE.Color(0.3, 0.36, 0.5), new THREE.Color(0.14, 0.1, 0.07), 0.5));
  // 등불 불꽃
  const flame = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(14, 7.5, 2.2) }));
  flame.scale.set(1, 1.8, 1);
  flame.position.copy(lanternPos).add(new THREE.Vector3(0, -0.01, 0));
  scene.add(flame);

  // ---- 볼류메트릭 설정
  pipeline.setSun(SUN_DIR, center, 6.8, 17);
  app.frame.sunColor.copy(sunCol).multiplyScalar(11);
  const volFire = { position: fireLight.position, color: fireCol.clone(), soft: 0.1 };
  const volLantern = { position: lanternLight.position, color: new THREE.Color(1.0, 0.6, 0.25).multiplyScalar(0.05), soft: 0.03 };
  const volHot = { position: hotLight.position, color: new THREE.Color(1.0, 0.4, 0.1).multiplyScalar(0.03), soft: 0.03 };
  app.frame.volLights = [volFire, volLantern, volHot];

  // ---- 먼지
  const dust = createDust(app, {
    min: new THREE.Vector3(R.x0, 0.05, R.z0), max: new THREE.Vector3(R.x1, 3.6, R.z1),
    firePos: fireLight.position, fireColor: fireCol.clone().multiplyScalar(0.06),
  });
  dust.uniforms.uSunColor.value.copy(sunCol).multiplyScalar(2.2);
  scene.add(dust.points);

  // ---- 환경 반사(장면을 한 번 큐브맵으로 찍어 PMREM)
  const cubeRT = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType });
  const cubeCam = new THREE.CubeCamera(0.08, 70, cubeRT);
  cubeCam.position.set(0.35, 1.3, -0.55);
  cubeCam.layers.enable(2);
  scene.add(cubeCam);
  const pmrem = new THREE.PMREMGenerator(renderer);
  let envTex = null;
  function captureEnv() {
    const autoClear = renderer.autoClear;
    renderer.autoClear = true;
    renderer.shadowMap.needsUpdate = true;
    sun.shadow.needsUpdate = true;
    const hidden = [arms.armR, arms.armL];
    hidden.forEach((o) => (o.visible = false));
    scene.environment = null;
    cubeCam.update(renderer, scene);
    hidden.forEach((o) => (o.visible = true));
    envTex?.dispose();
    envTex = pmrem.fromCubemap(cubeRT.texture).texture;
    scene.environment = envTex;
    scene.environmentIntensity = 1.1;
    renderer.autoClear = autoClear;
    renderer.setRenderTarget(null);
  }
  captureEnv();
  // 팔과 망치가 햇빛 속에서 그림자를 드리우도록 태양 그림자도 매 프레임 갱신한다.
  sun.shadow.autoUpdate = !app.params.has('staticsun');
  sun.shadow.needsUpdate = true;

  // ---- 매 프레임 갱신
  const fnoise = (t) => Math.sin(t * 7.3) * 0.5 + Math.sin(t * 13.7 + 1.3) * 0.3 + Math.sin(t * 23.1 + 2.1) * 0.2;
  app.updaters.push((dt, t) => {
    const fl = 0.5 + 0.5 * fnoise(t);
    const k = 0.86 + 0.2 * fl;
    fireLight.intensity = 30 * k;
    fireLight.position.set(firePos0.x + Math.sin(t * 9.1) * 0.012, firePos0.y + Math.sin(t * 11.7) * 0.012, firePos0.z + Math.cos(t * 7.7) * 0.012);
    bounceWarm.intensity = 1.6 * k;
    volFire.color.copy(fireCol).multiplyScalar(0.55 * k);
    lanternLight.intensity = 2.2 * (0.9 + 0.1 * Math.sin(t * 17.0) * Math.sin(t * 5.3));
    fire.update(dt, t, camera);
    dust.update(t, camera);
  });

  camera.position.set(-0.12, 1.6, -0.02);
  return {
    lib, statics, fire, sun, fireLight, captureEnv, blade, arms, sparks, hotLight, flashLight, volHot,
    views: {
      main: { pos: [-0.12, 1.6, -0.02], yaw: -5, pitch: -25 },
      hands: { pos: [-0.12, 1.6, -0.02], yaw: -6, pitch: -44, fov: 55 },
      handR: { pos: [-0.05, 1.32, -0.42], yaw: -28, pitch: -42, fov: 40 },
      handL: { pos: [-0.2, 1.3, -0.3], yaw: 35, pitch: -45, fov: 40 },
      look: { pos: [-0.12, 1.6, -0.02], yaw: -6, pitch: -9 },
      wide: { pos: [0.5, 1.7, 2.6], yaw: 6, pitch: -8, fov: 62 },
      forge: { pos: [-0.12, 1.6, -0.02], yaw: 38, pitch: -10 },
      window: { pos: [-0.12, 1.6, -0.02], yaw: -32, pitch: -4 },
      up: { pos: [-0.12, 1.6, -0.02], yaw: 0, pitch: 32 },
      back: { pos: [-0.12, 1.6, -0.02], yaw: 180, pitch: -6 },
      right: { pos: [-0.12, 1.6, -0.02], yaw: -90, pitch: -10 },
      left: { pos: [-0.12, 1.6, -0.02], yaw: 90, pitch: -10 },
      anvil: { pos: [0.1, 1.45, -0.2], yaw: 4, pitch: -38, fov: 45 },
      floor: { pos: [0.8, 1.3, 0.7], yaw: -18, pitch: -52, fov: 50 },
      wall: { pos: [0.3, 1.6, -1.5], yaw: 0, pitch: 4, fov: 45 },
      sidewall: { pos: [-1.2, 1.5, 0.9], yaw: 80, pitch: -4, fov: 55 },
      hearth: { pos: [-0.9, 1.5, -0.9], yaw: 28, pitch: -22, fov: 50 },
    },
  };
}
