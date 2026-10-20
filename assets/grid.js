'use strict';
/* ---------- hero grid tool: a picture (tier list, screenshot) -> Dota 2 hero_grid_config.json ----------
   Shares globals with app.js (S, L, $, esc, heroImg, heroName, getJSON, dataUrl, loadGroup, heroWr, heroPick, posPrior). */

let FEATS = null;
const hexBytes = s => Uint8Array.from(s.match(/../g), b => parseInt(b, 16));
function unit(v) {
  const out = Float32Array.from(v);
  let m = 0; for (const x of out) m += x; m /= out.length;
  let n = 0; for (let i = 0; i < out.length; i++) { out[i] -= m; n += out[i] * out[i]; }
  out.std = Math.sqrt(n / out.length); // contrast: flat backgrounds would otherwise match some hero after normalising
  n = Math.sqrt(n) || 1;
  for (let i = 0; i < out.length; i++) out[i] /= n;
  return out;
}
function poolCells(v, cw, ch, bx, by) { // average bx*by blocks of an RGB cell grid
  const w = cw / bx, h = ch / by, out = new Float32Array(w * h * 3);
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) for (let c = 0; c < 3; c++) out[((y / by | 0) * w + (x / bx | 0)) * 3 + c] += v[(y * cw + x) * 3 + c] / (bx * by);
  return out;
}
async function loadFeats() {
  if (FEATS) return FEATS;
  const d = await getJSON(dataUrl('hero_feats.json'));
  FEATS = {};
  for (const [style, [cw, ch]] of Object.entries(d.sizes)) {
    const ids = [], fine = [], coarse = [];
    for (const [id, e] of Object.entries(d.heroes)) {
      if (!e[style] || !S.heroes[id]) continue;
      const v = hexBytes(e[style]);
      ids.push(+id); fine.push(unit(v)); coarse.push(unit(poolCells(v, cw, ch, 4, 3)));
    }
    FEATS[style] = { cw, ch, ids, fine, coarse, aspect: style === 'l' ? 144 / 256 : 272 / 235 };
  }
  return FEATS;
}

function integral(px, W, H) { // summed-area tables for R, G, B
  const II = [0, 1, 2].map(() => new Float64Array((W + 1) * (H + 1)));
  for (let y = 0; y < H; y++) {
    const r = [0, 0, 0];
    for (let x = 0; x < W; x++) {
      const p = (y * W + x) * 4, o = (y + 1) * (W + 1) + x + 1;
      for (let c = 0; c < 3; c++) { r[c] += px[p + c]; II[c][o] = II[c][o - W - 1] + r[c]; }
    }
  }
  return II;
}
function windowFeat(II, W, x, y, w, h, cols, rows) {
  const out = new Float32Array(cols * rows * 3), cw = w / cols, chh = h / rows, s = W + 1;
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const x0 = Math.round(x + i * cw), x1 = Math.max(x0 + 1, Math.round(x + (i + 1) * cw));
    const y0 = Math.round(y + j * chh), y1 = Math.max(y0 + 1, Math.round(y + (j + 1) * chh)), a = (x1 - x0) * (y1 - y0);
    for (let c = 0; c < 3; c++) { const t = II[c]; out[(j * cols + i) * 3 + c] = (t[y1 * s + x1] - t[y0 * s + x1] - t[y1 * s + x0] + t[y0 * s + x0]) / a; }
  }
  return unit(out);
}
function bestMatch(v, set) {
  let best = -1, bi = -1, second = -1;
  for (let k = 0; k < set.length; k++) {
    const t = set[k]; let d = 0;
    for (let i = 0; i < v.length; i++) d += v[i] * t[i];
    if (d > best) { second = best; best = d; bi = k; } else if (d > second) second = d;
  }
  return [bi, best, second];
}
let lastYield = 0;
const tick = async () => { // let the page breathe about every 40 ms, not on every row
  if (performance.now() - lastYield < 40) return;
  await new Promise(r => setTimeout(r, 0));
  lastYield = performance.now();
};
const iou = (a, b) => {
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)), iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return ix * iy / (a.w * a.h + b.w * b.h - ix * iy);
};

