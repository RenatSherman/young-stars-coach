/* ============================================================
   12-coach-report.js
   Отчёт тренера: считаем по блокам (комплекс+формат+начало+длит.)
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
  const byFormat = { 'Самостоятельная': 0, 'Индивидуальная с тренером': 0, 'В группе': 0, '—': 0 };
  const byFact = { 'done': 0, 'partial': 0, 'notdone': 0, '': 0 };
  const byPlayer = {};

  DB.players.forEach(p => {
    if (!p.calendar) return;
    if (!byPlayer[p.id]) byPlayer[p.id] = { fio: p.fio, total: 0, done: 0, partial: 0, notdone: 0, minutes: 0 };

    Object.keys(p.calendar).forEach(date => {
      if (date.slice(0, 7) !== month) return;
      const day = p.calendar[date];
      if (!Array.isArray(day)) return;

      day.forEach(sess => {
        (sess.blocks || []).forEach((b, bi) => {
          const blockKey = (sess.id || ('solo_' + p.id + '_' + date)) + '|' + bi + '|' + (b.startTime || '') + '|' + (b.complex || '');
          const dur = Number(b.duration) || 0;

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

  return { totalBlocks, byDate, byHour, byDow, byFormat, byFact, byPlayer, overall, daysInMonth, year, monthNum };
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
      <button class="btn btn-red" onclick="exportCoachReportToPDF()">📄 Экспорт в PDF</button>
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
      <div class="kpi red"><div class="lbl">% выполнения</div><div class="val">${stats.overall}%</div><div class="sub">по всем блокам</div></div>
      <div class="kpi"><div class="lbl">Выполнено</div><div class="val" style="color:#1e7a3f">${stats.byFact['done'] || 0}</div><div class="sub">блоков</div></div>
      <div class="kpi red"><div class="lbl">Частично</div><div class="val" style="color:#b8860b">${stats.byFact['partial'] || 0}</div><div class="sub">блоков</div></div>
      <div class="kpi"><div class="lbl">Не выполнено</div><div class="val" style="color:var(--ak-red)">${stats.byFact['notdone'] || 0}</div><div class="sub">блоков</div></div>
      <div class="kpi red"><div class="lbl">Среднее в день</div><div class="val">${(stats.totalBlocks / stats.daysInMonth).toFixed(1)}</div><div class="sub">блоков в день</div></div>
    </div>
  `;

  const heatHtml = renderCoachHeatmap(stats);

  const chartsHtml = `
    <div class="cr-charts">
      <div class="cr-chart-card"><h3>Блоки по дням месяца</h3><div class="cr-chart-box"><canvas id="cr-chart-days"></canvas></div></div>
      <div class="cr-chart-card"><h3>Форматы работы</h3><div class="cr-chart-box"><canvas id="cr-chart-wt"></canvas></div></div>
      <div class="cr-chart-card"><h3>Нагрузка по дням недели</h3><div class="cr-chart-box"><canvas id="cr-chart-dow"></canvas></div></div>
      <div class="cr-chart-card"><h3>Распределение по часам</h3><div class="cr-chart-box"><canvas id="cr-chart-hours"></canvas></div></div>
    </div>
  `;

  const playersArr = Object.entries(stats.byPlayer).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.total - a.total);
  const playersTableHtml = playersArr.length
    ? `<div class="card" style="margin-top:20px">
        <h2>Активность по игрокам</h2>
        <div style="overflow-x:auto"><table class="cr-player-table">
          <thead><tr><th>#</th><th>Игрок</th><th>Всего блоков</th><th>Выполнено</th><th>Частично</th><th>Не выполнено</th><th>Минут</th></tr></thead>
          <tbody>${playersArr.map((p, i) => `
            <tr>
              <td>${i + 1}</td>
              <td><strong>${escapeHtml(p.fio || '')}</strong></td>
              <td><strong>${p.total}</strong></td>
              <td>${p.done}</td>
              <td>${p.partial}</td>
              <td>${p.notdone}</td>
              <td>${p.minutes}</td>
            </tr>`).join('')}
          </tbody></table></div>
      </div>`
    : '';

  body.innerHTML = kpiHtml + heatHtml + chartsHtml + playersTableHtml;
  drawCoachCharts(stats);
}

function renderCoachHeatmap(stats) {
  const dayNames = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
  const hours = [];
  for (let h = 6; h <= 21; h++) hours.push(String(h).padStart(2, '0'));
  const heat = Array.from({ length: 7 }, () => ({}));

  DB.players.forEach(p => {
    if (!p.calendar) return;
    Object.keys(p.calendar).forEach(date => {
      if (date.slice(0, 7) !== coachReportMonth) return;
      const day = p.calendar[date];
      if (!Array.isArray(day)) return;
      const dow = (new Date(date + 'T00:00:00').getDay() + 6) % 7;
      day.forEach(sess => (sess.blocks || []).forEach(b => {
        const hh = (b.startTime || '00').slice(0, 2);
        heat[dow][hh] = (heat[dow][hh] || 0) + 1;
      }));
    });
  });

  let max = 1;
  heat.forEach(row => Object.values(row).forEach(v => { if (v > max) max = v; }));

  const colorFor = v => {
    if (!v) return '#e6e8ea';
    const t = Math.min(1, v / max);
    const r = Math.round(30 + t * 170);
    const g = Math.round(120 - t * 60);
    const b = Math.round(70 - t * 40);
    return `rgb(${r},${g},${b})`;
  };

  let html = '<div class="card"><h2>Тепловая карта нагрузки (по блокам)</h2>';
  html += '<div class="cr-heatmap">';
  html += '<div class="cr-heat-head"></div>';
  dayNames.forEach(d => { html += `<div class="cr-heat-head">${d}</div>`; });
  hours.forEach(h => {
    html += `<div class="cr-heat-time">${h}:00</div>`;
    for (let d = 0; d < 7; d++) {
      const v = heat[d][h] || 0;
      const color = colorFor(v);
      const fg = v ? '#fff' : 'transparent';
      html += `<div class="cr-heat-cell" style="background:${color};color:${fg}" title="${dayNames[d]} ${h}:00 — ${v}">${v || ''}</div>`;
    }
  });
  html += '</div></div>';
  return html;
}

function drawCoachCharts(stats) {
  const { year, monthNum, daysInMonth } = stats;

  const labels1 = [];
  const data1 = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = `${year}-${String(monthNum).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    labels1.push(String(d));
    data1.push(stats.byDate[ds] || 0);
  }
  const ctx1 = document.getElementById('cr-chart-days');
  if (ctx1) new Chart(ctx1, { type: 'bar',
    data: { labels: labels1, datasets: [{ label: 'Блоков', data: data1, backgroundColor: '#154734' }]},
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { stepSize: 1, color: '#5a6169' }, grid: { color: '#e8eaec' } }, x: { ticks: { color: '#5a6169', autoSkip: true, maxRotation: 0 }, grid: { display: false } } } } });

  const fmtLabels = [];
  const fmtData = [];
  Object.entries(stats.byFormat).forEach(([k, v]) => { if (v > 0) { fmtLabels.push(k); fmtData.push(v); } });
  const ctx2 = document.getElementById('cr-chart-wt');
  if (ctx2) new Chart(ctx2, { type: 'doughnut',
    data: { labels: fmtLabels.length ? fmtLabels : ['Нет данных'],
      datasets: [{ data: fmtData.length ? fmtData : [1], backgroundColor: ['#f59e0b', '#C8102E', '#4f46e5', '#5a6169'], borderColor: '#fff', borderWidth: 2 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { font: { size: 12 }, padding: 12 } } } } });

  const dowLabels = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
  const ctx3 = document.getElementById('cr-chart-dow');
  if (ctx3) new Chart(ctx3, { type: 'bar',
    data: { labels: dowLabels, datasets: [{ label: 'Блоков', data: stats.byDow, backgroundColor: ['#154734','#1e5a44','#C8102E','#9a0c23','#5a6169','#f59e0b','#f59e0b'] }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { stepSize: 1, color: '#5a6169' }, grid: { color: '#e8eaec' } }, x: { ticks: { color: '#5a6169' }, grid: { display: false } } } } });

  const hours = []; for (let h = 6; h <= 21; h++) hours.push(String(h).padStart(2, '0'));
  const hourData = hours.map(h => stats.byHour[h] || 0);
  const ctx4 = document.getElementById('cr-chart-hours');
  if (ctx4) new Chart(ctx4, { type: 'bar',
    data: { labels: hours.map(h => h + ':00'), datasets: [{ label: 'Блоков', data: hourData, backgroundColor: '#C8102E' }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { stepSize: 1, color: '#5a6169' }, grid: { color: '#e8eaec' } }, x: { ticks: { color: '#5a6169', autoSkip: true, maxRotation: 45 }, grid: { display: false } } } } });
}

async function exportCoachReportToPDF() {
  const body = document.getElementById('cr-body');
  if (!body || !body.innerHTML.trim()) { uiAlert('Нет данных для экспорта'); return; }
  await new Promise(r => setTimeout(r, 200));
  const stage = document.getElementById('pdf-stage');
  stage.innerHTML = `
    <div style="border-top:6px solid #C8102E;padding-top:10px;margin-bottom:14px">
      <div style="font-size:18px;font-weight:900;color:#154734;letter-spacing:1px;text-transform:uppercase">АК БАРС · Отчёт тренера</div>
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