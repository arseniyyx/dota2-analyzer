'use strict';
/* ---------- mods page: the D2A Mods app and the mod list from mods/catalog.json (the same file the app reads) ---------- */

async function renderMods() {
  if (S.modsCatalog === undefined) S.modsCatalog = await getJSON(dataUrl('../mods/catalog.json')).catch(() => null);
  const c = S.modsCatalog, lang = EN ? 'en' : 'ru';
  if (!c) { $('modsBox').innerHTML = `<div class="empty">${L('Не удалось загрузить список модов', 'Couldn\'t load the mod list')}</div>`; return; }
  const cat = { fps: 'FPS', sound: L('Звук', 'Sound'), visual: L('Вид', 'Visual') };
  const tabs = c.tabs || [{ id: 'optimize', name: { ru: 'Моды', en: 'Mods' } }];
  $('modsBox').innerHTML = `
  <div class="mods-hero card pad">
    <div><h2 class="mods-title">D2A Mods <span class="note">v${esc(c.app.version)}</span></h2>
      <p class="note">${L('Маленькая программа для Windows: отмечаешь моды, нажимаешь «Установить», она сама патчит Dota. Без установки, одно окно.', 'A tiny Windows app: tick the mods, press Install, it patches Dota for you. No installer, one window.')}</p></div>
    <a class="btn" href="${esc(c.app.download)}" rel="noopener">${L('Скачать для Windows', 'Download for Windows')}</a>
  </div>
  <div class="card pad mods-warn">${icon('alert')}<p>${L('Моды подменяют файлы игры, и Valve официально такое не поддерживает. Мы делаем только визуальные и звуковые моды без преимущества в игре и без вмешательства в процесс Dota. Обновление игры может их отключить — тогда просто нажми «Установить» ещё раз.', 'Mods replace game files, which Valve does not officially support. We only make visual and sound mods with no in-game advantage and no hooking into the Dota process. A game update can switch them off; then just press Install again.')}</p></div>
  ${tabs.map(t => `<section class="section"><h3 class="label">${esc(t.name[lang])}</h3><div class="mods-list">${c.mods.filter(m => (m.tab || 'optimize') === t.id).map(m => `
    <div class="card pad mod"><div class="row"><b><span class="mod-ic">${esc(m.icon || '')}</span>${esc(m.name[lang])}</b><span class="chip">${cat[m.category] || esc(m.category)}</span></div><p class="note">${esc(m.desc[lang])}</p></div>`).join('')}</div></section>`).join('')}
  <section class="section"><h3 class="label">${L('Каталог D2PFX в программе', 'The D2PFX catalog in the app')}</h3><div class="card pad"><p>${L('Во вкладке «Каталог D2PFX» — больше 200 модов от сообщества: шейдеры тумана войны, ландшафты (тёмный из Minify, DarkPoly, LowPoly и другие), шрифты, курсоры, фоны меню, иконки героев, предметов и рангов, пинги. Скачиваются только те, что ты отметил, и каждый проверяется по контрольной сумме. Платную косметику Valve (герои, арканы, платные ландшафты, курьеры) мы не подключаем.', 'The D2PFX catalog tab has over 200 community mods: fog of war shaders, terrains (the dark one from Minify, DarkPoly, LowPoly and more), fonts, cursors, menu backgrounds, hero, item and rank icons, pings. Only the ones you tick are downloaded, each checked against its checksum. We do not include paid Valve cosmetics (heroes, arcanas, paid terrains, couriers).')}</p>
    <p class="note">${L('Моды из', 'Mods from')} <a href="https://h6rd.github.io/Dota2PornFxWeb" rel="noopener">Dota2PornFx</a>. ${L('Авторы модов', 'Mod authors')}: <a href="https://github.com/h6rd/Dota2PornFxWeb#credits" rel="noopener">github.com/h6rd/Dota2PornFxWeb#credits</a></p></div></section>
  <section class="section"><h3 class="label">${L('Как поставить', 'How to install')}</h3><ol class="lesson-tips card pad">
    <li>${L('Скачай D2AMods.exe и закрой Dota 2.', 'Download D2AMods.exe and close Dota 2.')}</li>
    <li>${L('Запусти программу. Если Windows предупредит о неизвестном издателе: «Подробнее» → «Выполнить в любом случае».', 'Run it. If Windows warns about an unknown publisher: More info → Run anyway.')}</li>
    <li>${L('Отметь моды и нажми «Установить». Программа сама найдёт Dota.', 'Tick the mods and press Install. The app finds Dota by itself.')}</li>
    <li>${L('Моды кладутся в папку языка озвучки (например, dota_russian), поэтому переживают обновления игры. С английским клиентом после обновления нажми «Установить» ещё раз.', 'Mods go into the voice language folder (e.g. dota_russian), so game updates keep them. With an English client press Install again after an update.')}</li>
    <li>${L('Вернуть всё как было: «Удалить все моды».', 'To undo everything: Remove all mods.')}</li>
  </ol></section>
  <p class="note">${L('Как это работает: наши моды программа собирает из пустого эффекта и тишины самой игры, моды D2PFX скачивает как есть. Всё кладётся отдельными файлами pak60–pak99 в папку языка озвучки, а «Удалить все моды» убирает ровно эти файлы. Исключение — шрифты: Dota читает их только из своей папки, поэтому программа заменяет файлы шрифтов, а оригиналы сохраняет и возвращает при удалении.', 'How it works: our mods are built from an empty effect and silence taken from the game, D2PFX mods are downloaded as they are. Everything goes as separate pak60 to pak99 files into the voice language folder, and Remove all mods deletes exactly those files. Fonts are the exception: Dota reads them only from its own folder, so the app replaces the font files, keeps the originals and puts them back on removal.')}</p>`;
}
