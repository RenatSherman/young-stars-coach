/* ============================================================
   05b-player-calendar.js
   Календарь игрока.
   Все отметки фактов вызывают touchMeta('players').

   ВАЖНО: в режиме игрока (isPlayerMode=true) менять можно
   ТОЛЬКО блоки формата «Самостоятельная». Остальные — просмотр.
   Гварды добавлены в:
     - onPlayerDayFactChange
     - onPlayerDayFactComment
     - savePlayerDayFact
   ============================================================ */

let playerCalMonth = null;

function collectPlayerPlanMonthsLocal(p) {
  const set = new Set();
  if (!p || !p.calendar) return [];
  Object.keys(p.calendar).forEach(date => {
    const day = p.calendar[date];
    if (!Array.isArray(day) || !day.length) return;
    set.add(date.slice(0, 7));
  });
  return Array.from(set).sort();
}

function monthLabelFromKeyLocal(ym) {
  const [y, m] = ym.split('-').map(Number);
  return `${MONTH_NAMES_RU[m - 1]} ${y}`;
}

function renderPlayerCalendarTab(p) {
  return `<div class="card">
    <h2>Календарь тренировок игрока</h2>
    <p class="subtitle" style="margin-top:-8px">Тренировки назначаются в «Календаре тренера». Здесь отображаются автоматически. ${!isPlayerMode ? 'Можно отметить факт прямо здесь.' : 'Вы можете отмечать только самостоятельные тренировки.'}</p>
    <div id="player-calendar-content"></div>
  </div>`;
}

function renderPlayerCalendarContent(p) {
  const el = document.getElementById('player-calendar-content');
  if (!el) return;

  const today = new Date();
  const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const months = collectPlayerPlanMonthsLocal(p);

  if (!playerCalMonth || !/^\d{4}-\d{2}$/.test(playerCalMonth)) {
    playerCalMonth = currentMonth;
  }

  const [year, month] = playerCalMonth.split('-').map(Number);
  if (!year || !month || month < 1 || month > 12) {
    playerCalMonth = currentMonth;
    const [y2, m2] = playerCalMonth.split('-').map(Number);
    renderPlayerCalendarContentInner(el, p, months, currentMonth, y2, m2);
    return;
  }

  renderPlayerCalendarContentInner(el, p, months, currentMonth, year, month);
}

function renderPlayerCalendarContentInner(el, p, months, currentMonth, year, month) {
  let selectMonths = months.slice();
  if (!selectMonths.includes(currentMonth)) selectMonths.push(currentMonth);
  if (!selectMonths.includes(playerCalMonth)) selectMonths.push(playerCalMonth);
  selectMonths = Array.from(new Set(selectMonths)).sort();

  const hasAny = months.length > 0;

  el.innerHTML = `
    <div class="player-cal-toolbar">
      <div class="cc-nav">
        <button class="cc-nav-btn" onclick="playerCalShiftMonth('${p.id}', -1)">‹</button>
        <div class="cc-month-title">${MONTH_NAMES_RU[month - 1]} ${year}</div>
        <button class="cc-nav-btn" onclick="playerCalShiftMonth('${p.id}', 1)">›</button>
      </div>
      <button class="btn btn-sm" onclick="playerCalGoToday('${p.id}')">Текущий месяц</button>
      <select class="player-cal-month-select" onchange="onPlayerCalMonthChange('${p.id}', this.value)">
        ${selectMonths.map(m => `<option value="${m}" ${m === playerCalMonth ? 'selected' : ''}>${monthLabelFromKeyLocal(m)}</option>`).join('')}
      </select>
      <div class="cc-legend">
        <span><span class="cc-dot cc-dot-self"></span> Самостоятельная</span>
        <span><span class="cc-dot cc-dot-ind"></span> Индивидуальная</span>
        <span><span class="cc-dot cc-dot-grp"></span> В группе</span>
      </div>
    </div>
    <div class="cc-month-card">
      <div class="cc-month-wrap">
        <div class="cc-month-head">
          ${DOW_SHORT_RU.map((d, i) => `<div class="cc-dow-head ${i >= 5 ? 'weekend' : ''}">${d}</div>`).join('')}
        </div>
        <div class="cc-month-grid" id="player-month-grid"></div>
      </div>
    </div>
    ${hasAny ? '' : `<p class="subtitle" style="margin-top:12px;text-align:center">У игрока пока нет тренировок. Назначьте их в «Календаре тренера» — они появятся здесь автоматически.</p>`}
  `;

  renderPlayerMonthGrid(p, year, month);
}

