/* ---------- hero paint: a 3D model of the default hero, click a part and pick a colour.
   The colours turn into a code for D2A Mods, which recolours the same game textures on the player's PC.
   Loaded on demand from app.js; uses its globals ($, L, EN, esc, heroImg, getJSON, store). ---------- */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const BASE = 'paint/';
const SWATCHES = ['#2ecc71', '#0e9f6e', '#dc143c', '#ff7f27', '#f1c40f', '#a3ff12', '#00d2d3', '#2e5bff', '#8e44ad', '#ff4fa3', '#f5f5f5', '#95a5a6', '#1a1a1a'];
const P = { index: null, short: null, meta: null, sel: null, mats: {}, icons: {}, three: null, loading: 0 };
const saved = store.get('paint') || { heroes: {} };
const heroState = () => (saved.heroes[P.short] ||= { parts: {}, icons: {} });
const persist = () => store.set('paint', saved);

/* ---- colour: hue and saturation from the chosen colour, each pixel keeps its own lightness, moved toward the
   chosen colour's lightness; the app uses the same formula, so the game looks like the preview ---- */
function rgb2hls(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, l, 0];
  const d = mx - mn, s = l <= 0.5 ? d / (mx + mn) : d / (2 - mx - mn);
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [((h / 6) + 1) % 1, l, s];
}
function hls2rgb(h, l, s) {
  if (!s) return [l, l, l];
  const q = l <= 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = t => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * t * 6 : t < .5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
}
const hex2rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
function recolor(src, hex, k) {
  const [th, tl, ts] = rgb2hls(...hex2rgb(hex)), out = new Uint8ClampedArray(src.data), d = src.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255, l = rgb2hls(r, g, b)[1];
    const nl = tl <= 0.5 ? l * 2 * tl : l + (1 - l) * (2 * tl - 1), [nr, ng, nb] = hls2rgb(th, nl, ts);
    out[i] = (r + (nr - r) * k) * 255; out[i + 1] = (g + (ng - g) * k) * 255; out[i + 2] = (b + (nb - b) * k) * 255;
  }
  return new ImageData(out, src.width, src.height);
}
const pixels = img => { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0); return x.getImageData(0, 0, c.width, c.height); };

/* ---- 3D ---- */
function setupThree() {
  const host = $('paintCanvas');
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  renderer.domElement.setAttribute('role', 'img');
  renderer.domElement.setAttribute('aria-label', L('3D-модель героя. Тяни, чтобы повернуть, колесо для зума, клик по части выбирает её.', '3D hero model. Drag to turn, scroll to zoom, click a part to select it.'));
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(35, 1, 1, 5000);
  scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x2a2420, 1.6));
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(1, 2, 1.5); scene.add(key);
  const rim = new THREE.DirectionalLight(0xffd9a0, 1.1); rim.position.set(-1.5, 1, -1); scene.add(rim);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.enablePan = false;
  const group = new THREE.Group(); scene.add(group);
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const pick = e => {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    return ray.intersectObjects(group.children, true)[0];
  };
  let down = null;
  renderer.domElement.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
  renderer.domElement.addEventListener('pointerup', e => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return; // a drag turns the model, it does not pick
    const hit = pick(e);
    if (hit) select({ kind: 'mat', name: hit.object.material.name });
  });
  renderer.domElement.addEventListener('pointermove', e => { if (e.buttons) return; renderer.domElement.style.cursor = pick(e) ? 'pointer' : 'grab'; });
  const resize = () => { const w = host.clientWidth, h = host.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
  new ResizeObserver(resize).observe(host); resize();
  const loop = () => {
    requestAnimationFrame(loop);
    if ($('viewPaint').hidden) return;
    const t = performance.now() / 1000;
    for (const m of Object.values(P.mats)) m.mat.emissiveIntensity = P.sel?.kind === 'mat' && (P.sel.name === m.name || $('paintAll').checked) ? 0.18 + 0.12 * Math.sin(t * 4) : 0;
    controls.update(); renderer.render(scene, camera);
  };
  loop();
  return { renderer, scene, camera, controls, group };
}

