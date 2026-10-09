/* ============================================================
   07-calendar.js
   Справочник упражнений (двухуровневое дерево):

   БОЛЬШАЯ ГРУППА      → «Посадка», «Отталкивания», «Броски»
     └── МИНИ-ГРУППА   → «Посадка 1», «Посадка 2»
           └── УПРАЖНЕНИЯ

   Возможности:
   - создание / переименование / удаление больших групп
   - порядок больших групп ▲ ▼
   - создание / переименование / удаление мини-групп
   - порядок мини-групп внутри больших ▲ ▼
   - перемещение мини-группы между большими группами ↔
   - упражнения: добавить / переименовать / удалить / ссылка
   - порядок упражнений внутри мини-группы ▲ ▼
   - перемещение упражнения между мини-группами ↔

   Защита: если справочник пришёл в старом (плоском) формате —
   миграция сработает автоматически при первом рендере.
   ============================================================ */

/* ===== Состояние UI ===== */

const __exOpenParents = new Set();
const __exOpenSubgroups = new Set();

/* ===== Главный рендер ===== */

function renderExercises() {
  const el = document.getElementById('exercises-list');
  if (!el) return;

  // ЗАЩИТА: если справочник пришёл в старом формате — мигрируем на лету
  if (Array.isArray(DB.exercises) && DB.exercises.length) {
    const first = DB.exercises[0];
    const isOld =
      first &&
      typeof first.group === 'string' &&
      typeof first.name !== 'string' &&
      Array.isArray(first.items);
    if (isOld && typeof migrateAllExercises === 'function') {
      migrateAllExercises();
    }
  }

  if (!Array.isArray(DB.exercises) || !DB.exercises.length) {
    el.innerHTML = '<div class="empty-state"><div class="big">📋</div><p>Справочник пуст.<br>Нажмите «+ Большая группа», чтобы создать первую.</p></div>';
    updateToggleAllBtn();
    return;
  }

  el.innerHTML = DB.exercises.map((parent, pi) => renderParent(parent, pi)).join('');
  updateToggleAllBtn();
}

/* ===== Большая группа ===== */

function renderParent(parent, pi) {
  const isOpen = __exOpenParents.has(parent.id);
  const subgroups = Array.isArray(parent.subgroups) ? parent.subgroups : [];
  const totalItems = subgroups.reduce((acc, sg) => acc + (sg.items ? sg.items.length : 0), 0);
  const isFirst = pi === 0;
  const isLast = pi === DB.exercises.length - 1;

  const subsHtml = isOpen
    ? subgroups.map((sg, si) => renderSubgroup(parent, sg, si)).join('')
    : '';

  return `<div class="ex-parent ${isOpen ? 'open' : ''}" data-parent-id="${escapeAttr(parent.id)}">
    <div class="ex-parent-head">
      <button type="button" class="ex-parent-toggle" onclick="toggleExParent('${parent.id}')">
        <span class="ex-parent-arrow">▶</span>
        <span class="ex-parent-name">${escapeHtml(parent.name)}</span>
        <span class="ex-parent-count">${subgroups.length} ${plural(subgroups.length, 'подгруппа', 'подгруппы', 'подгрупп')} · ${totalItems} ${plural(totalItems, 'упр.', 'упр.', 'упр.')}</span>
      </button>

      <div class="ex-parent-actions no-print">
        <button class="btn-icon" title="Выше" ${isFirst ? 'disabled' : ''} onclick="moveParentUp('${parent.id}')">▲</button>
        <button class="btn-icon" title="Ниже" ${isLast ? 'disabled' : ''} onclick="moveParentDown('${parent.id}')">▼</button>
        <button class="btn-icon" title="Переименовать" onclick="renameParent('${parent.id}')">✎</button>
        <button class="btn-icon" title="Добавить подгруппу" onclick="addSubgroup('${parent.id}')">+</button>
        <button class="btn-icon red" title="Удалить большую группу" onclick="deleteParent('${parent.id}')">🗑</button>
      </div>
    </div>

    ${isOpen
      ? `<div class="ex-parent-body">
           ${subsHtml || '<div class="ex-empty">В большой группе пока нет подгрупп</div>'}
           <div class="ex-parent-footer no-print">
             <button class="btn btn-sm" onclick="addSubgroup('${parent.id}')">+ Добавить подгруппу</button>
           </div>
         </div>`
      : ''}
  </div>`;
}

