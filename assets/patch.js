'use strict';
/* ---------- patch tab (temporary, for a fresh patch): creators' takes on the new meta, each with a collapsible "why",
   and every hero and item change from Valve's notes. Data: data/patch.json from scripts/build_pages.py. Shares globals with app.js. ---------- */

async function renderPatch() {
  const box = $('patchBox');
  if (S.patch === undefined) S.patch = await getJSON(dataUrl('patch.json')).catch(() => null);
  const d = S.patch, lang = EN ? 'en' : 'ru';
  if (!d) { box.innerHTML = `<div class="empty">${L('Не удалось загрузить изменения патча', 'Couldn\'t load the patch changes')}</div>`; return; }
  await Promise.resolve(S.items || loadItems().catch(() => {}));
  const G = await loadGroup(S.metaGroup || store.get('metaGroup') || 3).catch(() => null);
  const pm = d.meta;
  const lines = arr => arr.map(x => `<li>${x.split('\n').map(esc).join('<br>')}</li>`).join('');
  const stat = h => G && G.idx[h] != null ? `<span class="note">${L('винрейт', 'win rate')} ${(heroWr(G, h) * 100).toFixed(1)}% · ${L('пик', 'pick')} ${(heroPick(G, h) * 100).toFixed(1)}%</span>` : '';
  const cite = ids => ids.map(i => pm.sources[i]).map(s => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.channel)}</a>`).join(', ');
  const why = x => `<details class="why"><summary>${L('Почему', 'Why')}</summary><ul class="facts">${x[lang].map(r => `<li>${esc(r)}</li>`).join('')}</ul><p class="note">${L('Источник', 'Source')}: ${cite(x.src)}</p></details>`;
  const heroCard = x => `<div class="card pad voice"><div class="voice-head"><img class="hero-img" src="${heroImg(x.id)}" alt="" loading="lazy"><div><b>${esc(heroName(x.id))}</b> <span class="chip ${x.tag === 'up' ? 'pos' : 'neg'}">${POS_NAMES[x.pos]}</span><br>${stat(x.id)}</div></div>${why(x)}</div>`;
  const itemCard = x => `<div class="card pad voice"><div class="voice-head">${itemIcon(x.key)}<b>${esc(itemName(x.key))}</b></div>${why(x)}</div>`;
  const label = k => ({ talents: L('Таланты', 'Talents'), general: L('Общее', 'General'), info: L('Общее', 'General') })[k] || k;

  const voices = pm ? `
  <section class="section"><h2 class="section-title">${L(`Новая мета ${pm.patch}: что говорят авторы`, `The new ${pm.patch} meta: what creators say`)}</h2>
    ${pm.general ? `<div class="card pad"><ul class="facts">${pm.general[lang].map(r => `<li>${esc(r)}</li>`).join('')}</ul></div>` : ''}
    <h3 class="label">${L('Сильные сейчас', 'Strong right now')}</h3><div class="voice-grid">${pm.heroes.filter(x => x.tag === 'up' && S.heroes[x.id]).map(heroCard).join('')}</div>
    <h3 class="label">${L('Ослабли', 'Got weaker')}</h3><div class="voice-grid">${pm.heroes.filter(x => x.tag === 'down' && S.heroes[x.id]).map(heroCard).join('')}</div>
    ${pm.items?.length ? `<h3 class="label">${L('Предметы', 'Items')}</h3><div class="voice-grid">${pm.items.map(itemCard).join('')}</div>` : ''}
    <p class="note">${L('По видео на YouTube', 'From YouTube videos')}: ${cite(pm.sources.map((_, i) => i))}. ${L('Это первые дни патча — мнения могут меняться, винрейт рядом с героем — по нашим данным пабов.', 'These are the first days of the patch: opinions change; the win rate next to each hero is from our pub data.')}</p>
  </section>` : '';

  const heroes = Object.keys(d.heroes).map(Number).filter(h => S.heroes[h]).sort((a, b) => heroName(a).localeCompare(heroName(b)));
  const heroRows = heroes.map(h => `<details class="patch-row" data-name="${esc(heroName(h).toLowerCase())}"><summary><img class="mini-hero" src="${heroIconUrl(h)}" alt="">${esc(heroName(h))}</summary>${d.heroes[h].map(([k, v]) => `<h4>${esc(label(k))}</h4><ul class="facts">${lines(v)}</ul>`).join('')}</details>`).join('');
  const itemRows = Object.entries(d.items).map(([k, v]) => `<details class="patch-row" data-name="${esc(itemName(k).toLowerCase())}"><summary>${itemIcon(k)}${esc(itemName(k))}</summary><ul class="facts">${lines(v)}</ul></details>`).join('');
  const date = d.date ? L(`вышел ${d.date.slice(8, 10)}.${d.date.slice(5, 7)}.${d.date.slice(0, 4)}`, `released ${d.date}`) : '';

  box.innerHTML = `
  <section class="section"><h1 class="section-title">${L(`Патч ${d.patch}`, `Patch ${d.patch}`)}</h1>
    <p class="note">${date} · ${L('Временная вкладка на первые недели патча.', 'A temporary tab for the first weeks of the patch.')} <a href="${EN ? 'en/' : ''}patch/">${L('Отдельная страница патча', 'Patch page')}</a></p>
    ${d.summary ? `<div class="card pad"><h2 class="label">${L('Главное в патче', 'Key changes')}</h2><ul class="facts">${d.summary[lang].map(r => `<li>${esc(r)}</li>`).join('')}</ul></div>` : ''}
  </section>
  ${voices}
  <section class="section"><h2 class="section-title">${L('Изменения героев и предметов', 'Hero and item changes')}</h2>
    <input type="search" id="patchSearch" class="field" placeholder="${L('Найти героя или предмет', 'Find a hero or item')}" aria-label="${L('Поиск по изменениям', 'Search the changes')}">
    <h3 class="label">${L('Герои', 'Heroes')} <span class="dim">${heroes.length}</span></h3><div class="card pad patch-rows">${heroRows}</div>
    <h3 class="label">${L('Предметы', 'Items')} <span class="dim">${Object.keys(d.items).length}</span></h3><div class="card pad patch-rows">${itemRows}</div>
    <p class="note">${L('Формулировка Valve, через OpenDota.', 'Worded by Valve, via OpenDota.')}</p>
  </section>`;
  $('patchSearch').addEventListener('input', e => {
    const q = e.target.value.trim().toLowerCase();
    box.querySelectorAll('.patch-row').forEach(r => { r.hidden = !!q && !r.dataset.name.includes(q); r.open = !!q && !r.hidden && q.length > 2; });
  });
}
