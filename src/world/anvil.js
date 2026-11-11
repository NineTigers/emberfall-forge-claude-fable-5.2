// 모루(런던 패턴)와 받침 통나무.
import * as THREE from 'three';
import { loft, creaseNormals, roundUV, xform } from '../geo/builder.js';

export const ANVIL = { x: 0.05, z: -0.95, stumpH: 0.56, height: 0.3 };
ANVIL.faceY = ANVIL.stumpH + ANVIL.height;

// XZ 평면의 둥근 사각형 고리(+Y 방향 로프트용, 바깥 노멀)
export function rectRing(cx, y, cz, hx, hz, r = 0, n = 3) {
  const pts = [];
  r = Math.min(r, hx, hz);
  const corners = [[1, 1, 0], [-1, 1, Math.PI / 2], [-1, -1, Math.PI], [1, -1, Math.PI * 1.5]];
  for (const [sx, sz, a0] of corners) {
    for (let i = 0; i <= n; i++) {
      const a = a0 + (i / Math.max(n, 1)) * (Math.PI / 2);
      pts.push([cx + sx * (hx - r) + Math.cos(a) * r, y, cz + sz * (hz - r) + Math.sin(a) * r]);
      if (n === 0) break;
    }
  }
  return pts;
}

export function buildAnvil(b) {
  const A = ANVIL;
  const rng = b.rng;
  const base = [A.x, A.stumpH, A.z];

  // ---- 받침 통나무(껍질 + 마구리)
  {
    const r0 = 0.3, h = A.stumpH;
    const g = new THREE.CylinderGeometry(r0 * 0.93, r0, h, 28, 5, true);
    const p = g.attributes.position;
    const shape = (ang, t) => 1 + 0.035 * Math.sin(ang * 3 + 1) + 0.018 * Math.sin(ang * 7 + 2.3) + 0.01 * Math.sin(ang * 13) + 0.14 * Math.pow(1 - t, 4);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const k = shape(Math.atan2(z, x), y / h + 0.5);
      p.setXYZ(i, x * k, y, z * k);
    }
    g.computeVertexNormals();
    roundUV(g, r0, h, b.lib.tile('bark'), true, [rng(), rng()]);
    b.add('bark', g, xform([A.x, h / 2, A.z]), [0.9, 0.86, 0.8]);
    // 윗면(나이테): 가장자리가 껍질 윤곽을 따라가도록 같은 식으로 변형
    const top = new THREE.CircleGeometry(r0 * 0.93, 28);
    const tp = top.attributes.position, tu = top.attributes.uv;
    for (let i = 1; i < tp.count; i++) {
      const x = tp.getX(i), y = tp.getY(i);
      const k = shape(Math.atan2(-y, x), 1);
      tp.setXY(i, x * k, y * k);
    }
    for (let i = 0; i < tp.count; i++) tu.setXY(i, tp.getX(i) / (r0 * 2.1) + 0.5, tp.getY(i) / (r0 * 2.1) + 0.5);
    top.computeVertexNormals();
    b.add('woodEnd', top, xform([A.x, h, A.z], [-Math.PI / 2, 0, 0]));
    // 쇠 테
    for (const [y, rr] of [[h - 0.07, r0 * 0.96], [0.1, r0 * 1.06]]) {
      const band = new THREE.TorusGeometry(rr, 0.007, 6, 40);
      roundUV(band, rr, 0.03, b.lib.tile('ironRust'), false);
      b.add('ironRust', band, xform([A.x, y, A.z], [Math.PI / 2, 0, 0], [1.03, 1.03, 3.2]));
    }
  }

  // ---- 모루 몸체: 높이별 둥근 사각 단면을 로프트
  const rings = [
    [0, 0.0, 0.2, 0.125, 0.012],
    [0, 0.008, 0.203, 0.128, 0.02],
    [0, 0.048, 0.203, 0.128, 0.02],
    [0, 0.062, 0.185, 0.115, 0.03],
    [0, 0.085, 0.15, 0.092, 0.035],
    [0, 0.13, 0.108, 0.066, 0.03],
    [0, 0.175, 0.106, 0.061, 0.022],
    [-0.006, 0.215, 0.135, 0.059, 0.014],
    [-0.02, 0.245, 0.19, 0.059, 0.01],
    [-0.03, 0.268, 0.236, 0.059, 0.007],
    [-0.03, 0.286, 0.237, 0.059, 0.005],
  ].map(([cx, y, hx, hz, r]) => rectRing(cx, y, 0, hx, hz, r, 3));
  b.geo('anvilBody', loft(rings), base, { crease: 38 });

  // 작업면(강철판)
  b.box('steelWorn', [0.477, 0.018, 0.121], [base[0] - 0.03, base[1] + 0.291, base[2]], { bevel: 0.0035, grain: 0, tint: [0.92, 0.93, 0.95] });
  // 단(뿔과 작업면 사이의 낮은 턱)
  b.box('anvilBody', [0.05, 0.085, 0.112], [base[0] + 0.229, base[1] + 0.245, base[2]], { bevel: 0.005, tint: 1.25 });
  // 뿔
  {
    const hr = [];
    const N = 12;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const x = 0.248 + t * 0.285;
      const k = Math.pow(1 - t, 0.82);
      const rz = 0.055 * k + 0.004, ry = 0.046 * k + 0.004;
      const top = 0.288 - 0.01 * t * t;
      const ring = [];
      for (let j = 0; j < 16; j++) {
        const a = (j / 16) * Math.PI * 2;
        ring.push([x, top - ry + ry * Math.cos(a), -rz * Math.sin(a)]);
      }
      hr.push(ring);
    }
    b.geo('steelWorn', loft(hr), base, { crease: 50, tint: (x, y) => { const k = THREE.MathUtils.smoothstep(y, A.faceY - 0.075, A.faceY - 0.01); return [0.42 + 0.4 * k, 0.42 + 0.4 * k, 0.44 + 0.4 * k]; } });
  }
  // 하디 홀, 프리첼 홀(작업면의 구멍)
  b.box('ironDark', [0.026, 0.003, 0.026], [base[0] - 0.222, base[1] + 0.3003, base[2]], { bevel: 0, tint: 0.015 });
  b.cyl('ironDark', 0.007, 0.007, 0.003, [base[0] - 0.252, base[1] + 0.3003, base[2] + 0.03], { seg: 10, tint: 0.015 });

  // 발을 통나무에 고정하는 꺾쇠
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = base[0] + sx * 0.175, z = base[2] + sz * 0.135;
    b.box('ironRust', [0.05, 0.012, 0.018], [x, base[1] + 0.052, z - sz * 0.012], { rot: [0, sx * sz * 0.5, 0], bevel: 0.003 });
    b.box('ironRust', [0.014, 0.07, 0.014], [x + sx * 0.01, base[1] + 0.02, z + sz * 0.004], { bevel: 0.003 });
  }

  // 통나무 옆 가죽 띠와 걸어 둔 연장
  {
    const strap = new THREE.TorusGeometry(0.297, 0.006, 5, 40);
    roundUV(strap, 0.297, 0.05, b.lib.tile('leatherDark'), false);
    b.add('leatherDark', strap, xform([A.x, 0.37, A.z], [Math.PI / 2, 0, 0], [1.04, 1.04, 4.5]));
  }
  return { base };
}
