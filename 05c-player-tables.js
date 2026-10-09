/* ============================================================
   05c-player-tables.js
   Таблицы и графики карточки игрока.
   Вкладка «Навыки» — дерево аккордеонов:
     ТЕХНИЧЕСКИЕ → подразделы-аккордеоны → таблица критериев
     ФИЗИЧЕСКИЕ / ТАКТИЧЕСКИЕ / ПСИХОЛОГИЧЕСКИЕ → таблица критериев
   ============================================================ */

/* ============================================================
   ВКЛАДКА «НАВЫКИ» — дерево аккордеонов
   ============================================================ */

const SKILLS_OPEN = new Set();

function renderSkillsTab(p) {
  return `<div class="card">
    <div class="flex-between" style="margin-bottom:12px">
      <div>
        <h2 style="margin-bottom:4px">Навыки</h2>
        <p class="subtitle" style="margin:0">Оценки по разделам. Нажмите на раздел, чтобы раскрыть.</p>
      </div>
      <div class="btn-row no-print" style="margin:0">
        <button class="btn btn-sm btn-ghost" id="skills-toggle-all-btn" onclick="toggleAllSkillsAccordions('${p.id}')">Развернуть все</button>
      </div>
    </div>
    <div id="skills-content"></div>
  </div>`;
}

function renderSkillsContent(p) {
  const el = document.getElementById('skills-content');
  if (!el) return;

  const techGroups = groupBy(p.techDetail || [], 'sub');
  const otherByGroup = groupBy(p.otherDetail || [], 'group');

  const techCount = (p.techDetail || []).length;
  const physCount = ((otherByGroup['Физические качества']) || []).length;
  const tactCount = ((otherByGroup['Тактические навыки']) || []).length;
  const psihCount = ((otherByGroup['Психологические характеристики']) || []).length;

  const html = `
    <div class="skills-tree">
      ${renderSkillAccordion({
        id: 'tech',
        title: 'Технические',
        count: techCount,
        body: renderTechSubtree(p, techGroups)
      })}

      ${renderSkillAccordion({
        id: 'phys',
        title: 'Физические',
        count: physCount,
        body: physCount
          ? renderFlatTable(otherByGroup['Физические качества'], p.id, 'phys')
          : '<div class="sk-empty">Нет критериев в этом разделе</div>'
      })}

      ${renderSkillAccordion({
        id: 'tact',
        title: 'Тактические',
        count: tactCount,
        body: tactCount
          ? renderFlatTable(otherByGroup['Тактические навыки'], p.id, 'tact')
          : '<div class="sk-empty">Нет критериев в этом разделе</div>'
      })}

      ${renderSkillAccordion({
        id: 'psih',
        title: 'Психологические',
        count: psihCount,
        body: psihCount
          ? renderFlatTable(otherByGroup['Психологические характеристики'], p.id, 'psih')
          : '<div class="sk-empty">Нет критериев в этом разделе</div>'
      })}
    </div>
  `;

  el.innerHTML = html;
  updateSkillsToggleAllBtn(p);
}

function groupBy(arr, field) {
  const out = {};
  arr.forEach(r => {
    const k = r[field] || '';
    if (!out[k]) out[k] = [];
    out[k].push(r);
  });
  return out;
}

function renderSkillAccordion({ id, title, count, body, level = 1 }) {
  const isOpen = SKILLS_OPEN.has(id);
  const levelCls = 'sk-level-' + level;
  return `<div class="sk-acc ${levelCls} ${isOpen ? 'open' : ''}" data-sk-id="${escapeAttr(id)}">
    <button type="button" class="sk-acc-head" onclick="toggleSkillsAccordion('${escapeAttr(id)}')">
      <span class="sk-acc-arrow">▶</span>
      <span class="sk-acc-title">${escapeHtml(title)}</span>
      <span class="sk-acc-count">${count}</span>
    </button>
    <div class="sk-acc-body">
      <div class="sk-acc-inner">${body}</div>
    </div>
  </div>`;
}

function renderTechSubtree(p, techGroups) {
  const subNames = Object.keys(techGroups);
  if (!subNames.length) return '<div class="sk-empty">Нет критериев в этом разделе</div>';

  return subNames.map(subName => {
    const rows = techGroups[subName];
    const id = 'tech:' + subName;
    const table = renderGroupedTechTable(rows, p.id, subName);
    return renderSkillAccordion({
      id,
      title: subName,
      count: rows.length,
      body: table,
      level: 2
    });
  }).join('');
}

