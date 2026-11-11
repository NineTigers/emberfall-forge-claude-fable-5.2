// 망치질 불꽃: CPU에서 굴리는 입자를 속도 방향으로 늘인 띠로 그린다(가산 혼합, HDR).
import * as THREE from 'three';

export function createSparks(app, { max = 520, faceY = 0.86, faceRect = [-0.22, 0.26, -1.012, -0.888] } = {}) {
  const px = new Float32Array(max * 3), vel = new Float32Array(max * 3);
  const life = new Float32Array(max), span = new Float32Array(max), size = new Float32Array(max), hot = new Float32Array(max);
  let cursor = 0, alive = 0;

  const pos = new Float32Array(max * 4 * 3), col = new Float32Array(max * 4 * 3), uv = new Float32Array(max * 4 * 2);
  const index = new Uint16Array(max * 6);
  for (let i = 0; i < max; i++) {
    index.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
    uv.set([0, 0, 1, 0, 1, 1, 0, 1], i * 8);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aCol', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(new THREE.BufferAttribute(index, 1));
  const mat = new THREE.ShaderMaterial({
    vertexShader: /* glsl */ `
attribute vec3 aCol;
varying vec3 vCol; varying vec2 vUv;
void main() { vCol = aCol; vUv = uv; gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
varying vec3 vCol; varying vec2 vUv;
void main() {
  float w = 1.0 - abs(vUv.y - 0.5) * 2.0;
  float l = smoothstep(0.0, 0.25, vUv.x);
  gl_FragColor = vec4(vCol * w * w * l, 1.0);
}`,
    blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.layers.set(1);
  mesh.frustumCulled = false;
  mesh.name = 'sparks';

  let seed = 777;
  const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

  function spawn(p, count, heat, power = 1) {
    for (let n = 0; n < count; n++) {
      const i = cursor; cursor = (cursor + 1) % max;
      const a = rnd() * Math.PI * 2;
      const el = Math.pow(rnd(), 1.6) * 1.0 + 0.06;
      const sp = (0.8 + Math.pow(rnd(), 2.2) * 5.5) * (0.55 + 0.6 * heat) * power;
      px[i * 3] = p.x + Math.cos(a) * 0.012; px[i * 3 + 1] = p.y + 0.004; px[i * 3 + 2] = p.z + Math.sin(a) * 0.012;
      vel[i * 3] = Math.cos(a) * Math.cos(el) * sp; vel[i * 3 + 1] = Math.sin(el) * sp * 0.75 + 0.3; vel[i * 3 + 2] = Math.sin(a) * Math.cos(el) * sp;
      span[i] = 0.35 + rnd() * 0.9 * (0.5 + 0.5 * heat);
      life[i] = span[i];
      size[i] = 0.0016 + rnd() * 0.0028;
      hot[i] = 0.6 + 0.6 * heat * (0.6 + 0.4 * rnd());
    }
  }

  const cam = new THREE.Vector3(), side = new THREE.Vector3(), v = new THREE.Vector3(), toCam = new THREE.Vector3(), head = new THREE.Vector3(), tail = new THREE.Vector3();
  function update(dt, camera) {
    cam.copy(camera.position);
    alive = 0;
    for (let i = 0; i < max; i++) {
      const o = i * 12;
      if (life[i] <= 0) { for (let k = 0; k < 12; k++) pos[o + k] = 0; continue; }
      life[i] -= dt;
      alive++;
      let x = px[i * 3], y = px[i * 3 + 1], z = px[i * 3 + 2];
      let vx = vel[i * 3], vy = vel[i * 3 + 1], vz = vel[i * 3 + 2];
      vy -= 9.8 * dt;
      const drag = Math.exp(-0.9 * dt);
      vx *= drag; vy *= drag; vz *= drag;
      x += vx * dt; y += vy * dt; z += vz * dt;
      // 모루 면과 바닥에서 튄다
      if (y < faceY + 0.002 && vy < 0 && x > faceRect[0] && x < faceRect[1] && z > faceRect[2] && z < faceRect[3] && y > faceY - 0.03) {
        y = faceY + 0.002; vy = -vy * 0.32; vx *= 0.7; vz *= 0.7;
      } else if (y < 0.006 && vy < 0) {
        y = 0.006; vy = -vy * 0.25; vx *= 0.55; vz *= 0.55; life[i] = Math.min(life[i], 0.25);
      }
      px[i * 3] = x; px[i * 3 + 1] = y; px[i * 3 + 2] = z;
      vel[i * 3] = vx; vel[i * 3 + 1] = vy; vel[i * 3 + 2] = vz;

      const age = 1 - life[i] / span[i];
      v.set(vx, vy, vz);
      const sp = v.length();
      const len = Math.min(0.14, Math.max(0.006, sp * 0.026));
      head.set(x, y, z);
      tail.copy(head).addScaledVector(v, -len / Math.max(sp, 1e-4));
      toCam.subVectors(cam, head);
      side.crossVectors(v, toCam).normalize().multiplyScalar(size[i] * (1 - age * 0.5));
      pos[o] = tail.x - side.x; pos[o + 1] = tail.y - side.y; pos[o + 2] = tail.z - side.z;
      pos[o + 3] = head.x - side.x; pos[o + 4] = head.y - side.y; pos[o + 5] = head.z - side.z;
      pos[o + 6] = head.x + side.x; pos[o + 7] = head.y + side.y; pos[o + 8] = head.z + side.z;
      pos[o + 9] = tail.x + side.x; pos[o + 10] = tail.y + side.y; pos[o + 11] = tail.z + side.z;
      // 흰 노랑 -> 주황 -> 붉게 식는다
      const h = hot[i] * Math.pow(1 - age, 1.3);
      const r = 30 * h, gg = 30 * h * (0.2 + 0.6 * h), b = 30 * h * 0.35 * h * h;
      for (let k = 0; k < 4; k++) { col[o + k * 3] = r; col[o + k * 3 + 1] = gg; col[o + k * 3 + 2] = b; }
    }
    g.attributes.position.needsUpdate = true;
    g.attributes.aCol.needsUpdate = true;
    mesh.visible = alive > 0;
  }
  return { mesh, spawn, update, get alive() { return alive; } };
}
