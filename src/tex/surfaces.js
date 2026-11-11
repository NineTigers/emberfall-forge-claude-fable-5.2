// 절차적 표면 정의(GLSL). 각 표면은 타일 가능한 uv(0..1)에서
// 색(선형), 높이, 거칠기, 금속성을 계산한다. bake.js가 이를 텍스처 세트로 굽는다.

export const NOISE = /* glsl */ `
#define PI 3.14159265359
float hash11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
vec3 hash32(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yxz + 33.33); return fract((p3.xxy + p3.yzz) * p3.zyx); }

// 주기적 그래디언트 노이즈(-1..1)
float gnoise(vec2 p, vec2 per) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  vec2 ga = hash22(mod(i, per)) * 2.0 - 1.0;
  vec2 gb = hash22(mod(i + vec2(1.0, 0.0), per)) * 2.0 - 1.0;
  vec2 gc = hash22(mod(i + vec2(0.0, 1.0), per)) * 2.0 - 1.0;
  vec2 gd = hash22(mod(i + vec2(1.0, 1.0), per)) * 2.0 - 1.0;
  float a = dot(ga, f), b = dot(gb, f - vec2(1.0, 0.0)), c = dot(gc, f - vec2(0.0, 1.0)), d = dot(gd, f - vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y) * 1.6;
}
float fbm(vec2 p, vec2 per, int oct) {
  float a = 0.5, s = 0.0, n = 0.0;
  for (int i = 0; i < oct; i++) {
    s += a * gnoise(p, per); n += a;
    p = p * 2.0 + vec2(17.3, 5.1); per *= 2.0; a *= 0.5;
  }
  return s / n;
}
float ridged(vec2 p, vec2 per, int oct) {
  float a = 0.5, s = 0.0, n = 0.0;
  for (int i = 0; i < oct; i++) {
    float r = 1.0 - abs(gnoise(p, per));
    s += a * r * r; n += a;
    p = p * 2.0 + vec2(9.2, 31.7); per *= 2.0; a *= 0.5;
  }
  return s / n;
}
// 주기적 워리: (F1, F2, 셀 id)
vec3 worley(vec2 p, vec2 per) {
  vec2 i = floor(p), f = fract(p);
  float f1 = 9.0, f2 = 9.0, id = 0.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y));
    vec2 c = mod(i + g, per);
    vec2 r = g + hash22(c) - f;
    float d = dot(r, r);
    if (d < f1) { f2 = f1; f1 = d; id = hash12(c + 7.7); } else if (d < f2) { f2 = d; }
  }
  return vec3(sqrt(f1), sqrt(f2), id);
}
// 주기적 보로노이: (경계까지 거리, 셀 id, 셀 중심까지의 벡터)
vec4 voronoiEdge(vec2 p, vec2 per) {
  vec2 n = floor(p), f = fract(p);
  vec2 mg = vec2(0.0), mr = vec2(0.0);
  float md = 8.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j));
    vec2 r = g + hash22(mod(n + g, per)) - f;
    float d = dot(r, r);
    if (d < md) { md = d; mr = r; mg = g; }
  }
  md = 8.0;
  for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++) {
    vec2 g = mg + vec2(float(i), float(j));
    vec2 r = g + hash22(mod(n + g, per)) - f;
    if (dot(mr - r, mr - r) > 0.00001) md = min(md, dot(0.5 * (mr + r), normalize(r - mr)));
  }
  return vec4(md, hash12(mod(n + mg, per) + 3.3), mr);
}
mat2 rot2(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
// 불규칙한 패임: 크기와 밀도가 고르지 않게
float pitting(vec2 uv, float freq, float amount) {
  vec3 w = worley(uv * freq, vec2(freq));
  float r = 0.06 + 0.3 * fract(w.z * 7.13);
  float keep = step(1.0 - amount, fract(w.z * 3.71));
  float mask = smoothstep(0.4, 0.75, fbm(uv * 5.0 + 3.3, vec2(5.0), 3) * 0.5 + 0.5);
  return smoothstep(r, r * 0.3, w.x) * keep * mask;
}
`;

