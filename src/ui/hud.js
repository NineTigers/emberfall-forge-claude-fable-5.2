// 화면 안내: 시작 화면, 쇠 온도·형태 진행, 조작 안내.
const CSS = `
.ef-ui { position: fixed; inset: 0; pointer-events: none; font-family: var(--ef-font); color: var(--ef-ink); user-select: none; -webkit-user-select: none; -webkit-font-smoothing: antialiased; }
.ef-veil { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 22px; pointer-events: auto; cursor: pointer; text-align: center;
  padding-block: 24px; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px));
  background: radial-gradient(120% 90% at 50% 45%, var(--ef-veil-0) 0%, var(--ef-veil-1) 70%, var(--ef-veil-2) 100%); transition: opacity 0.7s ease; }
.ef-veil.hide { opacity: 0; pointer-events: none; }
.ef-title { font-family: var(--ef-display); font-size: clamp(40px, 9vw, 104px); letter-spacing: 0.16em; margin-right: -0.16em; font-weight: 400; line-height: 1; max-width: 100%;
  background: linear-gradient(180deg, var(--ef-title-top) 0%, var(--ef-title-mid) 58%, var(--ef-ember-deep) 100%); -webkit-background-clip: text; background-clip: text; color: transparent; text-shadow: 0 0 46px var(--ef-ember-glow); }
.ef-sub { font-size: clamp(11px, 1.4vw, 14px); letter-spacing: 0.42em; margin-right: -0.42em; opacity: 0.74; }
.ef-start { margin-top: 14px; padding: 13px 34px; border-radius: 999px; font-size: 15px; letter-spacing: 0.08em; color: var(--ef-key-ink); font-weight: 600;
  background: linear-gradient(180deg, var(--ef-ember-hi), var(--ef-ember)); box-shadow: 0 8px 30px var(--ef-ember-glow); }
.ef-keys { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px 22px; margin-top: 8px; font-size: 13px; opacity: 0.86; max-width: 100%; }
.ef-keys b { display: inline-block; min-width: 22px; padding: 3px 8px; margin-right: 8px; border-radius: 6px; font-weight: 600; font-size: 12px; text-align: center; color: var(--ef-key-ink); background: var(--ef-key); }
.ef-note { position: absolute; bottom: calc(22px + env(safe-area-inset-bottom, 0px)); left: 16px; right: 16px; text-align: center; font-size: 11.5px; letter-spacing: 0.06em; opacity: 0.5; text-wrap: balance; }
.ef-load { font-size: 12px; letter-spacing: 0.2em; opacity: 0.7; }
.ef-panel { position: absolute; left: calc(22px + env(safe-area-inset-left, 0px)); bottom: calc(22px + env(safe-area-inset-bottom, 0px)); width: 232px; padding: 13px 15px 14px; border-radius: 14px; background: var(--ef-panel); border: 1px solid var(--ef-line);
  backdrop-filter: blur(9px); -webkit-backdrop-filter: blur(9px); opacity: 0; transition: opacity 0.6s ease; }
.ef-panel.on { opacity: 1; }
.ef-row { display: flex; justify-content: space-between; align-items: baseline; font-size: 11px; letter-spacing: 0.16em; opacity: 0.78; }
.ef-row span:last-child { font-variant-numeric: tabular-nums; letter-spacing: 0.04em; opacity: 0.95; }
.ef-bar { position: relative; height: 7px; margin: 7px 0 12px; border-radius: 4px; background: var(--ef-track); overflow: hidden; }
.ef-bar i { position: absolute; inset: 0; transform-origin: left center; border-radius: 4px; }
.ef-heat i { background: linear-gradient(90deg, var(--ef-h0) 0%, var(--ef-h1) 30%, var(--ef-h2) 58%, var(--ef-h3) 80%, var(--ef-h4) 100%); }
.ef-heat b { position: absolute; top: 0; bottom: 0; right: 0; background: var(--ef-veil-2); }
.ef-prog i { background: linear-gradient(90deg, var(--ef-cool), var(--ef-cool-hi)); }
.ef-bar:last-of-type { margin-bottom: 0; }
.ef-dot { position: absolute; left: 50%; top: 50%; width: 4px; height: 4px; margin: -2px 0 0 -2px; border-radius: 50%; background: var(--ef-ink); box-shadow: 0 0 0 1px var(--ef-shade); opacity: 0; transition: opacity 0.5s; }
.ef-dot.on { opacity: 0.55; }
.ef-hint { position: absolute; left: 50%; bottom: calc(30px + env(safe-area-inset-bottom, 0px)); transform: translateX(-50%); padding: 9px 18px; border-radius: 999px; font-size: 13px; letter-spacing: 0.04em; background: var(--ef-panel); border: 1px solid var(--ef-line);
  backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); opacity: 0; transition: opacity 0.4s ease; max-width: calc(100% - 32px); text-align: center; }
.ef-hint.on { opacity: 1; }
.ef-msg { position: absolute; left: 16px; right: 16px; top: 17%; text-align: center; opacity: 0; transition: opacity 0.8s ease; }
.ef-msg.on { opacity: 1; }
.ef-msg h2 { margin: 0; font-family: var(--ef-display); font-weight: 400; font-size: clamp(26px, 4vw, 44px); letter-spacing: 0.14em; color: var(--ef-ink-strong); text-shadow: 0 2px 24px var(--ef-shade); text-wrap: balance; }
.ef-msg p { margin: 10px 0 0; font-size: 13px; letter-spacing: 0.08em; opacity: 0.8; text-shadow: 0 1px 10px var(--ef-shade); }
.ef-help { position: absolute; right: calc(22px + env(safe-area-inset-right, 0px)); bottom: calc(22px + env(safe-area-inset-bottom, 0px)); font-size: 11.5px; letter-spacing: 0.05em; opacity: 0; transition: opacity 0.6s; text-align: right; line-height: 1.9; text-shadow: 0 1px 6px var(--ef-shade); }
.ef-help.on { opacity: 0.62; }
.ef-help b { padding: 2px 6px; margin-left: 6px; border-radius: 5px; font-weight: 600; font-size: 10.5px; color: var(--ef-key-ink); background: var(--ef-key); }
@media (max-width: 640px) { .ef-panel { width: 168px; left: calc(14px + env(safe-area-inset-left, 0px)); bottom: calc(14px + env(safe-area-inset-bottom, 0px)); } .ef-help { display: none; } .ef-hint { bottom: calc(96px + env(safe-area-inset-bottom, 0px)); } .ef-keys { font-size: 12px; gap: 8px 14px; } }
@media (prefers-reduced-motion: reduce) { .ef-veil, .ef-panel, .ef-hint, .ef-msg, .ef-help, .ef-dot { transition: none; } }
`;

