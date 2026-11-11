// 지오메트리 도구: 모서리 깎은 상자, 자동 UV, 재질별 병합 빌더.
import * as THREE from 'three';

export function makeRng(seed = 1) {
  let a = seed >>> 0;
  const r = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.range = (lo, hi) => lo + (hi - lo) * r();
  r.pick = (arr) => arr[Math.floor(r() * arr.length)];
  r.sign = () => (r() < 0.5 ? -1 : 1);
  return r;
}

const _m = new THREE.Matrix4();
const _n = new THREE.Matrix3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

export function xform(pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1], out = new THREE.Matrix4()) {
  _e.set(rot[0], rot[1], rot[2], 'XYZ');
  _q.setFromEuler(_e);
  _p.set(pos[0], pos[1], pos[2]);
  if (typeof scale === 'number') _s.set(scale, scale, scale); else _s.set(scale[0], scale[1], scale[2]);
  return out.compose(_p, _q, _s);
}

// 모서리를 깎은 상자. 면마다 정점 4개(면 노멀)를 두고 모서리·꼭짓점을 이어
// 깎인 면에서 노멀이 보간되게 한다(둥근 모서리처럼 하이라이트가 잡힌다).
// opts: bevel, tile[u,v], grain(0|1|2: 결 방향 축), uvOff[2], wobble(꼭짓점 흔들림, m), rng
export function chamferBox(w, h, d, opts = {}) {
  const hs = [w / 2, h / 2, d / 2];
  const b = Math.max(0, Math.min(opts.bevel ?? 0.004, hs[0] * 0.45, hs[1] * 0.45, hs[2] * 0.45));
  const tile = opts.tile ?? [1, 1];
  const grain = opts.grain ?? (w >= h && w >= d ? 0 : h >= d ? 1 : 2);
  const off = opts.uvOff ?? [0, 0];
  const rng = opts.rng;
  const wob = opts.wobble && rng ? opts.wobble : 0;
  const jitter = [];
  for (let i = 0; i < 8; i++) jitter.push(wob ? [rng.range(-wob, wob), rng.range(-wob, wob), rng.range(-wob, wob)] : [0, 0, 0]);
  const cornerIndex = (c) => (c[0] > 0 ? 1 : 0) | (c[1] > 0 ? 2 : 0) | (c[2] > 0 ? 4 : 0);

  const vert = (a, c) => {
    const j = jitter[cornerIndex(c)];
    const p = [0, 0, 0];
    for (let k = 0; k < 3; k++) p[k] = (k === a ? c[k] * hs[k] : c[k] * (hs[k] - b)) + j[k];
    return { p, a, s: c[a] };
  };
  const tris = [];
  const pushTri = (v0, v1, v2) => {
    const ax = v1.p[0] - v0.p[0], ay = v1.p[1] - v0.p[1], az = v1.p[2] - v0.p[2];
    const bx = v2.p[0] - v0.p[0], by = v2.p[1] - v0.p[1], bz = v2.p[2] - v0.p[2];
    const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    const cx = v0.p[0] + v1.p[0] + v2.p[0], cy = v0.p[1] + v1.p[1] + v2.p[1], cz = v0.p[2] + v1.p[2] + v2.p[2];
    if (nx * cx + ny * cy + nz * cz < 0) tris.push(v0, v2, v1); else tris.push(v0, v1, v2);
  };
  const corner = (a, sa, u, su, v, sv) => { const c = [0, 0, 0]; c[a] = sa; c[u] = su; c[v] = sv; return c; };

  for (let a = 0; a < 3; a++) {
    const u = (a + 1) % 3, v = (a + 2) % 3;
    for (const s of [-1, 1]) {
      const q = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([su, sv]) => vert(a, corner(a, s, u, su, v, sv)));
      pushTri(q[0], q[1], q[2]);
      pushTri(q[0], q[2], q[3]);
    }
  }
  if (b > 0) {
    for (let e = 0; e < 3; e++) {
      const u = (e + 1) % 3, v = (e + 2) % 3;
      for (const su of [-1, 1]) for (const sv of [-1, 1]) {
        const c0 = corner(e, -1, u, su, v, sv), c1 = corner(e, 1, u, su, v, sv);
        const A0 = vert(u, c0), A1 = vert(u, c1), B0 = vert(v, c0), B1 = vert(v, c1);
        pushTri(A0, A1, B1);
        pushTri(A0, B1, B0);
      }
    }
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
      const c = [sx, sy, sz];
      pushTri(vert(0, c), vert(1, c), vert(2, c));
    }
  }

  const n = tris.length;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const t = tris[i];
    pos.set(t.p, i * 3);
    nor[i * 3 + t.a] = t.s;
    const u = (t.a + 1) % 3, v = (t.a + 2) % 3;
    const U = v === grain ? v : u;
    const V = U === u ? v : u;
    const fo = (t.a * 2 + (t.s > 0 ? 1 : 0)) * 0.173;
    uv[i * 2] = t.p[U] / tile[0] + off[0] + fo;
    uv[i * 2 + 1] = t.p[V] / tile[1] + off[1] + fo * 1.7;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

