// HDR 렌더 + 후처리 파이프라인.
// 장면(불투명) -> 선형 깊이 복사 -> 효과 레이어(입자) -> AO / 볼류메트릭(반해상도)
// -> 합성 -> 블룸 -> 톤매핑·색보정 -> FXAA·그레인 -> 화면
import * as THREE from 'three';

const VS = /* glsl */ `
in vec3 position;
out vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const HEAD = /* glsl */ `
precision highp float;
precision highp int;
precision highp sampler2D;
precision highp sampler3D;
in vec2 vUv;
out vec4 fragColor;
#define PI 3.14159265359
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
`;

const triGeo = new THREE.BufferGeometry();
triGeo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
const passCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

class Pass {
  constructor(name, frag, uniforms = {}, defines = {}) {
    this.material = new THREE.RawShaderMaterial({
      name,
      glslVersion: THREE.GLSL3,
      vertexShader: VS,
      fragmentShader: HEAD + frag,
      uniforms,
      defines,
      depthTest: false,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(triGeo, this.material);
    this.mesh.frustumCulled = false;
    this.u = this.material.uniforms;
  }
  render(renderer, target) {
    renderer.setRenderTarget(target);
    renderer.render(this.mesh, passCam);
  }
}

// ---------------------------------------------------------------- shaders

const F_DEPTH = /* glsl */ `
uniform sampler2D uDepthTex;
uniform vec2 uNearFar;
void main() {
  float d = texture(uDepthTex, vUv).r;
  float n = uNearFar.x, f = uNearFar.y;
  fragColor = vec4((n * f) / (f - d * (f - n)), 0.0, 0.0, 1.0);
}`;

const F_AO = /* glsl */ `
uniform sampler2D uDepth;
uniform vec2 uTexel;      // 1 / 전체 해상도
uniform vec2 uProj;       // tan(fov/2) * (aspect, 1)
uniform float uRadius;
uniform float uIntensity;
uniform float uBias;
const int N = 16;
const float TURNS = 7.0;
ivec2 SZ;
// 반해상도 패스가 읽는 깊이는 항상 텍셀 중심(texelFetch)으로 고정한다.
vec3 viewPos(ivec2 c) {
  c = clamp(c, ivec2(0), SZ - 1);
  float z = texelFetch(uDepth, c, 0).r;
  vec2 uv = (vec2(c) + 0.5) * uTexel;
  return vec3((uv * 2.0 - 1.0) * uProj * z, z);
}
void main() {
  SZ = textureSize(uDepth, 0);
  ivec2 c = ivec2(gl_FragCoord.xy) * 2;
  vec3 p = viewPos(c);
  if (p.z > 60.0) { fragColor = vec4(1.0); return; }
  vec3 pr = viewPos(c + ivec2(1, 0)), pl = viewPos(c - ivec2(1, 0));
  vec3 pu = viewPos(c + ivec2(0, 1)), pd = viewPos(c - ivec2(0, 1));
  vec3 dx = abs(pr.z - p.z) < abs(p.z - pl.z) ? pr - p : p - pl;
  vec3 dy = abs(pu.z - p.z) < abs(p.z - pd.z) ? pu - p : p - pd;
  vec3 n = normalize(cross(dy, dx));

  float phi = ign(gl_FragCoord.xy) * 6.2831853;
  vec2 rPx = min(uRadius / (p.z * uProj * 2.0), vec2(0.16)) / uTexel;
  float r2 = uRadius * uRadius;
  float sum = 0.0;
  for (int i = 0; i < N; i++) {
    float a = (float(i) + 0.5) / float(N);
    float ang = phi + a * 6.2831853 * TURNS;
    vec3 v = viewPos(c + ivec2(vec2(cos(ang), sin(ang)) * a * rPx)) - p;
    float vv = dot(v, v);
    float vn = dot(v, n);
    float f = max(r2 - vv, 0.0);
    sum += f * f * f * max((vn - uBias - 0.002 * p.z) / (vv + 0.0004), 0.0);
  }
  float ao = max(0.0, 1.0 - sum * uIntensity * 5.0 / (r2 * r2 * r2 * float(N)));
  fragColor = vec4(ao, ao, ao, 1.0);
}`;

const F_BLUR = /* glsl */ `
uniform sampler2D uTex;     // 반해상도
uniform sampler2D uDepth;   // 전체 해상도 선형 깊이
uniform ivec2 uStep;
uniform float uSharp;
const float W[5] = float[5](0.227027, 0.194594, 0.121622, 0.054054, 0.016216);
void main() {
  ivec2 hs = textureSize(uTex, 0), fs = textureSize(uDepth, 0);
  ivec2 c = ivec2(gl_FragCoord.xy);
  float z = texelFetch(uDepth, min(c * 2, fs - 1), 0).r;
  vec4 acc = texelFetch(uTex, c, 0) * W[0];
  float ws = W[0];
  for (int i = 1; i < 5; i++) {
    for (int s = -1; s <= 1; s += 2) {
      ivec2 q = clamp(c + uStep * (i * s), ivec2(0), hs - 1);
      float zs = texelFetch(uDepth, min(q * 2, fs - 1), 0).r;
      float w = W[i] * exp(-abs(zs - z) / max(z, 0.1) * uSharp);
      acc += texelFetch(uTex, q, 0) * w;
      ws += w;
    }
  }
  fragColor = acc / ws;
}`;

const F_VOL = /* glsl */ `
uniform sampler2D uDepth;
uniform sampler2D uSunDepth;
uniform sampler3D uNoise;
uniform mat4 uCamWorld;
uniform mat4 uSunMatrix;
uniform vec2 uProj;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec4 uLightPos[4];
uniform vec3 uLightCol[4];
uniform vec3 uAmbient;
uniform float uTime;
uniform float uDensity;
uniform float uSunBias;
uniform float uMaxDist;
uniform float uAniso;
const int STEPS = 36;

