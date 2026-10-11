/* ============================================================
   11-dashboard-calendar.js  v18
   Календарь тренера (без сетки, модалки дня и редактора фактов).

   v18:
   - Сетка месяца — в 40-coach-grid.js.
   - Модалка дня — в 41-coach-day-modal.js.
   - Редактор фактов — в 42-coach-fact-editor.js.
   ============================================================ */

let __coachOpenSessions = new Set();
let __coachFactDraft = new Map();
let __coachDayCurrentDs = null;

/* ============================================================
   ХЕЛПЕРЫ
   ============================================================ */
function cssEscapeSimple(s) {
  return String(s).replace(/([^\w-])/g, '\\$1');
}

function draftKey(ds, sessId) { return ds + '|' + sessId; }
function draftEntryKey(pid, blockIdx) { return pid + '::' + blockIdx; }

function getFactDraft(ds, sessId) {
  const k = draftKey(ds, sessId);
  if (!__coachFactDraft.has(k)) __coachFactDraft.set(k, new Map());
  return __coachFactDraft.get(k);
}

function clearFactDraft(ds, sessId) {
  __coachFactDraft.delete(draftKey(ds, sessId));
}

function hasUnsavedDraft(ds, sessId) {
  const d = __coachFactDraft.get(draftKey(ds, sessId));
  return d && d.size > 0;
}

function listUnsavedSessions(ds) {
  const result = [];
  __coachFactDraft.forEach((map, key) => {
    if (!key.startsWith(ds + '|')) return;
    if (map.size > 0) result.push(key.slice(ds.length + 1));
  });
  return result;
}

/* ============================================================
   complexItems
   ============================================================ */
function blockComplexLabel(block) {
  const name = (block && block.complex) ? block.complex : '';
  const items = (block && Array.isArray(block.complexItems)) ? block.complexItems : [];
  if (!name) return '';
  if (!items.length) return name;

  const found = findSubgroupByName(name);
  if (found && Array.isArray(found.subgroup.items)) {
    const total = found.subgroup.items.length;
    return `${name} (${items.length} из ${total})`;
  }
  return `${name} (${items.length} выбр.)`;
}

function findSubgroupByName(name) {
  if (!name || !Array.isArray(DB.exercises)) return null;
  for (const parent of DB.exercises) {
    if (!parent || !Array.isArray(parent.subgroups)) continue;
    const sg = parent.subgroups.find(s => s.name === name);
    if (sg) return { parent, subgroup: sg };
  }
  return null;
}

function renderBlockExercisesLine(b) {
  const name = b.complex || '';
  if (!name) return '';
  const found = findSubgroupByName(name);
  if (!found) return '';

  const allItems = Array.isArray(found.subgroup.items) ? found.subgroup.items : [];
  const selected = Array.isArray(b.complexItems) ? b.complexItems : [];
  const isWhole = selected.length === 0;

  if (!allItems.length) return '';

  const itemsToShow = isWhole ? allItems : selected;
  if (!itemsToShow.length) return '';

  const list = itemsToShow.map(it =>
    `<li><span class="bx-dot"></span><span class="bx-text">${escapeHtml(it)}</span></li>`
  ).join('');

  const headerText = isWhole
    ? `Весь комплекс «${escapeHtml(name)}» — ${allItems.length} ${plural(allItems.length, 'упражнение', 'упражнения', 'упражнений')}`
    : `Из «${escapeHtml(name)}» выбрано ${selected.length} из ${allItems.length} ${plural(allItems.length, 'упражнения', 'упражнений', 'упражнений')}`;

  return `<div class="bx-block">
    <div class="bx-head">${headerText}</div>
    <ul class="bx-list">${list}</ul>
  </div>`;
}

/* ============================================================
   РЕДАКТОР ТРЕНИРОВКИ
   ============================================================ */
let __sessionEditContext = null;

function openSessionEditor(ds, idx, ev) {
  if (ev) ev.stopPropagation();

  const unsaved = listUnsavedSessions(ds);
  const currentSess = collectDaySessions(ds)[idx];
  if (unsaved.length && currentSess && !unsaved.includes(currentSess.id)) {
    uiConfirm(
      `Есть несохранённые оценки в ${unsaved.length} тренировк(е/ах).\nПродолжить без сохранения?`,
      () => { __coachFactDraft.clear(); openSessionEditorInner(ds, idx); },
      () => {}
    );
    return;
  }

  openSessionEditorInner(ds, idx);
}

function openSessionEditorInner(ds, idx) {
  const sessions = collectDaySessions(ds);
  const s = sessions[idx];
  if (!s) return;

  __sessionEditContext = {
    ds,
    isEdit: true,
    originalId: s.realId,
    originalGroupId: s.groupId,
    originalSeriesId: s.seriesId || null,
    originalBlocks: s.blocks.map(b => ({ ...b })),
    originalName: s.name || '',
    name: s.name || '',
    note: s.note || '',
    playerIds: s.players.map(p => p.id),
    blocks: s.blocks.length ? s.blocks.map(b => ({
      id: b.id || null,
      complex: b.complex || '',
      complexItems: Array.isArray(b.complexItems) ? b.complexItems.slice() : [],
      format: b.format || '',
      startTime: b.startTime || '18:00',
      duration: Number(b.duration) || 60,
      note: b.note || '',
      fact: b.fact || '',
      comment: b.comment || ''
    })) : [newEmptyBlock()],
    repeatDays: new Set(),
    repeatTimes: {},
    repeatWeeks: 4,
    repeatStartDate: nextDayStr(ds)
  };

  renderSessionForm();
}