// 나무결: U가 결 방향. p = { light, dark, rings, grime, crack, knots, gloss }
const wood = (p) => /* glsl */ `
void surf(vec2 uv, out vec3 col, out float h, out float rough, out float metal) {
  float warp = fbm(uv * vec2(3.0, 6.0), vec2(3.0, 6.0), 3);
  float warp2 = fbm(uv * vec2(2.0, 3.0) + 7.3, vec2(2.0, 3.0), 2);
  float y = uv.y * ${p.rings.toFixed(1)} + warp * 1.4 + warp2 * 2.6;

  // 옹이: 결이 옹이를 돌아 흐르고, 안쪽은 동심원 무늬
  vec2 kp = uv * vec2(2.0, 3.0);
  vec2 ki = floor(kp), kf = fract(kp);
  float knot = 0.0, kring = 0.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j));
    vec2 c = mod(ki + g, vec2(2.0, 3.0));
    vec3 rnd = hash32(c + 11.0);
    if (rnd.z > ${(1 - p.knots).toFixed(2)}) {
      vec2 d = (g + 0.2 + rnd.xy * 0.6 - kf) * vec2(0.42, 1.0);
      float dist = length(d);
      float rad = 0.035 + rnd.x * 0.035;
      y += sign(d.y + 1e-4) * exp(-dist * dist / (rad * rad * 9.0)) * 3.2;
      float m = smoothstep(rad * 1.25, rad * 0.75, dist);
      if (m > knot) { knot = m; kring = sin(dist / rad * 16.0) * 0.5 + 0.5; }
    }
  }
  float r = fract(y);
  float late = smoothstep(0.45, 0.93, r) * (1.0 - smoothstep(0.95, 1.0, r));
  late = mix(late, kring, knot);

  float fiber = gnoise(uv * vec2(14.0, 320.0), vec2(14.0, 320.0));
  float fiber2 = gnoise(uv * vec2(40.0, 760.0) + 3.7, vec2(40.0, 760.0));
  float tone = fbm(uv * vec2(2.0, 5.0) + 2.1, vec2(2.0, 5.0), 3);
  float crackN = abs(gnoise(uv * vec2(2.0, 13.0) + 5.3, vec2(2.0, 13.0)));
  float crackM = smoothstep(0.05, 0.35, fbm(uv * vec2(2.0, 4.0) + 9.9, vec2(2.0, 4.0), 2) + ${(p.crack - 0.5).toFixed(2)});
  float crack = smoothstep(0.035, 0.0, crackN) * crackM;
  float pore = smoothstep(0.55, 0.9, fiber2) * 0.5;
  float grimeN = fbm(uv * 4.0 + 13.0, vec2(4.0), 4) * 0.5 + 0.5;
  float grime = smoothstep(0.35, 0.85, grimeN) * ${p.grime.toFixed(2)};

  vec3 light = vec3(${p.light.join(',')});
  vec3 dark = vec3(${p.dark.join(',')});
  col = mix(light, dark, late * 0.75 + pore * 0.25);
  col *= 0.86 + 0.16 * fiber + 0.22 * tone;
  col = mix(col, dark * 0.45, knot * 0.55);
  col = mix(col, vec3(0.018, 0.016, 0.015), grime * 0.8);
  col *= 1.0 - crack * 0.85;

  h = 0.5 + 0.16 * fiber + 0.07 * fiber2 + 0.20 * late - 0.9 * crack - 0.12 * pore + 0.05 * knot;
  rough = ${p.gloss.toFixed(2)} + 0.12 * (1.0 - late) + 0.08 * fiber + grime * 0.1 + crack * 0.1;
  metal = 0.0;
}`;

