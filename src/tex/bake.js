// 절차적 표면을 GPU에서 굽고(알베도/노멀/ORM), 읽어 와서 일반 텍스처로 만든다.
import * as THREE from 'three';
import { NOISE, SURFACES } from './surfaces.js';

const VS = /* glsl */ `
in vec3 position;
out vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const HEAD = /* glsl */ `
precision highp float;
precision highp int;
precision highp sampler2D;
in vec2 vUv;
out vec4 fragColor;
`;

const F_SURF = (surf) => HEAD + NOISE + surf + /* glsl */ `
vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c)); }
void main() {
  vec3 col; float h, rough, metal;
  surf(vUv, col, h, rough, metal);
#ifdef OUT_ALBEDO
  fragColor = vec4(toSRGB(clamp(col, 0.0, 1.0)), 1.0);
#else
  fragColor = vec4(h, clamp(rough, 0.04, 1.0), clamp(metal, 0.0, 1.0), 1.0);
#endif
}`;

const F_NORMAL = HEAD + /* glsl */ `
uniform sampler2D uData;
uniform float uTexel;
uniform vec2 uSlope;   // 요철 깊이(m) / (2 * 텍셀 크기(m)), U·V 방향별
void main() {
  float hl = texture(uData, vUv - vec2(uTexel, 0.0)).r;
  float hr = texture(uData, vUv + vec2(uTexel, 0.0)).r;
  float hd = texture(uData, vUv - vec2(0.0, uTexel)).r;
  float hu = texture(uData, vUv + vec2(0.0, uTexel)).r;
  vec3 n = normalize(vec3((hl - hr) * uSlope.x, (hd - hu) * uSlope.y, 1.0));
  fragColor = vec4(n * 0.5 + 0.5, 1.0);
}`;

const F_ORM = HEAD + /* glsl */ `
uniform sampler2D uData;
uniform float uTexel;
void main() {
  vec4 d = texture(uData, vUv);
  // 높이에서 구한 틈새 음영(주변 평균보다 낮으면 어둡게)
  float acc = 0.0;
  for (int i = 0; i < 12; i++) {
    float a = float(i) * 2.399963;
    float r = (float(i) + 1.0) / 12.0;
    acc += texture(uData, vUv + vec2(cos(a), sin(a)) * r * uTexel * 14.0).r;
  }
  float ao = clamp(1.0 + (d.r - acc / 12.0) * 3.2, 0.25, 1.0);
  fragColor = vec4(ao, d.g, d.b, 1.0);
}`;

const tri = new THREE.BufferGeometry();
tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

function raw(frag, uniforms = {}, defines = {}) {
  return new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: VS, fragmentShader: frag, uniforms, defines, depthTest: false, depthWrite: false });
}

export class Baker {
  constructor(renderer) {
    this.renderer = renderer;
    this.mesh = new THREE.Mesh(tri, null);
    this.mesh.frustumCulled = false;
    this.aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    this.normalMat = raw(F_NORMAL, { uData: { value: null }, uTexel: { value: 0 }, uSlope: { value: new THREE.Vector2(1, 1) } });
    this.ormMat = raw(F_ORM, { uData: { value: null }, uTexel: { value: 0 } });
  }

  _draw(material, target) {
    this.mesh.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.mesh, cam);
  }

  _read(target, size, srgb) {
    const data = new Uint8Array(size * size * 4);
    this.renderer.readRenderTargetPixels(target, 0, 0, size, size, data);
    const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    tex.anisotropy = this.aniso;
    tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    tex.needsUpdate = true;
    return tex;
  }

  bake(def) {
    const size = def.size;
    const data = new THREE.WebGLRenderTarget(size, size, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, depthBuffer: false });
    const out = new THREE.WebGLRenderTarget(size, size, { type: THREE.UnsignedByteType, format: THREE.RGBAFormat, depthBuffer: false });
    const albedoMat = raw(F_SURF(def.frag), {}, { OUT_ALBEDO: '' });
    const dataMat = raw(F_SURF(def.frag));

    this._draw(albedoMat, out);
    const map = this._read(out, size, true);
    this._draw(dataMat, data);

    this.normalMat.uniforms.uData.value = data.texture;
    this.normalMat.uniforms.uTexel.value = 1 / size;
    this.normalMat.uniforms.uSlope.value.set((def.relief * size) / (2 * def.tile[0]), (def.relief * size) / (2 * def.tile[1]));
    this._draw(this.normalMat, out);
    const normalMap = this._read(out, size, false);

    this.ormMat.uniforms.uData.value = data.texture;
    this.ormMat.uniforms.uTexel.value = 1 / size;
    this._draw(this.ormMat, out);
    const orm = this._read(out, size, false);

    albedoMat.dispose();
    dataMat.dispose();
    data.dispose();
    out.dispose();
    return { map, normalMap, orm, tile: def.tile };
  }
}

// 방 안 위치에 따른 그을음·먼지·모서리 음영을 모든 정적 재질에 입힌다(월드 좌표 기반).
export const GRIME = {
  room: { x0: -3.4, x1: 3.4, z0: -3.0, z1: 3.6 },
  forge: [-1.6, -2.45],
  anvil: [0.05, -0.95],
};
const f1 = (v) => v.toFixed(3);
const GRIME_GLSL = () => /* glsl */ `
float grime(vec3 p) {
  float dx = max(min(p.x - (${f1(GRIME.room.x0)}), (${f1(GRIME.room.x1)}) - p.x), 0.0);
  float dz = max(min(p.z - (${f1(GRIME.room.z0)}), (${f1(GRIME.room.z1)}) - p.z), 0.0);
  float dW = min(dx, dz);
  float dF = max(p.y, 0.0);
  float g = 1.0;
  g *= 1.0 - 0.36 * exp(-dW * 3.6) * exp(-dF * 2.0);
  g *= 1.0 - 0.38 * exp(-dx * 3.2) * exp(-dz * 3.2);
  g *= mix(1.0, 0.5, smoothstep(2.3, 4.4, p.y));
  vec2 f = (p.xz - vec2(${f1(GRIME.forge[0])}, ${f1(GRIME.forge[1])})) / vec2(1.25, 1.05);
  g *= 1.0 - 0.55 * exp(-dot(f, f)) * smoothstep(0.75, 2.1, p.y);
  vec2 a = (p.xz - vec2(${f1(GRIME.anvil[0])}, ${f1(GRIME.anvil[1])})) / 0.95;
  g *= 1.0 - 0.32 * exp(-dF * 6.0) * exp(-dot(a, a));
  return g;
}`;
export function installGrime(material) {
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    prev?.call(material, shader, renderer);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <project_vertex>', `#include <project_vertex>
#ifdef USE_INSTANCING
  vWPos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
