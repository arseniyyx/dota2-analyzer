'use strict';
/* ---------- optimisation: launch options, autoexec.cfg and video settings for the player's PC.
   Only official options and console variables; nothing touches game files. Shares globals with app.js. ---------- */

S.opt = S.opt || { pc: 'mid', api: 'dx11', hz: 144, fps: 0, rclick: true, netgraph: true, minimap: false, mapPreload: true };

const OPT_PCS = {
  low: { name: L('Слабый ПК / ноутбук', 'Low-end PC / laptop'), render: '70–80%', shadows: L('Низкие', 'Low'), textures: L('Низкие', 'Low'), effects: L('Низкие', 'Low'), water: L('Низкое', 'Low') },
  mid: { name: L('Средний ПК', 'Mid-range PC'), render: '90–100%', shadows: L('Средние', 'Medium'), textures: L('Средние', 'Medium'), effects: L('Средние', 'Medium'), water: L('Низкое', 'Low') },
  high: { name: L('Мощный ПК', 'High-end PC'), render: '100%', shadows: L('Высокие', 'High'), textures: L('Высокие', 'High'), effects: L('Высокие', 'High'), water: L('Высокое', 'High') },
};
// checkboxes in Video settings that cost FPS without helping you play; which to keep on per PC tier
const OPT_TOGGLES = [
  ['ambient_creatures', L('Фоновые существа', 'Ambient creatures'), { low: 0, mid: 0, high: 0 }, L('Птицы и прочая живность на карте, на игру не влияют', 'Birds and other critters, no gameplay value')],
  ['grass', L('Трава', 'Grass'), { low: 0, mid: 0, high: 1 }, ''],
  ['ambient_cloth', L('Симуляция ткани', 'Ambient cloth simulation'), { low: 0, mid: 0, high: 1 }, ''],
  ['tree_wind', L('Ветер в деревьях', 'Tree wind'), { low: 0, mid: 0, high: 1 }, ''],
  ['atmos_fog', L('Атмосферный туман', 'Atmospheric fog'), { low: 0, mid: 0, high: 1 }, L('Только красота, туман войны не меняет', 'Looks only, does not change the fog of war')],
  ['ao', L('Ambient occlusion', 'Ambient occlusion'), { low: 0, mid: 0, high: 1 }, ''],
  ['additive_light', L('Дополнительный проход света', 'Additive light pass'), { low: 0, mid: 1, high: 1 }, ''],
  ['specular', L('Блики (specular)', 'Specular'), { low: 0, mid: 1, high: 1 }, ''],
  ['normal_maps', L('Карты нормалей', 'Normal maps'), { low: 0, mid: 1, high: 1 }, ''],
  ['world_lighting', L('Освещение мира', 'World lighting'), { low: 0, mid: 1, high: 1 }, ''],
  ['hq_water', L('Качественная вода', 'High-quality water'), { low: 0, mid: 0, high: 1 }, ''],
  ['anim_portrait', L('Анимированный портрет', 'Animate portrait'), { low: 0, mid: 0, high: 1 }, L('Портрет героя в интерфейсе, ощутимо ест FPS на слабых видеокартах', 'The hero portrait in the HUD, costs FPS on weak GPUs')],
  ['vsync', L('Вертикальная синхронизация', 'Vsync'), { low: 0, mid: 0, high: 0 }, L('Добавляет задержку ввода, лучше ограничить FPS', 'Adds input lag, cap FPS instead')],
];