/* ===== Мини-группа ===== */

function renderSubgroup(parent, sg, si) {
  const isOpen = __exOpenSubgroups.has(sg.id);
  const items = Array.isArray(sg.items) ? sg.items : [];
  const isFirst = si === 0;
  const isLast = si === parent.subgroups.length - 1;

  const itemsHtml = isOpen
    ? items.map((it, i) => renderItem(sg, it, i)).join('')
    : '';

  return `<div class="ex-sub ${isOpen ? 'open' : ''}" data-sub-id="${escapeAttr(sg.id)}">
    <div class="ex-sub-head">
      <button type="button" class="ex-sub-toggle" onclick="toggleExSubgroup('${sg.id}')">
        <span class="ex-sub-arrow">▶</span>
        <span class="ex-sub-name">${escapeHtml(sg.name)}</span>
        <span class="ex-sub-count">${items.length}</span>
      </button>

      <div class="ex-sub-actions no-print">
        <button class="btn-icon" title="Выше" ${isFirst ? 'disabled' : ''} onclick="moveSubgroupUp('${parent.id}','${sg.id}')">▲</button>
        <button class="btn-icon" title="Ниже" ${isLast ? 'disabled' : ''} onclick="moveSubgroupDown('${parent.id}','${sg.id}')">▼</button>
        <button class="btn-icon" title="Переместить в другую большую группу" onclick="openMoveSubgroupModal('${sg.id}')">↔</button>
        <button class="btn-icon" title="Переименовать" onclick="renameSubgroup('${sg.id}')">✎</button>
        <button class="btn-icon" title="Добавить упражнение" onclick="addExercise('${sg.id}')">+</button>
        <button class="btn-icon red" title="Удалить подгруппу" onclick="deleteSubgroup('${sg.id}')">🗑</button>
      </div>
    </div>

    ${isOpen
      ? `<div class="ex-sub-body">
           ${itemsHtml || '<div class="ex-empty">В подгруппе пока нет упражнений</div>'}
           <div class="ex-sub-footer no-print">
             <button class="btn btn-sm" onclick="addExercise('${sg.id}')">+ Добавить упражнение</button>
           </div>
         </div>`
      : ''}
  </div>`;
}

/* ===== Упражнение ===== */

function renderItem(sg, it, i) {
  const link = sg.links && sg.links[i] ? sg.links[i] : '';
  const isFirst = i === 0;
  const isLast = i === sg.items.length - 1;

  return `<div class="ex-item">
    <span class="num">${i + 1}.</span>
    <span class="txt" contenteditable="true" onblur="renameExercise('${sg.id}', ${i}, this.innerText)">${escapeHtml(it)}</span>
    ${link
      ? `<a href="${escapeAttr(link)}" target="_blank" rel="noopener">▶ видео</a>`
      : `<a href="#" onclick="editExerciseLink('${sg.id}',${i});return false">🔗 видео</a>`}
    <span class="item-actions no-print">
      <button class="btn-icon" title="Выше" ${isFirst ? 'disabled' : ''} onclick="moveExerciseUp('${sg.id}', ${i})">▲</button>
      <button class="btn-icon" title="Ниже" ${isLast ? 'disabled' : ''} onclick="moveExerciseDown('${sg.id}', ${i})">▼</button>
      <button class="btn-icon" title="Переместить в другую подгруппу" onclick="openMoveExerciseModal('${sg.id}', ${i})">↔</button>
      <button class="btn-icon" title="Ссылка на видео" onclick="editExerciseLink('${sg.id}', ${i})">✎</button>
      <button class="btn-icon red" title="Удалить упражнение" onclick="deleteExercise('${sg.id}', ${i})">×</button>
    </span>
  </div>`;
}

/* ===== Раскрытие / сворачивание ===== */

function toggleExParent(parentId) {
  if (__exOpenParents.has(parentId)) __exOpenParents.delete(parentId);
  else __exOpenParents.add(parentId);
  renderExercises();
}

function toggleExSubgroup(sgId) {
  if (__exOpenSubgroups.has(sgId)) __exOpenSubgroups.delete(sgId);
  else __exOpenSubgroups.add(sgId);
  renderExercises();
}

