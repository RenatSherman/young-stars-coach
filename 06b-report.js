/* ============================================================
   06b-report.js
   Отчёт по итогам месяца.

   Правки:
   - По умолчанию выбирается ТЕКУЩИЙ календарный месяц, если он
     есть в списке. Иначе — ближайший прошлый.
   - Уникальная сигнатура блока — date|sessIdx|blockIdx, чтобы
     НЕ терять блоки с одинаковым sess.id.
   - Колонка «Время» в таблице отчёта.
   - Пустой формат отображается как «— не выбрано —».
   ============================================================ */

function collectAllPlanMonths() {
  const set = new Set();
  const today = new Date();
  const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

  DB.players.forEach(p => {
    if (!p.calendar) return;
    Object.keys(p.calendar).forEach(date => {
      const day = p.calendar[date];
      if (Array.isArray(day) && day.length) set.add(date.slice(0, 7));
    });
  });

  set.add(currentMonth);
  return Array.from(set).sort();
}

function monthLabelFromKey(ym) {
  const [y, m] = ym.split('-').map(Number);
  return `${MONTH_NAMES_RU[m - 1]} ${y}`;
}

function getCurrentMonthKey() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
}

/* Текущий календарный месяц в приоритете, иначе — ближайший прошлый */
function pickDefaultReportMonth(months) {
  if (!months || !months.length) return getCurrentMonthKey();
  const current = getCurrentMonthKey();
  if (months.includes(current)) return current;
  const past = months.filter(m => m <= current);
  if (past.length) return past[past.length - 1];
  return months[0];
}

function computePlayerMonthStats(p, month) {
  if (!p || !p.calendar) {
    return { total: 0, done: 0, partial: 0, notdone: 0, volume: 0, items: [], completion: 0 };
  }
  let total = 0, done = 0, partial = 0, notdone = 0, volume = 0;
  const items = [];

  Object.keys(p.calendar).forEach(date => {
    if (date.slice(0, 7) !== month) return;
    const day = p.calendar[date];
    if (!Array.isArray(day)) return;

    day.forEach((sess, sessIdx) => {
      (sess.blocks || []).forEach((b, bi) => {
        total++;
        volume += Number(b.duration) || 0;
        if (b.fact === 'done') done++;
        else if (b.fact === 'partial') partial++;
        else if (b.fact === 'notdone') notdone++;

        items.push({
          sig: date + '|' + sessIdx + '|' + bi,
          date,
          sessIdx,
          blockIndex: bi,
          sessId: sess.id || ('no_id_' + sessIdx),
          sessionName: sess.name || '',
          complex: b.complex || '',
          format: b.format || '',
          startTime: b.startTime || '',
          duration: Number(b.duration) || 0,
          fact: b.fact || '',
          comment: b.comment || ''
        });
      });
    });
  });

  // Сортировка: по дате → по времени начала блока
  items.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return (a.startTime || '99:99').localeCompare(b.startTime || '99:99');
  });

  const completion = total ? Math.round((done + partial * 0.5) / total * 100) : 0;
  return { total, done, partial, notdone, volume, items, completion };
}

function computeAllPlayersMonthStats(month) {
  let total = 0, done = 0, partial = 0, notdone = 0;
  DB.players.forEach(p => {
    const st = computePlayerMonthStats(p, month);
    total += st.total;
    done += st.done;
    partial += st.partial;
    notdone += st.notdone;
  });
  const overall = total ? Math.round((done + partial * 0.5) / total * 100) : 0;
  return { total, done, partial, notdone, overall };
}

