/* ============================================================
   13-seasons.js
   Ядро системы сезонов + UI.

   Приоритет currentSeason: localStorage > облако > календарь.
   switchSeason() сохраняет выбор в localStorage.
   ============================================================ */

/* ============================================================
   1. МИГРАЦИЯ СТАРЫХ ДАННЫХ
   ============================================================ */

function migrateToSeasons() {
  if (DB.seasons && Object.keys(DB.seasons).length > 0) {
    ensureSeasonState();
    return;
  }

  const legacyPlayers = Array.isArray(DB.players) ? DB.players : [];
  const now = new Date().toISOString();

  // Если в localStorage уже есть валидный выбор — используем его
  const stored = (() => { try { return localStorage.getItem(STORAGE_SEASON_KEY); } catch (e) { return null; } })();
  const initialKey = (stored && /^\d{4}\/\d{2}$/.test(stored))
    ? stored
    : (currentSeasonKey() || DEFAULT_SEASON);

  DB.seasons = {
    [initialKey]: {
      players: legacyPlayers,
      createdAt: now,
      archived: false
    }
  };
  currentSeason = initialKey;
  DB.players = legacyPlayers;
  persistCurrentSeason();

  console.log('[seasons] migrateToSeasons: сезон', currentSeason, '| игроков:', legacyPlayers.length);
}

/* ============================================================
   2. ПЕРЕКЛЮЧЕНИЕ СЕЗОНА
   ============================================================ */

function switchSeason(key) {
  if (!DB.seasons || !DB.seasons[key]) {
    uiAlert('Сезон не найден: ' + key);
    return;
  }
  if (key === currentSeason) return;

  // Сначала сохраняем players в старый сезон
  if (DB.seasons[currentSeason]) {
    DB.seasons[currentSeason].players = DB.players;
  }

  currentSeason = key;
  DB.players = DB.seasons[key].players || [];
  seasonsEditable = false;

  // Фиксируем выбор в localStorage немедленно
  persistCurrentSeason();

  currentPlayerId = null;
  currentTab = 'skills';
  currentPlanMonth = null;
  if (typeof playerCalMonth !== 'undefined') playerCalMonth = null;
  if (typeof coachCalMonth !== 'undefined')  coachCalMonth = null;
  reportMonth = null;

  saveDB();
  updateSeasonSelector();
  updateArchiveBadge();

  if (typeof showScreen === 'function')       showScreen('coach-calendar');
  if (typeof renderPlayers === 'function')    renderPlayers();
  if (typeof updateNotifBadge === 'function') updateNotifBadge();

  toast('Сезон: ' + formatSeasonLabel(key));
}

/* ============================================================
   3. СОЗДАНИЕ СЕЗОНА
   ============================================================ */

function createSeason(opts) {
  const { key, fromSeason, playerIds, copy } = opts;

  if (!key || !/^\d{4}\/\d{2}$/.test(key)) {
    uiAlert('Неверный формат сезона. Нужно: 2027/28');
    return false;
  }
  if (DB.seasons[key]) {
    uiAlert('Сезон ' + key + ' уже существует');
    return false;
  }

  let players = [];

  if (fromSeason && DB.seasons[fromSeason]) {
    const sourcePlayers = DB.seasons[fromSeason].players || [];
    const ids = new Set(playerIds || []);
    players = sourcePlayers
      .filter(p => ids.has(p.id))
      .map(p => copyPlayerForNewSeason(p, copy));
  }

  DB.seasons[key] = {
    players,
    createdAt: new Date().toISOString(),
    archived: false
  };

  saveDB();
  updateSeasonSelector();
  toast('Сезон ' + formatSeasonLabel(key) + ' создан: ' + players.length + ' игроков');
  return true;
}