// coarse pass over all sizes finds the portrait size, a fine pass at that size finds the heroes
async function detectHeroes(img, progress) {
  const F = await loadFeats();
  const k = Math.min(1, 1400 / Math.max(img.naturalWidth, img.naturalHeight));
  const W = Math.round(img.naturalWidth * k), H = Math.round(img.naturalHeight * k);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d', { willReadFrequently: true }); ctx.drawImage(img, 0, 0, W, H);
  const II = integral(ctx.getImageData(0, 0, W, H).data, W, H);
  const votes = {};
  let steps = 0;
  for (const [style, f] of Object.entries(F)) {
    for (let w = 24; w <= Math.min(320, W * 0.5, H / f.aspect * 0.9); w *= 1.1) {
      const h = w * f.aspect, st = Math.max(2, Math.round(w / 4));
      let good = 0, sum = 0;
      for (let y = 0; y + h <= H; y += st) for (let x = 0; x + w <= W; x += st) {
        const c = windowFeat(II, W, x, y, w, h, f.cw / 4, f.ch / 3);
        if (c.std < 14) continue;
        const [, s] = bestMatch(c, f.coarse);
        if (s > 0.9) { good++; sum += s; }
      }
      votes[`${style}:${w.toFixed(2)}`] = { style, w, score: sum * Math.sqrt(w) }; // bigger windows are rarer, weigh them up
      progress(++steps);
      await tick();
    }
  }
  const top = Object.values(votes).sort((a, b) => b.score - a.score)[0];
  if (!top || !top.score) return { dets: [], W, H, k };
  // refine the size around the coarse winner; fine features only where the coarse ones already look like a hero
  const f = F[top.style];
  let best = { total: -1, dets: [] };
  for (const m of [0.88, 0.92, 0.96, 1, 1.04, 1.08, 1.12]) {
    const w = top.w * m, h = w * f.aspect, st = Math.max(1, Math.round(w / 8)), dets = [];
    for (let y = 0; y + h <= H; y += st) {
      for (let x = 0; x + w <= W; x += st) {
        const c = windowFeat(II, W, x, y, w, h, f.cw / 4, f.ch / 3);
        if (c.std < 14 || bestMatch(c, f.coarse)[1] < 0.7) continue;
        const v = windowFeat(II, W, x, y, w, h, f.cw, f.ch), [bi, s, s2] = bestMatch(v, f.fine);
        if (s > 0.62) dets.push({ x, y, w, h, score: s, margin: s - s2, id: f.ids[bi] });
      }
      await tick();
    }
    dets.sort((a, b) => b.score - a.score);
    let kept = [];
    for (const d of dets) if (kept.every(o => iou(o, d) < 0.25)) kept.push(d);
    // the grid step can sit a few pixels off a portrait: nudge each candidate to its best position and size
    for (const d of kept) {
      for (let pass = 0; pass < 2; pass++) {
        const step = pass ? 1 : Math.max(1, st >> 1);
        for (const [dx, dy, ds] of [[-step, 0, 1], [step, 0, 1], [0, -step, 1], [0, step, 1], [0, 0, 0.97], [0, 0, 1.03]]) {
          const nw = d.w * ds, nh = nw * f.aspect, nx = d.x + dx, ny = d.y + dy;
          if (nx < 0 || ny < 0 || nx + nw > W || ny + nh > H) continue;
          const [bi, s2, s3] = bestMatch(windowFeat(II, W, nx, ny, nw, nh, f.cw, f.ch), f.fine);
          if (s2 > d.score) Object.assign(d, { x: nx, y: ny, w: nw, h: nh, score: s2, margin: s2 - s3, id: f.ids[bi] });
        }
      }
      await tick();
    }
    kept.sort((a, b) => b.score - a.score);
    kept = kept.filter((d, i) => kept.slice(0, i).every(o => iou(o, d) < 0.25));
    const total = kept.filter(d => d.score > 0.8).reduce((t, d) => t + d.score, 0);
    if (total > best.total) best = { total, dets: kept };
    progress(++steps);
  }
  // real portraits score close to the best ones in the same picture: drop weak lonely matches
  const kept = best.dets, n = Math.max(3, kept.length >> 2);
  const ref = kept.slice(0, n).reduce((t, d) => t + d.score, 0) / Math.max(1, Math.min(n, kept.length));
  return { dets: kept.filter(d => d.score >= Math.max(0.74, ref - 0.16)), W, H, k, style: top.style };
}

