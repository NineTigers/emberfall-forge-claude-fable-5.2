// 대장간 건물: 바닥, 돌벽(뒤·왼쪽), 판자벽(오른쪽·앞), 창, 지붕 구조.
// 좌표: 플레이어는 원점 부근에서 -Z를 본다. 뒤벽 z=-3.0, 앞벽 z=3.6, 좌우 x=∓3.4.
export const ROOM = { x0: -3.4, x1: 3.4, z0: -3.0, z1: 3.6, H: 2.9, ridgeZ: 0.3, ridgeY: 4.5, wallT: 0.4 };
export const WINDOW = { x0: 1.25, x1: 2.35, y0: 1.35, y1: 2.4 };
const SLOPE = (ROOM.ridgeY - ROOM.H) / (ROOM.ridgeZ - ROOM.z0);
export const THETA = Math.atan(SLOPE);
// 지붕널 아랫면 높이
export const roofY = (z) => ROOM.ridgeY - Math.abs(z - ROOM.ridgeZ) * SLOPE + 0.16;

export function buildRoom(b) {
  const R = ROOM, W = WINDOW, rng = b.rng;
  const T = R.wallT;

  // ---- 바닥
  b.box('flagstone', [8.4, 0.3, 8.2], [0, -0.15, 0.3], { bevel: 0, uvWorld: true });

  // ---- 뒤벽(돌, 창 개구부 주변 4조각)
  const zc = R.z0 - T / 2;
  const stone = { bevel: 0.006, uvWorld: true };
  b.box('stoneWall', [W.x0 - (R.x0 - T), R.H + 0.2, T], [(W.x0 + R.x0 - T) / 2, (R.H + 0.2) / 2, zc], stone);
  b.box('stoneWall', [R.x1 + T - W.x1, R.H + 0.2, T], [(W.x1 + R.x1 + T) / 2, (R.H + 0.2) / 2, zc], stone);
  b.box('stoneWall', [W.x1 - W.x0, W.y0, T], [(W.x0 + W.x1) / 2, W.y0 / 2, zc], stone);
  b.box('stoneWall', [W.x1 - W.x0, R.H + 0.2 - W.y1, T], [(W.x0 + W.x1) / 2, (W.y1 + R.H + 0.2) / 2, zc], stone);
  // 왼벽(돌, 박공까지)
  b.box('stoneWall', [T, R.ridgeY + 0.4, R.z1 - R.z0 + 2 * T], [R.x0 - T / 2, (R.ridgeY + 0.4) / 2, (R.z0 + R.z1) / 2], stone);

  // ---- 창: 상인방, 창대, 나무 창틀
  const wx = (W.x0 + W.x1) / 2, wy = (W.y0 + W.y1) / 2, ww = W.x1 - W.x0, wh = W.y1 - W.y0;
  b.box('woodBeam', [ww + 0.5, 0.2, T + 0.06], [wx, W.y1 + 0.1, zc + 0.03], { bevel: 0.015, wobble: 0.006, grain: 0, tint: 0.8 });
  b.box('stoneWall', [ww + 0.24, 0.08, T + 0.12], [wx, W.y0 - 0.035, zc + 0.06], { bevel: 0.012, tint: [1.15, 1.1, 1.05] });
  const fz = R.z0 - 0.17;
  for (const sx of [-1, 1]) b.box('woodDark', [0.07, wh, 0.09], [wx + sx * (ww / 2 - 0.035), wy, fz], { grain: 1, bevel: 0.006, tint: 0.85 });
  for (const sy of [-1, 1]) b.box('woodDark', [ww - 0.14, 0.07, 0.09], [wx, wy + sy * (wh / 2 - 0.035), fz], { grain: 0, bevel: 0.006, tint: 0.85 });
  b.box('woodDark', [0.05, wh - 0.14, 0.06], [wx, wy, fz], { grain: 1, bevel: 0.005, tint: 0.8 });
  b.box('woodDark', [ww - 0.14, 0.05, 0.06], [wx, wy + 0.06, fz], { grain: 0, bevel: 0.005, tint: 0.8 });
  // 쇠 창살
  for (let i = 0; i < 4; i++) {
    const x = W.x0 + 0.07 + ((i + 0.5) * (ww - 0.14)) / 4 + (i < 2 ? -0.02 : 0.02);
    b.rod('ironRust', [x, W.y0 + 0.02, fz - 0.07], [x, W.y1 - 0.02, fz - 0.07], 0.009, 0.009, { seg: 6 });
  }

  // ---- 오른벽(세로 판자 + 기둥·가로대)
  const plank = (key, axis, coord, from, to, topFn, inward) => {
    let p = from;
    while (p < to - 0.03) {
      const w = Math.min(rng.range(0.15, 0.25), to - p);
      const gap = rng() < 0.2 ? rng.range(0.005, 0.012) : rng.range(0.001, 0.004);
      const c = p + w / 2;
      const top = topFn(c) + rng.range(-0.01, 0.01);
      const tint = rng.range(0.62, 1.0);
      const lean = rng.range(-0.004, 0.004);
      const th = 0.028;
      if (axis === 'x') b.box(key, [th, top, w - gap], [coord + inward * rng.range(0, 0.006), top / 2, c], { grain: 1, bevel: 0.003, wobble: 0.003, tint: [tint, tint * 0.98, tint * 0.95], rot: [lean, 0, 0] });
      else b.box(key, [w - gap, top, th], [c, top / 2, coord + inward * rng.range(0, 0.006)], { grain: 1, bevel: 0.003, wobble: 0.003, tint: [tint, tint * 0.98, tint * 0.95], rot: [0, 0, lean] });
      p += w;
    }
  };
  plank('woodDark', 'x', R.x1 + 0.014, R.z0 - 0.1, R.z1 + 0.1, (z) => roofY(Math.min(Math.max(z, R.z0), R.z1)) + 0.02, 1);
  for (const z of [R.z0 + 0.08, -1.35, 0.3, 1.95, R.z1 - 0.08]) {
    b.box('woodBeam', [0.17, roofY(z) - 0.02, 0.17], [R.x1 - 0.085, (roofY(z) - 0.02) / 2, z], { grain: 1, bevel: 0.012, wobble: 0.006, tint: 0.9 });
  }
  for (const y of [0.95, 1.95]) b.box('woodBeam', [0.08, 0.11, R.z1 - R.z0], [R.x1 - 0.04, y, (R.z0 + R.z1) / 2], { grain: 2, bevel: 0.008, wobble: 0.004, tint: 0.85 });
  // 가새
  b.beam('woodBeam', [R.x1 - 0.06, 1.0, -1.25], [R.x1 - 0.06, 1.9, -0.5], 0.07, 0.1, { bevel: 0.008, tint: 0.85 });
  b.beam('woodBeam', [R.x1 - 0.06, 1.0, 1.85], [R.x1 - 0.06, 1.9, 1.1], 0.07, 0.1, { bevel: 0.008, tint: 0.85 });

  // ---- 앞벽(플레이어 뒤쪽, 판자 + 큰 문)
  plank('woodDark', 'z', R.z1 + 0.014, R.x0, -0.95, () => R.H + 0.2, 1);
  plank('woodDark', 'z', R.z1 + 0.014, 0.95, R.x1, () => R.H + 0.2, 1);
  plank('woodDark', 'z', R.z1 + 0.05, -0.95, 0.95, () => 2.25, 1);
  b.box('woodDark', [1.9, R.H + 0.2 - 2.25, 0.03], [0, (R.H + 0.2 + 2.25) / 2, R.z1 + 0.014], { grain: 0, tint: 0.8 });
  for (const x of [R.x0 + 0.085, -1.04, 1.04, R.x1 - 0.085]) b.box('woodBeam', [0.17, R.H, 0.17], [x, R.H / 2, R.z1 - 0.085], { grain: 1, bevel: 0.012, wobble: 0.006 });
  b.box('woodBeam', [2.25, 0.18, 0.17], [0, 2.34, R.z1 - 0.085], { grain: 0, bevel: 0.012 });
  for (const y of [0.55, 1.75]) b.box('ironDark', [1.84, 0.06, 0.012], [0, y, R.z1 + 0.03], { bevel: 0.002 });
  b.beam('woodDark', [-0.9, 0.62, R.z1 + 0.03], [0.9, 1.68, R.z1 + 0.03], 0.03, 0.14, { bevel: 0.004, tint: 0.8 });

  // ---- 지붕 구조
  const beam = { bevel: 0.014, wobble: 0.007 };
  // 벽 위 도리
  b.box('woodBeam', [R.x1 - R.x0 + 0.3, 0.17, 0.2], [0, R.H + 0.085, R.z0 + 0.06], { ...beam, grain: 0 });
  b.box('woodBeam', [R.x1 - R.x0 + 0.3, 0.17, 0.2], [0, R.H + 0.085, R.z1 - 0.06], { ...beam, grain: 0 });
  // 마룻대
  b.box('woodBeam', [R.x1 - R.x0 + 0.6, 0.2, 0.13], [0, roofY(R.ridgeZ) - 0.1, R.ridgeZ], { ...beam, grain: 0 });
  const zE0 = R.z0 - 0.5, zE1 = R.z1 + 0.5;
  // 트러스(대들보, 왕대공, 빗대공, 주 서까래)
  for (const x of [-1.7, 1.7]) {
    b.box('woodBeam', [0.21, 0.25, R.z1 - R.z0 + 0.2], [x, R.H - 0.125, (R.z0 + R.z1) / 2], { ...beam, grain: 2, tint: 0.9 });
    b.box('woodBeam', [0.16, roofY(R.ridgeZ) - 0.15 - R.H, 0.16], [x, (R.H + roofY(R.ridgeZ) - 0.15) / 2, R.ridgeZ], { ...beam, grain: 1 });
    for (const s of [-1, 1]) {
      b.beam('woodBeam', [x, roofY(R.ridgeZ) - 0.22, R.ridgeZ], [x, roofY(R.ridgeZ + s * 3.75) - 0.22, R.ridgeZ + s * 3.75], 0.14, 0.2, beam);
      b.beam('woodBeam', [x, R.H + 0.05, R.ridgeZ + s * 0.1], [x, roofY(R.ridgeZ + s * 1.55) - 0.3, R.ridgeZ + s * 1.55], 0.11, 0.12, { bevel: 0.01 });
    }
  }
  // 서까래
  for (let x = -3.5; x <= 3.51; x += 0.58) {
    if (Math.abs(Math.abs(x) - 1.7) < 0.2) continue;
    const jx = x + rng.range(-0.03, 0.03);
    for (const s of [-1, 1]) {
      const ze = s < 0 ? zE0 : zE1;
      b.beam('woodBeam', [jx, roofY(R.ridgeZ) - 0.07, R.ridgeZ], [jx, roofY(ze) - 0.07, ze], 0.075, 0.13, { bevel: 0.008, wobble: 0.004, tint: rng.range(0.75, 1) });
    }
  }
  // 지붕널: 뒤쪽 경사에는 햇빛이 새는 틈을 몇 군데 둔다.
  const bw = 0.205, th = 0.016;
  const slopeLen = (R.ridgeZ - zE0) / Math.cos(THETA);
  const n = Math.ceil(slopeLen / bw);
  const xA = R.x0 - T - 0.3, xB = R.x1 + 0.35;
  // 틈: [널 번호, 중심 x, 길이(널 방향 틈)] / 좁은 널: [널 번호, x0, x1]
  const holes = [[5, -0.4, 0.07], [8, 1.1, 0.09], [11, -2.2, 0.06], [13, 0.3, 0.08], [15, 2.3, 0.07], [9, -1.2, 0.05]];
  const narrow = [[7, -0.9, 0.9], [12, 0.6, 2.4], [16, -2.6, -1.0]];
  for (const s of [-1, 1]) {
    for (let i = 0; i < n; i++) {
      const d = (i + 0.5) * bw * Math.cos(THETA);
      const z = s < 0 ? zE0 + d : zE1 - d;
      const y = roofY(z) + th / 2;
      const cuts = [xA];
      for (const h of holes) if (s < 0 && h[0] === i) cuts.push(h[1]);
      const joint = rng.range(-2.5, 2.5);
      if (!cuts.some((c) => Math.abs(c - joint) < 0.5)) cuts.push(joint);
      cuts.push(xB);
      cuts.sort((p, q) => p - q);
      for (let k = 0; k < cuts.length - 1; k++) {
        let a = cuts[k], c = cuts[k + 1];
        const hA = holes.find((h) => s < 0 && h[0] === i && h[1] === a), hC = holes.find((h) => s < 0 && h[0] === i && h[1] === c);
        if (hA) a += hA[2] / 2;
        if (hC) c -= hC[2] / 2;
        const nr = narrow.find((q) => s < 0 && q[0] === i);
        const tint = rng.range(0.55, 0.95);
        const put = (x0, x1, w, dz) => {
          if (x1 - x0 < 0.02) return;
          b.box('woodDark', [x1 - x0, th, w], [(x0 + x1) / 2, y + rng.range(-0.002, 0.002), z + dz], { rot: [s * THETA, 0, 0], grain: 0, bevel: 0.002, tint: [tint, tint * 0.97, tint * 0.93] });
        };
        const full = bw - rng.range(0.001, 0.004);
        if (nr && nr[1] < c && nr[2] > a) {
          put(a, Math.max(a, nr[1]), full, 0);
          put(Math.max(a, nr[1]), Math.min(c, nr[2]), full - 0.034, -0.017);
          put(Math.min(c, nr[2]), c, full, 0);
        } else put(a, c, full, 0);
      }
    }
  }
}
