/* ---------- arsenal: cosmetic item picker for D2A Mods ----------
   Loaded on demand from app.js; uses its globals ($, L, EN, esc, heroImg, heroName, getJSON, dataUrl, store, S, CDN). */

const RARITY_ORDER = { arcana: 6, ancient: 5, immortal: 5, legendary: 4, mythical: 3, rare: 2 };
const RARITY_COLOR = { arcana: '#ade55c', ancient: '#eb4b4b', immortal: '#e4ae39', legendary: '#d32ce6', mythical: '#8847ff', rare: '#4b69ff' };
const RARITY_LABEL = {
  arcana: L('Аркана', 'Arcana'), ancient: L('Древний', 'Ancient'), immortal: L('Бессмертный', 'Immortal'),
  legendary: L('Легендарный', 'Legendary'), mythical: L('Мифический', 'Mythical'), rare: L('Редкий', 'Rare'),
};
const SLOT_NAMES = {
  head: L('Голова', 'Head'), weapon: L('Оружие', 'Weapon'), arms: L('Руки', 'Arms'),
  legs: L('Ноги', 'Legs'), back: L('Спина', 'Back'), shoulder: L('Плечо', 'Shoulder'),
  neck: L('Шея', 'Neck'), misc: L('Прочее', 'Misc'), armor: L('Броня', 'Armor'),
  body_head: L('Голова', 'Head'), tail: L('Хвост', 'Tail'), belt: L('Пояс', 'Belt'),
  mount: L('Маунт', 'Mount'), offhand_weapon: L('Левая рука', 'Offhand'),
  offhand_weapon2: L('Левая рука 2', 'Offhand 2'),
};
const slotLabel = s => SLOT_NAMES[s] || s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
const CHECK_SVG = '<svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg>';
const MODEL_SVG = '<svg viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>';
const FX_SVG = '<svg viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v8l4-2"/><circle cx="12" cy="14" r="8"/></svg>';

const A = { catalog: null, hero: null };
const saved = store.get('arsenal') || {};
const persist = () => store.set('arsenal', saved);

function heroSlugFromId(id) {
  const h = S.heroes[id];
  return h ? (h.name || '').replace('npc_dota_hero_', '') : null;
}

async function loadCatalog() {
  if (A.catalog) return A.catalog;
  A.catalog = await getJSON(dataUrl('arsenal_catalog.json'));
  return A.catalog;
}

function heroHasItems(slug) {
  return !!(saved[slug] && Object.keys(saved[slug]).length);
}

function renderHeroList() {
  const box = $('arsenalHeroes');
  const heroIds = Object.keys(S.heroes).map(Number).sort((a, b) => heroName(a).localeCompare(heroName(b)));
  box.innerHTML = heroIds.map(id => {
    const slug = heroSlugFromId(id);
    const has = slug && A.catalog && A.catalog[slug];
    const equipped = heroHasItems(slug);
    return `<button class="ah${A.hero === slug ? ' active' : ''}${has ? '' : ' dim'}" data-slug="${slug}" data-id="${id}" role="option" ${!has ? 'disabled' : ''}>
      <img src="${heroImg(id)}" alt="${esc(heroName(id))}" loading="lazy">
      <span>${esc(heroName(id))}</span>${equipped ? '<span class="ah-dot"></span>' : ''}</button>`;
  }).join('');
  box.querySelectorAll('.ah:not([disabled])').forEach(b => b.addEventListener('click', () => selectHero(b.dataset.slug)));

  const search = $('arsenalSearch');
  search.oninput = () => {
    const q = search.value.toLowerCase();
    box.querySelectorAll('.ah').forEach(b => {
      b.hidden = q && !heroName(Number(b.dataset.id)).toLowerCase().includes(q) && !b.dataset.slug.includes(q);
    });
  };
}