function playerCalShiftMonth(pid, delta) {
  const [y, m] = playerCalMonth.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  playerCalMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const p = DB.players.find(x => x.id === pid);
  if (p) renderPlayerCalendarContent(p);
}

function playerCalGoToday(pid) {
  const today = new Date();
  playerCalMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const p = DB.players.find(x => x.id === pid);
  if (p) renderPlayerCalendarContent(p);
}

function onPlayerCalMonthChange(pid, month) {
  playerCalMonth = month;
  const p = DB.players.find(x => x.id === pid);
  if (p) renderPlayerCalendarContent(p);
}

function collectPlayerDaySessions(p, ds) {
  if (!p || !p.calendar || !p.calendar[ds]) return [];
  const day = p.calendar[ds];
  if (!Array.isArray(day)) return [];

  return day.map(sess => {
    const blocks = Array.isArray(sess.blocks) ? sess.blocks.slice() : [];
    blocks.sort((a, b) => (a.startTime || '99:99').localeCompare(b.startTime || '99:99'));
    const total = blocks.reduce((acc, b) => acc + (Number(b.duration) || 0), 0);
    return {
      id: sess.id,
      groupId: sess.groupId || null,
      name: sess.name || '',
      note: sess.note || '',
      blocks,
      firstTime: blocks[0] ? (blocks[0].startTime || '') : '',
      totalMinutes: total
    };
  }).sort((a, b) => (a.firstTime || '').localeCompare(b.firstTime || ''));
}

function collectPlayerDayBlocks(p, ds) {
  if (!p || !p.calendar || !p.calendar[ds]) return [];
  const day = p.calendar[ds];
  if (!Array.isArray(day)) return [];

  const blocks = [];
  day.forEach(sess => {
    const sessBlocks = Array.isArray(sess.blocks) ? sess.blocks : [];
    sessBlocks.forEach((b, bi) => {
      blocks.push({
        sessionRef: sess,
        blockRef: b,
        blockIndexInSession: bi,
        sessionId: sess.id,
        sessionName: sess.name || '',
        complex: b.complex || '',
        complexItems: Array.isArray(b.complexItems) ? b.complexItems.slice() : [],
        format: b.format || '',
        startTime: b.startTime || '',
        duration: Number(b.duration) || 0,
        note: b.note || '',
        fact: b.fact || '',
        comment: b.comment || ''
      });
    });
  });

  blocks.sort((a, b) => (a.startTime || '99:99').localeCompare(b.startTime || '99:99'));
  return blocks;
}

function playerSessionColor(sess) {
  for (const b of sess.blocks || []) {
    const f = b.format || '';
    if (f === 'В группе') return WORK_TYPE_COLORS['В группе'];
    if (f === 'Индивидуальная с тренером') return WORK_TYPE_COLORS['Индивидуальная с тренером'];
    if (f === 'Самостоятельная') return WORK_TYPE_COLORS['Самостоятельная'];
  }
  return '#5a6169';
}