function openNewSessionForDate(ds) {
  __sessionEditContext = {
    ds,
    isEdit: false,
    originalId: null,
    originalGroupId: null,
    originalSeriesId: null,
    originalBlocks: null,
    originalName: '',
    name: '',
    note: '',
    playerIds: [],
    blocks: [newEmptyBlock()],
    repeatDays: new Set(),
    repeatTimes: {},
    repeatWeeks: 4,
    repeatStartDate: nextDayStr(ds)
  };
  renderSessionForm();
}

function newEmptyBlock() {
  return {
    id: null,
    complex: '',
    complexItems: [],
    format: 'Самостоятельная',
    startTime: '18:00',
    duration: 60,
    note: '',
    fact: '',
    comment: ''
  };
}

function nextDayStr(ds) {
  const d = new Date(ds + 'T00:00:00');
  d.setDate(d.getDate() + 1);
  return localDateStr(d);
}

function renderSessionForm() {
  const ctx = __sessionEditContext;
  if (!ctx) return;

  syncFormToContext();

  const blocksHtml = ctx.blocks.map((b, i) => renderBlockEditor(b, i)).join('');
  const playersHtml = renderCoachGroupedPlayers(DB.players, ctx.playerIds);
  const repeatHtml = renderRepeatBlock();

  openModal(`<h3>${ctx.isEdit ? 'Редактирование тренировки' : 'Новая тренировка'}</h3>
    <p class="subtitle" style="margin-top:-8px">${escapeHtml(formatDateFull(ctx.ds))}</p>

    <div class="field"><label>Дата</label>
      <input type="date" id="cs-date" value="${escapeAttr(ctx.ds)}"></div>

    <div class="field"><label>Название тренировки (необязательно)</label>
      <input id="cs-name" value="${escapeAttr(ctx.name || '')}" placeholder="Например: Ледовая, ОФП, Игровая"></div>

    <div class="field"><label>Примечание к тренировке</label>
      <input id="cs-note" value="${escapeAttr(ctx.note || '')}" placeholder="акцент на ногах и т.п."></div>

    <div class="field">
      <label>Блоки тренировки</label>
      <div id="cs-blocks-list">${blocksHtml}</div>
      <div style="margin-top:8px">
        <button type="button" class="btn btn-sm btn-ghost" onclick="addBlockToForm()">+ Добавить блок</button>
      </div>
    </div>

    <div class="field"><label>Игроки (можно несколько)</label>
      <div class="group-tools">
        <input type="text" id="cs-search" placeholder="Поиск по ФИО или команде…" oninput="filterCoachGroupPlayers('cs-grp-list','cs-search')">
        <button type="button" onclick="expandAllCoachTeams('cs-grp-list', true)">Развернуть все</button>
        <button type="button" onclick="expandAllCoachTeams('cs-grp-list', false)">Свернуть все</button>
        <button type="button" onclick="clearCoachGroupSelection('cs-grp-list')">Снять все</button>
      </div>
      <div class="group-list" id="cs-grp-list">${playersHtml}</div>
    </div>

    ${repeatHtml}

    <div class="btn-row" style="margin-top:16px">
      <button class="btn" onclick="saveSessionFromForm()">Сохранить</button>
      <button class="btn-ghost btn" onclick="closeModal()">Отмена</button>
    </div>`);

  setTimeout(() => {
    document.querySelectorAll('#cs-grp-list .cc-grp-player').forEach(cb => {
      if (ctx.playerIds.includes(cb.value)) cb.checked = true;
    });
    updateRepeatPreview();
  }, 0);
}

function renderBlockEditor(block, idx) {
  const formatOptions = ['<option value="">— не выбрано —</option>']
    .concat(WORK_TYPES.map(v => `<option value="${escapeAttr(v)}" ${block.format === v ? 'selected' : ''}>${escapeHtml(v)}</option>`))
    .join('');

  const startT = block.startTime || '18:00';
  const dur = Number(block.duration) || 60;
  const endT = minutesToTime(timeToMinutes(startT) + dur);

  const complexLabel = blockComplexLabel(block) || '— не выбрано —';
  const complexCls = block.complex ? 'has-value' : '';

  return `<div class="cc-block-editor" data-block-index="${idx}">
    <div class="cc-block-head">
      <span class="cc-block-num">Блок #${idx + 1}</span>
      <button type="button" class="cc-block-del" title="Удалить блок" onclick="removeBlockFromForm(${idx})">🗑</button>
    </div>

    <div class="field">
      <label>Комплекс упражнений (из справочника)</label>
      <div class="complex-picker" data-block-index="${idx}">
        <button type="button" class="complex-picker-btn ${complexCls}"
                onclick="toggleComplexPicker(event, ${idx})">
          <span class="complex-picker-text">${escapeHtml(complexLabel)}</span>
          <span class="complex-picker-caret">▾</span>
        </button>
        <div class="complex-picker-popover" id="complex-popover-${idx}"
             data-block-idx="${idx}"
             onclick="event.stopPropagation()"></div>
      </div>
    </div>

    <div class="field">
      <label>Формат работы</label>
      <select class="blk-format" data-block-index="${idx}" onchange="onBlockFieldChange(${idx},'format',this.value)">${formatOptions}</select>
    </div>

    <div class="cc-time-row">
      <div class="field"><label>Время начала</label>
        <input type="time" class="blk-start" data-block-index="${idx}" value="${escapeAttr(startT)}" onchange="onBlockStartChange(${idx}, this.value)"></div>
      <div class="field"><label>Продолжительность, мин</label>
        <input type="number" min="1" max="600" class="blk-dur" data-block-index="${idx}" value="${dur}" onchange="onBlockDurationChange(${idx}, this.value)"></div>
      <div class="field"><label>Окончание</label>
        <div class="cc-block-end" id="cs-block-end-${idx}">${endT}</div></div>
    </div>

    <div class="field">
      <label>Примечание к блоку</label>
      <input class="blk-note" data-block-index="${idx}" value="${escapeAttr(block.note || '')}" placeholder="например: акцент на ногах" onchange="onBlockFieldChange(${idx},'note',this.value)">
    </div>
  </div>`;
}

