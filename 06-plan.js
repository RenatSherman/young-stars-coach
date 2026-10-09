/* ============================================================
   06-plan.js
   План развития + общий хелпер факта для блоков календаря.
   Список комплексов берётся из двухуровневого справочника через flattenSubgroups().
   ============================================================ */

/* ---------- Хелперы навыков ---------- */

function getAllSkillOptions(p) {
  const out = [];
  (p.techDetail || []).forEach((r, i) => {
    out.push({
      section: 'tech',
      index: i,
      label: `${r.group || ''}${r.sub ? ' · ' + r.sub : ''} → ${r.name || ''}`,
      currentStart: r.start
    });
  });
  (p.otherDetail || []).forEach((r, i) => {
    out.push({
      section: 'other',
      index: i,
      label: `${r.group || ''}${r.sub ? ' · ' + r.sub : ''} → ${r.name || ''}`,
      currentStart: r.start
    });
  });
  return out;
}

function getSkillOptionByRef(p, section, index) {
  if (!section || index == null || index < 0) return null;
  const arr = section === 'tech' ? (p.techDetail || []) : (p.otherDetail || []);
  const r = arr[index];
  if (!r) return null;
  return {
    section,
    index,
    label: `${r.group || ''}${r.sub ? ' · ' + r.sub : ''} → ${r.name || ''}`,
    currentStart: r.start
  };
}

function getCurrentSkillStart(p, section, index) {
  const opt = getSkillOptionByRef(p, section, index);
  return opt ? opt.currentStart : null;
}

/* ---------- Рендер вкладки ---------- */

function renderDevelopmentPlan(p) {
  return `<div class="card">
    <h2>План развития</h2>
    <p class="subtitle" style="margin-top:-8px">
      Цели по навыкам. Текущая оценка подтягивается из «Навыков».
      Для фактов «частично» и «не выполнено» обязателен комментарий.
    </p>
    <div id="development-content"></div>
  </div>`;
}

function renderDevelopmentPlanContent(p) {
  const el = document.getElementById('development-content');
  if (!el) return;

  if (!Array.isArray(p.developmentPlans)) p.developmentPlans = [];

  const rows = p.developmentPlans.map((g, i) => renderDevRow(p, g, i)).join('');
  const stats = computeDevelopmentStats(p);
  const empty = !p.developmentPlans.length;

  el.innerHTML = `
    <div class="btn-row no-print" style="margin-bottom:12px">
      <button class="btn btn-sm" onclick="addDevelopmentGoal('${p.id}')">+ Добавить цель</button>
    </div>
    ${empty
      ? `<div class="empty-state"><div class="big">🎯</div><p>Пока нет целей развития.<br>Нажмите «Добавить цель».</p></div>`
      : `<div style="overflow-x:auto">
           <table class="dev-plan-table">
             <thead>
               <tr>
                 <th style="width:36px">#</th>
                 <th style="min-width:220px">Навык</th>
                 <th style="width:90px">Текущая</th>
                 <th style="width:80px">Цель</th>
                 <th style="width:130px">Срок</th>
                 <th style="min-width:220px">Комплекс(ы)</th>
                 <th style="width:150px">Факт</th>
                 <th style="min-width:180px">Комментарий</th>
                 <th style="width:44px" class="no-print"></th>
               </tr>
             </thead>
             <tbody>${rows}</tbody>
           </table>
         </div>`
    }
    ${renderDevelopmentSummaryBlock(stats)}
  `;
}