function copyPlayerForNewSeason(p, copy) {
  const np = {
    id: uid('p'),
    fio: p.fio || '',
    birthDay: p.birthDay || '',
    birthMonth: p.birthMonth || '',
    birthYear: p.birthYear || '',
    height: p.height || '',
    weight: p.weight || '',
    team: p.team || '',
    city: p.city || '',
    firstSchool: p.firstSchool || '',
    position: p.position || 'Нападающий',
    grip: p.grip || 'Правый',

    photo: copy && copy.photo ? (p.photo || '') : '',
    characteristic: copy && copy.characteristic ? (p.characteristic || '') : '',

    techDetail: defaultTechDetail(),
    otherDetail: defaultOtherDetail(),

    stats: [],
    tests: [],
    calendar: {},
    developmentPlans: [],
    plans: {}
  };

  if (copy && copy.tech && Array.isArray(p.techDetail)) {
    np.techDetail = p.techDetail.map(r => ({
      group: r.group || '', sub: r.sub || '', name: r.name || '',
      start: null, mid: null, end: null
    }));
  }
  if (copy && copy.other && Array.isArray(p.otherDetail)) {
    np.otherDetail = p.otherDetail.map(r => ({
      group: r.group || '', sub: r.sub || '', name: r.name || '',
      start: null, plan: null, fact: null
    }));
  }

  return np;
}

function deepClone(obj) {
  if (obj == null) return obj;
  try { return JSON.parse(JSON.stringify(obj)); }
  catch (e) { console.warn('deepClone error', e); return obj; }
}

/* ============================================================
   4. УДАЛЕНИЕ И ПЕРЕИМЕНОВАНИЕ
   ============================================================ */

function deleteSeason(key) {
  if (!DB.seasons[key]) return false;
  if (key === currentSeason) {
    uiAlert('Нельзя удалить текущий сезон. Сначала переключитесь на другой.');
    return false;
  }
  if (Object.keys(DB.seasons).length <= 1) {
    uiAlert('Нельзя удалить единственный сезон.');
    return false;
  }

  uiConfirm(
    `Удалить сезон ${formatSeasonLabel(key)} со всеми игроками и данными?`,
    () => {
      delete DB.seasons[key];
      saveDB();
      updateSeasonSelector();
      toast('Сезон ' + formatSeasonLabel(key) + ' удалён');
      if (typeof openManageSeasonsModal === 'function') {
        // если модалка управления открыта — перерисуем её
        const modalContent = document.getElementById('modal-content');
        if (modalContent && modalContent.querySelector('.ms-list')) {
          openManageSeasonsModal();
        }
      }
    },
    () => {}
  );

  return true;
}

function renameSeason(oldKey, newKey) {
  if (!DB.seasons[oldKey]) { uiAlert('Сезон не найден'); return false; }
  if (!newKey || !/^\d{4}\/\d{2}$/.test(newKey)) { uiAlert('Формат: 2027/28'); return false; }
  if (newKey === oldKey) return true;
  if (DB.seasons[newKey]) { uiAlert('Сезон ' + newKey + ' уже существует'); return false; }

  DB.seasons[newKey] = DB.seasons[oldKey];
  delete DB.seasons[oldKey];
  if (currentSeason === oldKey) {
    currentSeason = newKey;
    persistCurrentSeason();
  }

  saveDB();
  updateSeasonSelector();
  toast('Сезон переименован в ' + formatSeasonLabel(newKey));
  return true;
}

function setSeasonsEditable(on) {
  seasonsEditable = !!on;
  updateArchiveBadge();
  if (currentPlayerId) {
    const p = DB.players.find(x => x.id === currentPlayerId);
    if (p && typeof renderPlayerCard === 'function') renderPlayerCard(p);
  }
  toast(on ? 'Редактирование архива разрешено' : 'Редактирование архива заблокировано');
}

/* ============================================================
   5. UI: СЕЛЕКТОР СЕЗОНА В ШАПКЕ
   ============================================================ */