function renderGroupedTechTable(rows, pid, subName) {
  if (!rows.length) return '<div class="sk-empty">Пусто</div>';

  const html = rows.map((r, i) => {
    const globalIdx = findTechIndex(pid, r);
    return `<tr>
      <td style="text-align:center;color:var(--ak-gray-dark);font-weight:900;font-family:var(--font-display)">${i + 1}</td>
      <td><span class="editable-name" contenteditable="true" onblur="updateTechName('${pid}',${globalIdx},'name',this.innerText)">${escapeHtml(r.name)}</span></td>
      <td><input class="cell sk-cell" type="number" min="1" max="10" value="${r.start ?? ''}" onchange="updateTech('${pid}',${globalIdx},'start',this.value)"></td>
      <td><input class="cell sk-cell" type="number" min="1" max="10" value="${r.mid ?? ''}" onchange="updateTech('${pid}',${globalIdx},'mid',this.value)"></td>
      <td><input class="cell sk-cell" type="number" min="1" max="10" value="${r.end ?? ''}" onchange="updateTech('${pid}',${globalIdx},'end',this.value)"></td>
    </tr>`;
  }).join('');

  return `<div class="sk-table-wrap">
    <table class="sk-table">
      <thead>
        <tr>
          <th style="width:36px">№</th>
          <th>Критерий</th>
          <th style="width:84px">Начало</th>
          <th style="width:84px">Середина</th>
          <th style="width:84px">Конец</th>
        </tr>
      </thead>
      <tbody>${html}</tbody>
    </table>
  </div>`;
}

function findTechIndex(pid, row) {
  const p = DB.players.find(x => x.id === pid);
  if (!p || !p.techDetail) return -1;
  return p.techDetail.indexOf(row);
}

function renderFlatTable(rows, pid, kind) {
  if (!rows || !rows.length) return '<div class="sk-empty">Пусто</div>';

  const html = rows.map((r, i) => {
    const globalIdx = findOtherIndex(pid, r);
    return `<tr>
      <td style="text-align:center;color:var(--ak-gray-dark);font-weight:900;font-family:var(--font-display)">${i + 1}</td>
      <td>${r.sub ? `<div class="sk-sub">${escapeHtml(r.sub)}</div>` : ''}<span class="editable-name" contenteditable="true" onblur="updateOtherName('${pid}',${globalIdx},'name',this.innerText)">${escapeHtml(r.name)}</span></td>
      <td><input class="cell sk-cell" type="number" min="1" max="10" value="${r.start ?? ''}" onchange="updateOther('${pid}',${globalIdx},'start',this.value)"></td>
      <td><input class="cell sk-cell" type="number" min="1" max="10" value="${r.plan ?? ''}" onchange="updateOther('${pid}',${globalIdx},'plan',this.value)"></td>
      <td><input class="cell sk-cell" type="number" min="1" max="10" value="${r.fact ?? ''}" onchange="updateOther('${pid}',${globalIdx},'fact',this.value)"></td>
    </tr>`;
  }).join('');

  return `<div class="sk-table-wrap">
    <table class="sk-table">
      <thead>
        <tr>
          <th style="width:36px">№</th>
          <th>Критерий</th>
          <th style="width:84px">Начало</th>
          <th style="width:84px">Середина</th>
          <th style="width:84px">Конец</th>
        </tr>
      </thead>
      <tbody>${html}</tbody>
    </table>
  </div>`;
}

function findOtherIndex(pid, row) {
  const p = DB.players.find(x => x.id === pid);
  if (!p || !p.otherDetail) return -1;
  return p.otherDetail.indexOf(row);
}

function toggleSkillsAccordion(id) {
  if (SKILLS_OPEN.has(id)) SKILLS_OPEN.delete(id);
  else SKILLS_OPEN.add(id);
  const el = document.querySelector(`.sk-acc[data-sk-id="${CSS.escape(id)}"]`);
  if (el) el.classList.toggle('open', SKILLS_OPEN.has(id));
  updateSkillsToggleAllBtn(null);
}

function toggleAllSkillsAccordions(pid) {
  const p = DB.players.find(x => x.id === pid);
  if (!p) return;

  const ids = collectAllSkillIds(p);
  const allOpen = ids.length && ids.every(id => SKILLS_OPEN.has(id));

  if (allOpen) {
    SKILLS_OPEN.clear();
  } else {
    ids.forEach(id => SKILLS_OPEN.add(id));
  }

  document.querySelectorAll('.sk-acc').forEach(el => {
    const id = el.dataset.skId;
    el.classList.toggle('open', SKILLS_OPEN.has(id));
  });

  updateSkillsToggleAllBtn(p);
}

