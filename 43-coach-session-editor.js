/* ============================================================
   43-coach-session-editor.js
   Редактор тренировки и игры.
   ============================================================ */

let __sessionEditContext = null;
const __grpOpen = new Set(); 
const __selectedTeams = new Set(); 

function toggleGrp(id) {
  if (__grpOpen.has(id)) __grpOpen.delete(id);
  else __grpOpen.add(id);
  const listEl = document.getElementById('cs-grp-list');
  if (listEl && __sessionEditContext) {
    listEl.innerHTML = renderCoachGroupedPlayersByGroups(DB.players, __sessionEditContext.playerIds);
  }
}

function toggleTeamSelection(teamId) {
  if (__selectedTeams.has(teamId)) __selectedTeams.delete(teamId);
  else __selectedTeams.add(teamId);
  
  const playersInTeam = DB.players.filter(p => p.groupId === teamId);
  document.querySelectorAll('#cs-grp-list .cc-grp-player').forEach(cb => {
    if (playersInTeam.some(p => p.id === cb.value)) {
      cb.checked = __selectedTeams.has(teamId);
    }
  });
}

function openNewSessionForDate(ds) {
  openModal(`
    <h3>Что назначаем на ${escapeHtml(formatDateFull(ds))}?</h3>
    <div class="btn-row" style="margin-top:20px; flex-direction:column;">
      <button class="btn" style="width:100%; justify-content:center; padding:16px;" onclick="openSessionEditorType('${ds}', 'training')">🏋️ Тренировка</button>
      <button class="btn btn-red" style="width:100%; justify-content:center; padding:16px;" onclick="openSessionEditorType('${ds}', 'game')">🏒 Игра</button>
    </div>
    <div class="btn-row" style="margin-top:16px">
      <button class="btn-ghost btn" style="width:100%; justify-content:center;" onclick="closeModal()">Отмена</button>
    </div>
  `);
}

function openSessionEditorType(ds, type) {
  __selectedTeams.clear();
  if (type === 'game') {
    __sessionEditContext = {
      ds, type: 'game', isEdit: false, originalId: null, originalGroupId: null, originalSeriesId: null,
      originalBlocks: null, originalName: 'Игра', name: 'Игра', note: '', playerIds: [],
      blocks: [ { id: null, complex: 'Игра', complexItems: [], format: 'Командная', startTime: '18:00', duration: 90, note: '', fact: '', comment: '' } ],
      repeatDays: new Set(), repeatTimes: {}, repeatWeeks: 1, repeatStartDate: nextDayStr(ds)
    };
  } else {
    __sessionEditContext = {
      ds, type: 'training', isEdit: false, originalId: null, originalGroupId: null, originalSeriesId: null,
      originalBlocks: null, originalName: '', name: '', note: '', playerIds: [], blocks: [newEmptyBlock()],
      repeatDays: new Set(), repeatTimes: {}, repeatWeeks: 4, repeatStartDate: nextDayStr(ds)
    };
  }
  renderSessionForm();
}

function openSessionEditor(ds, idx, ev) {
  if (ev) ev.stopPropagation();
  const unsaved = listUnsavedSessions(ds);
  const currentSess = collectDaySessions(ds)[idx];
  if (unsaved.length && currentSess && !unsaved.includes(currentSess.id)) {
    uiConfirm(`Есть несохранённые оценки в ${unsaved.length} тренировк(е/ах).\nПродолжить без сохранения?`,
      () => { __coachFactDraft.clear(); openSessionEditorInner(ds, idx); }, () => {});
    return;
  }
  openSessionEditorInner(ds, idx);
}

function openSessionEditorInner(ds, idx) {
  const sessions = collectDaySessions(ds);
  const s = sessions[idx];
  if (!s) return;
  
  __selectedTeams.clear();
  const isGame = s.name && s.name.startsWith('Игра');

  __sessionEditContext = {
    ds, type: isGame ? 'game' : 'training', isEdit: true, 
    originalId: s.realId, originalGroupId: s.groupId, originalSeriesId: s.seriesId || null,
    originalBlocks: s.blocks.map(b => ({ ...b })), originalName: s.name || '', name: s.name || '', note: s.note || '',
    playerIds: s.players.map(p => p.id),
    blocks: s.blocks.length ? s.blocks.map(b => ({
      id: b.id || null, complex: b.complex || '', complexItems: Array.isArray(b.complexItems) ? b.complexItems.slice() : [],
      format: b.format || '', startTime: b.startTime || '18:00', duration: Number(b.duration) || 60, note: b.note || '', fact: b.fact || '', comment: b.comment || ''
    })) : [newEmptyBlock()],
    repeatDays: new Set(), repeatTimes: {}, repeatWeeks: 4, repeatStartDate: nextDayStr(ds)
  };
  
  if (isGame) {
    const nameParts = (s.name || '').split('·').map(x => x.trim());
    if (nameParts.length > 1) {
      const teamName = nameParts[1];
      const sg = DB.playerGroups?.general?.subgroups?.find(x => x.name === teamName);
      if (sg) __selectedTeams.add(sg.id);
    }
  }

  renderSessionForm();
}

