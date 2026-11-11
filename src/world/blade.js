// 달군 칼날: 길이 방향 단면(너비·두께)을 망치질로 바꾸고, 온도에 따라 스스로 빛난다.
// 로컬 좌표: +X가 칼끝 방향, 아랫면이 y=0(모루 면), 원점은 슴베 끝.
import * as THREE from 'three';

const N = 60;          // 단면 수
const RING = 6;        // 단면당 점 수
export const BLADE_LEN = 0.6;
const TANG = 0.19;     // 슴베 구간(길이 비율)

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// 다 두드렸을 때의 목표 형태
function target(s) {
  if (s < TANG) return { w: 0.013, t: 0.0075 };
  const u = (s - TANG) / (1 - TANG);
  const w = 0.045 * (1 - 0.22 * u) * (1 - Math.pow(smooth(0.72, 1.0, u), 1.6) * 0.92);
  return { w: Math.max(w, 0.0035), t: 0.0046 * (1 - 0.35 * smooth(0.6, 1, u)) };
}
// 시작 형태(각진 쇠막대)
function billet(s) {
  if (s < TANG - 0.02) return { w: 0.013, t: 0.0075 };
  const u = (s - TANG) / (1 - TANG);
  const k = smooth(-0.03, 0.03, u);
  const tip = 1 - smooth(0.86, 1.0, u) * 0.6;
  return { w: (0.013 + (0.027 - 0.013) * k) * tip, t: (0.0075 + (0.0135 - 0.0075) * k) * tip };
}