function renderDevRow(p, g, i) {
  const skillOpt = getSkillOptionByRef(p, g.section, g.index);
  const curStart = skillOpt ? skillOpt.currentStart : null;

  const optionsHtml = getAllSkillOptions(p).map(opt => {
    const sel = (opt.section === g.section && opt.index === g.index) ? 'selected' : '';
    return `<option value="${opt.section}:${opt.index}" ${sel}>${escapeHtml(opt.label)}</option>`;
  }).join('');

  const curVal = (curStart != null && curStart !== '') ? curStart : '—';
  const targetVal = (g.target != null && g.target !== '') ? g.target : '';
  const deadlineVal = g.deadline || '';

  const complexes = Array.isArray(g.complexes) ? g.complexes : [];
  const complexesShort = complexes.length
    ? complexes.slice(0, 2).join(', ') + (complexes.length > 2 ? ` +${complexes.length - 2}` : '')
    : '— не выбрано —';

  const factOptions = FACT_OPTIONS.map(f => {
    const sel = (f.value === (g.fact || '')) ? 'selected' : '';
    return `<option value="${f.value}" ${sel}>${f.label}</option>`;
  }).join('');

  const needComment = (g.fact === 'partial' || g.fact === 'notdone');
  const factCls = factClass(g.fact);

  return `<tr data-dev-idx="${i}">
    <td style="text-align:center;font-weight:900;color:var(--ak-red);font-family:var(--font-display)">${i + 1}</td>

    <td>
      <select class="cell dev-skill" onchange="onDevSkillChange('${p.id}',${i},this.value)">
        <option value="">— выберите навык —</option>
        ${optionsHtml}
      </select>
    </td>

    <td class="dev-current">${escapeHtml(String(curVal))}</td>

    <td>
      <input class="cell" type="number" min="1" max="10" value="${escapeAttr(String(targetVal))}"
             onchange="onDevTargetChange('${p.id}',${i},this.value)">
    </td>

    <td>
      <input class="cell" type="date" value="${escapeAttr(deadlineVal)}"
             onchange="onDevDeadlineChange('${p.id}',${i},this.value)">
    </td>

    <td>
      <div class="dev-plan-cell" id="dev-cell-${i}">
        <button type="button" class="dev-complexes-btn"
                onclick="toggleDevComplexesPopover(event, '${p.id}', ${i})">
          <span class="dev-complexes-text">${escapeHtml(complexesShort)}</span>
          <span class="dev-complexes-caret">▾</span>
        </button>
      </div>
    </td>

    <td>
      <select class="cell pcs-fact ${factCls}" onchange="onDevFactChange('${p.id}',${i},this.value)">
        ${factOptions}
      </select>
    </td>

    <td>
      <input class="cell dev-comment ${needComment ? 'required' : ''}"
             type="text"
             placeholder="${needComment ? 'Обязательно' : '—'}"
             value="${escapeAttr(g.comment || '')}"
             onchange="onDevCommentChange('${p.id}',${i},this.value)">
    </td>

    <td class="no-print" style="text-align:center">
      <button class="btn-icon red" title="Удалить цель" onclick="removeDevelopmentGoal('${p.id}',${i})">🗑</button>
    </td>
  </tr>`;
}

/* ---------- CRUD целей ---------- */

function addDevelopmentGoal(pid) {
  const p = DB.players.find(x => x.id === pid);
  if (!p) return;
  if (!Array.isArray(p.developmentPlans)) p.developmentPlans = [];
  p.developmentPlans.push({
    id: uid('dp'),
    section: '',
    index: -1,
    skillLabel: '',
    target: '',
    deadline: '',
    complexes: [],
    fact: '',
    comment: ''
  });
  saveDB();
  renderDevelopmentPlanContent(p);
}

function removeDevelopmentGoal(pid, idx) {
  const p = DB.players.find(x => x.id === pid);
  if (!p || !Array.isArray(p.developmentPlans)) return;
  if (!confirm('Удалить цель развития?')) return;
  p.developmentPlans.splice(idx, 1);
  saveDB();
  renderDevelopmentPlanContent(p);
}

function onDevSkillChange(pid, idx, value) {
  const p = DB.players.find(x => x.id === pid);
  const g = p && p.developmentPlans ? p.developmentPlans[idx] : null;
  if (!g) return;
  if (!value) {
    g.section = '';
    g.index = -1;
    g.skillLabel = '';
  } else {
    const [section, indexStr] = value.split(':');
    const index = parseInt(indexStr, 10);
    g.section = section;
    g.index = index;
    const opt = getSkillOptionByRef(p, section, index);
    g.skillLabel = opt ? opt.label : '';
  }
  saveDB();
  renderDevelopmentPlanContent(p);
}