function optCode() {
  const o = S.opt, fps = o.fps || (o.pc === 'low' ? Math.min(o.hz, 90) : o.hz + 30);
  const launch = ['-novid', '-console', o.mapPreload && '-map dota', o.api === 'vulkan' ? '-vulkan' : '-dx11', '+exec autoexec'].filter(Boolean).join(' ');
  const cfg = [
    '// Dota 2 Analyzer — autoexec.cfg',
    'con_enable 1',
    `fps_max ${fps}  // ${L('потолок FPS: ровная картинка и меньше нагрев', 'FPS cap: smoother frames and less heat')}`,
    o.netgraph && `net_graph 1  // ${L('FPS, пинг и потери пакетов в углу экрана', 'FPS, ping and packet loss in the corner')}`,
    o.rclick && `dota_player_auto_repeat_right_mouse 1  // ${L('зажатый ПКМ продолжает двигать героя', 'holding right click keeps your hero moving')}`,
    o.minimap && `dota_minimap_hero_size 800  // ${L('иконки героев на миникарте крупнее', 'bigger hero icons on the minimap')}`,
    `echo "autoexec loaded"`,
  ].filter(Boolean).join('\n');
  return { launch, cfg, fps };
}

function renderOptimize() {
  const o = S.opt, { launch, cfg, fps } = optCode(), pc = OPT_PCS[o.pc];
  const seg = (id, key, items) => `<div class="tabs" id="${id}" role="tablist">${items.map(([v, label]) => `<button class="tab" type="button" data-v="${v}" aria-selected="${String(o[key]) === String(v)}">${label}</button>`).join('')}</div>`;
  const check = (key, label) => `<label class="art-check"><input type="checkbox" data-k="${key}" ${o[key] ? 'checked' : ''}><span>${label}</span></label>`;
  $('optBox').innerHTML = `
  <div class="opt-wrap">
    <div class="card pad stack-sm">
      <div class="art-row col"><span class="label">${L('Твой компьютер', 'Your PC')}</span>${seg('optPc', 'pc', Object.entries(OPT_PCS).map(([k, v]) => [k, v.name]))}</div>
      <div class="art-row col"><span class="label">${L('Графический API', 'Graphics API')}</span>${seg('optApi', 'api', [['dx11', 'DirectX 11'], ['vulkan', 'Vulkan']])}
        <span class="note">${L('Попробуй оба и оставь тот, где FPS выше. На видеокартах AMD часто быстрее Vulkan.', 'Try both and keep the faster one. Vulkan is often faster on AMD cards.')}</span></div>
      <div class="art-row"><label for="optHz">${L('Частота монитора, Гц', 'Monitor refresh, Hz')}</label><input class="field" id="optHz" type="number" min="50" max="500" value="${o.hz}"></div>
      <div class="art-row"><label for="optFps">${L('Потолок FPS', 'FPS cap')}</label><input class="field" id="optFps" type="number" min="0" max="999" value="${o.fps || ''}" placeholder="${fps}"></div>
      ${check('mapPreload', L('Загружать карту при запуске игры (быстрее заход в матч)', 'Load the map at startup (faster into matches)'))}
      ${check('netgraph', L('Показывать FPS и пинг', 'Show FPS and ping'))}
      ${check('rclick', L('Зажатый ПКМ продолжает движение', 'Holding right click keeps moving'))}
      ${check('minimap', L('Крупнее герои на миникарте', 'Bigger heroes on the minimap'))}
    </div>
    <div class="stack-sm">
      <div class="card pad stack-sm">
        <h3 class="label">1. ${L('Параметры запуска', 'Launch options')}</h3>
        <div class="code-row"><code id="optLaunch">${esc(launch)}</code><button class="btn small" type="button" data-copy="optLaunch">${L('Копировать', 'Copy')}</button></div>
        <p class="note">${L('Steam → Библиотека → Dota 2 → ПКМ → Свойства → Общие → Параметры запуска.', 'Steam → Library → Dota 2 → right click → Properties → General → Launch options.')}</p>
      </div>
      <div class="card pad stack-sm">
        <h3 class="label">2. autoexec.cfg</h3>
        <pre class="code-block" id="optCfg">${esc(cfg)}</pre>
        <div class="row"><button class="btn small" type="button" data-copy="optCfg">${L('Копировать', 'Copy')}</button><button class="btn ghost small" type="button" id="optCfgDl">${L('Скачать файл', 'Download the file')}</button></div>
        <p class="note">${L('Положи файл в', 'Put the file into')} <code>Steam\\steamapps\\common\\dota 2 beta\\game\\dota\\cfg\\</code>. ${L('Если в консоли при запуске появилось «autoexec loaded» — всё работает.', 'If the console shows "autoexec loaded" at startup, it works.')}</p>
      </div>
      <div class="card pad stack-sm">
        <h3 class="label">3. ${L('Настройки видео в игре', 'In-game video settings')} · ${esc(pc.name)}</h3>
        <ul class="facts">
          <li>${L('Режим экрана: «Полноэкранный» — меньше задержка, чем в окне.', 'Display mode: Fullscreen has less input lag than windowed.')}</li>
          <li>${L('Качество рендеринга', 'Render quality')}: <b>${pc.render}</b></li>
          <li>${L('Тени', 'Shadows')}: <b>${pc.shadows}</b> · ${L('Текстуры', 'Textures')}: <b>${pc.textures}</b> · ${L('Эффекты', 'Effects')}: <b>${pc.effects}</b> · ${L('Вода', 'Water')}: <b>${pc.water}</b></li>
          <li>${L('Максимальный FPS в настройках', 'Max FPS in settings')}: <b>${fps}</b></li>
        </ul>
        <div class="opt-toggles">${OPT_TOGGLES.map(([, label, on, why]) => `<div class="opt-toggle"><span class="chip ${on[o.pc] ? 'pos' : 'neg'}">${on[o.pc] ? L('вкл', 'on') : L('выкл', 'off')}</span><span>${label}${why ? `<span class="note"> · ${why}</span>` : ''}</span></div>`).join('')}</div>
      </div>
      <div class="card pad stack-sm opt-mods">
        <h3 class="label">${L('А моды вроде Minify?', 'What about mods like Minify?')}</h3>
        <p>${L('Minify и похожие программы подменяют файлы игры: убирают погоду, часть эффектов и звуков. Это даёт немного FPS. Valve официально такое не поддерживает, и обновления игры иногда отключают моды. У нас есть своя программа — раздел «Моды для Dota 2».', 'Minify and similar tools replace game files to strip weather, some effects and sounds. It gains a little FPS. Valve does not officially support it, and game updates sometimes switch mods off. We have our own app: see Mods for Dota 2.')}</p>
        <p class="note">${L('Всё выше — официальные настройки и команды, их можно использовать спокойно. Моды, которые дают преимущество (убрать туман войны, отдалить камеру сильнее разрешённого), — это читы, мы их не делаем.', 'Everything above is official settings and commands, safe to use. Mods that give an advantage (removing the fog of war, zooming the camera out further than allowed) are cheats, and we don\'t make them.')}</p>
      </div>
    </div>
  </div>`;
  const box = $('optBox');
  [['optPc', 'pc'], ['optApi', 'api']].forEach(([id, key]) => $(id).querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => { o[key] = b.dataset.v; renderOptimize(); })));
  box.querySelectorAll('input[type="checkbox"][data-k]').forEach(c => c.addEventListener('change', () => { o[c.dataset.k] = c.checked; renderOptimize(); }));
  $('optHz').addEventListener('change', e => { o.hz = Math.max(50, Math.min(500, +e.target.value || 60)); renderOptimize(); });
  $('optFps').addEventListener('change', e => { o.fps = Math.max(0, Math.min(999, +e.target.value || 0)); renderOptimize(); });
  box.querySelectorAll('[data-copy]').forEach(b => b.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($(b.dataset.copy).textContent); b.textContent = L('Скопировано', 'Copied'); } catch { b.textContent = L('Выдели и скопируй', 'Select and copy'); }
    setTimeout(() => { b.textContent = L('Копировать', 'Copy'); }, 1500);
  }));
  $('optCfgDl').addEventListener('click', () => {
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([cfg + '\n'], { type: 'text/plain' })), download: 'autoexec.cfg' });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });
}