// 층쌓기 돌벽. p = { rows, cols, palette[4], mortar, soot }
const stoneWall = (p) => /* glsl */ `
void surf(vec2 uv, out vec3 col, out float h, out float rough, out float metal) {
  const float ROWS = ${p.rows.toFixed(1)};
  float wob = fbm(uv * vec2(6.0, 6.0), vec2(6.0), 2) * 0.05;
  float vy = (uv.y + wob * 0.2) * ROWS;
  float row = mod(floor(vy), ROWS);
  float fy = fract(vy);
  float rh = hash11(row * 7.13 + 1.7);
  float N = ${p.cols.toFixed(1)} + floor(rh * 2.0);
  float x = uv.x * N + rh * 5.37 + wob;
  float ix = floor(x);
  float b0 = ix + (hash12(vec2(mod(ix, N), row)) - 0.5) * 0.5;
  float b1 = ix + 1.0 + (hash12(vec2(mod(ix + 1.0, N), row)) - 0.5) * 0.5;
  float cell = ix, L = b0, R = b1;
  if (x < b0) { cell = ix - 1.0; R = b0; L = ix - 1.0 + (hash12(vec2(mod(ix - 1.0, N), row)) - 0.5) * 0.5; }
  else if (x > b1) { cell = ix + 1.0; L = b1; R = ix + 2.0 + (hash12(vec2(mod(ix + 2.0, N), row)) - 0.5) * 0.5; }
  vec2 id = vec2(mod(cell, N), row);
  vec3 rnd = hash32(id + 31.0);

  float dx = min(x - L, R - x) / N * 1.5;
  float dy = min(fy, 1.0 - fy) / ROWS * 1.5;
  float chip = fbm(uv * 18.0, vec2(18.0), 4);
  float e = min(dx, dy) + chip * 0.012 * (0.5 + rnd.y);
  float mw = 0.006 + rnd.x * 0.004;
  float stone = smoothstep(mw, mw + 0.014, e);
  float pillow = smoothstep(0.0, 0.07, e);

  float rock = fbm(uv * 12.0 + rnd.xy * 40.0, vec2(12.0), 5);
  float fine = fbm(uv * 48.0 + 5.0, vec2(48.0), 4);
  float pits = pitting(uv, 60.0, 0.5);
  vec2 lc = vec2((x - L) / (R - L) - 0.5, fy - 0.5);
  float tilt = dot(lc, rnd.xy - 0.5) * 0.5;
  // 정으로 쪼은 자국(돌마다 방향이 다름)
  vec2 cu = rot2(rnd.z * 3.0) * uv;
  float chisel = abs(gnoise(cu * vec2(10.0, 90.0), vec2(1000.0))) * (0.3 + rnd.x * 0.7);

  vec3 c0 = vec3(${p.palette[0].join(',')}), c1 = vec3(${p.palette[1].join(',')});
  vec3 c2 = vec3(${p.palette[2].join(',')}), c3 = vec3(${p.palette[3].join(',')});
  vec3 sc = rnd.z < 0.3 ? c0 : rnd.z < 0.55 ? c1 : rnd.z < 0.8 ? c2 : c3;
  float speck = fbm(uv * 220.0 + 1.3, vec2(220.0), 2);
  sc *= 0.78 + 0.38 * rnd.y;
  sc *= 0.7 + 0.5 * (rock * 0.5 + 0.5) + 0.16 * fine + 0.14 * speck;
  sc = mix(sc, sc * vec3(1.16, 0.97, 0.8), smoothstep(0.1, 0.6, fbm(uv * 5.0 + 3.0, vec2(5.0), 3)) * 0.55);
  // 돌 윗변에는 먼지가 앉아 밝고, 아랫변은 때가 타서 어둡다
  sc *= 0.9 + 0.2 * smoothstep(0.55, 1.0, fy) - 0.12 * smoothstep(0.3, 0.0, fy);
  // 흰 소금기·이끼 자국
  float salt = smoothstep(0.55, 0.85, fbm(uv * 7.0 + 50.0, vec2(7.0), 4) * 0.5 + 0.5 + fine * 0.1);
  sc = mix(sc, vec3(0.3, 0.29, 0.27), salt * 0.22);
  sc *= 1.0 - pits * 0.5;

  float mortarN = fbm(uv * 90.0, vec2(90.0), 3);
  vec3 mc = vec3(${p.mortar.join(',')}) * (0.8 + 0.25 * mortarN);

  float sootN = fbm(uv * 3.0 + 21.0, vec2(3.0), 4) * 0.5 + 0.5;
  float soot = smoothstep(0.3, 0.8, sootN) * ${p.soot.toFixed(2)};

  col = mix(mc, sc, stone);
  col = mix(col, col * 0.3, soot);
  col *= mix(0.86, 1.0, smoothstep(0.0, 0.03, e));

  h = mix(0.34 + mortarN * 0.06, 0.55 + pillow * 0.26 + rock * 0.3 + fine * 0.08 + speck * 0.03 + tilt + (rnd.x - 0.5) * 0.25 - chisel * 0.13 - pits * 0.14, stone);
  rough = mix(0.96, 0.8 + 0.12 * fine + 0.08 * rock - 0.06 * rnd.y, stone);
  metal = 0.0;
}`;

