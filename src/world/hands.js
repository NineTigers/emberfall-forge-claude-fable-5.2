// 1인칭 팔: 오른손(망치)과 왼손(집게로 칼날을 잡음). 장갑과 소매로 덮은 형태.
// 모든 부품은 "내리친 순간" 자세의 월드 좌표로 만들고, 팔꿈치를 중심으로 회전시킨다.
import * as THREE from 'three';
import { Builder, xform } from '../geo/builder.js';
import { hammer, tongs } from './props.js';
import { BLADE_LEN } from './blade.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const rad = THREE.MathUtils.degToRad;

// 쥔 손. M: 쥠 좌표계 -> 월드. 쥠 좌표계: X = 자루 축(망치 머리 쪽), 손바닥은 -Z, 손가락은 +Z로 감긴다.
// elbow: 쥠 좌표계에서 팔꿈치로 향하는 단위 벡터(XY 평면).
function buildHand(b, M, { r = 0.016, elbow, forearm = 0.27, keys, shoulder = null }) {
  const W = (x, y, z) => V(x, y, z).applyMatrix4(M).toArray();
  const ball = (p, rr, key = keys.glove, tint) => b.geo(key, new THREE.SphereGeometry(rr, 10, 8), p, { tint });
  const fingers = [
    { x: 0.0335, fr: 0.0099, end: -100, k: 0.004 },
    { x: 0.0115, fr: 0.0103, end: -106, k: 0.0045 },
    { x: -0.0105, fr: 0.0099, end: -101, k: 0.004 },
    { x: -0.0315, fr: 0.0088, end: -92, k: 0.003 },
  ];
  for (const f of fingers) {
    const ang = [130, 82, 28, -32, f.end];
    const pts = ang.map((deg, i) => {
      const th = rad(deg), R = r + f.fr + 0.0022 + (i === 0 ? f.k : 0);
      return W(f.x * (1 - i * 0.012), R * Math.sin(th), R * Math.cos(th));
    });
    const tint = [0.95, 0.9, 0.84];
    for (let i = 0; i < pts.length; i++) {
      ball(pts[i], f.fr * (i === 0 ? 1.18 : 1.03), keys.glove, tint);
      if (i < pts.length - 1) b.rod(keys.glove, pts[i], pts[i + 1], f.fr, f.fr * 0.97, { seg: 9, tint });
    }
  }
  // 손바닥 덩어리(손등 쪽), 손등 덧가죽
  const pz = -(r + 0.0175);
  b.box(keys.glove, [0.096, 0.088, 0.035], [0, 0, 0], { matrix: new THREE.Matrix4().multiplyMatrices(M, xform([0, -0.014, pz])), bevel: 0.013, grain: 0 });
  b.box(keys.cuff, [0.074, 0.056, 0.008], [0, 0, 0], { matrix: new THREE.Matrix4().multiplyMatrices(M, xform([0, -0.008, pz - 0.019])), bevel: 0.0035, grain: 0, tint: 1.25 });
  // 엄지: 검지 옆(머리 쪽)에서 자루 아래를 감아 앞쪽으로
  {
    const tr = 0.0112, R = r + tr + 0.002;
    const ang = [-158, -102, -44, 10];
    const pts = ang.map((deg, i) => { const th = rad(deg); return W(0.05 + i * 0.004, R * Math.sin(th), R * Math.cos(th)); });
    for (let i = 0; i < pts.length; i++) {
      ball(pts[i], tr * (i === 0 ? 1.35 : 1.04));
      if (i < pts.length - 1) b.rod(keys.glove, pts[i], pts[i + 1], tr * (i === 0 ? 1.2 : 1), tr, { seg: 9 });
    }
    // 엄지 두덩
    b.geo(keys.glove, new THREE.SphereGeometry(1, 12, 9), [0, 0, 0], { matrix: new THREE.Matrix4().multiplyMatrices(M, xform([0.026, -0.04, pz + 0.006], [0, 0, 0.3], [0.036, 0.027, 0.021])) });
  }
  // 손목 -> 팔뚝(소맷부리 가죽 + 천 소매)
  const wrist = V(-0.008, -0.058, pz);
  const along = (d) => W(wrist.x + elbow.x * d, wrist.y + elbow.y * d, wrist.z + elbow.z * d);
  b.rod(keys.glove, along(-0.012), along(0.03), 0.033, 0.035, { seg: 14 });
  b.rod(keys.cuff, along(0.02), along(0.09), 0.0365, 0.047, { seg: 16 });
  b.rod(keys.cuff, along(0.086), along(0.097), 0.049, 0.049, { seg: 16, tint: 1.3 });
  // 걷어 올린 소매(두 겹 말린 단)와 팔뚝
  b.rod(keys.sleeve, along(0.1), along(0.128), 0.0445, 0.0455, { seg: 16, tint: 1.2 });
  b.rod(keys.sleeve, along(0.124), along(0.15), 0.0425, 0.044, { seg: 16, tint: 1.05 });
  b.rod(keys.sleeve, along(0.08), along(forearm), 0.037, 0.046, { seg: 16, along: true });
  // 팔꿈치와 위팔: 화면 밖(어깨)까지 이어지게
  const el = along(forearm);
  b.geo(keys.sleeve, new THREE.SphereGeometry(0.0475, 14, 10), el);
  if (shoulder) b.rod(keys.sleeve, el, shoulder.toArray(), 0.046, 0.052, { seg: 16, along: true });
  return { wrist: along(0), elbow: el };
}

