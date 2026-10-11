/* ============================================================
   50-player-skills.js
   Вкладка «Навыки» в карточке игрока: дерево аккордеонов
   + таблицы критериев по разделам (Технические / Физические /
   Тактические / Психологические).

   Содержит:
   - SKILLS_OPEN (состояние раскрытых узлов)
   - renderSkillsTab / renderSkillsContent
   - groupBy
   - renderSkillAccordion / renderTechSubtree
   - renderGroupedTechTable / renderFlatTable
   - findTechIndex / findOtherIndex
   - toggleSkillsAccordion / toggleAllSkillsAccordions
   - collectAllSkillIds / updateSkillsToggleAllBtn
   - renderTechTable / countGroup (для PDF-экспорта)
   - updateTech / updateTechName
   - renderOtherTable / updateOther / updateOtherName
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