async function openHero(short) {
  const T = P.three, token = ++P.loading;
  P.short = short; P.sel = null; P.mats = {}; P.icons = {};
  if (location.hash !== `#paint-${short}`) history.replaceState(null, '', `#paint-${short}`);
  markHero();
  T.group.clear();
  $('paintHint').textContent = L('Загружаю модель…', 'Loading the model…');
  const meta = await getJSON(`${BASE}h/${short}/meta.json?d=${new Date().toISOString().slice(0, 10)}`);
  if (token !== P.loading) return;
  P.meta = meta;
  const loader = new GLTFLoader().setPath(`${BASE}h/${short}/`);
  const gltfs = await Promise.all(meta.parts.map(p => loader.loadAsync(p.glb).then(g => [p, g]).catch(() => null)));
  if (token !== P.loading) return;
  for (const [part, g] of gltfs.filter(Boolean)) {
    g.scene.traverse(o => {
      if (!o.isMesh) return;
      const info = part.materials.find(m => m.name === o.material.name);
      if (!info) return;
      if (!P.mats[info.name]) {
        o.material.emissive = new THREE.Color(0xffffff); o.material.emissiveIntensity = 0;
        P.mats[info.name] = { name: info.name, color: info.color, part, mat: o.material, orig: o.material.map };
      } else o.material = P.mats[info.name].mat; // one material, one recolour
    });
    T.group.add(g.scene);
  }
  const box = new THREE.Box3().setFromObject(T.group), size = box.getSize(new THREE.Vector3()), mid = box.getCenter(new THREE.Vector3());
  T.group.position.sub(mid);
  const dist = Math.max(size.x, size.y, size.z) * 1.7;
  T.camera.position.set(dist * 0.35, dist * 0.15, dist); T.controls.target.set(0, 0, 0);
  T.controls.minDistance = dist * 0.3; T.controls.maxDistance = dist * 3; T.controls.update();
  $('paintHint').textContent = L('Тяни, чтобы повернуть · колесо для зума · клик по части, чтобы покрасить', 'Drag to turn · scroll to zoom · click a part to paint it');
  for (const m of Object.values(P.mats)) applyMat(m);
  drawIcons(); drawParts(); select(null); summary();
}

function applyMat(m) {
  const v = heroState().parts[m.name];
  if (!m.orig?.image) return;
  if (!v) { m.mat.map = m.orig; m.mat.needsUpdate = true; return; }
  m.src ||= pixels(m.orig.image);
  if (!m.tex) {
    m.canvas = document.createElement('canvas'); m.canvas.width = m.src.width; m.canvas.height = m.src.height;
    m.tex = new THREE.CanvasTexture(m.canvas);
    Object.assign(m.tex, { flipY: m.orig.flipY, colorSpace: m.orig.colorSpace, wrapS: m.orig.wrapS, wrapT: m.orig.wrapT });
  }
  m.canvas.getContext('2d').putImageData(recolor(m.src, v[0], v[1]), 0, 0);
  m.tex.needsUpdate = true; m.mat.map = m.tex; m.mat.needsUpdate = true;
}

/* ---- icons ---- */
function drawIcons() {
  const box = $('paintIcons');
  box.innerHTML = P.meta.abilities.map(a => `<button class="paint-icon" type="button" data-ab="${esc(a.name)}" aria-label="${esc(a.name.replace(/_/g, ' '))}"><canvas width="64" height="64"></canvas></button>`).join('') ||
    `<span class="note">${L('Нет иконок', 'No icons')}</span>`;
  for (const a of P.meta.abilities) {
    const btn = box.querySelector(`[data-ab="${CSS.escape(a.name)}"]`), img = new Image();
    P.icons[a.name] = { ...a, btn };
    img.onload = () => { P.icons[a.name].src = pixels(img); applyIcon(P.icons[a.name]); };
    img.src = `${BASE}h/${P.short}/${a.img}`;
    btn.addEventListener('click', () => select({ kind: 'icon', name: a.name }));
  }
}
function applyIcon(ic) {
  if (!ic.src) return;
  const v = heroState().icons[ic.name], c = ic.btn.querySelector('canvas'), x = c.getContext('2d'), tmp = document.createElement('canvas');
  tmp.width = ic.src.width; tmp.height = ic.src.height; tmp.getContext('2d').putImageData(v ? recolor(ic.src, v[0], v[1]) : ic.src, 0, 0);
  x.clearRect(0, 0, 64, 64); x.drawImage(tmp, 0, 0, 64, 64);
  ic.btn.classList.toggle('painted', !!v);
}

