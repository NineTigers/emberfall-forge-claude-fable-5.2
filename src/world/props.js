// 소품: 담금질 통, 연장 걸이, 집게·망치, 선반, 작업대, 사슬, 등불 등.
import * as THREE from 'three';
import { loft, roundUV, xform } from '../geo/builder.js';
import { ROOM, roofY } from './room.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// 통널을 하나씩 세운 나무통. 반환: 물 표면 높이 등
export function barrel(b, x, z, { r = 0.3, h = 0.76, staves = 18, key = 'woodDark', open = true } = {}) {
  const rng = b.rng;
  const prof = (t) => r * (0.86 + 0.14 * Math.sin(Math.PI * t));
  const th = 0.022;
  for (let s = 0; s < staves; s++) {
    const a0 = (s / staves) * Math.PI * 2 + 0.004, a1 = ((s + 1) / staves) * Math.PI * 2 - 0.004;
    const rings = [];
    for (let k = 0; k <= 6; k++) {
      const t = k / 6, R = prof(t), y = t * h;
      rings.push([
        [Math.cos(a0) * R, y, Math.sin(a0) * R],
        [Math.cos(a1) * R, y, Math.sin(a1) * R],
        [Math.cos(a1) * (R - th), y, Math.sin(a1) * (R - th)],
        [Math.cos(a0) * (R - th), y, Math.sin(a0) * (R - th)],
      ]);
    }
    const tint = rng.range(0.4, 0.72);
    b.geo(key, loft(rings), [x, 0, z], { crease: 30, grain: 1, tint: [tint, tint * 1.01, tint * 1.04] });
  }
  for (const t of [0.1, 0.36, 0.64, 0.9]) {
    const R = prof(t) + 0.004;
    const g = new THREE.TorusGeometry(R, 0.0045, 5, 44);
    roundUV(g, R, 0.03, b.lib.tile('ironRust'), false);
    b.add('ironRust', g, xform([x, t * h, z], [Math.PI / 2, 0, 0], [1, 1, 4.2]));
  }
  // 바닥판
  b.cyl(key, prof(0.05) - th, prof(0.05) - th, 0.02, [x, 0.04, z], { seg: 20, tint: 0.5 });
  if (!open) b.cyl(key, prof(0.95) - th, prof(0.95) - th, 0.02, [x, h - 0.035, z], { seg: 20, tint: 0.8 });
  return { x, z, r: prof(0.86) - th, waterY: h * 0.86 };
}

// 대장장이 집게(턱이 위, 손잡이가 아래로 늘어진 자세). origin = 축(리벳) 위치
export function tongs(b, origin, { yaw = 0, tilt = 0, len = 0.42, jaw = 0.1, open = 0.03, key = 'ironDark', matrix = null } = {}) {
  const m = matrix ?? xform(origin, [tilt, yaw, 0]);
  const P = (x, y, z = 0) => V(x, y, z).applyMatrix4(m).toArray();
  for (const s of [-1, 1]) {
    const zz = s * 0.004;
    b.beam(key, P(0, 0, zz), P(s * 0.016, jaw * 0.5, zz), 0.014, 0.008, { bevel: 0.002 });
    b.beam(key, P(s * 0.016, jaw * 0.5, zz), P(s * 0.006, jaw, zz), 0.016, 0.008, { bevel: 0.002 });
    b.rod(key, P(0, 0, zz), P(-s * open, -len, zz), 0.0058, 0.0045, { seg: 6 });
  }
  b.rod(key, P(0, 0, -0.007), P(0, 0, 0.007), 0.007, 0.007, { seg: 8 });
}

