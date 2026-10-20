/* ============================================================
   41-coach-day-modal.js
   Модалка дня тренера.
   Исправлено: корректное отображение игр без игроков.
   ============================================================ */

function openDaySessions(ds) {
  if (__coachDayCurrentDs && __coachDayCurrentDs !== ds) {
    const unsaved = listUnsavedSessions(__coachDayCurrentDs);
    if (unsaved.length) {
      uiConfirm(`В дне ${formatDateFull(__coachDayCurrentDs)} есть несохранённые оценки (${unsaved.length} тренировк(и)).\nПродолжить без сохранения?`,
        () => { __coachFactDraft.clear(); __coachDayCurrentDs = ds; openDaySessionsInner(ds); }, () => {});
      return;
    }
  }
  __coachDayCurrentDs = ds;
  openDaySessionsInner(ds);
}

function openDaySessionsInner(ds) {
  if (typeof closeAllComplexPickers === 'function') closeAllComplexPickers();
  __coachOpenSessions = new Set(Array.from(__coachOpenSessions).filter(k => k.startsWith(ds + '|')));
  const sessions = collectDaySessions(ds);
  const title = formatDateFull(ds);

  const listHtml = sessions.length
    ? sessions.map((s, i) => renderCoachSessionItem(s, i, ds)).join('')
    : '<p class="subtitle" style="text-align:center;padding:20px 0">На этот день тренировок нет.</p>';

  openModal(`<h3>${escapeHtml(title)}</h3>
    <div class="cc-day-list">${listHtml}</div>
    <div class="btn-row" style="margin-top:16px">
      <button class="btn" onclick="openNewSessionForDate('${ds}')">+ Добавить</button>
      <button class="btn-ghost btn" onclick="closeDaySessions()">Закрыть</button>
    </div>`);
}

function closeDaySessions() {
  const ds = __coachDayCurrentDs;
  if (ds) {
    const unsaved = listUnsavedSessions(ds);
    if (unsaved.length) {
      uiConfirm(`Есть несохранённые оценки в ${unsaved.length} тренировк(е/ах).\nЗакрыть без сохранения?`,
        () => { __coachFactDraft.clear(); __coachDayCurrentDs = null; closeModal(); }, () => {});
      return;
    }
  }
  __coachFactDraft.clear();
  __coachDayCurrentDs = null;
  closeModal();
}

function renderCoachSessionItem(s, idx, ds) {
  const color = sessionColor(s);
  const total = sessionTotalMinutes(s);
  const range = sessionTimeRange(s);
  const facts = computeSessionFactsSummary(s, ds);
  
  const factHtml = `
    <span class="cc-fact-pill done" title="Выполнено полностью">${facts.done}</span>
    <span class="cc-fact-pill partial" title="Выполнено частично">${facts.partial}</span>
    <span class="cc-fact-pill notdone" title="Не выполнено">${facts.notdone}</span>
    ${facts.unmarked ? `<span class="cc-fact-pill unmarked" title="Без отметки">${facts.unmarked}</span>` : ''}
  `;

  const key = ds + '|' + s.id;
  const isOpen = __coachOpenSessions.has(key);
  const hasDraft = hasUnsavedDraft(ds, s.id);

  const blocksHtml = (s.blocks || []).map((b, bi) => renderCoachSessionBlock(s, b, bi, ds)).join('');

  // Если это игра, выводим название команды (которое сохранено в s.name), иначе список игроков
  const isGame = s.name && s.name.startsWith('Игра');
  const metaTitle = isGame 
    ? `<strong>${escapeHtml(s.name)}</strong>` 
    : `${s.players.length} ${plural(s.players.length, 'игрок', 'игрока', 'игроков')}`;

  // Если это игра, скрываем оценку фактов (она не нужна, если нет игроков)
  const factBlock = isGame ? '' : `· ${factHtml}`;
  const saveBlock = isGame && s.players.length === 0 ? '' : `
    <div class="cc-sess-save-row">
      <span class="cc-sess-save-hint" id="save-hint-${escapeAttr(s.id)}">
        ${hasDraft ? `Несохранённых изменений: ${(__coachFactDraft.get(draftKey(ds, s.id)) || new Map()).size}` : 'Все изменения сохранены'}
      </span>
      <button type="button" class="btn cc-sess-save-btn ${hasDraft ? 'has-changes' : ''}" id="save-btn-${escapeAttr(s.id)}" onclick="saveCoachSessionFacts('${ds}', '${s.id}')">
        💾 Сохранить
      </button>
    </div>
  `;

  return `<div class="cc-sess-item ${isOpen ? 'open' : ''}"
              data-sess-id="${escapeAttr(s.id)}"
              data-sess-idx="${idx}"
              style="border-left-color:${color}">

    <div class="cc-sess-head" onclick="toggleCoachSessionAccordion('${ds}', '${s.id}')">
      <div class="cc-sess-head-left">
        <span class="cc-sess-arrow">▶</span>
        <div class="cc-sess-head-info">
          <div class="cc-sess-time">${escapeHtml(range)} · ${total} мин</div>
          <div class="cc-sess-name">
            ${escapeHtml(s.name || 'Тренировка')}
            ${hasDraft ? '<span class="cc-sess-draft-badge" title="Есть несохранённые изменения">●</span>' : ''}
          </div>
          <div class="cc-sess-meta" title="Статусы игроков: зеленый - выполнено, желтый - частично, красный - не выполнено, серый - без отметки">
            ${metaTitle} ${factBlock}
          </div>
        </div>
      </div>
      <div class="cc-sess-actions" onclick="event.stopPropagation()">
        <button class="cc-sess-edit" title="Изменить" onclick="event.stopPropagation(); openSessionEditor('${ds}', ${idx}, event)">
          <span class="cc-sess-action-icon">✎</span><span class="cc-sess-action-text">Изменить</span>
        </button>
        <button class="cc-sess-del" title="Удалить" onclick="event.stopPropagation(); deleteSessionFromDay('${ds}', ${idx}, event)">
          <span class="cc-sess-action-icon">🗑</span><span class="cc-sess-action-text">Удалить</span>
        </button>
      </div>
    </div>

    <div class="cc-sess-body">
      <div class="cc-sess-body-inner">
        ${s.note ? `<div class="cc-sess-note" style="margin-bottom:8px">${escapeHtml(s.note)}</div>` : ''}
        
        ${!isGame ? `<div style="margin-bottom:8px; display:flex; justify-content:flex-end;">
          <button type="button" class="btn btn-sm btn-ghost" onclick="markAllSessionBlocksDone('${ds}', '${s.id}')">✓ Всем «Выполнено»</button>
        </div>` : ''}

        ${blocksHtml || '<div class="cc-players-empty">Нет блоков</div>'}

        ${saveBlock}
      </div>
    </div>
  </div>`;
}

