'use strict';

const LANG = (() => {
  try { const s = localStorage.getItem('lang'); if (s) return JSON.parse(s); } catch { /* storage unavailable */ }
  return (navigator.language || '').toLowerCase().startsWith('ru') ? 'ru' : 'en';
})();
const EN = LANG === 'en';
const L = (ru, en) => EN ? en : ru;
const LOC = EN ? 'en' : 'ru';

const API = 'https://api.opendota.com/api';
const CDN = 'https://cdn.cloudflare.steamstatic.com';
const RANKS = ['', 'Herald', 'Guardian', 'Crusader', 'Archon', 'Legend', 'Ancient', 'Divine', 'Immortal'];
const GROUPS = { 1: 'Herald–Guardian', 2: 'Crusader–Archon', 3: 'Legend–Ancient', 4: 'Divine–Immortal' };
const POS_NAMES = EN ? ['', 'Carry', 'Mid', 'Offlane', 'Soft support', 'Hard support'] : ['', 'Керри', 'Мид', 'Оффлейн', 'Четвёрка', 'Пятёрка'];
const DUR_LABELS = [L('до 20', '<20'), '20–25', '25–30', '30–35', '35–40', '40–45', '45–50', '50+'];
const UNIVERSAL_ITEMS = new Set(['black_king_bar', 'gem', 'dust', 'ward_sentry', 'lotus_orb', 'sphere', 'force_staff', 'glimmer_cape', 'ghost', 'aeon_disk', 'spirit_vessel', 'blade_mail', 'pipe', 'crimson_guard', 'heavens_halberd', 'nullifier', 'monkey_king_bar', 'silver_edge', 'sheepstick', 'orchid', 'bloodthorn', 'cyclone', 'wind_waker', 'solar_crest', 'manta', 'mage_slayer']);
const ITEM_WHY = {
  black_king_bar: L('Иммунитет к магии и большей части контроля', 'Magic and most disable immunity'),
  spirit_vessel: L('Режет лечение и регенерацию цели', 'Cuts the target\'s healing and regen'),
  silver_edge: L('Break: отключает пассивные способности', 'Break: disables passive abilities'),
  nullifier: L('Снимает защитные эффекты вроде Ghost, Eul, Glimmer, Aeon Disk', 'Removes saves like Ghost, Eul, Glimmer, Aeon Disk'),
  monkey_king_bar: L('Пробивает уклонение', 'Pierces evasion'),
  lotus_orb: L('Отражает направленные заклинания, снимает дебаффы', 'Reflects targeted spells, dispels'),
  sphere: L('Блокирует одно направленное заклинание', 'Blocks one targeted spell'),
  gem: L('Видит невидимых героев и варды', 'Reveals invisible heroes and wards'),
  dust: L('Раскрывает невидимых рядом', 'Reveals nearby invisible units'),
  ward_sentry: L('Видит невидимых и варды в радиусе', 'True sight on invisible units and wards'),
  heavens_halberd: L('Обезоруживает: керри не может бить', 'Disarm: the carry can\'t attack'),
  blade_mail: L('Возвращает урон атакующим', 'Returns damage to attackers'),
  pipe: L('Барьер от магического урона для команды', 'Team magic damage barrier'),
  crimson_guard: L('Блок физического урона для команды', 'Team physical damage block'),
  abyssal_blade: L('Оглушение сквозь BKB', 'Stun through BKB'),
  sheepstick: L('Хекс: цель без способностей и атак', 'Hex: no spells, no attacks'),
  orchid: L('Немота: цель не может кастовать', 'Silence: the target can\'t cast'),
  bloodthorn: L('Немота и критические удары по цели', 'Silence and crits on the target'),
  diffusal_blade: L('Сжигает ману и замедляет', 'Burns mana and slows'),
  force_staff: L('Отталкивание: выход из ловушек и погонь', 'Push: escape traps and chases'),
  glimmer_cape: L('Невидимость и защита от магии союзнику', 'Invisibility and magic resist for an ally'),
  ghost: L('Эфирная форма: защита от физических атак', 'Ethereal: immune to physical attacks'),
  aeon_disk: L('Спасает от мгновенного бурста', 'Saves you from instant burst'),
  manta: L('Снимает многие дебаффы', 'Dispels many debuffs'),
  mjollnir: L('Цепные молнии по иллюзиям и призывам', 'Chain lightning vs illusions and summons'),
  maelstrom: L('Цепные молнии по иллюзиям и призывам', 'Chain lightning vs illusions and summons'),
  bfury: L('Сплэш: чистит иллюзии и призывов', 'Cleave: clears illusions and summons'),
  radiance: L('Аура урона против иллюзий и призывов', 'Burn aura vs illusions and summons'),
  cyclone: L('Развеивает с себя, подбрасывает цель', 'Self-dispel, lifts the target'),
  wind_waker: L('Спасает себя или союзника', 'Saves you or an ally'),
  solar_crest: L('Броня союзнику, минус броня врагу', 'Armor for an ally, armor loss for an enemy'),
  mage_slayer: L('Снижает урон заклинаний атакованной цели', 'Lowers the attacked target\'s spell damage'),
  satanic: L('Сильный вампиризм и развеивание с себя', 'Big lifesteal and self-dispel'),
};

const S = {
  heroes: {}, meta: null, groups: {}, items: null, itemIds: null,
  playerId: null, profile: null, group: 3, playerHeroes: [], recent: [], matches: {},
  metaTab: 'mine', posFilter: 0, metaGroup: null, metaPos: 0, enemies: [], allies: [], itemHero: null,
};

const $ = id => document.getElementById(id);
const esc = s => { const d = document.createElement('div'); d.textContent = s ?? ''; return d.innerHTML; };
const fmt = n => Math.abs(n) >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(Math.round(n));
const mmss = s => `${s < 0 ? '-' : ''}${Math.floor(Math.abs(s) / 60)}:${String(Math.abs(s) % 60).padStart(2, '0')}`;
const pct = (v, d = 1) => `${v >= 0 ? '+' : ''}${v.toFixed(d)}%`;
const signCls = v => v >= 0 ? 'pos' : 'neg';
const heroName = id => S.heroes[id]?.localized_name || `Hero ${id}`;
const heroImg = id => S.heroes[id] ? CDN + S.heroes[id].img : '';
const heroIcon = id => heroImg(id) ? `<img class="hero-icon" src="${heroImg(id)}" alt="${esc(heroName(id))}" title="${esc(heroName(id))}">` : '';
const heroCell = id => `<div class="hero-cell">${heroImg(id) ? `<img src="${heroImg(id)}" alt="">` : ''}<span>${esc(heroName(id))}</span></div>`;
const groupOfTier = t => t ? Math.min(4, Math.max(1, Math.floor((Math.floor(t / 10) + 1) / 2))) : 3;
const rankName = t => !t ? L('Без ранга', 'Unranked') : (RANKS[Math.floor(t / 10)] || 'Rank') + (Math.floor(t / 10) < 8 && t % 10 ? ' ' + (t % 10) : '');
const isWin = p => (p.player_slot < 128) === p.radiant_win;

const ICONS = {
  shield: '<path d="M12 2.5 20 6v6c0 4.6-3.3 8.4-8 9.5-4.7-1.1-8-4.9-8-9.5V6l8-3.5Z"/>',
  swords: '<path d="M14.5 17.5 3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2M9.5 6.5 13 3h3v3l-3.5 3.5M5 14l4 4M7 17l-3 3M3 19l2 2"/>',
  coins: '<circle cx="8" cy="8" r="6"/><path d="M18.1 10.4A6 6 0 1 1 10.3 18M7 6h1v4M16.7 13.9l.7.7-2.8 2.8"/>',
  trending: '<path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>',
  target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
  castle: '<path d="M22 20v-9H2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2ZM18 11V4H6v7M15 22v-4a3 3 0 0 0-6 0v4M22 11V9M2 11V9M6 4V2M18 4V2M10 4V2M14 4V2"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  crown: '<path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7zM5 20h14"/>',
  alert: '<path d="m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3Z"/><path d="M12 9v4M12 17h.01"/>',
  down: '<path d="m22 17-8.5-8.5-5 5L2 7"/><path d="M16 17h6v-6"/>',
  check: '<path d="M22 11.1V12a10 10 0 1 1-5.9-9.1"/><path d="m9 11 3 3L22 4"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  play: '<path d="M6 4l14 8-14 8z" fill="currentColor"/>',
  pause: '<path d="M7 4h3v16H7zM14 4h3v16h-3z" fill="currentColor"/>',
};
const icon = (name, cls = '') => `<svg class="i ${cls}" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;
const RANK_IMG = 'https://www.opendota.com/assets/images/dota2/rank_icons/';
function rankEmblem(tier, size) {
  if (!tier) return '';
  const medal = Math.floor(tier / 10), stars = tier % 10;
  return `<span class="emblem" style="--s:${size}px" title="${rankName(tier)}"><img src="${RANK_IMG}rank_icon_${medal}.png" alt="${rankName(tier)}" width="${size}" height="${size}">${stars && medal < 8 ? `<img src="${RANK_IMG}rank_star_${stars}.png" alt="" width="${size}" height="${size}">` : ''}</span>`;
}
const SEV_ICON = { bad: 'alert', warn: 'down', good: 'check', info: 'info' };
const sevIcon = sev => `<span class="sev">${icon(SEV_ICON[sev] || 'info')}</span>`;
function ago(ts) {
  const m = Math.max(0, Math.round((Date.now() / 1000 - ts) / 60));
  if (m < 60) return L(`${m} мин назад`, `${m} min ago`);
  const h = Math.round(m / 60);
  if (h < 24) return L(`${h} ч назад`, `${h} h ago`);
  const d = Math.round(h / 24);
  return d === 1 ? L('вчера', 'yesterday') : L(`${d} дн назад`, `${d} days ago`);
}

const M = window.Motion;
const motionOn = () => !!M && !matchMedia('(prefers-reduced-motion: reduce)').matches;
function revealList(els, step = 0.04) {
  if (!motionOn() || !els.length) return;
  M.animate([...els], { opacity: [0, 1], y: [10, 0] }, { duration: 0.35, ease: 'easeOut', delay: M.stagger(step) });
}
function countUp(root) {
  if (!motionOn()) return;
  root.querySelectorAll('[data-count]').forEach(el => {
    const m = el.textContent.trim().match(/^(-?\d+(?:\.\d+)?)(.*)$/);
    if (!m) return;
    const target = parseFloat(m[1]), dec = (m[1].split('.')[1] || '').length, suffix = m[2];
    M.animate(0, target, { duration: 0.7, ease: 'easeOut', onUpdate: v => { el.textContent = v.toFixed(dec) + suffix; } });
  });
}
function fillIn(root) {
  if (!motionOn()) return;
  root.querySelectorAll('.ring').forEach(r => M.animate(r, { '--p': [0, parseFloat(r.style.getPropertyValue('--p')) || 0] }, { duration: 0.8, ease: 'easeOut' }));
  root.querySelectorAll('.fill').forEach(f => M.animate(f, { scaleX: [0, 1] }, { duration: 0.5, ease: 'easeOut' }));
}

const store = {
  get(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } },
  set(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch {
      try { Object.keys(localStorage).filter(x => x.startsWith('m:')).slice(0, 30).forEach(x => localStorage.removeItem(x)); localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ }
    }
  },
};

async function getJSON(url, opts) {
  const r = await fetch(url, opts);
  if (r.status === 429) throw new Error(L('OpenDota пускает не больше 60 запросов в минуту с одного устройства. Подожди минуту и попробуй снова.', 'OpenDota allows 60 requests per minute per device. Wait a minute and try again.'));
  if (!r.ok) throw new Error(L(`Сервер ответил ошибкой ${r.status}`, `Server error ${r.status}`));
  return r.json();
}

async function getJSONCached(url, minutes) {
  const k = 'c:' + url, c = store.get(k);
  if (c && Date.now() - c.t < minutes * 60000) return c.d;
  const d = await getJSON(url);
  store.set(k, { t: Date.now(), d });
  return d;
}

/* Stratz: optional second source. The token lives only in this browser's storage. */
const stratzToken = () => store.get('stratz') || '';
async function stratzQ(query) {
  const r = await fetch('https://api.stratz.com/graphql', { method: 'POST', headers: { Authorization: `Bearer ${stratzToken()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) });
  if (!r.ok) throw new Error(`Stratz ${r.status}`);
  const d = await r.json();
  if (d.errors?.length && !d.data) throw new Error(d.errors[0].message);
  return d.data;
}
const SZ_P = 'steamAccountId steamAccount { name seasonRank } isRadiant playerSlot heroId position imp kills deaths assists numLastHits numDenies goldPerMinute experiencePerMinute networth heroDamage towerDamage heroHealing item0Id item1Id item2Id item3Id item4Id item5Id neutral0Id';
async function stratzRecent(id, take = 20) {
  const d = await stratzQ(`{ player(steamAccountId: ${+id}) { matches(request: { take: ${take} }) { id didRadiantWin durationSeconds startDateTime radiantNetworthLeads players { ${SZ_P} } } } }`);
  return Object.fromEntries((d.player?.matches || []).map(m => [m.id, m]));
}
const szPos = p => +(p.position || '').replace('POSITION_', '') || undefined;
const sum = a => (a || []).reduce((s, x) => s + x, 0);
function fromStratz(x) {
  return {
    _src: 'stratz', match_id: x.id, radiant_win: x.didRadiantWin, duration: x.durationSeconds, start_time: x.startDateTime,
    radiant_score: sum(x.players.filter(p => p.isRadiant).map(p => p.kills)), dire_score: sum(x.players.filter(p => !p.isRadiant).map(p => p.kills)), version: null, radiant_gold_adv: x.radiantNetworthLeads || null,
    teamfights: [], objectives: [], buildings: [],
    players: x.players.map(p => ({
      account_id: p.steamAccountId, player_slot: p.playerSlot, hero_id: p.heroId, kills: p.kills, deaths: p.deaths, assists: p.assists,
      last_hits: p.numLastHits, denies: p.numDenies, gold_per_min: p.goldPerMinute, xp_per_min: p.experiencePerMinute, net_worth: p.networth,
      hero_damage: p.heroDamage, tower_damage: p.towerDamage, hero_healing: p.heroHealing,
      item_0: p.item0Id, item_1: p.item1Id, item_2: p.item2Id, item_3: p.item3Id, item_4: p.item4Id, item_5: p.item5Id, item_neutral: p.neutral0Id,
      personaname: p.steamAccount?.name, rank_tier: p.steamAccount?.seasonRank, position_est: szPos(p), imp: p.imp,
      purchase_log: [], obs: [], sen: [], obs_left: [], sen_left: [], deaths_t: [], gold_t: null, buyback_t: [],
    })),
  };
}

async function pool(tasks, n, onDone) {
  const out = new Array(tasks.length); let i = 0, done = 0;
  async function worker() {
    while (i < tasks.length) {
      const k = i++;
      try { out[k] = await tasks[k](); } catch (e) { out[k] = null; }
      onDone?.(++done);
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, tasks.length) }, worker));
  return out;
}

/* ---------- static data ---------- */

async function loadBase() {
  const [heroStats, meta, pros] = await Promise.all([
    getJSONCached(`${API}/heroStats`, 360),
    getJSON('data/meta.json').catch(() => null),
    getJSON('data/pros.json').catch(() => null),
  ]);
  heroStats.forEach(h => { S.heroes[h.id] = h; });
  S.meta = meta;
  S.pros = pros?.players || [];
  $('heroList').innerHTML = Object.values(S.heroes).sort((a, b) => a.localized_name.localeCompare(b.localized_name)).map(h => `<option value="${esc(h.localized_name)}">`).join('');
  if (meta) {
    const d = new Date(meta.generated_at * 1000);
    $('updated').textContent = `${L('Патч', 'Patch')} ${meta.patch} · ${L('данные от', 'data from')} ${d.toLocaleDateString(LOC)} ${d.toLocaleTimeString(LOC, { hour: '2-digit', minute: '2-digit' })}`;
  }
}

async function loadGroup(g) {
  if (S.groups[g]) return S.groups[g];
  const d = await getJSON(`data/g${g}.json`);
  d.n = d.heroes.length;
  d.idx = Object.fromEntries(d.heroes.map((h, i) => [h, i]));
  S.groups[g] = d;
  return d;
}

async function loadItems() {
  if (S.items) return;
  const [ids, items] = await Promise.all([getJSON(`${API}/constants/item_ids`), getJSON(`${API}/constants/items`)]);
  S.items = items;
  S.itemIds = ids;
}
const itemByKey = k => S.items?.[k];
const itemImg = k => itemByKey(k) ? CDN + itemByKey(k).img : '';
const itemName = k => itemByKey(k)?.dname || k;
const itemIcon = k => itemImg(k) ? `<img class="item-icon" src="${itemImg(k)}" alt="${esc(itemName(k))}" title="${esc(itemName(k))}">` : '';
const isBigItem = k => { const it = itemByKey(k); return !!it && (it.cost || 0) >= 1800 && (!!it.components || k === 'blink') && !k.startsWith('recipe'); };

/* ---------- matchup math ---------- */

const K_HERO = 50, K_PAIR = 60, K_DUR = 40;
function heroWr(G, h) { const i = G.idx[h]; return i == null ? 0.5 : (G.wins[i] + K_HERO * 0.5) / (G.games[i] + K_HERO); }
function heroPick(G, h) { const i = G.idx[h]; return i == null ? 0 : G.games[i] / Math.max(1, G.matches * 10) * 10; }
function adv(G, a, b) {
  const i = G.idx[a], j = G.idx[b];
  if (i == null || j == null) return 0;
  const g = G.vs_games[i * G.n + j], w = G.vs_wins[i * G.n + j];
  const e = 0.5 + (heroWr(G, a) - 0.5) - (heroWr(G, b) - 0.5);
  return ((w + K_PAIR * e) / (g + K_PAIR) - e) * 100;
}
function syn(G, a, b) {
  const i = G.idx[a], j = G.idx[b];
  if (i == null || j == null) return 0;
  const g = G.with_games[i * G.n + j], w = G.with_wins[i * G.n + j];
  const e = 0.5 + (heroWr(G, a) - 0.5) + (heroWr(G, b) - 0.5);
  return ((w + K_PAIR * e) / (g + K_PAIR) - e) * 100;
}
function durWr(G, h, b) {
  const i = G.idx[h]; if (i == null) return 0.5;
  const base = heroWr(G, h);
  return (G.dur_wins[i * 8 + b] + K_DUR * base) / (G.dur_games[i * 8 + b] + K_DUR);
}
function draftCurve(G, ours, theirs) {
  return DUR_LABELS.map((_, b) => (ours.reduce((s, h) => s + durWr(G, h, b) - 0.5, 0) - theirs.reduce((s, h) => s + durWr(G, h, b) - 0.5, 0)) * 100);
}
const durBinOf = sec => { const m = sec / 60; return m < 20 ? 0 : Math.min(7, Math.floor((m - 20) / 5) + 1); };

/* ---------- positions ---------- */

function posPrior(h) {
  const c = S.meta?.positions?.[h] || [0, 0, 0, 0, 0];
  const roles = S.heroes[h]?.roles || [];
  const pr = roles.includes('Support') ? [0.04, 0.04, 0.12, 0.4, 0.4] : roles.includes('Carry') ? [0.5, 0.2, 0.2, 0.05, 0.05] : [0.2, 0.3, 0.4, 0.05, 0.05];
  const tot = c.reduce((a, b) => a + b, 0);
  return c.map((x, i) => (x + pr[i] * 8) / (tot + 8));
}

const PERMS = (function perms(a) { return a.length <= 1 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map(p => [x, ...p])); })([1, 2, 3, 4, 5]);
const LANE_FOR_POS = { 1: 1, 2: 2, 3: 3, 4: 3, 5: 1 };