function toggleAllAccordions() {
  const parents = DB.exercises || [];
  const allOpen = parents.length && parents.every(p => __exOpenParents.has(p.id));

  if (allOpen) {
    __exOpenParents.clear();
    __exOpenSubgroups.clear();
  } else {
    parents.forEach(p => {
      __exOpenParents.add(p.id);
      (p.subgroups || []).forEach(sg => __exOpenSubgroups.add(sg.id));
    });
  }
  renderExercises();
}

function updateToggleAllBtn() {
  const btn = document.getElementById('toggle-all-btn');
  if (!btn) return;
  const parents = DB.exercises || [];
  const allOpen = parents.length && parents.every(p => __exOpenParents.has(p.id));
  btn.textContent = allOpen ? 'Свернуть все' : 'Развернуть все';
}

/* ============================================================
   СОЗДАНИЕ / РЕДАКТИРОВАНИЕ / УДАЛЕНИЕ
   ============================================================ */

/* ===== Большие группы ===== */

function addParent() {
  openModal(`<h3>Новая большая группа</h3>
    <div class="field"><label>Название</label>
      <input id="np-name" placeholder="Например: Посадка, Отталкивания, Броски" autofocus></div>
    <div class="btn-row" style="margin-top:16px">
      <button class="btn" onclick="saveNewParent()">Создать</button>
      <button class="btn-ghost btn" onclick="closeModal()">Отмена</button>
    </div>`);
  setTimeout(() => document.getElementById('np-name')?.focus(), 100);
}

function saveNewParent() {
  const name = document.getElementById('np-name').value.trim();
  if (!name) { alert('Введите название'); return; }
  const id = uid('g');
  if (!Array.isArray(DB.exercises)) DB.exercises = [];
  DB.exercises.push({ id, name, subgroups: [] });
  __exOpenParents.add(id);
  saveDB();
  closeModal();
  renderExercises();
}

function renameParent(parentId) {
  const p = DB.exercises.find(x => x.id === parentId);
  if (!p) return;
  openModal(`<h3>Переименовать большую группу</h3>
    <div class="field"><label>Новое название</label>
      <input id="rp-name" value="${escapeAttr(p.name)}" autofocus></div>
    <div class="btn-row" style="margin-top:16px">
      <button class="btn" onclick="saveRenameParent('${parentId}')">Сохранить</button>
      <button class="btn-ghost btn" onclick="closeModal()">Отмена</button>
    </div>`);
  setTimeout(() => document.getElementById('rp-name')?.select(), 100);
}

function saveRenameParent(parentId) {
  const p = DB.exercises.find(x => x.id === parentId);
  if (!p) return;
  const name = document.getElementById('rp-name').value.trim();
  if (!name) { alert('Введите название'); return; }
  p.name = name;
  saveDB();
  closeModal();
  renderExercises();
}

function deleteParent(parentId) {
  const p = DB.exercises.find(x => x.id === parentId);
  if (!p) return;
  const subs = (p.subgroups || []).length;
  const items = (p.subgroups || []).reduce((acc, sg) => acc + (sg.items ? sg.items.length : 0), 0);
  const warn = subs || items
    ? `\n\nВнутри: ${subs} подгрупп, ${items} упражнений. Все они будут удалены.`
    : '';
  if (!confirm(`Удалить большую группу «${p.name}»?${warn}`)) return;
  DB.exercises = DB.exercises.filter(x => x.id !== parentId);
  __exOpenParents.delete(parentId);
  saveDB();
  renderExercises();
}

function moveParentUp(parentId) {
  const arr = DB.exercises;
  const i = arr.findIndex(x => x.id === parentId);
  if (i <= 0) return;
  [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]];
  saveDB();
  renderExercises();
}

function moveParentDown(parentId) {
  const arr = DB.exercises;
  const i = arr.findIndex(x => x.id === parentId);
  if (i < 0 || i >= arr.length - 1) return;
  [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]];
  saveDB();
  renderExercises();
}

/* ===== Мини-группы ===== */

function addSubgroup(parentId) {
  const p = DB.exercises.find(x => x.id === parentId);
  if (!p) return;
  openModal(`<h3>Новая подгруппа</h3>
    <p class="subtitle" style="margin-top:-8px">Большая группа: <strong>${escapeHtml(p.name)}</strong></p>
    <div class="field"><label>Название</label>
      <input id="nsg-name" placeholder="Например: Посадка 1" autofocus></div>
    <div class="btn-row" style="margin-top:16px">
      <button class="btn" onclick="saveNewSubgroup('${parentId}')">Создать</button>
      <button class="btn-ghost btn" onclick="closeModal()">Отмена</button>
    </div>`);
  setTimeout(() => document.getElementById('nsg-name')?.focus(), 100);
}