float hg(float c, float g) {
  float g2 = g * g;
  return (1.0 - g2) / pow(1.0 + g2 - 2.0 * g * c, 1.5);
}
float density(vec3 p) {
  vec3 q = p * 0.13 + vec3(0.011, 0.017, -0.008) * uTime;
  float n = texture(uNoise, q).r * 0.62 + texture(uNoise, q * 2.9 + vec3(0.03, -0.045, 0.02) * uTime).r * 0.38;
  float h = smoothstep(0.2, 3.6, p.y);
  return uDensity * (0.3 + 1.5 * n * n) * (0.65 + 1.1 * h);
}
void main() {
  ivec2 fs = textureSize(uDepth, 0);
  ivec2 fc = min(ivec2(gl_FragCoord.xy) * 2, fs - 1);
  float z = texelFetch(uDepth, fc, 0).r;
  vec2 suv = (vec2(fc) + 0.5) / vec2(fs);
  vec3 dv = vec3((suv * 2.0 - 1.0) * uProj, -1.0);
  float tmax = min(z * length(dv), uMaxDist);
  vec3 rd = normalize(mat3(uCamWorld) * dv);
  vec3 ro = uCamWorld[3].xyz;
  float dt = tmax / float(STEPS);
  float jit = ign(gl_FragCoord.xy);
  float ph = mix(1.0, hg(dot(rd, uSunDir), uAniso), 0.65);
  vec3 L = vec3(0.0);
  float T = 1.0;
  for (int i = 0; i < STEPS; i++) {
    vec3 p = ro + rd * ((float(i) + jit) * dt);
    float a = density(p) * dt;
    vec3 s = (uSunMatrix * vec4(p, 1.0)).xyz;
    float vis = 0.0;
    if (s.x > 0.0 && s.x < 1.0 && s.y > 0.0 && s.y < 1.0 && s.z < 1.0) {
      vis = step(s.z - uSunBias, texture(uSunDepth, s.xy).r);
    }
    vec3 li = uSunColor * (vis * ph) + uAmbient;
    for (int k = 0; k < 4; k++) {
      vec3 lv = uLightPos[k].xyz - p;
      li += uLightCol[k] / (dot(lv, lv) + uLightPos[k].w);
    }
    L += T * li * a;
    T *= exp(-a);
  }
  fragColor = vec4(L, T);
}`;

const F_COMPOSITE = /* glsl */ `
uniform sampler2D uColor;
uniform sampler2D uDepth;
uniform sampler2D uAO;
uniform sampler2D uVol;
uniform float uAoStrength;
uniform float uUseAO;
uniform float uUseVol;
void main() {
  ivec2 fs = textureSize(uDepth, 0), hs = textureSize(uAO, 0);
  ivec2 fc = ivec2(gl_FragCoord.xy);
  vec3 c = texelFetch(uColor, fc, 0).rgb;
  float z = texelFetch(uDepth, fc, 0).r;
  // 반해상도 버퍼의 깊이 인지 업샘플(각 반해상도 화소는 전체 해상도 (2k, 2k) 텍셀의 깊이로 계산됨)
  vec2 hp = gl_FragCoord.xy * 0.5 - 0.5;
  vec2 base = floor(hp);
  vec2 f = hp - base;
  float ao = 0.0;
  vec4 vol = vec4(0.0);
  float ws = 0.0;
  for (int j = 0; j < 2; j++) {
    for (int i = 0; i < 2; i++) {
      ivec2 h = clamp(ivec2(base) + ivec2(i, j), ivec2(0), hs - 1);
      float zs = texelFetch(uDepth, min(h * 2, fs - 1), 0).r;
      float wb = (i == 0 ? 1.0 - f.x : f.x) * (j == 0 ? 1.0 - f.y : f.y);
      float w = wb / (0.02 + abs(zs - z) / max(z, 0.1) * 40.0) + 1e-5;
      ao += texelFetch(uAO, h, 0).r * w;
      vol += texelFetch(uVol, h, 0) * w;
      ws += w;
    }
  }
  ao /= ws;
  vol /= ws;
  float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
  // 직사광을 강하게 받는 밝은 면에는 AO를 약하게 적용한다.
  float k = uAoStrength * mix(1.0, 0.35, smoothstep(0.6, 5.0, lum)) * uUseAO;
  c *= mix(1.0, ao, k);
  vol = mix(vec4(0.0, 0.0, 0.0, 1.0), vol, uUseVol);
  c = c * vol.a + vol.rgb;
  fragColor = vec4(c, 1.0);
}`;

const F_BLOOM_DOWN = /* glsl */ `
uniform sampler2D uTex;
uniform vec2 uTexel;
uniform float uThreshold;
uniform float uKnee;
vec3 T(float x, float y) { return texture(uTex, vUv + vec2(x, y) * uTexel).rgb; }
#ifdef FIRST
float karis(vec3 c) { return 1.0 / (1.0 + max(c.r, max(c.g, c.b))); }
vec3 prefilter(vec3 c) {
  c = min(c, vec3(200.0));
  float br = max(c.r, max(c.g, c.b));
  float soft = clamp(br - uThreshold + uKnee, 0.0, 2.0 * uKnee);
  soft = soft * soft / (4.0 * uKnee + 1e-4);
  float contrib = max(soft, br - uThreshold) / max(br, 1e-4);
  return c * contrib;
}
#endif
void main() {
  vec3 a = T(-2., -2.), b = T(0., -2.), c = T(2., -2.);
  vec3 d = T(-2., 0.), e = T(0., 0.), f = T(2., 0.);
  vec3 g = T(-2., 2.), h = T(0., 2.), i = T(2., 2.);
  vec3 j = T(-1., -1.), k = T(1., -1.), l = T(-1., 1.), m = T(1., 1.);
#ifdef FIRST
  vec3 g0 = (j + k + l + m) * 0.25;
  vec3 g1 = (a + b + d + e) * 0.25;
  vec3 g2 = (b + c + e + f) * 0.25;
  vec3 g3 = (d + e + g + h) * 0.25;
  vec3 g4 = (e + f + h + i) * 0.25;
  float w0 = karis(g0) * 0.5, w1 = karis(g1) * 0.125, w2 = karis(g2) * 0.125, w3 = karis(g3) * 0.125, w4 = karis(g4) * 0.125;
  vec3 r = (g0 * w0 + g1 * w1 + g2 * w2 + g3 * w3 + g4 * w4) / (w0 + w1 + w2 + w3 + w4);
  fragColor = vec4(prefilter(r), 1.0);
#else
  vec3 r = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
  fragColor = vec4(r, 1.0);
#endif
}`;

const F_BLOOM_UP = /* glsl */ `
uniform sampler2D uTex;   // 더 작은 레벨(이미 업샘플 누적됨)
uniform sampler2D uBase;  // 현재 크기의 다운샘플 레벨
uniform vec2 uTexel;      // uTex의 텍셀
uniform float uSpread;
vec3 T(float x, float y) { return texture(uTex, vUv + vec2(x, y) * uTexel).rgb; }
void main() {
  vec3 s = T(-1., -1.) + T(1., -1.) + T(-1., 1.) + T(1., 1.);
  s += 2.0 * (T(0., -1.) + T(-1., 0.) + T(1., 0.) + T(0., 1.));
  s += 4.0 * T(0., 0.);
  s /= 16.0;
  fragColor = vec4(mix(texture(uBase, vUv).rgb, s, uSpread), 1.0);
}`;

const F_FINAL = /* glsl */ `
uniform sampler2D uComp;
uniform sampler2D uBloom;
uniform sampler2D uAO;
uniform sampler2D uVol;
uniform sampler2D uDepth;
uniform float uExposure;
uniform float uBloomAmt;
uniform float uVignette;
uniform float uSat;
uniform float uContrast;
uniform float uAspect;
uniform vec3 uLift;
uniform vec3 uGain;
uniform vec3 uShadowTint;
uniform vec3 uHighTint;
uniform int uDebug;