// 벽돌(막힌줄눈). p = { rows, cols, palette[3], mortar, soot }
const brick = (p) => /* glsl */ `
void surf(vec2 uv, out vec3 col, out float h, out float rough, out float metal) {
  const float ROWS = ${p.rows.toFixed(1)};
  const float N = ${p.cols.toFixed(1)};
  float vy = uv.y * ROWS;
  float row = mod(floor(vy), ROWS);
  float fy = fract(vy);
  float x = uv.x * N + mod(row, 2.0) * 0.5 + (hash11(row + 3.0) - 0.5) * 0.08;
  float ix = mod(floor(x), N);
  float fx = fract(x);
  vec3 rnd = hash32(vec2(ix, row) + 5.0);
  float chip = fbm(uv * 26.0, vec2(26.0), 4);
  float dx = min(fx, 1.0 - fx) / N;
  float dy = min(fy, 1.0 - fy) / ROWS;
  float e = min(dx, dy) + chip * 0.006 * (0.4 + rnd.x);
  float mw = 0.0055;
  float bk = smoothstep(mw, mw + 0.005, e);
  float round_ = smoothstep(0.0, 0.03, e);

  float body = fbm(uv * 30.0 + rnd.xy * 20.0, vec2(30.0), 5);
  float fine = fbm(uv * 110.0, vec2(110.0), 3);
  float pits = pitting(uv, 80.0, 0.5);

  vec3 c0 = vec3(${p.palette[0].join(',')}), c1 = vec3(${p.palette[1].join(',')}), c2 = vec3(${p.palette[2].join(',')});
  vec3 bc = rnd.z < 0.45 ? c0 : rnd.z < 0.8 ? c1 : c2;
  bc *= 0.8 + 0.35 * rnd.y;
  bc *= 0.85 + 0.25 * body + 0.1 * fine;
  bc *= 1.0 - pits * 0.4;
  float mortarN = fbm(uv * 120.0, vec2(120.0), 3);
  vec3 mc = vec3(${p.mortar.join(',')}) * (0.8 + 0.3 * mortarN);
  float sootN = fbm(uv * 3.0 + 4.0, vec2(3.0), 4) * 0.5 + 0.5;
  float soot = smoothstep(0.25, 0.75, sootN) * ${p.soot.toFixed(2)};

  col = mix(mc, bc, bk);
  col = mix(col, vec3(0.012, 0.011, 0.011), soot * 0.85);
  h = mix(0.18 + mortarN * 0.06, 0.5 + round_ * 0.2 + body * 0.14 + fine * 0.05 + (rnd.x - 0.5) * 0.14 - pits * 0.14, bk);
  rough = mix(0.95, 0.84 + 0.08 * fine, bk) - soot * 0.08;
  metal = 0.0;
}`;

// 불규칙 판석 바닥. p = { cells, palette[3], dirt }
const flagstone = (p) => /* glsl */ `
void surf(vec2 uv, out vec3 col, out float h, out float rough, out float metal) {
  const float C = ${p.cells.toFixed(1)};
  vec2 wuv = uv + vec2(fbm(uv * 5.0, vec2(5.0), 2), fbm(uv * 5.0 + 9.0, vec2(5.0), 2)) * 0.012;
  vec4 v = voronoiEdge(wuv * C, vec2(C));
  vec3 rnd = hash32(vec2(v.y * 91.0, v.y * 37.0) + 1.0);
  float chip = fbm(uv * 30.0, vec2(30.0), 4);
  float e = v.x + chip * 0.03;
  float gap = 0.018 + rnd.x * 0.012;
  float st = smoothstep(gap, gap + 0.03, e);
  float edge = smoothstep(0.0, 0.22, e);

  float cleft = ridged(uv * 9.0 + rnd.xy * 30.0, vec2(9.0), 4);
  float body = fbm(uv * 14.0 + 3.0, vec2(14.0), 5);
  float fine = fbm(uv * 70.0, vec2(70.0), 4);
  float pits = pitting(uv, 50.0, 0.45);
  float tilt = dot(v.zw, rnd.xy - 0.5) * 0.35;

  vec3 c0 = vec3(${p.palette[0].join(',')}), c1 = vec3(${p.palette[1].join(',')}), c2 = vec3(${p.palette[2].join(',')});
  vec3 sc = rnd.z < 0.4 ? c0 : rnd.z < 0.75 ? c1 : c2;
  float speck = fbm(uv * 240.0 + 2.0, vec2(240.0), 2);
  float band = sin(dot(v.zw, rnd.xy - 0.5) * 26.0 + body * 5.0 + rnd.z * 9.0) * 0.5 + 0.5;
  sc *= 0.72 + 0.45 * rnd.y;
  sc *= 0.72 + 0.34 * (body * 0.5 + 0.5) + 0.14 * fine + 0.14 * cleft + 0.12 * speck + 0.1 * band;
  // 돌을 가로지르는 가는 균열
  vec2 cq = rot2(rnd.z * 6.2831853) * v.zw;
  float crk = smoothstep(0.014, 0.0, abs(cq.y + fbm(uv * 12.0, vec2(12.0), 3) * 0.07 - (rnd.y - 0.5) * 0.3)) * step(0.62, rnd.x) * smoothstep(0.04, 0.16, e);
  // 층층이 떨어져 나간 판석의 단
  float tq = (body * 0.5 + 0.5) * 3.2 + rnd.x * 2.0;
  float terr = floor(tq) + smoothstep(0.38, 0.62, fract(tq));
  sc *= 0.93 + 0.1 * fract(floor(tq) * 0.37);
  sc *= 1.0 - crk * 0.6;
  sc *= 1.0 - pits * 0.45;
  // 발길에 닳아 중심부가 살짝 매끈해짐
  float worn = smoothstep(0.1, 0.5, e) * (0.5 + 0.5 * rnd.y);

  float dirtN = fbm(uv * 4.0 + 17.0, vec2(4.0), 5) * 0.5 + 0.5;
  float dirt = max(1.0 - st, smoothstep(0.5, 0.85, dirtN + (1.0 - edge) * 0.25) * ${p.dirt.toFixed(2)});
  float grit = fbm(uv * 160.0, vec2(160.0), 3);
  vec3 dc = vec3(0.085, 0.07, 0.055) * (0.65 + 0.7 * grit);
  // 석탄 가루 얼룩
  float coal = smoothstep(0.62, 0.9, fbm(uv * 3.0 + 40.0, vec2(3.0), 4) * 0.5 + 0.5);
  dc = mix(dc, vec3(0.012), coal * 0.7);

  col = mix(sc, dc, dirt);
  col = mix(col, col * 0.35, coal * 0.5);
  float stoneH = 0.5 + edge * 0.16 + cleft * 0.2 + body * 0.18 + fine * 0.07 + tilt + (rnd.x - 0.5) * 0.14 - pits * 0.12 - crk * 0.25 + (terr - 2.5) * 0.07;
  h = mix(stoneH, 0.36 + grit * 0.07, 1.0 - st);
  h = mix(h, max(h, stoneH - 0.03 + grit * 0.03), (dirt - (1.0 - st)) * 0.6);
  rough = mix(0.74 - worn * 0.2 + fine * 0.08, 0.96, dirt);
  metal = 0.0;
}`;