function renderPlayerMonthGrid(p, year, month) {
  const grid = document.getElementById('player-month-grid');
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
    if (lastWeek.every(d => d.getMonth() !== (month - 1))) days.length -= 7;
    else break;
  }

  let html = '';
  days.forEach(d => {
    const ds = localDateStr(d);
    const isOther = d.getMonth() !== (month - 1);
    const isWeekend = (d.getDay() === 0 || d.getDay() === 6);
    const isToday = ds === today;

    const sessions = collectPlayerDaySessions(p, ds);
    const total = sessions.length;
    const visible = sessions.slice(0, 3);

    html += `<div class="cc-day ${isOther ? 'other-month' : ''} ${isWeekend ? 'weekend' : ''} ${isToday ? 'today' : ''}"
                  onclick="openPlayerDaySessions('${p.id}','${ds}')">
      <div class="cc-day-head">
        <span class="cc-day-num ${isToday ? 'today-badge' : ''}">${d.getDate()}</span>
        ${total ? `<span class="cc-day-total">${total}</span>` : ''}
      </div>
      <div class="cc-day-bars">
        ${visible.map(sess => {
          const color = playerSessionColor(sess);
          const label = sess.name || (sess.blocks[0] && sess.blocks[0].complex) || 'Тренировка';
          const t = sess.firstTime;
          return `<div class="cc-day-bar" style="background:${color}">
            ${t ? `<span class="cc-bar-time">${escapeHtml(t)}</span>` : ''}
            <span class="cc-bar-label">${escapeHtml(label)}</span>
          </div>`;
        }).join('')}
        ${total > 3 ? `<div class="cc-more">+${total - 3} ещё</div>` : ''}
      </div>
    </div>`;
  });

  grid.innerHTML = html;
}

let __playerDayFactCtx = null;

// Проверка: можно ли игроку редактировать блок
function __canPlayerEditBlock(blockRef) {
  if (!isPlayerMode) return true;
  const fmt = ((blockRef && blockRef.format) || '').trim();
  return fmt === 'Самостоятельная';
}

function openPlayerDaySessions(pid, ds) {
  const p = DB.players.find(x => x.id === pid);
  if (!p) return;

  const blocks = collectPlayerDayBlocks(p, ds);
  const title = formatDateFull(ds);

  if (!blocks.length) {
    openModal(`<h3>${escapeHtml(title)}</h3>
      <p class="subtitle" style="text-align:center;padding:20px 0">На этот день блоков нет.</p>
      <div class="btn-row" style="margin-top:16px">
        <button class="btn" onclick="closeModal()">Закрыть</button>
      </div>`);
    return;
  }

  let hasEditableBlocks = false;

  const rowsHtml = blocks.map((b, i) => {
    const end = minutesToTime(timeToMinutes(b.startTime) + (Number(b.duration) || 0));
    const factOptions = FACT_OPTIONS.map(f => {
      const sel = (f.value === (b.fact || '')) ? 'selected' : '';
      return `<option value="${f.value}" ${sel}>${f.label}</option>`;
    }).join('');
    const needComment = (b.fact === 'partial' || b.fact === 'notdone');
    const factCls = factClass(b.fact);

    const exHtml = renderBlockExercisesLineForPlayer(b);

    const canEdit = __canPlayerEditBlock(b.blockRef);
    if (canEdit) hasEditableBlocks = true;

    const disabledAttr = !canEdit ? 'disabled' : '';
    const lockStyle = !canEdit ? 'opacity:0.6; pointer-events:none;' : '';

    return `<div class="pde-block" data-block-index="${i}" style="${lockStyle}">
      <div class="pde-block-head">
        <span class="pde-block-time">${escapeHtml(b.startTime)}–${end} · ${b.duration} мин</span>
        ${b.sessionName ? `<span class="pde-block-session">${escapeHtml(b.sessionName)}</span>` : ''}
      </div>
      <div class="pde-block-name">${escapeHtml(b.complex || '—')} · ${escapeHtml(b.format || '—')}</div>
      ${exHtml}

      ${canEdit ? `
      <div class="pde-block-fact-label">Оценка (на весь блок):</div>
      <div class="pde-block-fields">
        <select class="pde-fact ${factCls}" onchange="onPlayerDayFactChange(${i}, this.value)">
          ${factOptions}
        </select>
        <input class="pde-comment" type="text" placeholder="${needComment ? 'Комментарий (обязательно)' : 'Комментарий'}"
               value="${escapeAttr(b.comment || '')}"
               oninput="onPlayerDayFactComment(${i}, this.value)"
               style="display:${needComment ? 'block' : 'none'}">
      </div>
      ` : `<div class="pde-block-fact-label" style="color:#999">Заполняется тренером</div>`}
    </div>`;
  }).join('');

  __playerDayFactCtx = {
    pid,
    ds,
    blocks: blocks.map(b => ({
      sessionRef: b.sessionRef,
      blockRef: b.blockRef,
      fact: b.fact || '',
      comment: b.comment || ''
    }))
  };

  openModal(`<h3>${escapeHtml(title)}</h3>
    <p class="subtitle" style="margin-top:-8px">
      ${isPlayerMode ? 'Вы можете отмечать только самостоятельные тренировки. Оценка ставится на весь блок.' : 'Можно отметить факт прямо здесь. Оценка ставится на весь блок.'}
    </p>
    <div class="pde-list">${rowsHtml}</div>
    <div class="btn-row" style="margin-top:16px">
      ${hasEditableBlocks ? `<button class="btn" onclick="savePlayerDayFact()">Сохранить факт</button>` : ''}
      <button class="btn" onclick="closeModal()">Закрыть</button>
    </div>`);
}

