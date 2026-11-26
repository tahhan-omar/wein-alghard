/* وين الغرض؟ — hidden-object game for the AOU Cultural Day booth.
 * Reads data/stages.json (see SPEC.md §5). Each player gets ONE random stage.
 * If the data or images aren't ready, a built-in demo runs so the booth never shows a blank screen.
 */
'use strict';

const CFG = {
  roundSize: 6,      // objects per round
  time: 60,          // seconds
  hints: 3,
  slots: 4,          // visible slots in the bottom bar
  idleMs: 30000,     // back to start after this much inactivity
  hitPad: 0.02,      // finger tolerance, fraction of image width
  maxZoom: 2.5,
  revealMs: 2100,
};

const $ = (s) => document.querySelector(s);
const ar = (n) => Number(n).toLocaleString('ar-EG');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5 L10 17 L19 7"/></svg>';
const X_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round"><path d="M6 6 L18 18 M18 6 L6 18"/></svg>';

const S = {
  stages: [], playable: [], realStages: null, demo: false,
  lastId: null, stage: null, round: [], found: new Set(), visible: [], queue: [],
  hints: 0, timeLeft: 0, t0: 0, lastTick: 0, running: false, raf: 0,
  screen: 'start', lastInput: Date.now(), wrong: [], lockUntil: 0, busy: false,
  sound: true, view: { W: 0, H: 0, VW: 0, VH: 0, s: 1, tx: 0, ty: 0 },
  toastTimer: 0,
};

/* ================= sound (synthesised, no files needed) ================= */
let actx = null;
function audio() {
  if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { actx = null; } }
  if (actx && actx.state === 'suspended') actx.resume();
  return actx;
}
function tone(freq, dur, type = 'sine', vol = 0.18, when = 0) {
  const a = audio(); if (!a || !S.sound) return;
  const t = a.currentTime + when, o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.03);
}
const SFX = {
  found() { tone(660, 0.12, 'triangle'); tone(990, 0.2, 'triangle', 0.18, 0.09); },
  wrong() { tone(170, 0.12, 'square', 0.05); },
  hint() { [880, 1175, 1568].forEach((f, i) => tone(f, 0.12, 'sine', 0.12, i * 0.07)); },
  tick() { tone(1200, 0.04, 'square', 0.04); },
  roll() { tone(720, 0.03, 'square', 0.05); },
  stamp() { tone(130, 0.2, 'sine', 0.35); tone(90, 0.25, 'triangle', 0.2, 0.02); },
  win() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.24, 'triangle', 0.18, i * 0.11)); },
  lose() { tone(392, 0.25, 'triangle', 0.15); tone(311, 0.4, 'triangle', 0.15, 0.22); },
};

/* ================= data ================= */
async function loadStagesFile() {
  try {
    const r = await fetch('data/stages.json', { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    if (!j.stages || !j.stages.length) throw new Error('no stages');
    return j.stages;
  } catch (e) {
    console.warn('[game] data/stages.json not loaded:', e.message);
    return null;
  }
}
function loadImage(src) {
  return new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error('image failed: ' + src));
    i.src = src;
  });
}
const validRect = (r) => r && typeof r.x === 'number' && r.w > 0 && r.h > 0;
async function processStages(stages) {
  for (const st of stages) {
    st._objs = (st.objects || []).map((o) => ({
      ...o,
      _rects: (Array.isArray(o.rects) && o.rects.length ? o.rects : [o.rect]).filter(validRect),
    }));
    st._ready = st._objs.filter((o) => o._rects.length);
    st._img = null; st._status = '';
  }
  await Promise.all(stages.map(async (st) => {
    try { st._img = await loadImage(st.image); }
    catch (e) { st._status = 'الصورة ما انفتحت: ' + st.image; }
  }));
  for (const st of stages) {
    if (st._img && !st._ready.length) st._status = 'ولا غرض محدد مكانه (rect فاضي)';
  }
}
const isPlayable = (st) => !!(st._img && st._ready.length);

async function prepare() {
  S.realStages = null;
  let stages = await loadStagesFile();
  let demo = false;
  if (stages) await processStages(stages);
  if (!stages || !stages.some(isPlayable)) {
    S.realStages = stages;           // keep for the staff panel diagnostics
    stages = buildDemo(); demo = true;
    await processStages(stages);
  }
  S.stages = stages; S.demo = demo;
  S.playable = stages.filter(isPlayable);
}