function newEmptyBlock() {
  return { id: null, complex: '', complexItems: [], format: 'Самостоятельная', startTime: '18:00', duration: 60, note: '', fact: '', comment: '' };
}

function nextDayStr(ds) {
  const d = new Date(ds + 'T00:00:00');
  d.setDate(d.getDate() + 1);
  return localDateStr(d);
}

function renderCoachGroupedPlayersByGroups(players, preselectedIds) {
  const selected = new Set(preselectedIds || []);
  
  const makeList = (list) => {
    return list.map(o => `<label style="display:flex;align-items:center;gap:8px;padding:6px 8px;cursor:pointer;">
      <input type="checkbox" class="cc-grp-player" value="${o.id}" ${selected.has(o.id) ? 'checked' : ''}>
      <span>${escapeHtml(o.fio)}</span>
    </label>`).join('');
  };

  const stars = players.filter(p => !p.groupId || p.groupId === 'g_stars');
  const special = players.filter(p => p.groupId === 'g_special');
  const generalSgs = DB.playerGroups?.general?.subgroups || [];

  let html = '';

  // 1. Звездочки
  const starsOpen = __grpOpen.has('g_stars');
  if (stars.length) {
    html += `<div class="group-team ${starsOpen ? 'open' : ''}" style="margin-bottom:8px">
      <div class="group-team-head" onclick="toggleGrp('g_stars')"><span class="arrow">▶</span>Звездочки <span class="count">${stars.length}</span></div>
      <div class="group-team-body">${makeList(stars)}</div>
    </div>`;
  }

  // 2. Общая группа
  const generalOpen = __grpOpen.has('g_general');
  if (generalSgs.length) {
    html += `<div class="group-team ${generalOpen ? 'open' : ''}" style="margin-bottom:8px; border-color:var(--ak-green-dark);">
      <div class="group-team-head" onclick="toggleGrp('g_general')"><span class="arrow">▶</span>Общая группа (команды) <span class="count">${generalSgs.length}</span></div>
      <div class="group-team-body" style="padding-left:16px; background:#fafbfb;">
        ${generalSgs.map(sg => {
          const teamPlayers = players.filter(p => p.groupId === sg.id);
          const sgOpen = __grpOpen.has(sg.id);
          const isTeamChecked = __selectedTeams.has(sg.id);

          return `<div class="group-team ${sgOpen ? 'open' : ''}" style="margin-bottom:6px; border-left:3px solid var(--ak-red); background:#fff;">
            <div class="group-team-head" style="background:#f4f5f6;">
              <input type="checkbox" style="width:16px;height:16px;accent-color:var(--ak-red);cursor:pointer;margin-right:4px;" 
                     ${isTeamChecked ? 'checked' : ''} 
                     onclick="event.stopPropagation(); toggleTeamSelection('${sg.id}')">
              <span class="arrow" onclick="toggleGrp('${sg.id}')">▶</span>
              <span onclick="toggleGrp('${sg.id}')" style="flex:1;">${escapeHtml(sg.name)} <span class="count">${teamPlayers.length}</span></span>
            </div>
            <div class="group-team-body">
              ${teamPlayers.length ? makeList(teamPlayers) : '<div style="padding:6px;font-size:11px;color:var(--ak-gray-dark);">Нет игроков</div>'}
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  }

  // 3. Спецгруппа
  const specialOpen = __grpOpen.has('g_special');
  if (special.length) {
    html += `<div class="group-team ${specialOpen ? 'open' : ''}" style="margin-bottom:8px">
      <div class="group-team-head" onclick="toggleGrp('g_special')"><span class="arrow">▶</span>Спецгруппа <span class="count">${special.length}</span></div>
      <div class="group-team-body">${makeList(special)}</div>
    </div>`;
  }

  return html;
}