function onDevTargetChange(pid, idx, value) {
  const p = DB.players.find(x => x.id === pid);
  const g = p && p.developmentPlans ? p.developmentPlans[idx] : null;
  if (!g) return;
  const n = value === '' ? '' : Number(value);
  if (n !== '' && (isNaN(n) || n < 1 || n > 10)) {
    alert('Цель должна быть числом от 1 до 10');
    renderDevelopmentPlanContent(p);
    return;
  }
  const cur = getCurrentSkillStart(p, g.section, g.index);
  if (n !== '' && cur != null && cur !== '' && Number(n) < Number(cur)) {
    if (!confirm(`Цель (${n}) меньше текущей оценки (${cur}). Всё равно сохранить?`)) {
      renderDevelopmentPlanContent(p);
      return;
    }
  }
  g.target = n;
  saveDB();
}

function onDevDeadlineChange(pid, idx, value) {
  const p = DB.players.find(x => x.id === pid);
  const g = p && p.developmentPlans ? p.developmentPlans[idx] : null;
  if (!g) return;
  g.deadline = value || '';
  saveDB();
}

function onDevFactChange(pid, idx, value) {
  const p = DB.players.find(x => x.id === pid);
  const g = p && p.developmentPlans ? p.developmentPlans[idx] : null;
  if (!g) return;
  g.fact = value || '';
  if (g.fact !== 'partial' && g.fact !== 'notdone') g.comment = '';
  saveDB();
  renderDevelopmentPlanContent(p);
}

function onDevCommentChange(pid, idx, value) {
  const p = DB.players.find(x => x.id === pid);
  const g = p && p.developmentPlans ? p.developmentPlans[idx] : null;
  if (!g) return;
  const v = (value || '').trim();
  if ((g.fact === 'partial' || g.fact === 'notdone') && !v) {
    alert('Для «частично» и «не выполнено» комментарий обязателен');
    renderDevelopmentPlanContent(p);
    return;
  }
  g.comment = v;
  saveDB();
}

/* ============================================================
   ПОПОВЕР КОМПЛЕКСОВ
   Читает список комплексов из двухуровневого справочника.
   ============================================================ */

let __devPopoverState = { pid: null, idx: null };

/* Возвращает список "полных" имён комплексов для поповера.
   Логика такая же, как в getAllBlockNames() (11-dashboard-calendar.js). */
function getComplexesForPicker() {
  if (typeof flattenSubgroups !== 'function') {
    if (!Array.isArray(DB.exercises)) return [];
    return DB.exercises.map(g => g.group || g.name || '').filter(Boolean);
  }
  const list = flattenSubgroups();
  const names = list.map(x => {
    if (x.parentName && x.subgroupName && x.parentName === x.subgroupName) return x.subgroupName;
    if (x.parentName && x.subgroupName && x.subgroupName.toLowerCase().startsWith(x.parentName.toLowerCase())) {
      return x.subgroupName;
    }
    return (x.parentName ? x.parentName + ' · ' : '') + x.subgroupName;
  });
  return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b, 'ru'));
}

