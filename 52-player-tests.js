/* ============================================================
   52-player-tests.js
   Вкладка «Тесты» + графики тестов в карточке игрока.

   ВАЖНО: в режиме игрока (isPlayerMode=true) тесты доступны
   ТОЛЬКО для просмотра. Все функции изменения защищены
   гвардами isPlayerMode; UI рендерится без кнопок и полей.

   Содержит:
   - renderTests
   - renameTestColumn / resetTestColumns
   - updateTest / addTest / removeTest
   - renderTestCharts / drawTestCharts
   ============================================================ */

/* ============================================================
   ТЕСТЫ
   ============================================================ */

function renderTests(p) {
  const cols = getTestColumns();
  const canEdit = !isPlayerMode;

  const headHtml = `<th>Дата</th>` +
    cols.map(c => canEdit
      ? `<th><span class="editable-name" contenteditable="true" onblur="renameTestColumn('${c.key}', this.innerText)">${escapeHtml(c.label)}</span></th>`
      : `<th>${escapeHtml(c.label)}</th>`
    ).join('') +
    (canEdit ? `<th class="no-print"></th>` : '');

  let rows = (p.tests || []).map((t, i) => {
    const cells = cols.map(c => canEdit
      ? `<td><input class="cell" value="${escapeAttr(t[c.key] || '')}" onchange="updateTest('${p.id}',${i},'${c.key}',this.value)"></td>`
      : `<td>${escapeHtml(t[c.key] || '')}</td>`
    ).join('');

    const dateCell = canEdit
      ? `<td><input class="cell" type="date" value="${t.date || ''}" onchange="updateTest('${p.id}',${i},'date',this.value)"></td>`
      : `<td>${escapeHtml(t.date || '')}</td>`;

    const delCell = canEdit
      ? `<td class="no-print"><button class="btn btn-sm btn-ghost" onclick="removeTest('${p.id}',${i})">×</button></td>`
      : '';

    return `<tr>${dateCell}${cells}${delCell}</tr>`;
  }).join('');

  const actionsHtml = canEdit ? `
    <div class="btn-row no-print">
      <button class="btn btn-sm" onclick="addTest('${p.id}')">+ Тест</button>
      <button class="btn btn-sm btn-ghost" onclick="resetTestColumns()">↺ Сбросить названия столбцов</button>
    </div>` : '';

  return `<div class="card"><h2>Тесты</h2>
    <p class="subtitle" style="margin-top:-8px">${canEdit ? 'Названия столбцов редактируются кликом.' : 'Тесты заполняются тренером.'}</p>
    ${actionsHtml}
    <div style="overflow-x:auto"><table><thead><tr>${headHtml}</tr></thead>
    <tbody>${rows || `<tr><td colspan="${cols.length + (canEdit ? 2 : 1)}" style="text-align:center;color:#5a6169;padding:16px">Тестов пока нет</td></tr>`}</tbody></table></div></div>`;
}

function renameTestColumn(key, newLabel) {
  if (isPlayerMode) return;
  newLabel = (newLabel || '').trim();
  if (!newLabel) return;
  if (!Array.isArray(DB.testColumns) || !DB.testColumns.length) {
    DB.testColumns = DEFAULT_TEST_COLUMNS.map(c => ({ ...c }));
  }
  const col = DB.testColumns.find(c => c.key === key);
  if (col && col.label !== newLabel) { col.label = newLabel; saveDB(); }
}

function resetTestColumns() {
  if (isPlayerMode) return;
  uiConfirm(
    'Сбросить названия столбцов тестов на стандартные?',
    () => {
      DB.testColumns = DEFAULT_TEST_COLUMNS.map(c => ({ ...c }));
      saveDB();
      if (currentPlayerId) refreshProfile(currentPlayerId);
    },
    () => {}
  );
}

function updateTest(pid, i, f, v) {
  if (isPlayerMode) return;
  const p = DB.players.find(x => x.id === pid);
  if (!p || !p.tests || !p.tests[i]) return;
  p.tests[i][f] = v;
  saveDB();
}