function renderSeasonSelector() {
  const el = document.getElementById('season-selector');
  if (!el) return;

  const keys = getSeasonKeys();
  const archive = isArchiveSeason(currentSeason);

  el.innerHTML = `
    <button class="season-btn ${archive ? 'archive' : ''}" onclick="toggleSeasonMenu(event)" title="Переключить сезон">
      <span class="season-btn-label">Сезон</span>
      <span class="season-btn-value">${escapeHtml(formatSeasonLabel(currentSeason))}</span>
      <span class="season-btn-caret">▾</span>
    </button>
    <div class="season-menu" id="season-menu" onclick="event.stopPropagation()">
      <div class="season-menu-head">Сезоны</div>
      <div class="season-menu-list">
        ${keys.map(k => `
          <button class="season-menu-item ${k === currentSeason ? 'active' : ''}" onclick="onSeasonMenuItem('${escapeAttr(k)}')">
            <span class="season-menu-label">${escapeHtml(formatSeasonLabel(k))}</span>
            <span class="season-menu-count">${(DB.seasons[k].players || []).length}</span>
            ${k === currentSeason ? '<span class="season-menu-check">✓</span>' : ''}
          </button>
        `).join('')}
      </div>
      <div class="season-menu-foot">
        <button type="button" class="season-menu-action" onclick="openCreateSeasonModal()">+ Новый сезон</button>
        <button type="button" class="season-menu-action ghost" onclick="openManageSeasonsModal()">Управление</button>
      </div>
    </div>
  `;
}

function updateSeasonSelector() {
  const el = document.getElementById('season-selector');
  if (el) renderSeasonSelector();
}

function toggleSeasonMenu(e) {
  if (e) e.stopPropagation();
  const menu = document.getElementById('season-menu');
  if (!menu) return;
  menu.classList.toggle('active');
}

function onSeasonMenuItem(key) {
  const menu = document.getElementById('season-menu');
  if (menu) menu.classList.remove('active');
  switchSeason(key);
}

document.addEventListener('click', e => {
  const menu = document.getElementById('season-menu');
  if (!menu) return;
  if (!menu.classList.contains('active')) return;
  if (e.target.closest('#season-selector')) return;
  menu.classList.remove('active');
});

/* ============================================================
   6. UI: ПЛАШКА «АРХИВНЫЙ СЕЗОН»
   ============================================================ */

function updateArchiveBadge() {
  const el = document.getElementById('archive-badge');
  if (!el) return;

  if (!isArchiveSeason(currentSeason)) {
    el.innerHTML = '';
    el.style.display = 'none';
    return;
  }

  el.style.display = 'flex';
  if (seasonsEditable) {
    el.className = 'archive-badge editable';
    el.innerHTML = `
      <span class="archive-icon">✎</span>
      <span>Режим редактирования <strong>${escapeHtml(formatSeasonLabel(currentSeason))}</strong> включён. Все изменения сохранятся в архив.</span>
      <button class="btn btn-sm" onclick="setSeasonsEditable(false)">Заблокировать</button>
    `;
  } else {
    el.className = 'archive-badge';
    el.innerHTML = `
      <span class="archive-icon">🔒</span>
      <span>Вы в архивном сезоне <strong>${escapeHtml(formatSeasonLabel(currentSeason))}</strong>. Данные защищены от изменений.</span>
      <button class="btn btn-sm btn-ghost" onclick="setSeasonsEditable(true)">Разрешить редактирование</button>
    `;
  }
}

/* ============================================================
   7. UI: МОДАЛКА СОЗДАНИЯ СЕЗОНА
   ============================================================ */

let __createSeasonCtx = null;

