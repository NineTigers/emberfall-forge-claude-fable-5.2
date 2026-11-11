// 공기 중 먼지: 햇빛 줄기 안에서만 반짝이도록 태양 깊이 맵으로 가시성을 판정한다.
import * as THREE from 'three';

export function createDust(app, { min, max, count = 4200, firePos, fireColor }) {
  const { pipeline } = app;
  const size = new THREE.Vector3().subVectors(max, min);
  const pos = new Float32Array(count * 3), rnd = new Float32Array(count * 4);
  let s = 4242;
  const r = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = min.x + r() * size.x; pos[i * 3 + 1] = min.y + r() * size.y; pos[i * 3 + 2] = min.z + r() * size.z;
    for (let k = 0; k < 4; k++) rnd[i * 4 + k] = r();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aRnd', new THREE.Float32BufferAttribute(rnd, 4));
  const U = {
    uTime: { value: 0 }, uScale: { value: 1000 },
    uSunMatrix: { value: pipeline.sunMatrix }, uSunDepth: { value: pipeline.sunDepth.depthTexture }, uSunColor: { value: new THREE.Color(1, 1, 1) },
    uBoxMin: { value: min.clone() }, uBoxSize: { value: size },
    uFirePos: { value: firePos }, uFireColor: { value: fireColor },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: U,
    vertexShader: /* glsl */ `
attribute vec4 aRnd;
uniform float uTime; uniform float uScale; uniform mat4 uSunMatrix; uniform sampler2D uSunDepth;
uniform vec3 uSunColor; uniform vec3 uBoxMin; uniform vec3 uBoxSize; uniform vec3 uFirePos; uniform vec3 uFireColor;
varying vec3 vCol;
void main() {
  vec3 p = position;
  p.x += sin(uTime * 0.11 + aRnd.x * 50.0) * 0.22 + uTime * 0.014 * (aRnd.y - 0.5);
  p.y += sin(uTime * 0.13 + aRnd.y * 40.0) * 0.16 - uTime * 0.007 * aRnd.z;
  p.z += cos(uTime * 0.09 + aRnd.z * 60.0) * 0.22 + uTime * 0.01 * (aRnd.x - 0.5);
  p = uBoxMin + mod(p - uBoxMin, uBoxSize);
  vec3 s = (uSunMatrix * vec4(p, 1.0)).xyz;
  float vis = 0.0;
  if (s.x > 0.0 && s.x < 1.0 && s.y > 0.0 && s.y < 1.0 && s.z < 1.0) vis = step(s.z - 0.0015, texture2D(uSunDepth, s.xy).r);
  vec3 lv = uFirePos - p;
  vec3 col = uSunColor * vis + uFireColor / (dot(lv, lv) + 0.25);
  col *= 0.35 + 1.3 * pow(abs(sin(uTime * (0.7 + aRnd.w * 2.5) + aRnd.x * 100.0)), 3.0);
  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float size = 0.0022 + 0.0045 * aRnd.w * aRnd.w;
  float px = size * uScale / max(-mv.z, 0.05);
  gl_PointSize = clamp(px, 1.5, 7.0);
  vCol = col * clamp(px / 1.5, 0.15, 1.0) * smoothstep(0.12, 0.45, -mv.z);
}`,
    fragmentShader: /* glsl */ `
varying vec3 vCol;
void main() {
  float d = length(gl_PointCoord - 0.5);
  gl_FragColor = vec4(vCol * smoothstep(0.5, 0.1, d), 1.0);
}`,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
  });
  const points = new THREE.Points(g, mat);
  points.layers.set(1);
  points.frustumCulled = false;
  points.name = 'dust';
  return {
    points, uniforms: U,
    update(t, camera) {
      U.uTime.value = t;
      U.uScale.value = pipeline.size.y / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    },
  };
}
