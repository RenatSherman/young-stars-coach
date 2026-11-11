/* ============================================================
   50-player-skills.js
   Вкладка «Навыки» в карточке игрока.
   ============================================================ */

const SKILLS_OPEN = new Set();

/* ============================================================
   Главный рендер
   ============================================================ */

function renderSkillsTab(p) {
  return `<div class="card">
    <div class="flex-between" style="margin-bottom:12px">
      <div>
        <h2 style="margin-bottom:4px">Навыки</h2>
        <p class="subtitle" style="margin:0">Оценки по разделам. Нажмите на раздел, чтобы раскрыть.</p>
      </div>
      <div class="btn-row no-print" style="margin:0">
        <button class="btn btn-sm" id="skills-toggle-all-btn" onclick="toggleAllSkillsAccordions('${p.id}')">Развернуть все</button>
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
        body: renderTechSubtree(p, techGroups),
        renameAction: `event.stopPropagation(); uiAlert('Корневой раздел переименовать нельзя')`,
        addAction: `addTechSubgroup('${p.id}')`
      })}

      ${renderSkillAccordion({
        id: 'phys',
        title: 'Физические',
        count: physCount,
        body: physCount
          ? renderFlatTable(otherByGroup['Физические качества'], p.id, 'phys')
          : '<div class="sk-empty">Нет критериев в этом разделе</div>',
        renameAction: `renameOtherGroup('${p.id}', 'Физические качества')`,
        addAction: `addOtherCriterion('${p.id}', 'Физические качества')`
      })}

      ${renderSkillAccordion({
        id: 'tact',
        title: 'Тактические',
        count: tactCount,
        body: tactCount
          ? renderFlatTable(otherByGroup['Тактические навыки'], p.id, 'tact')
          : '<div class="sk-empty">Нет критериев в этом разделе</div>',
        renameAction: `renameOtherGroup('${p.id}', 'Тактические навыки')`,
        addAction: `addOtherCriterion('${p.id}', 'Тактические навыки')`
      })}

      ${renderSkillAccordion({
        id: 'psih',
        title: 'Психологические',
        count: psihCount,
        body: psihCount
          ? renderFlatTable(otherByGroup['Психологические характеристики'], p.id, 'psih')
          : '<div class="sk-empty">Нет критериев в этом разделе</div>',
        renameAction: `renameOtherGroup('${p.id}', 'Психологические характеристики')`,
        addAction: `addOtherCriterion('${p.id}', 'Психологические характеристики')`
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

/* ============================================================
   Аккордеон
   ============================================================ */

function renderSkillAccordion({ id, title, count, body, level = 1, renameAction = null, addAction = null }) {
  const isOpen = SKILLS_OPEN.has(id);
  const levelCls = 'sk-level-' + level;

  const renameBtn = renameAction
    ? `<button type="button" class="btn-icon" title="Переименовать" onclick="event.stopPropagation(); ${renameAction}">✎</button>`
    : '';
  const addBtn = addAction
    ? `<button type="button" class="btn-icon" title="Добавить" onclick="event.stopPropagation(); ${addAction}">➕</button>`
    : '';

  const hasActions = renameBtn || addBtn;

  return `<div class="sk-acc ${levelCls} ${isOpen ? 'open' : ''}" data-sk-id="${escapeAttr(id)}">
    <div class="sk-acc-head-wrap" style="background: #f8f9fa; border-bottom: 1px solid transparent; overflow: hidden; display: block;">
      <button type="button" class="sk-acc-head" onclick="toggleSkillsAccordion('${escapeAttr(id)}')" style="float: left; width: calc(100% - ${hasActions ? '100px' : '10px'}); background: transparent; border: none; text-align: left; padding: 12px 14px; cursor: pointer; display: flex; align-items: center; gap: 10px; font-family: inherit;">
        <span class="sk-acc-arrow" style="font-size: 10px; color: var(--ak-gray-dark); transition: transform 0.2s; flex-shrink: 0;">▶</span>
        <span class="sk-acc-title" style="font-weight: 700; font-size: 14px; color: var(--ak-green); flex: 1;">${escapeHtml(title)}</span>
        <span class="sk-acc-count" style="font-size: 11px; font-weight: 900; color: var(--ak-gray-dark); background: var(--ak-gray-mid); padding: 2px 8px; border-radius: 10px; flex-shrink: 0;">${count}</span>
      </button>
      ${hasActions ? `<div class="sk-acc-actions no-print" style="float: right; display: flex; align-items: center; gap: 4px; padding: 12px 14px 12px 0; height: 100%;">
        ${renameBtn}${addBtn}
      </div>` : ''}
    </div>
    <div class="sk-acc-body" style="display: ${isOpen ? 'block' : 'none'}; background: #fff;">
      <div class="sk-acc-inner" style="padding: 14px;">${body}</div>
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
    const safeSub = escapeAttr(subName).replace(/'/g, "\\'");
    return renderSkillAccordion({
      id,
      title: subName,
      count: rows.length,
      body: table,
      level: 2,
      renameAction: `renameTechSubgroup('${p.id}', '${safeSub}')`,
      addAction: `addTechCriterion('${p.id}', '${safeSub}')`
    });
  }).join('');
}