/* ============================================================
   ПОПОВЕР-ДЕРЕВО «КОМПЛЕКС УПРАЖНЕНИЙ»
   ============================================================ */

let __openComplexPopoverIdx = null;
let __openComplexGroups = new Set();
let __openComplexSubgroups = new Set();

function toggleComplexPicker(event, idx) {
  if (event) event.stopPropagation();

  const wasOpen = __openComplexPopoverIdx === idx;
  closeAllComplexPickers();

  if (wasOpen) return;

  __openComplexGroups = new Set();
  __openComplexSubgroups = new Set();

  const pop = document.getElementById('complex-popover-' + idx);
  if (!pop) return;

  pop.innerHTML = buildComplexPopoverHtml(idx);
  pop.classList.add('active');
  __openComplexPopoverIdx = idx;

  setTimeout(() => {
    const search = pop.querySelector('.complex-picker-search');
    if (search) search.focus();
  }, 30);
}

function closeAllComplexPickers() {
  document.querySelectorAll('.complex-picker-popover.active').forEach(el => el.classList.remove('active'));
  __openComplexPopoverIdx = null;
  __openComplexGroups = new Set();
  __openComplexSubgroups = new Set();
}

document.addEventListener('click', () => {
  if (__openComplexPopoverIdx !== null) closeAllComplexPickers();
});

function buildComplexPopoverHtml(blockIdx) {
  const groups = Array.isArray(DB.exercises) ? DB.exercises : [];

  if (!groups.length) {
    return `
      <div class="complex-picker-head">
        <span>Комплексы</span>
        <button type="button" class="complex-picker-close" onclick="closeAllComplexPickers()">×</button>
      </div>
      <div class="complex-picker-empty">Справочник пуст.</div>
    `;
  }

  const body = groups.map(parent => renderComplexPickerGroup(parent)).join('');

  return `
    <div class="complex-picker-head">
      <span>Выберите комплекс</span>
      <button type="button" class="complex-picker-close" onclick="closeAllComplexPickers()">×</button>
    </div>
    <div class="complex-picker-search-wrap">
      <input type="text" class="complex-picker-search" placeholder="Поиск…"
             oninput="filterComplexPicker(this.value)">
    </div>
    <div class="complex-picker-body" id="complex-picker-body-${blockIdx}">
      ${body || '<div class="complex-picker-empty">Нет ни одной мини-группы</div>'}
    </div>
  `;
}

function renderComplexPickerGroup(parent) {
  const subs = Array.isArray(parent.subgroups) ? parent.subgroups : [];
  const isOpen = __openComplexGroups.has(parent.id);

  const searchParts = [parent.name || ''];
  subs.forEach(sg => {
    searchParts.push(sg.name || '');
    (sg.items || []).forEach(it => searchParts.push(it || ''));
  });
  const searchStr = searchParts.join(' ').toLowerCase();

  if (!subs.length) {
    return `<div class="complex-picker-group empty" data-search="${escapeAttr(searchStr)}">
      <div class="complex-picker-group-head">
        <span class="complex-picker-group-arrow">·</span>
        <span class="complex-picker-group-name">${escapeHtml(parent.name)}</span>
        <span class="complex-picker-group-count">0</span>
      </div>
    </div>`;
  }

  const subHtml = subs.map(sg => renderComplexPickerSub(sg)).join('');

  return `<div class="complex-picker-group ${isOpen ? 'open' : ''}"
                data-group-id="${escapeAttr(parent.id)}"
                data-search="${escapeAttr(searchStr)}">
    <button type="button" class="complex-picker-group-head"
            onclick="toggleComplexPickerGroup('${escapeAttr(parent.id)}')">
      <span class="complex-picker-group-arrow">${isOpen ? '▼' : '▶'}</span>
      <span class="complex-picker-group-name">${escapeHtml(parent.name)}</span>
      <span class="complex-picker-group-count">${subs.length}</span>
    </button>
    <div class="complex-picker-group-body" style="display:${isOpen ? 'block' : 'none'}">${subHtml}</div>
  </div>`;
}

function renderComplexPickerSub(sg) {
  const items = Array.isArray(sg.items) ? sg.items : [];
  const isOpen = __openComplexSubgroups.has(sg.id);
  const subSearch = ((sg.name || '') + ' ' + items.join(' ')).toLowerCase();

  const itemsHtml = items.map(it => `
    <label class="complex-picker-item-check">
      <input type="checkbox" class="complex-picker-item-cb"
             data-item="${escapeAttr(it)}">
      <span class="complex-picker-item-text">${escapeHtml(it)}</span>
    </label>
  `).join('');

  return `<div class="complex-picker-sub ${isOpen ? 'open' : ''}"
                data-sub-id="${escapeAttr(sg.id)}"
                data-search="${escapeAttr(subSearch)}">
    <div class="complex-picker-sub-row">
      <button type="button" class="complex-picker-sub-arrow-btn"
              title="${isOpen ? 'Свернуть упражнения' : 'Раскрыть упражнения'}"
              onclick="toggleComplexPickerSub(event, this)">
        ${isOpen ? '▼' : '▶'}
      </button>
      <button type="button" class="complex-picker-sub-btn"
              data-sub-id="${escapeAttr(sg.id)}"
              onclick="onComplexSubClick(event, this)">
        <span class="complex-picker-radio"></span>
        <span class="complex-picker-sub-name">${escapeHtml(sg.name)}</span>
        <span class="complex-picker-sub-count">${items.length}</span>
      </button>
    </div>
    ${isOpen && items.length ? `
      <div class="complex-picker-sub-body">
        ${itemsHtml}
        <div class="complex-picker-sub-actions">
          <button type="button" class="complex-picker-sub-action primary"
                  onclick="assignComplexItemsFromSub(event, this)">
            Назначить
          </button>
          <button type="button" class="complex-picker-sub-action ghost"
                  onclick="checkAllSubItems(event, this, true)">
            Отметить все
          </button>
          <button type="button" class="complex-picker-sub-action ghost"
                  onclick="checkAllSubItems(event, this, false)">
            Снять все
          </button>
        </div>
      </div>
    ` : ''}
  </div>`;
}