function assignPositions(team) {
  const order = [...team].sort((a, b) => (b.net_worth || b.gold_per_min || 0) - (a.net_worth || a.gold_per_min || 0));
  if (team.length !== 5) {
    order.forEach((p, i) => { p._pos = Math.min(5, i + 1); p._posExact = false; p._role = i < 3 ? 'core' : 'support'; });
    return;
  }
  if (new Set(team.map(p => p.position_est).filter(Boolean)).size === 5) {
    team.forEach(p => { p._pos = p.position_est; p._posExact = true; p._role = p._pos <= 3 ? 'core' : 'support'; });
    return;
  }
  const rank = new Map(order.map((p, i) => [p, i]));
  const scoreOf = (p, pos) => {
    let s = Math.log(posPrior(p.hero_id)[pos - 1] + 0.02) - 0.45 * Math.abs(rank.get(p) - (pos - 1));
    if (p.lane_role) {
      if (p.is_roaming) s += pos >= 4 ? 0.6 : -1.5;
      else s += p.lane_role === LANE_FOR_POS[pos] ? 1.2 : -1.5;
    }
    return s;
  };
  let best = null, bestScore = -Infinity;
  for (const perm of PERMS) {
    let s = 0;
    for (let i = 0; i < 5; i++) s += scoreOf(team[i], perm[i]);
    if (s > bestScore) { bestScore = s; best = perm; }
  }
  team.forEach((p, i) => { p._pos = best[i]; p._posExact = !!p.lane_role; p._role = best[i] <= 3 ? 'core' : 'support'; });
}

/* ---------- player performance score ---------- */

const METRICS = {
  gold_per_min: { name: L('Золото в минуту', 'Gold per minute'), tip: L('Фармишь меньше, чем большинство на этом герое. Бери лес между волнами, не простаивай.', 'You farm less than most players on this hero. Take jungle camps between waves and don\'t idle.') },
  xp_per_min: { name: L('Опыт в минуту', 'XP per minute'), tip: L('Отстаёшь по уровню. Меньше умирай и дольше стой в зоне опыта.', 'You fall behind in levels. Die less and stay in XP range longer.') },
  last_hits_per_min: { name: L('Ластхиты в минуту', 'Last hits per minute'), tip: L('Мало добиваешь. Держи линию и лес, не пропускай волны.', 'Too few last hits. Hold your lane and jungle, don\'t miss waves.') },
  kills_per_min: { name: L('Убийства в минуту', 'Kills per minute'), tip: L('Мало убийств для этого героя. Ищи пики и драки в свои тайминги.', 'Few kills for this hero. Look for pickoffs and fights at your timings.') },
  assists_per_min: { name: L('Помощь в минуту', 'Assists per minute'), tip: L('Мало участия в драках. Держись ближе к команде.', 'Low fight participation. Stay closer to your team.') },
  deaths_per_min: { name: L('Выживаемость', 'Survival'), tip: L('Умираешь чаще, чем большинство на этом герое. Носи ТП, смотри на карту, не фарми без вижна.', 'You die more than most players on this hero. Carry a TP, watch the map, don\'t farm without vision.') },
  hero_damage_per_min: { name: L('Урон по героям', 'Hero damage'), tip: L('Мало урона в драках. Ищи позицию, откуда бьёшь дольше.', 'Low damage in fights. Find positions where you can hit for longer.') },
  tower_damage: { name: L('Урон по башням', 'Tower damage'), tip: L('Мало урона по строениям. Превращай выигранные драки в башни.', 'Low building damage. Turn won fights into towers.') },
};
const WEIGHTS = {
  core: { gold_per_min: .22, last_hits_per_min: .18, hero_damage_per_min: .2, tower_damage: .1, kills_per_min: .12, deaths_per_min: .18 },
  support: { assists_per_min: .3, deaths_per_min: .25, hero_damage_per_min: .2, xp_per_min: .15, kills_per_min: .1 },
};
const pctOf = (p, k) => p.benchmarks?.[k]?.pct ?? null;
function scorePlayer(p) {
  const w = WEIGHTS[p._role]; let s = 0, tw = 0;
  for (const k in w) { const v = pctOf(p, k); if (v != null) { s += v * w[k]; tw += w[k]; } }
  if (tw) return s / tw * 10;
  return p.imp != null ? Math.max(0, Math.min(10, 5 + p.imp / 8)) : 0;
}

/* ---------- match loading ---------- */

const MATCH_CACHE_V = 3;
function trimMatch(m) {
  const keepP = ['account_id', 'player_slot', 'hero_id', 'isRadiant', 'kills', 'deaths', 'assists', 'last_hits', 'denies', 'gold_per_min', 'xp_per_min', 'net_worth', 'hero_damage', 'tower_damage', 'hero_healing', 'item_0', 'item_1', 'item_2', 'item_3', 'item_4', 'item_5', 'item_neutral', 'benchmarks', 'lane_role', 'is_roaming', 'personaname', 'rank_tier', 'obs_placed', 'sen_placed', 'camps_stacked', 'teamfight_participation', 'lane_efficiency_pct', 'lane_pos', 'position_est'];
  const wards = l => (l || []).map(w => [w.time, +w.x.toFixed(1), +w.y.toFixed(1), w.ehandle]);
  const left = l => (l || []).map(w => [w.time, w.ehandle, w.attackername || '']);
  return {
    _v: MATCH_CACHE_V,
    match_id: m.match_id, radiant_win: m.radiant_win, duration: m.duration, start_time: m.start_time,
    radiant_score: m.radiant_score, dire_score: m.dire_score, version: m.version || null,
    radiant_gold_adv: m.radiant_gold_adv || null,
    teamfights: (m.teamfights || []).map(t => ({ start: t.start, end: t.end, deaths: t.deaths, players: t.players.map(p => ({ gold_delta: p.gold_delta, deaths: p.deaths, deaths_pos: p.deaths_pos })) })),
    objectives: (m.objectives || []).filter(o => o.type === 'CHAT_MESSAGE_ROSHAN_KILL').map(o => ({ time: o.time, team: o.team })),
    buildings: (m.objectives || []).filter(o => o.type === 'building_kill' && o.key).map(o => ({ time: o.time, key: o.key })),
    players: m.players.map(p => {
      const o = Object.fromEntries(keepP.map(k => [k, p[k]]));
      o.purchase_log = (p.purchase_log || []).map(e => [e.time, e.key]);
      o.obs = wards(p.obs_log); o.sen = wards(p.sen_log);
      o.obs_left = left(p.obs_left_log); o.sen_left = left(p.sen_left_log);
      o.deaths_t = (p.deaths_log || []).map(d => [d.time, d.time_dead || 0]);      o.gold_t = p.gold_t || null;
      o.buyback_t = (p.buyback_log || []).map(b => b.time);
      return o;
    }),
  };
}

const PARSE_WINDOW = 30 * 60 * 1000;
const parsePendingSince = id => { const t = store.get('pr:' + id); return t && Date.now() - t < PARSE_WINDOW ? t : null; };
async function requestParse(id) {
  try {
    const r = await fetch(`${API}/request/${id}`, { method: 'POST' });
    if (!r.ok) return false;
    store.set('pr:' + id, Date.now());
    return true;
  } catch { return false; }
}

async function loadMatch(id, force) {
  const cached = !force && store.get('m:' + id);
  if (cached && (cached._v === MATCH_CACHE_V || (cached._v === 2 && !cached.version)) && (cached.version || (Date.now() - cached._ts < 6 * 3600 * 1000 && !parsePendingSince(id)))) return cached;
  const m = trimMatch(await getJSON(`${API}/matches/${id}`));
  m._ts = Date.now();
  store.set('m:' + id, m);
  return m;
}

function prepareMatch(m) {
  const sz = S.sz?.[m.match_id];
  if (sz) m.players.forEach(p => {
    const q = sz.players.find(x => x.playerSlot === p.player_slot);
    if (!q) return;
    if (q.imp != null) p.imp = q.imp;
    if (!m.players.every(x => x.position_est) && szPos(q)) p.position_est = szPos(q);
  });
  m.players.forEach(p => { p.radiant_win = m.radiant_win; p.isRadiant = p.player_slot < 128; });
  const rad = m.players.filter(p => p.isRadiant), dire = m.players.filter(p => !p.isRadiant);
  assignPositions(rad); assignPositions(dire);
  m.players.forEach(p => { p._score = scorePlayer(p); });
  // no benchmarks and no IMP (fresh Stratz-only match): rank against the other nine players
  const kda = x => (x.kills + x.assists) / (x.deaths + 1);
  const rel = (p, f) => m.players.filter(x => f(x) < f(p)).length / 9;
  m.players.forEach(p => { if (!p.benchmarks && p.imp == null) p._score = (rel(p, x => x.gold_per_min) + rel(p, x => x.hero_damage) + rel(p, kda)) / 3 * 10; });
  m._me = m.players.find(p => p.account_id === S.playerId) || null;
  return m;
}

/* ---------- player view ---------- */

function parseId(input) {
  input = input.trim();
  let m = input.match(/\/players\/(\d+)/);
  if (m) return m[1];
  m = input.match(/steamcommunity\.com\/profiles\/(\d+)/);
  if (m) return String(BigInt(m[1]) - 76561197960265728n);
  m = input.match(/\[U:1:(\d+)\]/);
  if (m) return m[1];
  const num = input.replace(/\D/g, '');
  if (!num) return null;
  return num.length >= 17 ? String(BigInt(num) - 76561197960265728n) : num;
}

$('searchForm').addEventListener('submit', e => { e.preventDefault(); $('history').hidden = true; analyze(); });

const getHistory = () => store.get('history') || [];
function saveHistory(entry) { store.set('history', [entry, ...getHistory().filter(h => h.id !== entry.id)].slice(0, 8)); }
function renderHistory() {
  const list = getHistory();
  $('history').hidden = !list.length;
  $('history').innerHTML = `<div class="label history-head">${L('Недавние', 'Recent')}</div>` + list.map(h => `
    <div class="history-item">
      <button type="button" class="history-pick" data-id="${esc(h.id)}"><img src="${esc(h.avatar)}" alt="" width="32" height="32"><span class="history-name">${esc(h.name)}</span><span class="dim">${esc(h.id)}</span>${rankEmblem(h.tier, 26)}</button>
      <button type="button" class="history-del" data-id="${esc(h.id)}" aria-label="${L('Убрать из истории', 'Remove from history')}: ${esc(h.name)}">×</button>
    </div>`).join('');
}
$('steamId').addEventListener('focus', renderHistory);
$('steamId').addEventListener('click', renderHistory);
$('history').addEventListener('click', e => {
  const pick = e.target.closest('.history-pick'), del = e.target.closest('.history-del');
  if (pick) { $('steamId').value = pick.dataset.id; $('history').hidden = true; analyze(); }
  if (del) { store.set('history', getHistory().filter(h => h.id !== del.dataset.id)); renderHistory(); $('steamId').focus(); }
});
document.addEventListener('click', e => { if (!e.target.closest('.search-row')) $('history').hidden = true; });
document.addEventListener('keydown', e => { if (e.key === 'Escape') $('history').hidden = true; });

async function analyze() {
  const raw = $('steamId').value;
  if (/steamcommunity\.com\/id\//.test(raw)) return showError(L('Ссылка с ником не подходит. Нужна ссылка вида steamcommunity.com/profiles/7656… или Friend ID из Dota.', 'Vanity links don\'t work. Use a steamcommunity.com/profiles/7656… link or your Dota Friend ID.'));
  const id = parseId(raw);
  if (!id) return showError(L('Введи Steam ID, Friend ID или ссылку на профиль.', 'Enter a Steam ID, Friend ID, or profile link.'));
  store.set('lastId', id);
  $('searchBtn').disabled = true; $('results').hidden = true; $('error').hidden = true; $('loading').hidden = false;
  $('loadingText').textContent = L('Загружаю профиль…', 'Loading profile…');
  try {
    const [profile, recent, poolHeroes, period, history] = await Promise.all([
      getJSONCached(`${API}/players/${id}`, 5), getJSONCached(`${API}/players/${id}/recentMatches`, 5),
      getJSONCached(`${API}/players/${id}/heroes`, 5), fetchPeriod(id),
      getJSONCached(`${API}/players/${id}/matches?limit=100&project=kills&project=deaths&project=assists&project=gold_per_min&project=hero_id`, 5).catch(() => []),
    ]);
    if (!profile.profile) throw new Error(L('Профиль не найден. Проверь ID или включи в Dota «Открытая история матчей».', 'Profile not found. Check the ID or turn on "Expose Public Match Data" in Dota.'));
    if (!recent.length && !(period.wl.win + period.wl.lose)) throw new Error(L(`У игрока ${profile.profile.personaname} нет открытых матчей: скорее всего, в Dota выключена «Открытая история матчей».`, `${profile.profile.personaname} has no public matches. "Expose Public Match Data" is probably off in Dota.`));
    saveHistory({ id, name: profile.profile.personaname, avatar: profile.profile.avatarmedium, tier: profile.rank_tier });
    S.playerId = Number(id); S.profile = profile; S.poolHeroes = poolHeroes; S.recent = recent; S.period = period; S.posFilter = 0; S.history = history;
    S.group = groupOfTier(profile.rank_tier);
    await loadGroup(S.group).catch(() => null);

    $('loadingText').textContent = `${L('Загружаю матчи', 'Loading matches')} 0/${recent.length}`;
    const szP = stratzToken() ? stratzRecent(id).catch(() => null) : null;
    const ms = await pool(recent.map(r => () => loadMatch(r.match_id)), 3, d => { $('loadingText').textContent = `${L('Загружаю матчи', 'Loading matches')} ${d}/${recent.length}`; });
    S.sz = (await szP) || {};
    S.matches = {};
    recent.forEach((r, i) => {
      const m = ms[i] || (S.sz[r.match_id] && fromStratz(S.sz[r.match_id]));
      if (m) S.matches[m.match_id] = prepareMatch(m);
    });

    renderPeriod();
    renderFlags();
    renderPositions();
    renderMatches();
    $('results').hidden = false;
    revealList($('results').children);
    countUp($('results'));
    fillIn($('positions'));
    if (location.hash === '#learn') renderLearn();
  } catch (e) {
    showError(e.message || L('Не удалось загрузить данные.', 'Couldn\'t load data.'));
  } finally {
    $('searchBtn').disabled = false; $('loading').hidden = true;
  }
}

const PERIODS = [[20, L('20 игр', '20 games')], [100, L('100 игр', '100 games')], [0, L('Вся история', 'All time')]];
S.limit = store.get('period') ?? 20;
const minGames = () => ({ 20: 2, 100: 4 })[S.limit] ?? 5;
const losingGames = () => ({ 20: 4, 100: 7 })[S.limit] ?? 10;
const periodLabel = () => S.limit ? L(`за последние ${S.limit} игр`, `in the last ${S.limit} games`) : L('за всю историю', 'all time');

function renderFlags() {
  const games = Object.values(S.matches).filter(m => m._me);
  const mvp = games.filter(m => m.players.every(p => p._score <= m._me._score)).length;
  const avgScore = games.reduce((s, m) => s + m._me._score, 0) / Math.max(1, games.length);
  const total = (S.poolHeroes || []).reduce((s, h) => s + h.games, 0);
  const sum = list => {
    const k = list.reduce((s, m) => s + m.kills, 0), d = list.reduce((s, m) => s + m.deaths, 0), a = list.reduce((s, m) => s + m.assists, 0);
    return { n: list.length, wr: list.filter(isWin).length / Math.max(1, list.length), kda: (k + a) / Math.max(1, d), gpm: list.reduce((s, m) => s + m.gold_per_min, 0) / Math.max(1, list.length) };
  };
  const hist = S.history || [], now = sum(hist.slice(0, 20)), before = sum(hist.slice(20));
  const oldHeroes = new Set(hist.slice(20).map(m => m.hero_id));
  const newHeroShare = hist.slice(0, 20).filter(m => !oldHeroes.has(m.hero_id)).length / Math.max(1, Math.min(20, hist.length));
  const p0 = v => `${Math.round(v * 100)}%`;
  const dominant = games.length >= 10 && (mvp / games.length >= 0.35 || avgScore >= 7);
  const flags = [];
  if (dominant && total <= 300 && now.wr >= 0.6) {
    flags.push({ title: L('Похоже на смурфа', 'Looks like a smurf'), reasons: [L(`всего ${total} игр на аккаунте`, `only ${total} games on the account`), L(`MVP матча в ${mvp} из ${games.length} последних игр`, `match MVP in ${mvp} of the last ${games.length} games`), L(`средняя оценка ${avgScore.toFixed(1)} из 10`, `average score ${avgScore.toFixed(1)} of 10`), L(`винрейт ${p0(now.wr)} за последние 20`, `${p0(now.wr)} win rate in the last 20`)] });
  }
  if (dominant && before.n >= 40 && now.wr - before.wr >= 0.2 && (now.kda / before.kda >= 1.4 || now.gpm / before.gpm >= 1.2)) {
    flags.push({ title: L('Похоже, что на аккаунте играет бустер', 'Looks like a booster is playing this account'), reasons: [`${L('винрейт', 'win rate')} ${p0(before.wr)} → ${p0(now.wr)}`, `KDA ${before.kda.toFixed(1)} → ${now.kda.toFixed(1)}`, `GPM ${Math.round(before.gpm)} → ${Math.round(now.gpm)}`, L(`MVP матча в ${mvp} из ${games.length} последних игр`, `match MVP in ${mvp} of the last ${games.length} games`), newHeroShare >= 0.4 ? L(`${p0(newHeroShare)} последних игр на героях, которых не было в играх 21–100`, `${p0(newHeroShare)} of recent games on heroes not played in games 21–100`) : ''].filter(Boolean) });
  }
  $('flags').innerHTML = flags.map(f => `<div class="card issue warn">${sevIcon('bad')}<div class="body"><div class="title">${f.title}</div><div class="detail">${f.reasons.join(' · ')}</div></div></div>`).join('')
    + `<p class="note">MVP ${mvp}/${games.length} · ${L('средняя оценка', 'avg score')} ${avgScore.toFixed(1)}</p>`;
}

async function fetchPeriod(id) {
  const qs = S.limit ? `?limit=${S.limit}` : '';
  const [wl, heroes, totals] = await Promise.all([
    getJSONCached(`${API}/players/${id}/wl${qs}`, 5), getJSONCached(`${API}/players/${id}/heroes${qs}`, 5), getJSONCached(`${API}/players/${id}/totals${qs}`, 5),
  ]);
  return { wl, heroes: heroes.filter(h => h.games > 0), totals };
}

function renderPeriod() {
  S.playerHeroes = S.period.heroes;
  $('periodTabs').innerHTML = PERIODS.map(([n, label]) => `<button class="tab" data-n="${n}" aria-selected="${n === S.limit}">${label}</button>`).join('');
  $('periodTabs').querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => changePeriod(+b.dataset.n)));
  renderProfile(S.profile, S.period.wl);
  renderStats(S.period.totals);
  renderIssues(S.period.totals, S.recent, S.period.heroes);
  setMetaTab(S.metaTab, S.groups[S.group]);
}

async function changePeriod(n) {
  if (n === S.limit) return;
  S.limit = n; store.set('period', n);
  $('periodTabs').querySelectorAll('.tab').forEach(b => { b.disabled = true; b.setAttribute('aria-selected', String(+b.dataset.n === n)); });
  try {
    S.period = await fetchPeriod(S.playerId);
    renderPeriod();
    countUp($('stats')); countUp($('profile'));
  } catch (e) {
    showError(e.message || L('Не удалось загрузить статистику.', 'Couldn\'t load stats.'));
    $('periodTabs').querySelectorAll('.tab').forEach(b => { b.disabled = false; });
  }
}

function showError(msg) { $('error').textContent = msg; $('error').hidden = false; }
const avgOf = (totals, f) => { const t = totals.find(x => x.field === f); return t && t.n ? t.sum / t.n : 0; };

function renderProfile(profile, wl) {
  const p = profile.profile, total = wl.win + wl.lose, wr = total ? wl.win / total * 100 : 0;
  $('profile').innerHTML = `
    <img src="${esc(p.avatarfull)}" alt="">
    ${rankEmblem(profile.rank_tier, 76)}
    <div><h2>${esc(p.personaname)}</h2><div class="meta"><span class="rank-pill">${icon('shield')}${rankName(profile.rank_tier)}</span><span>${S.limit ? L(`винрейт за последние ${total} игр`, `win rate over the last ${total} games`) : L(`${total.toLocaleString(LOC)} матчей всего`, `${total.toLocaleString(LOC)} matches total`)}</span><span>${L('мета по', 'meta for')} ${GROUPS[S.group]}</span></div></div>
    <div class="wl"><div class="big" data-count style="color:${wr >= 52 ? 'var(--good)' : wr >= 48 ? 'var(--fg)' : 'var(--bad)'}">${wr.toFixed(1)}%</div>
    <div class="note"><span class="pos">${wl.win} ${L('побед', 'wins')}</span> · <span class="neg">${wl.lose} ${L('поражений', 'losses')}</span></div></div>`;
}