export function createBlade(lib) {
  const w = new Float32Array(N), t = new Float32Array(N), heat = new Float32Array(N), dent = new Float32Array(N);
  const w0 = new Float32Array(N), t0 = new Float32Array(N);
  const triCount = (N - 1) * RING * 2 + RING * 2;
  const pos = new Float32Array(triCount * 9), nor = new Float32Array(triCount * 9), uv = new Float32Array(triCount * 6), ht = new Float32Array(triCount * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('aHeat', new THREE.BufferAttribute(ht, 1).setUsage(THREE.DynamicDrawUsage));

  const U = { uHeatGain: { value: 1 } };
  const set = lib.set('steelWorn');
  const mat = new THREE.MeshStandardMaterial({ map: set.map, normalMap: set.normalMap, roughnessMap: set.orm, metalnessMap: set.orm, roughness: 1.25, metalness: 1, color: 0x9a9a9e });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uHeatGain = U.uHeatGain;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aHeat;\nvarying float vHeat;\nvarying vec3 vObj;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvHeat = aHeat;\nvObj = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uHeatGain;
varying float vHeat;
varying vec3 vObj;
float bh(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float bn(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(bh(i), bh(i + vec3(1, 0, 0)), f.x), mix(bh(i + vec3(0, 1, 0)), bh(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(bh(i + vec3(0, 0, 1)), bh(i + vec3(1, 0, 1)), f.x), mix(bh(i + vec3(0, 1, 1)), bh(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{
  // 산화 피막 얼룩: 얼룩진 곳은 조금 더 식어 보인다.
  float sc = bn(vObj * vec3(120.0, 260.0, 260.0)) * 0.6 + bn(vObj * vec3(420.0, 700.0, 700.0)) * 0.4;
  float h = vHeat * (0.8 + 0.32 * sc);
  float x = max(h - 0.13, 0.0) / 0.87;
  vec3 glow = vec3(pow(x, 1.55) * 9.5, pow(x, 3.0) * 5.2, pow(x, 5.6) * 1.9);
  totalEmissiveRadiance += glow * uHeatGain;
  // 식으면 검푸른 피막, 달아오르면 반사가 죽는다.
  vec3 scale = mix(vec3(0.035, 0.036, 0.04), vec3(0.11, 0.105, 0.1), sc);
  diffuseColor.rgb = mix(diffuseColor.rgb * 0.75, scale, 0.72 - 0.25 * sc);
  diffuseColor.rgb *= 1.0 - 0.6 * smoothstep(0.2, 0.7, h);
}`)
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor *= 0.55;');
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  mesh.name = 'blade';

  const sOf = (i) => i / (N - 1);
  const P = (i, k, out) => {
    const hw = w[i] / 2, th = Math.max(t[i] + dent[i], 0.002);
    const x = sOf(i) * BLADE_LEN;
    const f = 0.3;
    switch (k) {
      case 0: return out.set(x, th, hw * f);
      case 1: return out.set(x, th, -hw * f);
      case 2: return out.set(x, th / 2, -hw);
      case 3: return out.set(x, 0, -hw * f);
      case 4: return out.set(x, 0, hw * f);
      default: return out.set(x, th / 2, hw);
    }
  };
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), d = new THREE.Vector3(), n = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  let o = 0;
  const tri = (p0, p1, p2, h0, h1, h2, u0, u1, u2) => {
    e1.subVectors(p1, p0); e2.subVectors(p2, p0); n.crossVectors(e1, e2).normalize();
    for (const [p, h, u] of [[p0, h0, u0], [p1, h1, u1], [p2, h2, u2]]) {
      pos[o * 3] = p.x; pos[o * 3 + 1] = p.y; pos[o * 3 + 2] = p.z;
      nor[o * 3] = n.x; nor[o * 3 + 1] = n.y; nor[o * 3 + 2] = n.z;
      uv[o * 2] = u[0]; uv[o * 2 + 1] = u[1];
      ht[o] = h;
      o++;
    }
  };
  function rebuild() {
    o = 0;
    for (let i = 0; i < N - 1; i++) {
      for (let k = 0; k < RING; k++) {
        const j = (k + 1) % RING;
        P(i, k, a); P(i + 1, k, b); P(i + 1, j, c); P(i, j, d);
        const ua = [sOf(i) * 1.5, k / RING], ub = [sOf(i + 1) * 1.5, k / RING], uc = [sOf(i + 1) * 1.5, (k + 1) / RING], ud = [sOf(i) * 1.5, (k + 1) / RING];
        tri(a, b, c, heat[i], heat[i + 1], heat[i + 1], ua, ub, uc);
        tri(a, c, d, heat[i], heat[i + 1], heat[i], ua, uc, ud);
      }
    }
    // 양 끝 마개
    for (const [i, flip] of [[0, false], [N - 1, true]]) {
      a.set(sOf(i) * BLADE_LEN, (t[i] + dent[i]) / 2, 0);
      for (let k = 0; k < RING; k++) {
        const j = (k + 1) % RING;
        P(i, k, b); P(i, j, c);
        if (flip) tri(a, c, b, heat[i], heat[i], heat[i], [0, 0], [0, 0], [0, 0]); else tri(a, b, c, heat[i], heat[i], heat[i], [0, 0], [0, 0], [0, 0]);
      }
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.normal.needsUpdate = true;
    geo.attributes.aHeat.needsUpdate = true;
    geo.computeBoundingSphere();
  }

  let heatDirty = true;
  const api = {
    mesh, uniforms: U, N,
    reset() {
      for (let i = 0; i < N; i++) { const q = billet(sOf(i)); w[i] = w0[i] = q.w; t[i] = t0[i] = q.t; dent[i] = 0; }
      api.reheat();
      rebuild();
    },
    reheat() {
      for (let i = 0; i < N; i++) heat[i] = 0.22 + 0.8 * smooth(TANG - 0.1, TANG + 0.16, sOf(i));
      heatDirty = true;
    },
    // 식힘. 얇은 곳과 모루에 닿은 곳이 먼저 식는다.
    cool(dt, rate = 1) {
      for (let i = 0; i < N; i++) {
        const thin = 1 + (1 - Math.min(1, t[i] / 0.0135)) * 0.9;
        heat[i] = Math.max(0, heat[i] - dt * rate * (0.012 + 0.026 * heat[i]) * thin);
      }
      // 길이 방향 열전도(조금)
      for (let i = 1; i < N - 1; i++) heat[i] += (heat[i - 1] + heat[i + 1] - 2 * heat[i]) * Math.min(0.5, dt * 0.6);
      heatDirty = true;
    },
    // s(0..1) 지점을 힘 power로 내리친다. 반환: 그 지점의 온도와 실제로 변형된 양
    strike(s, power, rng = Math.random) {
      const sigma = 0.042;
      let moved = 0;
      const i0 = Math.round(s * (N - 1));
      const localHeat = heat[Math.min(N - 1, Math.max(0, i0))];
      const soft = smooth(0.22, 0.6, localHeat);
      for (let i = 0; i < N; i++) {
        const ds = (sOf(i) - s) / sigma;
        if (Math.abs(ds) > 3) continue;
        const g = Math.exp(-ds * ds * 0.5);
        const tg = target(sOf(i));
        const k = 0.34 * g * power * (0.06 + 0.94 * soft) * smooth(0.2, 0.6, heat[i]);
        const nt = t[i] - Math.max(0, t[i] - tg.t) * k;
        if (nt < t[i]) {
          const area = w[i] * t[i];
          moved += (t[i] - nt) * g;
          t[i] = nt;
          w[i] = Math.min(tg.w, Math.max(w[i], (area / nt) * 0.93));
          // 완성 직전에는 너비를 목표 형태로 수렴시킨다.
          const done = 1 - (t[i] - tg.t) / Math.max(1e-5, t0[i] - tg.t);
          w[i] += (tg.w - w[i]) * Math.max(0, done - 0.55) * 0.5 * g;
        }
        dent[i] = dent[i] * (1 - g * 0.6) + (rng() - 0.5) * 0.0005 * g;
        heat[i] = Math.max(0, heat[i] - 0.018 * g * power);
      }
      rebuild();
      return { heat: localHeat, moved };
    },
    heatAt(s) { return heat[Math.min(N - 1, Math.max(0, Math.round(s * (N - 1))))]; },
    topAt(s) { const i = Math.min(N - 1, Math.max(0, Math.round(s * (N - 1)))); return t[i]; },
    // 작업 구간의 평균 온도와 완성도(0..1)
    stats() {
      let h = 0, p = 0, c = 0;
      for (let i = 0; i < N; i++) {
        const s = sOf(i);
        if (s < TANG + 0.04) continue;
        const tg = target(s);
        h += heat[i];
        p += 1 - Math.min(1, Math.max(0, (t[i] - tg.t) / Math.max(1e-5, t0[i] - tg.t)));
        c++;
      }
      return { heat: h / c, progress: p / c };
    },
    update() {
      if (!heatDirty) return;
      let q = 0;
      for (let i = 0; i < N - 1; i++) for (let k = 0; k < RING; k++) { ht[q] = heat[i]; ht[q + 1] = heat[i + 1]; ht[q + 2] = heat[i + 1]; ht[q + 3] = heat[i]; ht[q + 4] = heat[i + 1]; ht[q + 5] = heat[i]; q += 6; }
      for (const i of [0, N - 1]) for (let k = 0; k < RING; k++) { ht[q] = ht[q + 1] = ht[q + 2] = heat[i]; q += 3; }
      geo.attributes.aHeat.needsUpdate = true;
      heatDirty = false;
    },
    workRange: [TANG + 0.06, 0.975],
  };
  api.reset();
  return api;
}