function saveNewSubgroup(parentId) {
  const p = DB.exercises.find(x => x.id === parentId);
  if (!p) return;
  const name = document.getElementById('nsg-name').value.trim();
  if (!name) { alert('Введите название'); return; }
  if (!Array.isArray(p.subgroups)) p.subgroups = [];
  const id = uid('sg');
  p.subgroups.push({ id, name, items: [], links: {} });
  __exOpenParents.add(parentId);
  __exOpenSubgroups.add(id);
  saveDB();
  closeModal();
  renderExercises();
}

function renameSubgroup(sgId) {
  const found = findSubgroupById(sgId);
  if (!found) return;
  const { subgroup } = found;
  openModal(`<h3>Переименовать подгруппу</h3>
    <div class="field"><label>Новое название</label>
      <input id="rsg-name" value="${escapeAttr(subgroup.name)}" autofocus></div>
    <div class="btn-row" style="margin-top:16px">
      <button class="btn" onclick="saveRenameSubgroup('${sgId}')">Сохранить</button>
      <button class="btn-ghost btn" onclick="closeModal()">Отмена</button>
    </div>`);
  setTimeout(() => document.getElementById('rsg-name')?.select(), 100);
}

function saveRenameSubgroup(sgId) {
  const found = findSubgroupById(sgId);
  if (!found) return;
  const name = document.getElementById('rsg-name').value.trim();
  if (!name) { alert('Введите название'); return; }
  found.subgroup.name = name;
  saveDB();
  closeModal();
  renderExercises();
}

function deleteSubgroup(sgId) {
  const found = findSubgroupById(sgId);
  if (!found) return;
  const { parent, subgroup } = found;
  const items = (subgroup.items || []).length;
  const warn = items ? `\n\nВнутри ${items} упражнений — они будут удалены.` : '';
  if (!confirm(`Удалить подгруппу «${subgroup.name}»?${warn}`)) return;
  parent.subgroups = parent.subgroups.filter(x => x.id !== sgId);
  __exOpenSubgroups.delete(sgId);
  saveDB();
  renderExercises();
}

function moveSubgroupUp(parentId, sgId) {
  const p = DB.exercises.find(x => x.id === parentId);
  if (!p || !Array.isArray(p.subgroups)) return;
  const i = p.subgroups.findIndex(x => x.id === sgId);
  if (i <= 0) return;
  [p.subgroups[i - 1], p.subgroups[i]] = [p.subgroups[i], p.subgroups[i - 1]];
  saveDB();
  renderExercises();
}

function moveSubgroupDown(parentId, sgId) {
  const p = DB.exercises.find(x => x.id === parentId);
  if (!p || !Array.isArray(p.subgroups)) return;
  const i = p.subgroups.findIndex(x => x.id === sgId);
  if (i < 0 || i >= p.subgroups.length - 1) return;
  [p.subgroups[i + 1], p.subgroups[i]] = [p.subgroups[i], p.subgroups[i + 1]];
  saveDB();
  renderExercises();
}

/* ===== Перемещение мини-группы между большими ===== */

function openMoveSubgroupModal(sgId) {
  const found = findSubgroupById(sgId);
  if (!found) return;
  const { parent, subgroup } = found;

  const options = DB.exercises
    .filter(p => p.id !== parent.id)
    .map(p => `<option value="${escapeAttr(p.id)}">${escapeHtml(p.name)}</option>`)
    .join('');

  if (!options) {
    alert('Нет других больших групп. Создайте новую большую группу, чтобы переместить.');
    return;
  }

  openModal(`<h3>Переместить подгруппу</h3>
    <p class="subtitle" style="margin-top:-8px">
      Подгруппа «${escapeHtml(subgroup.name)}» из большой группы «${escapeHtml(parent.name)}».
    </p>
    <div class="field"><label>В какую большую группу</label>
      <select id="mv-target">${options}</select></div>
    <div class="btn-row" style="margin-top:16px">
      <button class="btn" onclick="saveMoveSubgroup('${sgId}')">Переместить</button>
      <button class="btn-ghost btn" onclick="closeModal()">Отмена</button>
    </div>`);
}