function renderStats(t) {
  const k = avgOf(t, 'kills'), d = avgOf(t, 'deaths'), a = avgOf(t, 'assists');
  const card = (ic, l, v, s) => `<div class="card stat"><div class="label">${icon(ic)}${l}</div><div class="value" data-count>${v}</div><div class="sub">${s}</div></div>`;
  $('stats').innerHTML =
    card('swords', 'KDA', (d ? (k + a) / d : k + a).toFixed(2), `${k.toFixed(1)} / ${d.toFixed(1)} / ${a.toFixed(1)}`) +
    card('coins', 'GPM', Math.round(avgOf(t, 'gold_per_min')), L('золото в минуту', 'gold per minute')) +
    card('trending', 'XPM', Math.round(avgOf(t, 'xp_per_min')), L('опыт в минуту', 'XP per minute')) +
    card('target', L('Ластхиты', 'Last hits'), Math.round(avgOf(t, 'last_hits')), L('за матч', 'per match')) +
    card('zap', L('Урон по героям', 'Hero damage'), fmt(avgOf(t, 'hero_damage')), L('за матч', 'per match')) +
    card('castle', L('Урон по башням', 'Tower damage'), fmt(avgOf(t, 'tower_damage')), L('за матч', 'per match'));
}

function renderPositions() {
  const mine = Object.values(S.matches).map(m => m._me).filter(Boolean);
  const by = [1, 2, 3, 4, 5].map(pos => {
    const ps = mine.filter(p => p._pos === pos);
    const w = ps.filter(isWin).length;
    return { pos, n: ps.length, wr: ps.length ? w / ps.length * 100 : null, score: ps.length ? ps.reduce((s, p) => s + p._score, 0) / ps.length : null, heroes: [...new Set(ps.map(p => p.hero_id))].slice(0, 4) };
  });
  const adjWr = b => (b.wr / 100 * b.n + 1) / (b.n + 2);
  const best = by.filter(b => b.n >= 3).sort((a, b) => adjWr(b) - adjWr(a) || b.score - a.score)[0];
  $('positions').innerHTML = by.map(b => {
    const c = !b.n ? 'var(--fg-dim)' : b.wr >= 55 ? 'var(--good)' : b.wr >= 45 ? 'var(--accent)' : 'var(--bad)';
    return `<button class="card pos-card ${best && b.pos === best.pos ? 'best' : ''}" data-pos="${b.pos}" ${b.n ? '' : 'disabled'} title="${L('Показать матчи на этой позиции', 'Show matches at this position')}">
      <span class="pos-top">
        <span class="ring" style="--p:${b.n ? b.wr.toFixed(0) : 0};--c:${c}"><span data-count>${b.n ? b.wr.toFixed(0) + '%' : '—'}</span></span>
        <span class="pos-name"><span class="label">Pos ${b.pos}</span><b>${POS_NAMES[b.pos]}</b><span class="note">${b.n} ${L('игр', 'games')}${b.n ? ` · ${L('оценка', 'score')} ${b.score.toFixed(1)}` : ''}</span></span>
      </span>
      <span class="pos-heroes">${b.heroes.map(heroIcon).join('')}</span>
      ${best && b.pos === best.pos ? `<span class="best-tag">${icon('crown')}${L('Лучше всего получается', 'Your best position')}</span>` : ''}
    </button>`;
  }).join('');
  $('positions').querySelectorAll('.pos-card').forEach(b => b.addEventListener('click', () => {
    S.posFilter = +b.dataset.pos;
    renderMatches();
    revealList($('matches').children, 0.025);
    $('posFilter').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
}

function renderIssues(t, recent, heroes) {
  const items = [];
  const add = (sev, title, detail, val) => items.push({ sev, title, detail, val });
  const deaths = avgOf(t, 'deaths'), gpm = avgOf(t, 'gold_per_min'), dur = avgOf(t, 'duration');
  const kda = deaths ? (avgOf(t, 'kills') + avgOf(t, 'assists')) / deaths : 99;
  const lhm = dur ? avgOf(t, 'last_hits') / (dur / 60) : 0;

  if (deaths > 8) add('bad', L('Много смертей', 'Too many deaths'), L(`${deaths.toFixed(1)} за игру. Следи за картой, носи ТП, не фарми без вижна.`, `${deaths.toFixed(1)} per game. Watch the map, carry a TP, don't farm without vision.`), deaths.toFixed(1));
  else if (deaths > 6) add('warn', L('Частые смерти', 'Frequent deaths'), L(`${deaths.toFixed(1)} за игру.`, `${deaths.toFixed(1)} per game.`), deaths.toFixed(1));
  else add('good', L('Хорошо выживаешь', 'Good survival'), L(`${deaths.toFixed(1)} смертей за игру.`, `${deaths.toFixed(1)} deaths per game.`), deaths.toFixed(1));
  if (kda < 2) add('bad', L('Низкий KDA', 'Low KDA'), L('Мало участия в убийствах или частые смерти.', 'Low kill participation or frequent deaths.'), kda.toFixed(2));
  else if (kda < 3) add('warn', L('KDA ниже среднего', 'Below-average KDA'), L('Нормально, но можно лучше.', 'Okay, but there\'s room to improve.'), kda.toFixed(2));
  else add('good', L('Хороший KDA', 'Good KDA'), L('Влияешь на драки и не отдаёшь лишнего.', 'You impact fights without feeding.'), kda.toFixed(2));
  if (gpm < 350) add('bad', L('Слабый фарм', 'Weak farm'), L('Если играешь кор, фарми лес между волнами.', 'If you play core, farm the jungle between waves.'), Math.round(gpm));
  else if (gpm < 420) add('warn', L('Средний фарм', 'Average farm'), L('Для кора можно выжимать больше золота.', 'As a core you can squeeze out more gold.'), Math.round(gpm));
  if (lhm < 4) add('bad', L('Мало ластхитов', 'Few last hits'), L(`${lhm.toFixed(1)} в минуту. Потренируй добивание в демо.`, `${lhm.toFixed(1)} per minute. Practice last hitting in demo mode.`), lhm.toFixed(1));
  else if (lhm < 6) add('warn', L('Ластхиты средние', 'Average last hits'), L(`${lhm.toFixed(1)} в минуту.`, `${lhm.toFixed(1)} per minute.`), lhm.toFixed(1));

  const losing = heroes.filter(h => h.games >= losingGames() && h.win / h.games < 0.45).sort((a, b) => b.games - a.games)[0];
  if (losing) add('bad', L(`Сливаешь на ${heroName(losing.hero_id)}`, `Losing on ${heroName(losing.hero_id)}`), L(`${losing.games} игр ${periodLabel()}, винрейт ${(losing.win / losing.games * 100).toFixed(0)}%. Отложи героя или разбери свои игры на нём.`, `${losing.games} games ${periodLabel()}, ${(losing.win / losing.games * 100).toFixed(0)}% win rate. Shelve the hero or review your games on it.`), (losing.win / losing.games * 100).toFixed(0) + '%');

  const mine = Object.values(S.matches).map(m => m._me).filter(Boolean);
  const byPos = [1, 2, 3, 4, 5].map(pos => { const ps = mine.filter(p => p._pos === pos); return { pos, n: ps.length, wr: ps.length ? ps.filter(isWin).length / ps.length : 0 }; });
  const worstPos = byPos.filter(b => b.n >= 4).sort((a, b) => a.wr - b.wr)[0];
  if (worstPos && worstPos.wr < 0.4) add('warn', L(`Слабая позиция: ${POS_NAMES[worstPos.pos]}`, `Weak position: ${POS_NAMES[worstPos.pos]}`), L(`${worstPos.n} игр за последнее время, побед ${(worstPos.wr * 100).toFixed(0)}%. В подборе ролей лучше ставить другие позиции.`, `${worstPos.n} recent games, ${(worstPos.wr * 100).toFixed(0)}% wins. Queue for other roles.`), (worstPos.wr * 100).toFixed(0) + '%');

  if (recent.length >= 10) {
    const w = recent.slice(0, 10).filter(isWin).length;
    if (w <= 3) add('bad', L('Похоже на тильт', 'Looks like tilt'), L(`${w} побед в последних 10 играх. Сделай перерыв.`, `${w} wins in the last 10 games. Take a break.`), `${w}/10`);
    else if (w >= 7) add('good', L('Хорошая серия', 'Good streak'), L(`${w} побед в последних 10 играх.`, `${w} wins in the last 10 games.`), `${w}/10`);
  }
  const order = { bad: 0, warn: 1, good: 2 };
  items.sort((a, b) => order[a.sev] - order[b.sev]);
  $('issues').innerHTML = items.map(i => `<div class="card issue ${i.sev}">${sevIcon(i.sev)}<div class="body"><div class="title">${esc(i.title)}</div><div class="detail">${esc(i.detail)}</div></div><div class="val" style="color:var(--${i.sev})">${i.val}</div></div>`).join('');
}

document.querySelectorAll('#mineTabs .tab').forEach(b => b.addEventListener('click', () => setMetaTab(b.dataset.tab, S.groups[S.group])));

function setMetaTab(tab, G) {
  S.metaTab = tab;
  document.querySelectorAll('#mineTabs .tab').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
  const g = GROUPS[S.group];
  if (!G) { $('metaNote').textContent = L('Данные меты ещё не собраны.', 'Meta data isn\'t ready yet.'); $('metaTable').innerHTML = ''; return; }
  const mine = Object.fromEntries(S.playerHeroes.map(h => [h.hero_id, h]));
  const myWr = h => h && h.games ? h.win / h.games * 100 : null;
  const mwr = id => heroWr(G, id) * 100;
  if (tab === 'mine') {
    $('metaNote').textContent = '';
    const rows = S.playerHeroes.filter(h => h.games >= minGames()).sort((a, b) => b.games - a.games).slice(0, 15);
    $('metaTable').innerHTML = `<thead><tr><th>${L('Герой', 'Hero')}</th><th class="num">${L('Игр', 'Games')}</th><th class="num">${L('Твой WR', 'Your WR')}</th><th class="num">${L('WR в', 'WR in')} ${g}</th><th class="num">${L('Разница', 'Diff')}</th></tr></thead><tbody>` +
      rows.map(h => `<tr><td>${heroCell(h.hero_id)}</td><td class="num">${h.games}</td><td class="num">${myWr(h).toFixed(1)}%</td><td class="num muted">${mwr(h.hero_id).toFixed(1)}%</td><td class="num ${signCls(myWr(h) - mwr(h.hero_id))}">${pct(myWr(h) - mwr(h.hero_id))}</td></tr>`).join('') + '</tbody>';
  } else if (tab === 'meta') {
    $('metaNote').textContent = '';
    const rows = Object.keys(S.heroes).map(Number).filter(h => heroPick(G, h) >= 0.04).sort((a, b) => heroWr(G, b) - heroWr(G, a)).slice(0, 15);
    $('metaTable').innerHTML = `<thead><tr><th>${L('Герой', 'Hero')}</th><th class="num">${L('WR в', 'WR in')} ${g}</th><th class="num">${L('Пик', 'Pick')}</th><th class="num">${L('Твоих игр', 'Your games')}</th><th class="num">${L('Твой WR', 'Your WR')}</th></tr></thead><tbody>` +
      rows.map(h => { const m = mine[h]; return `<tr><td>${heroCell(h)}</td><td class="num pos">${mwr(h).toFixed(1)}%</td><td class="num muted">${(heroPick(G, h) * 100).toFixed(1)}%</td><td class="num">${m ? m.games : 0}</td><td class="num">${m && m.games >= minGames() ? myWr(m).toFixed(1) + '%' : '<span class="dim">—</span>'}</td></tr>`; }).join('') + '</tbody>';
  } else {
    $('metaNote').textContent = '';
    const rows = S.playerHeroes.filter(h => h.games >= minGames() && mwr(h.hero_id) >= 50 && myWr(h) >= 52)
      .map(h => ({ ...h, s: (myWr(h) - 50) * Math.log(h.games) + (mwr(h.hero_id) - 50) * 2 })).sort((a, b) => b.s - a.s).slice(0, 10);
    $('metaTable').innerHTML = rows.length
      ? `<thead><tr><th>${L('Герой', 'Hero')}</th><th class="num">${L('Твой WR', 'Your WR')}</th><th class="num">${L('Игр', 'Games')}</th><th class="num">${L('WR в', 'WR in')} ${g}</th></tr></thead><tbody>` + rows.map(h => `<tr><td>${heroCell(h.hero_id)}</td><td class="num pos">${myWr(h).toFixed(1)}%</td><td class="num">${h.games}</td><td class="num">${mwr(h.hero_id).toFixed(1)}%</td></tr>`).join('') + '</tbody>'
      : `<tbody><tr><td class="muted">${L('Пока нет героев, где и мета, и твой винрейт выше среднего. Попробуй героев из вкладки «Топ меты».', 'No heroes yet where both the meta and your win rate are above average. Try heroes from the "Top meta" tab.')}</td></tr></tbody>`;
  }
}

function renderMatches() {
  const unparsed = S.recent.filter(r => !S.matches[r.match_id]?.version);
  const ready = unparsed.filter(r => !parsePendingSince(r.match_id));
  $('parseAll').hidden = unparsed.length === 0;
  $('parseAll').disabled = ready.length === 0;
  $('parseAll').textContent = ready.length ? `${L('Разобрать реплеи', 'Parse replays')} (${ready.length})` : `${L('Разбор запрошен', 'Parse requested')} (${unparsed.length})`;
  const posOf = r => S.matches[r.match_id]?._me?._pos;
  const count = p => S.recent.filter(r => !p || posOf(r) === p).length;
  $('posFilter').innerHTML = [0, 1, 2, 3, 4, 5].map(p => `<button class="tab" data-p="${p}" aria-selected="${p === S.posFilter}" ${p && !count(p) ? 'disabled' : ''}>${p ? `${p} · ${POS_NAMES[p]}` : L('Все', 'All')} <span class="dim">${count(p)}</span></button>`).join('');
  $('posFilter').querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => { S.posFilter = +b.dataset.p; renderMatches(); revealList($('matches').children, 0.025); }));
  $('matches').innerHTML = S.recent.filter(r => !S.posFilter || posOf(r) === S.posFilter).map(r => {
    const m = S.matches[r.match_id], me = m?._me;
    const won = isWin(r);
    const posb = me ? posBadge(me) : '<span></span>';
    return `<button class="card match ${won ? '' : 'loss'}" data-id="${r.match_id}" aria-label="${won ? L('Победа', 'Win') : L('Поражение', 'Loss')}: ${esc(heroName(r.hero_id))}">
      ${m?.version ? `<span class="parsed-dot" title="${L('Реплей разобран', 'Replay parsed')}"></span>` : ''}
      <span class="res ${won ? 'win' : 'loss'}"><b>${won ? L('Победа', 'Win') : L('Поражение', 'Loss')}</b><small>${ago(r.start_time + r.duration)}</small></span>${posb}
      ${heroCell(r.hero_id)}
      <span class="kda">${r.kills} / <span class="d">${r.deaths}</span> / ${r.assists}</span>
      <span class="gpm">${r.gold_per_min} GPM</span>
      <span class="dur">${icon('clock')}${mmss(r.duration)}</span>${icon('chevron', 'chev')}</button>`;
  }).join('');
  $('matches').querySelectorAll('.match').forEach(b => b.addEventListener('click', () => openMatch(Number(b.dataset.id))));
}

$('parseAll').addEventListener('click', async () => {
  const ids = S.recent.filter(r => !S.matches[r.match_id]?.version && !parsePendingSince(r.match_id)).map(r => r.match_id);
  $('parseAll').disabled = true; $('parseStatus').hidden = false;
  let sent = 0;
  for (const id of ids) {
    if (await requestParse(id)) sent++;
    $('parseStatus').textContent = `${L('Отправлено', 'Sent')} ${sent}/${ids.length}`;
    await new Promise(r => setTimeout(r, 1100));
  }
  $('parseStatus').textContent = L(`Отправлено ${sent}. Будет готово через 1–5 минут`, `Sent ${sent}. Ready in 1–5 minutes`);
  renderMatches();
});

/* ---------- match dialog ---------- */

let current = null;
$('dlgClose').addEventListener('click', () => $('matchDlg').close());
$('matchDlg').addEventListener('close', () => stopMap());
$('matchDlg').addEventListener('click', e => { if (e.target === $('matchDlg')) $('matchDlg').close(); });
document.querySelectorAll('#dlgTabs .tab').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));

async function openMatch(id) {
  $('dlgTitle').textContent = `${L('Матч', 'Match')} ${id}`;
  $('dlgBody').innerHTML = `<div class="loading"><div class="spinner"></div><p>${L('Загружаю матч…', 'Loading match…')}</p></div>`;
  $('matchDlg').showModal();
  if (motionOn()) M.animate($('matchDlg'), { opacity: [0, 1], scale: [0.97, 1] }, { type: 'spring', bounce: 0, visualDuration: 0.3 });
  try {
    const [m] = await Promise.all([S.matches[id] ? Promise.resolve(S.matches[id]) : loadMatch(id).then(prepareMatch), loadItems().catch(() => {}), loadGroup(S.group).catch(() => null)]);
    S.matches[id] = m;
    current = m;
    $('dlgTitle').textContent = `${m.radiant_win ? L('Победа Radiant', 'Radiant victory') : L('Победа Dire', 'Dire victory')} · ${m.radiant_score}:${m.dire_score} · ${mmss(m.duration)}`;
    showTab('overview');
  } catch (e) {
    $('dlgBody').innerHTML = `<div class="error-msg">${esc(e.message)}</div>`;
  }
}

function showTab(tab) {
  S.dlgTab = tab;
  document.querySelectorAll('#dlgTabs .tab').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
  if (!current) return;
  const G = S.groups[S.group];
  stopMap();
  const r = { overview: renderOverview, draft: renderDraft, flow: renderFlow, map: renderMap, items: renderItemsTab }[tab];
  $('dlgBody').innerHTML = '';
  r(current, G);
  if (motionOn()) M.animate($('dlgBody'), { opacity: [0, 1], y: [6, 0] }, { duration: 0.2, ease: 'easeOut' });
  fillIn($('dlgBody'));
}

function teams(m) {
  const me = m._me;
  const myRad = me ? me.isRadiant : true;
  const mine = m.players.filter(p => p.isRadiant === myRad).sort((a, b) => a._pos - b._pos);
  const theirs = m.players.filter(p => p.isRadiant !== myRad).sort((a, b) => a._pos - b._pos);
  return { me, mine, theirs, myRad, sign: myRad ? 1 : -1, won: me ? isWin(me) : m.radiant_win };
}

const posBadge = p => `<span class="posb ${p._posExact ? '' : 'approx'}" title="${POS_NAMES[p._pos]}${p._posExact ? '' : L(' (примерно)', ' (estimated)')}">${p._pos}</span>`;
const scoreCol = s => s >= 6.5 ? 'var(--good)' : s >= 4 ? 'var(--warn)' : 'var(--bad)';
const finalItems = p => [0, 1, 2, 3, 4, 5].map(i => S.itemIds?.[p['item_' + i]]).filter(Boolean);

function parseBlock(m) {
  if (m.version) return '';
  const since = parsePendingSince(m.match_id);
  if (since) {
    const min = Math.floor((Date.now() - since) / 60000);
    return `<div class="card issue info">${sevIcon('info')}<div class="body"><div class="title">${L('Разбираем реплей', 'Parsing the replay')}</div><div class="detail">${min < 1 ? L('только что', 'just now') : L(`${min} мин назад`, `${min} min ago`)}</div></div><div class="spinner" style="width:20px;height:20px;border-width:2px"></div></div>`;
  }
  const failed = store.get('pr:' + m.match_id);
  return `<div class="card issue info">${sevIcon('info')}<div class="body"><div class="title">${failed ? L('Реплей не удалось разобрать', 'Couldn\'t parse the replay') : L('Откроются карта, драки и тайминги', 'Unlock the map, fights, and timings')}</div><div class="detail">${failed ? L('Возможно, он уже удалён', 'It may have expired') : L('Около 1–5 минут', 'About 1–5 minutes')}</div></div><button class="btn small" id="parseOne">${L('Разобрать реплей', 'Parse replay')}</button></div>`;
}

const pollers = new Set();
async function pollParse(id) {
  if (pollers.has(id)) return;
  pollers.add(id);
  try {
    while (parsePendingSince(id)) {
      await new Promise(r => setTimeout(r, 10000));
      let fresh;
      try { fresh = await loadMatch(id, true); } catch { continue; }
      if (fresh.version) {
        S.matches[id] = prepareMatch(fresh);
        if (S.playerId) { renderPositions(); renderMatches(); }
        if ($('matchDlg').open && current?.match_id === id) { current = S.matches[id]; showTab(S.dlgTab); }
        return;
      }
    }
    if ($('matchDlg').open && current?.match_id === id) showTab(S.dlgTab);
    if (S.playerId) renderMatches();
  } finally {
    pollers.delete(id);
  }
}