// 망치. origin = 머리 중심, dir = 자루가 뻗는 방향(월드), face = 머리의 긴 축
export function hammer(b, origin, { rot = [0, 0, 0], head = [0.105, 0.042, 0.042], handle = 0.3, peen = true, tint = 0.8, matrix = null, keys = {}, woodTint = [0.85, 0.8, 0.72] } = {}) {
  const m = matrix ?? xform(origin, rot);
  const kSteel = keys.steel ?? 'steelWorn', kWood = keys.wood ?? 'woodHandle';
  const M = (local) => new THREE.Matrix4().multiplyMatrices(m, local);
  b.box(kSteel, head, [0, 0, 0], { matrix: M(xform([peen ? -head[0] * 0.08 : 0, 0, 0])), bevel: 0.005, grain: 0, tint });
  if (peen) {
    // 가로 날(크로스 핀): 한쪽으로 좁아지는 쐐기
    const g = loft([
      [[0, -head[1] / 2, -head[2] / 2], [0, head[1] / 2, -head[2] / 2], [0, head[1] / 2, head[2] / 2], [0, -head[1] / 2, head[2] / 2]],
      [[head[0] * 0.42, -0.005, -head[2] / 2], [head[0] * 0.42, 0.005, -head[2] / 2], [head[0] * 0.42, 0.005, head[2] / 2], [head[0] * 0.42, -0.005, head[2] / 2]],
    ]);
    b.geo(kSteel, g, [0, 0, 0], { matrix: M(xform([head[0] * 0.42, 0, 0])), crease: 30, tint });
  }
  const hg = new THREE.CylinderGeometry(0.0135, 0.016, handle, 10, 4);
  const p = hg.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = p.getY(i) / handle + 0.5;
    const k = 1 + 0.16 * Math.pow(1 - t, 3) - 0.08 * Math.sin(Math.PI * t);
    p.setXYZ(i, p.getX(i) * k * 0.86, p.getY(i), p.getZ(i) * k * 1.12);
  }
  hg.computeVertexNormals();
  roundUV(hg, 0.015, handle, b.lib.tile('woodHandle'), true, [b.rng(), b.rng()]);
  b.add(kWood, hg, M(xform([0, -handle / 2 + head[1] * 0.4, 0])), woodTint);
}

// 선반 가공 형태(항아리·단지 등). profile: [[r, y], ...]
export function lathe(b, key, profile, pos, o = {}) {
  const pts = profile.map(([r, y]) => new THREE.Vector2(r, y));
  const g = new THREE.LatheGeometry(pts, o.seg ?? 18);
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += pts[i].distanceTo(pts[i - 1]);
  const rmax = Math.max(...profile.map((p) => p[0]));
  roundUV(g, rmax, len, b._tile(key), o.along ?? false, [b.rng(), b.rng()]);
  b.add(key, g, xform(pos, o.rot, o.scale), o.tint);
}

// 사슬: 타원 고리를 번갈아 돌려 잇는다.
export function chain(b, p0, p1, { link = 0.034, key = 'ironRust' } = {}) {
  const a = V(...p0), c = V(...p1);
  const dir = V().subVectors(c, a);
  const len = dir.length();
  dir.normalize();
  const n = Math.max(1, Math.round(len / (link * 0.78)));
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir);
  for (let i = 0; i < n; i++) {
    const g = new THREE.TorusGeometry(link * 0.3, link * 0.085, 5, 10);
    const local = new THREE.Matrix4().makeRotationY(i % 2 ? Math.PI / 2 : 0).multiply(new THREE.Matrix4().makeScale(1, 1.75, 1));
    const pos = V().copy(a).addScaledVector(dir, (i + 0.5) * (len / n));
    const m = new THREE.Matrix4().compose(pos, q, V(1, 1, 1)).multiply(local);
    b.add(key, g, m, 0.85);
  }
}

