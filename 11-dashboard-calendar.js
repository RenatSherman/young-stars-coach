/* ============================================================
   11-dashboard-calendar.js
   Календарь тренера:
   - месячная сетка (как было)
   - модалка дня → список тренировок
   - тренировка раскрывается → инлайн-список игроков
   - у каждого игрока — список его блоков с фактом по каждому блоку
   - массовые кнопки: всем выполнено / не выполнено / сбросить
   - кнопка [Открыть] → карточка игрока
   - создание/редактирование тренировки с блоком «Повторить на другие дни»
     (серии с seriesId, удаление всей серии или одного дня)
   ============================================================ */

/* ===== Месячная сетка ===== */
function renderCoachCalendar() {
  const el = document.getElementById('coach-calendar-content');
  if (!el) return;

  const today = new Date();
  const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

  if (!coachCalMonth) coachCalMonth = currentMonth;

  const [year, month] = coachCalMonth.split('-').map(Number);

  el.innerHTML = `
    <div class="card cc-toolbar-card">
      <div class="cc-toolbar">
        <div class="cc-nav">
          <button class="cc-nav-btn" onclick="coachCalShiftMonth(-1)" title="Предыдущий месяц">‹</button>
          <div class="cc-month-title">${MONTH_NAMES_RU[month - 1]} ${year}</div>
          <button class="cc-nav-btn" onclick="coachCalShiftMonth(1)" title="Следующий месяц">›</button>
        </div>
        <button class="btn btn-sm btn-ghost" onclick="coachCalToday()">Текущий месяц</button>
        <button class="btn btn-sm" onclick="openNewSessionForDate(localDateStr(new Date()))">+ Тренировка</button>
        <div class="cc-legend">
          <span><span class="cc-dot cc-dot-self"></span> Самостоятельная</span>
          <span><span class="cc-dot cc-dot-ind"></span> Индивидуальная</span>
          <span><span class="cc-dot cc-dot-grp"></span> В группе</span>
        </div>
      </div>
    </div>
    <div class="card cc-month-card">
      <div class="cc-month-wrap">
        <div class="cc-month-head">
          ${DOW_SHORT_RU.map((d, i) => `<div class="cc-dow-head ${i >= 5 ? 'weekend' : ''}">${d}</div>`).join('')}
        </div>
        <div class="cc-month-grid" id="cc-month-grid"></div>
      </div>
    </div>
  `;

  renderCoachMonthGrid(year, month);
}

function coachCalShiftMonth(delta) {
  const [y, m] = coachCalMonth.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  coachCalMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  renderCoachCalendar();
}

function coachCalToday() {
  const today = new Date();
  coachCalMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  renderCoachCalendar();
}

function renderCoachMonthGrid(year, month) {
  const grid = document.getElementById('cc-month-grid');
  if (!grid) return;

  const first = new Date(year, month - 1, 1);
  let dow = first.getDay(); if (dow === 0) dow = 7;
  const firstMonday = new Date(year, month - 1, 1 - (dow - 1));

  const today = localDateStr(new Date());
  const days = [];

  for (let i = 0; i < 42; i++) {
    const d = new Date(firstMonday);
    d.setDate(firstMonday.getDate() + i);
    days.push(d);
  }
  while (days.length > 35) {
    const lastWeek = days.slice(-7);
    if (lastWeek.every(d => d.getMonth() !== (month - 1))) {
      days.length = days.length - 7;
    } else break;
  }

  let html = '';
  days.forEach(d => {
    const ds = localDateStr(d);
    const isOther = d.getMonth() !== (month - 1);
    const isWeekend = (d.getDay() === 0 || d.getDay() === 6);
    const isToday = ds === today;

    const sessions = collectDaySessions(ds);
    const total = sessions.length;
    const visible = sessions.slice(0, 3);

    html += `<div class="cc-day ${isOther ? 'other-month' : ''} ${isWeekend ? 'weekend' : ''} ${isToday ? 'today' : ''}"
                  onclick="openDaySessions('${ds}')">
      <div class="cc-day-head">
        <span class="cc-day-num ${isToday ? 'today-badge' : ''}">${d.getDate()}</span>
        ${total ? `<span class="cc-day-total">${total}</span>` : ''}
      </div>
      <div class="cc-day-bars">
        ${visible.map(sess => {
          const color = sessionColor(sess);
          const label = sess.name || (sess.blocks[0] && sess.blocks[0].complex) || 'Тренировка';
          const t = sessionFirstTime(sess);
          return `<div class="cc-day-bar" style="background:${color}">
            ${t ? `<span class="cc-bar-time">${escapeHtml(t)}</span>` : ''}
            <span class="cc-bar-label">${escapeHtml(label)}</span>
          </div>`;
        }).join('')}
        ${sessions.length > 3 ? `<div class="cc-more">+${sessions.length - 3} ещё</div>` : ''}
      </div>
    </div>`;
  });

  grid.innerHTML = html;
}