function wireParse(m) {
  if (m.version) return;
  if (parsePendingSince(m.match_id)) { pollParse(m.match_id); return; }
  const b = $('parseOne'); if (!b) return;
  b.addEventListener('click', async () => {
    b.disabled = true; b.textContent = L('Отправляю…', 'Sending…');
    if (!(await requestParse(m.match_id))) { b.disabled = false; b.textContent = L('Не отправилось, ещё раз', 'Failed, try again'); return; }
    if (S.playerId) renderMatches();
    showTab(S.dlgTab);
  });
}

function renderOverview(m) {
  const { me, mine, theirs, won } = teams(m);
  const all = m.players;
  const best = all.reduce((a, b) => b._score > a._score ? b : a);
  const worst = all.reduce((a, b) => b._score < a._score ? b : a);
  const table = (team, title, win) => `
    <div class="section"><h3 class="label">${title} · ${win ? L('победа', 'win') : L('поражение', 'loss')}</h3>
    <div class="card table-wrap"><table>
      <thead><tr><th>${L('Поз.', 'Pos')}</th><th>${L('Игрок', 'Player')}</th><th>${L('Герой', 'Hero')}</th><th class="num">K/D/A</th><th class="num">GPM</th><th class="num">LH</th><th class="num">${L('Урон', 'Damage')}</th><th>${L('Предметы', 'Items')}</th><th class="num">${L('Оценка', 'Score')}</th></tr></thead>
      <tbody>${team.map(p => `<tr class="${p === me ? 'me' : ''}">
        <td>${posBadge(p)}</td>
        <td>${p.account_id && p !== me ? `<button class="player-link" data-id="${p.account_id}" title="${L('Открыть анализ этого игрока', 'Analyze this player')}">${esc(p.personaname || L('Без ника', 'No name'))}</button>` : esc(p.personaname || L('Аноним', 'Anonymous'))} ${p === best ? '<span class="chip pos">MVP</span>' : ''}${p === worst ? `<span class="chip neg">${L('Худший', 'Worst')}</span>` : ''}<div class="dim rank-line">${p.rank_tier ? rankEmblem(p.rank_tier, 22) + rankName(p.rank_tier) : ''}</div></td>
        <td>${heroCell(p.hero_id)}</td><td class="num">${p.kills}/${p.deaths}/${p.assists}</td>
        <td class="num">${p.gold_per_min}</td><td class="num">${p.last_hits}</td><td class="num">${fmt(p.hero_damage)}</td>
        <td><div class="items">${finalItems(p).map(itemIcon).join('')}</div></td>
        <td class="num"><span class="score" style="color:${scoreCol(p._score)}">${p._score.toFixed(1)}</span></td></tr>`).join('')}</tbody>
    </table></div></div>`;

  let mineBlock = '';
  if (me) {
    const keys = Object.keys(WEIGHTS[me._role]).concat(me._role === 'core' ? ['xp_per_min'] : ['gold_per_min', 'last_hits_per_min', 'tower_damage']);
    const rows = keys.map(k => ({ k, v: pctOf(me, k) })).filter(r => r.v != null).sort((a, b) => a.v - b.v);
    const weak = rows.filter(r => r.v < 0.4 && WEIGHTS[me._role][r.k]);
    const strong = rows.filter(r => r.v >= 0.7);
    const rank = [...all].sort((a, b) => b._score - a._score).indexOf(me) + 1;
    const extra = [];
    if (me.lane_efficiency_pct != null) extra.push(L(`эффективность на линии ${me.lane_efficiency_pct}%`, `lane efficiency ${me.lane_efficiency_pct}%`));
    if (me.teamfight_participation != null) extra.push(L(`участие в драках ${(me.teamfight_participation * 100).toFixed(0)}%`, `fight participation ${(me.teamfight_participation * 100).toFixed(0)}%`));
    if (me._role === 'support' && me.obs_placed != null) extra.push(L(`вардов ${me.obs_placed} обс / ${me.sen_placed} сентри`, `wards ${me.obs_placed} obs / ${me.sen_placed} sentry`));
    if (me.camps_stacked) extra.push(L(`стаков ${me.camps_stacked}`, `stacks ${me.camps_stacked}`));
    mineBlock = `
      <div class="section"><h3 class="section-title">${L('Где можно было лучше', 'Where you could do better')}</h3>
        <p class="note">${esc(heroName(me.hero_id))} · ${POS_NAMES[me._pos]} · ${L(`${rank}-е место из 10`, `rank ${rank} of 10`)}${extra.length ? ' · ' + extra.join(' · ') : ''}</p>
        <div class="card bench-list">${rows.map(r => `<div class="bench"><span>${METRICS[r.k].name}</span><div class="track"><div class="fill" style="width:${(r.v * 100).toFixed(0)}%;background:${r.v >= .6 ? 'var(--good)' : r.v >= .4 ? 'var(--warn)' : 'var(--bad)'}"></div></div><span class="num">${(r.v * 100).toFixed(0)}%</span></div>`).join('')}</div>
        <div class="issue-list">
          ${weak.map(r => `<div class="card issue">${sevIcon('bad')}<div class="body"><div class="title">${METRICS[r.k].name}: ${L(`хуже ${(100 - r.v * 100).toFixed(0)}% игроков`, `worse than ${(100 - r.v * 100).toFixed(0)}% of players`)}</div><div class="detail">${METRICS[r.k].tip}</div></div></div>`).join('')}
          ${strong.length ? `<div class="card issue good">${sevIcon('good')}<div class="body"><div class="title">${L('Получилось хорошо', 'Went well')}</div><div class="detail">${strong.map(r => METRICS[r.k].name.toLowerCase()).join(', ')}: ${L('лучше 70%+ игроков на этом герое.', 'better than 70%+ of players on this hero.')}</div></div></div>` : ''}
          ${!weak.length ? `<div class="card issue good">${sevIcon('good')}<div class="body"><div class="title">${L('Серьёзных провалов нет', 'No major weak spots')}</div><div class="detail">${L('По ключевым показателям роли ты не хуже большинства.', 'On your role\'s key stats you\'re no worse than most players.')}</div></div></div>` : ''}
        </div></div>`;
  }
  $('dlgBody').innerHTML = parseBlock(m) + mineBlock + table(mine, me ? L('Твоя команда', 'Your team') : 'Radiant', me ? won : m.radiant_win) + table(theirs, me ? L('Враги', 'Enemies') : 'Dire', me ? !won : !m.radiant_win) + `    <div class="row note"><a href="https://www.opendota.com/matches/${m.match_id}" target="_blank" rel="noopener">OpenDota</a><a href="https://www.dotabuff.com/matches/${m.match_id}" target="_blank" rel="noopener">Dotabuff</a><a href="https://stratz.com/matches/${m.match_id}" target="_blank" rel="noopener">Stratz</a></div>`;
  wireParse(m);
  $('dlgBody').querySelectorAll('.player-link').forEach(b => b.addEventListener('click', () => {
    $('matchDlg').close();
    location.hash = '#player';
    $('steamId').value = b.dataset.id;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    analyze();
  }));
}

function advCell(v) {
  const a = Math.min(1, Math.abs(v) / 4) * 45;
  const c = v >= 0 ? 'var(--good)' : 'var(--bad)';
  return `<td class="cell num" style="background: color-mix(in srgb, ${c} ${a.toFixed(0)}%, transparent)">${pct(v)}</td>`;
}

function candidates(G, pos, enemies, allies, exclude) {
  const ex = new Set(exclude);
  return Object.keys(S.heroes).map(Number)
    .filter(h => !ex.has(h) && G.idx[h] != null && (!pos || posPrior(h)[pos - 1] >= 0.15) && heroPick(G, h) >= 0.01)
    .map(h => {
      const vs = enemies.map(e => [e, adv(G, h, e)]);
      const wi = allies.map(a => [a, syn(G, h, a)]);
      const base = (heroWr(G, h) - 0.5) * 100;
      return { h, vs, wi, base, score: vs.reduce((s, x) => s + x[1], 0) + wi.reduce((s, x) => s + x[1], 0) + base };
    }).sort((a, b) => b.score - a.score);
}

function candRow(c, mineCls) {
  const parts = c.vs.map(([e, v]) => `<span title="${L('против', 'vs')} ${esc(heroName(e))}">${heroImg(e) ? `<img src="${heroImg(e)}" alt="">` : ''}<b class="${signCls(v)}">${pct(v)}</b></span>`)
    .concat(c.wi.map(([a, v]) => `<span title="${L('вместе с', 'with')} ${esc(heroName(a))}">+${heroImg(a) ? `<img src="${heroImg(a)}" alt="">` : ''}<b class="${signCls(v)}">${pct(v)}</b></span>`));
  return `<div class="cand ${mineCls || ''}">${heroCell(c.h)}<span class="score ${signCls(c.score)}">${pct(c.score)}</span><div class="breakdown">${parts.join('')}<span class="dim">${L('мета', 'meta')} ${pct(c.base)}</span></div></div>`;
}

function renderDraft(m, G) {
  if (!G) { $('dlgBody').innerHTML = `<div class="empty">${L('Данные по матчапам ещё не собраны.', 'Matchup data isn\'t ready yet.')}</div>`; return; }
  const { me, mine, theirs } = teams(m);
  const myH = mine.map(p => p.hero_id), thH = theirs.map(p => p.hero_id);
  const matrix = mine.map(p => thH.map(e => adv(G, p.hero_id, e)));
  const total = matrix.flat().reduce((s, v) => s + v, 0);
  const synOf = hs => { let s = 0; for (let i = 0; i < hs.length; i++) for (let j = i + 1; j < hs.length; j++) s += syn(G, hs[i], hs[j]); return s; };
  const synMine = synOf(myH), synTheirs = synOf(thH);
  const metaMine = myH.reduce((s, h) => s + (heroWr(G, h) - .5) * 100, 0), metaTheirs = thH.reduce((s, h) => s + (heroWr(G, h) - .5) * 100, 0);

  let html = `
    <div class="section"><h3 class="section-title">${L('Кто кого контрпикает', 'Who counters whom')}</h3>      <div class="card table-wrap"><table class="matrix"><thead><tr><th></th>${theirs.map(p => `<th class="hcol">${posBadge(p)} ${heroIcon(p.hero_id)}</th>`).join('')}<th class="num">${L('Итого', 'Total')}</th></tr></thead>
      <tbody>${mine.map((p, i) => `<tr class="${p === me ? 'me' : ''}"><td><div class="row">${posBadge(p)}${heroCell(p.hero_id)}</div></td>${matrix[i].map(advCell).join('')}<td class="num ${signCls(matrix[i].reduce((s, v) => s + v, 0))}"><b>${pct(matrix[i].reduce((s, v) => s + v, 0))}</b></td></tr>`).join('')}
      <tr><td class="muted">${L('Итого против врага', 'Total vs enemy')}</td>${thH.map((_, j) => { const s = matrix.reduce((a, r) => a + r[j], 0); return `<td class="num ${signCls(s)}">${pct(s)}</td>`; }).join('')}<td class="num ${signCls(total)}"><b>${pct(total)}</b></td></tr></tbody></table></div>
    </div>
    <div class="stats-grid">
      <div class="card stat"><div class="label">${L('Матчапы', 'Matchups')}</div><div class="value ${signCls(total)}">${pct(total)}</div><div class="sub">${total >= 2 ? L('вы законтрили врага', 'you countered them') : total <= -2 ? L('враг законтрил вас', 'they countered you') : L('примерно поровну', 'roughly even')}</div></div>
      <div class="card stat"><div class="label">${L('Сочетание у вас', 'Your synergy')}</div><div class="value ${signCls(synMine)}">${pct(synMine)}</div><div class="sub">${L('у врага', 'theirs')} ${pct(synTheirs)}</div></div>
      <div class="card stat"><div class="label">${L('Сила героев в мете', 'Meta strength')}</div><div class="value ${signCls(metaMine - metaTheirs)}">${pct(metaMine - metaTheirs)}</div><div class="sub">${L('ваши', 'yours')} ${pct(metaMine)} / ${L('их', 'theirs')} ${pct(metaTheirs)}</div></div>
    </div>`;

  if (me) {
    const allies = myH.filter(h => h !== me.hero_id);
    const exclude = [...myH, ...thH];
    const list = candidates(G, me._pos, thH, allies, exclude.filter(h => h !== me.hero_id));
    const myIdx = list.findIndex(c => c.h === me.hero_id);
    const myC = myIdx >= 0 ? list[myIdx] : { h: me.hero_id, vs: thH.map(e => [e, adv(G, me.hero_id, e)]), wi: allies.map(a => [a, syn(G, me.hero_id, a)]), base: (heroWr(G, me.hero_id) - .5) * 100 };
    if (myIdx < 0) myC.score = myC.vs.reduce((s, x) => s + x[1], 0) + myC.wi.reduce((s, x) => s + x[1], 0) + myC.base;
    const top = list.filter(c => c.h !== me.hero_id).slice(0, 6);
    const poolIds = new Set((S.poolHeroes || []).filter(h => h.games >= 10).map(h => h.hero_id));
    const fromPool = list.filter(c => c.h !== me.hero_id && poolIds.has(c.h)).slice(0, 3);
    const myHero = (S.poolHeroes || []).find(h => h.hero_id === me.hero_id);
    html += `
      <div class="section"><h3 class="section-title">${L('Твой пик', 'Your pick')}: ${esc(heroName(me.hero_id))}</h3>
        <p class="note">${POS_NAMES[me._pos]}${myIdx >= 0 ? ' · ' + L(`${myIdx + 1}-е место из ${list.length}`, `rank ${myIdx + 1} of ${list.length}`) : ''}</p>
        <div class="card">${candRow(myC, 'mine')}</div>
      </div>
      <div class="section"><h3 class="section-title">${L('Кого лучше было бы взять', 'Better picks')}</h3>        <div class="card">${top.map(c => candRow(c)).join('')}</div>
        ${fromPool.length ? `<h3 class="label">${L('Из твоих героев (10+ игр)', 'From your heroes (10+ games)')}</h3><div class="card">${fromPool.map(c => candRow(c)).join('')}</div>` : ''}
        ${myHero ? `<p class="note">${esc(heroName(me.hero_id))}: ${(myHero.win / myHero.games * 100).toFixed(0)}% · ${myHero.games} ${L('игр', 'games')}</p>` : ''}
      </div>`;
  }
  $('dlgBody').innerHTML = html;
}

/* ---------- charts ---------- */

function niceMax(v) { const steps = [1000, 2000, 2500, 5000, 10000, 15000, 20000, 25000, 30000, 40000, 50000]; return steps.find(s => s >= v) || Math.ceil(v / 10000) * 10000; }

function goldChart(adv, fights, roshans) {
  const W = 760, H = 240, PL = 46, PR = 12, PT = 12, PB = 26;
  const n = adv.length, ym = niceMax(Math.max(2000, ...adv.map(Math.abs)) * 1.08);
  const x = i => PL + (i / Math.max(1, n - 1)) * (W - PL - PR);
  const y = v => PT + (1 - (v + ym) / (2 * ym)) * (H - PT - PB);
  const pts = adv.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const area = `M${x(0)},${y(0)} L${pts.replace(/ /g, ' L')} L${x(n - 1)},${y(0)} Z`;
  const yt = [-ym, -ym / 2, 0, ym / 2, ym];
  const xt = []; for (let t = 0; t < n; t += 10) xt.push(t);
  const at = t => { const i = Math.min(n - 1, Math.max(0, t / 60)); const a = Math.floor(i), b = Math.min(n - 1, a + 1); return adv[a] + (adv[b] - adv[a]) * (i - a); };
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${L('Преимущество по золоту по минутам', 'Gold lead by minute')}">
    <defs><clipPath id="cpUp"><rect x="0" y="0" width="${W}" height="${y(0)}"/></clipPath><clipPath id="cpDn"><rect x="0" y="${y(0)}" width="${W}" height="${H}"/></clipPath></defs>
    ${yt.map(v => `<line class="${v === 0 ? 'zero' : 'grid'}" x1="${PL}" x2="${W - PR}" y1="${y(v)}" y2="${y(v)}"/><text class="axis" x="${PL - 6}" y="${y(v) + 4}" text-anchor="end">${v > 0 ? '+' : ''}${fmt(v)}</text>`).join('')}
    ${xt.map(t => `<text class="axis" x="${x(t)}" y="${H - 8}" text-anchor="middle">${t}′</text>`).join('')}
    <path d="${area}" fill="var(--good)" fill-opacity=".22" clip-path="url(#cpUp)"/>
    <path d="${area}" fill="var(--bad)" fill-opacity=".22" clip-path="url(#cpDn)"/>
    <polyline points="${pts}" fill="none" stroke="var(--fg)" stroke-width="2" stroke-linejoin="round"/>
    ${roshans.map(r => `<g><line x1="${x(r.time / 60)}" x2="${x(r.time / 60)}" y1="${PT}" y2="${H - PB}" stroke="${r.ours ? 'var(--good)' : 'var(--bad)'}" stroke-dasharray="3 3" stroke-opacity=".6"/><text class="axis" x="${x(r.time / 60) + 3}" y="${PT + 10}">${L('Рошан', 'Roshan')}</text></g>`).join('')}
    ${fights.map(f => `<circle cx="${x(f.mid / 60)}" cy="${y(at(f.mid))}" r="${4 + Math.min(4, f.deaths / 2)}" fill="${f.swing >= 0 ? 'var(--good)' : 'var(--bad)'}" stroke="var(--surface)" stroke-width="2"/>`).join('')}
    <line id="gcCross" x1="0" x2="0" y1="${PT}" y2="${H - PB}" stroke="var(--fg-muted)" stroke-width="1" visibility="hidden"/>
    <rect id="gcHit" x="${PL}" y="${PT}" width="${W - PL - PR}" height="${H - PT - PB}" fill="transparent"/>
  </svg>`;
}

function wireGoldChart(wrap, adv, fights) {
  const svg = wrap.querySelector('svg'), hit = wrap.querySelector('#gcHit'), cross = wrap.querySelector('#gcCross'), tip = wrap.querySelector('.tip');
  const W = 760, PL = 46, PR = 12, n = adv.length;
  const move = ev => {
    const r = svg.getBoundingClientRect();
    const vx = (ev.clientX - r.left) / r.width * W;
    const i = Math.round(Math.max(0, Math.min(n - 1, (vx - PL) / (W - PL - PR) * (n - 1))));
    const cx = PL + i / Math.max(1, n - 1) * (W - PL - PR);
    cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.setAttribute('visibility', 'visible');
    const f = fights.find(f => Math.abs(f.mid / 60 - i) < 0.8);
    tip.hidden = false;
    tip.innerHTML = `<b>${i}′</b> · ${adv[i] >= 0 ? L('вы впереди на', 'you lead by') : L('враг впереди на', 'enemy leads by')} <b class="${signCls(adv[i])}">${fmt(Math.abs(adv[i]))}</b>${f ? `<br>${L('Драка', 'Fight')}: ${f.ourDeaths}:${f.theirDeaths} ${L('по смертям', 'deaths')}, ${f.swing >= 0 ? '+' : ''}${fmt(f.swing)} ${L('золота', 'gold')}` : ''}`;
    const left = (cx / W) * r.width + 12;
    tip.style.left = Math.min(left, r.width - tip.offsetWidth) + 'px';
    tip.style.top = '8px';
  };
  hit.addEventListener('mousemove', move);
  hit.addEventListener('mouseleave', () => { cross.setAttribute('visibility', 'hidden'); tip.hidden = true; });
}

function draftBars(curve, upto) {
  const W = 760, H = 180, PL = 46, PR = 12, PT = 12, PB = 28;
  const ym = Math.max(4, Math.ceil(Math.max(...curve.map(Math.abs)) / 2) * 2);
  const bw = (W - PL - PR) / curve.length;
  const y = v => PT + (1 - (v + ym) / (2 * ym)) * (H - PT - PB);
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${L('Перевес драфта по времени игры', 'Draft advantage by game time')}">
    ${[-ym, 0, ym].map(v => `<line class="${v === 0 ? 'zero' : 'grid'}" x1="${PL}" x2="${W - PR}" y1="${y(v)}" y2="${y(v)}"/><text class="axis" x="${PL - 6}" y="${y(v) + 4}" text-anchor="end">${v > 0 ? '+' : ''}${v}%</text>`).join('')}
    ${curve.map((v, i) => { const x0 = PL + i * bw + 6, top = Math.min(y(v), y(0)), h = Math.max(1, Math.abs(y(v) - y(0))); const past = upto != null && i > upto;
      return `<g><title>${DUR_LABELS[i]} ${L('мин', 'min')}: ${pct(v)}</title><rect x="${x0}" y="${top}" width="${bw - 12}" height="${h}" rx="3" fill="${v >= 0 ? 'var(--good)' : 'var(--bad)'}" fill-opacity="${past ? .3 : .85}"/>
      <text class="axis" x="${x0 + (bw - 12) / 2}" y="${v >= 0 ? top - 4 : top + h + 12}" text-anchor="middle">${pct(v, 0)}</text>
      <text class="axis" x="${x0 + (bw - 12) / 2}" y="${H - 8}" text-anchor="middle">${DUR_LABELS[i]}</text></g>`; }).join('')}
  </svg>`;
}