// 쇠. p = { scale, rust, dimple, bare, rough, scratch }
const iron = (p) => /* glsl */ `
void surf(vec2 uv, out vec3 col, out float h, out float rough, out float metal) {
  float n1 = fbm(uv * 6.0, vec2(6.0), 5);
  float n2 = fbm(uv * 26.0 + 3.0, vec2(26.0), 4);
  float n3 = fbm(uv * 120.0 + 8.0, vec2(120.0), 3);
  vec3 w = worley(uv * 9.0, vec2(9.0));
  float dimple = smoothstep(0.55, 0.0, w.x) * (0.4 + 0.6 * w.z) * ${p.dimple.toFixed(2)};
  float sc = smoothstep(-0.25, 0.3, n1 + n2 * 0.45 + ${(p.scale - 0.5).toFixed(2)} * 1.2);
  float rustN = fbm(uv * 5.0 + 9.0, vec2(5.0), 5) + n2 * 0.35;
  float rust = smoothstep(0.2, 0.55, rustN + ${(p.rust - 0.5).toFixed(2)} * 1.3);
  float pits = pitting(uv, 70.0, 0.6) * (0.3 + 0.7 * rust);
  // 사용 흔적 긁힘(여러 방향)
  float scr = 0.0;
  for (int i = 0; i < 3; i++) {
    vec2 q = rot2(0.4 + float(i) * 1.1) * uv;
    float g = abs(gnoise(q * vec2(5.0, 150.0) + float(i) * 7.0, vec2(4096.0)));
    scr += smoothstep(0.03, 0.0, g) * step(0.2, gnoise(q * 3.0 + 2.0, vec2(4096.0)));
  }
  scr = min(scr, 1.0) * ${p.scratch.toFixed(2)};

  vec3 bare = vec3(${p.bare.join(',')}) * (0.9 + 0.14 * n2);
  vec3 scale = vec3(0.05, 0.05, 0.054) * (0.8 + 0.5 * n2 + 0.3 * n3);
  vec3 rustC = mix(vec3(0.11, 0.042, 0.016), vec3(0.2, 0.09, 0.03), n3 * 0.5 + 0.5);
  col = mix(bare, scale, sc);
  col = mix(col, bare * 1.15, scr * 0.8);
  col = mix(col, rustC, rust * 0.75);
  col *= 1.0 - pits * 0.5;

  metal = mix(1.0, 0.35, sc);
  metal = mix(metal, 1.0, scr);
  metal = mix(metal, 0.05, rust * 0.85);
  rough = mix(${p.rough.toFixed(2)}, ${(p.rough + 0.26).toFixed(2)}, sc) + n2 * 0.07 + n3 * 0.05;
  rough = mix(rough, ${p.rough.toFixed(2)} - 0.08, scr);
  rough = mix(rough, 0.9, rust * 0.8);
  h = 0.5 + n1 * 0.18 + n2 * 0.08 + n3 * 0.03 - dimple * 0.3 + sc * 0.06 + rust * (0.04 + n3 * 0.06) - pits * 0.15 - scr * 0.05;
}`;

