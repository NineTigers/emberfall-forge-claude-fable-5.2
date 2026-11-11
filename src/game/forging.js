// 망치질 진행: 조준(시선), 휘두르기 애니메이션, 타격 판정, 식음·다시 달구기.
import * as THREE from 'three';
import { BLADE_LEN } from '../world/blade.js';

const ease = (t) => t * t * (3 - 2 * t);
const clamp01 = (x) => Math.min(1, Math.max(0, x));

export function createForging(app, { rig, blade, sparks, audio, fireUniforms, hotLight, flashLight, volHot, faceY, hud }) {
  const { camera } = app;
  const IDLE = 0.36, TOP = 1.12;
  const st = {
    phase: 'idle', t: 0, angle: IDLE, from: IDLE, queued: false,
    s: rig.s0, sAim: rig.s0, auto: 0,
    reheat: -1, reheated: false, pendingReset: false,
    joltL: 0, joltLV: 0, shake: 0, strikes: 0, done: false, time: 0,
  };
  const tmp = new THREE.Vector3(), dir = new THREE.Vector3(), hit = new THREE.Vector3(), q = new THREE.Quaternion(), off = new THREE.Vector3();
  const reheatOut = new THREE.Vector3(-1.05, 0.16, -0.5);
  // 움직임 줄이기 설정이면 화면 흔들림을 끈다.
  const calm = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1;
  let seed = 31337;
  const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

  function aim() {
    camera.getWorldDirection(dir);
    if (dir.y > -0.08) return;
    const k = (faceY + 0.012 - camera.position.y) / dir.y;
    hit.copy(camera.position).addScaledVector(dir, k);
    tmp.subVectors(hit, rig.origin);
    const along = tmp.dot(rig.bx);
    const lateral = Math.hypot(tmp.x - rig.bx.x * along, tmp.z - rig.bx.z * along);
    if (lateral > 0.32 || along < -0.25 || along > BLADE_LEN + 0.3) return;
    st.s = Math.min(blade.workRange[1], Math.max(blade.workRange[0], along / BLADE_LEN));
  }

  function impact() {
    const power = 0.86 + rnd() * 0.26;
    const s = st.sAim;
    const res = blade.strike(s, power, rnd);
    const p = rig.pointOn(s, blade.topAt(s) + 0.002);
    const hot = res.heat;
    const glow = clamp01((hot - 0.2) / 0.6);
    sparks.spawn(p, Math.round(8 + 150 * glow * power), glow, power);
    audio.strike(hot, power);
    st.shake = Math.min(1.4, st.shake + 0.55 + 0.4 * power);
    st.joltLV -= 1.6 * power;
    flashLight.position.copy(p).add(tmp.set(0, 0.05, 0));
    flashLight.intensity = 9 * glow * power;
    st.strikes++;
    const stats = blade.stats();
    if (!st.done && stats.progress > 0.965) { st.done = true; hud?.message('칼날 형태 완성', 'N 키로 새 쇳덩이를 올립니다'); }
    else if (hot < 0.3) hud?.hint('쇠가 식었습니다 — R 키로 다시 달구세요');
  }

  function strike() {
    if (st.reheat >= 0) return false;
    if (st.phase === 'idle' || (st.phase === 'recover' && st.t > 0.1)) {
      st.phase = 'windup'; st.t = 0; st.from = st.angle;
      return true;
    }
    if (st.phase === 'swing' || st.phase === 'recover') st.queued = true;
    return false;
  }
  function reheat(reset = false) {
    if (st.reheat >= 0 || st.phase === 'windup' || st.phase === 'swing') return false;
    st.reheat = 0; st.reheated = false; st.pendingReset = reset;
    hud?.hint('');
    return true;
  }

  function update(dt, t) {
    st.time = t;
    // ---- 조준: 시선이 모루를 향하면 그 지점, 아니면 현재 위치 유지
    if (st.phase === 'idle' || st.phase === 'recover') aim();
    if (st.phase !== 'swing') st.sAim += (st.s - st.sAim) * Math.min(1, dt * 10);

    // ---- 휘두르기
    st.t += dt;
    if (st.phase === 'windup') {
      const k = clamp01(st.t / 0.17);
      st.angle = st.from + (TOP - st.from) * (1 - (1 - k) * (1 - k));
      if (k >= 1) { st.phase = 'swing'; st.t = 0; }
    } else if (st.phase === 'swing') {
      const k = clamp01(st.t / 0.085);
      st.angle = TOP * (1 - k * k);
      if (k >= 1) { st.angle = 0; impact(); st.phase = 'recover'; st.t = 0; }
    } else if (st.phase === 'recover') {
      // 튕겨 오른 뒤 대기 자세로
      const k = clamp01(st.t / 0.42);
      st.angle = IDLE * ease(k) + 0.16 * Math.sin(Math.min(1, st.t / 0.16) * Math.PI) * (1 - k);
      if (st.queued && st.t > 0.1) { st.queued = false; st.phase = 'windup'; st.t = 0; st.from = st.angle; }
      else if (k >= 1) { st.phase = 'idle'; st.t = 0; }
    } else {
      st.angle += (IDLE + Math.sin(t * 1.3) * 0.012 - st.angle) * Math.min(1, dt * 6);
    }

    // ---- 다시 달구기: 왼팔이 칼날을 화덕 쪽으로 가져갔다가 돌아온다
    let out = 0;
    if (st.reheat >= 0) {
      st.reheat += dt;
      const r = st.reheat;
      out = r < 0.75 ? ease(r / 0.75) : r < 2.0 ? 1 : 1 - ease(clamp01((r - 2.0) / 0.75));
      if (r > 0.8 && !st.reheated) {
        st.reheated = true;
        audio.bellows(1.3);
      }
      if (r > 1.7 && st.reheated !== 'done') {
        st.reheated = 'done';
        if (st.pendingReset) { blade.reset(); st.done = false; hud?.message('', ''); } else blade.reheat();
      }
      fireUniforms.uBlast.value = 1 + 0.75 * Math.sin(clamp01((r - 0.75) / 1.25) * Math.PI);
      if (r >= 2.75) { st.reheat = -1; fireUniforms.uBlast.value = 1; }
    }

    // ---- 식음
    blade.cool(dt, out > 0.5 ? 0 : 1);
    blade.update();
    const stats = blade.stats();

    // ---- 팔 자세 적용
    const sway = Math.sin(t * 0.9) * 0.003;
    off.copy(rig.pointOn(st.sAim)).sub(rig.pointOn(rig.s0));
    off.y += blade.topAt(st.sAim) - 0.0122;
    const lift = Math.sin(Math.min(st.angle, 1.3)) * 0.085;
    const restDown = st.reheat >= 0 ? out * 0.1 : 0;
    rig.armR.position.copy(rig.restR).add(off).add(tmp.set(0.02 * lift, lift + sway - restDown, 0.25 * lift + restDown * 0.6));
    q.setFromAxisAngle(rig.axisR, st.angle - restDown * 2.0);
    rig.armR.quaternion.copy(q);

    // 왼팔: 타격 충격(감쇠 스프링) + 다시 달구기 이동
    st.joltLV += (-st.joltL * 420 - st.joltLV * 26) * dt;
    st.joltL += st.joltLV * dt;
    rig.armL.position.copy(rig.restL).addScaledVector(reheatOut, out).add(tmp.set(0, st.joltL * 0.012 + sway * 0.7, 0));
    rig.armL.rotation.set(-st.joltL * 0.012 - out * 0.25, out * 0.55, out * 0.2);

    // ---- 달군 쇠가 내는 빛
    const hSpot = blade.heatAt(0.62);
    const g = Math.pow(clamp01((hSpot - 0.18) / 0.82), 2.2);
    rig.armL.updateMatrixWorld(true);
    hotLight.position.copy(rig.pointOn(0.6, 0.07)).addScaledVector(reheatOut, out);
    hotLight.intensity = 2.6 * g;
    hotLight.color.setRGB(1.0, 0.32 + 0.3 * g, 0.06 + 0.16 * g);
    volHot.color.copy(hotLight.color).multiplyScalar(0.035 * g);
    flashLight.intensity *= Math.exp(-dt * 26);

    // ---- 화면 흔들림
    st.shake *= Math.exp(-dt * 9);
    app.shake.set((rnd() - 0.5) * 0.012 * st.shake * calm, (rnd() - 0.5) * 0.008 * st.shake * calm, (rnd() - 0.5) * 0.006 * st.shake * calm);

    sparks.update(dt, camera);
    hud?.set(stats.heat, stats.progress, st.strikes);
    if (st.reheat < 0 && stats.heat < 0.3 && !st.done) hud?.hint('쇠가 식었습니다 — R 키로 다시 달구세요');
  }

  return { state: st, strike, reheat, update, newBillet: () => reheat(true) };
}