function onComplexSubClick(event, btn) {
  if (event) event.stopPropagation();
  const subId = btn.dataset.subId;
  const found = findSubgroupById(subId);
  if (!found) return;
  selectComplexWholeGroup(__openComplexPopoverIdx, found.subgroup.name);
}

function toggleComplexPickerSub(event, btn) {
  if (event) event.stopPropagation();
  const subEl = btn.closest('.complex-picker-sub');
  if (!subEl) return;

  const subId = subEl.dataset.subId;
  const found = findSubgroupById(subId);
  if (!found) return;

  if (__openComplexSubgroups.has(subId)) __openComplexSubgroups.delete(subId);
  else __openComplexSubgroups.add(subId);

  const tmp = document.createElement('div');
  tmp.innerHTML = renderComplexPickerSub(found.subgroup);
  const newSub = tmp.firstElementChild;
  subEl.replaceWith(newSub);
}

function toggleComplexPickerGroup(groupId) {
  if (__openComplexGroups.has(groupId)) __openComplexGroups.delete(groupId);
  else __openComplexGroups.add(groupId);

  const groupEl = document.querySelector(`.complex-picker-group[data-group-id="${CSS.escape(groupId)}"]`);
  if (!groupEl) return;
  const body = groupEl.querySelector('.complex-picker-group-body');
  const arrow = groupEl.querySelector('.complex-picker-group-arrow');
  const isOpen = __openComplexGroups.has(groupId);
  if (body)  body.style.display = isOpen ? 'block' : 'none';
  if (arrow) arrow.textContent = isOpen ? '▼' : '▶';
  groupEl.classList.toggle('open', isOpen);
}

function checkAllSubItems(event, btn, checked) {
  if (event) event.stopPropagation();
  const subEl = btn.closest('.complex-picker-sub');
  if (!subEl) return;
  subEl.querySelectorAll('.complex-picker-item-cb').forEach(cb => { cb.checked = checked; });
}

function assignComplexItemsFromSub(event, btn) {
  if (event) event.stopPropagation();

  const ctx = __sessionEditContext;
  const blockIdx = __openComplexPopoverIdx;
  if (!ctx || !ctx.blocks[blockIdx]) return;

  const subEl = btn.closest('.complex-picker-sub');
  if (!subEl) return;

  const subId = subEl.dataset.subId;
  const found = findSubgroupById(subId);
  if (!found) return;

  const checkedItems = [];
  subEl.querySelectorAll('.complex-picker-item-cb').forEach(cb => {
    if (cb.checked) checkedItems.push(cb.dataset.item);
  });

  if (!checkedItems.length) {
    uiAlert('Отметьте хотя бы одно упражнение. Если нужно выбрать всю мини-группу — кликните по кружку рядом с названием.');
    return;
  }

  const totalItems = (found.subgroup.items || []).length;

  ctx.blocks[blockIdx].complex = found.subgroup.name;
  if (checkedItems.length === totalItems) {
    ctx.blocks[blockIdx].complexItems = [];
  } else {
    ctx.blocks[blockIdx].complexItems = checkedItems.slice();
  }

  updateComplexPickerButton(blockIdx);
  closeAllComplexPickers();
  toast(`Назначено: ${found.subgroup.name}` + (checkedItems.length < totalItems ? ` (${checkedItems.length} из ${totalItems})` : ''));
}

function selectComplexWholeGroup(blockIdx, complexName) {
  const ctx = __sessionEditContext;
  if (!ctx || !ctx.blocks[blockIdx]) return;

  ctx.blocks[blockIdx].complex = complexName || '';
  ctx.blocks[blockIdx].complexItems = [];

  updateComplexPickerButton(blockIdx);
  closeAllComplexPickers();
  toast(`Назначено: ${complexName}`);
}

function updateComplexPickerButton(blockIdx) {
  const ctx = __sessionEditContext;
  if (!ctx || !ctx.blocks[blockIdx]) return;
  const b = ctx.blocks[blockIdx];
  const label = blockComplexLabel(b) || '— не выбрано —';

  const picker = document.querySelector(`.complex-picker[data-block-index="${blockIdx}"]`);
  if (picker) {
    const btn = picker.querySelector('.complex-picker-btn');
    const txt = picker.querySelector('.complex-picker-text');
    if (txt) txt.textContent = label;
    if (btn) btn.classList.toggle('has-value', !!b.complex);
  }
}