function toggleDevComplexesPopover(event, pid, idx) {
  if (event) event.stopPropagation();

  const existing = document.getElementById('dev-pop-global');
  if (existing && __devPopoverState.pid === pid && __devPopoverState.idx === idx) {
    closeDevComplexesPopover();
    return;
  }
  closeDevComplexesPopover();

  __devPopoverState = { pid, idx };

  const p = DB.players.find(x => x.id === pid);
  const g = p && p.developmentPlans ? p.developmentPlans[idx] : null;
  if (!g) return;
  const complexes = Array.isArray(g.complexes) ? g.complexes : [];

  const cell = document.getElementById('dev-cell-' + idx);
  const btn = cell ? cell.querySelector('.dev-complexes-btn') : null;
  if (!btn) return;
  const rect = btn.getBoundingClientRect();

  const options = getComplexesForPicker();

  const pop = document.createElement('div');
  pop.className = 'cc-popover cc-popover-fixed';
  pop.id = 'dev-pop-global';
  pop.setAttribute('data-dev-idx', idx);
  pop.onclick = e => e.stopPropagation();
  pop.innerHTML = `
    <div class="cc-popover-head">
      <span>Выберите комплексы</span>
      <span class="cc-popover-count" id="dev-pop-count">${complexes.length}</span>
    </div>
    <div class="cc-popover-tools">
      <input type="text" class="cc-popover-search" placeholder="Поиск…"
             oninput="filterDevComplexes(this.value)">
      <button type="button" onclick="devComplexesSelectAll(true)">Все</button>
      <button type="button" onclick="devComplexesSelectAll(false)">Никто</button>
    </div>
    <div class="cc-popover-body" id="dev-pop-body">
      ${options.length
        ? options.map(name => {
            const checked = complexes.includes(name) ? 'checked' : '';
            return `<label data-group="${escapeAttr(name.toLowerCase())}">
              <input type="checkbox" value="${escapeAttr(name)}" ${checked}
                     onchange="onDevComplexToggle(this.value, this.checked)">
              <span>${escapeHtml(name)}</span>
            </label>`;
          }).join('')
        : '<div class="cc-popover-empty">Справочник упражнений пуст</div>'}
    </div>
    <div class="cc-popover-foot">
      <button type="button" class="btn btn-sm" onclick="closeDevComplexesPopover()">Готово</button>
    </div>
  `;
  document.body.appendChild(pop);

  const popW = 340;
  const popH = pop.offsetHeight || 380;
  const margin = 8;
  const viewportH = window.innerHeight;
  const viewportW = window.innerWidth;

  let left = rect.left;
  let top = rect.bottom + 6;

  if (left + popW + margin > viewportW) left = viewportW - popW - margin;
  if (left < margin) left = margin;

  if (top + popH + margin > viewportH && rect.top - popH - 6 > margin) {
    top = rect.top - popH - 6;
  }
  if (top + popH + margin > viewportH) {
    top = Math.max(margin, viewportH - popH - margin);
  }

  pop.style.left = left + 'px';
  pop.style.top = top + 'px';
  pop.style.width = popW + 'px';

  const search = pop.querySelector('.cc-popover-search');
  if (search) {
    search.value = '';
    filterDevComplexes('');
    setTimeout(() => search.focus(), 20);
  }

  setTimeout(() => {
    document.addEventListener('click', onDocClickCloseDevPopover);
    document.addEventListener('keydown', onEscCloseDevPopover);
  }, 0);
}

function onDocClickCloseDevPopover(e) {
  const pop = document.getElementById('dev-pop-global');
  if (!pop) return;
  if (pop.contains(e.target)) return;
  if (e.target.closest && e.target.closest('.dev-complexes-btn')) return;
  closeDevComplexesPopover();
}

function onEscCloseDevPopover(e) {
  if (e.key === 'Escape') closeDevComplexesPopover();
}

function closeDevComplexesPopover() {
  const pop = document.getElementById('dev-pop-global');
  if (pop) pop.remove();
  __devPopoverState = { pid: null, idx: null };
  document.removeEventListener('click', onDocClickCloseDevPopover);
  document.removeEventListener('keydown', onEscCloseDevPopover);
}

function filterDevComplexes(query) {
  const body = document.getElementById('dev-pop-body');
  if (!body) return;
  const q = (query || '').trim().toLowerCase();
  body.querySelectorAll('label').forEach(lbl => {
    const g = (lbl.dataset.group || '').toLowerCase();
    lbl.style.display = (!q || g.includes(q)) ? 'flex' : 'none';
  });
}

