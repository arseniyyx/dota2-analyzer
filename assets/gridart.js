'use strict';
/* ---------- art hero grid: a photo drawn with hundreds of empty categories whose names are dots,
   plus hero zones (POS 1-5) the player fills in Dota. Shares globals with app.js and grid.js. ---------- */

const ART_W = 1200, ART_H = 600; // Dota's hero grid space, roughly
const ZONE_PRESETS = {
  right: { art: [0, 0, 640, 600], zones: [[660, 10, 250, 225, 1], [930, 40, 250, 200, 2], [700, 250, 480, 95, 5], [660, 360, 250, 230, 3], [930, 360, 250, 230, 4]] },
  bottom: { art: [0, 0, 1200, 380], zones: [0, 1, 2, 3, 4].map(i => [i * 240, 400, 230, 190, i + 1]) },
  none: { art: [0, 0, 1200, 600], zones: [] },
};

S.art = S.art || { img: null, style: 'edges', spacing: 8, amount: 22, char: '.', invert: false, preset: 'right', names: ['POS 1', 'POS 2', 'POS 3', 'POS 4', 'POS 5'], frames: true, fill: false, text: '', scale: 1, name: 'Art grid' };

// where the dots go: Sobel edges (outlines) or Floyd-Steinberg dithering (fill), on a grid of `spacing` units
function artDots(img, [ax, ay, aw, ah], o) {
  const cols = Math.floor(aw / o.spacing), rows = Math.floor(ah / o.spacing);
  const k = Math.min(cols / img.naturalWidth, rows / img.naturalHeight); // contain, centred
  const iw = Math.max(1, Math.round(img.naturalWidth * k)), ih = Math.max(1, Math.round(img.naturalHeight * k));
  const ox = Math.floor((cols - iw) / 2), oy = Math.floor((rows - ih) / 2);
  const cv = document.createElement('canvas'); cv.width = iw; cv.height = ih;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.filter = o.style === 'edges' ? 'blur(0.6px)' : 'none';
  ctx.drawImage(img, 0, 0, iw, ih);
  const px = ctx.getImageData(0, 0, iw, ih).data, lum = new Float32Array(iw * ih);
  for (let i = 0; i < iw * ih; i++) lum[i] = (0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]) * (px[i * 4 + 3] / 255);
  const on = new Uint8Array(iw * ih);
  if (o.style === 'edges') {
    const g = new Float32Array(iw * ih), at = (x, y) => lum[Math.min(ih - 1, Math.max(0, y)) * iw + Math.min(iw - 1, Math.max(0, x))];
    for (let y = 0; y < ih; y++) for (let x = 0; x < iw; x++) {
      const gx = at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1);
      const gy = at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1);
      g[y * iw + x] = Math.hypot(gx, gy);
    }
    const sorted = Float32Array.from(g).sort(), cut = sorted[Math.floor(sorted.length * (1 - o.amount / 100))] || 1;
    for (let i = 0; i < g.length; i++) on[i] = g[i] >= cut && g[i] > 8;
  } else {
    // dots where the photo is bright (the Dota background is dark); dithering keeps the shading
    const v = Float32Array.from(lum, x => (o.invert ? 255 - x : x) * (0.4 + o.amount / 50));
    for (let y = 0; y < ih; y++) for (let x = 0; x < iw; x++) {
      const i = y * iw + x, nv = v[i] > 127 ? 255 : 0, err = v[i] - nv;
      on[i] = nv > 0;
      if (x + 1 < iw) v[i + 1] += err * 7 / 16;
      if (y + 1 < ih) { if (x) v[i + iw - 1] += err * 3 / 16; v[i + iw] += err * 5 / 16; if (x + 1 < iw) v[i + iw + 1] += err / 16; }
    }
  }
  const dots = [];
  for (let y = 0; y < ih; y++) for (let x = 0; x < iw; x++) {
    if (!on[y * iw + x]) continue;
    dots.push([ax + (ox + x) * o.spacing, ay + (oy + y) * o.spacing]);
  }
  return dots;
}

function artLayout() {
  const o = S.art, pre = ZONE_PRESETS[o.preset];
  const zones = pre.zones.map(([x, y, w, h, pos]) => ({ x, y, w, h, pos, name: o.names[pos - 1] || `POS ${pos}` }));
  const lines = o.text.split('\n').map(t => t.trim()).filter(Boolean).slice(0, 14);
  const textBox = lines.length ? { x: 16, y: ART_H - 14 - lines.length * 22, w: Math.max(...lines.map(l => l.length)) * 9 + 10, h: lines.length * 22 + 8 } : null;
  const inside = (x, y, b, pad) => x > b.x - pad && x < b.x + b.w + pad && y > b.y - pad && y < b.y + b.h + pad;
  let dots = o.img ? artDots(o.img, pre.art, o) : [];
  dots = dots.filter(([x, y]) => !zones.some(z => inside(x, y, z, 12)) && !(textBox && inside(x, y, textBox, 6)));
  if (o.frames) for (const z of zones) { // dotted frame around every hero zone, like hand-made grids
    for (let x = z.x - 6; x <= z.x + z.w + 6; x += o.spacing) dots.push([x, z.y - 8], [x, z.y + z.h + 4]);
    for (let y = z.y - 8 + o.spacing; y < z.y + z.h + 4; y += o.spacing) dots.push([z.x - 8, y], [z.x + z.w + 4, y]);
  }
  return { dots, zones, lines, textBox };
}