function renderGroupedTechTable(rows, pid, subName) {
  if (!rows.length) return '<div class="sk-empty">Пусто</div>';

  const html = rows.map((r, i) => {
    const globalIdx = findTechIndex(pid, r);
    return `<tr>
      <td style="text-align:center;color:var(--ak-gray-dark);font-weight:900;font-family:var(--font-display)">${i + 1}</td>
      <td>${escapeHtml(r.name)}</td>
      <td><input class="cell sk-cell" type="number" min="1" max="10" value="${r.start ?? ''}" onchange="updateTech('${pid}',${globalIdx},'start',this.value)"></td>
      <td><input class="cell sk-cell" type="number" min="1" max="10" value="${r.mid ?? ''}" onchange="updateTech('${pid}',${globalIdx},'mid',this.value)"></td>
      <td><input class="cell sk-cell" type="number" min="1" max="10" value="${r.end ?? ''}" onchange="updateTech('${pid}',${globalIdx},'end',this.value)"></td>
      <td class="no-print" style="text-align:center;white-space:nowrap;">
        <button type="button" class="btn-icon" title="Редактировать" onclick="editTechName('${pid}',${globalIdx})">✎</button>
        <button type="button" class="btn-icon red" title="Удалить" onclick="deleteTechCriterion('${pid}', '${globalIdx}')">🗑</button>
      </td>
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
          <th style="width:60px" class="no-print"></th>
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
      <td>
        ${r.sub ? `<div class="sk-sub" style="margin-bottom:4px;">${escapeHtml(r.sub)}</div>` : ''}
        <span>${escapeHtml(r.name)}</span>
      </td>
      <td><input class="cell sk-cell" type="number" min="1" max="10" value="${r.start ?? ''}" onchange="updateOther('${pid}',${globalIdx},'start',this.value)"></td>
      <td><input class="cell sk-cell" type="number" min="1" max="10" value="${r.plan ?? ''}" onchange="updateOther('${pid}',${globalIdx},'plan',this.value)"></td>
      <td><input class="cell sk-cell" type="number" min="1" max="10" value="${r.fact ?? ''}" onchange="updateOther('${pid}',${globalIdx},'fact',this.value)"></td>
      <td class="no-print" style="text-align:center;white-space:nowrap;">
        <button type="button" class="btn-icon" title="Редактировать" onclick="editOtherRow('${pid}',${globalIdx})">✎</button>
        <button type="button" class="btn-icon red" title="Удалить" onclick="deleteOtherCriterion('${pid}', '${globalIdx}')">🗑</button>
      </td>
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
          <th style="width:60px" class="no-print"></th>
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

/* ============================================================
   Toggle
   ============================================================ */

function toggleSkillsAccordion(id) {
  if (SKILLS_OPEN.has(id)) SKILLS_OPEN.delete(id);
  else SKILLS_OPEN.add(id);
  const el = document.querySelector(`.sk-acc[data-sk-id="${CSS.escape(id)}"]`);
  if (el) {
    el.classList.toggle('open', SKILLS_OPEN.has(id));
    const body = el.querySelector('.sk-acc-body');
    if (body) body.style.display = SKILLS_OPEN.has(id) ? 'block' : 'none';
    const arrow = el.querySelector('.sk-acc-arrow');
    if (arrow) arrow.style.transform = SKILLS_OPEN.has(id) ? 'rotate(90deg)' : 'rotate(0deg)';
  }
  updateSkillsToggleAllBtn(null);
}

function toggleAllSkillsAccordions(pid) {
  const p = DB.players.find(x => x.id === pid);
  if (!p) return;

  const ids = collectAllSkillIds(p);
  const allOpen = ids.length && ids.every(id => SKILLS_OPEN.has(id));

  if (allOpen) SKILLS_OPEN.clear();
  else ids.forEach(id => SKILLS_OPEN.add(id));

  document.querySelectorAll('.sk-acc').forEach(el => {
    const id = el.dataset.skId;
    const isOpenNow = SKILLS_OPEN.has(id);
    el.classList.toggle('open', isOpenNow);
    const body = el.querySelector('.sk-acc-body');
    if (body) body.style.display = isOpenNow ? 'block' : 'none';
    const arrow = el.querySelector('.sk-acc-arrow');
    if (arrow) arrow.style.transform = isOpenNow ? 'rotate(90deg)' : 'rotate(0deg)';
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
   Удаление критериев (ТОЛЬКО В ТЕКУЩЕМ СЕЗОНЕ)
   ============================================================ */

function deleteTechCriterion(pid, idx) {
  const p = DB.players.find(x => x.id === pid);
  if (!p || !p.techDetail || !p.techDetail[idx]) return;
  const r = p.techDetail[idx];

  uiConfirm(
    `Удалить навык «${r.name}»?\n\nВНИМАНИЕ: Навык и все оценки по нему будут удалены у ВСЕХ игроков ТЕКУЩЕГО СЕЗОНА. В архивных сезонах данные сохранятся.`,
    () => {
      let affected = 0;
      DB.players.forEach(player => {
        if (!Array.isArray(player.techDetail)) return;
        const initialLen = player.techDetail.length;
        player.techDetail = player.techDetail.filter(item => !(item.sub === r.sub && item.name === r.name));
        if (player.techDetail.length < initialLen) affected++;
      });

      if (affected > 0) {
        touchMeta('players');
        saveDB();
        renderPlayerCard(p);
        toast(`Навык удалён в текущем сезоне (затронуто игроков: ${affected})`);
      }
    },
    () => {}
  );
}

function deleteOtherCriterion(pid, idx) {
  const p = DB.players.find(x => x.id === pid);
  if (!p || !p.otherDetail || !p.otherDetail[idx]) return;
  const r = p.otherDetail[idx];

  uiConfirm(
    `Удалить критерий «${r.name}»?\n\nВНИМАНИЕ: Критерий и все оценки по нему будут удалены у ВСЕХ игроков ТЕКУЩЕГО СЕЗОНА. В архивных сезонах данные сохранятся.`,
    () => {
      let affected = 0;
      DB.players.forEach(player => {
        if (!Array.isArray(player.otherDetail)) return;
        const initialLen = player.otherDetail.length;
        player.otherDetail = player.otherDetail.filter(item => !(item.group === r.group && item.name === r.name));
        if (player.otherDetail.length < initialLen) affected++;
      });

      if (affected > 0) {
        touchMeta('players');
        saveDB();
        renderPlayerCard(p);
        toast(`Критерий удалён в текущем сезоне (затронуто игроков: ${affected})`);
      }
    },
    () => {}
  );
}

/* ============================================================
   СИНХРОНИЗАЦИЯ СТРУКТУРЫ (ХЕЛПЕРЫ)
   ============================================================ */

// Прокатывает структуру techDetail от игрока-эталона по всем остальным в текущем сезоне.
// Сохраняет оценки по индексу (если навык не удалён).
function syncTechStructure(sourcePlayer) {
  const newStructure = sourcePlayer.techDetail || [];
  
  DB.players.forEach(p => {
    if (p.id === sourcePlayer.id) return; // пропускаем эталон

    const oldMap = {};
    (p.techDetail || []).forEach((item, i) => {
      oldMap[item.sub + '|||' + item.name] = item;
    });

    p.techDetail = newStructure.map(item => {
      const key = item.sub + '|||' + item.name;
      const existing = oldMap[key];
      return {
        group: item.group,
        sub: item.sub,
        name: item.name,
        start: existing ? existing.start : null,
        mid: existing ? existing.mid : null,
        end: existing ? existing.end : null
      };
    });
  });
}

// Аналогично для otherDetail
function syncOtherStructure(sourcePlayer) {
  const newStructure = sourcePlayer.otherDetail || [];
  
  DB.players.forEach(p => {
    if (p.id === sourcePlayer.id) return;

    const oldMap = {};
    (p.otherDetail || []).forEach((item, i) => {
      oldMap[item.group + '|||' + item.name] = item;
    });

    p.otherDetail = newStructure.map(item => {
      const key = item.group + '|||' + item.name;
      const existing = oldMap[key];
      return {
        group: item.group,
        sub: item.sub || '',
        name: item.name,
        start: existing ? existing.start : null,
        plan: existing ? existing.plan : null,
        fact: existing ? existing.fact : null
      };
    });
  });
}

/* ============================================================
   Модалка для редактирования критериев
   ============================================================ */

function editTechName(pid, idx) {
  const p = DB.players.find(x => x.id === pid);
  if (!p || !p.techDetail || !p.techDetail[idx]) return;

  const oldItem = p.techDetail[idx];
  const oldName = oldItem.name;
  const subName = oldItem.sub;

  uiPrompt(
    'Введите новое название критерия:',
    oldName,
    (newName) => {
      const trimmed = (newName || '').trim();
      if (!trimmed || trimmed === oldName) return;

      // 1. Меняем в эталоне
      p.techDetail[idx].name = trimmed;

      // 2. Синхронизируем структуру со всеми
      syncTechStructure(p);

      touchMeta('players');
      saveDB();
      renderPlayerCard(p);
    },
    () => {},
    { title: 'Редактировать критерий', okLabel: 'Сохранить' }
  );
}

function editOtherRow(pid, idx) {
  const p = DB.players.find(x => x.id === pid);
  if (!p || !p.otherDetail || !p.otherDetail[idx]) return;
  const oldItem = p.otherDetail[idx];

  openModal(`
    <h3>Редактировать критерий</h3>
    <div class="field">
      <label>Подраздел</label>
      <input type="text" id="edit-sub-${idx}" value="${escapeAttr(oldItem.sub || '')}" placeholder="Оставьте пустым, если не нужен">
    </div>
    <div class="field">
      <label>Критерий</label>
      <input type="text" id="edit-name-${idx}" value="${escapeAttr(oldItem.name || '')}" autofocus>
    </div>
    <div class="btn-row" style="margin-top:16px">
      <button class="btn" onclick="saveOtherRow('${pid}', ${idx})">Сохранить</button>
      <button class="btn" onclick="closeModal()">Отмена</button>
    </div>
  `);
}

function saveOtherRow(pid, idx) {
  const p = DB.players.find(x => x.id === pid);
  if (!p || !p.otherDetail || !p.otherDetail[idx]) return;

  const subInput = document.getElementById(`edit-sub-${idx}`);
  const nameInput = document.getElementById(`edit-name-${idx}`);
  if (!subInput || !nameInput) return;

  const newSub = subInput.value.trim();
  const newName = nameInput.value.trim();

  if (!newName) {
    uiAlert('Название критерия не может быть пустым.');
    return;
  }

  // 1. Меняем в эталоне
  p.otherDetail[idx].sub = newSub;
  p.otherDetail[idx].name = newName;

  // 2. Синхронизируем структуру
  syncOtherStructure(p);

  touchMeta('players');
  saveDB();
  closeModal();
  renderPlayerCard(p);
}

/* ============================================================
   Переименование разделов / добавление
   ============================================================ */

function renameTechSubgroup(pid, oldSub) {
  const p = DB.players.find(x => x.id === pid);
  if (!p) return;

  uiPrompt(
    `Переименовать подраздел «${oldSub}».\nНовое название будет применено ко всем игрокам текущего сезона.`,
    oldSub,
    (newName) => {
      const trimmed = (newName || '').trim();
      if (!trimmed || trimmed === oldSub) return;
      
      const hasExisting = (p.techDetail || []).some(r => r.sub === trimmed);
      if (hasExisting) {
        uiConfirm(
          `У игрока уже есть подраздел «${trimmed}». Объединить с ним?`,
          () => { 
            p.techDetail.forEach(r => { if (r.sub === oldSub) r.sub = trimmed; });
            syncTechStructure(p);
            touchMeta('players'); saveDB(); renderPlayerCard(p);
          },
          () => {}
        );
        return;
      }
      
      p.techDetail.forEach(r => { if (r.sub === oldSub) r.sub = trimmed; });
      syncTechStructure(p);
      touchMeta('players');
      saveDB();
      renderPlayerCard(p);
    },
    () => {},
    { title: 'Переименовать подраздел', placeholder: oldSub, okLabel: 'Переименовать' }
  );
}

function renameOtherGroup(pid, oldGroup) {
  const p = DB.players.find(x => x.id === pid);
  if (!p) return;

  uiPrompt(
    `Переименовать раздел «${oldGroup}».\nНовое название будет применено ко всем игрокам текущего сезона.`,
    oldGroup,
    (newName) => {
      const trimmed = (newName || '').trim();
      if (!trimmed || trimmed === oldGroup) return;
      
      const hasExisting = (p.otherDetail || []).some(r => r.group === trimmed);
      if (hasExisting) {
        uiConfirm(
          `У игрока уже есть раздел «${trimmed}». Объединить с ним?`,
          () => { 
            p.otherDetail.forEach(r => { if (r.group === oldGroup) r.group = trimmed; });
            syncOtherStructure(p);
            touchMeta('players'); saveDB(); renderPlayerCard(p);
          },
          () => {}
        );
        return;
      }

      p.otherDetail.forEach(r => { if (r.group === oldGroup) r.group = trimmed; });
      syncOtherStructure(p);
      touchMeta('players');
      saveDB();
      renderPlayerCard(p);
    },
    () => {},
    { title: 'Переименовать раздел', placeholder: oldGroup, okLabel: 'Переименовать' }
  );
}

function addTechSubgroup(pid) {
  const p = DB.players.find(x => x.id === pid);
  if (!p) return;

  uiPrompt(
    'Название нового подраздела техники (например: «Вбрасывание»).\nБудет добавлено ко всем игрокам текущего сезона.',
    '',
    (newName) => {
      const trimmed = (newName || '').trim();
      if (!trimmed) return;

      const hasExisting = (p.techDetail || []).some(r => r.sub === trimmed);
      if (hasExisting) { uiAlert(`Подраздел «${trimmed}» уже существует.`); return; }

      p.techDetail.push({
        group: 'Катание',
        sub: trimmed,
        name: 'Новый навык',
        start: null, mid: null, end: null
      });
      syncTechStructure(p);

      touchMeta('players');
      saveDB();
      SKILLS_OPEN.add('tech:' + trimmed);
      renderPlayerCard(p);
      toast(`Подраздел «${trimmed}» добавлен`);
    },
    () => {},
    { title: 'Новый подраздел', placeholder: 'Вбрасывание', okLabel: 'Создать' }
  );
}

function addTechCriterion(pid, subName) {
  const p = DB.players.find(x => x.id === pid);
  if (!p) return;

  uiPrompt(
    `Название нового навыка в подразделе «${subName}».\nБудет добавлено всем игрокам текущего сезона.`,
    '',
    (newName) => {
      const trimmed = (newName || '').trim();
      if (!trimmed) return;

      const hasExisting = (p.techDetail || []).some(r => r.sub === subName && r.name === trimmed);
      if (hasExisting) { uiAlert(`Навык «${trimmed}» уже существует в этом подразделе.`); return; }

      const existing = p.techDetail.find(r => r.sub === subName);
      const group = existing ? existing.group : 'Катание';
      
      p.techDetail.push({
        group: group,
        sub: subName,
        name: trimmed,
        start: null, mid: null, end: null
      });
      syncTechStructure(p);

      touchMeta('players');
      saveDB();
      renderPlayerCard(p);
      toast(`Навык «${trimmed}» добавлен`);
    },
    () => {},
    { title: 'Новый навык', placeholder: 'Например: Виражи спиной', okLabel: 'Создать' }
  );
}

function addOtherCriterion(pid, groupName) {
  const p = DB.players.find(x => x.id === pid);
  if (!p) return;

  uiPrompt(
    `Название нового критерия в разделе «${groupName}».\nБудет добавлено всем игрокам текущего сезона.`,
    '',
    (newName) => {
      const trimmed = (newName || '').trim();
      if (!trimmed) return;

      const hasExisting = (p.otherDetail || []).some(r => r.group === groupName && r.name === trimmed);
      if (hasExisting) { uiAlert(`Критерий «${trimmed}» уже существует в этом разделе.`); return; }

      uiPrompt(
        'Укажите подраздел (или оставьте пустым):',
        '',
        (subName) => {
          const finalSub = (subName || '').trim();
          
          p.otherDetail.push({
            group: groupName,
            sub: finalSub,
            name: trimmed,
            start: null, plan: null, fact: null
          });
          syncOtherStructure(p);

          touchMeta('players');
          saveDB();
          renderPlayerCard(p);
          toast(`Критерий «${trimmed}» добавлен`);
        },
        () => {},
        { title: 'Подраздел', placeholder: 'Необязательно', okLabel: 'Добавить' }
      );
    },
    () => {},
    { title: 'Новый критерий', placeholder: 'Например: Игровое мышление', okLabel: 'Далее' }
  );
}

/* ============================================================
   Обновление оценок
   ============================================================ */

function updateTech(pid, i, f, v) {
  const p = DB.players.find(x => x.id === pid);
  if (!p || !p.techDetail || !p.techDetail[i]) return;
  p.techDetail[i][f] = v === '' ? null : Number(v);
  touchMeta('players'); // <--- ДОБАВЛЕНО: критически важно для синхронизации
  saveDB();
  refreshProfile(pid);
}

function updateOther(pid, i, f, v) {
  const p = DB.players.find(x => x.id === pid);
  if (!p || !p.otherDetail || !p.otherDetail[i]) return;
  p.otherDetail[i][f] = v === '' ? null : Number(v);
  touchMeta('players'); // <--- ДОБАВЛЕНО: критически важно для синхронизации
  saveDB();
  refreshProfile(pid);
}