function basisFrom(X, e, mirror) {
  const x = X.clone().normalize();
  const y = e.clone().addScaledVector(x, -e.dot(x)).multiplyScalar(-1).normalize();
  const z = new THREE.Vector3().crossVectors(x, y);
  if (mirror) z.multiplyScalar(-1);
  return { x, y, z, elbowLocal: V(e.dot(x), e.dot(y), 0).normalize() };
}

export function buildArms(app, lib, blade, faceY) {
  const { scene } = app;
  const fp = (surface, key, opts = {}) => lib.get(surface, { grime: false, ...opts }, key);
  const register = (b) => {
    b.material('gloveFP', fp('leather', 'gloveFP'));
    b.material('cuffFP', fp('leatherDark', 'cuffFP'));
    b.material('sleeveFP', fp('cloth', 'sleeveFP'));
    b.material('ironFP', fp('ironDark', 'ironFP'));
    b.material('steelFP', fp('steelWorn', 'steelFP'));
    b.material('handleFP', fp('woodHandle', 'handleFP'));
  };
  const keys = { glove: 'gloveFP', cuff: 'cuffFP', sleeve: 'sleeveFP' };
  const up = V(0, 1, 0);

  // ---- 칼날 자리: 모루 면 위, 슴베가 왼쪽으로 조금 나오게
  const yaw = rad(10);
  const origin = V(-0.265, faceY + 0.0005, -0.905);
  const bx = V(Math.cos(yaw), 0, -Math.sin(yaw));
  const bladeMatrix = new THREE.Matrix4().makeRotationY(yaw).setPosition(origin);
  const pointOn = (s, lift = 0) => origin.clone().addScaledVector(bx, s * BLADE_LEN).add(V(0, lift, 0));

  // ---- 오른팔 + 망치(기준 타격점 s0에서 내리친 자세)
  const s0 = 0.58;
  const T0 = pointOn(s0, 0.012);
  const d = V(0.36, 0.03, 0.93).normalize();          // 머리 -> 손
  const head = [0.118, 0.047, 0.047];
  const headC = T0.clone().add(V(0, head[0] * 0.5 + 0.004, 0));
  const bR = new Builder(lib, 501);
  register(bR);
  {
    const Y = d.clone().multiplyScalar(-1);
    const X = up.clone().addScaledVector(Y, -up.dot(Y)).normalize();
    const Z = new THREE.Vector3().crossVectors(X, Y);
    const m = new THREE.Matrix4().makeBasis(X, Y, Z).setPosition(headC);
    hammer(bR, null, { matrix: m, head, handle: 0.335, tint: 0.82, keys: { steel: 'steelFP', wood: 'handleFP' }, woodTint: [0.5, 0.45, 0.4] });
  }
  const gripR = headC.clone().addScaledVector(d, 0.212).add(V(0, -head[1] * 0.0, 0));
  const eR = V(0.36, 0.6, 0.72).normalize();
  const fR = basisFrom(d.clone().multiplyScalar(-1), eR, false);
  const MR = new THREE.Matrix4().makeBasis(fR.x, fR.y, fR.z).setPosition(gripR);
  const armRInfo = buildHand(bR, MR, { r: 0.0165, elbow: fR.elbowLocal, keys, shoulder: V(0.4, 1.2, 0.22) });
  const elbowR = V(...armRInfo.elbow);
  const meshR = bR.build('armR');
  meshR.position.copy(elbowR).multiplyScalar(-1);
  const armR = new THREE.Group();
  armR.name = 'armR';
  armR.position.copy(elbowR);
  armR.add(meshR);
  // 휘두르는 축: 팔뚝이 놓인 수직면에 수직
  const fwd = gripR.clone().sub(elbowR).normalize();
  const axisR = new THREE.Vector3().crossVectors(fwd, up).normalize();

  // ---- 왼팔 + 집게 + 칼날
  const bL = new Builder(lib, 502);
  register(bL);
  const aT = V(0.72, -0.13, -0.68).normalize();        // 집게 축(손 -> 턱)
  const gripPoint = pointOn(0.035, 0.004);
  const jaw = 0.085;
  const pivot = gripPoint.clone().addScaledVector(aT, -jaw * 0.8);
  const eL = V(-0.3, 0.3, 0.9).normalize();
  const fL = basisFrom(aT, eL, true);
  {
    const Xt = fL.z.clone(), Yt = aT.clone();
    const Zt = new THREE.Vector3().crossVectors(Xt, Yt);
    const m = new THREE.Matrix4().makeBasis(Xt, Yt, Zt).setPosition(pivot);
    tongs(bL, null, { matrix: m, len: 0.37, jaw, open: 0.0115, key: 'ironFP' });
  }
  const gripL = pivot.clone().addScaledVector(aT, -0.255);
  const ML = new THREE.Matrix4().makeBasis(fL.x, fL.y, fL.z).setPosition(gripL);
  const armLInfo = buildHand(bL, ML, { r: 0.0165, elbow: fL.elbowLocal, keys, shoulder: V(-0.6, 1.2, 0.2) });
  const elbowL = V(...armLInfo.elbow);
  const meshL = bL.build('armL');
  meshL.position.copy(elbowL).multiplyScalar(-1);
  const armL = new THREE.Group();
  armL.name = 'armL';
  armL.position.copy(elbowL);
  armL.add(meshL);
  blade.mesh.matrixAutoUpdate = false;
  blade.mesh.matrix.copy(bladeMatrix).premultiply(new THREE.Matrix4().makeTranslation(-elbowL.x, -elbowL.y, -elbowL.z));
  armL.add(blade.mesh);

  scene.add(armR, armL);
  return {
    armR, armL, axisR, elbowR, elbowL, T0, s0, bx, origin, pointOn, headC,
    restL: elbowL.clone(), restR: elbowR.clone(),
  };
}