// rows -> segments split by gaps much wider than the usual spacing -> (grid screenshots only) wrapped rows merged
function groupDetections(dets, style) {
  if (!dets.length) return [];
  const w = dets.reduce((t, d) => t + d.w, 0) / dets.length, h = dets.reduce((t, d) => t + d.h, 0) / dets.length;
  const rows = [];
  for (const d of [...dets].sort((a, b) => a.y - b.y)) {
    const r = rows.find(r => Math.abs(r.y - d.y) < h * 0.5);
    if (r) r.items.push(d); else rows.push({ y: d.y, items: [d] });
  }
  rows.forEach(r => r.items.sort((a, b) => a.x - b.x));
  const gaps = rows.flatMap(r => r.items.slice(1).map((d, i) => d.x - (r.items[i].x + r.items[i].w))).filter(g => g > -w * 0.2).sort((a, b) => a - b);
  const usual = gaps.length ? Math.max(0, gaps[gaps.length >> 2]) : w * 0.1;
  const splitAt = style === 'l' ? Infinity : Math.max(usual * 3, w * 0.45); // a tier list row is always one category
  const segs = [];
  for (const r of rows) {
    let cur = null;
    for (const d of r.items) {
      if (!cur || d.x - cur.x1 > splitAt) segs.push(cur = { x0: d.x, x1: d.x + d.w, y0: r.y, y1: r.y + h, items: [] });
      cur.items.push(d); cur.x1 = d.x + d.w;
    }
  }
  const cats = [];
  for (const sg of segs) {
    // in Dota's own grid a long category wraps onto the next line right below it; tier list rows are separate
    const c = style === 'v' && cats.find(c => sg.y0 - c.y1 >= -h * 0.2 && sg.y0 - c.y1 < h * 0.3 && Math.abs(sg.x0 - c.x0) < w * 0.6);
    if (c) { c.items.push(...sg.items); c.y1 = sg.y1; c.x1 = Math.max(c.x1, sg.x1); } else cats.push({ ...sg, items: [...sg.items] });
  }
  const tiers = style === 'l' && cats.length <= 7 ? 'SABCDEF' : ''; // tier list rows usually go S, A, B…
  return cats.map((c, i) => ({ name: tiers ? tiers[i] : `${L('Категория', 'Category')} ${i + 1}`, heroes: c.items.map(d => d.id), box: [c.x0, c.y0, c.x1, c.y1] }));
}

/* ---------- grid model & Dota config ---------- */

function dotaConfig(name, cats) {
  // fit the picture's layout into Dota's grid (about 1180 wide); categories without a box are stacked
  const boxes = cats.filter(c => c.box);
  const minX = Math.min(...boxes.map(c => c.box[0])), minY = Math.min(...boxes.map(c => c.box[1]));
  const span = Math.max(1, Math.max(...boxes.map(c => c.box[2])) - minX);
  const k = boxes.length ? 1180 / span : 1;
  let y = 0;
  const out = cats.map(c => {
    let cat;
    if (c.box) cat = { x_position: Math.round((c.box[0] - minX) * k), y_position: Math.round((c.box[1] - minY) * k), width: Math.max(120, Math.round((c.box[2] - c.box[0]) * k)), height: Math.max(110, Math.round((c.box[3] - c.box[1]) * k + 30)) };
    else { const rowsNeeded = Math.max(1, Math.ceil(c.heroes.length / 17)); cat = { x_position: 0, y_position: y, width: 1180, height: 40 + rowsNeeded * 80 }; y += cat.height + 10; }
    return { category_name: c.name, ...cat, hero_ids: c.heroes };
  });
  // the category header adds height, so push down anything that would overlap a box above it
  const placed = [];
  for (const c of [...out].sort((a, b) => a.y_position - b.y_position)) {
    for (const p of placed) {
      const sideBySide = c.x_position >= p.x_position + p.width || p.x_position >= c.x_position + c.width;
      if (!sideBySide && c.y_position < p.y_position + p.height + 8) c.y_position = p.y_position + p.height + 8;
    }
    placed.push(c);
  }
  return { config_name: name, categories: out };
}

async function metaGrid(group) {
  const G = await loadGroup(group);
  return [1, 2, 3, 4, 5].map(p => ({
    name: POS_NAMES[p],
    heroes: Object.keys(S.heroes).map(Number).filter(h => G.idx[h] != null && heroPick(G, h) >= 0.01 && posPrior(h)[p - 1] >= 0.18)
      .sort((a, b) => heroWr(G, b) - heroWr(G, a)).slice(0, 16),
  }));
}

/* ---------- view ---------- */

S.grid = S.grid || { name: 'Dota 2 Analyzer', cats: [], image: null, dets: [] };

