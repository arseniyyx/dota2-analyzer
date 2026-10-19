'use strict';

const API = 'https://api.opendota.com/api';
const CDN = 'https://cdn.cloudflare.steamstatic.com';
const RANKS = ['', 'Herald', 'Guardian', 'Crusader', 'Archon', 'Legend', 'Ancient', 'Divine', 'Immortal'];
const GROUPS = { 1: 'Herald–Guardian', 2: 'Crusader–Archon', 3: 'Legend–Ancient', 4: 'Divine–Immortal' };
const POS_NAMES = ['', 'Керри', 'Мид', 'Оффлейн', 'Четвёрка', 'Пятёрка'];
const DUR_LABELS = ['до 20', '20–25', '25–30', '30–35', '35–40', '40–45', '45–50', '50+'];
const UNIVERSAL_ITEMS = new Set(['black_king_bar', 'gem', 'dust', 'ward_sentry', 'lotus_orb', 'sphere', 'force_staff', 'glimmer_cape', 'ghost', 'aeon_disk', 'spirit_vessel', 'blade_mail', 'pipe', 'crimson_guard', 'heavens_halberd', 'nullifier', 'monkey_king_bar', 'silver_edge', 'sheepstick', 'orchid', 'bloodthorn', 'cyclone', 'wind_waker', 'solar_crest', 'manta', 'mage_slayer']);
const ITEM_WHY = {
  black_king_bar: 'Иммунитет к магии и большей части контроля',
  spirit_vessel: 'Режет лечение и регенерацию цели',
  silver_edge: 'Break: отключает пассивные способности',
  nullifier: 'Снимает защитные эффекты вроде Ghost, Eul, Glimmer, Aeon Disk',
  monkey_king_bar: 'Пробивает уклонение',
  lotus_orb: 'Отражает направленные заклинания, снимает дебаффы',
  sphere: 'Блокирует одно направленное заклинание',
  gem: 'Видит невидимых героев и варды',
  dust: 'Раскрывает невидимых рядом',
  ward_sentry: 'Видит невидимых и варды в радиусе',
  heavens_halberd: 'Обезоруживает: керри не может бить',
  blade_mail: 'Возвращает урон атакующим',
  pipe: 'Барьер от магического урона для команды',
  crimson_guard: 'Блок физического урона для команды',
  abyssal_blade: 'Оглушение сквозь BKB',
  sheepstick: 'Хекс: цель без способностей и атак',
  orchid: 'Немота: цель не может кастовать',
  bloodthorn: 'Немота и критические удары по цели',
  diffusal_blade: 'Сжигает ману и замедляет',
  force_staff: 'Отталкивание: выход из ловушек и погонь',
  glimmer_cape: 'Невидимость и защита от магии союзнику',
  ghost: 'Эфирная форма: защита от физических атак',
  aeon_disk: 'Спасает от мгновенного бурста',
  manta: 'Снимает многие дебаффы',
  mjollnir: 'Цепные молнии по иллюзиям и призывам',
  maelstrom: 'Цепные молнии по иллюзиям и призывам',
  bfury: 'Сплэш: чистит иллюзии и призывов',
  radiance: 'Аура урона против иллюзий и призывов',
  cyclone: 'Развеивает с себя, подбрасывает цель',
  wind_waker: 'Спасает себя или союзника',
  solar_crest: 'Броня союзнику, минус броня врагу',
  mage_slayer: 'Снижает урон заклинаний атакованной цели',
  satanic: 'Сильный вампиризм и развеивание с себя',
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
const rankName = t => !t ? 'Без ранга' : (RANKS[Math.floor(t / 10)] || 'Rank') + (Math.floor(t / 10) < 8 && t % 10 ? ' ' + (t % 10) : '');
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
  if (m < 60) return `${m} мин назад`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} ч назад`;
  const d = Math.round(h / 24);
  return d === 1 ? 'вчера' : `${d} дн назад`;
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
  if (r.status === 429) throw new Error('OpenDota ограничил запросы. Подожди минуту и попробуй снова.');
  if (!r.ok) throw new Error(`Сервер ответил ошибкой ${r.status}`);
  return r.json();
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
    getJSON(`${API}/heroStats`),
    getJSON('data/meta.json').catch(() => null),
  ]);
  heroStats.forEach(h => { S.heroes[h.id] = h; });
  S.meta = meta;
  $('heroList').innerHTML = Object.values(S.heroes).sort((a, b) => a.localized_name.localeCompare(b.localized_name)).map(h => `<option value="${esc(h.localized_name)}">`).join('');
  if (meta) {
    const d = new Date(meta.generated_at * 1000);
    $('updated').textContent = `Патч ${meta.patch} · данные от ${d.toLocaleDateString('ru')} ${d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}`;
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
  gold_per_min: { name: 'Золото в минуту', tip: 'Фармишь меньше, чем большинство на этом герое. Бери лес между волнами, не простаивай.' },
  xp_per_min: { name: 'Опыт в минуту', tip: 'Отстаёшь по уровню. Меньше умирай и дольше стой в зоне опыта.' },
  last_hits_per_min: { name: 'Ластхиты в минуту', tip: 'Мало добиваешь. Держи линию и лес, не пропускай волны.' },
  kills_per_min: { name: 'Убийства в минуту', tip: 'Мало убийств для этого героя. Ищи пики и драки в свои тайминги.' },
  assists_per_min: { name: 'Помощь в минуту', tip: 'Мало участия в драках. Держись ближе к команде.' },
  deaths_per_min: { name: 'Выживаемость', tip: 'Умираешь чаще, чем большинство на этом герое. Носи ТП, смотри на карту, не фарми без вижна.' },
  hero_damage_per_min: { name: 'Урон по героям', tip: 'Мало урона в драках. Ищи позицию, откуда бьёшь дольше.' },
  tower_damage: { name: 'Урон по башням', tip: 'Мало урона по строениям. Превращай выигранные драки в башни.' },
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

function trimMatch(m) {
  const keepP = ['account_id', 'player_slot', 'hero_id', 'isRadiant', 'kills', 'deaths', 'assists', 'last_hits', 'denies', 'gold_per_min', 'xp_per_min', 'net_worth', 'hero_damage', 'tower_damage', 'hero_healing', 'item_0', 'item_1', 'item_2', 'item_3', 'item_4', 'item_5', 'item_neutral', 'benchmarks', 'lane_role', 'is_roaming', 'personaname', 'rank_tier', 'obs_placed', 'sen_placed', 'camps_stacked', 'teamfight_participation', 'lane_efficiency_pct'];
  return {
    match_id: m.match_id, radiant_win: m.radiant_win, duration: m.duration, start_time: m.start_time,
    radiant_score: m.radiant_score, dire_score: m.dire_score, version: m.version || null,
    radiant_gold_adv: m.radiant_gold_adv || null,
    teamfights: (m.teamfights || []).map(t => ({ start: t.start, end: t.end, deaths: t.deaths, players: t.players.map(p => ({ gold_delta: p.gold_delta, deaths: p.deaths })) })),
    objectives: (m.objectives || []).filter(o => o.type === 'CHAT_MESSAGE_ROSHAN_KILL').map(o => ({ time: o.time, team: o.team })),
    players: m.players.map(p => {
      const o = Object.fromEntries(keepP.map(k => [k, p[k]]));
      o.purchase_log = (p.purchase_log || []).map(e => [e.time, e.key]);
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
  if (cached && (cached.version || (Date.now() - cached._ts < 15 * 60 * 1000 && !parsePendingSince(id)))) return cached;
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

$('searchForm').addEventListener('submit', e => { e.preventDefault(); analyze(); });

async function analyze() {
  const raw = $('steamId').value;
  if (/steamcommunity\.com\/id\//.test(raw)) return showError('Ссылка с ником не подходит. Нужна ссылка вида steamcommunity.com/profiles/7656… или Friend ID из Dota.');
  const id = parseId(raw);
  if (!id) return showError('Введи Steam ID, Friend ID или ссылку на профиль.');
  store.set('lastId', id);
  $('searchBtn').disabled = true; $('results').hidden = true; $('error').hidden = true; $('loading').hidden = false;
  $('loadingText').textContent = 'Загружаю профиль…';
  try {
    const [profile, recent, poolHeroes, period, history] = await Promise.all([
      getJSON(`${API}/players/${id}`), getJSON(`${API}/players/${id}/recentMatches`),
      getJSON(`${API}/players/${id}/heroes`), fetchPeriod(id),
      getJSON(`${API}/players/${id}/matches?limit=100&project=kills&project=deaths&project=assists&project=gold_per_min&project=hero_id`).catch(() => []),
    ]);
    if (!profile.profile) throw new Error('Профиль не найден. Проверь ID или включи в Dota «Открытая история матчей».');
    S.playerId = Number(id); S.profile = profile; S.poolHeroes = poolHeroes; S.recent = recent; S.period = period; S.posFilter = 0; S.history = history;
    S.group = groupOfTier(profile.rank_tier);
    await loadGroup(S.group).catch(() => null);

    $('loadingText').textContent = 'Загружаю матчи 0/' + recent.length;
    const ms = await pool(recent.map(r => () => loadMatch(r.match_id)), 3, d => { $('loadingText').textContent = `Загружаю матчи ${d}/${recent.length}`; });
    S.matches = {};
    ms.forEach(m => { if (m) S.matches[m.match_id] = prepareMatch(m); });

    renderPeriod();
    renderFlags();
    renderPositions();
    renderMatches();
    $('results').hidden = false;
  } catch (e) {
    showError(e.message || 'Не удалось загрузить данные.');
  } finally {
    $('searchBtn').disabled = false; $('loading').hidden = true;
  }
}

const PERIODS = [[20, '20 игр'], [100, '100 игр'], [0, 'Вся история']];
S.limit = store.get('period') ?? 20;
const minGames = () => ({ 20: 2, 100: 4 })[S.limit] ?? 5;
const losingGames = () => ({ 20: 4, 100: 7 })[S.limit] ?? 10;
const periodLabel = () => S.limit ? `за последние ${S.limit} игр` : 'за всю историю';

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
    flags.push({ title: 'Похоже на смурфа', reasons: [`всего ${total} игр на аккаунте`, `MVP матча в ${mvp} из ${games.length} последних игр`, `средняя оценка ${avgScore.toFixed(1)} из 10`, `винрейт ${p0(now.wr)} за последние 20`] });
  }
  if (dominant && before.n >= 40 && now.wr - before.wr >= 0.2 && (now.kda / before.kda >= 1.4 || now.gpm / before.gpm >= 1.2)) {
    flags.push({ title: 'Похоже, что на аккаунте играет бустер', reasons: [`винрейт ${p0(before.wr)} → ${p0(now.wr)}`, `KDA ${before.kda.toFixed(1)} → ${now.kda.toFixed(1)}`, `GPM ${Math.round(before.gpm)} → ${Math.round(now.gpm)}`, `MVP матча в ${mvp} из ${games.length} последних игр`, newHeroShare >= 0.4 ? `${p0(newHeroShare)} последних игр на героях, которых не было в играх 21–100` : ''].filter(Boolean) });
  }
  $('flags').innerHTML = flags.map(f => `<div class="card issue warn">${sevIcon('bad')}<div class="body"><div class="title">${f.title}</div><div class="detail">${f.reasons.join(' · ')}. Это признаки по статистике, а не доказательство.</div></div></div>`).join('')
    + `<p class="note">MVP матча (лучшая оценка из 10 игроков) в ${mvp} из ${games.length} последних игр, средняя оценка ${avgScore.toFixed(1)} из 10.</p>`;
}

async function fetchPeriod(id) {
  const qs = S.limit ? `?limit=${S.limit}` : '';
  const [wl, heroes, totals] = await Promise.all([
    getJSON(`${API}/players/${id}/wl${qs}`), getJSON(`${API}/players/${id}/heroes${qs}`), getJSON(`${API}/players/${id}/totals${qs}`),
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
    showError(e.message || 'Не удалось загрузить статистику.');
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
    <div><h2>${esc(p.personaname)}</h2><div class="meta"><span class="rank-pill">${icon('shield')}${rankName(profile.rank_tier)}</span><span>${S.limit ? `винрейт за последние ${total} игр` : `${total.toLocaleString('ru')} матчей всего`}</span><span>мета по ${GROUPS[S.group]}</span></div></div>
    <div class="wl"><div class="big" style="color:${wr >= 52 ? 'var(--good)' : wr >= 48 ? 'var(--fg)' : 'var(--bad)'}">${wr.toFixed(1)}%</div>
    <div class="note"><span class="pos">${wl.win} побед</span> · <span class="neg">${wl.lose} поражений</span></div></div>`;
}

