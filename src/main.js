import * as THREE from 'three';
import { Pipeline } from './gfx/pipeline.js';
import { buildWorld } from './world/world.js';
import { ANVIL } from './world/anvil.js';
import { createForging } from './game/forging.js';
import { createAudio } from './audio/audio.js';
import { createHud } from './ui/hud.js';

const params = new URLSearchParams(location.search);
const list = (k) => (params.get(k) || '').split(',').filter(Boolean);
const DEBUG_VIEWS = { ao: 1, vol: 2, bloom: 3, depth: 4, trans: 6 };
const rad = THREE.MathUtils.degToRad;

const canvas = document.getElementById('view');
const hud = params.has('nohud') ? null : createHud();

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.autoClear = false;
renderer.toneMapping = THREE.NoToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate = false;
renderer.info.autoReset = false;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.05, 80);
camera.rotation.order = 'YXZ';
scene.add(camera);

const pipeline = new Pipeline(renderer, list('off'));
pipeline.debug = DEBUG_VIEWS[params.get('debug')] || 0;

const app = {
  renderer, scene, camera, pipeline, params,
  time: { t: 0, dt: 1 / 60, frame: 0 },
  look: { yaw: rad(-5), pitch: rad(-25) },
  shake: new THREE.Vector3(),
  frame: { time: 0, sunColor: new THREE.Color(), volLights: [] },
  updaters: [],
  renderScale: Number(params.get('scale')) || 1,
};

function resize() {
  const cw = canvas.clientWidth || window.innerWidth || 1280;
  const ch = canvas.clientHeight || window.innerHeight || 720;
  let s = Math.min(window.devicePixelRatio || 1, 2) * app.renderScale;
  const maxPixels = 3.6e6;
  const px = cw * ch * s * s;
  if (px > maxPixels) s *= Math.sqrt(maxPixels / px);
  const w = Math.max(2, Math.round(cw * s));
  const h = Math.max(2, Math.round(ch * s));
  if (renderer.domElement.width !== w || renderer.domElement.height !== h) {
    renderer.setSize(w, h, false);
    pipeline.setSize(w, h);
  }
  camera.aspect = cw / ch;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(canvas);
window.addEventListener('resize', resize);
resize();

const world = buildWorld(app);
app.world = world;
const audio = createAudio();
const forging = createForging(app, {
  rig: world.arms, blade: world.blade, sparks: world.sparks, audio, fireUniforms: world.fire.uniforms,
  hotLight: world.hotLight, flashLight: world.flashLight, volHot: world.volHot, faceY: ANVIL.faceY, hud,
});
app.forging = forging;

function update(dt) {
  const T = app.time;
  T.dt = dt;
  T.t += dt;
  T.frame++;
  for (const fn of app.updaters) fn(dt, T.t);
  forging.update(dt, T.t);
  audio.update(dt);
  const breathe = Math.sin(T.t * 0.85) * 0.0022;
  camera.rotation.set(app.look.pitch + app.shake.x + breathe, app.look.yaw + app.shake.y, app.shake.z);
  camera.updateMatrixWorld();
  app.frame.time = T.t;
}

function render() {
  resize();
  renderer.info.reset();
  pipeline.render(scene, camera, app.frame);
}

let running = !params.has('manual');
let last = performance.now();
let first = true;
function loop(now) {
  requestAnimationFrame(loop);
  if (!running) return;
  const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
  last = now;
  update(dt);
  render();
  if (first) { first = false; hud?.ready(); }
}
requestAnimationFrame(loop);

// ---------------------------------------------------------------- 입력
let playing = false;
let locked = false;
let lockFailed = false;
const base = { yaw: app.look.yaw, pitch: app.look.pitch };

function setPlaying(on) {
  playing = on;
  hud?.ready();
  hud?.show(on);
}
function begin() {
  audio.start();
  setPlaying(true);
  if (!lockFailed && canvas.requestPointerLock) {
    try {
      const r = canvas.requestPointerLock();
      if (r && r.catch) r.catch(() => { lockFailed = true; });
    } catch { lockFailed = true; }
  } else lockFailed = true;
}
hud?.veil.addEventListener('click', begin);
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas;
  if (!locked && playing && !lockFailed) setPlaying(false);
});
document.addEventListener('pointerlockerror', () => { lockFailed = true; });
document.addEventListener('mousemove', (e) => {
  if (!playing) return;
  if (locked) {
    app.look.yaw -= e.movementX * 0.0021;
    app.look.pitch = THREE.MathUtils.clamp(app.look.pitch - e.movementY * 0.0021, -1.3, 1.2);
  } else if (lockFailed) {
    // 포인터 잠금을 쓸 수 없는 환경: 화면 안의 마우스 위치로 시선을 정한다.
    const nx = (e.clientX / window.innerWidth) * 2 - 1, ny = (e.clientY / window.innerHeight) * 2 - 1;
    app.look.yaw = base.yaw - nx * 0.95;
    app.look.pitch = THREE.MathUtils.clamp(base.pitch - ny * 0.62, -1.3, 1.2);
  }
});
canvas.addEventListener('pointerdown', (e) => {
  if (!playing || e.button !== 0) return;
  if (!locked && !lockFailed) { begin(); return; }
  forging.strike();
});
window.addEventListener('keydown', (e) => {
  if (!playing || e.repeat) return;
  if (e.code === 'KeyR') forging.reheat();
  else if (e.code === 'KeyN') forging.newBillet();
  else if (e.code === 'Escape' && lockFailed) setPlaying(false);
});

// ---------------------------------------------------------------- 자동 점검용 디버그 API
window.__forge = {
  app,
  THREE,
  pause() { running = false; },
  resume() { running = true; last = performance.now(); },
  step(n = 1, dt = 1 / 60) { for (let i = 0; i < n; i++) update(dt); render(); return +app.time.t.toFixed(3); },
  play() { lockFailed = true; setPlaying(true); },
  look(yawDeg, pitchDeg = 0) { app.look.yaw = rad(yawDeg); app.look.pitch = rad(pitchDeg); },
  view(name) { const v = world.views?.[name]; if (!v) return Object.keys(world.views || {}); camera.position.fromArray(v.pos); this.look(v.yaw, v.pitch); camera.fov = v.fov ?? 62; camera.updateProjectionMatrix(); return name; },
  debug(name) { pipeline.debug = DEBUG_VIEWS[name] || 0; },
  toggle(name, on) { if (on) pipeline.off.delete(name); else pipeline.off.add(name); },
  set(key, value) { pipeline.settings[key] = value; },
  strike(s) { if (s != null) { forging.state.s = s; forging.state.sAim = s; } return forging.strike(); },
  reheat() { return forging.reheat(); },
  stats() { return { ...world.blade.stats(), strikes: forging.state.strikes, phase: forging.state.phase, sparks: world.sparks.alive }; },
  // 프레임 시간 측정: n프레임을 연속 렌더하고 GPU 완료까지 기다린 평균(ms)
  bench(n = 30) {
    const gl = renderer.getContext();
    const px = new Uint8Array(4);
    const t0 = performance.now();
    for (let i = 0; i < n; i++) { update(1 / 60); render(); }
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const ms = (performance.now() - t0) / n;
    return { ms: +ms.toFixed(2), fps: +(1000 / ms).toFixed(1), size: [renderer.domElement.width, renderer.domElement.height], calls: renderer.info.render.calls, tris: renderer.info.render.triangles };
  },
};
if (params.get('view')) window.__forge.view(params.get('view'));
if (params.has('play')) window.__forge.play();