/* ---- panel ---- */
const partLabel = m => { const p = m.part, many = P.meta.parts.find(x => x.key === p.key).materials.length > 1; return (EN ? p.en : p.ru) + (many ? ` · ${m.name}` : ''); };
function drawParts() {
  const st = heroState();
  $('paintParts').innerHTML = `<span class="label">${L('Части', 'Parts')}</span>` + Object.values(P.mats).map(m => {
    const v = st.parts[m.name];
    return `<button class="paint-part ${P.sel?.kind === 'mat' && P.sel.name === m.name ? 'on' : ''}" type="button" data-mat="${esc(m.name)}">
      <span class="paint-dot" style="${v ? `background:${v[0]}` : ''}"></span>${esc(partLabel(m))}<span class="note">${v ? `${v[0]} · ${Math.round(v[1] * 100)}%` : L('родной цвет', 'original')}</span></button>`;
  }).join('');
  $('paintParts').querySelectorAll('.paint-part').forEach(b => b.addEventListener('click', () => select({ kind: 'mat', name: b.dataset.mat })));
}
function select(sel) {
  P.sel = sel;
  const st = heroState(), v = sel && (sel.kind === 'mat' ? st.parts[sel.name] : st.icons[sel.name]);
  $('paintSelName').textContent = $('paintAll').checked ? L('Весь герой', 'Whole hero') : !sel ? L('Кликни по части модели или выбери в списке', 'Click a part of the model or pick one in the list')
    : sel.kind === 'mat' ? partLabel(P.mats[sel.name]) : L('Иконка: ', 'Icon: ') + sel.name.replace(/_/g, ' ');
  if (v) { setColorInputs(v[0]); $('paintStrength').value = Math.round(v[1] * 100); $('paintStrengthVal').textContent = `${Math.round(v[1] * 100)}%`; }
  document.querySelectorAll('.paint-icon').forEach(b => b.classList.toggle('on', sel?.kind === 'icon' && b.dataset.ab === sel.name));
  drawParts();
}
const setColorInputs = hex => { $('paintColor').value = hex; $('paintHex').value = hex; syncWheel(hex); };

/* ---- colour wheel: hue around the circle, saturation from the centre out, brightness on its own slider ---- */
const hsv = { h: 0.4, s: 0.8, v: 0.8 };
function hsv2rgb(h, s, v) {
  const i = Math.floor(h * 6), f = h * 6 - i, p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  return [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][((i % 6) + 6) % 6];
}
function rgb2hsv(r, g, b) {
  const mx = Math.max(r, g, b), d = mx - Math.min(r, g, b);
  const h = !d ? 0 : mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [((h / 6) + 1) % 1, mx ? d / mx : 0, mx];
}
const toHex = rgb => '#' + rgb.map(c => Math.round(c * 255).toString(16).padStart(2, '0')).join('');
let wheelV = -1;
function drawWheel() {
  if (wheelV === hsv.v) return;
  wheelV = hsv.v;
  const c = $('paintWheel'), x = c.getContext('2d'), n = c.width, r = n / 2, img = x.createImageData(n, n);
  for (let py = 0; py < n; py++) for (let px = 0; px < n; px++) {
    const dx = px - r + .5, dy = py - r + .5, d = Math.hypot(dx, dy) / r, i = (py * n + px) * 4;
    if (d > 1) continue;
    const [cr, cg, cb] = hsv2rgb(((Math.atan2(dy, dx) / (2 * Math.PI)) + 1) % 1, d, hsv.v);
    img.data[i] = cr * 255; img.data[i + 1] = cg * 255; img.data[i + 2] = cb * 255;
    img.data[i + 3] = d > 0.985 ? (1 - d) / 0.015 * 255 : 255; // a soft edge
  }
  x.putImageData(img, 0, 0);
}
function placeDot() {
  const a = hsv.h * 2 * Math.PI, dot = $('paintWheelDot');
  dot.style.left = `${50 + Math.cos(a) * hsv.s * 50}%`; dot.style.top = `${50 + Math.sin(a) * hsv.s * 50}%`;
  dot.style.background = toHex(hsv2rgb(hsv.h, hsv.s, hsv.v));
  $('paintValue').value = Math.round(hsv.v * 100); $('paintValueVal').textContent = `${Math.round(hsv.v * 100)}%`;
  $('paintWheel').setAttribute('aria-valuetext', `${Math.round(hsv.h * 360)}°, ${Math.round(hsv.s * 100)}%`);
}
function syncWheel(hex) {
  [hsv.h, hsv.s, hsv.v] = rgb2hsv(...hex2rgb(hex));
  drawWheel(); placeDot();
}
function fromWheel() {
  const hex = toHex(hsv2rgb(hsv.h, hsv.s, hsv.v));
  $('paintColor').value = hex; $('paintHex').value = hex;
  drawWheel(); placeDot(); paint();
}
function wireWheel() {
  const c = $('paintWheel');
  const at = e => {
    const r = c.getBoundingClientRect(), dx = e.clientX - r.left - r.width / 2, dy = e.clientY - r.top - r.height / 2;
    hsv.h = ((Math.atan2(dy, dx) / (2 * Math.PI)) + 1) % 1; hsv.s = Math.min(1, Math.hypot(dx, dy) / (r.width / 2));
    if (hsv.v < 0.05) hsv.v = 0.8; // picking on a black wheel would do nothing visible
    fromWheel();
  };
  c.addEventListener('pointerdown', e => { c.setPointerCapture(e.pointerId); at(e); });
  c.addEventListener('pointermove', e => { if (c.hasPointerCapture(e.pointerId)) at(e); });
  c.addEventListener('keydown', e => {
    const step = e.shiftKey ? 0.1 : 0.02, k = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[e.key];
    if (!k) return;
    e.preventDefault(); hsv.h = (hsv.h + k[0] + 1) % 1; hsv.s = Math.min(1, Math.max(0, hsv.s + k[1])); fromWheel();
  });
  $('paintValue').addEventListener('input', () => { hsv.v = +$('paintValue').value / 100; fromWheel(); });
  syncWheel($('paintColor').value);
}

