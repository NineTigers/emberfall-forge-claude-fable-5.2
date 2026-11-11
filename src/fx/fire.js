// 화덕의 불: 달아오른 석탄(재질 훅), 불꽃(빌보드), 솟는 불티(포인트).
import * as THREE from 'three';

const NOISE2 = /* glsl */ `
float fhash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float fnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(fhash(i), fhash(i + vec2(1.0, 0.0)), u.x), mix(fhash(i + vec2(0.0, 1.0)), fhash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float ffbm(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++) { s += a * fnoise(p); p = p * 2.03 + vec2(13.1, 7.7); a *= 0.5; }
  return s / 0.9375;
}`;

const NOISE3 = /* glsl */ `
float ehash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float enoise(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(ehash(i), ehash(i + vec3(1, 0, 0)), f.x), mix(ehash(i + vec3(0, 1, 0)), ehash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(ehash(i + vec3(0, 0, 1)), ehash(i + vec3(1, 0, 1)), f.x), mix(ehash(i + vec3(0, 1, 1)), ehash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}`;

export function createFire(app, lib, F) {
  const { pipeline } = app;
  const U = {
    uTime: { value: 0 },
    uFirePos: { value: F.fire.clone() },
    uFireR: { value: new THREE.Vector2((F.pot.x1 - F.pot.x0) / 2, (F.pot.z1 - F.pot.z0) / 2) },
    uBlast: { value: 1 },
    uEmberGain: { value: 26 },
    uDepth: { value: pipeline.depthRT.texture },
    uRes: { value: pipeline.size },
    uScale: { value: 1000 },
  };

  // ---- 석탄: 화구 중심에 가까울수록, 틈새일수록 달아오른다.
  const ember = lib.get('coal', {}, 'ember');
  const prev = ember.onBeforeCompile;
  ember.onBeforeCompile = (shader, renderer) => {
    prev?.call(ember, shader, renderer);
    Object.assign(shader.uniforms, { uTime: U.uTime, uFirePos: U.uFirePos, uFireR: U.uFireR, uBlast: U.uBlast, uEmberGain: U.uEmberGain });
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uTime; uniform vec3 uFirePos; uniform vec2 uFireR; uniform float uBlast; uniform float uEmberGain;
${NOISE3}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{
  vec3 q = vWPos - uFirePos;
  float d = length(vec3(q.x / uFireR.x, q.y / 0.17, q.z / uFireR.y));
  vec3 nW = inverseTransformDirection(normal, viewMatrix);
  float n1 = enoise(vWPos * 21.0 + vec3(0.0, uTime * 0.3, 0.0));
  float n2 = enoise(vWPos * 55.0 - vec3(uTime * 0.25));
  float heat = smoothstep(1.02, 0.08, d);
  heat *= 0.45 + 0.85 * n1;
  heat *= mix(1.35, 0.42, smoothstep(-0.35, 0.95, nW.y));
  heat *= 0.9 + 0.25 * n2;
  heat = clamp(heat * uBlast, 0.0, 1.5);
  vec3 glow = vec3(pow(heat, 1.35), pow(heat, 2.7) * 0.52, pow(heat, 6.0) * 0.16);
  totalEmissiveRadiance += glow * uEmberGain;
  float ash = smoothstep(0.45, 0.95, nW.y) * smoothstep(1.25, 0.55, d) * smoothstep(0.35, 0.7, n2);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.34, 0.32, 0.3), ash * 0.7);
}`);
  };
  const key = ember.customProgramCacheKey.bind(ember);
  ember.customProgramCacheKey = () => 'ember|' + key();

  const group = new THREE.Group();
  group.name = 'fire';

  // ---- 불꽃
  const flameMat = new THREE.ShaderMaterial({
    uniforms: { uTime: U.uTime, uDepth: U.uDepth, uRes: U.uRes, uGain: { value: 7.5 }, uBlast: U.uBlast },
    vertexShader: /* glsl */ `
attribute float aSeed;
varying vec2 vUv; varying float vSeed; varying float vViewZ;
void main() {
  vUv = uv; vSeed = aSeed;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vViewZ = -mv.z;
  gl_Position = projectionMatrix * mv;
}`,
    fragmentShader: /* glsl */ `