async function artConfig() {
  const o = S.art, { dots, zones, lines, textBox } = artLayout(), s = o.scale, r = v => Math.round(v * s);
  const meta = o.fill ? await metaGrid(4) : null;
  return {
    config_name: o.name || 'Art grid',
    categories: [
      ...zones.map(z => ({ category_name: z.name, x_position: r(z.x), y_position: r(z.y), width: r(z.w), height: r(z.h), hero_ids: meta ? meta[z.pos - 1].heroes.slice(0, 12) : [] })),
      ...lines.map((t, i) => ({ category_name: t, x_position: r(textBox.x), y_position: r(textBox.y + i * 22), width: r(t.length * 9 + 10), height: r(22), hero_ids: [] })),
      ...dots.map(([x, y]) => ({ category_name: o.char, x_position: r(x), y_position: r(y), width: r(o.spacing), height: r(o.spacing), hero_ids: [] })),
    ],
  };
}

function drawArt() {
  const cv = $('artCanvas');
  if (!cv) return;
  const { dots, zones, lines, textBox } = artLayout(), o = S.art;
  const px = cv.clientWidth * (devicePixelRatio || 1);
  cv.width = px; cv.height = px / 2;
  const ctx = cv.getContext('2d'), k = px / ART_W;
  ctx.fillStyle = '#121820'; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.fillStyle = '#d5dbe3'; ctx.font = `${Math.max(7, 13 * k)}px "Exo 2", sans-serif`; ctx.textBaseline = 'top';
  for (const [x, y] of dots) ctx.fillText(o.char, x * k, (y - 6) * k);
  ctx.strokeStyle = 'rgba(227,176,75,.35)'; ctx.lineWidth = 1;
  ctx.font = `700 ${Math.max(8, 13 * k)}px "Exo 2", sans-serif`;
  for (const z of zones) { ctx.setLineDash([4, 4]); ctx.strokeRect(z.x * k, z.y * k, z.w * k, z.h * k); ctx.fillStyle = '#f5cd78'; ctx.fillText(z.name, (z.x + 8) * k, (z.y + 6) * k); }
  ctx.setLineDash([]); ctx.fillStyle = '#e8ecf2';
  lines.forEach((t, i) => ctx.fillText(t, textBox.x * k, (textBox.y + i * 22) * k));
  $('artCount').textContent = L(`Категорий в сетке: ${dots.length + zones.length + lines.length}`, `Categories in the grid: ${dots.length + zones.length + lines.length}`)
    + (dots.length > 4000 ? L(' — много, Dota может тормозить: уменьши плотность', ' — a lot, Dota may lag: lower the density') : '');
}

function renderArt() {
  const o = S.art;
  $('artPreset').value = o.preset; $('artStyle').value = o.style; $('artChar').value = o.char;
  $('artSpacing').value = o.spacing; $('artAmount').value = o.amount; $('artScale').value = o.scale;
  $('artInvert').checked = o.invert; $('artFrames').checked = o.frames; $('artFill').checked = o.fill;
  $('artText').value = o.text; $('artName').value = o.name;
  $('artZoneNames').innerHTML = ZONE_PRESETS[o.preset].zones.map(z => z[4]).sort().map(p => `<input class="field" data-p="${p}" value="${esc(o.names[p - 1])}" aria-label="${L('Зона', 'Zone')} ${p}">`).join('');
  $('artZoneNames').querySelectorAll('input').forEach(i => i.addEventListener('input', () => { o.names[+i.dataset.p - 1] = i.value; drawArt(); }));
  $('artOut').hidden = !o.img && !o.text && o.preset === 'none';
  drawArt();
}

function wireArt() {
  const o = S.art, num = (id, key) => $(id).addEventListener('input', e => { o[key] = +e.target.value; drawArt(); });
  const read = async file => {
    if (!file || !file.type.startsWith('image/')) return;
    const img = new Image(); img.src = URL.createObjectURL(file); await img.decode();
    o.img = img; $('artOut').hidden = false; drawArt();
  };
  $('artFile').addEventListener('change', e => read(e.target.files[0]));
  const drop = $('artDrop');
  ['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => read(e.dataTransfer.files[0]));
  num('artSpacing', 'spacing'); num('artAmount', 'amount'); num('artScale', 'scale');
  $('artPreset').addEventListener('change', e => { o.preset = e.target.value; renderArt(); });
  $('artStyle').addEventListener('change', e => { o.style = e.target.value; drawArt(); });
  $('artChar').addEventListener('change', e => { o.char = e.target.value; drawArt(); });
  $('artInvert').addEventListener('change', e => { o.invert = e.target.checked; drawArt(); });
  $('artFrames').addEventListener('change', e => { o.frames = e.target.checked; drawArt(); });
  $('artFill').addEventListener('change', e => { o.fill = e.target.checked; });
  $('artText').addEventListener('input', e => { o.text = e.target.value; $('artOut').hidden = false; drawArt(); });
  $('artName').addEventListener('input', e => { o.name = e.target.value; });
  $('artMerge').addEventListener('change', async e => {
    try { const base = JSON.parse(await e.target.files[0].text()); if (!Array.isArray(base.configs)) throw new Error(); S.gridBase = base; $('artMergeNote').textContent = L(`Твой файл загружен: ${base.configs.length} сеток, новая добавится к ним.`, `Your file is loaded: ${base.configs.length} grids, the new one will be added.`); }
    catch { $('artMergeNote').textContent = L('Это не файл сеток Dota (hero_grid_config.json).', 'That is not a Dota grid file (hero_grid_config.json).'); }
  });
  $('artDownload').addEventListener('click', async () => {
    const cfg = await artConfig();
    const base = S.gridBase ? { ...S.gridBase, configs: S.gridBase.configs.filter(c => c.config_name !== cfg.config_name) } : { version: 3, configs: [] };
    base.configs.push(cfg);
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([JSON.stringify(base)], { type: 'application/json' })), download: 'hero_grid_config.json' });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });
  window.addEventListener('resize', () => { if (!$('viewTools').hidden) drawArt(); });
}
wireArt();