// what a colour change paints: the whole hero, the selected part or icon, and all icons if that box is ticked
function targets() {
  const out = [];
  if ($('paintAll').checked) Object.keys(P.mats).forEach(n => out.push(['mat', n]));
  else if (P.sel) out.push([P.sel.kind, P.sel.name]);
  if ($('paintAllIcons').checked) Object.keys(P.icons).forEach(n => out.push(['icon', n]));
  return out;
}
const pending = new Map(); // repaints wait for the next frame; quick changes add up instead of replacing each other
function flush() {
  if (pending.size === 1) requestAnimationFrame(() => {
    for (const [kind, name] of pending.values()) kind === 'mat' ? applyMat(P.mats[name]) : applyIcon(P.icons[name]);
    pending.clear(); drawParts(); summary();
  });
}
function paint() {
  const hex = $('paintColor').value, k = +$('paintStrength').value / 100, st = heroState();
  const ts = targets();
  if (!ts.length) { $('paintSelName').textContent = L('Сначала выбери часть или отметь «Красить всего героя»', 'Pick a part first or tick Paint the whole hero'); return; }
  for (const [kind, name] of ts) {
    if (kind === 'mat') st.parts[name] = [hex, k, P.mats[name].color];
    else st.icons[name] = [hex, k, P.icons[name].icon];
  }
  persist();
  for (const t of ts) { pending.set(t.join(':'), t); flush(); }
}
function reset(all) {
  const st = heroState();
  const ts = all ? [...Object.keys(P.mats).map(n => ['mat', n]), ...Object.keys(P.icons).map(n => ['icon', n])] : targets();
  for (const [kind, name] of ts) delete (kind === 'mat' ? st.parts : st.icons)[name];
  persist();
  for (const [kind, name] of ts) kind === 'mat' ? applyMat(P.mats[name]) : applyIcon(P.icons[name]);
  drawParts(); summary();
}

/* ---- hero list ---- */
function drawHeroes() {
  const q = $('paintSearch').value.trim().toLowerCase();
  $('paintHeroes').innerHTML = P.index.filter(h => !q || h.name.toLowerCase().includes(q)).map(h => {
    const painted = Object.values(saved.heroes[h.npc.replace('npc_dota_hero_', '')]?.parts || {}).length;
    return `<button class="paint-hero" type="button" role="option" data-short="${h.npc.replace('npc_dota_hero_', '')}" title="${esc(h.name)}">
      ${heroImg(h.id) ? `<img src="${heroImg(h.id)}" alt="" loading="lazy" width="64" height="36">` : ''}<span>${esc(h.name)}</span>${painted ? '<i class="paint-dot on"></i>' : ''}</button>`;
  }).join('') || `<p class="note">${L('Не нашёл', 'Nothing found')}</p>`;
  $('paintHeroes').querySelectorAll('.paint-hero').forEach(b => b.addEventListener('click', () => openHero(b.dataset.short)));
  markHero();
}
const markHero = () => document.querySelectorAll('.paint-hero').forEach(b => b.setAttribute('aria-selected', String(b.dataset.short === P.short)));