function devComplexesSelectAll(checked) {
  const { pid, idx } = __devPopoverState;
  const p = DB.players.find(x => x.id === pid);
  const g = p && p.developmentPlans ? p.developmentPlans[idx] : null;
  if (!g) return;
  const body = document.getElementById('dev-pop-body');
  if (!body) return;

  const visible = [];
  body.querySelectorAll('label').forEach(lbl => {
    if (lbl.style.display !== 'none') {
      const cb = lbl.querySelector('input[type=checkbox]');
      if (cb) visible.push(cb.value);
    }
  });

  const set = new Set(g.complexes || []);
  if (checked) visible.forEach(v => set.add(v));
  else visible.forEach(v => set.delete(v));
  g.complexes = Array.from(set);
  saveDB();

  body.querySelectorAll('label').forEach(lbl => {
    const cb = lbl.querySelector('input[type=checkbox]');
    if (cb) cb.checked = g.complexes.includes(cb.value);
  });
  updateDevComplexesButton();
}

function updateDevComplexesButton() {
  const { pid, idx } = __devPopoverState;
  const p = DB.players.find(x => x.id === pid);
  const g = p && p.developmentPlans ? p.developmentPlans[idx] : null;
  if (!g) return;

  const cell = document.getElementById('dev-cell-' + idx);
  if (!cell) return;
  const btn = cell.querySelector('.dev-complexes-text');
  if (btn) {
    const arr = g.complexes || [];
    btn.textContent = arr.length
      ? arr.slice(0, 2).join(', ') + (arr.length > 2 ? ` +${arr.length - 2}` : '')
      : '— не выбрано —';
  }
  const cnt = document.getElementById('dev-pop-count');
  if (cnt) cnt.textContent = (g.complexes || []).length;
}

function onDevComplexToggle(groupName, checked) {
  const { pid, idx } = __devPopoverState;
  const p = DB.players.find(x => x.id === pid);
  const g = p && p.developmentPlans ? p.developmentPlans[idx] : null;
  if (!g) return;
  if (!Array.isArray(g.complexes)) g.complexes = [];
  const set = new Set(g.complexes);
  if (checked) set.add(groupName);
  else set.delete(groupName);
  g.complexes = Array.from(set);
  saveDB();
  updateDevComplexesButton();
}

/* ---------- Сводка по целям ---------- */

function computeDevelopmentStats(p) {
  const plans = (p && p.developmentPlans) ? p.developmentPlans : [];
  const total = plans.length;
  let done = 0, partial = 0, notdone = 0;
  plans.forEach(g => {
    if (g.fact === 'done') done++;
    else if (g.fact === 'partial') partial++;
    else if (g.fact === 'notdone') notdone++;
  });
  const completion = total ? Math.round((done + partial * 0.5) / total * 100) : 0;
  return { total, done, partial, notdone, completion };
}

function renderDevelopmentSummaryBlock(stats) {
  return `
    <div class="plan-summary" style="margin-top:16px">
      <div class="plan-summary-item">
        <div class="lbl">Всего целей</div>
        <div class="val">${stats.total}</div>
      </div>
      <div class="plan-summary-item">
        <div class="lbl">Выполнено</div>
        <div class="val" style="color:#1e7a3f">${stats.done}</div>
      </div>
      <div class="plan-summary-item">
        <div class="lbl">Частично</div>
        <div class="val" style="color:#b8860b">${stats.partial}</div>
      </div>
      <div class="plan-summary-item red">
        <div class="lbl">Не выполнено</div>
        <div class="val">${stats.notdone}</div>
      </div>
      <div class="plan-summary-item red">
        <div class="lbl">% выполнения</div>
        <div class="val">${stats.completion}%</div>
      </div>
    </div>`;
}

/* ============================================================
   ОБЩИЙ ХЕЛПЕР ФАКТА ДЛЯ БЛОКА КАЛЕНДАРЯ
   ============================================================ */

function saveBlockFact(playerId, dateStr, sessionId, blockIndex, fact, comment) {
  const p = DB.players.find(x => x.id === playerId);
  if (!p || !p.calendar || !p.calendar[dateStr]) return false;
  const sess = p.calendar[dateStr].find(x => x.id === sessionId);
  if (!sess || !Array.isArray(sess.blocks)) return false;
  const b = sess.blocks[blockIndex];
  if (!b) return false;
  b.fact = fact || '';
  b.comment = (comment || '').trim();
  saveDB();
  return true;
}