function markAllSessionBlocksDone(ds, sessId) {
  const sessions = collectDaySessions(ds);
  const sess = sessions.find(x => x.id === sessId);
  if (!sess) return;
  const draft = getFactDraft(ds, sessId);
  
  (sess.players || []).forEach(p => {
    (sess.blocks || []).forEach((b, bi) => {
      draft.set(draftEntryKey(p.id, bi), { fact: 'done', comment: '' });
    });
  });
  
  reRenderCoachSession(ds, sessId);
  const item = document.querySelector(`.cc-sess-item[data-sess-id="${cssEscapeSimple(sessId)}"]`);
  if (item) item.classList.add('open');
  updateDraftBadge(ds, sessId);
  toast('Всем игрокам выставлено «Выполнено»');
}

function renderCoachSessionBlock(sess, block, blockIdx, ds) {
  const end = minutesToTime(timeToMinutes(block.startTime) + (Number(block.duration) || 0));
  const formatDisplay = block.format ? escapeHtml(block.format) : '— не выбрано —';

  const playersHtml = sess.players.map(p => {
    const player = DB.players.find(x => x.id === p.id);
    if (!player) return '';

    const realRef = findMatchingPlayerBlock(player, ds, sess, block);
    const dbFact = realRef ? (realRef.block.fact || '') : '';
    const dbComment = realRef ? (realRef.block.comment || '') : '';

    const draft = getFactDraft(ds, sess.id);
    const dKey = draftEntryKey(player.id, blockIdx);
    const curFact = draft.has(dKey) ? draft.get(dKey).fact : dbFact;
    const curComment = draft.has(dKey) ? draft.get(dKey).comment : dbComment;

    const needComment = (curFact === 'partial' || curFact === 'notdone');
    const factCls = factClass(curFact);

    const factOptions = FACT_OPTIONS.map(f => {
      const sel = (f.value === curFact) ? 'selected' : '';
      return `<option value="${f.value}" ${sel}>${f.label}</option>`;
    }).join('');

    return `<div class="cc-sess-block-player">
      <div class="cc-sess-block-player-head">
        <span class="cc-sess-block-player-fio">${escapeHtml(player.fio || '')}</span>
      </div>
      <div class="cc-sess-block-player-fields">
        <select class="pde-fact ${factCls}" data-pid="${escapeAttr(player.id)}" data-block="${blockIdx}" onchange="onCoachDayBlockFactChange('${ds}', '${player.id}', '${sess.id}', ${blockIdx}, this.value)">
          ${factOptions}
        </select>
        <input type="text" class="pde-comment" data-pid="${escapeAttr(player.id)}" data-block="${blockIdx}"
               placeholder="${needComment ? 'Комментарий (обязательно)' : 'Комментарий'}"
               value="${escapeAttr(curComment)}" style="display:${needComment ? 'block' : 'none'}"
               oninput="onCoachDayBlockCommentChange('${ds}', '${player.id}', '${sess.id}', ${blockIdx}, this.value)">
      </div>
    </div>`;
  }).join('');

  return `<div class="cc-sess-block" data-block-idx="${blockIdx}">
    <div class="cc-sess-block-head">
      <span class="cc-sess-block-time">${escapeHtml(block.startTime || '')}–${end} · ${Number(block.duration) || 0} мин</span>
      <span class="cc-sess-block-format">${formatDisplay}</span>
    </div>
    <div class="cc-sess-block-name">${escapeHtml(block.complex || 'Блок')}</div>
    ${renderBlockExercisesLine(block)}
    ${playersHtml ? `<div class="cc-sess-block-players">${playersHtml}</div>` : ''}
  </div>`;
}