/* ---- output: a code for the app, or straight into the app when the page runs inside it ---- */
function code() {
  const t = {};
  for (const h of Object.values(saved.heroes)) for (const v of [...Object.values(h.parts), ...Object.values(h.icons)]) if (v[2]) t[v[2]] = [v[0], v[1]];
  return { n: Object.keys(t).length, text: 'D2AP1:' + btoa(unescape(encodeURIComponent(JSON.stringify({ v: 1, t })))) };
}
function summary() {
  const heroes = Object.entries(saved.heroes).filter(([, h]) => Object.keys(h.parts).length + Object.keys(h.icons).length);
  $('paintSummary').textContent = heroes.length ? L(`Раскрашено героев: ${heroes.length}. Код содержит все твои раскраски, программа поставит их разом.`, `Heroes painted: ${heroes.length}. The code holds all of them, the app installs them at once.`)
    : L('Пока ничего не раскрашено.', 'Nothing painted yet.');
  drawHeroesDots();
}
const drawHeroesDots = () => document.querySelectorAll('.paint-hero').forEach(b => {
  const n = Object.keys(saved.heroes[b.dataset.short]?.parts || {}).length;
  let dot = b.querySelector('.paint-dot'); if (n && !dot) b.insertAdjacentHTML('beforeend', '<i class="paint-dot on"></i>'); if (!n && dot) dot.remove();
});

function wire() {
  $('paintSwatches').innerHTML = SWATCHES.map(c => `<button type="button" class="paint-swatch" style="background:${c}" data-c="${c}" aria-label="${c}" title="${c}"></button>`).join('');
  $('paintSwatches').querySelectorAll('.paint-swatch').forEach(b => b.addEventListener('click', () => { setColorInputs(b.dataset.c); paint(); }));
  $('paintColor').addEventListener('input', () => { $('paintHex').value = $('paintColor').value; syncWheel($('paintColor').value); paint(); });
  $('paintHex').addEventListener('input', () => { const v = $('paintHex').value.trim(); if (/^#[0-9a-f]{6}$/i.test(v)) { $('paintColor').value = v.toLowerCase(); syncWheel(v.toLowerCase()); paint(); } });
  wireWheel();
  $('paintStrength').addEventListener('input', () => { $('paintStrengthVal').textContent = `${$('paintStrength').value}%`; paint(); });
  $('paintAll').addEventListener('change', () => select(P.sel));
  $('paintResetSel').addEventListener('click', () => reset(false));
  $('paintResetHero').addEventListener('click', () => reset(true));
  $('paintSearch').addEventListener('input', drawHeroes);
  $('paintCopy').addEventListener('click', async () => {
    const c = code();
    if (!c.n) { $('paintOutNote').textContent = L('Сначала раскрась что-нибудь.', 'Paint something first.'); return; }
    try { await navigator.clipboard.writeText(c.text); $('paintOutNote').textContent = L('Код скопирован. В D2A Mods: вкладка «Кастомизация» → «Раскраска героев» → «Вставить код».', 'Copied. In D2A Mods: Customisation tab → Hero paint → Paste code.'); }
    catch { $('paintOutNote').textContent = L('Не получилось скопировать автоматически.', 'Could not copy automatically.'); }
  });
  $('paintApply').addEventListener('click', async () => {
    const c = code();
    $('paintOutNote').textContent = c.n ? await window.pywebview.api.apply(c.text) : L('Сначала раскрась что-нибудь.', 'Paint something first.');
  });
}

export async function renderPaint() {
  if (!P.index) {
    P.index = await getJSON(`${BASE}index.json?d=${new Date().toISOString().slice(0, 10)}`);
    P.three = setupThree(); wire(); drawHeroes();
  }
  const inApp = () => { if (window.pywebview?.api) $('paintApply').hidden = false; };
  inApp(); window.addEventListener('pywebviewready', inApp, { once: true });
  const want = (location.hash.match(/^#paint-([\w]+)/) || [])[1];
  const first = want && P.index.some(h => h.npc === `npc_dota_hero_${want}`) ? want : P.short || P.index[0]?.npc.replace('npc_dota_hero_', '');
  if (first && first !== P.short) await openHero(first);
}