function openCreateSeasonModal() {
  const menu = document.getElementById('season-menu');
  if (menu) menu.classList.remove('active');

  const pk = parseSeasonKey(currentSeason);
  let suggested;
  if (pk) suggested = makeSeasonKey(pk.startYear + 1);
  else    suggested = makeSeasonKey(new Date().getFullYear() + 1);

  const sourceKey = currentSeason;
  const sourcePlayers = (DB.seasons[sourceKey] && DB.seasons[sourceKey].players) || [];

  __createSeasonCtx = {
    key: suggested,
    sourceKey: sourceKey,
    selectedPlayerIds: new Set(sourcePlayers.map(p => p.id)),
    copy: {
      photo: true,
      characteristic: true,
      tech: false,
      other: false
    }
  };

  renderCreateSeasonModal();
}

function renderCreateSeasonModal() {
  const ctx = __createSeasonCtx;
  if (!ctx) return;

  const sourcePlayers = (DB.seasons[ctx.sourceKey] && DB.seasons[ctx.sourceKey].players) || [];
  const allKeys = getSeasonKeys();

  const playerRows = sourcePlayers.length
    ? sourcePlayers.map(p => `
        <label class="cs-player-row">
          <input type="checkbox" class="cs-player-check" ${ctx.selectedPlayerIds.has(p.id) ? 'checked' : ''}
                 onchange="onCreateSeasonPlayerToggle('${escapeAttr(p.id)}', this.checked)">
          <span class="cs-player-info">
            <span class="cs-player-fio">${escapeHtml(p.fio || '')}</span>
            ${(p.position || p.team) ? `<span class="cs-player-meta">${escapeHtml(p.position || '')}${p.position && p.team ? ' · ' : ''}${escapeHtml(p.team || '')}</span>` : ''}
          </span>
        </label>
      `).join('')
    : '<div class="cs-empty">В выбранном сезоне нет игроков</div>';

  openModal(`
    <h3>Создать новый сезон</h3>
    <p class="subtitle" style="margin-top:-8px">Сезон: с 1 июля по 31 мая. Формат названия: 2027/28.</p>

    <div class="field">
      <label>Название нового сезона</label>
      <input type="text" id="cs-new-key" value="${escapeAttr(ctx.key)}"
             placeholder="2027/28"
             oninput="onCreateSeasonKeyInput(this.value)">
      <div class="cs-hint" id="cs-key-hint"></div>
    </div>

    <div class="field">
      <label>Источник игроков</label>
      <select id="cs-source" onchange="onCreateSeasonSourceChange(this.value)">
        <option value="">— пустой сезон (без игроков) —</option>
        ${allKeys.map(k => `<option value="${escapeAttr(k)}" ${k === ctx.sourceKey ? 'selected' : ''}>${escapeHtml(formatSeasonLabel(k))} (${(DB.seasons[k].players || []).length} игроков)</option>`).join('')}
      </select>
    </div>

    <div class="field">
      <label id="cs-players-label">Кого перенести (${ctx.selectedPlayerIds.size} из ${sourcePlayers.length})</label>
      <div class="cs-players-list" id="cs-players">
        ${playerRows}
      </div>
      <div class="cs-bulk-actions">
        <button type="button" class="btn btn-sm btn-ghost" onclick="createSeasonSelectAll(true)">Выбрать всех</button>
        <button type="button" class="btn btn-sm btn-ghost" onclick="createSeasonSelectAll(false)">Снять всех</button>
      </div>
    </div>

    <div class="field">
      <label>Что переносить</label>
      <div class="cs-copy-options">
        <label class="cs-copy-row">
          <input type="checkbox" ${ctx.copy.photo ? 'checked' : ''} onchange="createSeasonCopyToggle('photo', this.checked)">
          <span class="cs-copy-text">Фото</span>
        </label>
        <label class="cs-copy-row">
          <input type="checkbox" ${ctx.copy.characteristic ? 'checked' : ''} onchange="createSeasonCopyToggle('characteristic', this.checked)">
          <span class="cs-copy-text">Краткая характеристика</span>
        </label>
        <label class="cs-copy-row">
          <input type="checkbox" ${ctx.copy.tech ? 'checked' : ''} onchange="createSeasonCopyToggle('tech', this.checked)">
          <span class="cs-copy-text">Структура техники (названия критериев, без оценок)</span>
        </label>
        <label class="cs-copy-row">
          <input type="checkbox" ${ctx.copy.other ? 'checked' : ''} onchange="createSeasonCopyToggle('other', this.checked)">
          <span class="cs-copy-text">Структура Физ/Такт/Псих (названия критериев, без оценок)</span>
        </label>
      </div>
      <div class="cs-hint">Оценки, статистика, тесты, календарь и планы развития — не переносятся. Они остаются в исходном сезоне как архив.</div>
    </div>

    <div class="btn-row" style="margin-top:16px">
      <button class="btn" onclick="submitCreateSeason()">Создать сезон</button>
      <button class="btn-ghost btn" onclick="closeModal()">Отмена</button>
    </div>
  `);

  onCreateSeasonKeyInput(ctx.key);
}