export function createHud() {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const root = document.createElement('div');
  root.className = 'ef-ui';
  root.innerHTML = `
    <div class="ef-dot"></div>
    <div class="ef-msg"><h2></h2><p></p></div>
    <div class="ef-hint"></div>
    <div class="ef-panel">
      <div class="ef-row"><span>쇠 온도</span><span data-k="heat">—</span></div>
      <div class="ef-bar ef-heat"><i></i><b></b></div>
      <div class="ef-row"><span>칼날 형태</span><span data-k="prog">0%</span></div>
      <div class="ef-bar ef-prog"><i></i></div>
    </div>
    <div class="ef-help">망치질<b>클릭</b><br>다시 달구기<b>R</b><br>새 쇳덩이<b>N</b><br>시선<b>마우스</b></div>
    <div class="ef-veil">
      <div class="ef-sub">코드로만 지은 대장간</div>
      <div class="ef-title">EMBERFALL</div>
      <div class="ef-load">불을 지피는 중…</div>
      <div class="ef-start" hidden>클릭해서 시작</div>
      <div class="ef-keys"><span><b>마우스</b>시선</span><span><b>클릭</b>망치질</span><span><b>R</b>다시 달구기</span><span><b>N</b>새 쇳덩이</span><span><b>Esc</b>멈춤</span></div>
      <div class="ef-note">3D 모델·이미지·소리 파일 없음 — 화면과 소리 전부를 코드가 실행 중에 만듭니다</div>
    </div>`;
  document.body.appendChild(root);
  const $ = (s) => root.querySelector(s);
  const veil = $('.ef-veil'), panel = $('.ef-panel'), hintEl = $('.ef-hint'), msg = $('.ef-msg'), help = $('.ef-help'), dot = $('.ef-dot');
  const heatCover = $('.ef-heat b'), progBar = $('.ef-prog i'), heatTxt = $('[data-k=heat]'), progTxt = $('[data-k=prog]');
  let lastHeat = -1, lastProg = -1, hintText = '';
  const heatName = (h) => (h > 0.86 ? '백열' : h > 0.66 ? '주황빛' : h > 0.45 ? '붉은빛' : h > 0.28 ? '검붉음' : '식음');
  return {
    veil,
    ready() { $('.ef-load').hidden = true; $('.ef-start').hidden = false; },
    show(playing) {
      veil.classList.toggle('hide', playing);
      for (const el of [panel, help, dot]) el.classList.toggle('on', playing);
      if (!playing) $('.ef-start').textContent = '클릭해서 계속';
    },
    set(heat, prog) {
      const h = Math.round(heat * 100), p = Math.round(prog * 100);
      if (h !== lastHeat) { lastHeat = h; heatCover.style.width = `${100 - Math.min(100, h)}%`; heatTxt.textContent = heatName(heat); }
      if (p !== lastProg) { lastProg = p; progBar.style.transform = `scaleX(${Math.min(1, prog)})`; progTxt.textContent = `${p}%`; }
    },
    hint(text) {
      if (text === hintText) return;
      hintText = text;
      if (text) hintEl.textContent = text;
      hintEl.classList.toggle('on', !!text);
    },
    message(title, sub) {
      msg.querySelector('h2').textContent = title;
      msg.querySelector('p').textContent = sub;
      msg.classList.toggle('on', !!title);
    },
  };
}