function renderTools() {
  const G = S.grid, pid = S.playerId || store.get('lastId');
  $('gridEditor').innerHTML = G.cats.length ? `
    <div class="row grid-name"><label class="label" for="gridName">${L('Название сетки', 'Grid name')}</label><input class="field" id="gridName" value="${esc(G.name)}" maxlength="40"></div>
    ${G.cats.map((c, ci) => `<div class="card pad grid-cat" data-ci="${ci}">
      <div class="row"><input class="field cat-name" value="${esc(c.name)}" aria-label="${L('Название категории', 'Category name')}">${ci ? `<button class="btn ghost small cat-merge" type="button" title="${L('Перенести героев в категорию выше', 'Move these heroes into the category above')}">${L('Объединить с предыдущей', 'Merge with previous')}</button>` : ''}<button class="btn ghost small cat-del" type="button">${L('Удалить', 'Delete')}</button></div>
      <div class="grid-heroes">${c.heroes.map((h, hi) => `<span class="hchip grid-hero" data-hi="${hi}" title="${L('Нажми, чтобы заменить', 'Click to replace')}">${heroImg(h) ? `<img src="${heroImg(h)}" alt="">` : ''}${esc(heroName(h))}<button type="button" class="hero-del" aria-label="${L('Убрать', 'Remove')} ${esc(heroName(h))}">×</button></span>`).join('')}
        <input class="field add-hero" list="heroList" placeholder="${L('+ герой', '+ hero')}" aria-label="${L('Добавить героя', 'Add a hero')}"></div>
    </div>`).join('')}
    <div class="row"><button class="btn ghost small" id="catAdd" type="button">${L('+ категория', '+ category')}</button></div>
    <div class="card pad grid-out">
      <div class="row"><button class="btn" id="gridDownload" type="button">${L('Скачать hero_grid_config.json', 'Download hero_grid_config.json')}</button>
        <label class="btn ghost small"><input type="file" id="gridMerge" accept=".json,application/json" hidden>${L('Добавить к моему файлу…', 'Add to my file…')}</label></div>
      <p class="note" id="gridMergeNote">${S.gridBase ? L(`Твой файл загружен: ${S.gridBase.configs.length} сеток, новая добавится к ним.`, `Your file is loaded: ${S.gridBase.configs.length} grids, the new one will be added.`) : L('Без своего файла скачается файл только с этой сеткой.', 'Without your file the download holds only this grid.')}</p>
      <ol class="lesson-tips grid-steps">
        <li>${L('Закрой Dota 2.', 'Close Dota 2.')}</li>
        <li>${L('Положи файл в папку', 'Put the file into')} <code>Steam\\userdata\\${pid || L('&lt;твой Friend ID&gt;', '&lt;your Friend ID&gt;')}\\570\\remote\\cfg\\</code> ${L('с заменой. Старый файл лучше сначала загрузить сюда кнопкой «Добавить к моему файлу», чтобы не потерять свои сетки.', 'replacing the old one. Load the old file here first with "Add to my file" so you keep your grids.')}</li>
        <li>${L('Запусти Dota 2 → Герои → Сетка и выбери сетку', 'Start Dota 2 → Heroes → Grid and pick')} «${esc(G.name)}».</li>
      </ol>
    </div>` : `<div class="empty">${L('Загрузи картинку или собери мета-сетку', 'Upload a picture or build the meta grid')}</div>`;

  const ed = $('gridEditor');
  ed.querySelector('#gridName')?.addEventListener('input', e => { G.name = e.target.value || 'Dota 2 Analyzer'; });
  ed.querySelectorAll('.grid-cat').forEach(box => {
    const c = G.cats[+box.dataset.ci];
    box.querySelector('.cat-name').addEventListener('input', e => { c.name = e.target.value; });
    box.querySelector('.cat-del').addEventListener('click', () => { G.cats.splice(+box.dataset.ci, 1); renderTools(); });
    box.querySelector('.cat-merge')?.addEventListener('click', () => {
      const ci = +box.dataset.ci, prev = G.cats[ci - 1];
      prev.heroes.push(...c.heroes);
      if (prev.box && c.box) prev.box = [Math.min(prev.box[0], c.box[0]), Math.min(prev.box[1], c.box[1]), Math.max(prev.box[2], c.box[2]), Math.max(prev.box[3], c.box[3])];
      G.cats.splice(ci, 1); renderTools();
    });
    box.querySelector('.add-hero').addEventListener('change', e => { const id = heroByName(e.target.value); if (id) { c.heroes.push(id); renderTools(); } });
    box.querySelectorAll('.grid-hero').forEach(chip => {
      const hi = +chip.dataset.hi;
      chip.querySelector('.hero-del').addEventListener('click', e => { e.stopPropagation(); c.heroes.splice(hi, 1); renderTools(); });
      chip.addEventListener('click', () => {
        const inp = Object.assign(document.createElement('input'), { className: 'field swap-hero', placeholder: heroName(c.heroes[hi]) });
        inp.setAttribute('list', 'heroList'); chip.replaceWith(inp); inp.focus();
        inp.addEventListener('change', () => { const id = heroByName(inp.value); if (id) c.heroes[hi] = id; renderTools(); });
        inp.addEventListener('blur', () => setTimeout(renderTools, 150));
      });
    });
  });
  $('catAdd')?.addEventListener('click', () => { G.cats.push({ name: `${L('Категория', 'Category')} ${G.cats.length + 1}`, heroes: [] }); renderTools(); });
  $('gridDownload')?.addEventListener('click', downloadGrid);
  $('gridMerge')?.addEventListener('change', async e => {
    try {
      const base = JSON.parse(await e.target.files[0].text());
      if (!Array.isArray(base.configs)) throw new Error();
      S.gridBase = base; renderTools();
    } catch { $('gridMergeNote').textContent = L('Это не файл сеток Dota (hero_grid_config.json).', 'That is not a Dota grid file (hero_grid_config.json).'); }
  });
  drawDetections();
}

