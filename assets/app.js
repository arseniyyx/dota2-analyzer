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
  const [heroStats, meta] = await Promise.all([
    getJSONCached(`${API}/heroStats`, 360),
    getJSON('data/meta.json').catch(() => null),
  ]);
  heroStats.forEach(h => { S.heroes[h.id] = h; });
  S.meta = meta;
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
  return tw ? s / tw * 10 : 0;
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
  m.players.forEach(p => { p.radiant_win = m.radiant_win; p.isRadiant = p.player_slot < 128; });
  const rad = m.players.filter(p => p.isRadiant), dire = m.players.filter(p => !p.isRadiant);
  assignPositions(rad); assignPositions(dire);
  m.players.forEach(p => { p._score = scorePlayer(p); });
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
    const ms = await pool(recent.map(r => () => loadMatch(r.match_id)), 3, d => { $('loadingText').textContent = `${L('Загружаю матчи', 'Loading matches')} ${d}/${recent.length}`; });
    S.matches = {};
    ms.forEach(m => { if (m) S.matches[m.match_id] = prepareMatch(m); });

    renderPeriod();
    renderFlags();
    renderPositions();
    renderMatches();
    $('results').hidden = false;
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
  $('flags').innerHTML = flags.map(f => `<div class="card issue warn">${sevIcon('bad')}<div class="body"><div class="title">${f.title}</div><div class="detail">${f.reasons.join(' · ')}. ${L('Это признаки по статистике, а не доказательство.', 'These are statistical signs, not proof.')}</div></div></div>`).join('')
    + `<p class="note">${L(`MVP матча (лучшая оценка из 10 игроков) в ${mvp} из ${games.length} последних игр, средняя оценка ${avgScore.toFixed(1)} из 10.`, `Match MVP (best score of 10 players) in ${mvp} of the last ${games.length} games, average score ${avgScore.toFixed(1)} of 10.`)}</p>`;
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
    <div class="wl"><div class="big" style="color:${wr >= 52 ? 'var(--good)' : wr >= 48 ? 'var(--fg)' : 'var(--bad)'}">${wr.toFixed(1)}%</div>
    <div class="note"><span class="pos">${wl.win} ${L('побед', 'wins')}</span> · <span class="neg">${wl.lose} ${L('поражений', 'losses')}</span></div></div>`;
}

function renderStats(t) {
  const k = avgOf(t, 'kills'), d = avgOf(t, 'deaths'), a = avgOf(t, 'assists');
  const card = (ic, l, v, s) => `<div class="card stat"><div class="label">${icon(ic)}${l}</div><div class="value">${v}</div><div class="sub">${s}</div></div>`;
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
  const exact = mine.filter(p => p._posExact).length;
  $('posNote').textContent = L(`По последним ${mine.length} матчам. Позиция определена по реплею в ${exact}, в остальных примерно (по героям и золоту в команде). Разбери реплеи внизу, чтобы было точнее.`, `Based on the last ${mine.length} matches. Position comes from the replay in ${exact}, the rest are estimated from heroes and team gold. Parse replays below for more accuracy.`);
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
        <span class="ring" style="--p:${b.n ? b.wr.toFixed(0) : 0};--c:${c}"><span>${b.n ? b.wr.toFixed(0) + '%' : '—'}</span></span>
        <span class="pos-name"><span class="label">Pos ${b.pos}</span><b>${POS_NAMES[b.pos]}</b><span class="note">${b.n} ${L('игр', 'games')}${b.n ? ` · ${L('оценка', 'score')} ${b.score.toFixed(1)}` : ''}</span></span>
      </span>
      <span class="pos-heroes">${b.heroes.map(heroIcon).join('')}</span>
      ${best && b.pos === best.pos ? `<span class="best-tag">${icon('crown')}${L('Лучше всего получается', 'Your best position')}</span>` : ''}
    </button>`;
  }).join('');
  $('positions').querySelectorAll('.pos-card').forEach(b => b.addEventListener('click', () => {
    S.posFilter = +b.dataset.pos;
    renderMatches();
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
    $('metaNote').textContent = L(`Твой винрейт ${periodLabel()} против общего винрейта героя в ${g}. Плюс значит, что ты играешь его лучше среднего.${S.limit === 20 ? ' На 2–3 играх разница сильно зависит от случая.' : ''}`, `Your win rate ${periodLabel()} vs the hero's overall win rate in ${g}. Plus means you play it better than average.${S.limit === 20 ? ' With 2–3 games the difference is mostly luck.' : ''}`);
    const rows = S.playerHeroes.filter(h => h.games >= minGames()).sort((a, b) => b.games - a.games).slice(0, 15);
    $('metaTable').innerHTML = `<thead><tr><th>${L('Герой', 'Hero')}</th><th class="num">${L('Игр', 'Games')}</th><th class="num">${L('Твой WR', 'Your WR')}</th><th class="num">${L('WR в', 'WR in')} ${g}</th><th class="num">${L('Разница', 'Diff')}</th></tr></thead><tbody>` +
      rows.map(h => `<tr><td>${heroCell(h.hero_id)}</td><td class="num">${h.games}</td><td class="num">${myWr(h).toFixed(1)}%</td><td class="num muted">${mwr(h.hero_id).toFixed(1)}%</td><td class="num ${signCls(myWr(h) - mwr(h.hero_id))}">${pct(myWr(h) - mwr(h.hero_id))}</td></tr>`).join('') + '</tbody>';
  } else if (tab === 'meta') {
    $('metaNote').textContent = L(`Самые сильные популярные герои в ${g}. Справа твой опыт на них ${periodLabel()}.`, `The strongest popular heroes in ${g}. On the right, your games on them ${periodLabel()}.`);
    const rows = Object.keys(S.heroes).map(Number).filter(h => heroPick(G, h) >= 0.04).sort((a, b) => heroWr(G, b) - heroWr(G, a)).slice(0, 15);
    $('metaTable').innerHTML = `<thead><tr><th>${L('Герой', 'Hero')}</th><th class="num">${L('WR в', 'WR in')} ${g}</th><th class="num">${L('Пик', 'Pick')}</th><th class="num">${L('Твоих игр', 'Your games')}</th><th class="num">${L('Твой WR', 'Your WR')}</th></tr></thead><tbody>` +
      rows.map(h => { const m = mine[h]; return `<tr><td>${heroCell(h)}</td><td class="num pos">${mwr(h).toFixed(1)}%</td><td class="num muted">${(heroPick(G, h) * 100).toFixed(1)}%</td><td class="num">${m ? m.games : 0}</td><td class="num">${m && m.games >= minGames() ? myWr(m).toFixed(1) + '%' : '<span class="dim">—</span>'}</td></tr>`; }).join('') + '</tbody>';
  } else {
    $('metaNote').textContent = L(`Герои, которые сильны в ${g} и у тебя уже получаются (${periodLabel()}). Их стоит спамить ради рейтинга.`, `Heroes that are strong in ${g} and already work for you (${periodLabel()}). Spam them to climb.`);
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
  $('posFilter').querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => { S.posFilter = +b.dataset.p; renderMatches(); }));
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
    $('parseStatus').textContent = L(`Отправлено на разбор: ${sent}/${ids.length}. Старые реплеи (старше ~2 недель) Valve уже удалила, их не разобрать.`, `Sent for parsing: ${sent}/${ids.length}. Valve deletes replays older than ~2 weeks, those can't be parsed.`);
    await new Promise(r => setTimeout(r, 1100));
  }
  $('parseStatus').textContent = L(`Отправлено на разбор: ${sent}. Обычно это занимает 1–5 минут. Потом нажми «Анализ» ещё раз.`, `Sent for parsing: ${sent}. It usually takes 1–5 minutes. Then press "Analyze" again.`);
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
    return `<div class="card issue info">${sevIcon('info')}<div class="body"><div class="title">${L('Разбор запрошен', 'Parse requested')} ${min < 1 ? L('только что', 'just now') : L(`${min} мин назад`, `${min} min ago`)}</div><div class="detail">${L('Обычно это 1–5 минут. Окно обновится само, нажимать ничего не нужно.', 'It usually takes 1–5 minutes. This view updates by itself.')}</div></div><div class="spinner" style="width:20px;height:20px;border-width:2px"></div></div>`;
  }
  const failed = store.get('pr:' + m.match_id);
  return `<div class="card issue info">${sevIcon('info')}<div class="body"><div class="title">${L('Реплей не разобран', 'Replay not parsed')}</div><div class="detail">${failed ? L('Прошлый запрос за 30 минут так и не дал разбора: скорее всего, Valve уже удалила реплей (они хранятся около двух недель). Можно попробовать ещё раз.', 'The last request didn\'t produce a parse in 30 minutes. Valve has probably deleted the replay (they keep them about two weeks). You can try again.') : L('Без разбора нет позиций по линиям, графика золота, драк и таймингов предметов. Разбор занимает 1–5 минут.', 'Without a parse there are no lane positions, gold graph, fights, or item timings. Parsing takes 1–5 minutes.')}</div></div><button class="btn small" id="parseOne">${L('Разобрать', 'Parse')}</button></div>`;
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
        <p class="note">${L(`Ты на ${esc(heroName(me.hero_id))}, позиция ${me._pos} (${POS_NAMES[me._pos]}${me._posExact ? '' : ', примерно'}), ${rank}-е место из 10 по оценке. Полоса показывает, какую долю игроков на этом герое ты обошёл.`, `You on ${esc(heroName(me.hero_id))}, position ${me._pos} (${POS_NAMES[me._pos]}${me._posExact ? '' : ', estimated'}), rank ${rank} of 10 by score. Each bar shows the share of players on this hero you beat.`)}${extra.length ? ' ' + L('Ещё', 'Also') + ': ' + extra.join(', ') + '.' : ''}</p>
        <div class="card bench-list">${rows.map(r => `<div class="bench"><span>${METRICS[r.k].name}</span><div class="track"><div class="fill" style="width:${(r.v * 100).toFixed(0)}%;background:${r.v >= .6 ? 'var(--good)' : r.v >= .4 ? 'var(--warn)' : 'var(--bad)'}"></div></div><span class="num">${(r.v * 100).toFixed(0)}%</span></div>`).join('')}</div>
        <div class="issue-list">
          ${weak.map(r => `<div class="card issue">${sevIcon('bad')}<div class="body"><div class="title">${METRICS[r.k].name}: ${L(`хуже ${(100 - r.v * 100).toFixed(0)}% игроков`, `worse than ${(100 - r.v * 100).toFixed(0)}% of players`)}</div><div class="detail">${METRICS[r.k].tip}</div></div></div>`).join('')}
          ${strong.length ? `<div class="card issue good">${sevIcon('good')}<div class="body"><div class="title">${L('Получилось хорошо', 'Went well')}</div><div class="detail">${strong.map(r => METRICS[r.k].name.toLowerCase()).join(', ')}: ${L('лучше 70%+ игроков на этом герое.', 'better than 70%+ of players on this hero.')}</div></div></div>` : ''}
          ${!weak.length ? `<div class="card issue good">${sevIcon('good')}<div class="body"><div class="title">${L('Серьёзных провалов нет', 'No major weak spots')}</div><div class="detail">${L('По ключевым показателям роли ты не хуже большинства.', 'On your role\'s key stats you\'re no worse than most players.')}</div></div></div>` : ''}
        </div></div>`;
  }
  $('dlgBody').innerHTML = parseBlock(m) + mineBlock + table(mine, me ? L('Твоя команда', 'Your team') : 'Radiant', me ? won : m.radiant_win) + table(theirs, me ? L('Враги', 'Enemies') : 'Dire', me ? !won : !m.radiant_win) + `
    <p class="note">${L('Оценка 0–10: сравнение с другими игроками на том же герое по метрикам роли (позиции 1–3 считаются корами, 4–5 саппортами).', 'Score 0–10: compared with other players on the same hero by role metrics (positions 1–3 count as cores, 4–5 as supports).')}</p>
    <div class="row note"><a href="https://www.opendota.com/matches/${m.match_id}" target="_blank" rel="noopener">OpenDota</a><a href="https://www.dotabuff.com/matches/${m.match_id}" target="_blank" rel="noopener">Dotabuff</a><a href="https://stratz.com/matches/${m.match_id}" target="_blank" rel="noopener">Stratz</a></div>`;
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
    <div class="section"><h3 class="section-title">${L('Кто кого контрпикает', 'Who counters whom')}</h3>
      <p class="note">${L(`Строки — ваши герои, столбцы — враги. Число показывает, насколько герой слева выигрывает чаще ожидаемого против героя сверху в ${GROUPS[S.group]} (${(G.matches / 1000).toFixed(0)}k матчей за ${G.days} дней).`, `Rows are your heroes, columns are enemies. Each number shows how much more often the hero on the left wins than expected against the hero on top in ${GROUPS[S.group]} (${(G.matches / 1000).toFixed(0)}k matches over ${G.days} days).`)}</p>
      <div class="card table-wrap"><table class="matrix"><thead><tr><th></th>${theirs.map(p => `<th class="hcol">${posBadge(p)} ${heroIcon(p.hero_id)}</th>`).join('')}<th class="num">${L('Итого', 'Total')}</th></tr></thead>
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
        <p class="note">${L('Позиция', 'Position')} ${me._pos} (${POS_NAMES[me._pos]}). ${myIdx >= 0 ? L(`${myIdx + 1}-е место из ${list.length} подходящих героев против этого состава.`, `Rank ${myIdx + 1} of ${list.length} fitting heroes against this lineup.`) : ''} ${L('Счёт = сумма матчапов против 5 врагов + сочетание с союзниками + сила героя в мете.', 'Score = matchups vs 5 enemies + synergy with allies + hero meta strength.')}</p>
        <div class="card">${candRow(myC, 'mine')}</div>
      </div>
      <div class="section"><h3 class="section-title">${L('Кого лучше было бы взять', 'Better picks')}</h3>
        <p class="note">${L(`Лучшие герои на позицию ${me._pos} против этих врагов и с этими союзниками. Учти, что в драфте не все враги известны заранее: если ты пикал рано, смотри на матчапы против первых пиков.`, `Best heroes for position ${me._pos} against these enemies and with these allies. Not every enemy is known during the draft: if you picked early, look at matchups vs the first picks.`)}</p>
        <div class="card">${top.map(c => candRow(c)).join('')}</div>
        ${fromPool.length ? `<h3 class="label">${L('Из твоих героев (10+ игр)', 'From your heroes (10+ games)')}</h3><div class="card">${fromPool.map(c => candRow(c)).join('')}</div>` : ''}
        ${myHero ? `<p class="note">${L(`Твой винрейт на ${esc(heroName(me.hero_id))}: ${(myHero.win / myHero.games * 100).toFixed(0)}% за ${myHero.games} игр. Комфортный герой часто важнее пары процентов матчапа.`, `Your win rate on ${esc(heroName(me.hero_id))}: ${(myHero.win / myHero.games * 100).toFixed(0)}% over ${myHero.games} games. A comfort hero often matters more than a couple of matchup percent.`)}</p>` : ''}
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
      <div class="legend"><span><i style="background:var(--good)"></i>${L('выигранная драка', 'fight won')}</span><span><i style="background:var(--bad)"></i>${L('проигранная драка', 'fight lost')}</span><span>${L('размер точки = число смертей', 'dot size = deaths')}</span><span>${L('пунктир = Рошан', 'dashed line = Roshan')}</span></div></div>`;

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
    html += `<div class="section"><h3 class="section-title">${L('Ключевые тайминги коров', 'Core item timings')}</h3><p class="note">${L('Первые три крупных предмета (от 2500 золота) у позиций 1–3. Это моменты, когда герой резко усиливается.', 'First three big items (2500+ gold) for positions 1–3. These are the moments a hero spikes.')}</p>
      <div class="card table-wrap"><table><thead><tr><th>${L('Время', 'Time')}</th><th>${L('Команда', 'Team')}</th><th>${L('Герой', 'Hero')}</th><th>${L('Предмет', 'Item')}</th></tr></thead><tbody>${timings.slice(0, 15).map(r => `<tr><td class="num">${mmss(r.t)}</td><td class="${r.ours ? 'pos' : 'neg'}">${r.ours ? L('вы', 'you') : L('враг', 'enemy')}</td><td>${heroCell(r.p.hero_id)}</td><td><div class="row">${itemIcon(r.k)}${esc(itemName(r.k))}</div></td></tr>`).join('')}</tbody></table></div></div>`;
    html += `<div class="section"><h3 class="section-title">${L('Крупные драки', 'Biggest fights')}</h3><div class="issue-list">${fightRows || `<div class="empty">${L('Драк не найдено.', 'No fights found.')}</div>`}</div></div>`;
  }

  html = `<div class="section"><h3 class="section-title">${L('Когда вы были сильнее', 'When you were stronger')}</h3>
    <p class="note">${L(`Перевес вашего драфта по длительности игры: как герои обеих команд выигрывают в зависимости от минуты окончания матча в ${GROUPS[S.group]}. Бледные столбики — время после конца этой игры.`, `Your draft advantage by game length: how both teams' heroes win depending on when the match ends in ${GROUPS[S.group]}. Faded bars are after this game ended.`)}</p>
    <div class="card chart-wrap">${draftBars(curve, endBin)}</div></div>
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
const mapX = x => (x - 64) / 128 * 100, mapY = y => (192 - y) / 128 * 100;
const WARD_LIFE = { obs: 360, sen: 420 };
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
    $('dlgBody').innerHTML = parseBlock(m) + `<p class="note">${L('Карта с вардами и драками появится после разбора реплея.', 'The map with wards and fights appears after the replay is parsed.')}</p>`;
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
    <div class="section"><h3 class="section-title">${L('Карта матча', 'Match map')}</h3>
      <p class="note">${L('Двигай ползунок или нажми ▶. Видно варды (с зоной обзора), где герои стояли на линии в первые 10 минут и где умирали в драках. Непрерывного движения героев OpenDota не хранит.', 'Drag the slider or press ▶. You can see wards (with vision range), where heroes laned in the first 10 minutes, and where they died in fights. OpenDota doesn\'t store continuous hero movement.')}</p>
      <div class="map-wrap">
        <div class="map-col">
          <div class="tb card">
            <div class="tb-team">${m.players.filter(p => p.isRadiant).map(tbHero).join('')}</div>
            <div class="tb-center"><div class="tb-score"><span class="tb-k" id="tbR">0</span><span id="tbClock">0:00</span><span class="tb-k" id="tbD">0</span></div><div class="tb-adv" id="tbAdv"></div></div>
            <div class="tb-team">${m.players.filter(p => !p.isRadiant).map(tbHero).join('')}</div>
          </div>
          <div class="map card"><img src="${MAP_IMG}" alt="${L('Карта Dota 2', 'Dota 2 map')}" width="900" height="900"><svg id="mapSvg" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="${L('Варды, позиции на линии и смерти на выбранную минуту', 'Wards, lane positions, and deaths at the selected minute')}"></svg></div>
          <div class="timeline card">
            <button class="btn small" id="mapPlay" aria-label="${L('Проиграть матч', 'Play the match')}">${icon('play')}</button>
            <div class="tl-track"><div class="tl-marks">${marks}</div><input type="range" id="mapTime" min="0" max="${dur}" value="0" step="1" aria-label="${L('Время матча', 'Match time')}"></div>
            <select id="mapSpeed" class="field tl-speed" aria-label="${L('Скорость', 'Speed')}"><option value="15">×15</option><option value="30" selected>×30</option><option value="60">×60</option></select>
          </div>
        </div>
        <div class="map-side card">
          <div class="map-clock" id="mapClock">0:00</div>
          <div id="mapStats" class="map-stats"></div>
          <div class="label">${L('События рядом', 'Nearby events')}</div>
          <div id="mapEvents" class="map-events"></div>
        </div>
      </div>
      <div class="legend">
        <span><i style="background:var(--good)"></i>${L('ваши', 'yours')}</span><span><i style="background:var(--bad)"></i>${L('враги', 'enemies')}</span>
        <span>${L('● обс-вард и зона обзора', '● observer ward and vision')}</span><span>${L('◆ сентри', '◆ sentry')}</span><span>${L('✕ смерть в драке', '✕ death in a fight')}</span><span>${L('полосы сверху — драки, засечки снизу — варды, R — Рошан', 'top bars: fights, bottom ticks: wards, R: Roshan')}</span>
      </div>
    </div>`;
  $('mapTime').addEventListener('input', e => { stopMap(); drawMap(+e.target.value); });
  $('mapPlay').addEventListener('click', () => (S.mapTimer ? stopMap() : playMap()));
  $('dlgBody').querySelectorAll('.tl-fight').forEach(b => b.addEventListener('click', () => { stopMap(); setMapTime(+b.dataset.t); }));
  drawMap(0);
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
    const bought = death && (p.buyback_t || []).some(b => b >= death[0] && b <= t);
    const dead = death && !bought;
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
function stopMap() { clearInterval(S.mapTimer); S.mapTimer = null; const b = $('mapPlay'); if (b) b.innerHTML = icon('play'); }
function playMap() {
  const dur = S.map.m.duration;
  if (+$('mapTime').value >= dur) setMapTime(0);
  $('mapPlay').innerHTML = icon('pause');
  S.mapTimer = setInterval(() => {
    if (!$('mapTime')) return stopMap();
    const t = Math.min(dur, +$('mapTime').value + +$('mapSpeed').value / 10);
    setMapTime(t);
    if (t >= dur) stopMap();
  }, 100);
}

function drawMap(t) {
  const { m, d } = S.map;
  const col = ours => ours ? 'var(--good)' : 'var(--bad)';
  const heroImgTag = (p, x, y, ours, size) => `<image href="${heroIconUrl(p.hero_id)}" x="${x - size / 2}" y="${y - size / 2}" width="${size}" height="${size}"/><circle cx="${x}" cy="${y}" r="${size / 2 + .3}" fill="none" stroke="${col(ours)}" stroke-width=".5"/>`;
  const out = [];
  for (const w of d.wards) {
    if (w.t > t || t >= w.end) continue;
    const c = col(w.ours), tip = `<title>${w.type === 'obs' ? L('Обс', 'Observer') : L('Сентри', 'Sentry')}: ${esc(heroName(w.p.hero_id))}, ${mmss(w.t)}${w.killer ? L(`, сломал ${esc(w.killer.localized_name)} на ${mmss(w.end)}`, `, destroyed by ${esc(w.killer.localized_name)} at ${mmss(w.end)}`) : ''}</title>`;
    if (w.type === 'obs') out.push(`<g>${tip}<circle cx="${w.x}" cy="${w.y}" r="9.8" fill="${c}" fill-opacity=".07" stroke="${c}" stroke-opacity=".35" stroke-width=".2"/><circle cx="${w.x}" cy="${w.y}" r="1.1" fill="${c}" stroke="#0a0c10" stroke-width=".35"/></g>`);
    else out.push(`<g>${tip}<rect x="${w.x - .8}" y="${w.y - .8}" width="1.6" height="1.6" transform="rotate(45 ${w.x} ${w.y})" fill="${c}" stroke="#0a0c10" stroke-width=".3"/></g>`);
  }
  if (t <= 600) for (const l of d.lanes) out.push(`<g opacity=".9"><title>${esc(heroName(l.p.hero_id))}: ${L('примерно где стоял на линии', 'approximate laning spot')}</title>${heroImgTag(l.p, l.spot.x, l.spot.y, l.ours, 3.6)}</g>`);
  for (const f of d.fights) {
    if (t < f.start - 3 || t > f.end + 12) continue;
    for (const dd of f.deaths) out.push(`<g><title>${esc(heroName(dd.p.hero_id))} ${L('погиб в драке на', 'died in the fight at')} ${mmss(f.start)}</title>${heroImgTag(dd.p, dd.x, dd.y, dd.ours, 4.2)}<path d="M${dd.x - 1.4} ${dd.y - 1.4}l2.8 2.8m0 -2.8l-2.8 2.8" stroke="#fff" stroke-width=".6" stroke-linecap="round"/></g>`);
  }
  $('mapSvg').innerHTML = out.join('');
  $('mapClock').textContent = mmss(Math.floor(t));
  drawTopbar(m, t);

  const active = d.wards.filter(w => w.t <= t && t < w.end);
  const cnt = (ours, type) => active.filter(w => w.ours === ours && w.type === type).length;
  const adv = m.radiant_gold_adv?.[Math.min(m.radiant_gold_adv.length - 1, Math.floor(t / 60))];
  $('mapStats').innerHTML = `
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
  html += `<div class="section"><h3 class="section-title">${L('Тайминги', 'Timings')}</h3>${m.version ? `<p class="note">${L(`Когда ты собрал крупные предметы, по сравнению с медианой про-игроков на этом герое в патче ${S.meta?.patch || ''} и с винрейтом в пабах при таком тайминге.`, `When you finished big items, compared with the pro median on this hero in patch ${S.meta?.patch || ''} and with pub win rate at that timing.`)}</p><div class="card" id="timingRows"><div class="loading"><div class="spinner"></div></div></div>` : `<p class="note">${L('Тайминги видны только после разбора реплея.', 'Timings show up only after the replay is parsed.')}</p>`}</div>`;

  const missing = Object.entries(pro).filter(([k, [rate]]) => rate >= 0.3 && isBigItem(k) && !bought.has(k)).sort((a, b) => b[1][0] - a[1][0]).slice(0, 5);
  html += `<div class="section"><h3 class="section-title">${L('Что обычно собирают про-игроки', 'What pros usually build')}</h3>
    ${Object.keys(pro).length ? `<div class="card">${Object.entries(pro).filter(([k]) => isBigItem(k)).sort((a, b) => b[1][0] - a[1][0]).slice(0, 10).map(([k, [rate, t]]) => `<div class="item-row">${itemIcon(k)}<div><div class="name">${esc(itemName(k))} ${bought.has(k) ? `<span class="chip pos">${L('есть', 'built')}</span>` : ''}</div><div class="why">${L(`в ${(rate * 100).toFixed(0)}% игр, медиана ${mmss(t)}`, `in ${(rate * 100).toFixed(0)}% of games, median ${mmss(t)}`)}</div></div><div></div></div>`).join('')}</div>
    ${missing.length ? `<p class="note">${L('Ты не собрал', 'You didn\'t build')}: ${missing.map(([k]) => esc(itemName(k))).join(', ')}. ${L('Не обязательно ошибка, но стоит понимать, почему.', 'Not necessarily a mistake, but know why.')}</p>` : ''}` : `<p class="note">${L('На этом герое мало про-игр в текущем патче.', 'Few pro games on this hero in the current patch.')}</p>`}</div>`;

  const ci = counterItemsFor(theirs.map(p => p.hero_id), h).slice(0, 8);
  html += `<div class="section"><h3 class="section-title">${L('Предметы против этих врагов', 'Items against these enemies')}</h3>
    <p class="note">${L('Что про-игроки собирают против героев из этого матча чаще обычного, с учётом того, что подходит твоему герою.', 'What pros build more often than usual against the heroes in this match, filtered to what fits your hero.')}</p>
    <div class="card">${ci.length ? ci.map(c => `<div class="item-row">${itemIcon(c.k)}<div><div class="name">${esc(itemName(c.k))} ${bought.has(c.k) ? `<span class="chip pos">${L('куплено', 'bought')}</span>` : ''}</div><div class="why">${esc(itemWhy(c.k))}</div><div class="breakdown" style="margin-top:4px">${c.vs.map(([e, l]) => `<span>${heroImg(e) ? `<img src="${heroImg(e)}" alt="${esc(heroName(e))}" title="${esc(heroName(e))}">` : ''}×${l.toFixed(1)}</span>`).join('')}</div></div><div></div></div>`).join('') : `<div class="empty">${L('Нет данных по этим героям.', 'No data for these heroes.')}</div>`}</div></div>`;

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
  $('metaInfo').textContent = L(`Патч ${S.meta.patch}. ${GROUPS[S.metaGroup]}: ${G.matches.toLocaleString(LOC)} рейтинговых матчей за ${G.days} дней. Предметы: ${S.meta.pro_matches.toLocaleString(LOC)} про-матчей патча.`, `Patch ${S.meta.patch}. ${GROUPS[S.metaGroup]}: ${G.matches.toLocaleString(LOC)} ranked matches over ${G.days} days. Items: ${S.meta.pro_matches.toLocaleString(LOC)} pro matches this patch.`);
  const pos = S.metaPos;
  const list = Object.keys(S.heroes).map(Number).filter(h => G.idx[h] != null && heroPick(G, h) >= 0.02 && (!pos || posPrior(h)[pos - 1] >= 0.18))
    .sort((a, b) => heroWr(G, b) - heroWr(G, a)).slice(0, 20);
  $('tierNote').textContent = pos ? L(`Герои, которых часто играют на позиции ${pos}, по винрейту.`, `Heroes often played at position ${pos}, by win rate.`) : L('Все популярные герои по винрейту.', 'All popular heroes by win rate.');
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
  $('itemCounters').innerHTML = rows.length ? rows.map(([k, lift, obs]) => `<div class="item-row">${itemIcon(k)}<div><div class="name">${esc(itemName(k))}</div><div class="why">${esc(itemWhy(k))}${itemWhy(k) ? ' · ' : ''}${L(`${obs} раз в ${Math.round(n / 5)} про-играх`, `${obs} times in ${Math.round(n / 5)} pro games`)}</div></div><div class="lift pos">×${lift.toFixed(1)}</div></div>`).join('')
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