function renderSessionForm() {
  const ctx = __sessionEditContext;
  if (!ctx) return;
  syncFormToContext();

  let blocksHtml = '';
  if (ctx.type === 'game') {
    const b = ctx.blocks[0];
    blocksHtml = `<div class="cc-block-editor">
      <div class="field"><label>Название игры (соперник)</label><input class="blk-note" value="${escapeAttr(b.note || '')}" placeholder="Например: против Ак Барс" onchange="onBlockFieldChange(0,'note',this.value)"></div>
      <div class="cc-time-row">
        <div class="field"><label>Время начала</label><input type="time" class="blk-start" value="${escapeAttr(b.startTime)}" onchange="onBlockStartChange(0, this.value)"></div>
        <div class="field"><label>Продолжительность, мин</label><input type="number" min="1" max="300" class="blk-dur" value="${b.duration}" onchange="onBlockDurationChange(0, this.value)"></div>
        <div class="field"><label>Окончание</label><div class="cc-block-end" id="cs-block-end-0">${minutesToTime(timeToMinutes(b.startTime) + b.duration)}</div></div>
      </div>
    </div>`;
  } else {
    blocksHtml = ctx.blocks.map((b, i) => renderBlockEditor(b, i)).join('');
  }

  const playersHtml = renderCoachGroupedPlayersByGroups(DB.players, ctx.playerIds);
  const repeatHtml = renderRepeatBlock();

  const hasTemplates = Array.isArray(DB.templates) && DB.templates.length > 0;
  const templatePickerHtml = (hasTemplates && ctx.type === 'training') ? `<div class="field"><label>Шаблоны</label>${renderTemplateDropdownHtml()}</div>` : '';

  openModal(`<div style="display:flex; justify-content:space-between; align-items:flex-start;">
    <h3>${ctx.isEdit ? 'Редактирование' : (ctx.type === 'game' ? 'Новая игра' : 'Новая тренировка')}</h3>
    <button type="button" class="modal-close-x" onclick="closeModal()" title="Закрыть">&times;</button>
  </div>
    <p class="subtitle" style="margin-top:-8px">${escapeHtml(formatDateFull(ctx.ds))}</p>

    <div class="field"><label>Дата</label><input type="date" id="cs-date" value="${escapeAttr(ctx.ds)}"></div>
    
    ${ctx.type === 'training' ? `
      <div class="field"><label>Название тренировки</label><input id="cs-name" value="${escapeAttr(ctx.name || '')}" placeholder="Например: Ледовая, ОФП"></div>
    ` : ''}

    ${templatePickerHtml}

    <div class="field">
      <label>${ctx.type === 'game' ? 'Детали игры' : 'Блоки тренировки'}</label>
      <div id="cs-blocks-list">${blocksHtml}</div>
      ${ctx.type === 'training' ? `<div style="margin-top:8px"><button type="button" class="btn btn-sm btn-ghost" onclick="addBlockToForm()">+ Добавить блок</button></div>` : ''}
    </div>

    <div class="field"><label>Игроки / Команды</label>
      <div class="group-tools">
        <input type="text" id="cs-search" placeholder="Поиск по ФИО…" oninput="filterCoachGroupPlayers('cs-grp-list','cs-search')">
        <button type="button" onclick="clearCoachGroupSelection('cs-grp-list')">Снять всех</button>
      </div>
      <div class="group-list" id="cs-grp-list" style="max-height:350px">${playersHtml}</div>
    </div>

    ${ctx.type === 'training' ? repeatHtml : ''}

    <div class="btn-row" style="margin-top:16px">
      <button class="btn" onclick="saveSessionFromForm()">Сохранить</button>
      ${ctx.type === 'training' ? `<button class="btn btn-ghost" onclick="saveCurrentAsTemplate()">💾 Сохранить как шаблон</button>` : ''}
      <button class="btn-ghost btn" onclick="closeModal()">Отмена</button>
    </div>`);

  setTimeout(() => {
    document.querySelectorAll('#cs-grp-list .cc-grp-player').forEach(cb => { if (ctx.playerIds.includes(cb.value)) cb.checked = true; });
    if (ctx.type === 'training') updateRepeatPreview();
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
      <label>Комплекс упражнений</label>
      <div class="complex-picker" data-block-index="${idx}">
        <button type="button" class="complex-picker-btn ${complexCls}" onclick="toggleComplexPicker(event, ${idx})">
          <span class="complex-picker-text">${escapeHtml(complexLabel)}</span>
          <span class="complex-picker-caret">▾</span>
        </button>
        <div class="complex-picker-popover" id="complex-popover-${idx}" data-block-idx="${idx}" onclick="event.stopPropagation()"></div>
      </div>
    </div>

    <div class="field">
      <label>Формат работы</label>
      <select class="blk-format" data-block-index="${idx}" onchange="onBlockFieldChange(${idx},'format',this.value)">${formatOptions}</select>
    </div>

    <div class="cc-time-row">
      <div class="field"><label>Начало</label><input type="time" class="blk-start" data-block-index="${idx}" value="${escapeAttr(startT)}" onchange="onBlockStartChange(${idx}, this.value)"></div>
      <div class="field"><label>Мин</label><input type="number" min="1" max="600" class="blk-dur" data-block-index="${idx}" value="${dur}" onchange="onBlockDurationChange(${idx}, this.value)"></div>
      <div class="field"><label>Конец</label><div class="cc-block-end" id="cs-block-end-${idx}">${endT}</div></div>
    </div>

    <div class="field">
      <label>Примечание</label>
      <input class="blk-note" data-block-index="${idx}" value="${escapeAttr(block.note || '')}" placeholder="акцент" onchange="onBlockFieldChange(${idx},'note',this.value)">
    </div>
  </div>`;
}

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

function collectValidBlocksFromCtx(ctx) {
  const validBlocks = [];
  for (let i = 0; i < ctx.blocks.length; i++) {
    const b = ctx.blocks[i];
    const hasAny = (b.complex || '').trim() || (b.format || '').trim() || (b.note || '').trim();
    if (!hasAny && ctx.type !== 'game') continue;
    if (!b.startTime) { toast(`Блок #${i + 1}: укажите время начала`); return null; }
    if (!b.duration || Number(b.duration) <= 0) { toast(`Блок #${i + 1}: укажите продолжительность`); return null; }

    validBlocks.push({
      id: b.id || uid('blk'),
      complex: ctx.type === 'game' ? 'Игра' : (b.complex || '').trim(),
      complexItems: Array.isArray(b.complexItems) ? b.complexItems.slice() : [],
      format: ctx.type === 'game' ? 'Командная' : b.format || '',
      startTime: b.startTime,
      duration: Number(b.duration),
      note: (b.note || '').trim(),
      fact: b.fact || '',
      comment: b.comment || ''
    });
  }
  if (!validBlocks.length && ctx.type !== 'game') { toast('Добавьте хотя бы один блок'); return null; }
  return validBlocks;
}

function saveSessionFromForm() {
  syncFormToContext();
  const ctx = __sessionEditContext;
  if (!ctx) return;

  const ds = ctx.ds;
  if (!ds) { toast('Укажите дату'); return; }

  // Собираем игроков из отмеченных команд
  let finalPlayerIds = new Set(ctx.playerIds);
  __selectedTeams.forEach(tid => {
    DB.players.filter(p => p.groupId === tid).forEach(p => finalPlayerIds.add(p.id));
  });
  finalPlayerIds = Array.from(finalPlayerIds);

  const validBlocks = collectValidBlocksFromCtx(ctx);
  if (!validBlocks) return;
  
  if (ctx.type !== 'game' && !finalPlayerIds.length) { 
    toast('Выберите хотя бы одного игрока'); 
    return; 
  }
  if (ctx.type === 'game' && !finalPlayerIds.length && __selectedTeams.size === 0) {
    toast('Выберите команду'); 
    return; 
  }

  // ЛОГИКА ДЛЯ ИГР: если выбраны команды, формируем название из команды
  let finalName = (ctx.name || '').trim();
  if (ctx.type === 'game' && __selectedTeams.size > 0) {
    const teamNames = Array.from(__selectedTeams).map(tid => {
      const sg = DB.playerGroups?.general?.subgroups?.find(x => x.id === tid);
      return sg ? sg.name : '';
    }).filter(Boolean);
    if (teamNames.length) {
      finalName = 'Игра · ' + teamNames.join(', ');
    }
  }

  const newSessionId = ctx.originalId || uid('sess');
  const newGroupId = ctx.originalGroupId || (finalPlayerIds.length > 1 ? uid('grp') : null);

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

  // Если у игры нет игроков, но есть команда, привязываем игру к первому попавшемуся игроку, 
  // чтобы она вообще появилась в календаре. Или сохраняем как "пустую" запись.
  if (ctx.type === 'game' && finalPlayerIds.length === 0) {
    if (DB.players.length > 0) {
      finalPlayerIds.push(DB.players[0].id); // Привязка для календаря
    } else {
      toast('В базе нет ни одного игрока, некуда записать игру');
      return;
    }
  }

  finalPlayerIds.forEach(pid => {
    const p = DB.players.find(x => x.id === pid);
    if (!p) return;
    if (!p.calendar) p.calendar = {};
    if (!p.calendar[ds]) p.calendar[ds] = [];
    p.calendar[ds].push({
      id: newSessionId,
      name: finalName,
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
  toast(ctx.isEdit ? 'Обновлено' : `Назначено: ${finalPlayerIds.length} ${plural(finalPlayerIds.length, 'игрок', 'игрока', 'игроков')}`);
}