function drawDetections() {
  const G = S.grid, box = $('gridPreview');
  if (!G.image) { box.innerHTML = ''; return; }
  const { W, H, dets } = G;
  box.innerHTML = `<div class="grid-pic"><img src="${G.image}" alt="${L('Загруженная картинка', 'Uploaded picture')}"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${dets.map(d => `<g><rect x="${d.x}" y="${d.y}" width="${d.w}" height="${d.h}" class="${d.margin < 0.04 ? 'unsure' : ''}"/><text x="${d.x + 3}" y="${d.y + d.h - 4}" font-size="${Math.max(9, d.w / 7)}">${esc(heroName(d.id))}</text></g>`).join('')}</svg></div>
    <p class="note">${L(`Найдено героев: ${dets.length}. Пунктиром — где распознавание не уверено, проверь их ниже.`, `Heroes found: ${dets.length}. Dashed boxes are unsure matches, check them below.`)}</p>`;
}

function downloadGrid() {
  const G = S.grid, cfg = dotaConfig(G.name, G.cats.filter(c => c.heroes.length));
  const base = S.gridBase ? { ...S.gridBase, configs: S.gridBase.configs.filter(c => c.config_name !== G.name) } : { version: 3, configs: [] };
  base.configs.push(cfg);
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([JSON.stringify(base, null, 2)], { type: 'application/json' })), download: 'hero_grid_config.json' });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

async function readPicture(file) {
  if (!file || !file.type.startsWith('image/')) return;
  const url = URL.createObjectURL(file), img = new Image();
  img.src = url;
  await img.decode();
  $('gridStatus').textContent = L('Ищу героев…', 'Looking for heroes…');
  $('gridDrop').classList.add('busy');
  try {
    const r = await detectHeroes(img, n => { $('gridStatus').textContent = `${L('Ищу героев…', 'Looking for heroes…')} ${n}`; });
    Object.assign(S.grid, { image: url, dets: r.dets, W: r.W, H: r.H, cats: groupDetections(r.dets, r.style) });
    $('gridStatus').textContent = r.dets.length ? '' : L('Героев не нашёл. Нужна картинка с портретами героев: тир-лист или скриншот сетки.', 'No heroes found. Use a picture with hero portraits: a tier list or a grid screenshot.');
  } catch (e) {
    $('gridStatus').textContent = L('Не получилось разобрать картинку: ', 'Couldn\'t read the picture: ') + e.message;
  } finally { $('gridDrop').classList.remove('busy'); }
  renderTools();
}

function wireTools() {
  const drop = $('gridDrop');
  $('gridFile').addEventListener('change', e => readPicture(e.target.files[0]));
  ['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => readPicture(e.dataTransfer.files[0]));
  document.addEventListener('paste', e => { if ($('viewTools').hidden) return; const f = [...e.clipboardData.files].find(f => f.type.startsWith('image/')); if (f) readPicture(f); });
  $('metaGridBtn').addEventListener('click', async () => {
    const g = +$('metaGridGroup').value;
    Object.assign(S.grid, { name: `Meta ${GROUPS[g].split('–')[0]}`, cats: await metaGrid(g), image: null, dets: [] });
    renderTools();
    $('gridEditor').scrollIntoView({ behavior: motionOn() ? 'smooth' : 'auto', block: 'start' });
  });
  $('emptyGridBtn').addEventListener('click', () => { Object.assign(S.grid, { cats: [{ name: `${L('Категория', 'Category')} 1`, heroes: [] }], image: null, dets: [] }); renderTools(); });
  $('metaGridGroup').innerHTML = Object.entries(GROUPS).map(([g, n]) => `<option value="${g}" ${+g === 4 ? 'selected' : ''}>${n}</option>`).join('');
}
wireTools();