function windowsText(curve) {
  const strong = [], weak = [];
  curve.forEach((v, i) => { if (v >= 3) strong.push(i); else if (v <= -3) weak.push(i); });
  const START = [0, 20, 25, 30, 35, 40, 45, 50], END = [20, 25, 30, 35, 40, 45, 50, null];
  const span = idx => {
    if (!idx.length) return '';
    const groups = []; let s = idx[0], p = idx[0];
    for (const i of idx.slice(1)) { if (i === p + 1) { p = i; continue; } groups.push([s, p]); s = p = i; }
    groups.push([s, p]);
    return groups.map(([a, b]) => END[b] == null ? L(`после ${START[a]} мин`, `after ${START[a]} min`) : START[a] === 0 ? L(`до ${END[b]} мин`, `before ${END[b]} min`) : `${START[a]}–${END[b]} ${L('мин', 'min')}`).join(', ');
  };
  return { strong: span(strong), weak: span(weak) };
}

function renderFlow(m, G) {
  const { me, mine, theirs, sign, won } = teams(m);
  if (!G) { $('dlgBody').innerHTML = `<div class="empty">${L('Данные меты ещё не собраны.', 'Meta data isn\'t ready yet.')}</div>`; return; }
  const curve = draftCurve(G, mine.map(p => p.hero_id), theirs.map(p => p.hero_id));
  const w = windowsText(curve);
  const endBin = durBinOf(m.duration);
  let html = parseBlock(m);
  const insights = [];
  const peak = curve.indexOf(Math.max(...curve)), dip = curve.indexOf(Math.min(...curve));
  insights.push({ sev: 'info', title: L('Окна по драфту', 'Draft windows'), detail: `${w.strong ? L(`Ваш драфт сильнее: ${w.strong}. В эти минуты надо искать драки, смоки и объекты.`, `Your draft is stronger: ${w.strong}. Look for fights, smokes, and objectives then.`) : L('Явных окон силы у вашего драфта нет.', 'Your draft has no clear power window.')} ${w.weak ? L(`Слабее: ${w.weak}. Тут лучше фармить, защищаться и не принимать драки без преимущества.`, `Weaker: ${w.weak}. Farm, defend, and avoid even fights then.`) : ''} ${L('Пик силы', 'Peak')}: ${DUR_LABELS[peak]} ${L('мин', 'min')}, ${L('спад', 'low')}: ${DUR_LABELS[dip]} ${L('мин', 'min')}.` });
  if (curve[endBin] <= -2 && !won) insights.push({ sev: 'bad', title: L('Игра ушла в окно врага', 'The game drifted into their window'), detail: L(`Матч закончился на ${mmss(m.duration)}, когда драфт врага сильнее. Надо было закрывать игру раньше.`, `The match ended at ${mmss(m.duration)}, when the enemy draft is stronger. You needed to close earlier.`) });
  if (curve[endBin] >= 2 && won) insights.push({ sev: 'good', title: L('Игра закончилась в ваше окно', 'The game ended in your window'), detail: L('Вы закрыли матч там, где ваш драфт сильнее.', 'You closed the match while your draft was stronger.') });

  if (m.version && m.radiant_gold_adv?.length) {
    const adv = m.radiant_gold_adv.map(v => v * sign);
    const idxOf = p => m.players.indexOf(p);
    const fights = (m.teamfights || []).map(t => {
      const our = mine.reduce((s, p) => s + (t.players[idxOf(p)]?.gold_delta || 0), 0), their = theirs.reduce((s, p) => s + (t.players[idxOf(p)]?.gold_delta || 0), 0);
      const ourDeaths = mine.reduce((s, p) => s + (t.players[idxOf(p)]?.deaths || 0), 0), theirDeaths = theirs.reduce((s, p) => s + (t.players[idxOf(p)]?.deaths || 0), 0);
      return { start: t.start, end: t.end, mid: (t.start + t.end) / 2, swing: our - their, ourDeaths, theirDeaths, deaths: t.deaths };
    });
    const roshans = (m.objectives || []).map(o => ({ time: o.time, ours: (o.team === 2) === (sign === 1) }));
    html += `<div class="section"><h3 class="section-title">${L('Преимущество по золоту', 'Gold lead')}</h3>
      <div class="card chart-wrap">${goldChart(adv, fights, roshans)}<div class="tip" hidden></div></div>
      <div class="legend"><span><i style="background:var(--good)"></i>${L('выигранная драка', 'fight won')}</span><span><i style="background:var(--bad)"></i>${L('проигранная драка', 'fight lost')}</span><span>${L('пунктир — Рошан', 'dashed — Roshan')}</span></div></div>`;

    const maxLead = Math.max(...adv), maxDef = Math.min(...adv);
    const tLead = adv.indexOf(maxLead), tDef = adv.indexOf(maxDef);
    if (!won && maxLead >= 8000) insights.push({ sev: 'bad', title: L('Выброшенная игра', 'Thrown game'), detail: L(`На ${tLead}′ вы вели на ${fmt(maxLead)} золота и проиграли. Смотри драки после этой минуты: скорее всего, бой без вижна или без ключевых кнопок.`, `At ${tLead}′ you led by ${fmt(maxLead)} gold and lost. Check the fights after that minute: likely a fight without vision or key spells.`) });
    if (won && maxDef <= -8000) insights.push({ sev: 'good', title: L('Камбэк', 'Comeback'), detail: L(`На ${tDef}′ отставали на ${fmt(-maxDef)} золота и вытащили.`, `At ${tDef}′ you were down ${fmt(-maxDef)} gold and won anyway.`) });
    if (won && maxDef > -2000) insights.push({ sev: 'good', title: L('Контролируемая победа', 'Controlled win'), detail: L('Враг ни разу не вёл заметно по золоту.', 'The enemy never had a real gold lead.') });

    const big = [...fights].sort((a, b) => Math.abs(b.swing) - Math.abs(a.swing)).slice(0, 5).sort((a, b) => a.start - b.start);
    const fightRows = big.map(f => {
      const bin = durBinOf(f.mid), win = f.swing >= 0, inStrong = curve[bin] >= 2, inWeak = curve[bin] <= -2;
      let advice = '';
      if (!win && inWeak) advice = L('Драка в окне врага: лучше было не принимать её, а фармить или отступить.', 'A fight in their window: better to skip it, farm, or back off.');
      else if (!win && inStrong) advice = L('Окно было ваше, но драка проиграна. Дело в исполнении: позиция, кнопки, вход по одному.', 'It was your window, but you lost. Execution issue: positioning, spells, going in one by one.');
      else if (!win) advice = L('Проигранная драка. Проверь, был ли вижн и все ли пришли.', 'Lost fight. Check whether you had vision and everyone showed up.');
      else if (win && inWeak) advice = L('Отличная драка против более сильного по времени драфта.', 'Great fight against a draft that was stronger at that time.');
      else advice = L('Хорошая драка. Важно, что было после: взяли ли башню или Рошана.', 'Good fight. What matters is what came next: did you take a tower or Roshan?');
      return `<div class="card issue ${win ? 'good' : 'bad'}">${sevIcon(win ? 'good' : 'bad')}<div class="body"><div class="title">${mmss(f.start)} · ${win ? L('выиграна', 'won') : L('проиграна', 'lost')} · ${L('смерти', 'deaths')} ${f.theirDeaths}:${f.ourDeaths}</div><div class="detail">${advice}</div></div><div class="val ${signCls(f.swing)}">${f.swing >= 0 ? '+' : ''}${fmt(f.swing)}</div></div>`;
    }).join('');
    const ourW = fights.filter(f => f.swing >= 0).length;
    if (fights.length) insights.push({ sev: ourW >= fights.length / 2 ? 'good' : 'warn', title: L(`Драки: ${ourW} из ${fights.length} выиграно`, `Fights: ${ourW} of ${fights.length} won`), detail: L('Ниже самые крупные драки по изменению золота.', 'The biggest fights by gold swing are below.') });

    const timings = [];
    for (const p of [...mine, ...theirs]) {
      if (p._pos > 3) continue;
      const seen = new Set();
      for (const [t, k] of p.purchase_log || []) {
        if (isBigItem(k) && !seen.has(k) && (itemByKey(k).cost || 0) >= 2500) { seen.add(k); timings.push({ t, k, p, ours: mine.includes(p) }); }
        if (seen.size >= 3) break;
      }
    }
    timings.sort((a, b) => a.t - b.t);
    html += `<div class="section"><h3 class="section-title">${L('Ключевые тайминги коров', 'Core item timings')}</h3>
      <div class="card table-wrap"><table><thead><tr><th>${L('Время', 'Time')}</th><th>${L('Команда', 'Team')}</th><th>${L('Герой', 'Hero')}</th><th>${L('Предмет', 'Item')}</th></tr></thead><tbody>${timings.slice(0, 15).map(r => `<tr><td class="num">${mmss(r.t)}</td><td class="${r.ours ? 'pos' : 'neg'}">${r.ours ? L('вы', 'you') : L('враг', 'enemy')}</td><td>${heroCell(r.p.hero_id)}</td><td><div class="row">${itemIcon(r.k)}${esc(itemName(r.k))}</div></td></tr>`).join('')}</tbody></table></div></div>`;
    html += `<div class="section"><h3 class="section-title">${L('Крупные драки', 'Biggest fights')}</h3><div class="issue-list">${fightRows || `<div class="empty">${L('Драк не найдено.', 'No fights found.')}</div>`}</div></div>`;
  }

  html = `<div class="section"><h3 class="section-title">${L('Когда вы были сильнее', 'When you were stronger')}</h3>    <div class="card chart-wrap">${draftBars(curve, endBin)}</div></div>
    <div class="issue-list">${insights.map(i => `<div class="card issue ${i.sev}">${sevIcon(i.sev)}<div class="body"><div class="title">${esc(i.title)}</div><div class="detail">${esc(i.detail)}</div></div></div>`).join('')}</div>` + html;
  $('dlgBody').innerHTML = html;
  const wrap = $('dlgBody').querySelectorAll('.chart-wrap')[1];
  if (wrap && m.radiant_gold_adv) {
    const fights = (m.teamfights || []).map(t => {
      const idxOf = p => m.players.indexOf(p);
      return { mid: (t.start + t.end) / 2, swing: mine.reduce((s, p) => s + (t.players[idxOf(p)]?.gold_delta || 0), 0) - theirs.reduce((s, p) => s + (t.players[idxOf(p)]?.gold_delta || 0), 0), ourDeaths: mine.reduce((s, p) => s + (t.players[idxOf(p)]?.deaths || 0), 0), theirDeaths: theirs.reduce((s, p) => s + (t.players[idxOf(p)]?.deaths || 0), 0) };
    });
    wireGoldChart(wrap, m.radiant_gold_adv.map(v => v * sign), fights);
  }
  wireParse(m);
}

/* ---------- map ---------- */

const MAP_IMG = 'https://www.opendota.com/assets/images/dota2/map/detailed_740.webp';
S.fog = store.get('fog') || 'both';
const VISION = { obs: [9.8, 6.1], hero: [11, 4.9] };

function fogLayer(m, d, t) {
  if (S.fog === 'off') return { svg: '', shown: () => true };
  const day = Math.floor(t / 300) % 2 === 0, k = day ? 0 : 1;
  const src = { rad: [{ x: 7, y: 93, r: 16 }], dire: [{ x: 93, y: 7, r: 16 }] };
  const sideOf = p => p.isRadiant ? 'rad' : 'dire';
  for (const w of d.wards) if (w.type === 'obs' && w.t <= t && t < w.end) src[sideOf(w.p)].push({ x: w.x, y: w.y, r: VISION.obs[k] });
  const pb = S.map?.pb;
  if (pb) for (const p of m.players) { const h = !isDead(p, t) && heroAt(pb[p.player_slot], t); if (h) src[sideOf(p)].push({ x: h[1], y: h[2], r: VISION.hero[k] }); }
  else if (t <= 600) for (const l of d.lanes) src[sideOf(l.p)].push({ x: l.spot.x, y: l.spot.y, r: VISION.hero[k] });
  if (!pb) for (const f of d.fights) {
    if (t < f.start - 3 || t > f.end + 12) continue;
    for (const dd of f.deaths) { src.rad.push({ x: dd.x, y: dd.y, r: VISION.hero[k] }); src.dire.push({ x: dd.x, y: dd.y, r: VISION.hero[k] }); }
  }
  const holes = S.fog === 'both' ? [...src.rad, ...src.dire] : src[S.fog];
  const rims = S.fog === 'both' ? [['rad', 'var(--good)'], ['dire', 'var(--bad)']].map(([s, c]) => src[s].map(h => `<circle cx="${h.x}" cy="${h.y}" r="${h.r}" fill="none" stroke="${c}" stroke-opacity=".35" stroke-width=".25"/>`).join('')).join('') : '';
  const seen = (x, y) => holes.some(h => Math.hypot(h.x - x, h.y - y) < h.r);
  return {
    svg: `<defs><filter id="fogBlur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="1.4"/></filter>
    <mask id="fogMask"><rect width="100" height="100" fill="#fff"/><g filter="url(#fogBlur)">${holes.map(h => `<circle cx="${h.x}" cy="${h.y}" r="${h.r}" fill="#000"/>`).join('')}</g></mask></defs>
    <rect width="100" height="100" fill="#04060a" fill-opacity=".68" mask="url(#fogMask)"/>${rims}`,
    shown: (p, x, y) => S.fog === 'both' || sideOf(p) === S.fog || (x != null && seen(x, y)),
  };
}
const mapX = x => (x - 64) / 128 * 100, mapY = y => (192 - y) / 128 * 100;
const WARD_LIFE = { obs: 360, sen: 420 };

const PB = {}; // hero tracks per match, in memory only (~500 KB each)
async function stratzPlayback(m) {
  if (PB[m.match_id]) return PB[m.match_id];
  const acc = (m.players.find(p => p.account_id === S.playerId) || m.players.find(p => p.account_id && p.account_id < 4294967295))?.account_id;
  if (!acc) return null;
  const d = await stratzQ(`{ player(steamAccountId: ${acc}) { matches(request: { matchIds: [${m.match_id}], take: 1 }) { players { playerSlot playbackData { playerUpdatePositionEvents { time x y } } } } } }`);
  const ps = d.player?.matches?.[0]?.players;
  if (!ps?.some(p => p.playbackData?.playerUpdatePositionEvents?.length)) return null;
  return PB[m.match_id] = Object.fromEntries(ps.map(p => [p.playerSlot, (p.playbackData?.playerUpdatePositionEvents || []).map(e => [e.time, mapX(e.x), mapY(e.y)])]));
}
const WALK = 3.4; // map % per second, roughly hero move speed
function heroAt(tr, t) {
  if (!tr?.length) return null;
  let lo = 0, hi = tr.length - 1;
  if (t <= tr[0][0]) return tr[0];
  if (t >= tr[hi][0]) return tr[hi];
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (tr[mid][0] <= t) lo = mid; else hi = mid; }
  const [, xa, ya] = tr[lo], [tb, xb, yb] = tr[hi], dist = Math.hypot(xb - xa, yb - ya);
  if (dist > 1.6 * WALK * (tb - tr[lo][0])) return tr[lo]; // teleport or blink: snap when the next point arrives
  const move = dist / WALK, k = move ? Math.max(0, (t - (tb - move)) / move) : 0; // stand still, then walk to the next point
  return [t, xa + (xb - xa) * k, ya + (yb - ya) * k];
}
function isDead(p, t) {
  const death = (p.deaths_t || []).find(([dt, dur]) => dt <= t && t < dt + dur);
  const bought = death && (p.buyback_t || []).some(b => b >= death[0] && b <= t);
  return death && !bought ? death : null;
}
const heroIconUrl = id => S.heroes[id]?.icon ? CDN + S.heroes[id].icon : heroImg(id);
const heroByNpc = npc => Object.values(S.heroes).find(h => h.name === npc);

function buildingName(k) {
  const side = k.includes('goodguys') ? 'Radiant' : 'Dire';
  const lane = /_top/.test(k) ? L(' верх', ' top') : /_mid/.test(k) ? L(' мид', ' mid') : /_bot/.test(k) ? L(' низ', ' bot') : '';
  const t = k.match(/tower(\d)/);
  const what = t ? `T${t[1]}` : /melee_rax/.test(k) ? L('бараки ближнего боя', 'melee barracks') : /range_rax/.test(k) ? L('бараки дальнего боя', 'ranged barracks') : /fort/.test(k) ? L('трон', 'Ancient') : L('здание', 'building');
  return `${what}${lane} ${side}`;
}

function laneSpot(lp) {
  if (!lp) return null;
  const xs = [], ys = [];
  for (const x in lp) for (const y in lp[x]) { xs.push([+x, lp[x][y]]); ys.push([+y, lp[x][y]]); }
  if (!xs.length) return null;
  const med = arr => { arr.sort((a, b) => a[0] - b[0]); const half = arr.reduce((s, a) => s + a[1], 0) / 2; let acc = 0; for (const [v, c] of arr) { acc += c; if (acc >= half) return v; } return arr[0][0]; };
  return { x: mapX(med(xs)), y: mapY(med(ys)) };
}

function mapData(m) {
  const { mine, sign, myRad } = teams(m);
  const ours = new Set(mine);
  const wards = [];
  for (const p of m.players) for (const type of ['obs', 'sen']) {
    const leftBy = new Map((p[type + '_left'] || []).map(([t, eh, by]) => [eh, [t, by]]));
    for (const [t, x, y, eh] of p[type] || []) {
      const l = leftBy.get(eh), end = l ? l[0] : t + WARD_LIFE[type];
      wards.push({ type, t, end, x: mapX(x), y: mapY(y), p, ours: ours.has(p), killer: l && l[1] && end < t + WARD_LIFE[type] - 3 ? heroByNpc(l[1]) : null });
    }
  }
  const fights = (m.teamfights || []).map(f => {
    const deaths = [];
    f.players.forEach((fp, i) => {
      const p = m.players[i];
      for (const x in fp.deaths_pos || {}) for (const y in fp.deaths_pos[x]) deaths.push({ p, x: mapX(+x), y: mapY(+y), ours: ours.has(p) });
    });
    const swing = f.players.reduce((s, fp, i) => s + (ours.has(m.players[i]) ? 1 : -1) * (fp.gold_delta || 0), 0);
    return { start: f.start, end: f.end, deaths, swing };
  });
  const lanes = m.players.map(p => ({ p, ours: ours.has(p), spot: laneSpot(p.lane_pos) })).filter(l => l.spot);
  const roshans = (m.objectives || []).map(o => ({ t: o.time, ours: (o.team === 2) === myRad }));
  const buildings = (m.buildings || []).map(b => ({ t: b.time, name: buildingName(b.key), ours: b.key.includes('goodguys') !== myRad }));
  return { wards, fights, lanes, roshans, buildings, sign };
}