function collectAllSkillIds(p) {
  const ids = ['tech', 'phys', 'tact', 'psih'];
  (p.techDetail || []).forEach(r => {
    if (r.sub) ids.push('tech:' + r.sub);
  });
  return Array.from(new Set(ids));
}

function updateSkillsToggleAllBtn(p) {
  const btn = document.getElementById('skills-toggle-all-btn');
  if (!btn || !p) return;
  const ids = collectAllSkillIds(p);
  const allOpen = ids.length && ids.every(id => SKILLS_OPEN.has(id));
  btn.textContent = allOpen ? 'Свернуть все' : 'Развернуть все';
}

/* ============================================================
   ПЛОСКИЕ ТАБЛИЦЫ (для PDF и старого экспорта)
   ============================================================ */

function renderTechTable(p) {
  let rows = '', lastGroup = '', lastSub = '';
  p.techDetail.forEach((r, i) => {
    const g = r.group !== lastGroup
      ? `<td rowspan="${countGroup(p.techDetail, r.group)}" style="font-weight:900;color:var(--ak-green);vertical-align:top;font-family:var(--font-display);font-size:11px;letter-spacing:.3px;text-transform:uppercase">${r.group}</td>`
      : '';
    const s = r.sub !== lastSub
      ? `<td style="font-weight:600;color:var(--ak-gray-dark);font-size:12px">${r.sub}</td>`
      : '<td></td>';
    rows += `<tr>${g}${s}<td>${i + 1}</td>
      <td><span class="editable-name" contenteditable="true" onblur="updateTechName('${p.id}',${i},'name',this.innerText)">${escapeHtml(r.name)}</span></td>
      <td><input class="cell" type="number" min="1" max="10" value="${r.start ?? ''}" onchange="updateTech('${p.id}',${i},'start',this.value)"></td>
      <td><input class="cell" type="number" min="1" max="10" value="${r.mid ?? ''}" onchange="updateTech('${p.id}',${i},'mid',this.value)"></td>
      <td><input class="cell" type="number" min="1" max="10" value="${r.end ?? ''}" onchange="updateTech('${p.id}',${i},'end',this.value)"></td></tr>`;
    lastGroup = r.group; lastSub = r.sub;
  });
  return `<div class="card"><h2>Техническая оснащённость</h2>
    <div style="overflow-x:auto"><table><thead><tr><th>Раздел</th><th>Подраздел</th><th>№</th><th>Критерий</th><th>Начало</th><th>Середина</th><th>Конец</th></tr></thead>
    <tbody>${rows}</tbody></table></div></div>`;
}

function countGroup(a, g) { return a.filter(x => x.group === g).length; }

function updateTech(pid, i, f, v) {
  const p = DB.players.find(x => x.id === pid);
  if (!p || !p.techDetail || !p.techDetail[i]) return;
  p.techDetail[i][f] = v === '' ? null : Number(v);
  saveDB();
  refreshProfile(pid);
}

function updateTechName(pid, i, f, v) {
  const p = DB.players.find(x => x.id === pid);
  if (!p || !p.techDetail || !p.techDetail[i]) return;
  v = (v || '').trim();
  if (!v || p.techDetail[i][f] === v) return;
  p.techDetail[i][f] = v;
  saveDB();
}

function renderOtherTable(p) {
  let rows = '', lastGroup = '', lastSub = '';
  p.otherDetail.forEach((r, i) => {
    const g = r.group !== lastGroup
      ? `<td rowspan="${countGroup(p.otherDetail, r.group)}" style="font-weight:900;color:var(--ak-green);vertical-align:top;font-family:var(--font-display);font-size:11px;letter-spacing:.3px;text-transform:uppercase">${r.group}</td>`
      : '';
    const s = r.sub !== lastSub && r.sub
      ? `<td style="font-weight:600;color:var(--ak-gray-dark);font-size:12px">${r.sub}</td>`
      : '<td></td>';
    rows += `<tr>${g}${s}<td>${i + 1}</td>
      <td><span class="editable-name" contenteditable="true" onblur="updateOtherName('${p.id}',${i},'name',this.innerText)">${escapeHtml(r.name)}</span></td>
      <td><input class="cell" type="number" min="1" max="10" value="${r.start ?? ''}" onchange="updateOther('${p.id}',${i},'start',this.value)"></td>
      <td><input class="cell" type="number" min="1" max="10" value="${r.plan ?? ''}" onchange="updateOther('${p.id}',${i},'plan',this.value)"></td>
      <td><input class="cell" type="number" min="1" max="10" value="${r.fact ?? ''}" onchange="updateOther('${p.id}',${i},'fact',this.value)"></td></tr>`;
    lastGroup = r.group; lastSub = r.sub;
  });
  return `<div class="card"><h2>Физические, тактические и психологические характеристики</h2>
    <div style="overflow-x:auto"><table><thead><tr><th>Раздел</th><th>Подраздел</th><th>№</th><th>Критерий</th><th>Начало</th><th>Середина</th><th>Конец</th></tr></thead>
    <tbody>${rows}</tbody></table></div></div>`;
}