function heroFullImg(slug) {
  const id = Object.keys(S.heroes).find(k => (S.heroes[k].name || '').replace('npc_dota_hero_', '') === slug);
  return id ? heroImg(Number(id)) : '';
}

function selectHero(slug) {
  A.hero = slug;
  $('arsenalHeroes').querySelectorAll('.ah').forEach(b => b.classList.toggle('active', b.dataset.slug === slug));
  renderPreview();
  renderSlots();
}

function renderPreview() {
  const panel = $('arsenalPreview');
  if (!A.hero || !A.catalog || !A.catalog[A.hero]) { panel.hidden = true; return; }
  panel.hidden = false;
  const hdata = A.catalog[A.hero];
  const id = Object.keys(S.heroes).find(k => (S.heroes[k].name || '').replace('npc_dota_hero_', '') === A.hero);
  $('arsenalPreviewImg').src = id ? heroImg(Number(id)) : '';
  $('arsenalPreviewName').textContent = id ? heroName(Number(id)) : A.hero;
  renderLoadout();
}

function renderLoadout() {
  const box = $('arsenalLoadout');
  const heroSel = saved[A.hero] || {};
  const hdata = A.catalog[A.hero];
  const items = hdata?.items || [];
  const entries = Object.entries(heroSel);
  if (!entries.length) {
    box.innerHTML = `<div class="arsenal-loadout-empty">${L('Выбери предметы ниже', 'Pick items below')}</div>`;
    return;
  }
  box.innerHTML = entries.map(([slot, id]) => {
    const it = items.find(i => i.id === id);
    if (!it) return '';
    const col = RARITY_COLOR[it.rarity] || 'var(--fg-dim)';
    const imgSrc = it.img || '';
    return `<div class="arsenal-loadout-row">
      ${imgSrc ? `<img src="${imgSrc}" alt="">` : ''}
      <div class="loadout-info">
        <span class="loadout-slot">${slotLabel(slot)}</span>
        <span class="loadout-name">${esc(it.name)}</span>
        <span class="loadout-rarity" style="color:${col}">${RARITY_LABEL[it.rarity] || it.rarity}</span>
      </div>
      <button class="loadout-remove" data-slot="${slot}" title="${L('Убрать', 'Remove')}">&times;</button>
    </div>`;
  }).join('');
  box.querySelectorAll('.loadout-remove').forEach(b => b.addEventListener('click', e => {
    e.stopPropagation();
    const slot = b.dataset.slot;
    if (saved[A.hero]) {
      delete saved[A.hero][slot];
      if (!Object.keys(saved[A.hero]).length) delete saved[A.hero];
    }
    persist();
    renderSlots();
    renderLoadout();
    updateHeroDot();
    updateSummary();
  }));
}