function sessionFirstTime(sess) {
  if (!sess || !Array.isArray(sess.blocks) || !sess.blocks.length) return '';
  return sess.blocks[0].startTime || '';
}

/* ===== Сбор тренировок за день ===== */
function collectDaySessions(ds) {
  const map = new Map();

  DB.players.forEach(p => {
    const day = p.calendar && p.calendar[ds];
    if (!Array.isArray(day)) return;
    day.forEach(sess => {
      if (!sess) return;
      const key = sess.id || (sess.groupId ? sess.groupId + '|' + ds : ('solo_' + p.id + '_' + ds + '_' + (sess.name || '')));
      if (!map.has(key)) {
        map.set(key, {
          id: sess.id,
          groupId: sess.groupId,
          seriesId: sess.seriesId || null,
          name: sess.name || '',
          note: sess.note || '',
          blocks: Array.isArray(sess.blocks) ? sess.blocks.map(b => ({ ...b })) : [],
          players: []
        });
      }
      const entry = map.get(key);
      if (!entry.players.find(x => x.id === p.id)) {
        entry.players.push({ id: p.id, fio: p.fio, team: p.team || '' });
      }
    });
  });

  return Array.from(map.values()).sort((a, b) => {
    const ta = sessionFirstTime(a);
    const tb = sessionFirstTime(b);
    return (ta || '').localeCompare(tb || '');
  });
}

function sessionColor(sess) {
  const set = new Set();
  (sess.blocks || []).forEach(b => { if (b.format) set.add(b.format); });
  if (set.has('В группе')) return WORK_TYPE_COLORS['В группе'];
  if (set.has('Индивидуальная с тренером')) return WORK_TYPE_COLORS['Индивидуальная с тренером'];
  if (set.has('Самостоятельная')) return WORK_TYPE_COLORS['Самостоятельная'];
  return '#5a6169';
}

function sessionTotalMinutes(sess) {
  return (sess.blocks || []).reduce((acc, b) => acc + (Number(b.duration) || 0), 0);
}

function sessionTimeRange(sess) {
  if (!sess.blocks || !sess.blocks.length) return '';
  const sorted = sess.blocks
    .filter(b => b.startTime)
    .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
  if (!sorted.length) return '';
  const firstStart = sorted[0].startTime;
  const last = sorted[sorted.length - 1];
  const end = minutesToTime(timeToMinutes(last.startTime) + (Number(last.duration) || 0));
  return `${firstStart}–${end}`;
}

/* ============================================================
   МОДАЛКА ДНЯ
   ============================================================ */
let __dayOpenSessions = new Set(); // индексы раскрытых тренировок

function openDaySessions(ds) {
  __dayOpenSessions = new Set(); // при открытии — всё свёрнуто
  renderDaySessionsModal(ds);
}