function renderMap(m) {
  if (!m.version) {
    $('dlgBody').innerHTML = parseBlock(m);
    wireParse(m);
    return;
  }
  const d = mapData(m), dur = m.duration, pctT = t => Math.min(100, Math.max(0, t / dur * 100));
  S.map = { m, d };
  const marks = [
    ...d.fights.map(f => `<button class="tl-fight ${f.swing >= 0 ? 'win' : 'loss'}" data-t="${f.start}" style="left:${pctT(f.start)}%;width:${Math.max(0.6, pctT(f.end) - pctT(f.start))}%" title="${L('Драка', 'Fight')} ${mmss(f.start)}: ${f.swing >= 0 ? L('выиграна', 'won') : L('проиграна', 'lost')}" aria-label="${L('Перейти к драке на', 'Jump to fight at')} ${mmss(f.start)}"></button>`),
    ...d.roshans.map(r => `<i class="tl-rosh ${r.ours ? 'win' : 'loss'}" style="left:${pctT(r.t)}%" title="${L('Рошан', 'Roshan')} ${mmss(r.t)}: ${r.ours ? L('ваш', 'yours') : L('вражеский', 'enemy')}">R</i>`),
    ...d.wards.map(w => `<i class="tl-ward ${w.ours ? 'win' : 'loss'}" style="left:${pctT(w.t)}%"></i>`),
  ].join('');
  $('dlgBody').innerHTML = `
    <div class="section"><h3 class="section-title">${L('Карта матча', 'Match map')}</h3>      <div class="map-wrap">
        <div class="map-col">
          <div class="tb card">
            <div class="tb-team">${m.players.filter(p => p.isRadiant).map(tbHero).join('')}</div>
            <div class="tb-center"><div class="tb-score"><span class="tb-k" id="tbR">0</span><span id="tbClock">0:00</span><span class="tb-k" id="tbD">0</span></div><div class="tb-adv" id="tbAdv"></div></div>
            <div class="tb-team">${m.players.filter(p => !p.isRadiant).map(tbHero).join('')}</div>
          </div>
          <div class="map card"><img src="${MAP_IMG}" alt="${L('Карта Dota 2', 'Dota 2 map')}" width="900" height="900"><svg id="mapSvg" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="${L('Варды, позиции на линии и смерти на выбранную минуту', 'Wards, lane positions, and deaths at the selected minute')}"></svg><svg id="heroSvg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"></svg></div>
          <div class="timeline card">
            <button class="btn small" id="mapPlay" aria-label="${L('Проиграть матч', 'Play the match')}">${icon('play')}</button>
            <div class="tl-track"><div class="tl-marks">${marks}</div><input type="range" id="mapTime" min="0" max="${dur}" value="0" step="1" aria-label="${L('Время матча', 'Match time')}"></div>
            <select id="mapSpeed" class="field tl-speed" aria-label="${L('Скорость', 'Speed')}"><option value="5">×5</option><option value="15" selected>×15</option><option value="30">×30</option><option value="60">×60</option></select>
          </div>
        </div>
        <div class="map-side card">
          <div class="map-clock" id="mapClock">0:00</div>
          <div class="tabs" id="fogTabs" role="tablist" aria-label="${L('Туман войны', 'Fog of war')}">${[['both', L('Обе', 'Both')], ['rad', 'Radiant'], ['dire', 'Dire'], ['off', L('Без тумана', 'No fog')]].map(([f, label]) => `<button class="tab" data-f="${f}" aria-selected="${f === S.fog}">${label}</button>`).join('')}</div>
          <div class="note" id="pbStatus"></div>
          <div id="mapStats" class="map-stats"></div>
          <div class="label">${L('События рядом', 'Nearby events')}</div>
          <div id="mapEvents" class="map-events"></div>
        </div>
      </div>
      <div class="legend">
        <span><i style="background:var(--good)"></i>${L('ваши', 'yours')}</span><span><i style="background:var(--bad)"></i>${L('враги', 'enemies')}</span>
        <span>${L('● обс', '● observer')}</span><span>${L('◆ сентри', '◆ sentry')}</span><span>${L('✕ смерть', '✕ death')}</span><span>${L('R Рошан', 'R Roshan')}</span>
      </div>
    </div>`;
  $('mapTime').addEventListener('input', e => { stopMap(); drawMap(+e.target.value); });
  $('mapPlay').addEventListener('click', () => (S.mapTimer ? stopMap() : playMap()));
  $('dlgBody').querySelectorAll('.tl-fight').forEach(b => b.addEventListener('click', () => { stopMap(); setMapTime(+b.dataset.t); }));
  $('fogTabs').querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => {
    S.fog = b.dataset.f; store.set('fog', S.fog);
    $('fogTabs').querySelectorAll('.tab').forEach(x => x.setAttribute('aria-selected', String(x === b)));
    drawMap(+$('mapTime').value);
  }));
  drawMap(0);
  loadTracks(m);
}

function loadTracks(m) {
  const status = txt => { const el = $('pbStatus'); if (el) el.textContent = txt; };
  if (!stratzToken()) return status(L('Передвижения героев: подключи Stratz (ключ в шапке)', 'Hero movement: connect Stratz (key icon at the top)'));
  status(L('Загружаю передвижения…', 'Loading movement…'));
  stratzPlayback(m).then(pb => {
    if (S.map?.m !== m || !$('heroSvg')) return;
    if (!pb) return status(L('Stratz ещё не обработал этот матч', 'Stratz hasn\'t processed this match yet'));
    const { mine } = teams(m), ours = new Set(mine);
    $('heroSvg').innerHTML = m.players.map(p => `<g data-slot="${p.player_slot}" style="display:none"><circle r="2.75" fill="#0a0c10"/><image href="${heroIconUrl(p.hero_id)}" x="-2.25" y="-2.25" width="4.5" height="4.5"/><circle r="2.6" fill="none" stroke="${ours.has(p) ? 'var(--good)' : 'var(--bad)'}" stroke-width="${p.account_id === S.playerId ? .8 : .45}"/></g>`).join('');
    S.map.pb = pb;
    S.map.els = m.players.map(p => [p, $('heroSvg').querySelector(`[data-slot="${p.player_slot}"]`)]);
    status('');
    drawMap(+$('mapTime').value);
  }).catch(() => status(L('Не удалось загрузить передвижения', 'Couldn\'t load movement')));
}

function drawHeroes(t) {
  const { pb, els, shown } = S.map || {};
  if (!pb || !els) return;
  for (const [p, g] of els) {
    const h = !isDead(p, t) && heroAt(pb[p.player_slot], t);
    const vis = h && (!shown || shown(p, h[1], h[2]));
    g.style.display = vis ? '' : 'none';
    if (vis) g.setAttribute('transform', `translate(${h[1].toFixed(2)} ${h[2].toFixed(2)})`);
  }
}

const tbHero = p => `<div class="tb-hero ${p.account_id === S.playerId ? 'me' : ''}" data-slot="${p.player_slot}" title="${esc(heroName(p.hero_id))}${p.personaname ? ' · ' + esc(p.personaname) : ''}"><span class="tb-pic"><img src="${heroImg(p.hero_id)}" alt="${esc(heroName(p.hero_id))}" width="48" height="27"><b class="tb-timer"></b></span><span class="tb-gold"></span></div>`;

function drawTopbar(m, t) {
  const min = Math.floor(t / 60);
  let rk = 0, dk = 0;
  for (const p of m.players) {
    const d = (p.deaths_t || []).filter(([dt]) => dt <= t).length;
    if (p.isRadiant) dk += d; else rk += d;
    const el = document.querySelector(`.tb-hero[data-slot="${p.player_slot}"]`);
    if (!el) continue;
    const death = (p.deaths_t || []).find(([dt, dur]) => dt <= t && t < dt + dur);
    const dead = isDead(p, t), bought = death && !dead;
    el.classList.toggle('dead', !!dead);
    el.querySelector('.tb-timer').textContent = dead ? Math.ceil(death[0] + death[1] - t) : bought ? L('выкуп', 'buyback') : '';
    const g = p.gold_t?.[Math.min(p.gold_t.length - 1, min)];
    el.querySelector('.tb-gold').textContent = g != null ? fmt(g) : '';
  }
  $('tbR').textContent = rk; $('tbD').textContent = dk;
  $('tbClock').textContent = mmss(Math.floor(t));
  const adv = m.radiant_gold_adv?.[Math.min(m.radiant_gold_adv.length - 1, min)];
  const myRad = teams(m).myRad;
  $('tbAdv').innerHTML = adv == null ? '' : adv === 0 ? L('Золото поровну', 'Gold even') : `<span class="${(adv > 0) === myRad ? 'pos' : 'neg'}">${adv > 0 ? '◀' : ''} +${fmt(Math.abs(adv))} ${adv > 0 ? '' : '▶'}</span>`;
}

function setMapTime(t) { $('mapTime').value = t; drawMap(t); }
function stopMap() { cancelAnimationFrame(S.mapTimer); S.mapTimer = null; const b = $('mapPlay'); if (b) b.innerHTML = icon('play'); }
function playMap() {
  const dur = S.map.m.duration;
  let t = +$('mapTime').value, last = performance.now(), drawn = 0;
  if (t >= dur) t = 0;
  $('mapPlay').innerHTML = icon('pause');
  const step = now => {
    if (!$('mapTime')) return stopMap();
    t = Math.min(dur, t + (now - last) / 1000 * +$('mapSpeed').value); last = now;
    $('mapTime').value = t;
    if (now - drawn > 100 || t >= dur) { drawMap(t); drawn = now; } else drawHeroes(t); // heroes every frame, the rest 10x per second
    if (t >= dur) return stopMap();
    S.mapTimer = requestAnimationFrame(step);
  };
  S.mapTimer = requestAnimationFrame(step);
}

function drawMap(t) {
  const { m, d } = S.map;
  const col = ours => ours ? 'var(--good)' : 'var(--bad)';
  const heroImgTag = (p, x, y, ours, size) => `<image href="${heroIconUrl(p.hero_id)}" x="${x - size / 2}" y="${y - size / 2}" width="${size}" height="${size}"/><circle cx="${x}" cy="${y}" r="${size / 2 + .3}" fill="none" stroke="${col(ours)}" stroke-width=".5"/>`;
  const fog = fogLayer(m, d, t);
  const out = [fog.svg];
  for (const w of d.wards) {
    if (w.t > t || t >= w.end || !fog.shown(w.p)) continue;
    const c = col(w.ours), tip = `<title>${w.type === 'obs' ? L('Обс', 'Observer') : L('Сентри', 'Sentry')}: ${esc(heroName(w.p.hero_id))}, ${mmss(w.t)}${w.killer ? L(`, сломал ${esc(w.killer.localized_name)} на ${mmss(w.end)}`, `, destroyed by ${esc(w.killer.localized_name)} at ${mmss(w.end)}`) : ''}</title>`;
    if (w.type === 'obs') out.push(`<g>${tip}<circle cx="${w.x}" cy="${w.y}" r="9.8" fill="${c}" fill-opacity=".07" stroke="${c}" stroke-opacity=".35" stroke-width=".2"/><circle cx="${w.x}" cy="${w.y}" r="1.1" fill="${c}" stroke="#0a0c10" stroke-width=".35"/></g>`);
    else out.push(`<g>${tip}<rect x="${w.x - .8}" y="${w.y - .8}" width="1.6" height="1.6" transform="rotate(45 ${w.x} ${w.y})" fill="${c}" stroke="#0a0c10" stroke-width=".3"/></g>`);
  }
  if (t <= 600 && !S.map.pb) for (const l of d.lanes.filter(l => fog.shown(l.p, l.spot.x, l.spot.y))) out.push(`<g opacity=".9"><title>${esc(heroName(l.p.hero_id))}: ${L('примерно где стоял на линии', 'approximate laning spot')}</title>${heroImgTag(l.p, l.spot.x, l.spot.y, l.ours, 3.6)}</g>`);
  for (const f of d.fights) {
    if (t < f.start - 3 || t > f.end + 12) continue;
    for (const dd of f.deaths.filter(dd => fog.shown(dd.p, dd.x, dd.y))) out.push(`<g><title>${esc(heroName(dd.p.hero_id))} ${L('погиб в драке на', 'died in the fight at')} ${mmss(f.start)}</title>${heroImgTag(dd.p, dd.x, dd.y, dd.ours, 4.2)}<path d="M${dd.x - 1.4} ${dd.y - 1.4}l2.8 2.8m0 -2.8l-2.8 2.8" stroke="#fff" stroke-width=".6" stroke-linecap="round"/></g>`);
  }
  $('mapSvg').innerHTML = out.join('');
  S.map.shown = fog.shown;
  drawHeroes(t);
  $('mapClock').textContent = mmss(Math.floor(t));
  drawTopbar(m, t);

  const active = d.wards.filter(w => w.t <= t && t < w.end);
  const cnt = (ours, type) => active.filter(w => w.ours === ours && w.type === type).length;
  const adv = m.radiant_gold_adv?.[Math.min(m.radiant_gold_adv.length - 1, Math.floor(t / 60))];
  $('mapStats').innerHTML = `
    <div>${Math.floor(t / 300) % 2 === 0 ? L('☀ День', '☀ Day') : L('☾ Ночь', '☾ Night')}</div>
    <div><span class="pos">${L('Ваши варды', 'Your wards')}</span> ${cnt(true, 'obs')} ${L('обс', 'obs')} · ${cnt(true, 'sen')} ${L('сентри', 'sentry')}</div>
    <div><span class="neg">${L('Вражеские', 'Enemy wards')}</span> ${cnt(false, 'obs')} ${L('обс', 'obs')} · ${cnt(false, 'sen')} ${L('сентри', 'sentry')}</div>
    ${adv != null ? `<div>${L('Золото', 'Gold')}: <b class="${signCls(adv * d.sign)}">${adv * d.sign >= 0 ? '+' : '−'}${fmt(Math.abs(adv))}</b></div>` : ''}`;

  const ev = [
    ...d.wards.map(w => ({ t: w.t, ours: w.ours, html: `${heroIcon(w.p.hero_id)} ${L('ставит', 'places')} ${w.type === 'obs' ? L('обс', 'obs') : L('сентри', 'sentry')}` })),
    ...d.wards.filter(w => w.killer).map(w => ({ t: w.end, ours: !w.ours, html: `${heroIcon(w.killer.id)} ${L('ломает', 'destroys')} ${w.type === 'obs' ? L('обс', 'obs') : L('сентри', 'sentry')}` })),
    ...d.fights.map(f => ({ t: f.start, ours: f.swing >= 0, html: `${L('Драка', 'Fight')}: ${f.swing >= 0 ? L('выиграна', 'won') : L('проиграна', 'lost')}, ${f.deaths.map(x => heroIcon(x.p.hero_id)).join('') || L('без смертей', 'no deaths')}` })),
    ...d.roshans.map(r => ({ t: r.t, ours: r.ours, html: `${L('Рошан', 'Roshan')} ${r.ours ? L('ваш', 'yours') : L('вражеский', 'enemy')}` })),
    ...d.buildings.map(b => ({ t: b.t, ours: b.ours, html: `${L('Разрушено', 'Destroyed')}: ${b.name}` })),
  ].filter(e => Math.abs(e.t - t) <= 90).sort((a, b) => a.t - b.t).slice(0, 14);
  $('mapEvents').innerHTML = ev.length ? ev.map(e => `<button class="map-ev ${e.ours ? 'win' : 'loss'}" data-t="${e.t}"><span class="num">${mmss(e.t)}</span><span class="map-ev-body">${e.html}</span></button>`).join('') : `<div class="dim">${L('В этот момент ничего не происходит.', 'Nothing happens at this moment.')}</div>`;
  $('mapEvents').querySelectorAll('.map-ev').forEach(b => b.addEventListener('click', () => { stopMap(); setMapTime(+b.dataset.t); }));
}

/* ---------- items ---------- */

async function itemTimings(hero, item) {
  const key = `it:${hero}:${item}`;
  const c = store.get(key);
  if (c && Date.now() - c.ts < 3 * 86400000) return c.rows;
  const rows = (await getJSON(`${API}/scenarios/itemTimings?item=${encodeURIComponent(item)}&hero_id=${hero}`)).map(r => ({ time: r.time, games: +r.games, wins: +r.wins })).sort((a, b) => a.time - b.time);
  store.set(key, { ts: Date.now(), rows });
  return rows;
}

function counterItemsFor(enemies, hero) {
  const agg = {};
  for (const e of enemies) {
    for (const [k, lift, obs] of S.meta?.counter_items?.[e] || []) {
      if (!itemByKey(k) || obs < 10) continue;
      const a = agg[k] || (agg[k] = { k, score: 0, vs: [] });
      a.score += (lift - 1) * Math.sqrt(obs);
      a.vs.push([e, lift]);
    }
  }
  const proHero = S.meta?.pro_items?.[hero] || {};
  return Object.values(agg).filter(a => proHero[a.k] || UNIVERSAL_ITEMS.has(a.k)).sort((a, b) => b.score - a.score);
}

const itemWhy = k => ITEM_WHY[k] || (itemByKey(k)?.abilities || []).map(a => a.title).filter(Boolean).join(', ') || '';

async function renderItemsTab(m) {
  const { me, theirs } = teams(m);
  if (!me) { $('dlgBody').innerHTML = `<div class="empty">${L('Тебя нет в этом матче.', 'You\'re not in this match.')}</div>`; return; }
  const h = me.hero_id;
  const bought = new Set([...(me.purchase_log || []).map(e => e[1]), ...finalItems(me)]);
  const pro = S.meta?.pro_items?.[h] || {};
  let html = parseBlock(m);

  html += `<div class="section"><h3 class="section-title">${L('Твой билд на', 'Your build on')} ${esc(heroName(h))}</h3>
    <div class="card pad"><div class="row">${finalItems(me).map(k => `<span class="row">${itemIcon(k)}<span class="note">${esc(itemName(k))}</span></span>`).join('')}${me.item_neutral && S.itemIds?.[me.item_neutral] ? `<span class="row">${itemIcon(S.itemIds[me.item_neutral])}<span class="note">${L('нейтралка', 'neutral item')}</span></span>` : ''}</div></div></div>`;

  const bigs = [];
  if (m.version) {
    const seen = new Set();
    for (const [t, k] of me.purchase_log || []) if (isBigItem(k) && !seen.has(k)) { seen.add(k); bigs.push({ t, k }); }
  }
  if (m.version) html += `<div class="section"><h3 class="section-title">${L('Тайминги', 'Timings')}</h3><div class="card" id="timingRows"><div class="loading"><div class="spinner"></div></div></div></div>`;

  const missing = Object.entries(pro).filter(([k, [rate]]) => rate >= 0.3 && isBigItem(k) && !bought.has(k)).sort((a, b) => b[1][0] - a[1][0]).slice(0, 5);
  html += `<div class="section"><h3 class="section-title">${L('Что обычно собирают про-игроки', 'What pros usually build')}</h3>
    ${Object.keys(pro).length ? `<div class="card">${Object.entries(pro).filter(([k]) => isBigItem(k)).sort((a, b) => b[1][0] - a[1][0]).slice(0, 10).map(([k, [rate, t]]) => `<div class="item-row">${itemIcon(k)}<div><div class="name">${esc(itemName(k))} ${bought.has(k) ? `<span class="chip pos">${L('есть', 'built')}</span>` : ''}</div><div class="why">${L(`в ${(rate * 100).toFixed(0)}% игр, медиана ${mmss(t)}`, `in ${(rate * 100).toFixed(0)}% of games, median ${mmss(t)}`)}</div></div><div></div></div>`).join('')}</div>
    ${missing.length ? `<p class="note">${L('Ты не собрал', 'You skipped')}: ${missing.map(([k]) => esc(itemName(k))).join(', ')}</p>` : ''}` : `<div class="empty">${L('Мало про-игр на этом герое', 'Too few pro games on this hero')}</div>`}</div>`;

  html += proBuilds(h);

  const ci = counterItemsFor(theirs.map(p => p.hero_id), h).slice(0, 8);
  html += `<div class="section"><h3 class="section-title">${L('Предметы против этих врагов', 'Items against these enemies')}</h3>    <div class="card">${ci.length ? ci.map(c => `<div class="item-row">${itemIcon(c.k)}<div><div class="name">${esc(itemName(c.k))} ${bought.has(c.k) ? `<span class="chip pos">${L('куплено', 'bought')}</span>` : ''}</div><div class="why">${esc(itemWhy(c.k))}</div><div class="breakdown" style="margin-top:4px">${c.vs.map(([e, l]) => `<span>${heroImg(e) ? `<img src="${heroImg(e)}" alt="${esc(heroName(e))}" title="${esc(heroName(e))}">` : ''}×${l.toFixed(1)}</span>`).join('')}</div></div><div></div></div>`).join('') : `<div class="empty">${L('Нет данных по этим героям.', 'No data for these heroes.')}</div>`}</div></div>`;

  $('dlgBody').innerHTML = html;
  wireParse(m);

  if (m.version) {
    const rowsHtml = await Promise.all(bigs.slice(0, 8).map(async ({ t, k }) => {
      let pub = '';
      try {
        const rows = (await itemTimings(h, k)).filter(r => r.games >= 20);
        const mine = rows.find(r => r.time >= t);
        const bestR = rows.reduce((a, r) => (r.wins / r.games > (a ? a.wins / a.games : -1) ? r : a), null);
        if (mine) pub = L(`в пабах к ${mmss(mine.time)}: WR ${(mine.wins / mine.games * 100).toFixed(0)}%`, `pubs by ${mmss(mine.time)}: ${(mine.wins / mine.games * 100).toFixed(0)}% WR`) + (bestR && bestR !== mine ? L(`, лучший тайминг к ${mmss(bestR.time)}: ${(bestR.wins / bestR.games * 100).toFixed(0)}%`, `, best timing by ${mmss(bestR.time)}: ${(bestR.wins / bestR.games * 100).toFixed(0)}%`) : '');
      } catch { /* timing data optional */ }
      const pm = pro[k]?.[1];
      const diff = pm != null ? t - pm : null;
      const cls = diff == null ? '' : diff <= 60 ? 'pos' : diff <= 240 ? '' : 'neg';
      return `<div class="item-row">${itemIcon(k)}<div><div class="name">${esc(itemName(k))} · ${mmss(t)}</div><div class="why">${pm != null ? L(`у про медиана ${mmss(pm)}`, `pro median ${mmss(pm)}`) : L('у про редко', 'rare among pros')}${pub ? ' · ' + pub : ''}</div></div><div class="lift ${cls}">${diff == null ? '' : (diff > 0 ? '+' : '−') + mmss(Math.abs(diff))}</div></div>`;
    }));
    const el = $('timingRows');
    if (el) el.innerHTML = rowsHtml.join('') || `<div class="empty">${L('Крупных предметов не было.', 'No big items.')}</div>`;
  }
}

