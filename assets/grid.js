'use strict';
/* ---------- hero grid tool: meta grid by position or your own categories -> Dota 2 hero_grid_config.json ----------
   Shares globals with app.js (S, L, $, esc, heroImg, heroName, heroByName, loadGroup, heroWr, heroPick, posPrior). */

/* ---------- grid model & Dota config ---------- */

function dotaConfig(name, cats) {
  // categories are stacked down Dota's grid (about 1180 wide); merged categories may carry a box
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

S.grid = S.grid || { name: 'Dota 2 Analyzer', cats: [] };

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
    </div>` : `<div class="empty">${L('Собери мета-сетку или начни пустую', 'Build the meta grid or start an empty one')}</div>`;

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
}

function downloadGrid() {
  const G = S.grid, cfg = dotaConfig(G.name, G.cats.filter(c => c.heroes.length));
  const base = S.gridBase ? { ...S.gridBase, configs: S.gridBase.configs.filter(c => c.config_name !== G.name) } : { version: 3, configs: [] };
  base.configs.push(cfg);
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([JSON.stringify(base, null, 2)], { type: 'application/json' })), download: 'hero_grid_config.json' });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function wireTools() {
  $('metaGridBtn').addEventListener('click', async () => {
    const g = +$('metaGridGroup').value;
    Object.assign(S.grid, { name: `Meta ${GROUPS[g].split('–')[0]}`, cats: await metaGrid(g) });
    renderTools();
    $('gridEditor').scrollIntoView({ behavior: motionOn() ? 'smooth' : 'auto', block: 'start' });
  });
  $('emptyGridBtn').addEventListener('click', () => { S.grid.cats = [{ name: `${L('Категория', 'Category')} 1`, heroes: [] }]; renderTools(); });
  $('metaGridGroup').innerHTML = Object.entries(GROUPS).map(([g, n]) => `<option value="${g}" ${+g === 4 ? 'selected' : ''}>${n}</option>`).join('');
}
wireTools();