uniform float uTime; uniform float uGain; uniform float uBlast; uniform sampler2D uDepth; uniform vec2 uRes;
varying vec2 vUv; varying float vSeed; varying float vViewZ;
${NOISE2}
void main() {
  float t = uTime * (1.0 + vSeed * 0.4);
  vec2 p = vec2(vUv.x * 2.4 + vSeed * 31.0, vUv.y * 1.9 - t * 1.85);
  float n = ffbm(p);
  float n2 = ffbm(p * 2.3 + vec2(7.0, -t * 1.2));
  float x = (vUv.x - 0.5) * 2.0 + (n - 0.5) * 1.15 * vUv.y + sin(t * 2.3 + vSeed * 40.0) * 0.13 * vUv.y;
  float wdt = mix(0.82, 0.1, pow(vUv.y, 0.7));
  float core = 1.0 - smoothstep(0.0, wdt, abs(x));
  float h = vUv.y / clamp(0.75 + 0.35 * (uBlast - 1.0), 0.5, 1.2) + (n2 - 0.5) * 0.5;
  float body = smoothstep(1.0, 0.2, h);
  float lick = smoothstep(0.22, 0.72, n * 1.25 + n2 * 0.35 - vUv.y * 0.72 + 0.04);
  float f = core * body * lick * smoothstep(0.0, 0.1, vUv.y);
  vec3 col = mix(vec3(0.9, 0.15, 0.02), vec3(1.0, 0.48, 0.1), smoothstep(0.08, 0.5, f));
  col = mix(col, vec3(1.0, 0.8, 0.42), smoothstep(0.55, 0.95, f));
  float sceneZ = texture2D(uDepth, gl_FragCoord.xy / uRes).r;
  float soft = clamp((sceneZ - vViewZ) / 0.1, 0.0, 1.0);
  gl_FragColor = vec4(col * f * f * uGain * soft, 1.0);
}`,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
    side: THREE.DoubleSide,
  });
  const flames = [];
  const rng = (() => { let s = 99; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); })();
  for (let i = 0; i < 11; i++) {
    const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * 0.62;
    const w = 0.2 + rng() * 0.2, h = (0.34 + rng() * 0.36) * (1.15 - r * 0.6);
    const g = new THREE.PlaneGeometry(w, h);
    g.translate(0, h / 2, 0);
    g.setAttribute('aSeed', new THREE.Float32BufferAttribute(new Array(4).fill(rng()), 1));
    const m = new THREE.Mesh(g, flameMat);
    m.position.set(F.fire.x + Math.cos(a) * r * U.uFireR.value.x, F.top + 0.0 + (1 - r) * 0.05, F.fire.z + Math.sin(a) * r * U.uFireR.value.y);
    m.layers.set(1);
    m.frustumCulled = false;
    m.renderOrder = 10;
    flames.push(m);
    group.add(m);
  }

  // ---- 불티
  const N = 110;
  const rnd = new Float32Array(N * 4);
  for (let i = 0; i < rnd.length; i++) rnd[i] = rng();
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(N * 3), 3));
  sg.setAttribute('aRnd', new THREE.Float32BufferAttribute(rnd, 4));
  const sparkMat = new THREE.ShaderMaterial({
    uniforms: { uTime: U.uTime, uOrigin: { value: new THREE.Vector3(F.fire.x, F.top + 0.03, F.fire.z) }, uScale: U.uScale, uGain: { value: 16 }, uBlast: U.uBlast },
    vertexShader: /* glsl */ `
attribute vec4 aRnd;
uniform float uTime; uniform vec3 uOrigin; uniform float uScale; uniform float uBlast;
varying float vLife; varying float vFade;
void main() {
  float life = fract(uTime * (0.1 + aRnd.w * 0.2) * (0.6 + 0.4 * uBlast) + aRnd.x * 9.0);
  vec3 p = uOrigin + vec3((aRnd.x - 0.5) * 0.5, 0.0, (aRnd.y - 0.5) * 0.4);
  float h = life * (0.5 + aRnd.z * 1.2);
  p.y += h;
  p.x += sin(uTime * 1.7 + aRnd.y * 40.0 + h * 4.0) * 0.05 * h + (aRnd.z - 0.5) * 0.22 * h;
  p.z += cos(uTime * 1.3 + aRnd.x * 30.0 + h * 3.0) * 0.05 * h - 0.1 * h * h;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float size = (0.005 + 0.007 * aRnd.z) * (1.0 - life * 0.55);
  float px = size * uScale / -mv.z;
  gl_PointSize = max(px, 1.5);
  vFade = clamp(px / 1.5, 0.2, 1.0);
  vLife = life;
}`,
    fragmentShader: /* glsl */ `