function saveMoveSubgroup(sgId) {
  const found = findSubgroupById(sgId);
  if (!found) return;
  const { parent, subgroup } = found;
  const targetId = document.getElementById('mv-target').value;
  const target = DB.exercises.find(x => x.id === targetId);
  if (!target) return;

  parent.subgroups = parent.subgroups.filter(x => x.id !== sgId);
  if (!Array.isArray(target.subgroups)) target.subgroups = [];
  target.subgroups.push(subgroup);

  __exOpenParents.add(target.id);
  __exOpenSubgroups.add(sgId);

  saveDB();
  closeModal();
  renderExercises();
  toast(`Подгруппа перемещена в «${target.name}»`);
}

/* ===== Упражнения ===== */

function addExercise(sgId) {
  const found = findSubgroupById(sgId);
  if (!found) return;
  const { parent, subgroup } = found;

  openModal(`<h3>Новое упражнение</h3>
    <p class="subtitle" style="margin-top:-8px">
      ${escapeHtml(parent.name)} · <strong>${escapeHtml(subgroup.name)}</strong>
    </p>
    <div class="field"><label>Название упражнения</label>
      <textarea id="ne-name" rows="3" placeholder="Описание упражнения" autofocus></textarea></div>
    <div class="field"><label>Ссылка на видео (необязательно)</label>
      <input id="ne-link" placeholder="https://..."></div>
    <div class="btn-row" style="margin-top:16px">
      <button class="btn" onclick="saveNewExercise('${sgId}')">Добавить</button>
      <button class="btn-ghost btn" onclick="closeModal()">Отмена</button>
    </div>`);
  setTimeout(() => document.getElementById('ne-name')?.focus(), 100);
}

function saveNewExercise(sgId) {
  const found = findSubgroupById(sgId);
  if (!found) return;
  const name = document.getElementById('ne-name').value.trim();
  if (!name) { alert('Введите название'); return; }

  const { subgroup } = found;
  if (!Array.isArray(subgroup.items)) subgroup.items = [];
  subgroup.items.push(name);

  if (!subgroup.links) subgroup.links = {};
  const link = document.getElementById('ne-link').value.trim();
  if (link) subgroup.links[subgroup.items.length - 1] = link;

  __exOpenParents.add(found.parent.id);
  __exOpenSubgroups.add(sgId);

  saveDB();
  closeModal();
  renderExercises();
}

function renameExercise(sgId, idx, newName) {
  const found = findSubgroupById(sgId);
  if (!found) return;
  newName = (newName || '').trim();
  const { subgroup } = found;
  if (!newName || subgroup.items[idx] === newName) return;
  subgroup.items[idx] = newName;
  saveDB();
}

function deleteExercise(sgId, idx) {
  const found = findSubgroupById(sgId);
  if (!found) return;
  const { subgroup } = found;
  const label = (subgroup.items[idx] || '').substring(0, 60);
  if (!confirm(`Удалить упражнение «${label}${label.length >= 60 ? '…' : ''}»?`)) return;

  subgroup.items.splice(idx, 1);
  if (subgroup.links) {
    const newLinks = {};
    Object.keys(subgroup.links).forEach(k => {
      const ki = parseInt(k);
      if (ki < idx) newLinks[ki] = subgroup.links[k];
      else if (ki > idx) newLinks[ki - 1] = subgroup.links[k];
    });
    subgroup.links = newLinks;
  }
  saveDB();
  renderExercises();
}

function moveExerciseUp(sgId, idx) {
  const found = findSubgroupById(sgId);
  if (!found) return;
  const { subgroup } = found;
  if (idx <= 0) return;

  swapItems(subgroup, idx - 1, idx);
  saveDB();
  renderExercises();
}

function moveExerciseDown(sgId, idx) {
  const found = findSubgroupById(sgId);
  if (!found) return;
  const { subgroup } = found;
  if (idx >= subgroup.items.length - 1) return;

  swapItems(subgroup, idx, idx + 1);
  saveDB();
  renderExercises();
}

function swapItems(subgroup, i, j) {
  [subgroup.items[i], subgroup.items[j]] = [subgroup.items[j], subgroup.items[i]];
  if (subgroup.links) {
    const a = subgroup.links[i];
    const b = subgroup.links[j];
    if (b === undefined) delete subgroup.links[i];
    else subgroup.links[i] = b;
    if (a === undefined) delete subgroup.links[j];
    else subgroup.links[j] = a;
  }
}