function renderDaySessionsModal(ds) {
  const sessions = collectDaySessions(ds);
  const title = formatDateFull(ds);

  const listHtml = sessions.length
    ? sessions.map((s, i) => renderDaySessionCard(ds, s, i)).join('')
    : '<p class="subtitle" style="text-align:center;padding:20px 0">На этот день тренировок нет.</p>';

  openModal(`<h3>${escapeHtml(title)}</h3>
    <div class="cc-day-list">${listHtml}</div>
    <div class="btn-row" style="margin-top:16px">
      <button class="btn" onclick="openNewSessionForDate('${ds}')">+ Добавить тренировку</button>
      <button class="btn-ghost btn" onclick="closeModal()">Закрыть</button>
    </div>`);
}

function renderDaySessionCard(ds, s, idx) {
  const color = sessionColor(s);
  const total = sessionTotalMinutes(s);
  const range = sessionTimeRange(s);
  const isOpen = __dayOpenSessions.has(idx);
  const facts = computeSessionFactsSummary(s, ds);

  const blocksLine = s.blocks.length
    ? s.blocks.map(b => `${b.complex || 'Блок'} (${b.format || '—'}, ${b.duration || 0} мин)`).join(' · ')
    : '—';

  const factHtml = `
    <span class="cc-fact-pill done">${facts.done}</span>
    <span class="cc-fact-pill partial">${facts.partial}</span>
    <span class="cc-fact-pill notdone">${facts.notdone}</span>
    ${facts.unmarked ? `<span class="cc-fact-pill unmarked">${facts.unmarked}</span>` : ''}
  `;

  const playersPanel = isOpen ? renderPlayersFactPanel(ds, s, idx) : '';

  return `<div class="cc-sess-item" style="border-left-color:${color}">
    <div class="cc-sess-main">
      <div class="cc-sess-time">${escapeHtml(range)} · ${total} мин</div>
      <div class="cc-sess-name">${escapeHtml(s.name || 'Тренировка')}</div>
      <div class="cc-sess-meta">${escapeHtml(blocksLine)}</div>
      <div class="cc-sess-meta" style="margin-top:4px">
        ${s.players.length} ${plural(s.players.length, 'игрок', 'игрока', 'игроков')} · ${factHtml}
      </div>
      ${s.note ? `<div class="cc-sess-note">${escapeHtml(s.note)}</div>` : ''}

      <div style="margin-top:10px">
        <button type="button" class="btn btn-sm btn-ghost"
                onclick="event.stopPropagation();toggleDaySessionPlayers(${idx}, '${ds}')">
          ${isOpen ? 'Скрыть игроков' : 'Показать игроков'}
        </button>
      </div>

      ${playersPanel}
    </div>

    <div class="cc-sess-actions">
      <button class="cc-sess-edit" title="Редактировать тренировку"
              onclick="openSessionEditor('${ds}', ${idx}, event)">✎</button>
      <button class="cc-sess-del" title="Удалить тренировку"
              onclick="deleteSessionFromDay('${ds}', ${idx}, event)">🗑</button>
    </div>
  </div>`;
}

function toggleDaySessionPlayers(idx, ds) {
  if (__dayOpenSessions.has(idx)) __dayOpenSessions.delete(idx);
  else __dayOpenSessions.add(idx);
  renderDaySessionsModal(ds);
}

/* Подсчёт факта по тренировке (суммарно по всем игрокам и блокам) */
function computeSessionFactsSummary(sess, ds) {
  let done = 0, partial = 0, notdone = 0, unmarked = 0;
  const sessionId = sess.id;

  DB.players.forEach(p => {
    const day = p.calendar && p.calendar[ds];
    if (!Array.isArray(day)) return;
    day.forEach(s => {
      if (s.id !== sessionId) return;
      (s.blocks || []).forEach(b => {
        if (b.fact === 'done') done++;
        else if (b.fact === 'partial') partial++;
        else if (b.fact === 'notdone') notdone++;
        else unmarked++;
      });
    });
  });

  return { done, partial, notdone, unmarked };
}

/* ============================================================
   ПАНЕЛЬ ИГРОКОВ С ФАКТОМ (инлайн)
   ============================================================ */