function updateOther(pid, i, f, v) {
  const p = DB.players.find(x => x.id === pid);
  if (!p || !p.otherDetail || !p.otherDetail[i]) return;
  p.otherDetail[i][f] = v === '' ? null : Number(v);
  saveDB();
  refreshProfile(pid);
}

function updateOtherName(pid, i, f, v) {
  const p = DB.players.find(x => x.id === pid);
  if (!p || !p.otherDetail || !p.otherDetail[i]) return;
  v = (v || '').trim();
  if (!v || p.otherDetail[i][f] === v) return;
  p.otherDetail[i][f] = v;
  saveDB();
}

/* ============================================================
   СТАТИСТИКА
   ============================================================ */

function renderStats(p) {
  let rows = p.stats.map((s, i) => {
    if (s.season && !s.club) return `<tr class="section-row"><td colspan="7">${escapeHtml(s.season)}</td></tr>`;
    return `<tr>
      <td><input class="cell" value="${escapeAttr(s.club || '')}" onchange="updateStat('${p.id}',${i},'club',this.value)"></td>
      <td><input class="cell" type="number" value="${s.games ?? ''}" onchange="updateStat('${p.id}',${i},'games',this.value)"></td>
      <td><input class="cell" type="number" value="${s.goals ?? ''}" onchange="updateStat('${p.id}',${i},'goals',this.value)"></td>
      <td><input class="cell" type="number" value="${s.assists ?? ''}" onchange="updateStat('${p.id}',${i},'assists',this.value)"></td>
      <td><input class="cell" type="number" value="${s.points ?? ''}" onchange="updateStat('${p.id}',${i},'points',this.value)"></td>
      <td><input class="cell" type="number" value="${s.plus ?? ''}" onchange="updateStat('${p.id}',${i},'plus',this.value)"></td>
      <td class="no-print"><button class="btn btn-sm btn-ghost" onclick="removeStat('${p.id}',${i})">×</button></td></tr>`;
  }).join('');
  return `<div class="card"><h2>Статистика матчей</h2>
    <div class="btn-row no-print">
      <button class="btn btn-sm" onclick="addStat('${p.id}')">+ Строка</button>
      <button class="btn btn-sm btn-ghost" onclick="addStatSection('${p.id}')">+ Раздел</button>
    </div>
    <div style="overflow-x:auto"><table><thead><tr><th>Клуб / турнир</th><th>Игры</th><th>Голы</th><th>Передачи</th><th>Очки</th><th>+/-</th><th></th></tr></thead>
    <tbody>${rows}</tbody></table></div></div>`;
}

function updateStat(pid, i, f, v) {
  const p = DB.players.find(x => x.id === pid);
  if (!p || !p.stats || !p.stats[i]) return;
  p.stats[i][f] = (f === 'club' || f === 'season') ? v : (v === '' ? '' : Number(v));
  saveDB();
}
function addStat(pid) {
  const p = DB.players.find(x => x.id === pid);
  if (!p) return;
  p.stats.push({ season: '', club: '', games: '', goals: '', assists: '', points: '', plus: '' });
  saveDB();
  refreshProfile(pid);
}
function addStatSection(pid) {
  const p = DB.players.find(x => x.id === pid);
  if (!p) return;
  const name = prompt('Название раздела:');
  if (!name) return;
  p.stats.push({ season: name, club: '', games: '', goals: '', assists: '', points: '', plus: '' });
  saveDB();
  refreshProfile(pid);
}
function removeStat(pid, i) {
  const p = DB.players.find(x => x.id === pid);
  if (!p || !p.stats) return;
  p.stats.splice(i, 1);
  saveDB();
  refreshProfile(pid);
}

