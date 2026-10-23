'use strict';
/* ---------- who pressed the glyph: per-player glyph presses from a parsed replay.
   OpenDota keeps them as order 24 in players[].actions, Stratz as stats.actionReport.glyphCast.
   Neither keeps the times of the presses. Shares globals with app.js. ---------- */

const GLYPH_ORDER = '24'; // DOTA_UNIT_ORDER_GLYPH
const glyphMatchId = s => (String(s).match(/\d{8,12}/) || [])[0];

async function glyphOpenDota(id) {
  const m = await getJSON(`${API}/matches/${id}`);
  const rows = m.players?.some(p => p.actions) ? m.players.map(p => ({
    radiant: p.player_slot < 128, hero: p.hero_id, name: p.personaname || p.name || L('Скрытый профиль', 'Hidden profile'), n: +(p.actions?.[GLYPH_ORDER] || 0),
  })) : null;
  return { m, rows };
}

async function glyphStratz(id) {
  const d = await stratzQ(`{ match(id: ${+id}) { parsedDateTime players { isRadiant heroId steamAccount { name } stats { actionReport { glyphCast } } } } }`);
  if (!d.match?.parsedDateTime) return null;
  return d.match.players.map(p => ({ radiant: p.isRadiant, hero: p.heroId, name: p.steamAccount?.name || L('Скрытый профиль', 'Hidden profile'), n: p.stats?.actionReport?.glyphCast || 0 }));
}

function drawGlyph(m, rows, source) {
  const team = radiant => {
    const ps = rows.filter(r => r.radiant === radiant), total = ps.reduce((s, r) => s + r.n, 0);
    const win = m && m.radiant_win != null ? m.radiant_win === radiant : null;
    return `<div class="card pad glyph-team ${radiant ? 'radiant' : 'dire'}">
      <div class="glyph-head"><b>${radiant ? 'Radiant' : 'Dire'}</b>${win == null ? '' : `<span class="chip ${win ? 'pos' : 'neg'}">${win ? L('Победа', 'Win') : L('Поражение', 'Loss')}</span>`}
        <span class="note">${L('глиф нажат', 'glyph used')}: <b>${total}</b></span></div>
      ${ps.map(r => `<div class="glyph-row ${r.n ? 'pressed' : ''}">${heroImg(r.hero) ? `<img src="${heroImg(r.hero)}" alt="">` : '<span></span>'}
        <span class="glyph-who"><b>${esc(r.name)}</b><span class="note">${esc(heroName(r.hero))}</span></span>
        <span class="glyph-n">${r.n ? `${r.n}×` : '—'}</span></div>`).join('')}
    </div>`;
  };
  const who = radiant => rows.filter(r => r.radiant === radiant && r.n).sort((a, b) => b.n - a.n).map(r => `${r.name} (${r.n})`).join(', ') || L('никто', 'nobody');
  const meta = m ? [m.duration ? `${L('матч', 'match')} ${mmss(m.duration)}` : '', m.start_time ? new Date(m.start_time * 1000).toLocaleString(LOC, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : ''].filter(Boolean).join(' · ') : '';
  $('glyphBox').innerHTML = `
    <p class="glyph-sum">${L('Глиф Radiant', 'Radiant glyph')}: <b>${esc(who(true))}</b> · ${L('Глиф Dire', 'Dire glyph')}: <b>${esc(who(false))}</b></p>
    <div class="glyph-grid">${team(true)}${team(false)}</div>
    <p class="note">${meta ? meta + ' · ' : ''}${L('данные', 'data')}: ${source}. ${L('В реплее хранится, сколько раз игрок нажал глиф, но не время нажатий. Нажатие во время перезарядки тоже может попасть в счёт.', 'The replay keeps how many times each player pressed the glyph, not when. A press during the cooldown can count too.')}</p>`;
}

async function runGlyph(raw) {
  const id = glyphMatchId(raw), box = $('glyphBox');
  if (!id) { box.innerHTML = `<p class="note">${L('Вставь номер матча или ссылку на него.', 'Paste a match ID or a link to it.')}</p>`; return; }
  history.replaceState(null, '', `#glyph-${id}`);
  box.innerHTML = `<div class="loading"><div class="spinner"></div></div>`;
  let od = null;
  try { od = await glyphOpenDota(id); } catch (e) { if (!stratzToken()) { box.innerHTML = `<p class="note">${esc(e.message)}</p>`; return; } }
  if (od?.rows) return drawGlyph(od.m, od.rows, 'OpenDota');
  if (stratzToken()) {
    const rows = await glyphStratz(id).catch(() => null);
    if (rows) return drawGlyph(od?.m, rows, 'Stratz');
  }
  // not parsed anywhere yet: ask OpenDota to parse the replay and check back every 10 seconds
  const pending = parsePendingSince(id);
  box.innerHTML = `<div class="card pad stack-sm"><p>${L('Реплей этого матча ещё не разобран, а без разбора не видно, кто жал глиф.', 'This replay is not parsed yet, and without parsing the glyph presses are not known.')}</p>
    <div class="row"><button class="btn small" id="glyphParse" ${pending ? 'disabled' : ''}>${pending ? L('Разбираю реплей…', 'Parsing the replay…') : L('Разобрать реплей', 'Parse the replay')}</button>
    <span class="note" id="glyphParseNote">${pending ? L('обычно 1–5 минут, страница обновится сама', 'usually 1–5 minutes, the page updates by itself') : L('бесплатно, через OpenDota, обычно 1–5 минут', 'free, via OpenDota, usually 1–5 minutes')}</span></div></div>`;
  const wait = async () => {
    while (parsePendingSince(id) && location.hash === `#glyph-${id}`) {
      await new Promise(r => setTimeout(r, 10000));
      const fresh = await glyphOpenDota(id).catch(() => null);
      if (fresh?.rows && location.hash === `#glyph-${id}`) return drawGlyph(fresh.m, fresh.rows, 'OpenDota');
    }
  };
  if (pending) return wait();
  $('glyphParse').addEventListener('click', async () => {
    $('glyphParse').disabled = true;
    if (await requestParse(id)) { $('glyphParse').textContent = L('Разбираю реплей…', 'Parsing the replay…'); $('glyphParseNote').textContent = L('обычно 1–5 минут, страница обновится сама', 'usually 1–5 minutes, the page updates by itself'); wait(); }
    else { $('glyphParse').disabled = false; $('glyphParseNote').textContent = L('OpenDota не принял запрос, попробуй через минуту', 'OpenDota refused the request, try again in a minute'); }
  });
}

function renderGlyph() {
  const id = (location.hash.match(/^#glyph-(\d+)/) || [])[1];
  if (id && $('glyphId').value !== id) { $('glyphId').value = id; runGlyph(id); }
  else if (!id) $('glyphId').focus();
}

$('glyphForm').addEventListener('submit', e => { e.preventDefault(); runGlyph($('glyphId').value); });