function renderPlayersFactPanel(ds, s, sessionIdx) {
  // Собираем по игрокам: игрок + его блоки в этой тренировке
  const playersData = [];

  DB.players.forEach(p => {
    const day = p.calendar && p.calendar[ds];
    if (!Array.isArray(day)) return;
    const thisSession = day.find(x => x.id === s.id);
    if (!thisSession) return;

    playersData.push({
      id: p.id,
      fio: p.fio,
      team: p.team || '',
      blocks: (thisSession.blocks || []).map((b, bi) => ({
        blockIndex: bi,
        complex: b.complex || '',
        format: b.format || '',
        startTime: b.startTime || '',
        duration: Number(b.duration) || 0,
        fact: b.fact || '',
        comment: b.comment || ''
      }))
    });
  });

  if (!playersData.length) {
    return '<div class="cc-players-empty">Игроков нет</div>';
  }

  // Сохраняем во временное состояние, чтобы потом сохранить разом
  __factEditState[`${ds}|${s.id}`] = { ds, sessionId: s.id, players: playersData };

  const html = playersData.map(pd => {
    const blocksHtml = pd.blocks.map(b => {
      const end = minutesToTime(timeToMinutes(b.startTime) + b.duration);
      const needComment = (b.fact === 'partial' || b.fact === 'notdone');

      return `<div class="ccpf-block" data-player-id="${pd.id}" data-block-index="${b.blockIndex}">
        <div class="ccpf-block-head">
          <span class="ccpf-block-name">${escapeHtml(b.complex || 'Блок')} · ${escapeHtml(b.format || '—')}</span>
          <span class="ccpf-block-time">${escapeHtml(b.startTime)}–${end} · ${b.duration} мин</span>
        </div>
        <div class="ccpf-buttons">
          <button type="button"
                  class="ccpf-btn ${b.fact === 'done' ? 'active done' : ''}"
                  onclick="ccpfSetFact('${ds}','${s.id}','${pd.id}',${b.blockIndex},'done')">
            Выполнено
          </button>
          <button type="button"
                  class="ccpf-btn ${b.fact === 'partial' ? 'active partial' : ''}"
                  onclick="ccpfSetFact('${ds}','${s.id}','${pd.id}',${b.blockIndex},'partial')">
            Выполнено частично
          </button>
          <button type="button"
                  class="ccpf-btn ${b.fact === 'notdone' ? 'active notdone' : ''}"
                  onclick="ccpfSetFact('${ds}','${s.id}','${pd.id}',${b.blockIndex},'notdone')">
            Не выполнено
          </button>
        </div>
        <div class="ccpf-comment-wrap" style="display:${needComment ? 'block' : 'none'}">
          <input type="text" class="ccpf-comment" placeholder="Комментарий (обязательно)"
                 value="${escapeAttr(b.comment || '')}"
                 oninput="ccpfSetComment('${ds}','${s.id}','${pd.id}',${b.blockIndex}, this.value)">
        </div>
      </div>`;
    }).join('');

    return `<div class="ccpf-player">
      <div class="ccpf-player-head">
        <span class="ccpf-fio">${escapeHtml(pd.fio)}</span>
        ${pd.team ? `<span class="ccpf-team">${escapeHtml(pd.team)}</span>` : ''}
        <button type="button" class="ccpf-open" onclick="openPlayerFromSession('${pd.id}')">Открыть</button>
      </div>
      <div class="ccpf-blocks">${blocksHtml}</div>
    </div>`;
  }).join('');

  return `
    <div class="ccpf-panel">
      <div class="ccpf-toolbar">
        <button type="button" class="btn btn-sm" onclick="ccpfBulkSet('${ds}','${s.id}','done')">Всем выполнено</button>
        <button type="button" class="btn btn-sm btn-ghost" onclick="ccpfBulkSet('${ds}','${s.id}','notdone')">Всем не выполнено</button>
        <button type="button" class="btn btn-sm btn-ghost" onclick="ccpfBulkClear('${ds}','${s.id}')">Сбросить</button>
      </div>
      <div class="ccpf-players">${html}</div>
      <div class="ccpf-footer">
        <button type="button" class="btn" onclick="ccpfSave('${ds}','${s.id}')">Сохранить факт</button>
      </div>
    </div>
  `;
}