function onCreateSeasonKeyInput(val) {
  const ctx = __createSeasonCtx;
  if (!ctx) return;
  ctx.key = (val || '').trim();
  const hint = document.getElementById('cs-key-hint');
  if (!hint) return;
  if (!ctx.key) { hint.textContent = ''; return; }
  if (!/^\d{4}\/\d{2}$/.test(ctx.key)) {
    hint.textContent = 'Формат: 2027/28 (год слэш две цифры).';
    hint.className = 'cs-hint error';
    return;
  }
  if (DB.seasons[ctx.key]) {
    hint.textContent = 'Сезон с таким названием уже существует.';
    hint.className = 'cs-hint error';
    return;
  }
  const [y1, y2] = ctx.key.split('/');
  hint.textContent = 'Свободно. Сезон: с 1 июля ' + y1 + ' по 31 мая 20' + y2 + '.';
  hint.className = 'cs-hint ok';
}

function onCreateSeasonSourceChange(key) {
  const ctx = __createSeasonCtx;
  if (!ctx) return;
  ctx.sourceKey = key;
  ctx.selectedPlayerIds = new Set();
  if (key && DB.seasons[key]) {
    (DB.seasons[key].players || []).forEach(p => ctx.selectedPlayerIds.add(p.id));
  }
  renderCreateSeasonModal();
}

function onCreateSeasonPlayerToggle(pid, checked) {
  const ctx = __createSeasonCtx;
  if (!ctx) return;
  if (checked) ctx.selectedPlayerIds.add(pid);
  else ctx.selectedPlayerIds.delete(pid);

  const total = (DB.seasons[ctx.sourceKey]?.players || []).length;
  const label = document.getElementById('cs-players-label');
  if (label) label.textContent = `Кого перенести (${ctx.selectedPlayerIds.size} из ${total})`;
}

function createSeasonSelectAll(checked) {
  const ctx = __createSeasonCtx;
  if (!ctx) return;
  if (!ctx.sourceKey) return;
  const players = DB.seasons[ctx.sourceKey]?.players || [];
  ctx.selectedPlayerIds = new Set(checked ? players.map(p => p.id) : []);
  renderCreateSeasonModal();
}

function createSeasonCopyToggle(field, checked) {
  const ctx = __createSeasonCtx;
  if (!ctx) return;
  ctx.copy[field] = !!checked;
}

function submitCreateSeason() {
  const ctx = __createSeasonCtx;
  if (!ctx) return;

  if (!ctx.key || !/^\d{4}\/\d{2}$/.test(ctx.key)) {
    uiAlert('Неверное название сезона. Формат: 2027/28');
    return;
  }
  if (DB.seasons[ctx.key]) {
    uiAlert('Сезон ' + ctx.key + ' уже существует');
    return;
  }

  const playerIds = ctx.sourceKey ? Array.from(ctx.selectedPlayerIds) : [];

  const ok = createSeason({
    key: ctx.key,
    fromSeason: ctx.sourceKey || null,
    playerIds,
    copy: ctx.copy
  });

  if (ok) {
    __createSeasonCtx = null;
    closeModal();
  }
}