const leather = (p) => /* glsl */ `
void surf(vec2 uv, out vec3 col, out float h, out float rough, out float metal) {
  vec3 w = worley(uv * 170.0, vec2(170.0));
  float grain = smoothstep(0.0, 0.35, w.y - w.x);
  float wrinkle = ridged(uv * 6.0, vec2(6.0), 4);
  float crease = smoothstep(0.72, 0.95, wrinkle);
  float tone = fbm(uv * 4.0 + 2.0, vec2(4.0), 4);
  float fine = fbm(uv * 90.0, vec2(90.0), 3);
  float worn = smoothstep(0.1, 0.6, fbm(uv * 3.0 + 30.0, vec2(3.0), 4));
  vec3 base = vec3(${p.color.join(',')});
  col = base * (0.78 + 0.3 * tone + 0.1 * fine);
  col = mix(col, base * 1.7 + 0.02, worn * 0.35);
  col *= 0.87 + 0.13 * grain;
  col *= 1.0 - crease * 0.45;
  h = 0.5 + grain * 0.1 - crease * 0.4 + tone * 0.14 + fine * 0.04;
  rough = ${p.rough.toFixed(2)} + 0.12 * (1.0 - grain) - worn * 0.18 + fine * 0.05;
  metal = 0.0;
}`;

const coal = () => /* glsl */ `
void surf(vec2 uv, out vec3 col, out float h, out float rough, out float metal) {
  vec4 v = voronoiEdge(uv * 14.0, vec2(14.0));
  vec3 rnd = hash32(vec2(v.y * 53.0, v.y * 17.0));
  vec4 v2 = voronoiEdge(uv * 40.0 + 3.0, vec2(40.0));
  float fine = fbm(uv * 80.0, vec2(80.0), 4);
  float facet = dot(v.zw, rnd.xy - 0.5) * 1.4;
  float facet2 = dot(v2.zw, hash22(vec2(v2.y * 31.0, 2.0)) - 0.5) * 0.6;
  col = vec3(0.016, 0.016, 0.018) * (0.7 + 0.9 * rnd.z + 0.3 * fine);
  col = mix(col, vec3(0.05, 0.048, 0.045), smoothstep(0.5, 0.9, fine) * 0.4);
  h = 0.5 + facet + facet2 + smoothstep(0.0, 0.08, v.x) * 0.12 + fine * 0.05;
  rough = mix(0.28, 0.85, rnd.y) + fine * 0.1;
  metal = 0.0;
}`;

const burlap = (p) => /* glsl */ `
void surf(vec2 uv, out vec3 col, out float h, out float rough, out float metal) {
  const float F = ${p.threads.toFixed(1)};
  vec2 g = uv * F + vec2(gnoise(uv * vec2(4.0, 30.0), vec2(4.0, 30.0)), gnoise(uv * vec2(30.0, 4.0) + 5.0, vec2(30.0, 4.0))) * 0.18;
  vec2 id = floor(g), f = fract(g);
  float over = mod(id.x + id.y, 2.0);
  float tu = sin(f.x * PI), tv = sin(f.y * PI);
  float warpT = tu * (0.55 + 0.45 * tv);
  float weftT = tv * (0.55 + 0.45 * tu);
  float t = mix(weftT, warpT, over);
  float thr = mix(hash11(mod(id.y, F) + 3.0), hash11(mod(id.x, F) + 77.0), over);
  float fuzz = fbm(uv * 200.0, vec2(200.0), 3);
  float tone = fbm(uv * 3.0, vec2(3.0), 4);
  vec3 base = vec3(${p.color.join(',')});
  col = base * (0.7 + 0.4 * thr) * (0.55 + 0.5 * t) * (0.9 + 0.2 * tone + 0.1 * fuzz);
  h = 0.3 + t * 0.6 + fuzz * 0.06;
  rough = 0.94;
  metal = 0.0;
}`;