/* Временное состояние редактирования (по ds + sessionId) */
const __factEditState = {};

function ccpfGetState(ds, sessionId) {
  return __factEditState[`${ds}|${sessionId}`] || null;
}

function ccpfSetFact(ds, sessionId, playerId, blockIndex, fact) {
  const st = ccpfGetState(ds, sessionId);
  if (!st) return;
  const pd = st.players.find(x => x.id === playerId);
  if (!pd) return;
  const bl = pd.blocks.find(b => b.blockIndex === blockIndex);
  if (!bl) return;

  // повторный клик по той же кнопке — снимаем
  bl.fact = (bl.fact === fact) ? '' : fact;
  if (bl.fact !== 'partial' && bl.fact !== 'notdone') bl.comment = '';

  // локальное обновление DOM
  const row = document.querySelector(`.ccpf-block[data-player-id="${playerId}"][data-block-index="${blockIndex}"]`);
  if (row) {
    row.querySelectorAll('.ccpf-btn').forEach(b => b.classList.remove('active','done','partial','notdone'));
    if (bl.fact) {
      const list = row.querySelectorAll('.ccpf-btn');
      const idx = bl.fact === 'done' ? 0 : bl.fact === 'partial' ? 1 : 2;
      list[idx].classList.add('active', bl.fact);
    }
    const commentWrap = row.querySelector('.ccpf-comment-wrap');
    if (commentWrap) commentWrap.style.display = (bl.fact === 'partial' || bl.fact === 'notdone') ? 'block' : 'none';
    const commentInput = row.querySelector('.ccpf-comment');
    if (commentInput && (bl.fact !== 'partial' && bl.fact !== 'notdone')) commentInput.value = '';
  }
}

function ccpfSetComment(ds, sessionId, playerId, blockIndex, value) {
  const st = ccpfGetState(ds, sessionId);
  if (!st) return;
  const pd = st.players.find(x => x.id === playerId);
  if (!pd) return;
  const bl = pd.blocks.find(b => b.blockIndex === blockIndex);
  if (!bl) return;
  bl.comment = value;
}

function ccpfBulkSet(ds, sessionId, fact) {
  const st = ccpfGetState(ds, sessionId);
  if (!st) return;

  st.players.forEach(pd => {
    pd.blocks.forEach(bl => {
      bl.fact = fact;
      if (fact !== 'partial' && fact !== 'notdone') bl.comment = '';
    });
  });

  // перерисуем панель
  const s = collectDaySessions(ds).find(x => x.id === sessionId);
  if (s) {
    // перерисовываем только панель — через полную перерисовку модалки
    renderDaySessionsModal(ds);
  }
}

function ccpfBulkClear(ds, sessionId) {
  const st = ccpfGetState(ds, sessionId);
  if (!st) return;
  st.players.forEach(pd => {
    pd.blocks.forEach(bl => { bl.fact = ''; bl.comment = ''; });
  });
  renderDaySessionsModal(ds);
}

function ccpfSave(ds, sessionId) {
  const st = ccpfGetState(ds, sessionId);
  if (!st) return;

  // Валидация
  for (const pd of st.players) {
    for (const bl of pd.blocks) {
      if ((bl.fact === 'partial' || bl.fact === 'notdone') && !(bl.comment || '').trim()) {
        alert(`${pd.fio}, ${bl.complex || 'Блок'}: для этого статуса обязателен комментарий`);
        return;
      }
    }
  }

  // Применяем в DB
  st.players.forEach(pd => {
    const p = DB.players.find(x => x.id === pd.id);
    if (!p || !p.calendar || !p.calendar[ds]) return;
    const sess = p.calendar[ds].find(x => x.id === sessionId);
    if (!sess || !Array.isArray(sess.blocks)) return;

    pd.blocks.forEach(bl => {
      const target = sess.blocks[bl.blockIndex];
      if (!target) return;
      target.fact = bl.fact || '';
      target.comment = (bl.comment || '').trim();
    });
  });

  saveDB();
  toast('Факт сохранён');

  // Перерисовываем модалку дня
  renderDaySessionsModal(ds);
  renderCoachCalendar();
  updateNotifBadge();
}