/* ============================================================
   ТЕСТЫ
   ============================================================ */

function renderTests(p) {
  const cols = getTestColumns();
  const headHtml = `<th>Дата</th>` +
    cols.map(c => `<th><span class="editable-name" contenteditable="true" onblur="renameTestColumn('${c.key}', this.innerText)">${escapeHtml(c.label)}</span></th>`).join('') +
    `<th class="no-print"></th>`;

  let rows = (p.tests || []).map((t, i) => {
    const cells = cols.map(c => `<td><input class="cell" value="${escapeAttr(t[c.key] || '')}" onchange="updateTest('${p.id}',${i},'${c.key}',this.value)"></td>`).join('');
    return `<tr>
      <td><input class="cell" type="date" value="${t.date || ''}" onchange="updateTest('${p.id}',${i},'date',this.value)"></td>
      ${cells}
      <td class="no-print"><button class="btn btn-sm btn-ghost" onclick="removeTest('${p.id}',${i})">×</button></td></tr>`;
  }).join('');

  return `<div class="card"><h2>Тесты</h2>
    <p class="subtitle" style="margin-top:-8px">Названия столбцов редактируются кликом.</p>
    <div class="btn-row no-print">
      <button class="btn btn-sm" onclick="addTest('${p.id}')">+ Тест</button>
      <button class="btn btn-sm btn-ghost" onclick="resetTestColumns()">↺ Сбросить названия столбцов</button>
    </div>
    <div style="overflow-x:auto"><table><thead><tr>${headHtml}</tr></thead>
    <tbody>${rows}</tbody></table></div></div>`;
}

function renameTestColumn(key, newLabel) {
  newLabel = (newLabel || '').trim();
  if (!newLabel) return;
  if (!Array.isArray(DB.testColumns) || !DB.testColumns.length) {
    DB.testColumns = DEFAULT_TEST_COLUMNS.map(c => ({ ...c }));
  }
  const col = DB.testColumns.find(c => c.key === key);
  if (col && col.label !== newLabel) { col.label = newLabel; saveDB(); }
}
function resetTestColumns() {
  if (!confirm('Сбросить названия столбцов тестов на стандартные?')) return;
  DB.testColumns = DEFAULT_TEST_COLUMNS.map(c => ({ ...c }));
  saveDB();
  if (currentPlayerId) refreshProfile(currentPlayerId);
}
function updateTest(pid, i, f, v) {
  const p = DB.players.find(x => x.id === pid);
  if (!p || !p.tests || !p.tests[i]) return;
  p.tests[i][f] = v;
  saveDB();
}
function addTest(pid) {
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
  const p = DB.players.find(x => x.id === pid);
  if (!p || !p.tests) return;
  p.tests.splice(i, 1);
  saveDB();
  refreshProfile(pid);
}

/* ============================================================
   ГРАФИКИ ТЕСТОВ
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

/* ============================================================
   РАДАРЫ
   ============================================================ */