function renderStats(t) {
  const k = avgOf(t, 'kills'), d = avgOf(t, 'deaths'), a = avgOf(t, 'assists');
  const card = (ic, l, v, s) => `<div class="card stat"><div class="label">${icon(ic)}${l}</div><div class="value">${v}</div><div class="sub">${s}</div></div>`;
  $('stats').innerHTML =
    card('swords', 'KDA', (d ? (k + a) / d : k + a).toFixed(2), `${k.toFixed(1)} / ${d.toFixed(1)} / ${a.toFixed(1)}`) +
    card('coins', 'GPM', Math.round(avgOf(t, 'gold_per_min')), 'золото в минуту') +
    card('trending', 'XPM', Math.round(avgOf(t, 'xp_per_min')), 'опыт в минуту') +
    card('target', 'Ластхиты', Math.round(avgOf(t, 'last_hits')), 'за матч') +
    card('zap', 'Урон по героям', fmt(avgOf(t, 'hero_damage')), 'за матч') +
    card('castle', 'Урон по башням', fmt(avgOf(t, 'tower_damage')), 'за матч');
}

function renderPositions() {
  const mine = Object.values(S.matches).map(m => m._me).filter(Boolean);
  const exact = mine.filter(p => p._posExact).length;
  $('posNote').textContent = `По последним ${mine.length} матчам. Позиция определена по реплею в ${exact}, в остальных примерно (по героям и золоту в команде). Разбери реплеи внизу, чтобы было точнее.`;
  const by = [1, 2, 3, 4, 5].map(pos => {
    const ps = mine.filter(p => p._pos === pos);
    const w = ps.filter(isWin).length;
    return { pos, n: ps.length, wr: ps.length ? w / ps.length * 100 : null, score: ps.length ? ps.reduce((s, p) => s + p._score, 0) / ps.length : null, heroes: [...new Set(ps.map(p => p.hero_id))].slice(0, 4) };
  });
  const adjWr = b => (b.wr / 100 * b.n + 1) / (b.n + 2);
  const best = by.filter(b => b.n >= 3).sort((a, b) => adjWr(b) - adjWr(a) || b.score - a.score)[0];
  $('positions').innerHTML = by.map(b => {
    const c = !b.n ? 'var(--fg-dim)' : b.wr >= 55 ? 'var(--good)' : b.wr >= 45 ? 'var(--accent)' : 'var(--bad)';
    return `<button class="card pos-card ${best && b.pos === best.pos ? 'best' : ''}" data-pos="${b.pos}" ${b.n ? '' : 'disabled'} title="Показать матчи на этой позиции">
      <span class="pos-top">
        <span class="ring" style="--p:${b.n ? b.wr.toFixed(0) : 0};--c:${c}"><span>${b.n ? b.wr.toFixed(0) + '%' : '—'}</span></span>
        <span class="pos-name"><span class="label">Pos ${b.pos}</span><b>${POS_NAMES[b.pos]}</b><span class="note">${b.n} игр${b.n ? ` · оценка ${b.score.toFixed(1)}` : ''}</span></span>
      </span>
      <span class="pos-heroes">${b.heroes.map(heroIcon).join('')}</span>
      ${best && b.pos === best.pos ? `<span class="best-tag">${icon('crown')}Лучше всего получается</span>` : ''}
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

  if (deaths > 8) add('bad', 'Много смертей', `${deaths.toFixed(1)} за игру. Следи за картой, носи ТП, не фарми без вижна.`, deaths.toFixed(1));
  else if (deaths > 6) add('warn', 'Частые смерти', `${deaths.toFixed(1)} за игру.`, deaths.toFixed(1));
  else add('good', 'Хорошо выживаешь', `${deaths.toFixed(1)} смертей за игру.`, deaths.toFixed(1));
  if (kda < 2) add('bad', 'Низкий KDA', 'Мало участия в убийствах или частые смерти.', kda.toFixed(2));
  else if (kda < 3) add('warn', 'KDA ниже среднего', 'Нормально, но можно лучше.', kda.toFixed(2));
  else add('good', 'Хороший KDA', 'Влияешь на драки и не отдаёшь лишнего.', kda.toFixed(2));
  if (gpm < 350) add('bad', 'Слабый фарм', 'Если играешь кор, фарми лес между волнами.', Math.round(gpm));
  else if (gpm < 420) add('warn', 'Средний фарм', 'Для кора можно выжимать больше золота.', Math.round(gpm));
  if (lhm < 4) add('bad', 'Мало ластхитов', `${lhm.toFixed(1)} в минуту. Потренируй добивание в демо.`, lhm.toFixed(1));
  else if (lhm < 6) add('warn', 'Ластхиты средние', `${lhm.toFixed(1)} в минуту.`, lhm.toFixed(1));

  const losing = heroes.filter(h => h.games >= losingGames() && h.win / h.games < 0.45).sort((a, b) => b.games - a.games)[0];
  if (losing) add('bad', `Сливаешь на ${heroName(losing.hero_id)}`, `${losing.games} игр ${periodLabel()}, винрейт ${(losing.win / losing.games * 100).toFixed(0)}%. Отложи героя или разбери свои игры на нём.`, (losing.win / losing.games * 100).toFixed(0) + '%');

  const mine = Object.values(S.matches).map(m => m._me).filter(Boolean);
  const byPos = [1, 2, 3, 4, 5].map(pos => { const ps = mine.filter(p => p._pos === pos); return { pos, n: ps.length, wr: ps.length ? ps.filter(isWin).length / ps.length : 0 }; });
  const worstPos = byPos.filter(b => b.n >= 4).sort((a, b) => a.wr - b.wr)[0];
  if (worstPos && worstPos.wr < 0.4) add('warn', `Слабая позиция: ${POS_NAMES[worstPos.pos]}`, `${worstPos.n} игр за последнее время, побед ${(worstPos.wr * 100).toFixed(0)}%. В подборе ролей лучше ставить другие позиции.`, (worstPos.wr * 100).toFixed(0) + '%');

  if (recent.length >= 10) {
    const w = recent.slice(0, 10).filter(isWin).length;
    if (w <= 3) add('bad', 'Похоже на тильт', `${w} побед в последних 10 играх. Сделай перерыв.`, `${w}/10`);
    else if (w >= 7) add('good', 'Хорошая серия', `${w} побед в последних 10 играх.`, `${w}/10`);
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
  if (!G) { $('metaNote').textContent = 'Данные меты ещё не собраны.'; $('metaTable').innerHTML = ''; return; }
  const mine = Object.fromEntries(S.playerHeroes.map(h => [h.hero_id, h]));
  const myWr = h => h && h.games ? h.win / h.games * 100 : null;
  const mwr = id => heroWr(G, id) * 100;
  if (tab === 'mine') {
    $('metaNote').textContent = `Твой винрейт ${periodLabel()} против общего винрейта героя в ${g}. Плюс значит, что ты играешь его лучше среднего.${S.limit === 20 ? ' На 2–3 играх разница сильно зависит от случая.' : ''}`;
    const rows = S.playerHeroes.filter(h => h.games >= minGames()).sort((a, b) => b.games - a.games).slice(0, 15);
    $('metaTable').innerHTML = `<thead><tr><th>Герой</th><th class="num">Игр</th><th class="num">Твой WR</th><th class="num">WR в ${g}</th><th class="num">Разница</th></tr></thead><tbody>` +
      rows.map(h => `<tr><td>${heroCell(h.hero_id)}</td><td class="num">${h.games}</td><td class="num">${myWr(h).toFixed(1)}%</td><td class="num muted">${mwr(h.hero_id).toFixed(1)}%</td><td class="num ${signCls(myWr(h) - mwr(h.hero_id))}">${pct(myWr(h) - mwr(h.hero_id))}</td></tr>`).join('') + '</tbody>';
  } else if (tab === 'meta') {
    $('metaNote').textContent = `Самые сильные популярные герои в ${g}. Справа твой опыт на них ${periodLabel()}.`;
    const rows = Object.keys(S.heroes).map(Number).filter(h => heroPick(G, h) >= 0.04).sort((a, b) => heroWr(G, b) - heroWr(G, a)).slice(0, 15);
    $('metaTable').innerHTML = `<thead><tr><th>Герой</th><th class="num">WR в ${g}</th><th class="num">Пик</th><th class="num">Твоих игр</th><th class="num">Твой WR</th></tr></thead><tbody>` +
      rows.map(h => { const m = mine[h]; return `<tr><td>${heroCell(h)}</td><td class="num pos">${mwr(h).toFixed(1)}%</td><td class="num muted">${(heroPick(G, h) * 100).toFixed(1)}%</td><td class="num">${m ? m.games : 0}</td><td class="num">${m && m.games >= minGames() ? myWr(m).toFixed(1) + '%' : '<span class="dim">—</span>'}</td></tr>`; }).join('') + '</tbody>';
  } else {
    $('metaNote').textContent = `Герои, которые сильны в ${g} и у тебя уже получаются (${periodLabel()}). Их стоит спамить ради рейтинга.`;
    const rows = S.playerHeroes.filter(h => h.games >= minGames() && mwr(h.hero_id) >= 50 && myWr(h) >= 52)
      .map(h => ({ ...h, s: (myWr(h) - 50) * Math.log(h.games) + (mwr(h.hero_id) - 50) * 2 })).sort((a, b) => b.s - a.s).slice(0, 10);
    $('metaTable').innerHTML = rows.length
      ? `<thead><tr><th>Герой</th><th class="num">Твой WR</th><th class="num">Игр</th><th class="num">WR в ${g}</th></tr></thead><tbody>` + rows.map(h => `<tr><td>${heroCell(h.hero_id)}</td><td class="num pos">${myWr(h).toFixed(1)}%</td><td class="num">${h.games}</td><td class="num">${mwr(h.hero_id).toFixed(1)}%</td></tr>`).join('') + '</tbody>'
      : '<tbody><tr><td class="muted">Пока нет героев, где и мета, и твой винрейт выше среднего. Попробуй героев из вкладки «Топ меты».</td></tr></tbody>';
  }
}

function renderMatches() {
  const unparsed = S.recent.filter(r => !S.matches[r.match_id]?.version);
  const ready = unparsed.filter(r => !parsePendingSince(r.match_id));
  $('parseAll').hidden = unparsed.length === 0;
  $('parseAll').disabled = ready.length === 0;
  $('parseAll').textContent = ready.length ? `Разобрать реплеи (${ready.length})` : `Разбор запрошен (${unparsed.length})`;
  const posOf = r => S.matches[r.match_id]?._me?._pos;
  const count = p => S.recent.filter(r => !p || posOf(r) === p).length;
  $('posFilter').innerHTML = [0, 1, 2, 3, 4, 5].map(p => `<button class="tab" data-p="${p}" aria-selected="${p === S.posFilter}" ${p && !count(p) ? 'disabled' : ''}>${p ? `${p} · ${POS_NAMES[p]}` : 'Все'} <span class="dim">${count(p)}</span></button>`).join('');
  $('posFilter').querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => { S.posFilter = +b.dataset.p; renderMatches(); }));
  $('matches').innerHTML = S.recent.filter(r => !S.posFilter || posOf(r) === S.posFilter).map(r => {
    const m = S.matches[r.match_id], me = m?._me;
    const won = isWin(r);
    const posb = me ? `<span class="posb ${me._posExact ? '' : 'approx'}" title="${POS_NAMES[me._pos]}${me._posExact ? '' : ' (примерно)'}">${me._pos}</span>` : '<span></span>';
    return `<button class="card match ${won ? '' : 'loss'}" data-id="${r.match_id}" aria-label="${won ? 'Победа' : 'Поражение'} на ${esc(heroName(r.hero_id))}, открыть разбор">
      ${m?.version ? '<span class="parsed-dot" title="Реплей разобран"></span>' : ''}
      <span class="res ${won ? 'win' : 'loss'}"><b>${won ? 'Победа' : 'Поражение'}</b><small>${ago(r.start_time + r.duration)}</small></span>${posb}
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
    $('parseStatus').textContent = `Отправлено на разбор: ${sent}/${ids.length}. Старые реплеи (старше ~2 недель) Valve уже удалила, их не разобрать.`;
    await new Promise(r => setTimeout(r, 1100));
  }
  $('parseStatus').textContent = `Отправлено на разбор: ${sent}. Обычно это занимает 1–5 минут. Потом нажми «Анализ» ещё раз.`;
  renderMatches();
});

