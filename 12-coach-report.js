/* ============================================================
   12-coach-report.js
   Отчёт тренера: KPI, Матрица выполнения, Графики.
   ============================================================ */

let coachReportMonth = null;

function collectReportMonths() {
  const set = new Set();
  const today = new Date();
  const base = new Date(today.getFullYear(), today.getMonth(), 1);
  for (let i = -2; i <= 1; i++) {
    const d = new Date(base.getFullYear(), base.getMonth() + i, 1);
    set.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  DB.players.forEach(p => {
    if (!p.calendar) return;
    Object.keys(p.calendar).forEach(date => {
      const day = p.calendar[date];
      if (Array.isArray(day) && day.length) set.add(date.slice(0, 7));
    });
  });
  return Array.from(set).sort();
}

function getMonthLabel(ym) {
  const [y, m] = ym.split('-').map(Number);
  return `${MONTH_NAMES_RU[m - 1]} ${y}`;
}

function computeCoachReportStats(month) {
  const [year, monthNum] = month.split('-').map(Number);
  const daysInMonth = new Date(year, monthNum, 0).getDate();

  const uniqueBlocks = new Map();
  const byDate = {};
  const byHour = {};
  const byDow = [0,0,0,0,0,0,0];
  const byFormat = { 'Самостоятельная': 0, 'Индивидуальная с тренером': 0, 'В группе': 0, 'Командная': 0, '—': 0 };
  const byFact = { 'done': 0, 'partial': 0, 'notdone': 0, '': 0 };
  const byPlayer = {};
  const playerMatrix = {};

  DB.players.forEach(p => {
    if (!p.calendar) return;
    if (!byPlayer[p.id]) byPlayer[p.id] = { fio: p.fio, total: 0, done: 0, partial: 0, notdone: 0, minutes: 0 };
    if (!playerMatrix[p.id]) playerMatrix[p.id] = {};

    Object.keys(p.calendar).forEach(date => {
      if (date.slice(0, 7) !== month) return;
      const day = p.calendar[date];
      if (!Array.isArray(day)) return;

      day.forEach(sess => {
        let hasGame = false;
        
        (sess.blocks || []).forEach((b, bi) => {
          const blockKey = (sess.id || ('solo_' + p.id + '_' + date)) + '|' + bi + '|' + (b.startTime || '') + '|' + (b.complex || '');
          const dur = Number(b.duration) || 0;

          if (b.format === 'Командная' && b.complex === 'Игра') hasGame = true;

          byPlayer[p.id].total++;
          byPlayer[p.id].minutes += dur;
          if (b.fact === 'done') byPlayer[p.id].done++;
          else if (b.fact === 'partial') byPlayer[p.id].partial++;
          else if (b.fact === 'notdone') byPlayer[p.id].notdone++;

          if (!uniqueBlocks.has(blockKey)) {
            uniqueBlocks.set(blockKey, { date, block: b });
            byDate[date] = (byDate[date] || 0) + 1;
            const hh = (b.startTime || '00').slice(0, 2);
            byHour[hh] = (byHour[hh] || 0) + 1;
            const dow = (new Date(date + 'T00:00:00').getDay() + 6) % 7;
            byDow[dow]++;

            const f = b.format || '—';
            if (byFormat[f] === undefined) byFormat[f] = 0;
            byFormat[f]++;

            const factKey = b.fact || '';
            byFact[factKey] = (byFact[factKey] || 0) + 1;
          }
        });

        if (!playerMatrix[p.id][date]) {
          playerMatrix[p.id][date] = { done: 0, partial: 0, notdone: 0, unmarked: 0, hasGame };
        }
        (sess.blocks || []).forEach(b => {
          if (b.fact === 'done') playerMatrix[p.id][date].done++;
          else if (b.fact === 'partial') playerMatrix[p.id][date].partial++;
          else if (b.fact === 'notdone') playerMatrix[p.id][date].notdone++;
          else playerMatrix[p.id][date].unmarked++;
        });
      });
    });
  });

  const totalBlocks = uniqueBlocks.size;
  const overall = (() => {
    const done = byFact['done'] || 0;
    const partial = byFact['partial'] || 0;
    const all = totalBlocks || 1;
    return Math.round((done + partial * 0.5) / all * 100);
  })();

  return { totalBlocks, byDate, byHour, byDow, byFormat, byFact, byPlayer, playerMatrix, overall, daysInMonth, year, monthNum };
}

function renderCoachReport() {
  const el = document.getElementById('coach-report-content');
  if (!el) return;

  const months = collectReportMonths();
  const today = new Date();
  const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

  if (!coachReportMonth || !months.includes(coachReportMonth)) {
    coachReportMonth = months.includes(currentMonth) ? currentMonth : months[months.length - 1];
  }

  el.innerHTML = `
    <div class="cr-toolbar no-print">
      <label>Месяц:</label>
      <select id="cr-month" onchange="onCoachReportMonthChange(this.value)">
        ${months.map(m => `<option value="${m}" ${m === coachReportMonth ? 'selected' : ''}>${getMonthLabel(m)}</option>`).join('')}
      </select>
      <button class="btn" onclick="exportCoachReportToPDF()">📄 Экспорт в PDF</button>
    </div>
    <div id="cr-body"></div>
  `;
  renderCoachReportBody();
}

function onCoachReportMonthChange(m) { coachReportMonth = m; renderCoachReportBody(); }

function renderCoachReportBody() {
  const body = document.getElementById('cr-body');
  if (!body) return;

  const stats = computeCoachReportStats(coachReportMonth);
  const monthLabel = getMonthLabel(coachReportMonth);

  const kpiHtml = `
    <div class="dash-grid">
      <div class="kpi"><div class="lbl">Всего блоков</div><div class="val">${stats.totalBlocks}</div><div class="sub">за ${monthLabel.toLowerCase()}</div></div>
      <div class="kpi"><div class="lbl">% выполнения</div><div class="val">${stats.overall}%</div><div class="sub">по всем блокам</div></div>
      <div class="kpi"><div class="lbl">Выполнено</div><div class="val" style="color:#1e7a3f">${stats.byFact['done'] || 0}</div><div class="sub">блоков</div></div>
      <div class="kpi"><div class="lbl">Частично</div><div class="val" style="color:#b8860b">${stats.byFact['partial'] || 0}</div><div class="sub">блоков</div></div>
      <div class="kpi"><div class="lbl">Не выполнено</div><div class="val" style="color:var(--ak-red)">${stats.byFact['notdone'] || 0}</div><div class="sub">блоков</div></div>
      <div class="kpi"><div class="lbl">Среднее в день</div><div class="val">${(stats.totalBlocks / stats.daysInMonth).toFixed(1)}</div><div class="sub">блоков в день</div></div>
    </div>
  `;

  const matrixHtml = renderCompletionMatrix(stats);

  const chartsHtml = `
    <div class="cr-charts">
      <div class="cr-chart-card"><h3>Форматы работы</h3><div class="cr-chart-box"><canvas id="cr-chart-wt"></canvas></div></div>
      <div class="cr-chart-card"><h3>Нагрузка по дням недели</h3><div class="cr-chart-box"><canvas id="cr-chart-dow"></canvas></div></div>
    </div>
  `;

  body.innerHTML = kpiHtml + matrixHtml + chartsHtml;
  drawCoachCharts(stats);
}

function renderCompletionMatrix(stats) {
  const { year, monthNum, daysInMonth, playerMatrix } = stats;
  
  const days = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = `${year}-${String(monthNum).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dateObj = new Date(ds + 'T00:00:00');
    const dow = (dateObj.getDay() + 6) % 7; 
    days.push({ d, ds, dow });
  }

  const playersList = DB.players.slice().sort((a, b) => (a.fio || '').localeCompare(b.fio || '', 'ru'));

  let html = `<div class="card" style="overflow:hidden; padding-bottom:8px;">
    <h2>Матрица выполнения</h2>
    <p class="subtitle" style="margin-top:-8px">Строки — игроки. Столбцы — дни. Цвет показывает, как выполнен план.</p>
    
    <div style="overflow-x:auto; padding-bottom:12px;">
      <table class="cr-matrix">
        <thead>
          <tr>
            <th style="min-width:150px; position:sticky; left:0; z-index:2; background:var(--ak-gray-light); color:var(--ak-green);">Игрок</th>
            ${days.map(d => `<th style="text-align:center; width:26px; padding:4px; background:${d.dow>=5?'var(--ak-gray-mid)':'var(--ak-gray-light)'};">${d.d}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${playersList.map(p => {
            const pMatrix = playerMatrix[p.id] || {};
            return `<tr>
              <td style="position:sticky; left:0; background:#fff; z-index:1; border-right:2px solid var(--ak-gray-mid); font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; padding:8px 10px;">
                ${escapeHtml(p.fio)}
              </td>
              ${days.map(d => {
                const data = pMatrix[d.ds];
                if (!data) {
                  return `<td style="text-align:center; padding:2px;"><div class="cr-matrix-cell empty"></div></td>`;
                }
                
                let cls = 'mixed';
                let title = '';
                
                if (data.hasGame) {
                  cls = 'game';
                  title = 'Игра';
                } else if (data.done > 0 && data.partial === 0 && data.notdone === 0 && data.unmarked === 0) {
                  cls = 'done';
                  title = `Выполнено (${data.done})`;
                } else if (data.notdone > 0 && data.done === 0 && data.partial === 0) {
                  cls = 'notdone';
                  title = `Не выполнено (${data.notdone})`;
                } else if (data.partial > 0) {
                  cls = 'partial';
                  title = `Частично: ${data.partial}, Выполнено: ${data.done}, Не выполнено: ${data.notdone}`;
                } else if (data.unmarked > 0) {
                  cls = 'unmarked';
                  title = 'Ожидает отметки';
                } else {
                  cls = 'mixed';
                  title = 'Разное';
                }
                
                return `<td style="text-align:center; padding:2px;">
                  <div class="cr-matrix-cell ${cls}" title="${title}"></div>
                </td>`;
              }).join('')}
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>

    <div style="display:flex; gap:16px; flex-wrap:wrap; font-size:11px; margin-top:12px; padding:8px; background:var(--ak-gray-light); border-radius:4px;">
      <span><span class="cr-matrix-cell done" style="display:inline-block; vertical-align:middle; margin-right:4px;"></span> Выполнено</span>
      <span><span class="cr-matrix-cell partial" style="display:inline-block; vertical-align:middle; margin-right:4px;"></span> Частично</span>
      <span><span class="cr-matrix-cell notdone" style="display:inline-block; vertical-align:middle; margin-right:4px;"></span> Не выполнено</span>
      <span><span class="cr-matrix-cell unmarked" style="display:inline-block; vertical-align:middle; margin-right:4px;"></span> Ждёт проверки</span>
      <span><span class="cr-matrix-cell game" style="display:inline-block; vertical-align:middle; margin-right:4px;"></span> Игра</span>
      <span><span class="cr-matrix-cell empty" style="display:inline-block; vertical-align:middle; margin-right:4px;"></span> Нет тренировки</span>
    </div>
  </div>`;

  return html;
}

function drawCoachCharts(stats) {
  const fmtLabels = [];
  const fmtData = [];
  Object.entries(stats.byFormat).forEach(([k, v]) => { if (v > 0) { fmtLabels.push(k); fmtData.push(v); } });
  const ctx2 = document.getElementById('cr-chart-wt');
  if (ctx2) new Chart(ctx2, { type: 'doughnut',
    data: { labels: fmtLabels.length ? fmtLabels : ['Нет данных'],
      datasets: [{ data: fmtData.length ? fmtData : [1], backgroundColor: ['#f59e0b', '#C8102E', '#4f46e5', '#059669', '#5a6169'], borderColor: '#fff', borderWidth: 2 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { font: { size: 12 }, padding: 12 } } } } });

  const dowLabels = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
  const ctx3 = document.getElementById('cr-chart-dow');
  if (ctx3) new Chart(ctx3, { type: 'bar',
    data: { labels: dowLabels, datasets: [{ label: 'Блоков', data: stats.byDow, backgroundColor: ['#154734','#1e5a44','#C8102E','#9a0c23','#5a6169','#f59e0b','#f59e0b'] }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { stepSize: 1, color: '#5a6169' }, grid: { color: '#e8eaec' } }, x: { ticks: { color: '#5a6169' }, grid: { display: false } } } } });
}

async function exportCoachReportToPDF() {
  const body = document.getElementById('cr-body');
  if (!body || !body.innerHTML.trim()) { uiAlert('Нет данных для экспорта'); return; }
  await new Promise(r => setTimeout(r, 200));
  const stage = document.getElementById('pdf-stage');
  stage.innerHTML = `
    <div style="border-top:6px solid var(--ak-green);padding-top:10px;margin-bottom:14px">
      <div style="font-size:18px;font-weight:900;color:var(--ak-green);letter-spacing:1px;text-transform:uppercase">АК БАРС · Отчёт тренера</div>
      <div style="font-size:11px;color:#5a6169;margin-top:4px">Месяц: ${getMonthLabel(coachReportMonth)} · Сформировано: ${new Date().toLocaleString('ru-RU')}</div>
    </div>
    <div id="cr-print-body"></div>`;
  const printBody = stage.querySelector('#cr-print-body');
  printBody.innerHTML = body.innerHTML;
  const srcCanvases = body.querySelectorAll('canvas');
  const dstCanvases = printBody.querySelectorAll('canvas');
  srcCanvases.forEach((src, i) => {
    const dst = dstCanvases[i];
    if (!dst || !dst.parentElement) return;
    try {
      const img = document.createElement('img');
      img.src = src.toDataURL('image/png');
      img.style.width = '100%'; img.style.maxWidth = '520px';
      img.style.display = 'block'; img.style.margin = '0 auto';
      dst.parentElement.replaceChild(img, dst);
    } catch (e) {}
  });
  try { await exportElementToPDF(stage, `Отчёт_тренера_${coachReportMonth}.pdf`, { orientation: 'p' }); }
  finally { stage.innerHTML = ''; }
}