function drawRadar(p) {
  const ctx = document.getElementById('radar-' + p.id);
  if (!ctx) return;
  const s = getCurrentScores(p);
  new Chart(ctx, {
    type: 'radar',
    data: {
      labels: ['Техника','Физика','Тактика','Психология'],
      datasets: [{
        label: p.fio,
        data: [s.tehn, s.fiz, s.takt, s.psih],
        backgroundColor: 'rgba(21,71,52,.2)',
        borderColor: '#154734',
        borderWidth: 3,
        pointBackgroundColor: '#C8102E',
        pointBorderColor: '#fff',
        pointRadius: 6,
        pointHoverRadius: 8,
        pointBorderWidth: 2
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: {
        r: {
          beginAtZero: true, max: 10,
          ticks: { stepSize: 2, color: '#5a6169', backdropColor: 'transparent' },
          grid: { color: '#C1C6C8' },
          angleLines: { color: '#C1C6C8' },
          pointLabels: { font: { size: 13, weight: '900' }, color: '#154734' }
        }
      },
      plugins: { legend: { display: false } }
    }
  });
}

function drawRadarCompare(p) {
  const ctx = document.getElementById('radar2-' + p.id);
  if (!ctx) return;
  const s = getCurrentScores(p);
  const e = getEndScores(p);
  const hasEnd = [e.tehn, e.fiz, e.takt, e.psih].some(v => v != null);

  const datasets = [{
    label: 'Начало сезона',
    data: [s.tehn, s.fiz, s.takt, s.psih],
    backgroundColor: 'rgba(21,71,52,.15)',
    borderColor: '#154734',
    borderWidth: 3,
    pointBackgroundColor: '#154734',
    pointRadius: 5
  }];
  if (hasEnd) {
    datasets.push({
      label: 'Конец сезона',
      data: [e.tehn, e.fiz, e.takt, e.psih],
      backgroundColor: 'rgba(200,16,46,.15)',
      borderColor: '#C8102E',
      borderWidth: 3,
      pointBackgroundColor: '#C8102E',
      pointRadius: 5
    });
  }

  new Chart(ctx, {
    type: 'radar',
    data: { labels: ['Техника','Физика','Тактика','Психология'], datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: {
        r: {
          beginAtZero: true, max: 10,
          ticks: { stepSize: 2, color: '#5a6169', backdropColor: 'transparent' },
          grid: { color: '#C1C6C8' },
          angleLines: { color: '#C1C6C8' },
          pointLabels: { font: { size: 13, weight: '900' }, color: '#154734' }
        }
      },
      plugins: { legend: { position: 'bottom' } }
    }
  });
}

/* ============================================================
   ФОТО
   ============================================================ */

function uploadPhoto(pid) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        const max = 400;
        let w = img.width, h = img.height;
        if (w > h) { if (w > max) { h = h * max / w; w = max; } }
        else       { if (h > max) { w = w * max / h; h = max; } }
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        const p = DB.players.find(x => x.id === pid);
        if (!p) return;
        p.photo = c.toDataURL('image/jpeg', 0.8);
        saveDB();
        refreshProfile(pid);
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  };
  input.click();
}

/* ============================================================
   ДЕФОЛТНЫЕ НАБОРЫ
   ============================================================ */

function defaultTechDetail() {
  return [
    ['Катание','Посадка','Ноги'],['Катание','Посадка','Спина'],['Катание','Посадка','Руки'],['Катание','Посадка','Голова'],
    ['Катание','Отталкивания','Посадка'],['Катание','Отталкивания','Длина шага'],['Катание','Отталкивания','Прокат'],
    ['Катание','Рёбра/виражи','Внутренние грани'],['Катание','Рёбра/виражи','Внешние грани'],['Катание','Рёбра/виражи','Виражи'],['Катание','Рёбра/виражи','Сбросы'],['Катание','Рёбра/виражи','Переступания'],
    ['Катание','Торможение','Внешние грани'],['Катание','Торможение','Внутренние грани'],
    ['Контроль шайбы','Ведение','Одной рукой'],['Контроль шайбы','Ведение','Двумя руками'],['Контроль шайбы','Обводка','Широкая'],['Контроль шайбы','Обводка','Короткая'],
    ['Передачи','Удобная','Пас по льду'],['Передачи','Удобная','Подкидка'],['Передачи','Удобная','Приём'],
    ['Передачи','Неудобная','Пас по льду'],['Передачи','Неудобная','Подкидка'],['Передачи','Неудобная','Приём'],
    ['Броски','Кистевой','Точность'],['Броски','Кистевой','Сила'],['Броски','Короткий','Точность'],['Броски','Короткий','Сила'],
    ['Броски','Щелчок','Точность'],['Броски','Щелчок','Сила'],['Броски','В касание','Точность'],['Броски','В касание','Сила']
  ].map(([group, sub, name]) => ({ group, sub, name, start: null, mid: null, end: null }));
}

function defaultOtherDetail() {
  return [
    ['Физические качества','Сила','Общая'],['Физические качества','Сила','Взрывная'],
    ['Физические качества','Быстрота','Частота'],['Физические качества','Быстрота','Скорость'],
    ['Физические качества','Выносливость','Общая'],['Физические качества','Выносливость','Специальная'],
    ['Тактические навыки','Игра в атаке','Открывания'],['Тактические навыки','Игра в атаке','Удержание'],
    ['Тактические навыки','Игра в обороне','Отбор'],['Тактические навыки','Игра в обороне','Опека'],
    ['Тактические навыки','Игра в неравных составах','Большинство'],['Тактические навыки','Игра в неравных составах','Меньшинство'],
    ['Психологические характеристики','','Эмоциональная стабильность'],
    ['Психологические характеристики','','Трудовая этика'],
    ['Психологические характеристики','','Спортивная активность']
  ].map(([group, sub, name]) => ({ group, sub, name, start: null, plan: null, fact: null }));
}