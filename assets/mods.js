'use strict';
/* ---------- mods page: the D2A Mods app and the mod list from mods/catalog.json (the same file the app reads) ---------- */

async function renderMods() {
  if (S.modsCatalog === undefined) S.modsCatalog = await getJSON(dataUrl('../mods/catalog.json')).catch(() => null);
  const c = S.modsCatalog, lang = EN ? 'en' : 'ru';
  if (!c) { $('modsBox').innerHTML = `<div class="empty">${L('Не удалось загрузить список модов', 'Couldn\'t load the mod list')}</div>`; return; }
  const cat = { fps: L('FPS', 'FPS'), sound: L('Звук', 'Sound') };
  $('modsBox').innerHTML = `
  <div class="mods-hero card pad">
    <div><h2 class="mods-title">D2A Mods <span class="note">v${esc(c.app.version)}</span></h2>
      <p class="note">${L('Маленькая программа для Windows: отмечаешь моды, нажимаешь «Установить», она сама патчит Dota. Без установки, одно окно.', 'A tiny Windows app: tick the mods, press Install, it patches Dota for you. No installer, one window.')}</p></div>
    <a class="btn" href="${esc(c.app.download)}" rel="noopener">${L('Скачать для Windows', 'Download for Windows')}</a>
  </div>
  <div class="card pad mods-warn">${icon('alert')}<p>${L('Моды меняют файлы игры, а это нарушает правила Steam и Dota. Мы делаем только визуальные и звуковые моды без преимущества в игре, но Valve может их сломать обновлением или наказать. Используй на свой риск.', 'Mods change game files, which breaks the Steam and Dota rules. We only make visual and sound mods with no in-game advantage, but Valve can break them with an update or punish them. Use at your own risk.')}</p></div>
  <section class="section"><h3 class="label">${L('Моды', 'Mods')}</h3><div class="mods-list">${c.mods.map(m => `
    <div class="card pad mod"><div class="row"><b>${esc(m.name[lang])}</b><span class="chip">${cat[m.category] || esc(m.category)}</span></div><p class="note">${esc(m.desc[lang])}</p></div>`).join('')}</div></section>
  <section class="section"><h3 class="label">${L('Как поставить', 'How to install')}</h3><ol class="lesson-tips card pad">
    <li>${L('Скачай D2AMods.exe и закрой Dota 2.', 'Download D2AMods.exe and close Dota 2.')}</li>
    <li>${L('Запусти программу. Если Windows предупредит о неизвестном издателе: «Подробнее» → «Выполнить в любом случае».', 'Run it. If Windows warns about an unknown publisher: More info → Run anyway.')}</li>
    <li>${L('Отметь моды и нажми «Установить». Программа сама найдёт Dota.', 'Tick the mods and press Install. The app finds Dota by itself.')}</li>
    <li>${L('После обновления Dota моды отключаются: открой программу и нажми «Установить» ещё раз.', 'Dota updates switch the mods off: open the app and press Install again.')}</li>
    <li>${L('Вернуть всё как было: «Удалить все моды».', 'To undo everything: Remove all mods.')}</li>
  </ol></section>
  <p class="note">${L('Как это работает: программа берёт пустой эффект и тишину из самой игры, собирает из них свой архив в папке game/dota_d2a и подключает его одной строкой в gameinfo.gi (старый файл сохраняется рядом). Файлы Valve никто не скачивает и не перезаписывает.', 'How it works: the app takes an empty effect and silence from the game itself, packs them into its own archive in game/dota_d2a and mounts it with one line in gameinfo.gi (the old file is kept next to it). Nobody downloads or overwrites Valve\'s files.')}</p>`;
}