// ACES (Stephen Hill fit)
const mat3 ACES_IN = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
const mat3 ACES_OUT = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
vec3 rrtOdt(vec3 v) {
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return a / b;
}
vec3 aces(vec3 c) {
  c = ACES_IN * c;
  c = rrtOdt(c);
  c = ACES_OUT * c;
  return clamp(c, 0.0, 1.0);
}
vec3 toSRGB(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}
void main() {
  vec3 c = texture(uComp, vUv).rgb;
  vec3 bloom = texture(uBloom, vUv).rgb;
  if (uDebug == 1) { fragColor = vec4(vec3(texture(uAO, vUv).r), 1.0); return; }
  if (uDebug == 2) { vec4 v = texture(uVol, vUv); fragColor = vec4(toSRGB(aces(v.rgb * uExposure)), 1.0); return; }
  if (uDebug == 3) { fragColor = vec4(toSRGB(aces(bloom * uExposure)), 1.0); return; }
  if (uDebug == 4) { float z = texture(uDepth, vUv).r; fragColor = vec4(vec3(fract(z), z / 10.0, z / 40.0), 1.0); return; }
  if (uDebug == 6) { fragColor = vec4(vec3(texture(uVol, vUv).a), 1.0); return; }

  c = mix(c, bloom, uBloomAmt);
  c *= uExposure;
  c = aces(c);

  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, uSat);
  c *= mix(uShadowTint, uHighTint, smoothstep(0.0, 0.55, l));
  c = mix(vec3(0.5), c, uContrast);
  c = c * uGain + uLift * (1.0 - c);

  vec2 q = (vUv - 0.5) * vec2(uAspect, 1.0);
  float vig = smoothstep(0.35, 1.05, length(q));
  c *= 1.0 - uVignette * vig * vig;

  fragColor = vec4(toSRGB(clamp(c, 0.0, 1.0)), 1.0);
}`;

const F_FXAA = /* glsl */ `
uniform sampler2D uTex;
uniform vec2 uTexel;
uniform float uTime;
uniform float uGrain;
uniform float uUseFxaa;
const vec3 LUMA = vec3(0.299, 0.587, 0.114);
float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
void main() {
  vec3 rgbM = texture(uTex, vUv).rgb;
  vec3 col = rgbM;
  if (uUseFxaa > 0.5) {
    vec3 rgbNW = texture(uTex, vUv + vec2(-1.0, -1.0) * uTexel).rgb;
    vec3 rgbNE = texture(uTex, vUv + vec2(1.0, -1.0) * uTexel).rgb;
    vec3 rgbSW = texture(uTex, vUv + vec2(-1.0, 1.0) * uTexel).rgb;
    vec3 rgbSE = texture(uTex, vUv + vec2(1.0, 1.0) * uTexel).rgb;
    float lNW = dot(rgbNW, LUMA), lNE = dot(rgbNE, LUMA), lSW = dot(rgbSW, LUMA), lSE = dot(rgbSE, LUMA), lM = dot(rgbM, LUMA);
    float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
    float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
    vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), (lNW + lSW) - (lNE + lSE));
    float dirReduce = max((lNW + lNE + lSW + lSE) * 0.03125, 1.0 / 128.0);
    float rcp = 1.0 / (min(abs(dir.x), abs(dir.y)) + dirReduce);
    dir = clamp(dir * rcp, vec2(-8.0), vec2(8.0)) * uTexel;
    vec3 rgbA = 0.5 * (texture(uTex, vUv + dir * (1.0 / 3.0 - 0.5)).rgb + texture(uTex, vUv + dir * (2.0 / 3.0 - 0.5)).rgb);
    vec3 rgbB = rgbA * 0.5 + 0.25 * (texture(uTex, vUv - dir * 0.5).rgb + texture(uTex, vUv + dir * 0.5).rgb);
    float lB = dot(rgbB, LUMA);
    col = (lB < lMin || lB > lMax) ? rgbA : rgbB;
  }
  // 필름 그레인 겸 디더링(어두운 장면의 8비트 밴딩 방지)
  float t = fract(uTime * 7.31);
  float n = hash(gl_FragCoord.xy + t * 91.7) + hash(gl_FragCoord.xy * 1.37 + 17.0 - t * 53.1) - 1.0;
  float lum = dot(col, LUMA);
  col += n * (uGrain * mix(1.0, 0.35, lum) + 1.0 / 255.0);
  fragColor = vec4(col, 1.0);
}`;

// ---------------------------------------------------------------- pipeline

function makeNoise3D(size = 32) {
  const data = new Uint8Array(size * size * size);
  let s = 1234567;
  for (let i = 0; i < data.length; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    data[i] = s >>> 24;
  }
  // 한 번 부드럽게(박스 블러) 해서 값 노이즈의 격자 느낌을 줄인다.
  const out = new Uint8Array(data.length);
  const at = (x, y, z) => data[((z + size) % size) * size * size + ((y + size) % size) * size + ((x + size) % size)];
  for (let z = 0; z < size; z++) for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let a = 0;
    for (let k = -1; k <= 1; k++) for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) a += at(x + i, y + j, z + k);
    out[z * size * size + y * size + x] = Math.min(255, Math.max(0, (a / 27 - 128) * 2.6 + 128));
  }
  const tex = new THREE.Data3DTexture(out, size, size, size);
  tex.format = THREE.RedFormat;
  tex.type = THREE.UnsignedByteType;
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = tex.wrapR = THREE.RepeatWrapping;
  tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  return tex;
}

export class Pipeline {
  constructor(renderer, off = []) {
    this.renderer = renderer;
    this.off = new Set(off);
    this.size = new THREE.Vector2(2, 2);
    this.half = new THREE.Vector2(1, 1);
    this.debug = 0;
    this.settings = {
      exposure: 1.0,
      aoRadius: 0.45,
      aoIntensity: 1.0,
      aoStrength: 0.9,
      fogDensity: 0.035,
      fogAniso: 0.62,
      fogAmbient: new THREE.Color(0.012, 0.012, 0.015),
      bloom: 0.07,
      bloomThreshold: 0.0,
      bloomSpread: 0.6,
      vignette: 0.42,
      saturation: 0.98,
      contrast: 1.06,
      grain: 0.028,
      lift: new THREE.Color(0.0, 0.0, 0.0),
      gain: new THREE.Color(1, 1, 1),
      shadowTint: new THREE.Color(0.94, 0.98, 1.08),
      highTint: new THREE.Color(1.04, 1.0, 0.95),
    };

    const hdrOpts = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false };
    const depthTex = new THREE.DepthTexture(2, 2, THREE.UnsignedIntType);
    this.hdr = new THREE.WebGLRenderTarget(2, 2, { ...hdrOpts, depthBuffer: true, depthTexture: depthTex });
    this.depthRT = new THREE.WebGLRenderTarget(2, 2, { type: THREE.FloatType, format: THREE.RedFormat, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false });
    const ldr = { type: THREE.UnsignedByteType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false };
    this.aoA = new THREE.WebGLRenderTarget(1, 1, ldr);
    this.aoB = new THREE.WebGLRenderTarget(1, 1, ldr);
    this.volA = new THREE.WebGLRenderTarget(1, 1, hdrOpts);
    this.volB = new THREE.WebGLRenderTarget(1, 1, hdrOpts);
    this.comp = new THREE.WebGLRenderTarget(2, 2, hdrOpts);
    this.ldr = new THREE.WebGLRenderTarget(2, 2, ldr);
    this.bloomLevels = 6;
    this.bloomDown = [];
    this.bloomUp = [];
    for (let i = 0; i < this.bloomLevels; i++) {
      this.bloomDown.push(new THREE.WebGLRenderTarget(1, 1, hdrOpts));
      this.bloomUp.push(new THREE.WebGLRenderTarget(1, 1, hdrOpts));
    }

    this.noise3D = makeNoise3D(32);
    // 볼류메트릭용 태양 깊이 맵(정적 지오메트리, 필요할 때만 갱신)
    this.sunDepth = new THREE.WebGLRenderTarget(2048, 2048, { depthBuffer: true, depthTexture: new THREE.DepthTexture(2048, 2048, THREE.UnsignedIntType) });
    this.sunCam = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 30);
    this.sunMatrix = new THREE.Matrix4();
    this.sunDepthDirty = true;
    this.depthOnly = new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide });

    const V2 = () => new THREE.Vector2();
    this.pDepth = new Pass('depth', F_DEPTH, { uDepthTex: { value: depthTex }, uNearFar: { value: V2() } });
    this.pAO = new Pass('ao', F_AO, {
      uDepth: { value: this.depthRT.texture }, uTexel: { value: V2() }, uProj: { value: V2() },
      uRadius: { value: 0.45 }, uIntensity: { value: 1 }, uBias: { value: 0.012 },
    });
    this.pBlur = new Pass('blur', F_BLUR, { uTex: { value: null }, uDepth: { value: this.depthRT.texture }, uStep: { value: V2() }, uSharp: { value: 60 } });
    this.pVol = new Pass('vol', F_VOL, {
      uDepth: { value: this.depthRT.texture }, uSunDepth: { value: this.sunDepth.depthTexture }, uNoise: { value: this.noise3D },
      uCamWorld: { value: new THREE.Matrix4() }, uSunMatrix: { value: this.sunMatrix }, uProj: { value: V2() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunColor: { value: new THREE.Color(0, 0, 0) },
      uLightPos: { value: [0, 1, 2, 3].map(() => new THREE.Vector4(0, -100, 0, 1)) },
      uLightCol: { value: [0, 1, 2, 3].map(() => new THREE.Color(0, 0, 0)) },
      uAmbient: { value: this.settings.fogAmbient }, uTime: { value: 0 }, uDensity: { value: 0.03 },
      uSunBias: { value: 0.0015 }, uMaxDist: { value: 14 }, uAniso: { value: 0.6 },
    });
    this.pComp = new Pass('composite', F_COMPOSITE, {
      uColor: { value: this.hdr.texture }, uDepth: { value: this.depthRT.texture }, uAO: { value: this.aoA.texture }, uVol: { value: this.volA.texture },
      uAoStrength: { value: 0.9 }, uUseAO: { value: 1 }, uUseVol: { value: 1 },
    });
    const downU = () => ({ uTex: { value: null }, uTexel: { value: V2() }, uThreshold: { value: 0 }, uKnee: { value: 0.5 } });
    this.pBloomFirst = new Pass('bloomFirst', F_BLOOM_DOWN, downU(), { FIRST: '' });
    this.pBloomDown = new Pass('bloomDown', F_BLOOM_DOWN, downU());
    this.pBloomUp = new Pass('bloomUp', F_BLOOM_UP, { uTex: { value: null }, uBase: { value: null }, uTexel: { value: V2() }, uSpread: { value: 0.6 } });
    this.pFinal = new Pass('final', F_FINAL, {
      uComp: { value: this.comp.texture }, uBloom: { value: this.bloomUp[0].texture }, uAO: { value: this.aoA.texture }, uVol: { value: this.volA.texture }, uDepth: { value: this.depthRT.texture },
      uExposure: { value: 1 }, uBloomAmt: { value: 0.07 }, uVignette: { value: 0.4 }, uSat: { value: 1 }, uContrast: { value: 1 }, uAspect: { value: 1 },
      uLift: { value: this.settings.lift }, uGain: { value: this.settings.gain }, uShadowTint: { value: this.settings.shadowTint }, uHighTint: { value: this.settings.highTint },
      uDebug: { value: 0 },
    });
    this.pFxaa = new Pass('fxaa', F_FXAA, { uTex: { value: this.ldr.texture }, uTexel: { value: V2() }, uTime: { value: 0 }, uGrain: { value: 0.03 }, uUseFxaa: { value: 1 } });
  }

  setSize(w, h) {
    w = Math.max(2, Math.floor(w));
    h = Math.max(2, Math.floor(h));
    this.size.set(w, h);
    const hw = Math.ceil(w / 2), hh = Math.ceil(h / 2);
    this.half.set(hw, hh);
    this.hdr.setSize(w, h);
    this.depthRT.setSize(w, h);
    this.comp.setSize(w, h);
    this.ldr.setSize(w, h);
    for (const t of [this.aoA, this.aoB, this.volA, this.volB]) t.setSize(hw, hh);
    let bw = hw, bh = hh;
    for (let i = 0; i < this.bloomLevels; i++) {
      this.bloomDown[i].setSize(bw, bh);
      this.bloomUp[i].setSize(bw, bh);
      bw = Math.max(1, Math.ceil(bw / 2));
      bh = Math.max(1, Math.ceil(bh / 2));
    }
  }

  // 태양 방향(장면 -> 태양), 중심과 범위를 받아 볼류메트릭용 깊이 카메라를 맞춘다.
  setSun(dirToSun, center, extent, depthRange) {
    const cam = this.sunCam;
    cam.left = -extent; cam.right = extent; cam.top = extent; cam.bottom = -extent;
    cam.near = 0.1; cam.far = depthRange * 2;
    cam.position.copy(center).addScaledVector(dirToSun, depthRange);
    cam.up.set(0, 1, 0);
    if (Math.abs(dirToSun.y) > 0.98) cam.up.set(0, 0, 1);
    cam.lookAt(center);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld(true);
    this.sunMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1)
      .multiply(cam.projectionMatrix).multiply(cam.matrixWorldInverse);
    this.pVol.u.uSunDir.value.copy(dirToSun).normalize();
    this.sunDepthDirty = true;
  }

  renderSunDepth(scene) {
    const r = this.renderer;
    const prev = scene.overrideMaterial;
    scene.overrideMaterial = this.depthOnly;
    this.sunCam.layers.set(0);
    r.setRenderTarget(this.sunDepth);
    r.clear();
    r.render(scene, this.sunCam);
    scene.overrideMaterial = prev;
    this.sunDepthDirty = false;
  }

  render(scene, camera, frame) {
    const r = this.renderer;
    const s = this.settings;
    const { x: w, y: h } = this.size;
    const { x: hw, y: hh } = this.half;
    const off = this.off;

    if (this.sunDepthDirty) this.renderSunDepth(scene);

    // 1) 불투명 장면
    r.shadowMap.needsUpdate = true;
    camera.layers.set(0);
    camera.layers.enable(2);
    r.setRenderTarget(this.hdr);
    r.setClearColor(0x000000, 1);
    r.clear();
    r.render(scene, camera);

    // 2) 선형 깊이
    this.pDepth.u.uNearFar.value.set(camera.near, camera.far);
    this.pDepth.render(r, this.depthRT);

    // 3) 효과 레이어(입자 등: 깊이 테스트는 하되 선형 깊이를 읽어 소프트 처리)
    camera.layers.set(1);
    r.setRenderTarget(this.hdr);
    r.render(scene, camera);
    camera.layers.set(0);
    camera.layers.enable(2);

    const tanY = Math.tan(THREE.MathUtils.degToRad(camera.fov) * 0.5);
    const tanX = tanY * camera.aspect;

    // 4) AO
    if (!off.has('ao')) {
      const u = this.pAO.u;
      u.uTexel.value.set(1 / w, 1 / h);
      u.uProj.value.set(tanX, tanY);
      u.uRadius.value = s.aoRadius;
      u.uIntensity.value = s.aoIntensity;
      this.pAO.render(r, this.aoA);
      const b = this.pBlur.u;
      b.uSharp.value = 80;
      b.uTex.value = this.aoA.texture; b.uStep.value.set(1, 0); this.pBlur.render(r, this.aoB);
      b.uTex.value = this.aoB.texture; b.uStep.value.set(0, 1); this.pBlur.render(r, this.aoA);
    }

    // 5) 볼류메트릭
    if (!off.has('vol')) {
      const u = this.pVol.u;
      u.uCamWorld.value.copy(camera.matrixWorld);
      u.uProj.value.set(tanX, tanY);
      u.uTime.value = frame.time;
      u.uDensity.value = s.fogDensity;
      u.uAniso.value = s.fogAniso;
      if (frame.sunColor) u.uSunColor.value.copy(frame.sunColor);
      const lights = frame.volLights || [];
      for (let i = 0; i < 4; i++) {
        const L = lights[i];
        if (L) { u.uLightPos.value[i].set(L.position.x, L.position.y, L.position.z, L.soft ?? 0.05); u.uLightCol.value[i].copy(L.color); }
        else { u.uLightPos.value[i].set(0, -100, 0, 1); u.uLightCol.value[i].setRGB(0, 0, 0); }
      }
      this.pVol.render(r, this.volA);
      const b = this.pBlur.u;
      b.uSharp.value = 40;
      b.uTex.value = this.volA.texture; b.uStep.value.set(1, 0); this.pBlur.render(r, this.volB);
      b.uTex.value = this.volB.texture; b.uStep.value.set(0, 1); this.pBlur.render(r, this.volA);
    }

    // 6) 합성
    {
      const u = this.pComp.u;
      u.uAoStrength.value = s.aoStrength;
      u.uUseAO.value = off.has('ao') ? 0 : 1;
      u.uUseVol.value = off.has('vol') ? 0 : 1;
      this.pComp.render(r, this.comp);
    }

    // 7) 블룸
    if (!off.has('bloom')) {
      let src = this.comp;
      for (let i = 0; i < this.bloomLevels; i++) {
        const p = i === 0 ? this.pBloomFirst : this.pBloomDown;
        p.u.uTex.value = src.texture;
        p.u.uTexel.value.set(1 / src.width, 1 / src.height);
        p.u.uThreshold.value = s.bloomThreshold;
        p.render(r, this.bloomDown[i]);
        src = this.bloomDown[i];
      }
      let acc = this.bloomDown[this.bloomLevels - 1];
      for (let i = this.bloomLevels - 2; i >= 0; i--) {
        const u = this.pBloomUp.u;
        u.uTex.value = acc.texture;
        u.uBase.value = this.bloomDown[i].texture;
        u.uTexel.value.set(1 / acc.width, 1 / acc.height);
        u.uSpread.value = s.bloomSpread;
        this.pBloomUp.render(r, this.bloomUp[i]);
        acc = this.bloomUp[i];
      }
    }

    // 8) 톤매핑·색보정
    {
      const u = this.pFinal.u;
      u.uExposure.value = s.exposure;
      u.uBloomAmt.value = off.has('bloom') ? 0 : s.bloom;
      u.uVignette.value = off.has('grade') ? 0 : s.vignette;
      u.uSat.value = off.has('grade') ? 1 : s.saturation;
      u.uContrast.value = off.has('grade') ? 1 : s.contrast;
      u.uAspect.value = w / h;
      u.uDebug.value = this.debug;
      this.pFinal.render(r, this.ldr);
    }

    // 9) FXAA + 그레인 -> 화면
    {
      const u = this.pFxaa.u;
      u.uTexel.value.set(1 / w, 1 / h);
      u.uTime.value = frame.time;
      u.uGrain.value = off.has('grain') || this.debug ? 0 : s.grain;
      u.uUseFxaa.value = off.has('fxaa') ? 0 : 1;
      this.pFxaa.render(r, null);
    }
  }
}