/* ---------- match dialog ---------- */

let current = null;
$('dlgClose').addEventListener('click', () => $('matchDlg').close());
$('matchDlg').addEventListener('click', e => { if (e.target === $('matchDlg')) $('matchDlg').close(); });
document.querySelectorAll('#dlgTabs .tab').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));

async function openMatch(id) {
  $('dlgTitle').textContent = `Матч ${id}`;
  $('dlgBody').innerHTML = '<div class="loading"><div class="spinner"></div><p>Загружаю матч…</p></div>';
  $('matchDlg').showModal();
  try {
    const [m] = await Promise.all([S.matches[id] ? Promise.resolve(S.matches[id]) : loadMatch(id).then(prepareMatch), loadItems().catch(() => {}), loadGroup(S.group).catch(() => null)]);
    S.matches[id] = m;
    current = m;
    $('dlgTitle').textContent = `${m.radiant_win ? 'Победа Radiant' : 'Победа Dire'} · ${m.radiant_score}:${m.dire_score} · ${mmss(m.duration)}`;
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
  const r = { overview: renderOverview, draft: renderDraft, flow: renderFlow, items: renderItemsTab }[tab];
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

const posBadge = p => `<span class="posb ${p._posExact ? '' : 'approx'}" title="${POS_NAMES[p._pos]}${p._posExact ? '' : ' (примерно)'}">${p._pos}</span>`;
const scoreCol = s => s >= 6.5 ? 'var(--good)' : s >= 4 ? 'var(--warn)' : 'var(--bad)';
const finalItems = p => [0, 1, 2, 3, 4, 5].map(i => S.itemIds?.[p['item_' + i]]).filter(Boolean);

function parseBlock(m) {
  if (m.version) return '';
  const since = parsePendingSince(m.match_id);
  if (since) {
    const min = Math.floor((Date.now() - since) / 60000);
    return `<div class="card issue info">${sevIcon('info')}<div class="body"><div class="title">Разбор запрошен ${min < 1 ? 'только что' : `${min} мин назад`}</div><div class="detail">Обычно это 1–5 минут. Окно обновится само, нажимать ничего не нужно.</div></div><div class="spinner" style="width:20px;height:20px;border-width:2px"></div></div>`;
  }
  const failed = store.get('pr:' + m.match_id);
  return `<div class="card issue info">${sevIcon('info')}<div class="body"><div class="title">Реплей не разобран</div><div class="detail">${failed ? 'Прошлый запрос за 30 минут так и не дал разбора: скорее всего, Valve уже удалила реплей (они хранятся около двух недель). Можно попробовать ещё раз.' : 'Без разбора нет позиций по линиям, графика золота, драк и таймингов предметов. Разбор занимает 1–5 минут.'}</div></div><button class="btn small" id="parseOne">Разобрать</button></div>`;
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
    b.disabled = true; b.textContent = 'Отправляю…';
    if (!(await requestParse(m.match_id))) { b.disabled = false; b.textContent = 'Не отправилось, ещё раз'; return; }
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
    <div class="section"><h3 class="label">${title} ${win ? '· победа' : '· поражение'}</h3>
    <div class="card table-wrap"><table>
      <thead><tr><th>Поз.</th><th>Игрок</th><th>Герой</th><th class="num">K/D/A</th><th class="num">GPM</th><th class="num">LH</th><th class="num">Урон</th><th>Предметы</th><th class="num">Оценка</th></tr></thead>
      <tbody>${team.map(p => `<tr class="${p === me ? 'me' : ''}">
        <td>${posBadge(p)}</td>
        <td>${esc(p.personaname || 'Аноним')} ${p === best ? '<span class="chip pos">MVP</span>' : ''}${p === worst ? '<span class="chip neg">Худший</span>' : ''}<div class="dim rank-line">${p.rank_tier ? rankEmblem(p.rank_tier, 22) + rankName(p.rank_tier) : ''}</div></td>
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
    if (me.lane_efficiency_pct != null) extra.push(`эффективность на линии ${me.lane_efficiency_pct}%`);
    if (me.teamfight_participation != null) extra.push(`участие в драках ${(me.teamfight_participation * 100).toFixed(0)}%`);
    if (me._role === 'support' && me.obs_placed != null) extra.push(`вардов ${me.obs_placed} обс / ${me.sen_placed} сентри`);
    if (me.camps_stacked) extra.push(`стаков ${me.camps_stacked}`);
    mineBlock = `
      <div class="section"><h3 class="section-title">Где можно было лучше</h3>
        <p class="note">Ты на ${esc(heroName(me.hero_id))}, позиция ${me._pos} (${POS_NAMES[me._pos]}${me._posExact ? '' : ', примерно'}), ${rank}-е место из 10 по оценке. Полоса показывает, какую долю игроков на этом герое ты обошёл.${extra.length ? ' Ещё: ' + extra.join(', ') + '.' : ''}</p>
        <div class="card bench-list">${rows.map(r => `<div class="bench"><span>${METRICS[r.k].name}</span><div class="track"><div class="fill" style="width:${(r.v * 100).toFixed(0)}%;background:${r.v >= .6 ? 'var(--good)' : r.v >= .4 ? 'var(--warn)' : 'var(--bad)'}"></div></div><span class="num">${(r.v * 100).toFixed(0)}%</span></div>`).join('')}</div>
        <div class="issue-list">
          ${weak.map(r => `<div class="card issue">${sevIcon('bad')}<div class="body"><div class="title">${METRICS[r.k].name}: хуже ${(100 - r.v * 100).toFixed(0)}% игроков</div><div class="detail">${METRICS[r.k].tip}</div></div></div>`).join('')}
          ${strong.length ? `<div class="card issue good">${sevIcon('good')}<div class="body"><div class="title">Получилось хорошо</div><div class="detail">${strong.map(r => METRICS[r.k].name.toLowerCase()).join(', ')}: лучше 70%+ игроков на этом герое.</div></div></div>` : ''}
          ${!weak.length ? `<div class="card issue good">${sevIcon('good')}<div class="body"><div class="title">Серьёзных провалов нет</div><div class="detail">По ключевым показателям роли ты не хуже большинства.</div></div></div>` : ''}
        </div></div>`;
  }
  $('dlgBody').innerHTML = parseBlock(m) + mineBlock + table(mine, me ? 'Твоя команда' : 'Radiant', me ? won : m.radiant_win) + table(theirs, me ? 'Враги' : 'Dire', me ? !won : !m.radiant_win) + `
    <p class="note">Оценка 0–10: сравнение с другими игроками на том же герое по метрикам роли (позиции 1–3 считаются корами, 4–5 саппортами).</p>
    <div class="row note"><a href="https://www.opendota.com/matches/${m.match_id}" target="_blank" rel="noopener">OpenDota</a><a href="https://www.dotabuff.com/matches/${m.match_id}" target="_blank" rel="noopener">Dotabuff</a><a href="https://stratz.com/matches/${m.match_id}" target="_blank" rel="noopener">Stratz</a></div>`;
  wireParse(m);
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
  const parts = c.vs.map(([e, v]) => `<span title="против ${esc(heroName(e))}">${heroImg(e) ? `<img src="${heroImg(e)}" alt="">` : ''}<b class="${signCls(v)}">${pct(v)}</b></span>`)
    .concat(c.wi.map(([a, v]) => `<span title="вместе с ${esc(heroName(a))}">+${heroImg(a) ? `<img src="${heroImg(a)}" alt="">` : ''}<b class="${signCls(v)}">${pct(v)}</b></span>`));
  return `<div class="cand ${mineCls || ''}">${heroCell(c.h)}<span class="score ${signCls(c.score)}">${pct(c.score)}</span><div class="breakdown">${parts.join('')}<span class="dim">мета ${pct(c.base)}</span></div></div>`;
}

function renderDraft(m, G) {
  if (!G) { $('dlgBody').innerHTML = '<div class="empty">Данные по матчапам ещё не собраны.</div>'; return; }
  const { me, mine, theirs } = teams(m);
  const myH = mine.map(p => p.hero_id), thH = theirs.map(p => p.hero_id);
  const matrix = mine.map(p => thH.map(e => adv(G, p.hero_id, e)));
  const total = matrix.flat().reduce((s, v) => s + v, 0);
  const synOf = hs => { let s = 0; for (let i = 0; i < hs.length; i++) for (let j = i + 1; j < hs.length; j++) s += syn(G, hs[i], hs[j]); return s; };
  const synMine = synOf(myH), synTheirs = synOf(thH);
  const metaMine = myH.reduce((s, h) => s + (heroWr(G, h) - .5) * 100, 0), metaTheirs = thH.reduce((s, h) => s + (heroWr(G, h) - .5) * 100, 0);

  let html = `
    <div class="section"><h3 class="section-title">Кто кого контрпикает</h3>
      <p class="note">Строки — ваши герои, столбцы — враги. Число показывает, насколько герой слева выигрывает чаще ожидаемого против героя сверху в ${GROUPS[S.group]} (${(G.matches / 1000).toFixed(0)}k матчей за ${G.days} дней).</p>
      <div class="card table-wrap"><table class="matrix"><thead><tr><th></th>${theirs.map(p => `<th class="hcol">${posBadge(p)} ${heroIcon(p.hero_id)}</th>`).join('')}<th class="num">Итого</th></tr></thead>
      <tbody>${mine.map((p, i) => `<tr class="${p === me ? 'me' : ''}"><td><div class="row">${posBadge(p)}${heroCell(p.hero_id)}</div></td>${matrix[i].map(advCell).join('')}<td class="num ${signCls(matrix[i].reduce((s, v) => s + v, 0))}"><b>${pct(matrix[i].reduce((s, v) => s + v, 0))}</b></td></tr>`).join('')}
      <tr><td class="muted">Итого против врага</td>${thH.map((_, j) => { const s = matrix.reduce((a, r) => a + r[j], 0); return `<td class="num ${signCls(s)}">${pct(s)}</td>`; }).join('')}<td class="num ${signCls(total)}"><b>${pct(total)}</b></td></tr></tbody></table></div>
    </div>
    <div class="stats-grid">
      <div class="card stat"><div class="label">Матчапы</div><div class="value ${signCls(total)}">${pct(total)}</div><div class="sub">${total >= 2 ? 'вы законтрили врага' : total <= -2 ? 'враг законтрил вас' : 'примерно поровну'}</div></div>
      <div class="card stat"><div class="label">Сочетание у вас</div><div class="value ${signCls(synMine)}">${pct(synMine)}</div><div class="sub">у врага ${pct(synTheirs)}</div></div>
      <div class="card stat"><div class="label">Сила героев в мете</div><div class="value ${signCls(metaMine - metaTheirs)}">${pct(metaMine - metaTheirs)}</div><div class="sub">ваши ${pct(metaMine)} / их ${pct(metaTheirs)}</div></div>
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
      <div class="section"><h3 class="section-title">Твой пик: ${esc(heroName(me.hero_id))}</h3>
        <p class="note">Позиция ${me._pos} (${POS_NAMES[me._pos]}). ${myIdx >= 0 ? `${myIdx + 1}-е место из ${list.length} подходящих героев против этого состава.` : ''} Счёт = сумма матчапов против 5 врагов + сочетание с союзниками + сила героя в мете.</p>
        <div class="card">${candRow(myC, 'mine')}</div>
      </div>
      <div class="section"><h3 class="section-title">Кого лучше было бы взять</h3>
        <p class="note">Лучшие герои на позицию ${me._pos} против этих врагов и с этими союзниками. Учти, что в драфте не все враги известны заранее: если ты пикал рано, смотри на матчапы против первых пиков.</p>
        <div class="card">${top.map(c => candRow(c)).join('')}</div>
        ${fromPool.length ? `<h3 class="label">Из твоих героев (10+ игр)</h3><div class="card">${fromPool.map(c => candRow(c)).join('')}</div>` : ''}
        ${myHero ? `<p class="note">Твой винрейт на ${esc(heroName(me.hero_id))}: ${(myHero.win / myHero.games * 100).toFixed(0)}% за ${myHero.games} игр. Комфортный герой часто важнее пары процентов матчапа.</p>` : ''}
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
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Преимущество по золоту по минутам">
    <defs><clipPath id="cpUp"><rect x="0" y="0" width="${W}" height="${y(0)}"/></clipPath><clipPath id="cpDn"><rect x="0" y="${y(0)}" width="${W}" height="${H}"/></clipPath></defs>
    ${yt.map(v => `<line class="${v === 0 ? 'zero' : 'grid'}" x1="${PL}" x2="${W - PR}" y1="${y(v)}" y2="${y(v)}"/><text class="axis" x="${PL - 6}" y="${y(v) + 4}" text-anchor="end">${v > 0 ? '+' : ''}${fmt(v)}</text>`).join('')}
    ${xt.map(t => `<text class="axis" x="${x(t)}" y="${H - 8}" text-anchor="middle">${t}′</text>`).join('')}
    <path d="${area}" fill="var(--good)" fill-opacity=".22" clip-path="url(#cpUp)"/>
    <path d="${area}" fill="var(--bad)" fill-opacity=".22" clip-path="url(#cpDn)"/>
    <polyline points="${pts}" fill="none" stroke="var(--fg)" stroke-width="2" stroke-linejoin="round"/>
    ${roshans.map(r => `<g><line x1="${x(r.time / 60)}" x2="${x(r.time / 60)}" y1="${PT}" y2="${H - PB}" stroke="${r.ours ? 'var(--good)' : 'var(--bad)'}" stroke-dasharray="3 3" stroke-opacity=".6"/><text class="axis" x="${x(r.time / 60) + 3}" y="${PT + 10}">Рошан</text></g>`).join('')}
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
    tip.innerHTML = `<b>${i}′</b> · ${adv[i] >= 0 ? 'вы впереди на' : 'враг впереди на'} <b class="${signCls(adv[i])}">${fmt(Math.abs(adv[i]))}</b>${f ? `<br>Драка: ${f.ourDeaths}:${f.theirDeaths} по смертям, ${f.swing >= 0 ? '+' : ''}${fmt(f.swing)} золота` : ''}`;
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
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Перевес драфта по времени игры">
    ${[-ym, 0, ym].map(v => `<line class="${v === 0 ? 'zero' : 'grid'}" x1="${PL}" x2="${W - PR}" y1="${y(v)}" y2="${y(v)}"/><text class="axis" x="${PL - 6}" y="${y(v) + 4}" text-anchor="end">${v > 0 ? '+' : ''}${v}%</text>`).join('')}
    ${curve.map((v, i) => { const x0 = PL + i * bw + 6, top = Math.min(y(v), y(0)), h = Math.max(1, Math.abs(y(v) - y(0))); const past = upto != null && i > upto;
      return `<g><title>${DUR_LABELS[i]} мин: ${pct(v)}</title><rect x="${x0}" y="${top}" width="${bw - 12}" height="${h}" rx="3" fill="${v >= 0 ? 'var(--good)' : 'var(--bad)'}" fill-opacity="${past ? .3 : .85}"/>
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
    return groups.map(([a, b]) => END[b] == null ? `после ${START[a]} мин` : START[a] === 0 ? `до ${END[b]} мин` : `${START[a]}–${END[b]} мин`).join(', ');
  };
  return { strong: span(strong), weak: span(weak) };
}

function renderFlow(m, G) {
  const { me, mine, theirs, sign, won } = teams(m);
  if (!G) { $('dlgBody').innerHTML = '<div class="empty">Данные меты ещё не собраны.</div>'; return; }
  const curve = draftCurve(G, mine.map(p => p.hero_id), theirs.map(p => p.hero_id));
  const w = windowsText(curve);
  const endBin = durBinOf(m.duration);
  let html = parseBlock(m);
  const insights = [];
  const peak = curve.indexOf(Math.max(...curve)), dip = curve.indexOf(Math.min(...curve));
  insights.push({ sev: 'info', title: 'Окна по драфту', detail: `${w.strong ? `Ваш драфт сильнее: ${w.strong}. В эти минуты надо искать драки, смоки и объекты.` : 'Явных окон силы у вашего драфта нет.'} ${w.weak ? `Слабее: ${w.weak}. Тут лучше фармить, защищаться и не принимать драки без преимущества.` : ''} Пик силы: ${DUR_LABELS[peak]} мин, спад: ${DUR_LABELS[dip]} мин.` });
  if (curve[endBin] <= -2 && !won) insights.push({ sev: 'bad', title: 'Игра ушла в окно врага', detail: `Матч закончился на ${mmss(m.duration)}, когда драфт врага сильнее. Надо было закрывать игру раньше.` });
  if (curve[endBin] >= 2 && won) insights.push({ sev: 'good', title: 'Игра закончилась в ваше окно', detail: 'Вы закрыли матч там, где ваш драфт сильнее.' });

  if (m.version && m.radiant_gold_adv?.length) {
    const adv = m.radiant_gold_adv.map(v => v * sign);
    const idxOf = p => m.players.indexOf(p);
    const fights = (m.teamfights || []).map(t => {
      const our = mine.reduce((s, p) => s + (t.players[idxOf(p)]?.gold_delta || 0), 0), their = theirs.reduce((s, p) => s + (t.players[idxOf(p)]?.gold_delta || 0), 0);
      const ourDeaths = mine.reduce((s, p) => s + (t.players[idxOf(p)]?.deaths || 0), 0), theirDeaths = theirs.reduce((s, p) => s + (t.players[idxOf(p)]?.deaths || 0), 0);
      return { start: t.start, end: t.end, mid: (t.start + t.end) / 2, swing: our - their, ourDeaths, theirDeaths, deaths: t.deaths };
    });
    const roshans = (m.objectives || []).map(o => ({ time: o.time, ours: (o.team === 2) === (sign === 1) }));
    html += `<div class="section"><h3 class="section-title">Преимущество по золоту</h3>
      <div class="card chart-wrap">${goldChart(adv, fights, roshans)}<div class="tip" hidden></div></div>
      <div class="legend"><span><i style="background:var(--good)"></i>выигранная драка</span><span><i style="background:var(--bad)"></i>проигранная драка</span><span>размер точки = число смертей</span><span>пунктир = Рошан</span></div></div>`;

    const maxLead = Math.max(...adv), maxDef = Math.min(...adv);
    const tLead = adv.indexOf(maxLead), tDef = adv.indexOf(maxDef);
    if (!won && maxLead >= 8000) insights.push({ sev: 'bad', title: 'Выброшенная игра', detail: `На ${tLead}′ вы вели на ${fmt(maxLead)} золота и проиграли. Смотри драки после этой минуты: скорее всего, бой без вижна или без ключевых кнопок.` });
    if (won && maxDef <= -8000) insights.push({ sev: 'good', title: 'Камбэк', detail: `На ${tDef}′ отставали на ${fmt(-maxDef)} золота и вытащили.` });
    if (won && maxDef > -2000) insights.push({ sev: 'good', title: 'Контролируемая победа', detail: 'Враг ни разу не вёл заметно по золоту.' });

    const big = [...fights].sort((a, b) => Math.abs(b.swing) - Math.abs(a.swing)).slice(0, 5).sort((a, b) => a.start - b.start);
    const fightRows = big.map(f => {
      const bin = durBinOf(f.mid), win = f.swing >= 0, inStrong = curve[bin] >= 2, inWeak = curve[bin] <= -2;
      let advice = '';
      if (!win && inWeak) advice = 'Драка в окне врага: лучше было не принимать её, а фармить или отступить.';
      else if (!win && inStrong) advice = 'Окно было ваше, но драка проиграна. Дело в исполнении: позиция, кнопки, вход по одному.';
      else if (!win) advice = 'Проигранная драка. Проверь, был ли вижн и все ли пришли.';
      else if (win && inWeak) advice = 'Отличная драка против более сильного по времени драфта.';
      else advice = 'Хорошая драка. Важно, что было после: взяли ли башню или Рошана.';
      return `<div class="card issue ${win ? 'good' : 'bad'}">${sevIcon(win ? 'good' : 'bad')}<div class="body"><div class="title">${mmss(f.start)} · ${win ? 'выиграна' : 'проиграна'} · смерти ${f.theirDeaths}:${f.ourDeaths}</div><div class="detail">${advice}</div></div><div class="val ${signCls(f.swing)}">${f.swing >= 0 ? '+' : ''}${fmt(f.swing)}</div></div>`;
    }).join('');
    const ourW = fights.filter(f => f.swing >= 0).length;
    if (fights.length) insights.push({ sev: ourW >= fights.length / 2 ? 'good' : 'warn', title: `Драки: ${ourW} из ${fights.length} выиграно`, detail: 'Ниже самые крупные драки по изменению золота.' });

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
    html += `<div class="section"><h3 class="section-title">Ключевые тайминги коров</h3><p class="note">Первые три крупных предмета (от 2500 золота) у позиций 1–3. Это моменты, когда герой резко усиливается.</p>
      <div class="card table-wrap"><table><thead><tr><th>Время</th><th>Команда</th><th>Герой</th><th>Предмет</th></tr></thead><tbody>${timings.slice(0, 15).map(r => `<tr><td class="num">${mmss(r.t)}</td><td class="${r.ours ? 'pos' : 'neg'}">${r.ours ? 'вы' : 'враг'}</td><td>${heroCell(r.p.hero_id)}</td><td><div class="row">${itemIcon(r.k)}${esc(itemName(r.k))}</div></td></tr>`).join('')}</tbody></table></div></div>`;
    html += `<div class="section"><h3 class="section-title">Крупные драки</h3><div class="issue-list">${fightRows || '<div class="empty">Драк не найдено.</div>'}</div></div>`;
  }

  html = `<div class="section"><h3 class="section-title">Когда вы были сильнее</h3>
    <p class="note">Перевес вашего драфта по длительности игры: как герои обеих команд выигрывают в зависимости от минуты окончания матча в ${GROUPS[S.group]}. Бледные столбики — время после конца этой игры.</p>
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
  if (!me) { $('dlgBody').innerHTML = '<div class="empty">Тебя нет в этом матче.</div>'; return; }
  const h = me.hero_id;
  const bought = new Set([...(me.purchase_log || []).map(e => e[1]), ...finalItems(me)]);
  const pro = S.meta?.pro_items?.[h] || {};
  let html = parseBlock(m);

  html += `<div class="section"><h3 class="section-title">Твой билд на ${esc(heroName(h))}</h3>
    <div class="card pad"><div class="row">${finalItems(me).map(k => `<span class="row">${itemIcon(k)}<span class="note">${esc(itemName(k))}</span></span>`).join('')}${me.item_neutral && S.itemIds?.[me.item_neutral] ? `<span class="row">${itemIcon(S.itemIds[me.item_neutral])}<span class="note">нейтралка</span></span>` : ''}</div></div></div>`;

  const bigs = [];
  if (m.version) {
    const seen = new Set();
    for (const [t, k] of me.purchase_log || []) if (isBigItem(k) && !seen.has(k)) { seen.add(k); bigs.push({ t, k }); }
  }
  html += `<div class="section"><h3 class="section-title">Тайминги</h3>${m.version ? `<p class="note">Когда ты собрал крупные предметы, по сравнению с медианой про-игроков на этом герое в патче ${S.meta?.patch || ''} и с винрейтом в пабах при таком тайминге.</p><div class="card" id="timingRows"><div class="loading"><div class="spinner"></div></div></div>` : '<p class="note">Тайминги видны только после разбора реплея.</p>'}</div>`;

  const missing = Object.entries(pro).filter(([k, [rate]]) => rate >= 0.3 && isBigItem(k) && !bought.has(k)).sort((a, b) => b[1][0] - a[1][0]).slice(0, 5);
  html += `<div class="section"><h3 class="section-title">Что обычно собирают про-игроки</h3>
    ${Object.keys(pro).length ? `<div class="card">${Object.entries(pro).filter(([k]) => isBigItem(k)).sort((a, b) => b[1][0] - a[1][0]).slice(0, 10).map(([k, [rate, t]]) => `<div class="item-row">${itemIcon(k)}<div><div class="name">${esc(itemName(k))} ${bought.has(k) ? '<span class="chip pos">есть</span>' : ''}</div><div class="why">в ${(rate * 100).toFixed(0)}% игр, медиана ${mmss(t)}</div></div><div></div></div>`).join('')}</div>
    ${missing.length ? `<p class="note">Ты не собрал: ${missing.map(([k]) => esc(itemName(k))).join(', ')}. Не обязательно ошибка, но стоит понимать, почему.</p>` : ''}` : '<p class="note">На этом герое мало про-игр в текущем патче.</p>'}</div>`;

  const ci = counterItemsFor(theirs.map(p => p.hero_id), h).slice(0, 8);
  html += `<div class="section"><h3 class="section-title">Предметы против этих врагов</h3>
    <p class="note">Что про-игроки собирают против героев из этого матча чаще обычного, с учётом того, что подходит твоему герою.</p>
    <div class="card">${ci.length ? ci.map(c => `<div class="item-row">${itemIcon(c.k)}<div><div class="name">${esc(itemName(c.k))} ${bought.has(c.k) ? '<span class="chip pos">куплено</span>' : ''}</div><div class="why">${esc(itemWhy(c.k))}</div><div class="breakdown" style="margin-top:4px">${c.vs.map(([e, l]) => `<span>${heroImg(e) ? `<img src="${heroImg(e)}" alt="${esc(heroName(e))}" title="${esc(heroName(e))}">` : ''}×${l.toFixed(1)}</span>`).join('')}</div></div><div></div></div>`).join('') : '<div class="empty">Нет данных по этим героям.</div>'}</div></div>`;

  $('dlgBody').innerHTML = html;
  wireParse(m);

  if (m.version) {
    const rowsHtml = await Promise.all(bigs.slice(0, 8).map(async ({ t, k }) => {
      let pub = '';
      try {
        const rows = (await itemTimings(h, k)).filter(r => r.games >= 20);
        const mine = rows.find(r => r.time >= t);
        const bestR = rows.reduce((a, r) => (r.wins / r.games > (a ? a.wins / a.games : -1) ? r : a), null);
        if (mine) pub = `в пабах к ${mmss(mine.time)}: WR ${(mine.wins / mine.games * 100).toFixed(0)}%` + (bestR && bestR !== mine ? `, лучший тайминг к ${mmss(bestR.time)}: ${(bestR.wins / bestR.games * 100).toFixed(0)}%` : '');
      } catch { /* timing data optional */ }
      const pm = pro[k]?.[1];
      const diff = pm != null ? t - pm : null;
      const cls = diff == null ? '' : diff <= 60 ? 'pos' : diff <= 240 ? '' : 'neg';
      return `<div class="item-row">${itemIcon(k)}<div><div class="name">${esc(itemName(k))} · ${mmss(t)}</div><div class="why">${pm != null ? `у про медиана ${mmss(pm)}` : 'у про редко'}${pub ? ' · ' + pub : ''}</div></div><div class="lift ${cls}">${diff == null ? '' : (diff > 0 ? '+' : '−') + mmss(Math.abs(diff))}</div></div>`;
    }));
    const el = $('timingRows');
    if (el) el.innerHTML = rowsHtml.join('') || '<div class="empty">Крупных предметов не было.</div>';
  }
}

/* ---------- meta view ---------- */

function renderGroupTabs() {
  $('groupTabs').innerHTML = [1, 2, 3, 4].map(g => `<button class="tab" data-g="${g}" aria-selected="${g === S.metaGroup}">${GROUPS[g]}</button>`).join('');
  $('posTabs').innerHTML = [0, 1, 2, 3, 4, 5].map(p => `<button class="tab" data-p="${p}" aria-selected="${p === S.metaPos}">${p ? `${p} · ${POS_NAMES[p]}` : 'Все позиции'}</button>`).join('');
  $('groupTabs').querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => { S.metaGroup = +b.dataset.g; store.set('metaGroup', S.metaGroup); renderMeta(); }));
  $('posTabs').querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => { S.metaPos = +b.dataset.p; renderMeta(); }));
}

async function renderMeta() {
  renderGroupTabs();
  if (!S.meta) { $('metaInfo').textContent = 'Данные меты ещё не собраны.'; return; }
  let G;
  try { G = await loadGroup(S.metaGroup); } catch { $('metaInfo').textContent = 'Не удалось загрузить данные ранга.'; return; }
  $('metaInfo').textContent = `Патч ${S.meta.patch}. ${GROUPS[S.metaGroup]}: ${G.matches.toLocaleString('ru')} рейтинговых матчей за ${G.days} дней. Предметы: ${S.meta.pro_matches.toLocaleString('ru')} про-матчей патча.`;
  const pos = S.metaPos;
  const list = Object.keys(S.heroes).map(Number).filter(h => G.idx[h] != null && heroPick(G, h) >= 0.02 && (!pos || posPrior(h)[pos - 1] >= 0.18))
    .sort((a, b) => heroWr(G, b) - heroWr(G, a)).slice(0, 20);
  $('tierNote').textContent = pos ? `Герои, которых часто играют на позиции ${pos}, по винрейту.` : 'Все популярные герои по винрейту.';
  $('tierTable').innerHTML = `<thead><tr><th>#</th><th>Герой</th><th class="num">Винрейт</th><th class="num">Пик</th><th class="num">Позиции</th><th class="num">Лучше всего в</th></tr></thead><tbody>` +
    list.map((h, i) => {
      const pr = posPrior(h); const top = pr.map((v, j) => [j + 1, v]).filter(x => x[1] >= 0.18).sort((a, b) => b[1] - a[1]);
      const curve = DUR_LABELS.map((_, b) => durWr(G, h, b)); const bb = curve.indexOf(Math.max(...curve));
      return `<tr><td class="dim">${i + 1}</td><td>${heroCell(h)}</td><td class="num ${signCls(heroWr(G, h) - .5)}">${(heroWr(G, h) * 100).toFixed(1)}%</td><td class="num muted">${(heroPick(G, h) * 100).toFixed(1)}%</td><td class="num">${top.map(([p]) => `<span class="posb">${p}</span>`).join(' ')}</td><td class="num muted">${DUR_LABELS[bb]} мин</td></tr>`;
    }).join('') + '</tbody>';
  renderCounterTool(G);
  renderItemHero(G);
}

function heroByName(name) { const n = name.trim().toLowerCase(); return Object.values(S.heroes).find(h => h.localized_name.toLowerCase() === n)?.id; }
function chips(ids, el, onRemove) {
  el.innerHTML = ids.map(id => `<span class="hchip">${heroImg(id) ? `<img src="${heroImg(id)}" alt="">` : ''}${esc(heroName(id))}<button aria-label="Убрать ${esc(heroName(id))}" data-id="${id}">×</button></span>`).join('');
  el.querySelectorAll('button').forEach(b => b.addEventListener('click', () => onRemove(+b.dataset.id)));
}

function renderCounterTool(G) {
  const exampleFlag = S.enemies.length && S.enemiesExample;
  chips(S.enemies, $('enemyChips'), id => { S.enemies = S.enemies.filter(x => x !== id); S.enemiesExample = false; renderCounterTool(G); });
  chips(S.allies, $('allyChips'), id => { S.allies = S.allies.filter(x => x !== id); renderCounterTool(G); });
  if (exampleFlag) $('enemyChips').insertAdjacentHTML('beforeend', '<span class="example">пример</span>');
  if (!S.enemies.length) { $('counterBest').innerHTML = '<div class="empty">Добавь хотя бы одного врага.</div>'; $('counterWorst').innerHTML = ''; return; }
  const list = candidates(G, S.metaPos, S.enemies, S.allies, [...S.enemies, ...S.allies]);
  $('counterBest').innerHTML = list.slice(0, 8).map(c => candRow(c)).join('');
  $('counterWorst').innerHTML = list.slice(-5).reverse().map(c => candRow(c)).join('');
}

function renderItemHero(G) {
  const h = S.itemHero;
  if (!h) return;
  $('itemHeroTitle').textContent = `Предметы против ${heroName(h)}`;
  const rows = (S.meta?.counter_items?.[h] || []).filter(([k, , obs]) => itemByKey(k) && obs >= 10).slice(0, 10);
  const n = S.meta?.counter_samples?.[h] || 0;
  $('itemCounters').innerHTML = rows.length ? rows.map(([k, lift, obs]) => `<div class="item-row">${itemIcon(k)}<div><div class="name">${esc(itemName(k))}</div><div class="why">${esc(itemWhy(k))}${itemWhy(k) ? ' · ' : ''}${obs} раз в ${Math.round(n / 5)} про-играх</div></div><div class="lift pos">×${lift.toFixed(1)}</div></div>`).join('')
    : '<div class="empty">Мало про-игр против этого героя в патче.</div>';
  const counters = Object.keys(S.heroes).map(Number).filter(x => x !== h && G.idx[x] != null && heroPick(G, x) >= 0.01).map(x => ({ x, v: adv(G, x, h) })).sort((a, b) => b.v - a.v).slice(0, 8);
  $('heroCounters').innerHTML = counters.map(c => `<div class="item-row"><span>${heroIcon(c.x)}</span><div><div class="name">${esc(heroName(c.x))}</div><div class="why">лучшие позиции: ${posPrior(c.x).map((v, j) => [j + 1, v]).filter(z => z[1] >= .18).map(z => z[0]).join(', ')}</div></div><div class="lift pos">${pct(c.v)}</div></div>`).join('');
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

(async function boot() {
  try { await loadBase(); } catch (e) { showError('Не удалось загрузить список героев: ' + e.message); return; }
  route();
  const last = store.get('lastId');
  if (last && location.hash !== '#meta') { $('steamId').value = last; analyze(); }
})();
