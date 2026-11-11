// 화덕: 벽돌 몸체, 화구, 석탄 더미, 쇠 덮개(후드)와 굴뚝.
import * as THREE from 'three';
import { loft, creaseNormals, boxUV, xform } from '../geo/builder.js';
import { rectRing } from './anvil.js';
import { ROOM, roofY } from './room.js';

export const FORGE = {
  x0: -2.45, x1: -0.75, z0: -3.0, z1: -1.75, top: 0.84,
  pot: { x0: -1.95, x1: -1.25, z0: -2.76, z1: -2.16 },
};
FORGE.cx = (FORGE.pot.x0 + FORGE.pot.x1) / 2;
FORGE.cz = (FORGE.pot.z0 + FORGE.pot.z1) / 2;
FORGE.fire = new THREE.Vector3(FORGE.cx, FORGE.top + 0.1, FORGE.cz);

// 불규칙한 덩어리(면이 각진 석탄·돌 조각)
export function lumpGeo(rng, flat = 1) {
  const t = (1 + Math.sqrt(5)) / 2;
  const v = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]]
    .map((p) => { const l = Math.hypot(...p) / rng.range(0.72, 1.18); return [p[0] / l, (p[1] / l) * flat, p[2] / l]; });
  const f = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  const pos = new Float32Array(f.length * 9);
  f.forEach((tri, i) => tri.forEach((vi, j) => pos.set(v[vi], i * 9 + j * 3)));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