function openPlayerFromSession(pid) {
  closeModal();
  openPlayer(pid);
}

/* ============================================================
   РЕДАКТОР ТРЕНИРОВКИ (создание/редактирование + блок «Повторить»)
   ============================================================ */
let __sessionEditContext = null;

function openSessionEditor(ds, idx, ev) {
  if (ev) ev.stopPropagation();
  const sessions = collectDaySessions(ds);
  const s = sessions[idx];
  if (!s) return;

  __sessionEditContext = {
    ds,
    isEdit: true,
    originalId: s.id,
    originalGroupId: s.groupId,
    originalSeriesId: s.seriesId || null,
    originalBlocks: s.blocks.map(b => ({ ...b })),
    name: s.name || '',
    note: s.note || '',
    playerIds: s.players.map(p => p.id),
    blocks: s.blocks.length ? s.blocks.map(b => ({
      complex: b.complex || '',
      format: b.format || '',
      startTime: b.startTime || '18:00',
      duration: Number(b.duration) || 60,
      note: b.note || '',
      fact: b.fact || '',
      comment: b.comment || ''
    })) : [newEmptyBlock()],
    // блок «Повторить»
    repeatDays: new Set(),
    repeatTimes: {},          // dayIndex -> 'HH:MM'
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
    complex: '',
    format: '',
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

  const allBlocks = Array.from(new Set(DB.exercises.map(g => g.group)));

  syncFormToContext();

  const blocksHtml = ctx.blocks.map((b, i) => renderBlockEditor(b, i, allBlocks)).join('');
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

function renderBlockEditor(block, idx, allBlocks) {
  const complexOptions = ['<option value="">— не выбрано —</option>']
    .concat(allBlocks.map(v => `<option value="${escapeAttr(v)}" ${block.complex === v ? 'selected' : ''}>${escapeHtml(v)}</option>`))
    .join('');

  const formatOptions = ['<option value="">— не выбрано —</option>']
    .concat(WORK_TYPES.map(v => `<option value="${escapeAttr(v)}" ${block.format === v ? 'selected' : ''}>${escapeHtml(v)}</option>`))
    .join('');

  const startT = block.startTime || '18:00';
  const dur = Number(block.duration) || 60;
  const endT = minutesToTime(timeToMinutes(startT) + dur);

  return `<div class="cc-block-editor" data-block-index="${idx}">
    <div class="cc-block-head">
      <span class="cc-block-num">Блок #${idx + 1}</span>
      <button type="button" class="cc-block-del" title="Удалить блок" onclick="removeBlockFromForm(${idx})">🗑</button>
    </div>

    <div class="field">
      <label>Комплекс упражнений (из справочника)</label>
      <select class="blk-complex" data-block-index="${idx}" onchange="onBlockFieldChange(${idx},'complex',this.value)">${complexOptions}</select>
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
    const complex = el.querySelector('.blk-complex')?.value;
    const format  = el.querySelector('.blk-format')?.value;
    const start   = el.querySelector('.blk-start')?.value;
    const dur     = el.querySelector('.blk-dur')?.value;
    const note    = el.querySelector('.blk-note')?.value;
    if (complex !== undefined) b.complex = complex;
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
    complex: '', format: '', startTime, duration, note: '', fact: '', comment: ''
  });
  renderSessionForm();
}

function removeBlockFromForm(idx) {
  syncFormToContext();
  const ctx = __sessionEditContext;
  if (!ctx) return;

  if (ctx.blocks.length <= 1) {
    ctx.blocks[0] = {
      complex: '', format: '', startTime: '18:00', duration: 60, note: '', fact: '', comment: ''
    };
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

  // локально показываем/скрываем time input
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

  const result = []; // { dateStr, dow, time }
  // идём день за днём от start
  const end = new Date(start);
  end.setDate(end.getDate() + weeks * 7);

  const cur = new Date(start);
  while (cur < end) {
    const dow = (cur.getDay() + 6) % 7; // Пн=0
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

/* Применяем повторы: сразу добавляем в БД и в контекст формы */
function applyRepeatToForm() {
  syncFormToContext();
  const ctx = __sessionEditContext;
  if (!ctx) return;

  const dates = computeRepeatDates();
  if (!dates.length) { alert('Выберите хотя бы один день недели'); return; }

  // Проверим, что основная форма валидна
  const validBlocks = collectValidBlocksFromCtx(ctx);
  if (!validBlocks) return;
  if (!ctx.playerIds.length) { alert('Выберите хотя бы одного игрока'); return; }

  // seriesId — общий для всей серии
  const seriesId = ctx.originalSeriesId || uid('ser');

  // Сохраняем основную тренировку (если ещё не сохраняли)
  if (!ctx.isEdit) {
    // создаём основную как часть серии
    createSessionForDate(ctx.ds, ctx.name, ctx.note, validBlocks, ctx.playerIds, ctx.originalGroupId, seriesId);
    ctx.isEdit = true;
    ctx.originalId = ctx.originalId || null; // будет проставлено ниже через fact? — оставим null, но сохраним без обновления
  }

  // Создаём копии на каждую дату
  dates.forEach(d => {
    // клонируем блоки с новой стартовой датой (время берём по дню недели)
    const blocksCopy = validBlocks.map(b => {
      // для первого блока (или всех) — если указано своё время по дню — поменяем startTime
      return { ...b, id: uid('blk'), startTime: b.startTime };
    });
    // Подмена времени: если пользователь указал время для этого дня недели —
    // сдвигаем первый блок на это время, остальные — с сохранением относительного сдвига
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
    if (!b.startTime) { alert(`Блок #${i + 1}: укажите время начала`); return null; }
    if (!b.duration || Number(b.duration) <= 0) { alert(`Блок #${i + 1}: укажите продолжительность`); return null; }

    validBlocks.push({
      id: b.id || uid('blk'),
      complex: (b.complex || '').trim(),
      format: b.format || '',
      startTime: b.startTime,
      duration: Number(b.duration),
      note: (b.note || '').trim(),
      fact: b.fact || '',
      comment: b.comment || ''
    });
  }
  if (!validBlocks.length) { alert('Добавьте хотя бы один блок'); return null; }
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
      blocks: blocks.map(b => ({ ...b }))
    });
  });
  return sessId;
}