function addTest(pid) {
  if (isPlayerMode) return;
  const p = DB.players.find(x => x.id === pid);
  if (!p) return;
  if (!p.tests) p.tests = [];
  const newRow = { date: '' };
  getTestColumns().forEach(c => newRow[c.key] = '');
  p.tests.push(newRow);
  saveDB();
  refreshProfile(pid);
}

function removeTest(pid, i) {
  if (isPlayerMode) return;
  const p = DB.players.find(x => x.id === pid);
  if (!p || !p.tests) return;
  p.tests.splice(i, 1);
  saveDB();
  refreshProfile(pid);
}

/* ============================================================
   ГРАФИКИ ТЕСТОВ (только просмотр, работают в обоих режимах)
   ============================================================ */

function renderTestCharts(p) {
  return `<div class="card"><h2>Динамика тестов</h2>
    <p class="subtitle" style="margin-top:-8px">Линейные графики по датам замеров</p>
    <div class="chart-grid">
      <div><h3>Вертикальный прыжок (см)</h3><div class="chart-box"><canvas id="ch-vertical-${p.id}"></canvas></div></div>
      <div><h3>Спринт 30 м (с)</h3><div class="chart-box"><canvas id="ch-sprint-${p.id}"></canvas></div></div>
      <div><h3>Жим лёжа 5ПМ (кг)</h3><div class="chart-box"><canvas id="ch-bench-${p.id}"></canvas></div></div>
      <div><h3>Присед 5ПМ (кг)</h3><div class="chart-box"><canvas id="ch-squat-${p.id}"></canvas></div></div>
      <div><h3>Подтягивания (раз)</h3><div class="chart-box"><canvas id="ch-pullups-${p.id}"></canvas></div></div>
      <div><h3>Общий прогресс</h3><div class="chart-box"><canvas id="ch-overall-${p.id}"></canvas></div></div>
    </div></div>`;
}

function drawTestCharts(p) {
  const tests = (p.tests || []).filter(t => t.date).slice().sort((a, b) => a.date.localeCompare(b.date));
  const labels = tests.map(t => formatDate(t.date));
  const num = v => v === '' || v == null ? null : Number(v);

  const makeChart = (id, data, label, color, reverse = false) => {
    const ctx = document.getElementById(id); if (!ctx) return;
    new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label, data,
          borderColor: color,
          backgroundColor: color + '22',
          borderWidth: 3,
          tension: .3,
          fill: true,
          pointBackgroundColor: color,
          pointRadius: 5,
          pointHoverRadius: 7,
          spanGaps: true
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: !reverse, reverse, grid: { color: '#e8eaec' }, ticks: { color: '#5a6169' } },
          x: { grid: { display: false }, ticks: { color: '#5a6169' } }
        }
      }
    });
  };

  makeChart('ch-vertical-' + p.id, tests.map(t => num(t.vertical)), 'Прыжок, см', '#154734');
  makeChart('ch-sprint-' + p.id,   tests.map(t => num(t.sprint)),   'Спринт, с', '#C8102E', true);
  makeChart('ch-bench-' + p.id,    tests.map(t => num(t.bench)),    'Жим, кг', '#1e5a44');
  makeChart('ch-squat-' + p.id,    tests.map(t => num(t.squat)),    'Присед, кг', '#9a0c23');
  makeChart('ch-pullups-' + p.id,  tests.map(t => num(t.pullups)),  'Подтягивания', '#5a6169');

  const overall = tests.map(t => {
    const vals = [];
    if (num(t.vertical)) vals.push(Math.min(100, num(t.vertical) / 80 * 100));
    if (num(t.sprint))   vals.push(Math.min(100, (5 - num(t.sprint)) / 2 * 100));
    if (num(t.bench))    vals.push(Math.min(100, num(t.bench) / 120 * 100));
    if (num(t.squat))    vals.push(Math.min(100, num(t.squat) / 150 * 100));
    if (num(t.pullups))  vals.push(Math.min(100, num(t.pullups) / 20 * 100));
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  });
  makeChart('ch-overall-' + p.id, overall, 'Общий прогресс, %', '#C8102E');
}