export function buildProps(b) {
  const R = ROOM, rng = b.rng;
  const out = {};

  // ---- 담금질 통(물은 world에서 따로 만든다)
  out.quench = barrel(b, 1.12, -1.62, { r: 0.31, h: 0.74 });
  // 구석의 닫힌 통과 상자
  barrel(b, 2.85, -2.45, { r: 0.34, h: 0.92, open: false });
  barrel(b, 2.3, -2.62, { r: 0.26, h: 0.62, open: false, staves: 16 });

  // ---- 뒤벽 연장 걸이(화덕과 창 사이)
  const rz = R.z0 + 0.02;
  b.box('woodDark', [1.62, 0.13, 0.035], [0.22, 1.98, rz], { grain: 0, bevel: 0.006, tint: 0.8 });
  b.box('woodDark', [1.62, 0.1, 0.035], [0.22, 1.5, rz], { grain: 0, bevel: 0.006, tint: 0.75 });
  // 쇠 걸이 봉(집게가 걸터앉는 가로대)
  b.rod('ironDark', [-0.5, 1.98, rz + 0.11], [0.95, 1.98, rz + 0.11], 0.007, 0.007, { seg: 6 });
  for (const x of [-0.52, 0.22, 0.97]) b.rod('ironDark', [x, 1.98, rz + 0.01], [x, 1.98, rz + 0.11], 0.006, 0.006, { seg: 6 });
  const tx = [-0.38, -0.2, -0.02, 0.17];
  tx.forEach((x, i) => tongs(b, [x, 1.965, rz + 0.11], { len: rng.range(0.4, 0.5), jaw: rng.range(0.08, 0.13), open: rng.range(0.02, 0.045), yaw: rng.range(-0.25, 0.25), tilt: rng.range(-0.03, 0.03) }));
  // 망치: 머리가 못 두 개 위에 걸리고 자루가 아래로
  const hx = [0.42, 0.62, 0.84];
  hx.forEach((x, i) => {
    const hw = [0.11, 0.095, 0.13][i];
    for (const s of [-1, 1]) b.rod('woodPale', [x + s * 0.026, 1.975, rz + 0.01], [x + s * 0.026, 1.99, rz + 0.1], 0.007, 0.007, { seg: 6, tint: 0.7 });
    hammer(b, [x, 2.01, rz + 0.065], { rot: [0, rng.range(-0.12, 0.12), rng.range(-0.04, 0.04)], head: [hw, 0.04 + i * 0.004, 0.04 + i * 0.004], handle: [0.3, 0.28, 0.36][i], peen: i !== 2, tint: 0.7 });
  });
  // 아래 가로대의 줄·정
  for (let i = 0; i < 7; i++) {
    const x = -0.45 + i * 0.2 + rng.range(-0.03, 0.03);
    b.rod('woodPale', [x, 1.5, rz + 0.01], [x, 1.515, rz + 0.07], 0.006, 0.006, { seg: 6, tint: 0.7 });
    if (i % 3 === 2) continue;
    const L = rng.range(0.2, 0.3);
    b.box('ironDark', [0.02, L, 0.006], [x + 0.015, 1.49 - L / 2, rz + 0.045], { rot: [0, 0, rng.range(-0.05, 0.05)], bevel: 0.002, tint: 1.1 });
    b.cyl('woodHandle', 0.012, 0.014, 0.09, [x + 0.015, 1.53, rz + 0.045], { seg: 8, tint: 0.7 });
  }

  // ---- 화덕 앞 가로대에 건 집게
  b.rod('ironDark', [-2.3, 0.7, -1.66], [-0.92, 0.7, -1.66], 0.007, 0.007, { seg: 6 });
  for (const x of [-2.3, -0.92]) b.rod('ironDark', [x, 0.7, -1.74], [x, 0.7, -1.66], 0.006, 0.006, { seg: 6 });
  for (const x of [-2.12, -1.94, -1.12]) tongs(b, [x, 0.688, -1.66], { len: rng.range(0.42, 0.52), jaw: rng.range(0.09, 0.14), open: rng.range(0.02, 0.04), yaw: rng.range(-0.3, 0.3) });

  // ---- 창대 위 소품
  lathe(b, 'rock', [[0.001, 0], [0.05, 0], [0.068, 0.04], [0.07, 0.1], [0.05, 0.15], [0.036, 0.165], [0.042, 0.18], [0.03, 0.18]], [1.48, 1.355, -3.1], { tint: [0.9, 0.6, 0.45] });
  lathe(b, 'rock', [[0.001, 0], [0.04, 0], [0.045, 0.06], [0.03, 0.075], [0.026, 0.075]], [1.68, 1.355, -3.08], { tint: [0.5, 0.55, 0.6] });

  // ---- 오른벽 작업대
  const bx = 2.85, bz = 0.55, bl = 2.1;
  b.box('woodPale', [0.72, 0.075, bl], [bx, 0.88, bz], { grain: 2, bevel: 0.01, wobble: 0.004, tint: 0.62 });
  b.box('woodPale', [0.05, 0.16, bl], [bx + 0.335, 0.995, bz], { grain: 2, bevel: 0.006, tint: 0.55 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box('woodBeam', [0.1, 0.845, 0.1], [bx + sx * 0.28, 0.4225, bz + sz * (bl / 2 - 0.12)], { grain: 1, bevel: 0.008, wobble: 0.004 });
  b.box('woodDark', [0.64, 0.03, bl - 0.2], [bx, 0.26, bz], { grain: 2, bevel: 0.004, tint: 0.7 });
  for (const sz of [-1, 1]) b.box('woodBeam', [0.56, 0.08, 0.06], [bx, 0.78, bz + sz * (bl / 2 - 0.12)], { grain: 0, bevel: 0.006 });
  // 작업대 위: 만들던 칼날, 줄, 나무 그릇
  b.box('steelWorn', [0.045, 0.006, 0.72], [bx - 0.1, 0.922, bz - 0.3], { rot: [0, 0.2, 0], bevel: 0.002, tint: 0.75 });
  b.box('steelWorn', [0.04, 0.006, 0.6], [bx + 0.1, 0.922, bz - 0.1], { rot: [0, -0.35, 0], bevel: 0.002, tint: 0.6 });
  b.box('ironDark', [0.024, 0.008, 0.3], [bx - 0.18, 0.923, bz + 0.5], { rot: [0, 0.6, 0], bevel: 0.002 });
  lathe(b, 'woodPale', [[0.001, 0], [0.07, 0], [0.11, 0.045], [0.115, 0.06], [0.1, 0.06], [0.07, 0.02], [0.001, 0.015]], [bx + 0.12, 0.918, bz + 0.6], { tint: 0.6, along: false });
  hammer(b, [bx - 0.05, 0.94, bz + 0.25], { rot: [Math.PI / 2, 0.5, 0.1], head: [0.12, 0.046, 0.046], handle: 0.34, tint: 0.65 });
  // 작업대 아래 상자와 통
  b.box('woodDark', [0.5, 0.2, 0.42], [bx, 0.375, bz - 0.5], { grain: 0, bevel: 0.008, tint: 0.7 });
  b.box('woodDark', [0.44, 0.24, 0.5], [bx + 0.02, 0.395, bz + 0.45], { grain: 2, bevel: 0.008, tint: 0.6, rot: [0, 0.08, 0] });

  // ---- 들보에 매단 사슬·갈고리·말굽
  chain(b, [-1.7, R.H - 0.25, -0.55], [-1.7, 2.02, -0.55]);
  b.rod('ironRust', [-1.7, 2.02, -0.55], [-1.7, 1.9, -0.55], 0.006, 0.006, { seg: 6 });
  {
    const g = new THREE.TorusGeometry(0.04, 0.007, 5, 12, Math.PI * 1.25);
    b.add('ironRust', g, xform([-1.7, 1.87, -0.55], [0, 0.4, -Math.PI * 0.75]));
  }
  chain(b, [1.7, R.H - 0.25, 1.4], [1.7, 2.2, 1.4]);
  for (let i = 0; i < 3; i++) {
    const g = new THREE.TorusGeometry(0.055, 0.008, 5, 14, Math.PI * 1.45);
    b.add('ironRust', g, xform([1.7 - 0.107, R.H - 0.11 + rng.range(-0.02, 0.02), -1.4 - i * 0.2], [0, Math.PI / 2, -Math.PI * 0.22 + rng.range(-0.15, 0.15)], [1, 1.25, 1]));
  }

  // ---- 왼벽: 긴 선반과 단지, 물통
  b.box('woodDark', [0.26, 0.035, 1.9], [R.x0 + 0.13, 1.55, 0.6], { grain: 2, bevel: 0.005, tint: 0.75 });
  for (const z of [-0.2, 0.6, 1.4]) b.beam('woodBeam', [R.x0 + 0.02, 1.3, z], [R.x0 + 0.22, 1.53, z], 0.04, 0.05, { bevel: 0.004 });
  const pots = [[0.0, 0.085, 0.2, [0.75, 0.5, 0.38]], [0.3, 0.06, 0.13, [0.45, 0.5, 0.55]], [0.52, 0.07, 0.17, [0.8, 0.62, 0.45]], [0.95, 0.09, 0.14, [0.5, 0.42, 0.36]], [1.3, 0.055, 0.22, [0.62, 0.66, 0.6]]];
  for (const [dz, r, h, tint] of pots) {
    lathe(b, 'rock', [[0.001, 0], [r * 0.7, 0], [r, h * 0.3], [r * 0.98, h * 0.62], [r * 0.6, h * 0.9], [r * 0.5, h * 0.96], [r * 0.6, h], [r * 0.48, h]], [R.x0 + 0.14, 1.568, -0.15 + dz], { tint });
  }
  barrel(b, R.x0 + 0.42, 2.6, { r: 0.33, h: 0.9, open: false });
  barrel(b, R.x0 + 0.38, 1.9, { r: 0.24, h: 0.5 });

  // ---- 완성된 칼을 세워 둔 걸이(왼벽 앞쪽)
  {
    const z0 = 0.2;
    for (const y of [0.5, 1.05]) b.box('woodDark', [0.07, 0.07, 1.1], [R.x0 + 0.1, y, z0 + 0.5], { grain: 2, bevel: 0.006, tint: 0.7 });
    for (const z of [z0, z0 + 1.0]) b.box('woodBeam', [0.09, 1.2, 0.09], [R.x0 + 0.1, 0.6, z], { grain: 1, bevel: 0.008 });
    for (let i = 0; i < 5; i++) {
      const z = z0 + 0.14 + i * 0.19, L = rng.range(0.7, 0.9), lean = 0.12;
      const m = xform([R.x0 + 0.17, 0.04, z], [0, 0, -lean]);
      const M = (l) => new THREE.Matrix4().multiplyMatrices(m, l);
      b.box('steelWorn', [0.006, L, 0.045], [0, 0, 0], { matrix: M(xform([0, L / 2, 0])), bevel: 0.002, grain: 1, tint: rng.range(0.7, 1) });
      b.box('ironDark', [0.016, 0.018, 0.17], [0, 0, 0], { matrix: M(xform([0, L + 0.009, 0])), bevel: 0.004, tint: 1.3 });
      b.cyl('leatherDark', 0.014, 0.016, 0.13, [0, 0, 0], { matrix: M(xform([0, L + 0.083, 0])), seg: 8 });
      b.geo('ironDark', new THREE.SphereGeometry(0.02, 8, 6), [0, 0, 0], { matrix: M(xform([0, L + 0.165, 0])), tint: 1.3 });
    }
  }

  // ---- 바닥의 물통(들통)
  {
    const x = -0.75, z = -0.2, r = 0.15, h = 0.26;
    const bk = barrel(b, x, z, { r, h, staves: 12, key: 'woodPale' });
    out.bucket = bk;
  }
  return out;
}

// 등불(쇠 테두리 + 빛나는 불꽃). 반환: 광원 위치
export function lantern(b, pos) {
  const [x, y, z] = pos;
  b.box('ironDark', [0.13, 0.012, 0.13], [x, y, z], { bevel: 0.003 });
  b.box('ironDark', [0.13, 0.012, 0.13], [x, y + 0.2, z], { bevel: 0.003 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.rod('ironDark', [x + sx * 0.058, y, z + sz * 0.058], [x + sx * 0.058, y + 0.2, z + sz * 0.058], 0.004, 0.004, { seg: 5 });
  const cap = loft([
    [[0.075, 0, 0.075], [-0.075, 0, 0.075], [-0.075, 0, -0.075], [0.075, 0, -0.075]],
    [[0.012, 0.07, 0.012], [-0.012, 0.07, 0.012], [-0.012, 0.07, -0.012], [0.012, 0.07, -0.012]],
  ]);
  b.geo('ironDark', cap, [x, y + 0.206, z], { crease: 20 });
  b.cyl('rock', 0.018, 0.02, 0.07, [x, y + 0.04, z], { seg: 8, tint: [1.6, 1.5, 1.2] });
  return new THREE.Vector3(x, y + 0.1, z);
}