function filterComplexPicker(query) {
  const pop = document.getElementById('complex-popover-' + __openComplexPopoverIdx);
  if (!pop) return;
  const q = (query || '').trim().toLowerCase();

  pop.querySelectorAll('.complex-picker-group').forEach(grEl => {
    const searchStr = grEl.dataset.search || '';
    const groupMatch = !q || searchStr.includes(q);

    if (groupMatch && q) {
      const gid = grEl.dataset.groupId;
      if (gid) __openComplexGroups.add(gid);
      const body = grEl.querySelector('.complex-picker-group-body');
      const arrow = grEl.querySelector('.complex-picker-group-arrow');
      if (body) body.style.display = 'block';
      if (arrow && gid) arrow.textContent = '▼';
    }

    if (q) {
      grEl.querySelectorAll('.complex-picker-sub').forEach(subEl => {
        const subSearch = subEl.dataset.search || '';
        const visible = subSearch.includes(q) || searchStr.includes(q);
        subEl.style.display = visible ? 'block' : 'none';
      });
    } else {
      grEl.querySelectorAll('.complex-picker-sub').forEach(subEl => {
        subEl.style.display = 'block';
      });
    }

    grEl.style.display = groupMatch ? 'block' : 'none';
  });

  if (!q) {
    pop.querySelectorAll('.complex-picker-group').forEach(grEl => {
      const gid = grEl.dataset.groupId;
      if (!gid) return;
      const body = grEl.querySelector('.complex-picker-group-body');
      const arrow = grEl.querySelector('.complex-picker-group-arrow');
      const isOpen = __openComplexGroups.has(gid);
      if (body) body.style.display = isOpen ? 'block' : 'none';
      if (arrow) arrow.textContent = isOpen ? '▼' : '▶';
    });
  }
}

/* ============================================================
   СИНХРОНИЗАЦИЯ ФОРМЫ
   ============================================================ */

function syncFormToContext() {
  const ctx = __sessionEditContext;
  if (!ctx) return;

  const dateEl = document.getElementById('cs-date');
  if (dateEl) ctx.ds = dateEl.value;
  const nameEl = document.getElementById('cs-name');
  if (nameEl) ctx.name = nameEl.value.trim();
  const noteEl = document.getElementById('cs-note');
  if (noteEl) ctx.note = noteEl.value.trim();

  const playerIds = [];
  document.querySelectorAll('#cs-grp-list .cc-grp-player:checked').forEach(cb => playerIds.push(cb.value));
  ctx.playerIds = playerIds;

  document.querySelectorAll('.cc-block-editor').forEach(el => {
    const i = parseInt(el.dataset.blockIndex);
    const b = ctx.blocks[i];
    if (!b) return;
    const format  = el.querySelector('.blk-format')?.value;
    const start   = el.querySelector('.blk-start')?.value;
    const dur     = el.querySelector('.blk-dur')?.value;
    const note    = el.querySelector('.blk-note')?.value;
    if (format  !== undefined) b.format  = format;
    if (start   !== undefined) b.startTime = start;
    if (dur     !== undefined) b.duration = Number(dur) || 0;
    if (note    !== undefined) b.note = note;
  });
}

function onBlockFieldChange(idx, field, value) {
  const ctx = __sessionEditContext;
  if (!ctx || !ctx.blocks[idx]) return;
  ctx.blocks[idx][field] = value;
}
function onBlockStartChange(idx, value) {
  const ctx = __sessionEditContext;
  if (!ctx || !ctx.blocks[idx]) return;
  ctx.blocks[idx].startTime = value;
  updateBlockEndPreview(idx);
}
function onBlockDurationChange(idx, value) {
  const ctx = __sessionEditContext;
  if (!ctx || !ctx.blocks[idx]) return;
  ctx.blocks[idx].duration = Math.max(1, Number(value) || 1);
  updateBlockEndPreview(idx);
}
function updateBlockEndPreview(idx) {
  const ctx = __sessionEditContext;
  if (!ctx || !ctx.blocks[idx]) return;
  const el = document.getElementById('cs-block-end-' + idx);
  if (!el) return;
  const b = ctx.blocks[idx];
  el.textContent = minutesToTime(timeToMinutes(b.startTime) + (Number(b.duration) || 0));
}

function addBlockToForm() {
  syncFormToContext();
  const ctx = __sessionEditContext;
  if (!ctx) return;

  const last = ctx.blocks[ctx.blocks.length - 1];
  let startTime = '18:00';
  let duration = 60;
  if (last) {
    startTime = minutesToTime(timeToMinutes(last.startTime || '18:00') + (Number(last.duration) || 0));
    duration = Number(last.duration) || 60;
  }
  ctx.blocks.push({
    id: null,
    complex: '',
    complexItems: [],
    format: 'Самостоятельная',
    startTime,
    duration,
    note: '',
    fact: '',
    comment: ''
  });
  renderSessionForm();
}

function removeBlockFromForm(idx) {
  syncFormToContext();
  const ctx = __sessionEditContext;
  if (!ctx) return;

  if (ctx.blocks.length <= 1) {
    ctx.blocks[0] = newEmptyBlock();
  } else {
    ctx.blocks.splice(idx, 1);
  }
  renderSessionForm();
}

/* ============================================================
   БЛОК «ПОВТОРИТЬ НА ДРУГИЕ ДНИ»
   ============================================================ */

const DOW_INDEX_RU = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];

function renderRepeatBlock() {
  const ctx = __sessionEditContext;
  if (!ctx) return '';

  const baseTime = (ctx.blocks[0] && ctx.blocks[0].startTime) || '18:00';

  const daysHtml = DOW_INDEX_RU.map((label, dow) => {
    const checked = ctx.repeatDays.has(dow) ? 'checked' : '';
    const customTime = ctx.repeatTimes[dow] || baseTime;
    const showTime = ctx.repeatDays.has(dow);
    return `<div class="cs-repeat-day">
      <label class="cs-repeat-day-label">
        <input type="checkbox" data-dow="${dow}" ${checked}
               onchange="onRepeatDayToggle(${dow}, this.checked)">
        <span>${label}</span>
      </label>
      <input type="time" class="cs-repeat-day-time"
             data-dow="${dow}"
             value="${escapeAttr(customTime)}"
             onchange="onRepeatTimeChange(${dow}, this.value)"
             style="display:${showTime ? 'inline-block' : 'none'}">
    </div>`;
  }).join('');

  return `<div class="cs-repeat-block">
    <div class="cs-repeat-title">Повторить на другие дни</div>

    <div class="cs-repeat-days">${daysHtml}</div>

    <div class="cs-repeat-options">
      <div class="field">
        <label>Сколько недель вперёд</label>
        <select id="cs-repeat-weeks" onchange="onRepeatWeeksChange(this.value)">
          <option value="4" ${ctx.repeatWeeks === 4 ? 'selected' : ''}>4 недели</option>
        </select>
      </div>
      <div class="field">
        <label>Начиная с</label>
        <input type="date" id="cs-repeat-start" value="${escapeAttr(ctx.repeatStartDate)}"
               onchange="onRepeatStartChange(this.value)">
      </div>
    </div>

    <div class="cs-repeat-hint">
      Время по умолчанию берётся из первого блока (${escapeHtml(baseTime)}). Можно изменить для каждого дня.
    </div>

    <div class="cs-repeat-preview" id="cs-repeat-preview"></div>

    <div style="margin-top:8px">
      <button type="button" class="btn btn-sm btn-ghost" onclick="applyRepeatToForm()">Добавить эти даты</button>
    </div>
  </div>`;
}