/* ============================================================
   8. UI: МОДАЛКА УПРАВЛЕНИЯ СЕЗОНАМИ
   ============================================================ */

function openManageSeasonsModal() {
  const menu = document.getElementById('season-menu');
  if (menu) menu.classList.remove('active');

  const keys = getSeasonKeys();

  const rows = keys.map(k => {
    const cnt = (DB.seasons[k].players || []).length;
    const isCurrent = k === currentSeason;
    const isCalCurrent = k === currentSeasonKey();
    return `<div class="ms-row">
      <div class="ms-row-info">
        <div class="ms-row-name">${escapeHtml(formatSeasonLabel(k))}
          ${isCurrent ? '<span class="ms-tag current">текущий</span>' : ''}
          ${isCalCurrent && !isCurrent ? '<span class="ms-tag">по календарю</span>' : ''}
        </div>
        <div class="ms-row-meta">${cnt} ${plural(cnt, 'игрок', 'игрока', 'игроков')}</div>
      </div>
      <div class="ms-row-actions">
        ${!isCurrent ? `<button class="btn btn-sm btn-ghost" onclick="manageSwitchSeason('${escapeAttr(k)}')">Перейти</button>` : ''}
        <button class="btn btn-sm btn-ghost" onclick="manageRenameSeason('${escapeAttr(k)}')">Переименовать</button>
        ${!isCurrent ? `<button class="btn btn-sm btn-danger" onclick="manageDeleteSeason('${escapeAttr(k)}')">Удалить</button>` : ''}
      </div>
    </div>`;
  }).join('');

  openModal(`
    <h3>Управление сезонами</h3>
    <p class="subtitle" style="margin-top:-8px">Сезон: с 1 июля по 31 мая. Данные сезонов изолированы.</p>
    <div class="ms-list">${rows}</div>
    <div class="btn-row" style="margin-top:16px">
      <button class="btn" onclick="openCreateSeasonModal()">+ Новый сезон</button>
      <button class="btn-ghost btn" onclick="closeModal()">Закрыть</button>
    </div>
  `);
}

function manageSwitchSeason(key) {
  closeModal();
  switchSeason(key);
}

function manageRenameSeason(key) {
  uiPrompt(
    'Новое название сезона (формат 2027/28):',
    key,
    (newKey) => {
      const trimmed = (newKey || '').trim();
      if (!trimmed || trimmed === key) return;
      if (renameSeason(key, trimmed)) {
        openManageSeasonsModal();
      }
    },
    () => {},
    { title: 'Переименовать сезон', placeholder: '2027/28', okLabel: 'Переименовать' }
  );
}

function manageDeleteSeason(key) {
  // deleteSeason сам вызывает uiConfirm, но мы хотим перерисовать
  // модалку управления после успешного удаления.
  // Поэтому повторно открываем её только при успехе.
  const before = DB.seasons[key] ? 1 : 0;
  deleteSeason(key);
  // Проверяем через микрозадержку: если сезон реально удалился —
  // uiConfirm выполнил callback синхронно, значит сезона уже нет.
  if (before === 1 && !DB.seasons[key]) {
    // уже удалён — перерисуем список
    openManageSeasonsModal();
    return;
  }
  // Если не удалён (отмена или защита) — ничего не делаем.
  // Если удаление произошло в callback асинхронно — перерисуем
  // список после закрытия модалки.
  const check = setInterval(() => {
    if (!DB.seasons[key]) {
      clearInterval(check);
      if (typeof openManageSeasonsModal === 'function') openManageSeasonsModal();
    } else {
      // Ждём максимум 5 секунд (защита от вечного таймера)
      if (!document.querySelector('.ui-choice-row') && !document.getElementById('ui-confirm-ok')) {
        clearInterval(check);
      }
    }
  }, 100);
  setTimeout(() => clearInterval(check), 5000);
}