/* ---------- meta view ---------- */

function renderGroupTabs() {
  $('groupTabs').innerHTML = [1, 2, 3, 4].map(g => `<button class="tab" data-g="${g}" aria-selected="${g === S.metaGroup}">${GROUPS[g]}</button>`).join('');
  $('posTabs').innerHTML = [0, 1, 2, 3, 4, 5].map(p => `<button class="tab" data-p="${p}" aria-selected="${p === S.metaPos}">${p ? `${p} · ${POS_NAMES[p]}` : L('Все позиции', 'All positions')}</button>`).join('');
  $('groupTabs').querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => { S.metaGroup = +b.dataset.g; store.set('metaGroup', S.metaGroup); renderMeta(); }));
  $('posTabs').querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => { S.metaPos = +b.dataset.p; renderMeta(); }));
}

async function renderMeta() {
  renderGroupTabs();
  if (!S.meta) { $('metaInfo').textContent = L('Данные меты ещё не собраны.', 'Meta data isn\'t ready yet.'); return; }
  let G;
  try { G = await loadGroup(S.metaGroup); } catch { $('metaInfo').textContent = L('Не удалось загрузить данные ранга.', 'Couldn\'t load data for this rank.'); return; }
  $('metaInfo').textContent = '';
  const pos = S.metaPos;
  const list = Object.keys(S.heroes).map(Number).filter(h => G.idx[h] != null && heroPick(G, h) >= 0.02 && (!pos || posPrior(h)[pos - 1] >= 0.18))
    .sort((a, b) => heroWr(G, b) - heroWr(G, a)).slice(0, 20);
  $('tierTable').innerHTML = `<thead><tr><th>#</th><th>${L('Герой', 'Hero')}</th><th class="num">${L('Винрейт', 'Win rate')}</th><th class="num">${L('Пик', 'Pick')}</th><th class="num">${L('Позиции', 'Positions')}</th><th class="num">${L('Лучше всего в', 'Best at')}</th></tr></thead><tbody>` +
    list.map((h, i) => {
      const pr = posPrior(h); const top = pr.map((v, j) => [j + 1, v]).filter(x => x[1] >= 0.18).sort((a, b) => b[1] - a[1]);
      const curve = DUR_LABELS.map((_, b) => durWr(G, h, b)); const bb = curve.indexOf(Math.max(...curve));
      return `<tr><td class="dim">${i + 1}</td><td>${heroCell(h)}</td><td class="num ${signCls(heroWr(G, h) - .5)}">${(heroWr(G, h) * 100).toFixed(1)}%</td><td class="num muted">${(heroPick(G, h) * 100).toFixed(1)}%</td><td class="num">${top.map(([p]) => `<span class="posb">${p}</span>`).join(' ')}</td><td class="num muted">${DUR_LABELS[bb]} ${L('мин', 'min')}</td></tr>`;
    }).join('') + '</tbody>';
  renderCounterTool(G);
  renderItemHero(G);
}

function heroByName(name) { const n = name.trim().toLowerCase(); return Object.values(S.heroes).find(h => h.localized_name.toLowerCase() === n)?.id; }
function chips(ids, el, onRemove) {
  el.innerHTML = ids.map(id => `<span class="hchip">${heroImg(id) ? `<img src="${heroImg(id)}" alt="">` : ''}${esc(heroName(id))}<button aria-label="${L('Убрать', 'Remove')} ${esc(heroName(id))}" data-id="${id}">×</button></span>`).join('');
  el.querySelectorAll('button').forEach(b => b.addEventListener('click', () => onRemove(+b.dataset.id)));
}

function renderCounterTool(G) {
  const exampleFlag = S.enemies.length && S.enemiesExample;
  chips(S.enemies, $('enemyChips'), id => { S.enemies = S.enemies.filter(x => x !== id); S.enemiesExample = false; renderCounterTool(G); });
  chips(S.allies, $('allyChips'), id => { S.allies = S.allies.filter(x => x !== id); renderCounterTool(G); });
  if (exampleFlag) $('enemyChips').insertAdjacentHTML('beforeend', `<span class="example">${L('пример', 'example')}</span>`);
  if (!S.enemies.length) { $('counterBest').innerHTML = `<div class="empty">${L('Добавь хотя бы одного врага.', 'Add at least one enemy.')}</div>`; $('counterWorst').innerHTML = ''; return; }
  const list = candidates(G, S.metaPos, S.enemies, S.allies, [...S.enemies, ...S.allies]);
  $('counterBest').innerHTML = list.slice(0, 8).map(c => candRow(c)).join('');
  $('counterWorst').innerHTML = list.slice(-5).reverse().map(c => candRow(c)).join('');
}

function renderItemHero(G) {
  const h = S.itemHero;
  if (!h) return;
  $('itemHeroTitle').textContent = `${L('Предметы против', 'Items against')} ${heroName(h)}`;
  const rows = (S.meta?.counter_items?.[h] || []).filter(([k, , obs]) => itemByKey(k) && obs >= 10).slice(0, 10);
  const n = S.meta?.counter_samples?.[h] || 0;
  $('itemCounters').innerHTML = rows.length ? rows.map(([k, lift, obs]) => `<div class="item-row">${itemIcon(k)}<div><div class="name">${esc(itemName(k))}</div><div class="why">${esc(itemWhy(k))}</div></div><div class="lift pos" title="${L(`В ${lift.toFixed(1)} раза чаще обычного · ${obs} из ${Math.round(n / 5)} про-игр`, `${lift.toFixed(1)}× more often than usual · ${obs} of ${Math.round(n / 5)} pro games`)}">×${lift.toFixed(1)}</div></div>`).join('')
    : `<div class="empty">${L('Мало про-игр против этого героя в патче.', 'Too few pro games against this hero this patch.')}</div>`;
  const counters = Object.keys(S.heroes).map(Number).filter(x => x !== h && G.idx[x] != null && heroPick(G, x) >= 0.01).map(x => ({ x, v: adv(G, x, h) })).sort((a, b) => b.v - a.v).slice(0, 8);
  $('heroCounters').innerHTML = counters.map(c => `<div class="item-row"><span>${heroIcon(c.x)}</span><div><div class="name">${esc(heroName(c.x))}</div><div class="why">${L('лучшие позиции', 'best positions')}: ${posPrior(c.x).map((v, j) => [j + 1, v]).filter(z => z[1] >= .18).map(z => z[0]).join(', ')}</div></div><div class="lift pos">${pct(c.v)}</div></div>`).join('');
}

function addHero(input, arr, max) {
  const id = heroByName(input.value);
  if (!id) return false;
  if (!arr.includes(id) && arr.length < max) arr.push(id);
  input.value = '';
  return true;
}
$('enemyInput').addEventListener('change', e => { if (S.enemiesExample) { S.enemies = []; S.enemiesExample = false; } if (addHero(e.target, S.enemies, 5)) renderCounterTool(S.groups[S.metaGroup]); });
$('allyInput').addEventListener('change', e => { if (addHero(e.target, S.allies, 4)) renderCounterTool(S.groups[S.metaGroup]); });
$('itemHeroInput').addEventListener('change', e => { const id = heroByName(e.target.value); if (id) { S.itemHero = id; renderItemHero(S.groups[S.metaGroup]); } });

/* ---------- pro players ---------- */

const PRO_METRIC = {
  gold_per_min: ['gpm', 'GPM'], xp_per_min: ['xpm', 'XPM'], last_hits_per_min: ['lh_min', L('ластхиты в минуту', 'last hits per minute'), false, 1],
  deaths_per_min: ['deaths', L('смерти за игру', 'deaths per game'), true, 1], hero_damage_per_min: ['hd_min', L('урон по героям в минуту', 'hero damage per minute')],
  kills_per_min: ['kills', L('убийства за игру', 'kills per game'), false, 1], assists_per_min: ['assists', L('помощь за игру', 'assists per game'), false, 1],
  tower_damage: ['td', L('урон по башням за игру', 'tower damage per game')],
};
const proAvatar = id => { const a = (S.pros || []).find(p => p.account_id === id)?.avatar; return a ? `<img class="pro-ava" src="${a}" alt="" loading="lazy" width="28" height="28">` : ''; };
const prosAt = pos => (S.pros || []).filter(p => p.pos === pos);
const myMainPos = () => {
  const c = [0, 0, 0, 0, 0, 0];
  Object.values(S.matches || {}).forEach(m => m._me && c[m._me._pos]++);
  return c.indexOf(Math.max(...c.slice(1))) || 1;
};

function proRef(metric) {
  const def = PRO_METRIC[metric], list = prosAt(myMainPos());
  if (!def || !list.length) return '';
  const [field, label, lowerBetter, dec = 0] = def;
  const best = [...list].sort((a, b) => lowerBetter ? a[field] - b[field] : b[field] - a[field])[0];
  const mean = list.reduce((s, p) => s + p[field], 0) / list.length;
  return `<div class="pro-ref">${icon('crown')}<span>${L('Tier 1 на твоей позиции', 'Tier 1 at your position')}, ${label}: ${L('в среднем', 'average')} <b>${mean.toFixed(dec)}</b>, ${esc(best.name)} <b>${best[field].toFixed(dec)}</b></span></div>`;
}

function proBuilds(heroId, limit = 3) {
  const rows = (S.pros || []).flatMap(p => p.heroes.filter(h => h.hero_id === heroId && h.build.length).map(h => ({ p, h }))).sort((a, b) => b.h.games - a.h.games).slice(0, limit);
  if (!rows.length) return '';
  return `<div class="section"><h3 class="label">${L('Как собирают про', 'How pros build it')}</h3><div class="card">${rows.map(({ p, h }) => `
    <div class="pro-build"><div class="pro-name">${proAvatar(p.account_id)}<b>${esc(p.name)}</b><span class="note">${esc(p.team)} · ${h.games} ${L('игр', 'games')} · ${h.wr}%</span></div>
    <div class="build-line">${h.build.map(([k, t]) => `<div class="build-step">${itemIcon(k)}<b>${mmss(t)}</b></div>`).join('')}</div></div>`).join('')}</div></div>`;
}

function renderPros() {
  const box = $('prosBox');
  if (S.pros?.length && !S.items) { loadItems().then(renderPros, () => {}); }
  if (!S.pros?.length) { box.innerHTML = `<div class="empty">${L('Данные по про-игрокам ещё не собраны', 'Pro player data isn\'t ready yet')}</div>`; return; }
  if (!S.proPos) S.proPos = myMainPos();
  const list = prosAt(S.proPos);
  if (!list.some(p => p.account_id === S.proId)) S.proId = list[0]?.account_id;
  $('proPosTabs').innerHTML = [1, 2, 3, 4, 5].map(p => `<button class="tab" data-p="${p}" aria-selected="${p === S.proPos}">${p} · ${POS_NAMES[p]}</button>`).join('');
  $('proPosTabs').querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => { S.proPos = +b.dataset.p; renderPros(); revealList($('prosBox').children); }));
  const p = list.find(x => x.account_id === S.proId);
  const sit = (label, [n, wr]) => n ? `<div class="sit"><span class="note">${label}</span><b class="${wr >= 50 ? 'pos' : 'neg'}">${wr}%</b><span class="dim">${n} ${L('игр', 'games')}</span></div>` : '';
  const phaseMax = Math.max(...(p?.farm_phases || []).filter(Boolean), 1);
  box.innerHTML = `
    <div class="pro-cards">${list.map(x => `<button class="card pro-card ${x.account_id === S.proId ? 'active' : ''}" data-id="${x.account_id}"><span class="pro-head">${x.avatar ? `<img class="pro-ava big" src="${x.avatar}" alt="" loading="lazy" width="40" height="40">` : ''}<span><b>${esc(x.name)}</b><span class="note">${esc(x.team)}</span></span></span><span class="pro-card-stats"><span>${x.wr}%</span><span>${x.gpm} GPM</span></span></button>`).join('')}</div>
    ${p ? `
    <div class="stats-grid">
      <div class="card stat"><div class="label">${L('Винрейт', 'Win rate')}</div><div class="value" data-count>${p.wr}%</div><div class="sub">${p.games} ${L('игр в патче', 'games this patch')}</div></div>
      <div class="card stat"><div class="label">GPM</div><div class="value" data-count>${p.gpm}</div><div class="sub">${p.xpm} XPM</div></div>
      <div class="card stat"><div class="label">${L('Ластхиты', 'Last hits')}</div><div class="value" data-count>${p.lh_min}</div><div class="sub">${L('в минуту', 'per minute')}</div></div>
      <div class="card stat"><div class="label">K / D / A</div><div class="value kda">${p.kills} / ${p.deaths} / ${p.assists}</div><div class="sub">${L('за игру', 'per game')}</div></div>
      <div class="card stat"><div class="label">${L('Урон по героям', 'Hero damage')}</div><div class="value" data-count>${p.hd_min}</div><div class="sub">${L('в минуту', 'per minute')}</div></div>
      <div class="card stat"><div class="label">${L('Урон по башням', 'Tower damage')}</div><div class="value">${fmt(p.td)}</div><div class="sub">${L('за игру', 'per game')}</div></div>
    </div>
    <div class="two-col">
      <div class="section"><h3 class="label">${L('Фарм по фазам игры, GPM', 'Farm by game phase, GPM')}</h3><div class="card bench-list">${['0–10', '10–20', '20–30', '30–40'].map((lbl, i) => p.farm_phases[i] == null ? '' : `<div class="bench"><span>${lbl} ${L('мин', 'min')}</span><div class="track"><div class="fill" style="width:${(p.farm_phases[i] / phaseMax * 100).toFixed(0)}%;background:var(--accent)"></div></div><span class="num">${p.farm_phases[i]}</span></div>`).join('')}</div></div>
      <div class="section"><h3 class="label">${L('Ситуации', 'Situations')}</h3><div class="card pad sits">
        ${sit(L('Игры до 35 мин', 'Games under 35 min'), p.situations.short)}${sit(L('Игры от 45 мин', 'Games over 45 min'), p.situations.long)}
        ${sit(L('Отставали на 15 мин', 'Behind at 15 min'), p.situations.behind)}${sit(L('Вели на 15 мин', 'Ahead at 15 min'), p.situations.ahead)}
      </div></div>
    </div>
    <div class="two-col">
      <div class="section"><h3 class="label">${L('Пики силы', 'Power spikes')}</h3><div class="card pad sits">
        ${p.kill_peak != null ? `<div class="sit"><span class="note">${L('Больше всего убивает', 'Most kills at')}</span><b>${p.kill_peak * 5}–${p.kill_peak * 5 + 5} ${L('мин', 'min')}</b></div>` : ''}
        ${sit(L('Первый предмет раньше обычного', 'First item faster than usual'), p.spike.fast)}${sit(L('Первый предмет позже обычного', 'First item slower than usual'), p.spike.slow)}
      </div></div>
      <div class="section"><h3 class="label">${L('Матчапы', 'Matchups')}</h3><div class="card pad matchups">
        <div><span class="note">${L('Лучше всего против', 'Best against')}</span><div class="row">${p.best_vs.map(([h, g, wr]) => `<span class="hchip" title="${esc(heroName(h))} · ${g} ${L('игр', 'games')}">${heroImg(h) ? `<img src="${heroImg(h)}" alt="">` : ''}<span class="pos">${wr}%</span><span class="dim">${g}</span></span>`).join('')}</div></div>
        <div><span class="note">${L('Хуже всего против', 'Worst against')}</span><div class="row">${p.worst_vs.map(([h, g, wr]) => `<span class="hchip" title="${esc(heroName(h))} · ${g} ${L('игр', 'games')}">${heroImg(h) ? `<img src="${heroImg(h)}" alt="">` : ''}<span class="neg">${wr}%</span><span class="dim">${g}</span></span>`).join('')}</div></div>
      </div></div>
    </div>
    <div class="section"><h3 class="label">${L('Герои и сборки', 'Heroes and builds')}</h3><div class="card">${p.heroes.map(h => `
      <div class="pro-build"><div class="pro-name">${heroCell(h.hero_id)}<span class="note">${h.games} ${L('игр', 'games')} · ${h.wr}% · ${h.gpm} GPM</span></div>
      <div class="build-line">${h.build.map(([k, t, r]) => `<div class="build-step" title="${Math.round(r * 100)}%">${itemIcon(k)}<b>${mmss(t)}</b></div>`).join('')}</div></div>`).join('')}</div></div>` : ''}`;
  box.querySelectorAll('.pro-card').forEach(b => b.addEventListener('click', () => { S.proId = +b.dataset.id; renderPros(); countUp($('prosBox')); fillIn($('prosBox')); }));
  countUp(box); fillIn(box);
}

/* ---------- learn view ---------- */

const LESSONS = {
  gold_per_min: {
    tips: EN ? ['Take the nearest jungle camp between lane waves', 'Right after a fight, go to a free lane instead of standing around', 'Get your farming item earlier if your hero uses one'] : ['Между волнами бери ближайший лесной лагерь', 'После драки сразу иди на свободную линию, а не стой', 'Если герою подходит предмет на фарм, бери его раньше'],
    drill: L('Смотри на золото на 10:00 в каждой игре. Цель: +50 GPM за 10 игр', 'Check your gold at 10:00 every game. Goal: +50 GPM over 10 games'),
  },
  last_hits_per_min: {
    tips: EN ? ['Only hit creeps to last hit, don\'t push the wave', 'Keep the wave close to your tower', 'Pull or stack a camp to reset a bad wave'] : ['Бей крипа только на добивание, не толкай волну', 'Держи волну ближе к своей башне', 'Пулл или стак лагеря помогает сбросить плохую волну'],
    drill: L('Демо-режим, 5 минут без способностей. Цель: 40 ластхитов к 5:00', 'Demo mode, 5 minutes without spells. Goal: 40 last hits by 5:00'),
  },
  xp_per_min: {
    tips: EN ? ['Stay in XP range even when you can\'t last hit', 'Don\'t leave lane before level 6 without a reason', 'Every death costs XP and minutes of farm'] : ['Стой в радиусе опыта, даже если не добиваешь', 'Не уходи с линии до 6 уровня без причины', 'Каждая смерть стоит опыта и минут фарма'],
    drill: L('Цель: 6 уровень до 7:00 на коре, до 9:00 на саппорте', 'Goal: level 6 before 7:00 on core, before 9:00 on support'),
  },
  deaths_per_min: {
    tips: EN ? ['Before entering fog, count how many enemies are visible on the minimap', 'Always keep a TP scroll', 'If 3+ enemies are missing, farm on your side of the map', 'Buy a save item earlier: BKB, Force Staff, Glimmer'] : ['Перед выходом в туман посчитай, сколько врагов видно на мини-карте', 'ТП всегда в слоте', 'Если 3+ врага пропали, фарми на своей половине карты', 'Бери сейв-предмет раньше: BKB, Force Staff, Glimmer'],
    drill: L('Цель: не больше 5 смертей за игру в следующих 10 играх', 'Goal: 5 or fewer deaths per game over the next 10 games'),
  },
  hero_damage_per_min: {
    tips: EN ? ['Stand where you can hit for the whole fight', 'Aim spells to hit several heroes', 'Show up to fights at your timing: level 6 and your key item'] : ['Становись так, чтобы бить всю драку', 'Целься способностями в нескольких героев', 'Приходи на драки в свой тайминг: 6 уровень и ключевой предмет'],
    drill: L('После каждой драки проверь, успел ли ты прожать все способности', 'After every fight, check whether you used all your spells'),
  },
  kills_per_min: {
    tips: EN ? ['Look for pickoffs when you spike: level 6, key item', 'Smoke with your team instead of farming alone', 'TP onto low-HP enemies under your tower'] : ['Ищи убийства на своём пике: 6 уровень, ключевой предмет', 'Ходи в смоки с командой вместо одиночного фарма', 'Прилетай ТП на раненых врагов под своей башней'],
    drill: L('Каждые 5 минут спрашивай себя: где сейчас можно убить?', 'Every 5 minutes ask yourself: where can we get a kill right now?'),
  },
  assists_per_min: {
    tips: EN ? ['Watch fights on the minimap and TP in', 'As a support, rotate after level 6', 'Stay near your cores in the mid game'] : ['Следи за драками на мини-карте и прилетай ТП', 'На саппорте ротируй после 6 уровня', 'В мид-гейме держись рядом со своими корами'],
    drill: L('Цель: участие в драках 60%+ в следующих играх', 'Goal: 60%+ fight participation in your next games'),
  },
  tower_damage: {
    tips: EN ? ['After a won fight, hit a tower instead of the jungle', 'Push with a creep wave, not alone', 'Towers and Roshan are the real reward for a fight'] : ['После выигранной драки бей башню, а не лес', 'Пушь вместе с волной крипов, а не один', 'Башни и Рошан — главная награда за драку'],
    drill: L('После каждой выигранной драки — хотя бы одна башня', 'After every won fight, take at least one tower'),
  },
};