// 임의 지오메트리를 삼각형별 상자 투영으로 UV 전개(인덱스 없는 지오메트리로 반환).
export function boxUV(geo, tile = [1, 1], grain = 0, off = [0, 0]) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (!g.attributes.normal) g.computeVertexNormals();
  const pos = g.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c.fromBufferAttribute(pos, i + 2);
    n.subVectors(b, a).cross(_p.subVectors(c, a));
    const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
    const k = ax >= ay && ax >= az ? 0 : ay >= az ? 1 : 2;
    const u = (k + 1) % 3, v = (k + 2) % 3;
    const U = v === grain ? v : u;
    const V = U === u ? v : u;
    const fo = k * 0.31;
    for (let j = 0; j < 3; j++) {
      const p = j === 0 ? a : j === 1 ? b : c;
      uv[(i + j) * 2] = p.getComponent(U) / tile[0] + off[0] + fo;
      uv[(i + j) * 2 + 1] = p.getComponent(V) / tile[1] + off[1] + fo;
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

// 회전체(원기둥·선반 가공체) UV: 기존 u(둘레 0..1)를 이용해 이음매 없이 타일링.
// radius: 둘레 길이 계산용 대표 반지름, length: 축 방향 길이, along: true면 결(U)이 축 방향.
export function roundUV(geo, radius, length, tile = [1, 1], along = true, off = [0, 0]) {
  const g = geo;
  const uv = g.attributes.uv, nor = g.attributes.normal, pos = g.attributes.position;
  const circ = 2 * Math.PI * radius;
  for (let i = 0; i < uv.count; i++) {
    const cap = Math.abs(nor.getY(i)) > 0.98 && Math.abs(nor.getX(i)) + Math.abs(nor.getZ(i)) < 0.05;
    if (cap) {
      uv.setXY(i, pos.getX(i) / tile[0] + off[0], pos.getZ(i) / tile[1] + off[1]);
    } else if (along) {
      const reps = Math.max(1, Math.round(circ / tile[1]));
      uv.setXY(i, (uv.getY(i) * length) / tile[0] + off[0], uv.getX(i) * reps + off[1]);
    } else {
      const reps = Math.max(1, Math.round(circ / tile[0]));
      uv.setXY(i, uv.getX(i) * reps + off[0], (uv.getY(i) * length) / tile[1] + off[1]);
    }
  }
  uv.needsUpdate = true;
  return g;
}

// 단면 고리들을 이어 붙인 로프트(모두 같은 점 수의 닫힌 고리). 반환: 인덱스 없는 지오메트리.
export function loft(rings, { capStart = true, capEnd = true, closed = true } = {}) {
  const tris = [];
  const N = rings[0].length;
  const lim = closed ? N : N - 1;
  for (let r = 0; r < rings.length - 1; r++) {
    const A = rings[r], B = rings[r + 1];
    for (let i = 0; i < lim; i++) {
      const j = (i + 1) % N;
      tris.push(A[i], B[i], B[j], A[i], B[j], A[j]);
    }
  }
  const cap = (ring, flip) => {
    const c = [0, 0, 0];
    for (const p of ring) { c[0] += p[0] / N; c[1] += p[1] / N; c[2] += p[2] / N; }
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      if (flip) tris.push(c, ring[j], ring[i]); else tris.push(c, ring[i], ring[j]);
    }
  };
  if (capStart) cap(rings[0], false);
  if (capEnd) cap(rings[rings.length - 1], true);
  const pos = new Float32Array(tris.length * 3);
  tris.forEach((p, i) => pos.set(p, i * 3));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return g;
}