uniform float uGain;
varying float vLife; varying float vFade;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.08, d);
  vec3 col = mix(vec3(1.0, 0.72, 0.32), vec3(1.0, 0.22, 0.03), smoothstep(0.0, 0.8, vLife));
  gl_FragColor = vec4(col * a * pow(1.0 - vLife, 1.4) * uGain * vFade, 1.0);
}`,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
  });
  const sparks = new THREE.Points(sg, sparkMat);
  sparks.layers.set(1);
  sparks.frustumCulled = false;
  group.add(sparks);

  // ---- 연기: 불 위에서 후드 안으로 천천히 오르는 부드러운 판(카메라를 향함)
  {
    const NS = 26;
    const sgeo = new THREE.InstancedBufferGeometry();
    sgeo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    sgeo.setIndex([0, 1, 2, 0, 2, 3]);
    const sr = new Float32Array(NS * 4);
    for (let i = 0; i < sr.length; i++) sr[i] = rng();
    sgeo.setAttribute('aRnd', new THREE.InstancedBufferAttribute(sr, 4));
    sgeo.instanceCount = NS;
    const smokeMat = new THREE.ShaderMaterial({
      uniforms: { uTime: U.uTime, uDepth: U.uDepth, uRes: U.uRes, uOrigin: { value: new THREE.Vector3(F.fire.x, F.top + 0.12, F.fire.z) }, uBlast: U.uBlast },
      vertexShader: /* glsl */ `
attribute vec4 aRnd;
uniform float uTime; uniform vec3 uOrigin; uniform float uBlast;
varying vec2 vQ; varying float vLife; varying float vViewZ; varying float vSeed;
void main() {
  float life = fract(uTime * (0.07 + aRnd.w * 0.05) * (0.7 + 0.3 * uBlast) + aRnd.x * 7.0);
  vec3 c = uOrigin + vec3((aRnd.x - 0.5) * 0.42, 0.0, (aRnd.y - 0.5) * 0.34);
  c.y += life * 1.05;
  c.x += sin(uTime * 0.6 + aRnd.z * 20.0) * 0.07 * life;
  c.z += -0.22 * life * life + cos(uTime * 0.5 + aRnd.y * 17.0) * 0.05 * life;
  float size = mix(0.1, 0.36, life) * (0.8 + 0.5 * aRnd.z);
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  float a = aRnd.w * 6.28 + uTime * (aRnd.x - 0.5) * 0.4;
  vec2 q = mat2(cos(a), -sin(a), sin(a), cos(a)) * position.xy;
  vec4 mv = viewMatrix * vec4(c + (right * q.x + up * q.y) * size, 1.0);
  vViewZ = -mv.z; vQ = position.xy; vLife = life; vSeed = aRnd.z;
  gl_Position = projectionMatrix * mv;
}`,
      fragmentShader: /* glsl */ `
uniform float uTime; uniform sampler2D uDepth; uniform vec2 uRes;
varying vec2 vQ; varying float vLife; varying float vViewZ; varying float vSeed;
${NOISE2}
void main() {
  float d = length(vQ);
  float n = ffbm(vQ * 1.6 + vSeed * 30.0 + vec2(0.0, -uTime * 0.12));
  float a = smoothstep(1.0, 0.15, d + (n - 0.5) * 0.7);
  a *= smoothstep(0.0, 0.12, vLife) * smoothstep(1.0, 0.55, vLife) * 0.2;
  float sceneZ = texture2D(uDepth, gl_FragCoord.xy / uRes).r;
  a *= clamp((sceneZ - vViewZ) / 0.25, 0.0, 1.0) * smoothstep(0.15, 0.5, vViewZ);
  // 아래쪽은 불빛을 받아 붉고, 위로 갈수록 잿빛
  vec3 col = mix(vec3(0.95, 0.36, 0.1) * 0.9, vec3(0.07, 0.065, 0.06), smoothstep(0.0, 0.5, vLife));
  gl_FragColor = vec4(col * a, a);
}`,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      depthWrite: false, transparent: true, side: THREE.DoubleSide,
    });
    const smoke = new THREE.Mesh(sgeo, smokeMat);
    smoke.layers.set(1);
    smoke.frustumCulled = false;
    smoke.renderOrder = 5;
    group.add(smoke);
  }

  function update(dt, t, camera) {
    U.uTime.value = t;
    U.uScale.value = pipeline.size.y / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    for (const m of flames) m.rotation.y = Math.atan2(camera.position.x - m.position.x, camera.position.z - m.position.z);
  }
  return { group, uniforms: U, emberMaterial: ember, update };
}