const bark = () => /* glsl */ `
void surf(vec2 uv, out vec3 col, out float h, out float rough, out float metal) {
  float w = fbm(uv * vec2(2.0, 6.0), vec2(2.0, 6.0), 3);
  float r1 = ridged(vec2(uv.x * 3.0, uv.y * 11.0 + w * 1.4), vec2(3.0, 11.0), 4);
  float r2 = ridged(vec2(uv.x * 8.0 + 3.0, uv.y * 30.0 + w * 2.0), vec2(8.0, 30.0), 3);
  float plate = smoothstep(0.3, 0.72, r1 * 0.75 + r2 * 0.35);
  float fine = fbm(uv * vec2(24.0, 70.0), vec2(24.0, 70.0), 4);
  float tone = fbm(uv * 3.0 + 4.0, vec2(3.0), 3);
  col = mix(vec3(0.022, 0.016, 0.012), vec3(0.12, 0.095, 0.072), plate);
  col *= 0.8 + 0.28 * fine + 0.2 * tone;
  h = plate * 0.75 + r2 * 0.15 + fine * 0.1;
  rough = 0.93 - plate * 0.06;
  metal = 0.0;
}`;

// 통나무 마구리(나이테). 타일링하지 않고 uv 0..1 전체를 한 단면으로 쓴다.
const woodEnd = () => /* glsl */ `
void surf(vec2 uv, out vec3 col, out float h, out float rough, out float metal) {
  vec2 c = uv - 0.5 + vec2(0.035, -0.02);
  float ang = atan(c.y, c.x);
  float rad = length(c) * (1.0 + 0.06 * sin(ang * 3.0 + 1.0) + 0.03 * sin(ang * 7.0));
  float y = rad * 62.0 + fbm(uv * 6.0, vec2(6.0), 3) * 1.4;
  float r = fract(y);
  float late = smoothstep(0.45, 0.93, r) * (1.0 - smoothstep(0.95, 1.0, r));
  float an = (ang / 6.2831853 + 0.5) * 16.0;
  float crackN = abs(gnoise(vec2(an, rad * 2.5), vec2(16.0, 64.0)));
  float crack = smoothstep(0.02 + rad * 0.12, 0.0, crackN) * smoothstep(0.04, 0.2, rad);
  float saw = sin((uv.x + uv.y * 0.3) * 520.0 + fbm(uv * 8.0, vec2(8.0), 2) * 6.0) * 0.5 + 0.5;
  float fine = fbm(uv * 80.0, vec2(80.0), 3);
  float tone = fbm(uv * 4.0 + 6.0, vec2(4.0), 4);
  // 달군 쇠·불똥에 그을린 자국
  vec3 sp = worley(uv * 9.0, vec2(9.0));
  float scorch = smoothstep(0.32, 0.05, sp.x) * step(0.45, sp.z);
  float soot = smoothstep(0.1, 0.7, tone * 0.5 + 0.5 + scorch * 0.5);
  col = mix(vec3(0.27, 0.185, 0.105), vec3(0.1, 0.06, 0.032), late * 0.7);
  col *= 0.8 + 0.25 * tone + 0.1 * fine;
  col = mix(col, vec3(0.02, 0.017, 0.015), max(scorch * 0.9, soot * 0.45));
  col *= 1.0 - crack * 0.9;
  h = 0.5 + late * 0.12 + saw * 0.04 + fine * 0.05 - crack * 0.9 - scorch * 0.08;
  rough = 0.82 + fine * 0.08;
  metal = 0.0;
}`;

const rock = (p) => /* glsl */ `
void surf(vec2 uv, out vec3 col, out float h, out float rough, out float metal) {
  float body = fbm(uv * 5.0, vec2(5.0), 6);
  float cleft = ridged(uv * 7.0 + 3.0, vec2(7.0), 4);
  float fine = fbm(uv * 60.0, vec2(60.0), 4);
  float pits = pitting(uv, 44.0, 0.5);
  float tone = fbm(uv * 2.0 + 9.0, vec2(2.0), 3);
  float sootN = fbm(uv * 3.0 + 31.0, vec2(3.0), 4) * 0.5 + 0.5;
  float soot = smoothstep(0.3, 0.8, sootN) * ${p.soot.toFixed(2)};
  col = mix(vec3(${p.a.join(',')}), vec3(${p.b.join(',')}), tone * 0.5 + 0.5);
  col *= 0.82 + 0.22 * body + 0.1 * fine + 0.06 * cleft;
  col *= 1.0 - pits * 0.4;
  col = mix(col, vec3(0.014), soot * 0.8);
  h = 0.5 + body * 0.3 + cleft * 0.14 + fine * 0.05 - pits * 0.12;
  rough = 0.8 + fine * 0.08 - soot * 0.06;
  metal = 0.0;
}`;