function onRepeatDayToggle(dow, checked) {
  const ctx = __sessionEditContext;
  if (!ctx) return;
  if (checked) {
    ctx.repeatDays.add(dow);
    const baseTime = (ctx.blocks[0] && ctx.blocks[0].startTime) || '18:00';
    if (!ctx.repeatTimes[dow]) ctx.repeatTimes[dow] = baseTime;
  } else {
    ctx.repeatDays.delete(dow);
  }
  const el = document.querySelector(`.cs-repeat-day-time[data-dow="${dow}"]`);
  if (el) el.style.display = checked ? 'inline-block' : 'none';
  updateRepeatPreview();
}

function onRepeatTimeChange(dow, value) {
  const ctx = __sessionEditContext;
  if (!ctx) return;
  ctx.repeatTimes[dow] = value || '';
}

function onRepeatWeeksChange(value) {
  const ctx = __sessionEditContext;
  if (!ctx) return;
  ctx.repeatWeeks = parseInt(value, 10) || 4;
  updateRepeatPreview();
}

function onRepeatStartChange(value) {
  const ctx = __sessionEditContext;
  if (!ctx) return;
  ctx.repeatStartDate = value || nextDayStr(ctx.ds);
  updateRepeatPreview();
}

function computeRepeatDates() {
  const ctx = __sessionEditContext;
  if (!ctx) return [];
  if (!ctx.repeatDays.size) return [];

  const start = new Date((ctx.repeatStartDate || nextDayStr(ctx.ds)) + 'T00:00:00');
  const weeks = ctx.repeatWeeks || 4;

  const result = [];
  const end = new Date(start);
  end.setDate(end.getDate() + weeks * 7);

  const cur = new Date(start);
  while (cur < end) {
    const dow = (cur.getDay() + 6) % 7;
    if (ctx.repeatDays.has(dow)) {
      const ds = localDateStr(cur);
      const time = ctx.repeatTimes[dow] || (ctx.blocks[0] && ctx.blocks[0].startTime) || '18:00';
      result.push({ dateStr: ds, dow, time });
    }
    cur.setDate(cur.getDate() + 1);
  }
  return result;
}

function updateRepeatPreview() {
  const el = document.getElementById('cs-repeat-preview');
  if (!el) return;
  const dates = computeRepeatDates();
  if (!dates.length) {
    el.innerHTML = '<span class="cs-repeat-empty">Дни недели не выбраны</span>';
    return;
  }
  const preview = dates.slice(0, 12).map(d => `${formatDate(d.dateStr)} ${d.time}`).join(' · ');
  const more = dates.length > 12 ? ` … и ещё ${dates.length - 12}` : '';
  el.innerHTML = `Будет создано: <strong>${dates.length}</strong> тренировок<br><span class="cs-repeat-preview-list">${escapeHtml(preview)}${more}</span>`;
}

function applyRepeatToForm() {
  syncFormToContext();
  const ctx = __sessionEditContext;
  if (!ctx) return;

  const dates = computeRepeatDates();
  if (!dates.length) { toast('Выберите хотя бы один день недели'); return; }

  const validBlocks = collectValidBlocksFromCtx(ctx);
  if (!validBlocks) return;
  if (!ctx.playerIds.length) { toast('Выберите хотя бы одного игрока'); return; }

  const seriesId = ctx.originalSeriesId || uid('ser');

  if (!ctx.isEdit) {
    createSessionForDate(ctx.ds, ctx.name, ctx.note, validBlocks, ctx.playerIds, ctx.originalGroupId, seriesId);
    ctx.isEdit = true;
  }

  dates.forEach(d => {
    const blocksCopy = validBlocks.map(b => ({
      ...b,
      id: uid('blk'),
      complexItems: Array.isArray(b.complexItems) ? b.complexItems.slice() : []
    }));
    const baseFirst = validBlocks[0] && validBlocks[0].startTime || '18:00';
    const newFirst = d.time || baseFirst;
    const delta = timeToMinutes(newFirst) - timeToMinutes(baseFirst);
    blocksCopy.forEach(b => {
      b.startTime = minutesToTime(Math.max(0, timeToMinutes(b.startTime) + delta));
    });
    createSessionForDate(d.dateStr, ctx.name, ctx.note, blocksCopy, ctx.playerIds, null, seriesId);
  });

  saveDB();
  toast(`Серия сохранена: ${dates.length + 1} тренировок`);
  renderCoachCalendar();
  updateNotifBadge();
  closeModal();
  __sessionEditContext = null;
}