/* ---------- router & boot ---------- */

function route() {
  const meta = location.hash === '#meta';
  $('viewPlayer').hidden = meta; $('viewMeta').hidden = !meta;
  $('navPlayer').setAttribute('aria-current', meta ? 'false' : 'page');
  $('navMeta').setAttribute('aria-current', meta ? 'page' : 'false');
  if (meta) {
    Promise.resolve(S.items || loadItems().catch(() => {})).then(async () => {
      if (S.metaGroup == null) S.metaGroup = store.get('metaGroup') || S.group || 3;
      const G = await loadGroup(S.metaGroup).catch(() => null);
      if (G && !S.enemies.length) {
        S.enemies = Object.keys(S.heroes).map(Number).filter(h => heroPick(G, h) >= 0.08).sort((a, b) => heroPick(G, b) - heroPick(G, a)).slice(0, 2);
        S.enemiesExample = true;
      }
      if (G && !S.itemHero) S.itemHero = Object.keys(S.heroes).map(Number).filter(h => S.meta?.counter_items?.[h]?.length).sort((a, b) => heroPick(G, b) - heroPick(G, a))[0];
      renderMeta();
    });
  }
}
window.addEventListener('hashchange', route);

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
  try { await loadBase(); } catch (e) { showError(L('Не удалось загрузить список героев: ', 'Couldn\'t load the hero list: ') + e.message); return; }
  route();
  const last = store.get('lastId');
  if (last && location.hash !== '#meta') { $('steamId').value = last; analyze(); }
})();