/* ===== Сохранение тренировки (без повторов) ===== */
function saveSessionFromForm() {
  syncFormToContext();
  const ctx = __sessionEditContext;
  if (!ctx) return;

  const ds = ctx.ds;
  if (!ds) { alert('Укажите дату'); return; }

  const validBlocks = collectValidBlocksFromCtx(ctx);
  if (!validBlocks) return;
  if (!ctx.playerIds.length) { alert('Выберите хотя бы одного игрока'); return; }

  const seriesId = ctx.originalSeriesId || null;
  const newSession = {
    id: ctx.originalId || uid('sess'),
    name: (ctx.name || '').trim(),
    note: (ctx.note || '').trim(),
    groupId: ctx.originalGroupId || (ctx.playerIds.length > 1 ? uid('grp') : null),
    seriesId: seriesId,
    blocks: validBlocks
  };

  if (ctx.isEdit) {
    DB.players.forEach(p => {
      if (!p.calendar) return;
      Object.keys(p.calendar).forEach(date => {
        const day = p.calendar[date];
        if (!Array.isArray(day)) return;
        p.calendar[date] = day.filter(s => !sessionMatchesOriginal(s, ctx.originalId, ctx.originalGroupId, ctx.originalBlocks));
        if (!p.calendar[date].length) delete p.calendar[date];
      });
    });
  }

  ctx.playerIds.forEach(pid => {
    const p = DB.players.find(x => x.id === pid);
    if (!p) return;
    if (!p.calendar) p.calendar = {};
    if (!p.calendar[ds]) p.calendar[ds] = [];
    p.calendar[ds] = p.calendar[ds].filter(s => s.id !== newSession.id);
    p.calendar[ds].push({
      id: newSession.id,
      name: newSession.name,
      note: newSession.note,
      groupId: newSession.groupId,
      seriesId: newSession.seriesId,
      blocks: newSession.blocks.map(b => ({ ...b }))
    });
  });

  saveDB();
  closeModal();
  __sessionEditContext = null;
  renderCoachCalendar();
  updateNotifBadge();
  toast(ctx.isEdit ? 'Тренировка обновлена' : `Тренировка назначена: ${ctx.playerIds.length} ${plural(ctx.playerIds.length, 'игрок', 'игрока', 'игроков')}`);
}