/* ===== Перемещение упражнения между подгруппами ===== */

function openMoveExerciseModal(sgId, idx) {
  const found = findSubgroupById(sgId);
  if (!found) return;
  const { parent, subgroup } = found;
  const itemName = subgroup.items[idx] || '';

  const groups = [];
  DB.exercises.forEach(p => {
    (p.subgroups || []).forEach(sg => {
      if (sg.id === sgId) return;
      groups.push({ parentId: p.id, parentName: p.name, subgroupId: sg.id, subgroupName: sg.name });
    });
  });

  if (!groups.length) {
    alert('Нет других подгрупп, куда можно переместить.');
    return;
  }

  const options = groups.map(g =>
    `<option value="${escapeAttr(g.subgroupId)}">${escapeHtml(g.parentName)} · ${escapeHtml(g.subgroupName)}</option>`
  ).join('');

  openModal(`<h3>Переместить упражнение</h3>
    <p class="subtitle" style="margin-top:-8px">«${escapeHtml(itemName)}»</p>
    <div class="field"><label>В какую подгруппу</label>
      <select id="me-target">${options}</select></div>
    <div class="btn-row" style="margin-top:16px">
      <button class="btn" onclick="saveMoveExercise('${sgId}', ${idx})">Переместить</button>
      <button class="btn-ghost btn" onclick="closeModal()">Отмена</button>
    </div>`);
}

function saveMoveExercise(sgId, idx) {
  const found = findSubgroupById(sgId);
  if (!found) return;
  const { subgroup } = found;
  const targetId = document.getElementById('me-target').value;
  const targetFound = findSubgroupById(targetId);
  if (!targetFound) return;
  const target = targetFound.subgroup;

  const item = subgroup.items[idx];
  const link = subgroup.links && subgroup.links[idx];

  subgroup.items.splice(idx, 1);
  if (subgroup.links) {
    const newLinks = {};
    Object.keys(subgroup.links).forEach(k => {
      const ki = parseInt(k);
      if (ki < idx) newLinks[ki] = subgroup.links[k];
      else if (ki > idx) newLinks[ki - 1] = subgroup.links[k];
    });
    subgroup.links = newLinks;
  }

  if (!Array.isArray(target.items)) target.items = [];
  target.items.push(item);
  if (!target.links) target.links = {};
  if (link) target.links[target.items.length - 1] = link;

  __exOpenParents.add(targetFound.parent.id);
  __exOpenSubgroups.add(targetId);

  saveDB();
  closeModal();
  renderExercises();
  toast('Упражнение перемещено');
}

/* ===== Ссылка на видео ===== */

function editExerciseLink(sgId, idx) {
  const found = findSubgroupById(sgId);
  if (!found) return;
  const { subgroup } = found;
  const cur = (subgroup.links && subgroup.links[idx]) || '';

  openModal(`<h3>Ссылка на видео</h3>
    <p style="color:var(--ak-gray-dark);font-size:13px;margin-bottom:12px">${escapeHtml(subgroup.items[idx] || '')}</p>
    <div class="field"><label>URL</label>
      <input id="ex-link" value="${escapeAttr(cur)}" placeholder="https://..." autofocus></div>
    <div class="btn-row" style="margin-top:16px">
      <button class="btn" onclick="saveExerciseLink('${sgId}',${idx})">Сохранить</button>
      <button class="btn btn-red" onclick="deleteExerciseLink('${sgId}',${idx})">Удалить ссылку</button>
      <button class="btn-ghost btn" onclick="closeModal()">Отмена</button>
    </div>`);
  setTimeout(() => document.getElementById('ex-link')?.focus(), 100);
}

function saveExerciseLink(sgId, idx) {
  const found = findSubgroupById(sgId);
  if (!found) return;
  const { subgroup } = found;
  if (!subgroup.links) subgroup.links = {};
  const url = document.getElementById('ex-link').value.trim();
  if (url) subgroup.links[idx] = url;
  else delete subgroup.links[idx];
  saveDB();
  closeModal();
  renderExercises();
}

function deleteExerciseLink(sgId, idx) {
  const found = findSubgroupById(sgId);
  if (!found) return;
  const { subgroup } = found;
  if (subgroup.links) delete subgroup.links[idx];
  saveDB();
  closeModal();
  renderExercises();
}