/* ---------- demo stages (emoji scenes drawn on canvas) ---------- */
function buildDemo() {
  const defs = [
    { id: 'demo-levant', title: 'بلاد الشام', short: 'بلاد الشام', color: '#9C4738', bg: ['#EFE1C6', '#C9A982'],
      items: [['🫒', 'زيتون'], ['🧼', 'صابون'], ['🪘', 'دربكة'], ['🥯', 'كعك'], ['🌿', 'زعتر'], ['🫖', 'ركوة'], ['🍋', 'ليمون'], ['🗝️', 'مفتاح']] },
    { id: 'demo-asia', title: 'باكستان والهند وبنجلادش وأفغانستان', short: 'جنوب آسيا', color: '#9F3F77', bg: ['#F3D9C2', '#C98F6A'],
      items: [['🛺', 'ريكشا'], ['🏏', 'مضرب كريكيت'], ['🥭', 'مانجو'], ['🪁', 'طائرة ورقية'], ['🍵', 'شاي'], ['🐘', 'فيل'], ['🪔', 'قنديل'], ['🧣', 'شال']] },
    { id: 'demo-saudi', title: 'السعودية واليمن', short: 'السعودية واليمن', color: '#9B551F', bg: ['#F1E2C8', '#B98B5E'],
      items: [['☕', 'قهوة'], ['🌴', 'نخلة'], ['🍯', 'عسل'], ['🐪', 'جمل'], ['🏺', 'جرة'], ['🐎', 'خيل'], ['🕌', 'مسجد'], ['🫘', 'بن']] },
  ];
  const clutter = ['📚', '🪴', '🧸', '🕯️', '🎁', '🪑', '🧵', '🪞', '🔔', '🎀', '🧶', '👜', '📦', '🖼️', '🥄', '🍎', '🍐', '🧂', '🧴', '🪣', '🧹', '⌚', '📿', '🎲', '🪀', '🔑', '🧺', '🍞', '🥕', '🧅', '📻', '🧦', '👟', '🎈', '🪆', '🧩', '🍇', '🥚', '🌵', '🍉'];
  const W = 1536, H = 1024;
  const font = (s) => `${s}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  return defs.map((d, si) => {
    let seed = si * 97 + 13;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d');
    const floorY = H * 0.58;
    x.fillStyle = d.bg[0]; x.fillRect(0, 0, W, floorY);
    x.fillStyle = d.bg[1]; x.fillRect(0, floorY, W, H - floorY);
    x.globalAlpha = 0.22;
    for (let y = 40, k = 0; y < floorY; y += 52, k++) { x.fillStyle = k % 2 ? '#3E3431' : '#FFFFFF'; x.fillRect(0, y, W, 18); }
    x.globalAlpha = 1;
    x.fillStyle = 'rgba(60,30,20,.32)';
    for (const ax of [260, 768, 1276]) {
      x.beginPath(); x.moveTo(ax - 140, floorY); x.lineTo(ax - 140, 260); x.quadraticCurveTo(ax, 120, ax + 140, 260); x.lineTo(ax + 140, floorY); x.fill();
    }
    x.strokeStyle = 'rgba(0,0,0,.12)'; x.lineWidth = 2;
    for (let y = floorY, k = 0; y < H; y += 60, k++) for (let xx = -90; xx < W; xx += 90) x.strokeRect(xx + (k % 2) * 45, y, 90, 60);
    x.textAlign = 'center'; x.textBaseline = 'middle';

    // target cells
    const cells = [];
    for (let r = 0; r < 4; r++) for (let col = 0; col < 6; col++) cells.push([col, r]);
    for (let i = cells.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [cells[i], cells[j]] = [cells[j], cells[i]]; }
    const TS = 62;
    const targets = d.items.map((it, k) => {
      const [col, r] = cells[k];
      return { it, cx: W * (0.07 + (col + 0.2 + rnd() * 0.6) * (0.86 / 6)), cy: H * (0.16 + (r + 0.2 + rnd() * 0.6) * (0.76 / 4)) };
    });
    for (let k = 0; k < 120; k++) {
      const px = rnd() * W, py = 60 + rnd() * (H - 80);
      if (targets.some((t) => Math.hypot(t.cx - px, t.cy - py) < 75)) continue;
      const s = 34 + rnd() * 36;
      x.save(); x.translate(px, py); x.rotate((rnd() - 0.5) * 0.6);
      x.font = font(s); x.fillText(clutter[Math.floor(rnd() * clutter.length)], 0, 0); x.restore();
    }
    const objects = targets.map((t, k) => {
      x.font = font(TS); x.fillText(t.it[0], t.cx, t.cy);
      const half = TS * 0.6;
      return {
        id: `${d.id}-${k}`, name: t.it[1], country: 'تجريبي',
        fact: 'غرض تجريبي — المعلومة الحقيقية تجي من ملف المراحل.',
        rect: { x: (t.cx - half) / W, y: (t.cy - half) / H, w: (half * 2) / W, h: (half * 2) / H },
      };
    });
    return { id: d.id, title: d.title, short: d.short, color: d.color, image: c.toDataURL('image/jpeg', 0.9), objects };
  });
}

/* ================= screens ================= */
function show(name) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === 'screen-' + name));
  S.screen = name; S.lastInput = Date.now();
}
function scaleFrames() {
  const s = Math.min(window.innerWidth / 1180, window.innerHeight / 820);
  document.documentElement.style.setProperty('--s', s.toFixed(4));
}
function setStageColor(st) { document.documentElement.style.setProperty('--stage', st.color || '#1D7F7A'); }

/* ---------- start ---------- */
const ROT = [-7, 5, -3, 8, -5, 4, -6, 6];
function renderStamps() {
  const box = $('#stamps'); box.innerHTML = '';
  S.stages.forEach((st, i) => {
    const el = document.createElement('div');
    el.className = 'stamp' + (isPlayable(st) ? '' : ' off');
    el.style.setProperty('--c', st.color || '#22203F');
    el.style.setProperty('--r', ROT[i % ROT.length] + 'deg');
    const inner = document.createElement('div'); inner.className = 'in';
    const name = document.createElement('span'); name.className = 'name'; name.textContent = st.short || st.title;
    inner.appendChild(name); el.appendChild(inner); box.appendChild(el);
    st._stampEl = el;
  });
  $('#demo-badge').hidden = !S.demo;
  const btn = $('#btn-start');
  btn.disabled = !S.playable.length;
  $('#btn-start-label').textContent = S.playable.length ? 'ابدأ الرحلة' : 'ما فيه مراحل جاهزة';
}

async function onStart(forced) {
  if (S.busy || !S.playable.length) return;
  S.busy = true; audio();
  const list = S.playable;
  let chosen = forced;
  if (!chosen) {
    const pool = list.length > 1 ? list.filter((s) => s.id !== S.lastId) : list;
    chosen = pool[Math.floor(Math.random() * pool.length)];
  }
  if (!forced && list.length > 1) {
    // roulette over the stamps, landing on the chosen one
    const start = Math.floor(Math.random() * list.length);
    const target = list.indexOf(chosen);
    const steps = list.length * 3 + ((target - start + list.length) % list.length);
    for (let k = 0; k <= steps; k++) {
      list.forEach((s) => s._stampEl.classList.remove('lit'));
      list[(start + k) % list.length]._stampEl.classList.add('lit');
      SFX.roll();
      await sleep(55 + Math.pow(k / steps, 2.2) * 280);
    }
    chosen._stampEl.classList.add('chosen'); SFX.stamp();
    await sleep(600);
    list.forEach((s) => s._stampEl.classList.remove('lit', 'chosen'));
  }
  S.lastId = chosen.id;
  await reveal(chosen);
  startRound(chosen);
  S.busy = false;
}

/* ---------- reveal ---------- */
async function reveal(st) {
  setStageColor(st);
  $('#reveal-title').textContent = st.short || st.title;
  $('#reveal-sub').textContent = st.short && st.short !== st.title ? st.title : '';
  const n = Math.min(CFG.roundSize, st._ready.length);
  $('#reveal-count').textContent = `دوّر على ${ar(n)} ${n > 2 && n < 11 ? 'أغراض' : 'غرض'}`;
  const dots = $('#reveal-dots'); dots.innerHTML = '';
  S.stages.forEach((s) => { const d = document.createElement('span'); if (s === st) d.className = 'on'; dots.appendChild(d); });
  const stamp = $('#big-stamp'); stamp.classList.remove('stamping'); void stamp.offsetWidth; stamp.classList.add('stamping');
  show('reveal');
  setTimeout(SFX.stamp, 300);
  await sleep(CFG.revealMs);
}

/* ================= round ================= */
function pickRound(objs, n) {
  const groups = {};
  objs.forEach((o) => { if (o.group) (groups[o.group] = groups[o.group] || []).push(o); });
  const keys = Object.keys(groups);
  const picked = [];
  if (keys.length > 1) shuffle(keys).forEach((k) => { if (picked.length < n) picked.push(shuffle(groups[k])[0]); });
  const rest = shuffle(objs.filter((o) => !picked.includes(o)));
  return shuffle(picked.concat(rest.slice(0, n - picked.length)));
}

function startRound(st) {
  S.stage = st; S.found = new Set(); S.hints = CFG.hints; S.wrong = []; S.lockUntil = 0;
  S.round = pickRound(st._ready, Math.min(CFG.roundSize, st._ready.length));
  S.visible = S.round.slice(0, CFG.slots);
  while (S.visible.length < CFG.slots) S.visible.push(null);
  S.queue = S.round.slice(CFG.slots);
  setStageColor(st);
  $('#scene-img').src = st._img.src;
  $('#scene-bg').style.backgroundImage = `url("${st._img.src}")`;
  $('#hud-stage').textContent = st.short || st.title;
  $('#marks').innerHTML = '';
  hideToast(true);
  renderDebugBoxes(); renderSlots(); updateProgress(); updateHints();
  show('game');
  fit(); resetView();
  S.timeLeft = CFG.time; S.lastTick = CFG.time; S.t0 = performance.now(); S.running = true;
  $('#timer').classList.remove('warn');
  loop();
}

function loop() {
  if (!S.running) return;
  S.timeLeft = Math.max(0, CFG.time - (performance.now() - S.t0) / 1000);
  const secs = Math.ceil(S.timeLeft);
  $('#timer-num').textContent = ar(secs);
  $('#timer-arc').style.strokeDashoffset = (188.5 * (1 - S.timeLeft / CFG.time)).toFixed(1);
  $('#timer').classList.toggle('warn', secs <= 10);
  if (secs < S.lastTick) { S.lastTick = secs; if (secs <= 10 && secs > 0) SFX.tick(); }
  if (S.timeLeft <= 0) { endRound(false); return; }
  S.raf = requestAnimationFrame(loop);
}

/* ---------- view: fit, zoom, pan ---------- */
function fit() {
  const vp = $('#viewport'), img = S.stage && S.stage._img;
  if (!img) return;
  const VW = vp.clientWidth, VH = vp.clientHeight, a = img.naturalWidth / img.naturalHeight;
  let W, H;
  if (VW / VH > a) { H = VH; W = H * a; } else { W = VW; H = W / a; }
  Object.assign(S.view, { VW, VH, W, H });
  const se = $('#stage-el'); se.style.width = W + 'px'; se.style.height = H + 'px';
  clampView(); applyView();
}
function resetView() { S.view.s = 1; clampView(); applyView(); }
function clampView() {
  const v = S.view;
  v.s = Math.min(CFG.maxZoom, Math.max(1, v.s));
  const w = v.W * v.s, h = v.H * v.s;
  v.tx = w <= v.VW ? (v.VW - w) / 2 : Math.min(0, Math.max(v.VW - w, v.tx));
  v.ty = h <= v.VH ? (v.VH - h) / 2 : Math.min(0, Math.max(v.VH - h, v.ty));
}
function applyView(anim) {
  const se = $('#stage-el');
  se.classList.toggle('anim', !!anim);
  se.style.transform = `translate(${S.view.tx}px, ${S.view.ty}px) scale(${S.view.s})`;
}
function zoomAt(px, py, ns, anim) {
  const v = S.view, cx = (px - v.tx) / v.s, cy = (py - v.ty) / v.s;
  v.s = Math.min(CFG.maxZoom, Math.max(1, ns));
  v.tx = px - cx * v.s; v.ty = py - cy * v.s;
  clampView(); applyView(anim);
}
const toScreen = (nx, ny) => ({ x: nx * S.view.W * S.view.s + S.view.tx, y: ny * S.view.H * S.view.s + S.view.ty });

function bindViewport() {
  const vp = $('#viewport');
  const ptrs = new Map();
  let g = null;
  vp.addEventListener('pointerdown', (e) => {
    if (S.screen !== 'game') return;
    try { vp.setPointerCapture(e.pointerId); } catch (_) {}
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const r = vp.getBoundingClientRect();
    if (ptrs.size === 1) g = { mode: 'tap', sx: e.clientX, sy: e.clientY, tx: S.view.tx, ty: S.view.ty, moved: false, r };
    else if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      g = { mode: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, s0: S.view.s, r };
    }
  });
  vp.addEventListener('pointermove', (e) => {
    if (!ptrs.has(e.pointerId) || !g) return;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (g.mode === 'pinch' && ptrs.size >= 2) {
      const [a, b] = [...ptrs.values()];
      zoomAt((a.x + b.x) / 2 - g.r.left, (a.y + b.y) / 2 - g.r.top, g.s0 * Math.hypot(a.x - b.x, a.y - b.y) / g.d0);
    } else if (g.mode === 'tap') {
      const dx = e.clientX - g.sx, dy = e.clientY - g.sy;
      if (!g.moved && Math.hypot(dx, dy) > 10) g.moved = true;
      if (g.moved && S.view.s > 1) { S.view.tx = g.tx + dx; S.view.ty = g.ty + dy; clampView(); applyView(); }
    }
  });
  const end = (e) => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.delete(e.pointerId);
    if (e.type === 'pointerup' && g && g.mode === 'tap' && !g.moved && ptrs.size === 0) {
      tap(e.clientX - g.r.left, e.clientY - g.r.top, e.clientX, e.clientY);
    }
    if (ptrs.size === 0) g = null; else if (g && g.mode === 'pinch') g = { mode: 'done' };
  };
  vp.addEventListener('pointerup', end);
  vp.addEventListener('pointercancel', end);
  vp.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = vp.getBoundingClientRect();
    zoomAt(e.clientX - r.left, e.clientY - r.top, S.view.s * Math.exp(-e.deltaY * 0.0015));
  }, { passive: false });
  const zoomBtn = (f) => () => { if (S.running) zoomAt(S.view.VW / 2, S.view.VH / 2, S.view.s * f, true); };
  $('#zoom-in').addEventListener('click', zoomBtn(1.4));
  $('#zoom-out').addEventListener('click', zoomBtn(1 / 1.4));
}

/* ---------- tapping ---------- */
function tap(px, py, cx, cy) {
  if (!S.running) return;
  const now = performance.now();
  if (now < S.lockUntil) return;
  const v = S.view;
  const nx = (px - v.tx) / v.s / v.W, ny = (py - v.ty) / v.s / v.H;
  const padX = CFG.hitPad, padY = CFG.hitPad * v.W / v.H;
  let best = null, bestArea = Infinity;
  for (const o of S.round) {
    if (S.found.has(o.id)) continue;
    for (const r of o._rects) {
      if (nx >= r.x - padX && nx <= r.x + r.w + padX && ny >= r.y - padY && ny <= r.y + r.h + padY) {
        const area = r.w * r.h;
        if (area < bestArea) { bestArea = area; best = { o, r }; }
      }
    }
  }
  if (best) onFound(best.o, best.r); else onWrong(cx, cy, now);
}

function onWrong(cx, cy, now) {
  SFX.wrong();
  const x = document.createElement('div'); x.className = 'wrong-x';
  x.style.left = cx + 'px'; x.style.top = cy + 'px'; x.innerHTML = X_SVG;
  $('#fx').appendChild(x); setTimeout(() => x.remove(), 520);
  S.wrong = S.wrong.filter((t) => now - t < 1500); S.wrong.push(now);
  if (S.wrong.length >= 3) {
    S.wrong = []; S.lockUntil = now + 1000;
    const vp = $('#viewport'); vp.classList.remove('shake'); void vp.offsetWidth; vp.classList.add('shake');
    showToast({ name: 'على مهلك…', fact: 'دوّر بعينك قبل لا تضغط' }, true);
  }
}

function onFound(o, r) {
  S.found.add(o.id);
  SFX.found();
  addMark(r);
  showToast(o);
  onSlotFound(o);
  updateProgress(true);
  if (S.found.size === S.round.length) endRound(true);
}

function markSize(r) {
  const v = S.view;
  const px = Math.max(r.w * v.W, r.h * v.H) * 1.35;
  return (px / v.W) * 100;
}
function addMark(r) {
  const dim = document.createElement('div'); dim.className = 'dim';
  Object.assign(dim.style, { left: r.x * 100 + '%', top: r.y * 100 + '%', width: r.w * 100 + '%', height: r.h * 100 + '%' });
  const m = document.createElement('div'); m.className = 'mark';
  Object.assign(m.style, { left: (r.x + r.w / 2) * 100 + '%', top: (r.y + r.h / 2) * 100 + '%', width: markSize(r) + '%' });
  m.innerHTML = '<span class="ring"></span><span class="check">' + CHECK_SVG + '</span>';
  $('#marks').append(dim, m);
  // show the circle briefly, then clear it so the scene stays clean
  setTimeout(() => { m.classList.add('fade'); dim.classList.add('fade'); }, 1100);
  setTimeout(() => { m.remove(); dim.remove(); }, 1600);
}

/* ---------- hint ---------- */
function useHint() {
  if (!S.running || S.hints <= 0) return;
  const left = S.round.filter((o) => !S.found.has(o.id));
  if (!left.length) return;
  const shown = left.filter((o) => S.visible.includes(o));
  const pool = shown.length ? shown : left;
  const o = pool[Math.floor(Math.random() * pool.length)];
  const r = o._rects[0];
  S.hints--; updateHints(); SFX.hint();
  const v = S.view;
  let p = toScreen(r.x + r.w / 2, r.y + r.h / 2);
  let delay = 0;
  if (p.x < 30 || p.x > v.VW - 30 || p.y < 30 || p.y > v.VH - 30) {
    v.tx = v.VW / 2 - (r.x + r.w / 2) * v.W * v.s;
    v.ty = v.VH / 2 - (r.y + r.h / 2) * v.H * v.s;
    clampView(); applyView(true); delay = 300;
    p = toScreen(r.x + r.w / 2, r.y + r.h / 2);
  }
  const vr = $('#viewport').getBoundingClientRect(), b = $('#btn-hint').getBoundingClientRect();
  setTimeout(() => sparkle(b.left + b.width / 2, b.top + b.height / 2, vr.left + p.x, vr.top + p.y, () => ringAt(r)), delay);
}
function sparkle(x0, y0, x1, y1, done) {
  const fx = $('#fx');
  const comet = document.createElement('div'); comet.className = 'comet'; fx.appendChild(comet);
  const qx = (x0 + x1) / 2, qy = Math.min(y0, y1) - 160;
  const t0 = performance.now(), dur = 700;
  (function step(now) {
    const t = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - t, 2);
    const x = (1 - e) * (1 - e) * x0 + 2 * (1 - e) * e * qx + e * e * x1;
    const y = (1 - e) * (1 - e) * y0 + 2 * (1 - e) * e * qy + e * e * y1;
    comet.style.left = x + 'px'; comet.style.top = y + 'px';
    const s = document.createElement('div'); s.className = 'spark';
    s.style.left = x + (Math.random() - 0.5) * 14 + 'px'; s.style.top = y + (Math.random() - 0.5) * 14 + 'px';
    fx.appendChild(s); setTimeout(() => s.remove(), 620);
    if (t < 1) requestAnimationFrame(step); else { comet.remove(); done(); }
  })(t0);
}
function ringAt(r) {
  if (!S.running) return;
  const h = document.createElement('div'); h.className = 'hint-ring';
  Object.assign(h.style, { left: (r.x + r.w / 2) * 100 + '%', top: (r.y + r.h / 2) * 100 + '%', width: markSize(r) + '%' });
  $('#marks').appendChild(h);
  setTimeout(() => h.remove(), 2200);
}

/* ---------- slots + icons ---------- */
function cropCanvas(o, size = 120) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const img = S.stage && S.stage._img, r = o._rects && o._rects[0];
  if (!img || !r) return c;
  const iw = img.naturalWidth, ih = img.naturalHeight;
  let sx = r.x * iw, sy = r.y * ih, sw = r.w * iw, sh = r.h * ih;
  const pad = Math.max(sw, sh) * 0.06; sx -= pad; sy -= pad; sw += pad * 2; sh += pad * 2;
  const k = Math.min(size / sw, size / sh), dw = sw * k, dh = sh * k;
  try { c.getContext('2d').drawImage(img, sx, sy, sw, sh, (size - dw) / 2, (size - dh) / 2, dw, dh); } catch (e) { /* ignore */ }
  return c;
}
function iconEl(o) {
  if (!o.icon) return cropCanvas(o);
  const im = new Image(); im.alt = ''; im.draggable = false;
  im.onerror = () => im.replaceWith(cropCanvas(o));
  im.src = o.icon;
  return im;
}
function renderSlots() {
  const box = $('#slots'); box.innerHTML = '';
  for (let i = 0; i < CFG.slots; i++) { const s = document.createElement('div'); s.className = 'slot'; box.appendChild(s); fillSlot(s, S.visible[i]); }
}
function fillSlot(s, o) {
  s.innerHTML = ''; s.classList.toggle('empty', !o);
  if (!o) return;
  const ic = document.createElement('div'); ic.className = 'slot-icon'; ic.appendChild(iconEl(o));
  const n = document.createElement('span'); n.className = 'slot-name'; n.textContent = o.name;
  s.append(ic, n);
  s.classList.remove('in'); void s.offsetWidth; s.classList.add('in');
}
function onSlotFound(o) {
  const i = S.visible.indexOf(o);
  if (i < 0) { S.queue = S.queue.filter((q) => q !== o); return; }
  const next = S.queue.shift() || null;
  S.visible[i] = next;
  const s = $('#slots').children[i];
  s.classList.remove('in'); s.classList.add('out');
  setTimeout(() => { s.classList.remove('out'); fillSlot(s, next); }, 260);
}
function updateProgress(bump) {
  const n = S.found.size, t = S.round.length;
  const chip = $('#hud-progress');
  chip.textContent = `${ar(n)} / ${ar(t)}`;
  if (bump) { chip.classList.remove('bump'); void chip.offsetWidth; chip.classList.add('bump'); }
  $('#tray-fill').style.width = (t ? (n / t) * 100 : 0) + '%';
}
function updateHints() {
  $('#hint-count').textContent = ar(S.hints);
  $('#btn-hint').classList.toggle('empty', S.hints <= 0);
  $('#btn-hint').setAttribute('aria-label', `تلميح، باقي ${ar(S.hints)}`);
}

/* ---------- toast ---------- */
function showToast(o, warn) {
  const t = $('#toast');
  t.innerHTML = '';
  t.classList.toggle('warn', !!warn);
  const ic = document.createElement('div'); ic.className = 't-icon'; ic.innerHTML = warn ? X_SVG : CHECK_SVG.replace('<svg', '<svg width="22" height="22"');
  const body = document.createElement('div'); body.className = 't-body';
  const n = document.createElement('span'); n.className = 't-name'; n.textContent = o.name;
  const f = document.createElement('span'); f.className = 't-fact'; f.textContent = o.fact || '';
  body.append(n, f); t.append(ic, body);
  t.classList.add('show');
  clearTimeout(S.toastTimer);
  S.toastTimer = setTimeout(hideToast, warn ? 1400 : 2600);
}
function hideToast(now) { clearTimeout(S.toastTimer); $('#toast').classList.remove('show'); if (now) $('#toast').innerHTML = ''; }

/* ---------- debug boxes ---------- */
function renderDebugBoxes() {
  const marks = $('#marks');
  for (const o of S.stage._objs) for (const r of o._rects) {
    const d = document.createElement('div'); d.className = 'dbg';
    Object.assign(d.style, { left: r.x * 100 + '%', top: r.y * 100 + '%', width: r.w * 100 + '%', height: r.h * 100 + '%' });
    const l = document.createElement('span'); l.textContent = o.name + (S.round.includes(o) ? ' ★' : '');
    d.appendChild(l); marks.appendChild(d);
  }
}

/* ================= end ================= */
async function endRound(win) {
  if (!S.running) return;
  S.running = false; cancelAnimationFrame(S.raf);
  if (win) { SFX.win(); await sleep(350); confetti(); await sleep(1100); }
  else { SFX.lose(); await sleep(700); }
  if (S.screen !== 'game') return;   // someone pressed reset meanwhile
  renderEnd(win);
  show('end');
}
function renderEnd(win) {
  const n = S.found.size, t = S.round.length;
  $('#end-title').textContent = win ? 'أحسنت!' : n >= Math.ceil(t / 2) ? 'قريب جداً!' : 'خلص الوقت!';
  $('#end-score').textContent = `${ar(n)} / ${ar(t)}`;
  $('#end-stage').textContent = S.stage.short || S.stage.title;
  $('#end-sub').textContent = win ? 'لقيت كل الأغراض — هذي حكايتها'
    : n === 0 ? 'ولا يهمك، هذي الأغراض اللي كانت مخبّاية'
    : `لقيت ${ar(n)} ${n > 2 && n < 11 ? 'أغراض' : 'غرض'} — هذي حكايتها`;
  const grid = $('#end-grid'); grid.innerHTML = '';
  const ordered = S.round.filter((o) => S.found.has(o.id)).concat(S.round.filter((o) => !S.found.has(o.id)));
  ordered.forEach((o, i) => {
    const found = S.found.has(o.id);
    const card = document.createElement('div'); card.className = 'card' + (found ? '' : ' miss');
    card.style.animationDelay = (0.25 + i * 0.07) + 's';
    const ic = document.createElement('div'); ic.className = 'card-icon'; ic.appendChild(iconEl(o));
    const body = document.createElement('div'); body.className = 'card-body';
    const head = document.createElement('div'); head.className = 'card-head';
    const nm = document.createElement('span'); nm.className = 'card-name'; nm.textContent = o.name;
    const chip = document.createElement('span'); chip.className = 'card-chip'; chip.textContent = found ? (o.country || S.stage.short || '') : 'ما لقيتها';
    head.append(nm); if (chip.textContent) head.append(chip);
    const fact = document.createElement('span'); fact.className = 'card-fact'; fact.textContent = o.fact || '';
    body.append(head, fact); card.append(ic, body); grid.appendChild(card);
  });
}
function confetti() {
  const fx = $('#fx'), cols = ['#E8A317', '#1D7F7A', '#C2304B', '#F6EBD9', '#3B3A8C'];
  for (let i = 0; i < 60; i++) {
    const c = document.createElement('div'); c.className = 'confetti';
    c.style.left = Math.random() * 100 + 'vw';
    c.style.background = cols[i % cols.length];
    c.style.animationDuration = 1.2 + Math.random() * 1.2 + 's';
    c.style.animationDelay = Math.random() * 0.3 + 's';
    fx.appendChild(c); setTimeout(() => c.remove(), 2800);
  }
}
function goStart() {
  S.running = false; cancelAnimationFrame(S.raf); S.busy = false;
  hideToast(true);
  show('start');
}

/* ================= staff panel ================= */
function openStaff() {
  const box = $('#staff-stages'); box.innerHTML = '';
  $('#staff-sound').textContent = S.sound ? 'الصوت: شغّال' : 'الصوت: مقفول';
  $('#staff-debug').textContent = document.body.classList.contains('debug') ? 'مناطق الضغط: ظاهرة' : 'مناطق الضغط: مخفية';
  const real = S.realStages;
  $('#staff-note').textContent = S.demo
    ? (real ? 'ملف المراحل انقرأ بس ولا مرحلة جاهزة — شغّالة النسخة التجريبية. الأسباب تحت.' : 'ما انقرأ data/stages.json — شغّالة النسخة التجريبية. لازم تفتح اللعبة من سيرفر (مو بالضغط على الملف).')
    : '';
  const list = (real || []).concat(S.stages);
  list.forEach((st) => {
    const row = document.createElement('div'); row.className = 'staff-stage';
    const sw = document.createElement('span'); sw.className = 'sw'; sw.style.background = st.color || '#999';
    const info = document.createElement('div'); info.className = 'info';
    const t = document.createElement('strong'); t.textContent = (st.short || st.title) + (S.stages.includes(st) && S.demo ? ' (تجريبية)' : '');
    const sm = document.createElement('small');
    const ok = isPlayable(st);
    sm.textContent = ok ? `جاهزة — ${ar(st._ready.length)} من ${ar(st._objs.length)} أغراض محدد مكانها` : st._status || 'غير جاهزة';
    if (!ok) sm.className = 'bad';
    info.append(t, sm); row.append(sw, info);
    if (ok && S.stages.includes(st)) {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = 'العب';
      b.addEventListener('click', () => { $('#staff-panel').hidden = true; S.running = false; cancelAnimationFrame(S.raf); S.busy = false; onStart(st); });
      row.appendChild(b);
    }
    box.appendChild(row);
  });
  $('#staff-panel').hidden = false;
}
function bindStaff() {
  const corner = $('#staff-corner');
  let timer = 0;
  corner.addEventListener('pointerdown', (e) => { e.stopPropagation(); timer = setTimeout(openStaff, 3000); });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => corner.addEventListener(ev, () => clearTimeout(timer)));
  $('#staff-close').addEventListener('click', () => { $('#staff-panel').hidden = true; });
  $('#staff-sound').addEventListener('click', () => { S.sound = !S.sound; openStaff(); });
  $('#staff-debug').addEventListener('click', () => { document.body.classList.toggle('debug'); openStaff(); });
  $('#staff-reload').addEventListener('click', () => location.reload());
  window.addEventListener('keydown', (e) => { if (e.key === 'F2' || (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'd')) openStaff(); });
}

/* ================= boot ================= */
function bindUI() {
  $('#btn-start').addEventListener('click', () => onStart());
  $('#btn-again').addEventListener('click', goStart);
  $('#btn-hint').addEventListener('click', useHint);
  bindViewport(); bindStaff();
  document.addEventListener('pointerdown', () => { S.lastInput = Date.now(); }, true);
  ['gesturestart', 'gesturechange', 'dblclick', 'contextmenu'].forEach((ev) => document.addEventListener(ev, (e) => e.preventDefault()));
  window.addEventListener('resize', () => { scaleFrames(); if (S.screen === 'game') { fit(); resetView(); } });
  setInterval(() => {
    if ((S.screen === 'end' || S.screen === 'reveal') && !S.busy && Date.now() - S.lastInput > CFG.idleMs) goStart();
  }, 1000);
}

async function boot() {
  scaleFrames(); bindUI();
  await prepare();
  renderStamps();
}
boot();
