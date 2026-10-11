/* ============================================================
   45-coach-repeat-block.js
   Блок «Повторить на другие дни» в редакторе тренировки.

   Содержит:
   - renderRepeatBlock
   - onRepeatDayToggle / onRepeatTimeChange
   - onRepeatWeeksChange / onRepeatStartChange
   - computeRepeatDates
   - updateRepeatPreview
   - applyRepeatToForm
   ============================================================ */

const DOW_INDEX_RU = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];

const REPEAT_WEEKS_OPTIONS = [
  { value: 1, label: '1 неделя' },
  { value: 2, label: '2 недели' },
  { value: 3, label: '3 недели' },
  { value: 4, label: '4 недели' },
  { value: 6, label: '6 недель' },
  { value: 8, label: '8 недель' }
];

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

  const weeksOptionsHtml = REPEAT_WEEKS_OPTIONS.map(opt =>
    `<option value="${opt.value}" ${ctx.repeatWeeks === opt.value ? 'selected' : ''}>${opt.label}</option>`
  ).join('');

  return `<div class="cs-repeat-block">
    <div class="cs-repeat-title">Повторить на другие дни</div>

    <div class="cs-repeat-days">${daysHtml}</div>

    <div class="cs-repeat-options">
      <div class="field">
        <label>Сколько недель вперёд</label>
        <select id="cs-repeat-weeks" onchange="onRepeatWeeksChange(this.value)">
          ${weeksOptionsHtml}
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