export function buildForge(b) {
  const F = FORGE, P = F.pot, rng = b.rng;
  const w = F.x1 - F.x0, d = F.z1 - F.z0;
  const mx = (F.x0 + F.x1) / 2, mz = (F.z0 + F.z1) / 2;

  // ---- 몸체
  b.box('rock', [w + 0.1, 0.14, d + 0.07], [mx, 0.07, mz + 0.02], { bevel: 0.02, wobble: 0.006, tint: 0.8 });
  b.box('brick', [w, F.top - 0.1 - 0.14, d], [mx, 0.14 + (F.top - 0.24) / 2, mz], { bevel: 0.006, uvWorld: true });
  // 앞면의 재받이 아치(어두운 개구부)
  b.box('brick', [0.62, 0.42, 0.05], [mx - 0.05, 0.36, F.z1 + 0.005], { bevel: 0.01, tint: 0.04 });
  b.box('rock', [0.78, 0.09, 0.1], [mx - 0.05, 0.62, F.z1 + 0.02], { bevel: 0.015, wobble: 0.004, tint: 0.7 });
  for (const sx of [-1, 1]) b.box('rock', [0.09, 0.44, 0.1], [mx - 0.05 + sx * 0.355, 0.36, F.z1 + 0.02], { bevel: 0.015, wobble: 0.004, tint: 0.7 });

  // ---- 윗판(화구 둘레 4장의 돌판)
  const slabY = F.top - 0.05, ov = 0.035;
  const slab = (x0, x1, z0, z1) => b.box('rock', [x1 - x0, 0.1, z1 - z0], [(x0 + x1) / 2, slabY, (z0 + z1) / 2], { bevel: 0.012, wobble: 0.004, tint: rng.range(0.55, 0.8) });
  slab(F.x0 - ov, P.x0, F.z0, F.z1 + ov);
  slab(P.x1, F.x1 + ov, F.z0, F.z1 + ov);
  slab(P.x0, P.x1, F.z0, P.z0);
  slab(P.x0, P.x1, P.z1, F.z1 + ov);
  // 화구 테두리(쇠)와 바닥
  const rim = 0.022;
  b.box('ironDark', [P.x1 - P.x0 + rim * 2, 0.03, rim], [F.cx, F.top - 0.004, P.z0 - rim / 2 + 0.004], { bevel: 0.004 });
  b.box('ironDark', [P.x1 - P.x0 + rim * 2, 0.03, rim], [F.cx, F.top - 0.004, P.z1 + rim / 2 - 0.004], { bevel: 0.004 });
  b.box('ironDark', [rim, 0.03, P.z1 - P.z0], [P.x0 - rim / 2 + 0.004, F.top - 0.004, F.cz], { bevel: 0.004 });
  b.box('ironDark', [rim, 0.03, P.z1 - P.z0], [P.x1 + rim / 2 - 0.004, F.top - 0.004, F.cz], { bevel: 0.004 });
  b.box('ironDark', [P.x1 - P.x0, 0.02, P.z1 - P.z0], [F.cx, F.top - 0.16, F.cz], { bevel: 0, tint: 0.2 });

  // ---- 석탄 더미(가운데는 달아오르고 가장자리는 식은 석탄)
  const rx = (P.x1 - P.x0) / 2, rz = (P.z1 - P.z0) / 2;
  const coal = (x, y, z, s, flat = 0.75) => {
    const g = boxUV(lumpGeo(rng, flat), b.lib.tile('coal'), 0, [rng(), rng()]);
    b.add('ember', g, xform([x, y, z], [rng() * 6.3, rng() * 6.3, rng() * 6.3], [s, s, s]), rng.range(0.7, 1.2));
  };
  for (let i = 0; i < 330; i++) {
    const a = rng() * Math.PI * 2, r = Math.sqrt(rng());
    const x = F.cx + Math.cos(a) * r * rx * 0.97, z = F.cz + Math.sin(a) * r * rz * 0.97;
    const mound = Math.pow(1 - r, 0.8) * 0.085;
    coal(x, F.top - 0.07 + mound + rng.range(0, 0.035), z, rng.range(0.018, 0.04));
  }
  // 뒤쪽에 쌓아 둔 생석탄, 윗판에 흩어진 조각
  for (let i = 0; i < 90; i++) {
    const x = rng.range(P.x0 - 0.25, P.x1 + 0.3), z = rng.range(F.z0 + 0.03, P.z0 - 0.02);
    const pile = Math.max(0, 0.11 - Math.abs(z - (F.z0 + 0.1)) * 0.5) * (0.5 + 0.5 * Math.sin((x - P.x0) * 2.2));
    coal(x, F.top + 0.012 + rng() * pile, z, rng.range(0.016, 0.036));
  }
  for (let i = 0; i < 40; i++) coal(rng.range(F.x0 + 0.05, F.x1 - 0.05), F.top + 0.008, rng.range(P.z1 + 0.03, F.z1 - 0.03), rng.range(0.006, 0.016));

  // ---- 뒤벽 내화벽돌
  b.box('brick', [w, 0.9, 0.07], [mx, F.top + 0.45, F.z0 + 0.035], { bevel: 0.006, uvWorld: true, tint: 0.55 });

  // ---- 후드(쇠판)와 굴뚝
  const hb = 1.74, ht = 2.5;
  const hood = loft([
    rectRing(mx, hb, mz - 0.03, w / 2 + 0.04, d / 2 - 0.01, 0, 0),
    rectRing(F.cx, ht, F.z0 + 0.3, 0.36, 0.28, 0, 0),
  ], { capStart: false, capEnd: false });
  b.geo('hoodIron', hood, [0, 0, 0], { crease: 20, tint: [1.5, 1.42, 1.35] });
  // 후드 아래 테두리 띠와 리벳
  const lip = (p0, p1) => {
    b.beam('ironDark', p0, p1, 0.014, 0.07, { bevel: 0.003, tint: 0.8 });
    const n = Math.round(Math.hypot(p1[0] - p0[0], p1[2] - p0[2]) / 0.13);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const g = new THREE.SphereGeometry(0.011, 7, 5);
      b.geo('ironDark', g, [p0[0] + (p1[0] - p0[0]) * t, hb + 0.012, p0[2] + (p1[2] - p0[2]) * t], { tint: 0.9 });
    }
  };
  const hx0 = mx - w / 2 - 0.047, hx1 = mx + w / 2 + 0.047, hz1 = mz - 0.03 + d / 2 - 0.003;
  lip([hx0, hb, hz1], [hx1, hb, hz1]);
  lip([hx0, hb, F.z0 + 0.02], [hx0, hb, hz1]);
  lip([hx1, hb, F.z0 + 0.02], [hx1, hb, hz1]);
  // 후드를 들보에 매단 쇠막대
  for (const x of [hx0 + 0.08, hx1 - 0.08]) b.rod('ironDark', [x, hb + 0.02, hz1 - 0.04], [x, roofY(hz1 - 0.04) - 0.05, hz1 - 0.04], 0.008, 0.008, { seg: 6 });
  // 굴뚝
  b.box('brick', [0.78, roofY(F.z0 + 0.3) + 0.5 - ht, 0.6], [F.cx, (ht + roofY(F.z0 + 0.3) + 0.5) / 2, F.z0 + 0.3], { bevel: 0.006, uvWorld: true, tint: 0.6 });
  b.box('ironDark', [0.84, 0.05, 0.66], [F.cx, ht + 0.02, F.z0 + 0.3], { bevel: 0.006, tint: 0.8 });

  // ---- 송풍관과 부지깽이·삽
  b.rod('ironDark', [F.x0 - 0.5, F.top + 0.05, F.cz], [P.x0 + 0.06, F.top - 0.03, F.cz], 0.028, 0.02, { seg: 10 });
  b.rod('ironDark', [F.x1 + 0.1, 0.02, F.z1 + 0.16], [F.x1 + 0.03, 1.02, F.z1 + 0.02], 0.007, 0.007, { seg: 6 });
  b.rod('ironDark', [F.x1 + 0.2, 0.02, F.z1 + 0.1], [F.x1 + 0.05, 0.98, F.z1 - 0.1], 0.008, 0.008, { seg: 6 });
  b.box('ironDark', [0.13, 0.004, 0.17], [F.x1 + 0.212, 0.09, F.z1 + 0.115], { rot: [0.25, 0.4, 0.14], bevel: 0.001 });

  // ---- 바닥의 석탄 더미와 자루
  for (let i = 0; i < 70; i++) {
    const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * 0.42;
    const x = -2.85 + Math.cos(a) * r, z = -1.45 + Math.sin(a) * r * 0.8;
    coal(x, 0.02 + Math.max(0, 0.2 - r * 0.5) * rng(), z, rng.range(0.02, 0.05), 0.85);
  }
  for (const [x, z, s, ry] of [[-3.05, -0.75, 1, 0.3], [-2.75, -0.55, 0.85, 1.2]]) {
    const g = new THREE.SphereGeometry(0.24, 18, 12);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      const k = y < 0 ? 1.08 : 1 - 0.25 * Math.pow(y / 0.24, 2);
      p.setXYZ(i, p.getX(i) * k, Math.max(y, -0.2) * 1.35, p.getZ(i) * k * 0.86);
    }
    g.computeVertexNormals();
    b.geo('burlap', g, [x, 0.27 * s, z], { rot: [0, ry, 0.06], scale: [s, s, s] });
    b.cyl('burlap', 0.05 * s, 0.085 * s, 0.1 * s, [x, 0.6 * s, z], { seg: 8, rot: [0.1, ry, 0.1] });
  }
  return F;
}