function collectValidBlocksFromCtx(ctx) {
  const validBlocks = [];
  for (let i = 0; i < ctx.blocks.length; i++) {
    const b = ctx.blocks[i];
    const hasAny = (b.complex || '').trim() || (b.format || '').trim() || (b.note || '').trim();
    if (!hasAny) continue;
    if (!b.startTime) { toast(`Блок #${i + 1}: укажите время начала`); return null; }
    if (!b.duration || Number(b.duration) <= 0) { toast(`Блок #${i + 1}: укажите продолжительность`); return null; }

    validBlocks.push({
      id: b.id || uid('blk'),
      complex: (b.complex || '').trim(),
      complexItems: Array.isArray(b.complexItems) ? b.complexItems.slice() : [],
      format: b.format || '',
      startTime: b.startTime,
      duration: Number(b.duration),
      note: (b.note || '').trim(),
      fact: b.fact || '',
      comment: b.comment || ''
    });
  }
  if (!validBlocks.length) { toast('Добавьте хотя бы один блок'); return null; }
  return validBlocks;
}

function createSessionForDate(ds, name, note, blocks, playerIds, groupId, seriesId) {
  const sessId = uid('sess');
  const finalGroupId = groupId || (playerIds.length > 1 ? uid('grp') : null);

  playerIds.forEach(pid => {
    const p = DB.players.find(x => x.id === pid);
    if (!p) return;
    if (!p.calendar) p.calendar = {};
    if (!p.calendar[ds]) p.calendar[ds] = [];
    p.calendar[ds].push({
      id: sessId,
      name: name || '',
      note: note || '',
      groupId: finalGroupId,
      seriesId: seriesId || null,
      blocks: blocks.map(b => ({
        ...b,
        complexItems: Array.isArray(b.complexItems) ? b.complexItems.slice() : []
      }))
    });
  });
  return sessId;
}

/* ============================================================
   СОХРАНЕНИЕ ТРЕНИРОВКИ
   ============================================================ */
function saveSessionFromForm() {
  syncFormToContext();
  const ctx = __sessionEditContext;
  if (!ctx) return;

  const ds = ctx.ds;
  if (!ds) { toast('Укажите дату'); return; }

  const validBlocks = collectValidBlocksFromCtx(ctx);
  if (!validBlocks) return;
  if (!ctx.playerIds.length) { toast('Выберите хотя бы одного игрока'); return; }

  const newSessionId = ctx.originalId || uid('sess');
  const newGroupId = ctx.originalGroupId || (ctx.playerIds.length > 1 ? uid('grp') : null);

  const matchOriginal = (s) => {
    if (!s) return false;
    if (ctx.originalId && s.id === ctx.originalId) return true;
    if (ctx.originalGroupId && s.groupId === ctx.originalGroupId) return true;
    if (!ctx.originalId && !ctx.originalGroupId && ctx.originalBlocks) {
      if ((s.name || '') !== (ctx.originalName || '')) return false;
      const a = s.blocks || [];
      const b = ctx.originalBlocks || [];
      if (a.length !== b.length) return false;
      const sigA = a.map(x => (x.startTime||'') + '|' + (x.complex||'') + '|' + (x.format||'') + '|' + (x.duration||'')).sort().join(';');
      const sigB = b.map(x => (x.startTime||'') + '|' + (x.complex||'') + '|' + (x.format||'') + '|' + (x.duration||'')).sort().join(';');
      return sigA === sigB;
    }
    return false;
  };

  if (ctx.isEdit) {
    DB.players.forEach(p => {
      if (!p.calendar) return;
      Object.keys(p.calendar).forEach(date => {
        const day = p.calendar[date];
        if (!Array.isArray(day)) return;
        p.calendar[date] = day.filter(s => !matchOriginal(s));
        if (!p.calendar[date].length) delete p.calendar[date];
      });
    });
  }

  ctx.playerIds.forEach(pid => {
    const p = DB.players.find(x => x.id === pid);
    if (!p) return;
    if (!p.calendar) p.calendar = {};
    if (!p.calendar[ds]) p.calendar[ds] = [];
    p.calendar[ds].push({
      id: newSessionId,
      name: (ctx.name || '').trim(),
      note: (ctx.note || '').trim(),
      groupId: newGroupId,
      seriesId: ctx.originalSeriesId || null,
      blocks: validBlocks.map(b => ({
        ...b,
        complexItems: Array.isArray(b.complexItems) ? b.complexItems.slice() : []
      }))
    });
  });

  saveDB();

  const wasDayOpen = !!__coachDayCurrentDs;
  const dayDs = __coachDayCurrentDs;

  closeModal();
  __sessionEditContext = null;

  renderCoachCalendar();

  if (wasDayOpen && dayDs) {
    openDaySessionsInner(dayDs);
  }

  updateNotifBadge();
  toast(ctx.isEdit ? 'Тренировка обновлена' : `Тренировка назначена: ${ctx.playerIds.length} ${plural(ctx.playerIds.length, 'игрок', 'игрока', 'игроков')}`);
}

/* ============================================================
   УДАЛЕНИЕ ТРЕНИРОВКИ
   ============================================================ */
function deleteSessionFromDay(ds, idx, ev) {
  if (ev) ev.stopPropagation();
  const sessions = collectDaySessions(ds);
  const s = sessions[idx];
  if (!s) return;

  if (s.seriesId) {
    uiConfirm(
      'Эта тренировка — часть серии.\nУдалить только этот день или всю серию?',
      () => { deleteSessionOnlyThisDay(ds, s.seriesId, idx); },
      () => {}
    );
    return;
  }

  uiConfirm('Удалить тренировку у всех игроков?', () => {
    clearFactDraft(ds, s.id);
    deleteSessionsByFilter(s);
    saveDB();
    renderCoachCalendar();
    if (__coachDayCurrentDs === ds) openDaySessionsInner(ds);
    updateNotifBadge();
    toast('Тренировка удалена');
  }, () => {});
}