const POS_GUIDE = {
  1: EN ? [['Lane', ['Last hit every creep, deny your own', 'Keep the wave near your tower', 'Avoid fights: your goal is levels and items']], ['Mid game', ['Farm the jungle between waves', 'Join fights once you have your key item', 'Don\'t farm the enemy jungle without vision']], ['Late game', ['Stay with your team, hit from a safe spot', 'Always keep buyback gold', 'After a won fight: Roshan and barracks']]]
    : [['Линия', ['Добивай каждого крипа, денай своих', 'Держи волну у своей башни', 'Не дерись без нужды: цель — уровень и предмет']], ['Середина', ['Фарми лес между волнами', 'Иди в драку, когда есть ключевой предмет', 'Не фарми вражеский лес без вижна']], ['Поздняя игра', ['Держись с командой, бей с безопасной позиции', 'Всегда держи золото на выкуп', 'После выигранной драки — Рошан и бараки']]],
  2: EN ? [['Lane', ['Control runes every 2 minutes', 'Win the last-hit battle', 'Keep your bottle full']], ['Mid game', ['Rotate with a rune to winnable lanes', 'Take towers after kills', 'Press your advantage while you\'re stronger']], ['Late game', ['Hunt enemy supports', 'Don\'t AFK-farm', 'Control the map with your team']]]
    : [['Линия', ['Контролируй руны каждые 2 минуты', 'Выигрывай линию по ластхитам', 'Держи бутылку полной']], ['Середина', ['Ротируй с руной на линии, где можно убить', 'После убийств бери башни', 'Дави, пока ты сильнее']], ['Поздняя игра', ['Охоться на вражеских саппортов', 'Не уходи в долгий фарм', 'Контролируй карту вместе с командой']]],
  3: EN ? [['Lane', ['Your goal is XP, not last hits', 'Harass the enemy carry', 'Don\'t die: offlane deaths snowball']], ['Mid game', ['Initiate fights', 'Buy team items: Pipe, Crimson, Blink', 'Make space for your carry']], ['Late game', ['Go in first and soak the enemy disables', 'Keep auras and saves ready', 'Split push while the enemy is busy']]]
    : [['Линия', ['Цель — опыт, а не ластхиты', 'Мешай вражескому керри добивать', 'Не умирай: смерти на оффлейне копятся']], ['Середина', ['Инициируй драки', 'Покупай предметы для команды: Pipe, Crimson, Blink', 'Давай пространство своему керри']], ['Поздняя игра', ['Входи первым и забирай контроль врага', 'Держи ауры и сейвы готовыми', 'Сплитпушь, пока враг занят']]],
  4: EN ? [['Lane', ['Help your offlaner, harass the enemy support', 'Stack camps at :53', 'Look for mid kills with the rune']], ['Mid game', ['Rotate and ward for smokes', 'Be where the next fight will be', 'Save up for Blink or Force']], ['Late game', ['Save your cores, land your disables', 'Keep vision around Roshan', 'Don\'t farm when enemy cores are more dangerous']]]
    : [['Линия', ['Помогай оффлейнеру, гоняй вражеского саппорта', 'Стакай лагеря на :53', 'Ищи убийства на миде с руной']], ['Середина', ['Ротируй и ставь варды для смоков', 'Будь там, где будет драка', 'Копи на Blink или Force']], ['Поздняя игра', ['Сейвь коров, прожимай контроль', 'Держи вижн вокруг Рошана', 'Не фарми, когда вражеские коры опаснее']]],
  5: EN ? [['Lane', ['Block the first wave, pull camps', 'Ward your lane and your jungle', 'Give XP to your carry, watch their HP']], ['Mid game', ['Place observers before every fight', 'Sentries against invisible heroes', 'Stay behind your cores']], ['Late game', ['Vision around Roshan and base exits', 'Save items: Glimmer, Force, Lotus', 'Die last, not first']]]
    : [['Линия', ['Блокируй первую волну, пулляй лагеря', 'Варды на линии и в своём лесу', 'Отдавай опыт керри, следи за его здоровьем']], ['Середина', ['Обс-варды до каждой драки', 'Сентри против невидимых', 'Держись за спиной своих коров']], ['Поздняя игра', ['Вижн вокруг Рошана и выходов из базы', 'Сейв-предметы: Glimmer, Force, Lotus', 'Умирай последним, а не первым']]],
};

function renderLearn() {
  const mine = Object.values(S.matches || {}).filter(m => m._me);
  if (mine.length < 3) {
    $('planBox').innerHTML = `<div class="card issue info">${sevIcon('info')}<div class="body"><div class="title">${L('Сначала проанализируй свой профиль', 'Analyze your profile first')}</div></div><a class="btn small" href="#player">${L('К анализу', 'Go to analysis')}</a></div>`;
  } else {
    const roles = mine.reduce((a, m) => (a[m._me._role]++, a), { core: 0, support: 0 });
    const role = roles.support > roles.core ? 'support' : 'core';
    const rows = Object.keys(WEIGHTS[role]).map(k => {
      const vals = mine.map(m => ({ m, v: pctOf(m._me, k) })).filter(x => x.v != null).sort((a, b) => a.v - b.v);
      return { k, n: vals.length, avg: vals.reduce((s, x) => s + x.v, 0) / Math.max(1, vals.length), worst: vals.slice(0, 3) };
    }).filter(r => r.n >= 3).sort((a, b) => a.avg - b.avg);
    $('planBox').innerHTML = rows.slice(0, 3).map((r, i) => `
      <div class="card lesson">
        <div class="lesson-head">
          <span class="lesson-n">${i + 1}</span>
          <div class="lesson-title"><b>${METRICS[r.k].name}</b><span class="note">${L(`лучше ${Math.round(r.avg * 100)}% игроков на тех же героях`, `better than ${Math.round(r.avg * 100)}% of players on the same heroes`)}</span></div>
          <div class="ring" style="--p:${Math.round(r.avg * 100)};--c:${r.avg >= .5 ? 'var(--accent)' : 'var(--bad)'}"><span data-count>${Math.round(r.avg * 100)}%</span></div>
        </div>
        <ul class="lesson-tips">${LESSONS[r.k].tips.map(t => `<li>${t}</li>`).join('')}</ul>
        <div class="drill">${icon('target')}<span>${LESSONS[r.k].drill}</span></div>
        ${proRef(r.k)}
        <div class="lesson-games"><span class="label">${L('Худшие игры', 'Worst games')}</span>${r.worst.map(({ m, v }) => `<button class="hchip" data-id="${m.match_id}">${heroImg(m._me.hero_id) ? `<img src="${heroImg(m._me.hero_id)}" alt="">` : ''}<span class="${isWin(m._me) ? 'pos' : 'neg'}">${isWin(m._me) ? '✓' : '✕'}</span>${Math.round(v * 100)}%</button>`).join('')}</div>
      </div>`).join('');
    $('planBox').querySelectorAll('.lesson-games .hchip').forEach(b => b.addEventListener('click', () => openMatch(+b.dataset.id)));
    countUp($('planBox')); fillIn($('planBox'));
  }

  const posCount = [0, 0, 0, 0, 0, 0];
  mine.forEach(m => posCount[m._me._pos]++);
  if (!S.learnPosPicked) S.learnPos = posCount.indexOf(Math.max(...posCount.slice(1))) || 1;
  $('learnPosTabs').innerHTML = [1, 2, 3, 4, 5].map(p => `<button class="tab" data-p="${p}" aria-selected="${p === S.learnPos}">${p} · ${POS_NAMES[p]}</button>`).join('');
  $('learnPosTabs').querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => { S.learnPos = +b.dataset.p; S.learnPosPicked = true; renderLearn(); revealList($('posGuide').children); }));
  $('posGuide').innerHTML = POS_GUIDE[S.learnPos].map(([phase, items]) => `<div class="card pad"><div class="label">${phase}</div><ul class="lesson-tips">${items.map(t => `<li>${t}</li>`).join('')}</ul></div>`).join('');

  if (!S.learnHeroPicked) S.learnHero = [...(S.playerHeroes || [])].sort((a, b) => b.games - a.games)[0]?.hero_id || S.itemHero || 1;
  renderHeroGrid();
  renderHeroGuide();
  renderPros();
}

async function renderHeroGuide() {
  const h = S.learnHero;
  const G = await loadGroup(S.group || 3).catch(() => null);
  await loadItems().catch(() => {});
  if (!S.heroPos) S.heroPos = await getJSON('data/heroes.json').catch(() => ({}));
  const hp = S.heroPos[h] || {}, posList = Object.keys(hp).map(Number).sort((a, b) => hp[b].n - hp[a].n);
  if (!posList.includes(S.guidePos)) S.guidePos = posList.includes(myMainPos()) ? myMainPos() : posList[0];
  const gp = hp[S.guidePos];
  const pro = S.meta?.pro_items?.[h] || {};
  const build = Object.entries(pro).filter(([k, [rate]]) => rate >= 0.12 && itemByKey(k) && (itemByKey(k).cost || 0) >= 1000 && (itemByKey(k).components || k === 'blink')).sort((a, b) => a[1][1] - b[1][1]).slice(0, 9);
  const heroesWith = G ? Object.keys(S.heroes).map(Number).filter(x => x !== h && G.idx[x] != null && heroPick(G, x) >= 0.01) : [];
  const counters = G ? heroesWith.map(x => ({ x, v: adv(G, x, h) })).sort((a, b) => b.v - a.v).slice(0, 5) : [];
  const victims = G ? heroesWith.map(x => ({ x, v: adv(G, h, x) })).sort((a, b) => b.v - a.v).slice(0, 5) : [];
  const curve = G ? DUR_LABELS.map((_, b) => durWr(G, h, b)) : [];
  const peak = curve.length ? curve.indexOf(Math.max(...curve)) : -1;
  const list = (arr) => arr.map(c => `<div class="item-row"><span>${heroIcon(c.x)}</span><div class="name">${esc(heroName(c.x))}</div><div class="lift ${signCls(c.v)}">${pct(c.v)}</div></div>`).join('');
  $('heroGuide').innerHTML = `
    <div class="card pad hero-head">${heroCell(h)}${G ? `<span class="chip pos">${L('Сильнее всего', 'Strongest at')}: ${DUR_LABELS[peak]} ${L('мин', 'min')}</span><span class="note">${L('Винрейт', 'Win rate')} ${(heroWr(G, h) * 100).toFixed(1)}% · ${GROUPS[S.group || 3]}</span>` : ''}</div>
    ${gp ? `<div class="section"><div class="row guide-pos"><h3 class="label">${L('Сборка про на позиции', 'Pro build by position')}</h3><div class="tabs" id="guidePosTabs">${posList.map(p => `<button class="tab" data-p="${p}" aria-selected="${p === S.guidePos}">${p} · ${POS_NAMES[p]}</button>`).join('')}</div></div>
      <div class="card build-line">${gp.build.map(([k, t, r]) => `<div class="build-step">${itemIcon(k)}<b>${mmss(t)}</b><span class="note">${Math.round(r * 100)}%</span></div>`).join('')}</div>
      <p class="note">${L(`${gp.n} про-игр на этой позиции · винрейт ${gp.wr}%`, `${gp.n} pro games in this role · ${gp.wr}% win rate`)}</p></div>
    ${gp.top.length ? `<div class="section"><h3 class="label">${L('Лучшие игроки', 'Best players')}: ${esc(heroName(h))} · ${POS_NAMES[S.guidePos]}</h3><div class="card">${gp.top.map(t => `
      <div class="pro-build"><div class="pro-name">${proAvatar(t.id)}<b>${esc(t.name)}</b><span class="note">${t.team ? esc(t.team) + ' · ' : ''}${t.games} ${L('игр', 'games')} · ${t.wr}%</span></div>
      <div class="build-line">${t.build.map(([k, tm]) => `<div class="build-step">${itemIcon(k)}<b>${mmss(tm)}</b></div>`).join('')}</div></div>`).join('')}</div></div>` : ''}`
    : build.length ? `<div class="section"><h3 class="label">${L('Сборка про-игроков', 'Pro build')}</h3><div class="card build-line">${build.map(([k, [rate, t]]) => `<div class="build-step">${itemIcon(k)}<b>${mmss(t)}</b><span class="note">${Math.round(rate * 100)}%</span></div>`).join('')}</div></div>` : ''}
    <div class="two-col">
      <div class="section"><h3 class="label">${L('Его контрят', 'Countered by')}</h3><div class="card">${list(counters) || `<div class="empty">—</div>`}</div></div>
      <div class="section"><h3 class="label">${L('Он контрит', 'Counters')}</h3><div class="card">${list(victims) || `<div class="empty">—</div>`}</div></div>
    </div>`;
  $('heroGuide').querySelectorAll('#guidePosTabs .tab').forEach(b => b.addEventListener('click', () => { S.guidePos = +b.dataset.p; renderHeroGuide(); }));
  markHeroGrid();
  revealList($('heroGuide').children);
}

const ATTRS = [['str', L('Сила', 'Strength')], ['agi', L('Ловкость', 'Agility')], ['int', L('Интеллект', 'Intelligence')], ['all', L('Универсальные', 'Universal')]];
function renderHeroGrid() {
  const byName = (a, b) => a.localized_name.localeCompare(b.localized_name);
  const btn = h => `<button class="hg" data-id="${h.id}" data-name="${esc(h.localized_name.toLowerCase())}" title="${esc(h.localized_name)}"><img src="${heroImg(h.id)}" alt="${esc(h.localized_name)}" loading="lazy" width="64" height="36"></button>`;
  const mine = [...(S.playerHeroes || [])].sort((a, b) => b.games - a.games).slice(0, 10).map(x => S.heroes[x.hero_id]).filter(Boolean);
  const groups = [...(mine.length ? [['mine', L('Твои герои', 'Your heroes'), mine]] : []), ...ATTRS.map(([a, label]) => [a, label, Object.values(S.heroes).filter(h => h.primary_attr === a).sort(byName)])];
  $('heroGrid').innerHTML = groups.map(([a, label, hs]) => `<div class="hg-group" data-attr="${a}"><div class="hg-label"><i class="attr-${a}"></i>${label}</div><div class="hg-row">${hs.map(btn).join('')}</div></div>`).join('');
  $('heroGrid').querySelectorAll('.hg').forEach(b => b.addEventListener('click', () => pickGuideHero(+b.dataset.id)));
  markHeroGrid();
}
function markHeroGrid() { document.querySelectorAll('#heroGrid .hg').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.id === S.learnHero))); }
function pickGuideHero(id) {
  S.learnHero = id; S.learnHeroPicked = true; S.guidePos = null;
  renderHeroGuide();
  $('heroGuide').scrollIntoView({ behavior: motionOn() ? 'smooth' : 'auto', block: 'start' });
}
$('learnHeroInput').addEventListener('input', e => {
  const q = e.target.value.trim().toLowerCase();
  document.querySelectorAll('#heroGrid .hg').forEach(b => { b.hidden = !!q && !b.dataset.name.includes(q); });
  document.querySelectorAll('#heroGrid .hg-group').forEach(g => { g.hidden = ![...g.querySelectorAll('.hg')].some(b => !b.hidden); });
});
$('learnHeroInput').addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  const first = document.querySelector('#heroGrid .hg:not([hidden])');
  if (first) { e.preventDefault(); pickGuideHero(+first.dataset.id); }
});

/* ---------- router & boot ---------- */

function route() {
  const view = location.hash === '#meta' ? 'meta' : location.hash === '#learn' ? 'learn' : 'player';
  const meta = view === 'meta';
  $('viewPlayer').hidden = view !== 'player'; $('viewMeta').hidden = !meta; $('viewLearn').hidden = view !== 'learn';
  $('navPlayer').setAttribute('aria-current', view === 'player' ? 'page' : 'false');
  $('navMeta').setAttribute('aria-current', meta ? 'page' : 'false');
  $('navLearn').setAttribute('aria-current', view === 'learn' ? 'page' : 'false');
  if (view === 'learn') { renderLearn(); revealList($('viewLearn').children); }
  if (meta) {
    Promise.resolve(S.items || loadItems().catch(() => {})).then(async () => {
      if (S.metaGroup == null) S.metaGroup = store.get('metaGroup') || S.group || 3;
      const G = await loadGroup(S.metaGroup).catch(() => null);
      if (G && !S.enemies.length) {
        S.enemies = Object.keys(S.heroes).map(Number).filter(h => heroPick(G, h) >= 0.08).sort((a, b) => heroPick(G, b) - heroPick(G, a)).slice(0, 2);
        S.enemiesExample = true;
      }
      if (G && !S.itemHero) S.itemHero = Object.keys(S.heroes).map(Number).filter(h => S.meta?.counter_items?.[h]?.length).sort((a, b) => heroPick(G, b) - heroPick(G, a))[0];
      await renderMeta();
      revealList($('viewMeta').children);
    });
  }
}
window.addEventListener('hashchange', route);

function wireKey() {
  const dlg = $('keyDlg'), sync = () => $('keyBtn').classList.toggle('on', !!stratzToken());
  const status = () => { $('keyStatus').textContent = stratzToken() ? L('Токен подключён', 'Token connected') : ''; };
  sync();
  $('keyBtn').addEventListener('click', () => { $('keyInput').value = ''; status(); dlg.showModal(); });
  dlg.addEventListener('close', () => {
    if (dlg.returnValue === 'remove') localStorage.removeItem('stratz');
    else if (dlg.returnValue === 'save' && $('keyInput').value.trim()) store.set('stratz', $('keyInput').value.trim());
    else return;
    sync();
    if (S.playerId) analyze();
  });
}

function applyStaticLang() {
  document.documentElement.lang = LANG;
  $('langBtn').textContent = EN ? 'RU' : 'EN';
  $('langBtn').setAttribute('aria-label', EN ? 'Переключить на русский' : 'Switch to English');
  $('langBtn').addEventListener('click', () => { store.set('lang', EN ? 'ru' : 'en'); location.reload(); });
  if (!EN) return;
  document.querySelectorAll('[data-en]').forEach(el => { el.textContent = el.dataset.en; });
  document.querySelectorAll('[data-en-placeholder]').forEach(el => { el.placeholder = el.dataset.enPlaceholder; });
  document.querySelectorAll('[data-en-aria]').forEach(el => { el.setAttribute('aria-label', el.dataset.enAria); });
}

(async function boot() {
  applyStaticLang();
  wireKey();
  try { await loadBase(); } catch (e) { showError(L('Не удалось загрузить список героев: ', 'Couldn\'t load the hero list: ') + e.message); return; }
  route();
  const last = store.get('lastId');
  if (last && location.hash !== '#meta') { $('steamId').value = last; analyze(); }
})();
