// 효과음: 전부 WebAudio로 합성한다(오디오 파일 없음).
export function createAudio() {
  let ctx = null, master = null, fireGain = null, noiseBuf = null, crackleTimer = 0, birdTimer = 4;
  const noise = (seconds = 2) => {
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  };
  const src = (buf, loop = false) => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = loop; return s; };

  function start() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 5; comp.attack.value = 0.002; comp.release.value = 0.2;
    master.connect(comp).connect(ctx.destination);
    noiseBuf = noise(3);

    // 화덕: 낮게 웅웅대는 불 + 바스락거리는 층
    fireGain = ctx.createGain();
    fireGain.gain.value = 0.0;
    fireGain.connect(master);
    const low = src(noiseBuf, true), lowF = ctx.createBiquadFilter(), lowG = ctx.createGain();
    lowF.type = 'lowpass'; lowF.frequency.value = 190; lowG.gain.value = 0.9;
    low.connect(lowF).connect(lowG).connect(fireGain);
    const mid = src(noiseBuf, true), midF = ctx.createBiquadFilter(), midG = ctx.createGain();
    midF.type = 'bandpass'; midF.frequency.value = 900; midF.Q.value = 0.6; midG.gain.value = 0.12;
    mid.playbackRate.value = 0.7;
    mid.connect(midF).connect(midG).connect(fireGain);
    // 느린 숨결(불길의 일렁임)
    const lfo = ctx.createOscillator(), lfoG = ctx.createGain();
    lfo.frequency.value = 0.37; lfoG.gain.value = 0.25;
    lfo.connect(lfoG).connect(lowG.gain);
    low.start(); mid.start(); lfo.start();
    fireGain.gain.linearRampToValueAtTime(0.26, ctx.currentTime + 2.5);

    // 실내 공기(아주 낮은 바람 소리)
    const air = src(noiseBuf, true), airF = ctx.createBiquadFilter(), airG = ctx.createGain();
    airF.type = 'lowpass'; airF.frequency.value = 90; airG.gain.value = 0.22;
    air.playbackRate.value = 0.5;
    air.connect(airF).connect(airG).connect(master);
    air.start();
  }

  function crackle() {
    const t = ctx.currentTime;
    const s = src(noiseBuf), f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = 'bandpass'; f.frequency.value = 1500 + Math.random() * 4500; f.Q.value = 1.5 + Math.random() * 4;
    const v = 0.03 + Math.random() * 0.11;
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.012 + Math.random() * 0.05);
    s.connect(f).connect(g).connect(master);
    s.start(t, Math.random() * 2, 0.08);
  }

  function bird() {
    // 창밖 멀리서 들리는 새소리
    const t = ctx.currentTime;
    const n = 2 + Math.floor(Math.random() * 4);
    const base = 2600 + Math.random() * 1800;
    for (let i = 0; i < n; i++) {
      const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
      const t0 = t + i * (0.09 + Math.random() * 0.05);
      o.type = 'sine';
      o.frequency.setValueAtTime(base * (1 + Math.random() * 0.2), t0);
      o.frequency.exponentialRampToValueAtTime(base * (0.75 + Math.random() * 0.5), t0 + 0.07);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.012, t0 + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.085);
      f.type = 'lowpass'; f.frequency.value = 3200;
      o.connect(g).connect(f).connect(master);
      o.start(t0); o.stop(t0 + 0.1);
    }
  }

  // 망치질: 짧은 타격음 + 모루의 울림(비조화 배음). 달궈진 쇠는 둔하게, 식은 쇠는 맑게 울린다.
  function strike(heat = 1, power = 1) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const dull = Math.min(1, Math.max(0, heat));
    const vol = 0.5 * power;
    // 타격 순간의 잡음
    const n = src(noiseBuf), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
    nf.type = 'bandpass'; nf.frequency.value = 2600 - dull * 900; nf.Q.value = 0.7;
    ng.gain.setValueAtTime(vol * 0.9, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    n.connect(nf).connect(ng).connect(master);
    n.start(t, Math.random() * 2, 0.07);
    // 묵직한 충격
    const th = ctx.createOscillator(), tg = ctx.createGain();
    th.type = 'sine';
    th.frequency.setValueAtTime(150, t);
    th.frequency.exponentialRampToValueAtTime(55, t + 0.09);
    tg.gain.setValueAtTime(vol * 0.9, t);
    tg.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
    th.connect(tg).connect(master);
    th.start(t); th.stop(t + 0.15);
    // 모루의 울림
    const det = 1 + (Math.random() - 0.5) * 0.012;
    const partials = [[1180, 1.0, 0.75], [2075, 0.6, 0.55], [2890, 0.42, 0.42], [3760, 0.3, 0.32], [5120, 0.2, 0.22], [6890, 0.11, 0.15]];
    for (const [f, a, d] of partials) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f * det * (1 + (Math.random() - 0.5) * 0.004);
      const amp = vol * 0.16 * a * (1 - dull * 0.55);
      const dec = d * (1 - dull * 0.6) + 0.05;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(amp, 0.0002), t + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
      o.connect(g).connect(master);
      o.start(t); o.stop(t + dec + 0.05);
    }
  }

  // 풀무질(다시 달굴 때)
  function bellows(duration = 1.6) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const s = src(noiseBuf), f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = 'bandpass'; f.Q.value = 0.8;
    f.frequency.setValueAtTime(260, t);
    f.frequency.linearRampToValueAtTime(780, t + duration * 0.5);
    f.frequency.linearRampToValueAtTime(300, t + duration);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.38, t + duration * 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    s.connect(f).connect(g).connect(master);
    s.start(t, 0, duration + 0.1);
    fireGain.gain.cancelScheduledValues(t);
    fireGain.gain.setValueAtTime(fireGain.gain.value, t);
    fireGain.gain.linearRampToValueAtTime(0.5, t + duration * 0.5);
    fireGain.gain.linearRampToValueAtTime(0.26, t + duration + 1.2);
  }

  function update(dt) {
    if (!ctx || ctx.state !== 'running') return;
    crackleTimer -= dt;
    if (crackleTimer <= 0) { crackle(); crackleTimer = 0.03 + Math.random() * Math.random() * 0.5; }
    birdTimer -= dt;
    if (birdTimer <= 0) { bird(); birdTimer = 3 + Math.random() * 9; }
  }
  return { start, strike, bellows, update, get running() { return !!ctx && ctx.state === 'running'; } };
}