function findMatchingPlayerBlock(player, ds, session, displayBlock) {
  if (!player.calendar || !player.calendar[ds]) return null;
  const day = player.calendar[ds];
  if (!Array.isArray(day)) return null;

  let candidates = [];
  if (session.realId) candidates = day.filter(s => s.id === session.realId);
  if (!candidates.length) {
    const sessName = session.name || '';
    const sessSig = (session.blocks || []).map(b => (b.startTime || '') + '|' + (b.complex || '') + '|' + (b.format || '') + '|' + (b.duration || '')).sort().join(';');
    candidates = day.filter(s => {
      if ((s.name || '') !== sessName) return false;
      const sig = (s.blocks || []).map(b => (b.startTime || '') + '|' + (b.complex || '') + '|' + (b.format || '') + '|' + (b.duration || '')).sort().join(';');
      return sig === sessSig;
    });
  }
  if (!candidates.length) return null;
  const sess = candidates[0];

  if (displayBlock.id) {
    const byId = sess.blocks.findIndex(b => b.id === displayBlock.id);
    if (byId >= 0) return { session: sess, block: sess.blocks[byId], index: byId };
  }
  const sig = (b) => (b.startTime || '') + '|' + (b.complex || '') + '|' + (b.format || '') + '|' + (b.duration || '');
  const target = sig(displayBlock);
  const bySig = sess.blocks.findIndex(b => sig(b) === target);
  if (bySig >= 0) return { session: sess, block: sess.blocks[bySig], index: bySig };
  return null;
}

function toggleCoachSessionAccordion(ds, sessId) {
  const key = ds + '|' + sessId;
  const wasOpen = __coachOpenSessions.has(key);
  if (wasOpen && hasUnsavedDraft(ds, sessId)) {
    uiConfirm('В тренировке есть несохранённые оценки.\nСвернуть без сохранения?',
      () => { clearFactDraft(ds, sessId); reRenderCoachSession(ds, sessId); __coachOpenSessions.delete(key);
        const item = document.querySelector(`.cc-sess-item[data-sess-id="${cssEscapeSimple(sessId)}"]`); if (item) item.classList.remove('open'); }, () => {});
    return;
  }
  if (wasOpen) __coachOpenSessions.delete(key);
  else __coachOpenSessions.add(key);
  const item = document.querySelector(`.cc-sess-item[data-sess-id="${cssEscapeSimple(sessId)}"]`);
  if (!item) return;
  const isOpenNow = __coachOpenSessions.has(key);
  item.classList.toggle('open', isOpenNow);
}

function reRenderCoachSession(ds, sessId) {
  const sessions = collectDaySessions(ds);
  const idx = sessions.findIndex(s => s.id === sessId);
  if (idx < 0) return;
  const s = sessions[idx];
  const item = document.querySelector(`.cc-sess-item[data-sess-id="${cssEscapeSimple(sessId)}"]`);
  if (!item) return;
  const wasOpen = item.classList.contains('open');
  const tmp = document.createElement('div');
  tmp.innerHTML = renderCoachSessionItem(s, idx, ds);
  const newItem = tmp.firstElementChild;
  if (wasOpen) { newItem.classList.add('open'); __coachOpenSessions.add(ds + '|' + sessId); }
  item.replaceWith(newItem);
}

function computeSessionFactsSummary(sess, ds) {
  let done = 0, partial = 0, notdone = 0, unmarked = 0;
  (sess.players || []).forEach(p => {
    const player = DB.players.find(x => x.id === p.id);
    if (!player) return;
    (sess.blocks || []).forEach(b => {
      const ref = findMatchingPlayerBlock(player, ds, sess, b);
      if (!ref) return;
      if (ref.block.fact === 'done') done++;
      else if (ref.block.fact === 'partial') partial++;
      else if (ref.block.fact === 'notdone') notdone++;
      else unmarked++;
    });
  });
  return { done, partial, notdone, unmarked };
}