// 타일 크기(m): U, V. size는 텍스처 해상도, relief는 높이 0..1이 나타내는 실제 요철 깊이(m).
export const SURFACES = {
  woodDark: { size: 1024, tile: [1.3, 0.65], relief: 0.004, frag: wood({ light: [0.2, 0.125, 0.07], dark: [0.055, 0.032, 0.018], rings: 46, grime: 0.55, crack: 0.5, knots: 0.35, gloss: 0.68 }) },
  woodBeam: { size: 1024, tile: [1.6, 0.8], relief: 0.006, frag: wood({ light: [0.15, 0.095, 0.055], dark: [0.035, 0.022, 0.014], rings: 34, grime: 0.75, crack: 0.75, knots: 0.45, gloss: 0.74 }) },
  woodPale: { size: 1024, tile: [1.2, 0.6], relief: 0.003, frag: wood({ light: [0.33, 0.24, 0.15], dark: [0.12, 0.075, 0.04], rings: 50, grime: 0.3, crack: 0.35, knots: 0.3, gloss: 0.7 }) },
  woodHandle: { size: 1024, tile: [0.6, 0.3], relief: 0.0006, frag: wood({ light: [0.42, 0.29, 0.16], dark: [0.2, 0.12, 0.06], rings: 30, grime: 0.25, crack: 0.1, knots: 0.0, gloss: 0.42 }) },
  stoneWall: { size: 2048, tile: [1.5, 1.5], relief: 0.034, frag: stoneWall({ rows: 6, cols: 3, palette: [[0.17, 0.165, 0.16], [0.21, 0.185, 0.15], [0.115, 0.118, 0.125], [0.19, 0.155, 0.125]], mortar: [0.21, 0.195, 0.175], soot: 0.5 }) },
  brick: { size: 1024, tile: [0.92, 0.92], relief: 0.014, frag: brick({ rows: 12, cols: 4, palette: [[0.2, 0.075, 0.048], [0.13, 0.06, 0.042], [0.075, 0.05, 0.042]], mortar: [0.13, 0.12, 0.11], soot: 0.6 }) },
  flagstone: { size: 2048, tile: [2.2, 2.2], relief: 0.028, frag: flagstone({ cells: 5, palette: [[0.16, 0.16, 0.165], [0.19, 0.17, 0.145], [0.12, 0.125, 0.135]], dirt: 0.75 }) },
  ironDark: { size: 1024, tile: [0.5, 0.5], relief: 0.0013, frag: iron({ scale: 0.85, rust: 0.3, dimple: 0.6, bare: [0.36, 0.36, 0.37], rough: 0.42, scratch: 0.25 }) },
  ironRust: { size: 1024, tile: [0.5, 0.5], relief: 0.0014, frag: iron({ scale: 0.6, rust: 0.72, dimple: 0.5, bare: [0.3, 0.3, 0.31], rough: 0.5, scratch: 0.1 }) },
  steelWorn: { size: 1024, tile: [0.4, 0.4], relief: 0.00035, frag: iron({ scale: 0.12, rust: 0.12, dimple: 0.35, bare: [0.5, 0.505, 0.52], rough: 0.3, scratch: 0.9 }) },
  anvilBody: { size: 1024, tile: [0.6, 0.6], relief: 0.0022, frag: iron({ scale: 0.75, rust: 0.42, dimple: 1.0, bare: [0.3, 0.3, 0.31], rough: 0.5, scratch: 0.3 }) },
  leather: { size: 1024, tile: [0.35, 0.35], relief: 0.0012, frag: leather({ color: [0.13, 0.066, 0.034], rough: 0.62 }) },
  leatherDark: { size: 1024, tile: [0.35, 0.35], relief: 0.0012, frag: leather({ color: [0.05, 0.03, 0.02], rough: 0.58 }) },
  coal: { size: 512, tile: [0.25, 0.25], relief: 0.006, frag: coal() },
  bark: { size: 1024, tile: [0.9, 0.5], relief: 0.014, frag: bark() },
  woodEnd: { size: 1024, tile: [1, 1], relief: 0.002, frag: woodEnd() },
  rock: { size: 1024, tile: [1.1, 1.1], relief: 0.011, frag: rock({ a: [0.15, 0.145, 0.14], b: [0.2, 0.175, 0.145], soot: 0.6 }) },
  cloth: { size: 512, tile: [0.11, 0.11], relief: 0.0007, frag: burlap({ threads: 64, color: [0.075, 0.085, 0.1] }) },
  burlap: { size: 512, tile: [0.22, 0.22], relief: 0.0016, frag: burlap({ threads: 44, color: [0.3, 0.23, 0.14] }) },
};