// 꺾임각 기준 스무딩 노멀(인덱스 없는 지오메트리). 같은 위치의 면 노멀 중 각도 이내만 평균.
export function creaseNormals(geo, angleDeg = 40) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const pos = g.attributes.position;
  const count = pos.count;
  const face = new Float32Array(count);
  const fn = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < count; i += 3) {
    a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c.fromBufferAttribute(pos, i + 2);
    const n = new THREE.Vector3().subVectors(b, a).cross(c.sub(a));
    const area = n.length();
    n.normalize();
    fn.push({ n, area });
    face[i] = face[i + 1] = face[i + 2] = i / 3;
  }
  const map = new Map();
  const key = (i) => `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`;
  for (let i = 0; i < count; i++) {
    const k = key(i);
    let arr = map.get(k);
    if (!arr) map.set(k, (arr = []));
    arr.push(i);
  }
  const cosT = Math.cos(THREE.MathUtils.degToRad(angleDeg));
  const nor = new Float32Array(count * 3);
  const acc = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    const me = fn[face[i]];
    acc.set(0, 0, 0);
    for (const j of map.get(key(i))) {
      const o = fn[face[j]];
      if (o.area > 0 && me.n.dot(o.n) >= cosT) acc.addScaledVector(o.n, o.area);
    }
    if (acc.lengthSq() === 0) acc.copy(me.n);
    acc.normalize();
    nor[i * 3] = acc.x; nor[i * 3 + 1] = acc.y; nor[i * 3 + 2] = acc.z;
  }
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return g;
}

function toColor(t) {
  if (t == null) return [1, 1, 1];
  if (typeof t === 'number') return [t, t, t];
  return t;
}