function renderReport() {
  const monthSel = document.getElementById('report-month');
  const playerSel = document.getElementById('report-player-filter');
  const content = document.getElementById('report-content');
  if (!content) return;

  const months = collectAllPlanMonths();

  if (monthSel) {
    const prev = monthSel.value || reportMonth;
    monthSel.innerHTML = months.map(m => `<option value="${m}">${monthLabelFromKey(m)}</option>`).join('');

    if (prev && months.includes(prev)) {
      reportMonth = prev;
    } else {
      reportMonth = pickDefaultReportMonth(months);
    }
    monthSel.value = reportMonth;
  } else {
    if (!reportMonth) reportMonth = pickDefaultReportMonth(months);
  }

  if (playerSel) {
    const prevPlayer = playerSel.value;
    playerSel.innerHTML = '<option value="">Все игроки</option>' +
      DB.players.map(p => `<option value="${p.id}">${escapeHtml(p.fio)}</option>`).join('');
    if (prevPlayer && DB.players.some(p => p.id === prevPlayer)) playerSel.value = prevPlayer;
  }

  const month = reportMonth;
  const filterPid = playerSel ? playerSel.value : '';
  const allStats = computeAllPlayersMonthStats(month);

  let html = `
    <div class="card">
      <h2>Сводка по месяцу «${escapeHtml(monthLabelFromKey(month))}»</h2>
      <div class="dash-grid">
        <div class="kpi"><div class="lbl">Всего блоков</div><div class="val">${allStats.total}</div></div>
        <div class="kpi"><div class="lbl">Выполнено</div><div class="val" style="color:#1e7a3f">${allStats.done}</div></div>
        <div class="kpi"><div class="lbl">Частично</div><div class="val" style="color:#b8860b">${allStats.partial}</div></div>
        <div class="kpi red"><div class="lbl">Не выполнено</div><div class="val">${allStats.notdone}</div></div>
        <div class="kpi red"><div class="lbl">Общий % выполнения</div><div class="val">${allStats.overall}%</div></div>
      </div>
    </div>`;

  const players = filterPid ? DB.players.filter(p => p.id === filterPid) : DB.players;
  let renderedPlayers = 0;

  players.forEach(p => {
    const st = computePlayerMonthStats(p, month);
    if (!st || !st.total) return;
    renderedPlayers++;

    const rows = st.items.map(it => {
      const factCls = it.fact === 'done' ? 'fact-done'
                   : it.fact === 'partial' ? 'fact-partial'
                   : it.fact === 'notdone' ? 'fact-notdone'
                   : '';
      const formatDisplay = it.format ? escapeHtml(it.format) : '— не выбрано —';
      return `<tr class="${factCls}" data-sig="${escapeAttr(it.sig)}">
        <td>${formatDate(it.date)}</td>
        <td>${escapeHtml(it.startTime || '')}</td>
        <td>${escapeHtml(it.complex || '')}</td>
        <td>${formatDisplay}</td>
        <td>${it.duration}</td>
        <td>${factLabel(it.fact)}</td>
        <td>${escapeHtml(it.comment || '')}</td>
      </tr>`;
    }).join('');

    html += `
      <div class="report-player">
        <h3>${escapeHtml(p.fio)}</h3>
        <div class="meta">${escapeHtml(p.team || '')} · ${escapeHtml(p.position || '')}</div>
        <div class="report-summary">
          <span class="badge done">Выполнено: ${st.done}</span>
          <span class="badge partial">Частично: ${st.partial}</span>
          <span class="badge notdone">Не выполнено: ${st.notdone}</span>
          <span class="badge">Всего: ${st.total}</span>
          <span class="badge">Объём: ${st.volume} мин</span>
        </div>
        <div class="report-progress"><span style="width:${st.completion}%"></span></div>
        <div style="font-size:12px;font-weight:700;color:var(--ak-green);margin-bottom:10px">Выполнение: ${st.completion}%</div>
        <table class="report-table">
          <thead><tr>
            <th>Дата</th>
            <th>Время</th>
            <th>Комплекс</th>
            <th>Формат</th>
            <th>Мин</th>
            <th>Факт</th>
            <th>Примечание</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  });

  if (renderedPlayers === 0) {
    html += `
      <div class="card">
        <div class="empty-state">
          <div class="big">📄</div>
          <p>За «${escapeHtml(monthLabelFromKey(month))}» данных нет.<br>
          Назначьте тренировки в «Календаре тренера» и отметьте факт — отчёт появится автоматически.</p>
        </div>
      </div>`;
  }

  content.innerHTML = html;
}

async function exportReportToPDF() {
  const content = document.getElementById('report-content');
  if (!content || !content.innerHTML.trim()) {
    alert('Нет данных для экспорта');
    return;
  }
  await exportElementToPDF(content, `Отчёт_${reportMonth || 'месяц'}.pdf`, {
    orientation: 'p',
    hideSelectors: ['.no-print']
  });
}