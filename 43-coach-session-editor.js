/* ============================================================
   43-coach-session-editor.js
   Редактор тренировки: открытие формы, рендер блоков,
   синхронизация формы с контекстом, сохранение.

   Содержит:
   - openSessionEditor / openSessionEditorInner
   - openNewSessionForDate
   - newEmptyBlock / nextDayStr
   - renderSessionForm / renderBlockEditor
   - syncFormToContext
   - onBlockFieldChange / onBlockStartChange / onBlockDurationChange
   - updateBlockEndPreview
   - addBlockToForm / removeBlockFromForm
   - collectValidBlocksFromCtx / createSessionForDate
   - saveSessionFromForm

   Интеграция с шаблонами (48-coach-templates.js):
   - в форму добавлена кнопка «Заполнить из шаблона»
   - в футер добавлена кнопка «Сохранить как шаблон»
   ============================================================ */

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

  /* Блок «Заполнить из шаблона» — только если шаблоны есть */
  const hasTemplates = Array.isArray(DB.templates) && DB.templates.length > 0;
  const templatePickerHtml = hasTemplates
    ? `<div class="field"><label>Шаблоны</label>${renderTemplateDropdownHtml()}</div>`
    : '';

  openModal(`<h3>${ctx.isEdit ? 'Редактирование тренировки' : 'Новая тренировка'}</h3>
    <p class="subtitle" style="margin-top:-8px">${escapeHtml(formatDateFull(ctx.ds))}</p>

    <div class="field"><label>Дата</label>
      <input type="date" id="cs-date" value="${escapeAttr(ctx.ds)}"></div>

    <div class="field"><label>Название тренировки (необязательно)</label>
      <input id="cs-name" value="${escapeAttr(ctx.name || '')}" placeholder="Например: Ледовая, ОФП, Игровая"></div>

    <div class="field"><label>Примечание к тренировке</label>
      <input id="cs-note" value="${escapeAttr(ctx.note || '')}" placeholder="акцент на ногах и т.п."></div>

    ${templatePickerHtml}

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
      <button class="btn btn-ghost" onclick="saveCurrentAsTemplate()">💾 Сохранить как шаблон</button>
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
   СОХРАНЕНИЕ ТРЕНИРОВКИ
   ============================================================ */
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