// 재질 키별로 지오메트리를 모았다가 한 번에 병합한다.
export class Builder {
  constructor(lib, seed = 7) {
    this.lib = lib;
    this.rng = makeRng(seed);
    this.buckets = new Map();
    this.matOf = new Map();
  }
  // 키에 재질을 연결한다. 키가 표면 이름과 같으면 생략 가능.
  material(key, material) { this.matOf.set(key, material); return key; }
  _tile(key) {
    const m = this.matOf.get(key);
    const surface = m?.userData?.surface ?? key;
    try { return this.lib.tile(surface); } catch { return [1, 1]; }
  }
  // 이미 UV가 준비된 지오메트리를 변환·착색해 버킷에 넣는다.
  // extra.uvWorld = [tileU, tileV]: 변환 뒤 월드 좌표로 UV를 다시 계산(벽·바닥처럼 여러 조각이 이어지는 면).
  add(key, geo, matrix, tint, extra) {
    let g = geo.index ? geo.toNonIndexed() : geo;
    if (!g.attributes.normal) g.computeVertexNormals();
    const count = g.attributes.position.count;
    const pos = new Float32Array(g.attributes.position.array.subarray(0, count * 3));
    const nor = new Float32Array(g.attributes.normal.array.subarray(0, count * 3));
    const uv = g.attributes.uv ? new Float32Array(g.attributes.uv.array.subarray(0, count * 2)) : new Float32Array(count * 2);
    if (matrix && matrix.determinant() < 0) {
      // 거울 변환이면 삼각형 감김 방향을 뒤집어 앞면을 유지한다.
      for (let i = 0; i < count; i += 3) {
        for (let k = 0; k < 3; k++) { const t = pos[(i + 1) * 3 + k]; pos[(i + 1) * 3 + k] = pos[(i + 2) * 3 + k]; pos[(i + 2) * 3 + k] = t; }
        for (let k = 0; k < 3; k++) { const t = nor[(i + 1) * 3 + k]; nor[(i + 1) * 3 + k] = nor[(i + 2) * 3 + k]; nor[(i + 2) * 3 + k] = t; }
        for (let k = 0; k < 2; k++) { const t = uv[(i + 1) * 2 + k]; uv[(i + 1) * 2 + k] = uv[(i + 2) * 2 + k]; uv[(i + 2) * 2 + k] = t; }
      }
    }
    if (matrix) {
      _n.getNormalMatrix(matrix);
      const e = matrix.elements, ne = _n.elements;
      for (let i = 0; i < count; i++) {
        const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
        pos[i * 3] = e[0] * x + e[4] * y + e[8] * z + e[12];
        pos[i * 3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
        pos[i * 3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
        const nx = nor[i * 3], ny = nor[i * 3 + 1], nz = nor[i * 3 + 2];
        let ax = ne[0] * nx + ne[3] * ny + ne[6] * nz, ay = ne[1] * nx + ne[4] * ny + ne[7] * nz, az = ne[2] * nx + ne[5] * ny + ne[8] * nz;
        const l = Math.hypot(ax, ay, az) || 1;
        nor[i * 3] = ax / l; nor[i * 3 + 1] = ay / l; nor[i * 3 + 2] = az / l;
      }
    }
    if (extra?.uvWorld) {
      const [tu, tv] = extra.uvWorld;
      for (let i = 0; i < count; i++) {
        const ax = Math.abs(nor[i * 3]), ay = Math.abs(nor[i * 3 + 1]), az = Math.abs(nor[i * 3 + 2]);
        const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
        if (ay >= ax && ay >= az) { uv[i * 2] = x / tu; uv[i * 2 + 1] = z / tv; }
        else if (ax >= az) { uv[i * 2] = z / tu + 0.37; uv[i * 2 + 1] = y / tv; }
        else { uv[i * 2] = x / tu; uv[i * 2 + 1] = y / tv; }
      }
    }
    const col = new Float32Array(count * 3);
    if (typeof tint === 'function') {
      for (let i = 0; i < count; i++) { const c = toColor(tint(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2])); col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2]; }
    } else {
      const c = toColor(tint);
      for (let i = 0; i < count; i++) { col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2]; }
    }
    let bucket = this.buckets.get(key);
    if (!bucket) this.buckets.set(key, (bucket = { parts: [], count: 0 }));
    bucket.parts.push({ pos, nor, uv, col });
    bucket.count += count;
    return this;
  }
  // 상자. o: rot, bevel, tint, grain, wobble, tileScale
  box(key, size, pos, o = {}) {
    const tile = this._tile(key);
    const ts = o.tileScale ?? 1;
    const g = chamferBox(size[0], size[1], size[2], {
      bevel: o.bevel, grain: o.grain, wobble: o.wobble, rng: this.rng,
      tile: [tile[0] * ts, tile[1] * ts], uvOff: [this.rng(), this.rng()],
    });
    return this.add(key, g, o.matrix ?? xform(pos, o.rot, o.scale, _m), o.tint, o.uvWorld ? { uvWorld: [tile[0] * ts, tile[1] * ts] } : undefined);
  }
  // 두 점을 잇는 각재(단면 w x h). 로컬 Z가 p0->p1 방향. o.roll: 축 둘레 회전.
  beam(key, p0, p1, w, h, o = {}) {
    const a = new THREE.Vector3(...p0), c = new THREE.Vector3(...p1);
    const dir = new THREE.Vector3().subVectors(c, a);
    const len = dir.length() + (o.extend ?? 0);
    dir.normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    // 단면의 '위'(로컬 Y)가 가능한 한 월드 위쪽을 향하게 축 둘레로 정렬한다.
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    const want = new THREE.Vector3(0, 1, 0).addScaledVector(dir, -dir.y);
    if (want.lengthSq() > 1e-6) {
      want.normalize();
      const ang = Math.atan2(new THREE.Vector3().crossVectors(up, want).dot(dir), up.dot(want));
      q.premultiply(new THREE.Quaternion().setFromAxisAngle(dir, ang));
    }
    if (o.roll) q.premultiply(new THREE.Quaternion().setFromAxisAngle(dir, o.roll));
    const mid = a.add(c).multiplyScalar(0.5);
    const matrix = new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, 1));
    return this.box(key, [w, h, len], [0, 0, 0], { grain: 2, ...o, matrix });
  }
  // 원기둥(축 = 로컬 Y). o: rot, seg, tint, along(결이 축 방향인지), open, taper 대신 rTop/rBot
  cyl(key, rTop, rBot, height, pos, o = {}) {
    const tile = this._tile(key);
    const g = new THREE.CylinderGeometry(rTop, rBot, height, o.seg ?? 16, o.hseg ?? 1, o.open ?? false);
    roundUV(g, (rTop + rBot) / 2, height, tile, o.along ?? true, [this.rng(), this.rng()]);
    return this.add(key, g, o.matrix ?? xform(pos, o.rot, o.scale, _m), o.tint);
  }
  // 두 점을 잇는 원통(쇠막대, 자루 등)
  rod(key, p0, p1, r0, r1 = r0, o = {}) {
    const a = new THREE.Vector3(...p0), c = new THREE.Vector3(...p1);
    const dir = new THREE.Vector3().subVectors(c, a);
    const len = dir.length();
    dir.normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    const matrix = new THREE.Matrix4().compose(a.add(c).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1));
    return this.cyl(key, r1, r0, len, [0, 0, 0], { seg: 10, ...o, matrix });
  }
  // 임의 지오메트리. o.uv: 'box'(기본) | 'keep', o.grain, o.crease(도)
  geo(key, geometry, pos = [0, 0, 0], o = {}) {
    let g = geometry;
    if (o.crease != null) g = creaseNormals(g, o.crease);
    if ((o.uv ?? 'box') === 'box') {
      const tile = this._tile(key);
      const ts = o.tileScale ?? 1;
      g = boxUV(g, [tile[0] * ts, tile[1] * ts], o.grain ?? 0, [this.rng(), this.rng()]);
    }
    return this.add(key, g, o.matrix ?? xform(pos, o.rot, o.scale, _m), o.tint);
  }
  mesh(key) {
    const bucket = this.buckets.get(key);
    if (!bucket) return null;
    const n = bucket.count;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), col = new Float32Array(n * 3);
    let o = 0;
    for (const p of bucket.parts) {
      pos.set(p.pos, o * 3); nor.set(p.nor, o * 3); uv.set(p.uv, o * 2); col.set(p.col, o * 3);
      o += p.pos.length / 3;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    const material = this.matOf.get(key) ?? this.lib.get(key);
    const mesh = new THREE.Mesh(g, material);
    mesh.name = key;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }
  build(name = 'built') {
    const group = new THREE.Group();
    group.name = name;
    let tris = 0;
    for (const key of this.buckets.keys()) {
      const m = this.mesh(key);
      tris += m.geometry.attributes.position.count / 3;
      group.add(m);
    }
    group.userData.tris = tris;
    this.buckets.clear();
    return group;
  }
}