#else
  vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
#endif`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\n' + GRIME_GLSL())
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= grime(vWPos);');
  };
  const key = material.customProgramCacheKey?.bind(material);
  material.customProgramCacheKey = () => 'grime|' + (key ? key() : '');
  return material;
}

// 구운 텍스처 세트로 표준 PBR 재질을 만든다. opts로 색조·노멀 강도 등을 바꿀 수 있다.
export class MaterialLibrary {
  constructor(renderer) {
    this.baker = new Baker(renderer);
    this.sets = new Map();
    this.materials = new Map();
  }
  set(name) {
    if (!this.sets.has(name)) {
      const def = SURFACES[name];
      if (!def) throw new Error(`unknown surface: ${name}`);
      this.sets.set(name, this.baker.bake(def));
    }
    return this.sets.get(name);
  }
  tile(name) { return SURFACES[name].tile; }
  // key가 같으면 같은 재질을 재사용한다(병합 지오메트리의 버킷 키로도 쓰인다).
  get(name, opts = {}, key = name) {
    if (this.materials.has(key)) return this.materials.get(key);
    const s = this.set(name);
    const { grime = true, ...rest } = opts;
    opts = rest;
    const m = new THREE.MeshStandardMaterial({
      map: s.map,
      normalMap: s.normalMap,
      roughnessMap: s.orm,
      metalnessMap: s.orm,
      aoMap: s.orm,
      roughness: 1,
      metalness: 1,
      vertexColors: true,
      ...opts,
    });
    m.name = key;
    m.userData.surface = name;
    if (grime) installGrime(m);
    this.materials.set(key, m);
    return m;
  }
  bakeAll(names = Object.keys(SURFACES)) {
    for (const n of names) this.set(n);
  }
}