function renderSlots() {
  const box = $('arsenalSlots');
  if (!A.hero || !A.catalog || !A.catalog[A.hero]) {
    box.innerHTML = `<div class="arsenal-empty">
      ${MODEL_SVG}
      <p>${L('Выбери героя слева', 'Pick a hero on the left')}</p>
    </div>`;
    return;
  }
  const hdata = A.catalog[A.hero];
  const items = hdata.items || [];
  const slots = {};
  items.forEach(it => (slots[it.slot] ||= []).push(it));

  const heroSel = saved[A.hero] || {};

  box.innerHTML = Object.entries(slots).map(([slot, sitems]) => {
    const active = heroSel[slot];
    return `<div class="arsenal-slot">
      <h3 class="label">${slotLabel(slot)} <span class="dim">${sitems.length}</span></h3>
      <div class="arsenal-items">${sitems.map(it => {
        const sel = active === it.id;
        const col = RARITY_COLOR[it.rarity] || 'var(--border)';
        const rarityLabel = RARITY_LABEL[it.rarity] || it.rarity;
        const imgSrc = it.img ? it.img : null;
        return `<button class="arsenal-item${sel ? ' active' : ''}" style="--item-color:${col}" data-slot="${slot}" data-id="${it.id}">
          <span class="arsenal-item-check">${CHECK_SVG}</span>
          ${imgSrc ? `<div class="arsenal-item-img"><img src="${imgSrc}" alt="" loading="lazy"></div>` : ''}
          <div class="arsenal-item-body">
            <span class="arsenal-item-rarity">${rarityLabel}</span>
            <span class="arsenal-item-name">${esc(it.name)}</span>
            ${it.set ? `<span class="arsenal-item-set">${esc(it.set)}</span>` : ''}
          </div>
        </button>`;
      }).join('')}</div>
    </div>`;
  }).join('');

  box.querySelectorAll('.arsenal-item').forEach(b => b.addEventListener('click', () => {
    const slot = b.dataset.slot, id = Number(b.dataset.id);
    if (!saved[A.hero]) saved[A.hero] = {};
    if (saved[A.hero][slot] === id) {
      delete saved[A.hero][slot];
      if (!Object.keys(saved[A.hero]).length) delete saved[A.hero];
    } else {
      saved[A.hero][slot] = id;
    }
    persist();
    renderSlots();
    renderLoadout();
    updateHeroDot();
    updateSummary();
  }));

  updateSummary();
}

function updateHeroDot() {
  $('arsenalHeroes').querySelectorAll('.ah').forEach(b => {
    const dot = b.querySelector('.ah-dot');
    const has = heroHasItems(b.dataset.slug);
    if (has && !dot) {
      b.insertAdjacentHTML('beforeend', '<span class="ah-dot"></span>');
    } else if (!has && dot) {
      dot.remove();
    }
  });
}

function updateSummary() {
  let totalItems = 0, totalHeroes = 0;
  for (const h of Object.keys(saved)) {
    const slots = saved[h];
    if (slots && typeof slots === 'object') {
      const n = Object.keys(slots).length;
      if (n) { totalItems += n; totalHeroes++; }
    }
  }
  $('arsenalSummary').textContent = totalItems
    ? L(`Выбрано ${totalItems} предметов для ${totalHeroes} героев`, `Selected ${totalItems} items for ${totalHeroes} heroes`)
    : L('Ничего не выбрано', 'Nothing selected');
}

function generateCode() {
  const data = {};
  for (const [hero, slots] of Object.entries(saved)) {
    if (slots && typeof slots === 'object' && Object.keys(slots).length) {
      data[hero] = Object.values(slots);
    }
  }
  if (!Object.keys(data).length) return '';
  return 'D2AA1:' + btoa(JSON.stringify({ v: 1, items: data }));
}

export function renderArsenal() {
  loadCatalog().then(() => {
    renderHeroList();
    if (A.hero) { renderPreview(); renderSlots(); }
    else {
      $('arsenalPreview').hidden = true;
      $('arsenalSlots').innerHTML = `<div class="arsenal-empty">
        ${MODEL_SVG}
        <p>${L('Выбери героя слева', 'Pick a hero on the left')}</p>
      </div>`;
    }
    updateSummary();
  }).catch(() => {
    $('arsenalSlots').innerHTML = `<div class="arsenal-empty">
      <p>${L('Не удалось загрузить каталог предметов', 'Could not load the item catalog')}</p>
    </div>`;
  });

  $('arsenalCopy').onclick = () => {
    const code = generateCode();
    if (!code) { $('arsenalOutNote').textContent = L('Ничего не выбрано', 'Nothing selected'); return; }
    navigator.clipboard.writeText(code).then(() => {
      $('arsenalOutNote').textContent = L('Скопировано!', 'Copied!');
      setTimeout(() => { $('arsenalOutNote').textContent = ''; }, 2000);
    });
  };

  $('arsenalReset').onclick = () => {
    for (const k of Object.keys(saved)) delete saved[k];
    persist();
    renderSlots();
    updateHeroDot();
    updateSummary();
  };
}