function sessionMatchesOriginal(s, originalId, originalGroupId, originalBlocks) {
  if (!s) return false;
  if (originalId && s.id && s.id === originalId) return true;
  if (originalGroupId && s.groupId && s.groupId === originalGroupId) return true;
  if (originalBlocks && Array.isArray(s.blocks) && s.blocks.length && originalBlocks.length) {
    const a = s.blocks[0], b = originalBlocks[0];
    return (a.startTime || '') === (b.startTime || '')
        && (a.complex || '')   === (b.complex || '')
        && (a.format || '')    === (b.format || '');
  }
  return false;
}

/* ============================================================
   УДАЛЕНИЕ ТРЕНИРОВКИ (один день / вся серия)
   ============================================================ */
function deleteSessionFromDay(ds, idx, ev) {
  if (ev) ev.stopPropagation();
  const sessions = collectDaySessions(ds);
  const s = sessions[idx];
  if (!s) return;

  // Если это часть серии — спросим, что удалять
  if (s.seriesId) {
    openModal(`
      <h3>Удалить тренировку</h3>
      <p class="subtitle">Эта тренировка — часть серии. Что удалить?</p>
      <div class="btn-row" style="margin-top:16px">
        <button class="btn btn-red" onclick="deleteSessionOnlyThisDay('${ds}', '${s.seriesId}', ${idx})">Только этот день</button>
        <button class="btn btn-red" onclick="deleteSessionWholeSeries('${s.seriesId}')">Всю серию</button>
        <button class="btn-ghost btn" onclick="renderDaySessionsModal('${ds}')">Отмена</button>
      </div>
    `);
    return;
  }

  if (!confirm('Удалить тренировку у всех игроков?')) return;
  deleteSessionsByPredicate(session => sessionMatchesOriginal(session, s.id, s.groupId, s.blocks));
  saveDB();
  renderDaySessionsModal(ds);
  renderCoachCalendar();
  updateNotifBadge();
}

function deleteSessionOnlyThisDay(ds, seriesId, idx) {
  const sessions = collectDaySessions(ds);
  const s = sessions[idx];
  if (!s) return;

  deleteSessionsByPredicate(session => sessionMatchesOriginal(session, s.id, s.groupId, s.blocks));
  saveDB();
  renderDaySessionsModal(ds);
  renderCoachCalendar();
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

/* Удаление по предикату — во всех календарях всех игроков */
function deleteSessionsByPredicate(predicate) {
  DB.players.forEach(p => {
    if (!p.calendar) return;
    Object.keys(p.calendar).forEach(ds => {
      const day = p.calendar[ds];
      if (!Array.isArray(day)) return;
      p.calendar[ds] = day.filter(s => !predicate(s));
      if (!p.calendar[ds].length) delete p.calendar[ds];
    });
  });
}

/* ============================================================
   ГРУППИРОВАННЫЙ СПИСОК ИГРОКОВ (для редактора)
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