function renderBlockExercisesLineForPlayer(b) {
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

function onPlayerDayFactChange(i, value) {
  if (!__playerDayFactCtx || !__playerDayFactCtx.blocks[i]) return;
  const b = __playerDayFactCtx.blocks[i];

  // ГВАРД: в режиме игрока только «Самостоятельные»
  if (!__canPlayerEditBlock(b.blockRef)) return;

  b.fact = value;
  if (value !== 'partial' && value !== 'notdone') b.comment = '';

  const wrap = document.querySelector(`.pde-block[data-block-index="${i}"]`);
  if (!wrap) return;

  const inp = wrap.querySelector('.pde-comment');
  if (inp) {
    const need = (value === 'partial' || value === 'notdone');
    inp.style.display = need ? 'block' : 'none';
    inp.placeholder = need ? 'Комментарий (обязательно)' : 'Комментарий';
    if (!need) inp.value = '';
  }

  const sel = wrap.querySelector('.pde-fact');
  if (sel) {
    sel.classList.remove('done', 'partial', 'notdone');
    if (value === 'done') sel.classList.add('done');
    else if (value === 'partial') sel.classList.add('partial');
    else if (value === 'notdone') sel.classList.add('notdone');
  }
}

function onPlayerDayFactComment(i, value) {
  if (!__playerDayFactCtx || !__playerDayFactCtx.blocks[i]) return;
  const b = __playerDayFactCtx.blocks[i];

  // ГВАРД: в режиме игрока только «Самостоятельные»
  if (!__canPlayerEditBlock(b.blockRef)) return;

  b.comment = value;
}

function savePlayerDayFact() {
  const ctx = __playerDayFactCtx;
  if (!ctx) return;

  // Валидация комментариев — только для блоков, которые реально можно сохранить
  for (let i = 0; i < ctx.blocks.length; i++) {
    const b = ctx.blocks[i];
    if (!__canPlayerEditBlock(b.blockRef)) continue;
    if ((b.fact === 'partial' || b.fact === 'notdone') && !(b.comment || '').trim()) {
      uiAlert(`Блок #${i + 1}: для «${factLabel(b.fact)}» обязателен комментарий`);
      return;
    }
  }

  let saved = 0;
  let skipped = 0;
  ctx.blocks.forEach(b => {
    if (!b.blockRef || typeof b.blockRef !== 'object') return;

    // ГВАРД: в режиме игрока нельзя писать в не-«Самостоятельные» блоки
    if (!__canPlayerEditBlock(b.blockRef)) { skipped++; return; }

    b.blockRef.fact = b.fact || '';
    b.blockRef.comment = (b.comment || '').trim();
    saved++;
  });

  touchMeta('players');
  saveDB();
  updateNotifBadge();

  const pid = ctx.pid;
  __playerDayFactCtx = null;
  closeModal();

  const p = DB.players.find(x => x.id === pid);
  if (p) renderPlayerCalendarContent(p);

  if (isPlayerMode && skipped > 0 && saved > 0) {
    toast(`Сохранено самостоятельных блоков: ${saved}. Остальные — только просмотр.`);
  } else if (isPlayerMode && saved === 0 && skipped > 0) {
    toast('Нет самостоятельных тренировок для сохранения');
  } else {
    toast(`Сохранено блоков: ${saved}`);
  }
}