function deleteSessionOnlyThisDay(ds, seriesId, idx) {
  const sessions = collectDaySessions(ds);
  const s = sessions[idx];
  if (!s) return;
  clearFactDraft(ds, s.id);
  deleteSessionsByFilter(s);
  saveDB();
  renderCoachCalendar();
  if (__coachDayCurrentDs === ds) openDaySessionsInner(ds);
  updateNotifBadge();
  toast('Удалена одна тренировка из серии');
}

function deleteSessionWholeSeries(seriesId) {
  let removed = 0;
  DB.players.forEach(p => {
    if (!p.calendar) return;
    Object.keys(p.calendar).forEach(ds => {
      const day = p.calendar[ds];
      if (!Array.isArray(day)) return;
      const before = day.length;
      p.calendar[ds] = day.filter(s => s.seriesId !== seriesId);
      removed += before - p.calendar[ds].length;
      if (!p.calendar[ds].length) delete p.calendar[ds];
    });
  });
  saveDB();
  closeModal();
  renderCoachCalendar();
  updateNotifBadge();
  toast(`Удалена вся серия (${removed} записей)`);
}

function deleteSessionsByFilter(s) {
  const targetId = s.realId;
  const targetGroupId = s.groupId;
  const targetName = s.name || '';
  const targetSig = (s.blocks || []).map(b =>
    (b.startTime || '') + '|' + (b.complex || '') + '|' + (b.format || '') + '|' + (b.duration || '')
  ).sort().join(';');

  DB.players.forEach(p => {
    if (!p.calendar) return;
    Object.keys(p.calendar).forEach(ds => {
      const day = p.calendar[ds];
      if (!Array.isArray(day)) return;
      p.calendar[ds] = day.filter(sess => {
        if (targetId && sess.id === targetId) return false;
        if (targetGroupId && sess.groupId === targetGroupId) return false;
        if (!targetId && !targetGroupId) {
          if ((sess.name || '') !== targetName) return true;
          const sig = (sess.blocks || []).map(b =>
            (b.startTime || '') + '|' + (b.complex || '') + '|' + (b.format || '') + '|' + (b.duration || '')
          ).sort().join(';');
          return sig !== targetSig;
        }
        return true;
      });
      if (!p.calendar[ds].length) delete p.calendar[ds];
    });
  });
}

/* ============================================================
   ГРУППИРОВАННЫЙ СПИСОК ИГРОКОВ
   ============================================================ */
function renderCoachGroupedPlayers(players, preselectedIds) {
  const selected = new Set(preselectedIds || []);
  const groups = {};
  players.forEach(p => {
    const key = (p.team || '').trim() || '— Без команды —';
    if (!groups[key]) groups[key] = [];
    groups[key].push(p);
  });
  const teamNames = Object.keys(groups).sort((a, b) => a.localeCompare(b, 'ru'));

  return teamNames.map(team => {
    const list = groups[team].slice().sort((a, b) => (a.fio || '').localeCompare(b.fio || '', 'ru'));
    const safeId = 'cteam-' + team.replace(/[^a-zA-Zа-яА-Я0-9]/g, '_') + '-' + Math.random().toString(36).slice(2, 6);
    return `<div class="group-team" data-team="${escapeAttr(team)}" id="${safeId}">
      <div class="group-team-head" onclick="toggleCoachTeam('${safeId}', event)">
        <span class="arrow">▶</span>
        <span>${escapeHtml(team)}</span>
        <span class="count">${list.length}</span>
        <span class="team-actions" onclick="event.stopPropagation()">
          <button type="button" onclick="selectCoachTeam('${safeId}', true)">Все</button>
          <button type="button" onclick="selectCoachTeam('${safeId}', false)">Никто</button>
        </span>
      </div>
      <div class="group-team-body">
        ${list.map(o => `<label>
          <input type="checkbox" class="cc-grp-player" value="${o.id}" ${selected.has(o.id) ? 'checked' : ''}>
          <span>${escapeHtml(o.fio)}${o.position ? ' <span style="color:var(--ak-gray-dark);font-size:11px">· ' + escapeHtml(o.position) + '</span>' : ''}</span>
        </label>`).join('')}
      </div>
    </div>`;
  }).join('');
}

function toggleCoachTeam(teamId, event) {
  if (event) event.stopPropagation();
  const el = document.getElementById(teamId);
  if (!el) return;
  el.classList.toggle('open');
}
function expandAllCoachTeams(listId, open) {
  document.querySelectorAll('#' + listId + ' .group-team').forEach(el => el.classList.toggle('open', open));
}
function selectCoachTeam(teamId, checked) {
  const el = document.getElementById(teamId);
  if (!el) return;
  el.querySelectorAll('.cc-grp-player').forEach(cb => { cb.checked = checked; });
}
function clearCoachGroupSelection(listId) {
  document.querySelectorAll('#' + listId + ' .cc-grp-player').forEach(cb => { cb.checked = false; });
}
function filterCoachGroupPlayers(listId, searchId) {
  const q = (document.getElementById(searchId)?.value || '').trim().toLowerCase();
  const list = document.getElementById(listId);
  if (!list) return;

  list.querySelectorAll('.group-team').forEach(teamEl => {
    const teamName = (teamEl.dataset.team || '').toLowerCase();
    let visibleInTeam = 0;
    teamEl.querySelectorAll('.group-team-body label').forEach(lbl => {
      const text = lbl.innerText.toLowerCase();
      const match = !q || teamName.includes(q) || text.includes(q);
      lbl.style.display = match ? 'flex' : 'none';
      if (match) visibleInTeam++;
    });
    teamEl.style.display = visibleInTeam ? 'block' : 'none';
    if (q && visibleInTeam) teamEl.classList.add('open');
  });
}