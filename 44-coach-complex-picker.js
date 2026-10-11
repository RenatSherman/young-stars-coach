/* ============================================================
   44-coach-complex-picker.js
   Поповер-дерево «Комплекс упражнений» в редакторе тренировки.

   Содержит:
   - toggleComplexPicker / closeAllComplexPickers
   - buildComplexPopoverHtml
   - renderComplexPickerGroup / renderComplexPickerSub
   - onComplexSubClick / toggleComplexPickerSub / toggleComplexPickerGroup
   - checkAllSubItems
   - assignComplexItemsFromSub / selectComplexWholeGroup
   - updateComplexPickerButton / filterComplexPicker
   ============================================================ */

let __openComplexPopoverIdx = null;
let __openComplexGroups = new Set();
let __openComplexSubgroups = new Set();

function toggleComplexPicker(event, idx) {
  if (event) event.stopPropagation();

  const wasOpen = __openComplexPopoverIdx === idx;
  closeAllComplexPickers();

  if (wasOpen) return;

  __openComplexGroups = new Set();
  __openComplexSubgroups = new Set();

  const pop = document.getElementById('complex-popover-' + idx);
  if (!pop) return;

  pop.innerHTML = buildComplexPopoverHtml(idx);
  pop.classList.add('active');
  __openComplexPopoverIdx = idx;

  setTimeout(() => {
    const search = pop.querySelector('.complex-picker-search');
    if (search) search.focus();
  }, 30);
}

function closeAllComplexPickers() {
  document.querySelectorAll('.complex-picker-popover.active').forEach(el => el.classList.remove('active'));
  __openComplexPopoverIdx = null;
  __openComplexGroups = new Set();
  __openComplexSubgroups = new Set();
}

document.addEventListener('click', () => {
  if (__openComplexPopoverIdx !== null) closeAllComplexPickers();
});

function buildComplexPopoverHtml(blockIdx) {
  const groups = Array.isArray(DB.exercises) ? DB.exercises : [];

  if (!groups.length) {
    return `
      <div class="complex-picker-head">
        <span>Комплексы</span>
        <button type="button" class="complex-picker-close" onclick="closeAllComplexPickers()">×</button>
      </div>
      <div class="complex-picker-empty">Справочник пуст.</div>
    `;
  }

  const body = groups.map(parent => renderComplexPickerGroup(parent)).join('');

  return `
    <div class="complex-picker-head">
      <span>Выберите комплекс</span>
      <button type="button" class="complex-picker-close" onclick="closeAllComplexPickers()">×</button>
    </div>
    <div class="complex-picker-search-wrap">
      <input type="text" class="complex-picker-search" placeholder="Поиск…"
             oninput="filterComplexPicker(this.value)">
    </div>
    <div class="complex-picker-body" id="complex-picker-body-${blockIdx}">
      ${body || '<div class="complex-picker-empty">Нет ни одной мини-группы</div>'}
    </div>
  `;
}

function renderComplexPickerGroup(parent) {
  const subs = Array.isArray(parent.subgroups) ? parent.subgroups : [];
  const isOpen = __openComplexGroups.has(parent.id);

  const searchParts = [parent.name || ''];
  subs.forEach(sg => {
    searchParts.push(sg.name || '');
    (sg.items || []).forEach(it => searchParts.push(it || ''));
  });
  const searchStr = searchParts.join(' ').toLowerCase();

  if (!subs.length) {
    return `<div class="complex-picker-group empty" data-search="${escapeAttr(searchStr)}">
      <div class="complex-picker-group-head">
        <span class="complex-picker-group-arrow">·</span>
        <span class="complex-picker-group-name">${escapeHtml(parent.name)}</span>
        <span class="complex-picker-group-count">0</span>
      </div>
    </div>`;
  }

  const subHtml = subs.map(sg => renderComplexPickerSub(sg)).join('');

  return `<div class="complex-picker-group ${isOpen ? 'open' : ''}"
                data-group-id="${escapeAttr(parent.id)}"
                data-search="${escapeAttr(searchStr)}">
    <button type="button" class="complex-picker-group-head"
            onclick="toggleComplexPickerGroup('${escapeAttr(parent.id)}')">
      <span class="complex-picker-group-arrow">${isOpen ? '▼' : '▶'}</span>
      <span class="complex-picker-group-name">${escapeHtml(parent.name)}</span>
      <span class="complex-picker-group-count">${subs.length}</span>
    </button>
    <div class="complex-picker-group-body" style="display:${isOpen ? 'block' : 'none'}">${subHtml}</div>
  </div>`;
}

function renderComplexPickerSub(sg) {
  const items = Array.isArray(sg.items) ? sg.items : [];
  const isOpen = __openComplexSubgroups.has(sg.id);
  const subSearch = ((sg.name || '') + ' ' + items.join(' ')).toLowerCase();

  const itemsHtml = items.map(it => `
    <label class="complex-picker-item-check">
      <input type="checkbox" class="complex-picker-item-cb"
             data-item="${escapeAttr(it)}">
      <span class="complex-picker-item-text">${escapeHtml(it)}</span>
    </label>
  `).join('');

  return `<div class="complex-picker-sub ${isOpen ? 'open' : ''}"
                data-sub-id="${escapeAttr(sg.id)}"
                data-search="${escapeAttr(subSearch)}">
    <div class="complex-picker-sub-row">
      <button type="button" class="complex-picker-sub-arrow-btn"
              title="${isOpen ? 'Свернуть упражнения' : 'Раскрыть упражнения'}"
              onclick="toggleComplexPickerSub(event, this)">
        ${isOpen ? '▼' : '▶'}
      </button>
      <button type="button" class="complex-picker-sub-btn"
              data-sub-id="${escapeAttr(sg.id)}"
              onclick="onComplexSubClick(event, this)">
        <span class="complex-picker-radio"></span>
        <span class="complex-picker-sub-name">${escapeHtml(sg.name)}</span>
        <span class="complex-picker-sub-count">${items.length}</span>
      </button>
    </div>
    ${isOpen && items.length ? `
      <div class="complex-picker-sub-body">
        ${itemsHtml}
        <div class="complex-picker-sub-actions">
          <button type="button" class="complex-picker-sub-action primary"
                  onclick="assignComplexItemsFromSub(event, this)">
            Назначить
          </button>
          <button type="button" class="complex-picker-sub-action ghost"
                  onclick="checkAllSubItems(event, this, true)">
            Отметить все
          </button>
          <button type="button" class="complex-picker-sub-action ghost"
                  onclick="checkAllSubItems(event, this, false)">
            Снять все
          </button>
        </div>
      </div>
    ` : ''}
  </div>`;
}

function onComplexSubClick(event, btn) {
  if (event) event.stopPropagation();
  const subId = btn.dataset.subId;
  const found = findSubgroupById(subId);
  if (!found) return;
  selectComplexWholeGroup(__openComplexPopoverIdx, found.subgroup.name);
}

function toggleComplexPickerSub(event, btn) {
  if (event) event.stopPropagation();
  const subEl = btn.closest('.complex-picker-sub');
  if (!subEl) return;

  const subId = subEl.dataset.subId;
  const found = findSubgroupById(subId);
  if (!found) return;

  if (__openComplexSubgroups.has(subId)) __openComplexSubgroups.delete(subId);
  else __openComplexSubgroups.add(subId);

  const tmp = document.createElement('div');
  tmp.innerHTML = renderComplexPickerSub(found.subgroup);
  const newSub = tmp.firstElementChild;
  subEl.replaceWith(newSub);
}

function toggleComplexPickerGroup(groupId) {
  if (__openComplexGroups.has(groupId)) __openComplexGroups.delete(groupId);
  else __openComplexGroups.add(groupId);

  const groupEl = document.querySelector(`.complex-picker-group[data-group-id="${CSS.escape(groupId)}"]`);
  if (!groupEl) return;
  const body = groupEl.querySelector('.complex-picker-group-body');
  const arrow = groupEl.querySelector('.complex-picker-group-arrow');
  const isOpen = __openComplexGroups.has(groupId);
  if (body)  body.style.display = isOpen ? 'block' : 'none';
  if (arrow) arrow.textContent = isOpen ? '▼' : '▶';
  groupEl.classList.toggle('open', isOpen);
}

function checkAllSubItems(event, btn, checked) {
  if (event) event.stopPropagation();
  const subEl = btn.closest('.complex-picker-sub');
  if (!subEl) return;
  subEl.querySelectorAll('.complex-picker-item-cb').forEach(cb => { cb.checked = checked; });
}

function assignComplexItemsFromSub(event, btn) {
  if (event) event.stopPropagation();

  const ctx = __sessionEditContext;
  const blockIdx = __openComplexPopoverIdx;
  if (!ctx || !ctx.blocks[blockIdx]) return;

  const subEl = btn.closest('.complex-picker-sub');
  if (!subEl) return;

  const subId = subEl.dataset.subId;
  const found = findSubgroupById(subId);
  if (!found) return;

  const checkedItems = [];
  subEl.querySelectorAll('.complex-picker-item-cb').forEach(cb => {
    if (cb.checked) checkedItems.push(cb.dataset.item);
  });

  if (!checkedItems.length) {
    uiAlert('Отметьте хотя бы одно упражнение. Если нужно выбрать всю мини-группу — кликните по кружку рядом с названием.');
    return;
  }

  const totalItems = (found.subgroup.items || []).length;

  ctx.blocks[blockIdx].complex = found.subgroup.name;
  if (checkedItems.length === totalItems) {
    ctx.blocks[blockIdx].complexItems = [];
  } else {
    ctx.blocks[blockIdx].complexItems = checkedItems.slice();
  }

  updateComplexPickerButton(blockIdx);
  closeAllComplexPickers();
  toast(`Назначено: ${found.subgroup.name}` + (checkedItems.length < totalItems ? ` (${checkedItems.length} из ${totalItems})` : ''));
}

function selectComplexWholeGroup(blockIdx, complexName) {
  const ctx = __sessionEditContext;
  if (!ctx || !ctx.blocks[blockIdx]) return;

  ctx.blocks[blockIdx].complex = complexName || '';
  ctx.blocks[blockIdx].complexItems = [];

  updateComplexPickerButton(blockIdx);
  closeAllComplexPickers();
  toast(`Назначено: ${complexName}`);
}

function updateComplexPickerButton(blockIdx) {
  const ctx = __sessionEditContext;
  if (!ctx || !ctx.blocks[blockIdx]) return;
  const b = ctx.blocks[blockIdx];
  const label = blockComplexLabel(b) || '— не выбрано —';

  const picker = document.querySelector(`.complex-picker[data-block-index="${blockIdx}"]`);
  if (picker) {
    const btn = picker.querySelector('.complex-picker-btn');
    const txt = picker.querySelector('.complex-picker-text');
    if (txt) txt.textContent = label;
    if (btn) btn.classList.toggle('has-value', !!b.complex);
  }
}

function filterComplexPicker(query) {
  const pop = document.getElementById('complex-popover-' + __openComplexPopoverIdx);
  if (!pop) return;
  const q = (query || '').trim().toLowerCase();

  pop.querySelectorAll('.complex-picker-group').forEach(grEl => {
    const searchStr = grEl.dataset.search || '';
    const groupMatch = !q || searchStr.includes(q);

    if (groupMatch && q) {
      const gid = grEl.dataset.groupId;
      if (gid) __openComplexGroups.add(gid);
      const body = grEl.querySelector('.complex-picker-group-body');
      const arrow = grEl.querySelector('.complex-picker-group-arrow');
      if (body) body.style.display = 'block';
      if (arrow && gid) arrow.textContent = '▼';
    }

    if (q) {
      grEl.querySelectorAll('.complex-picker-sub').forEach(subEl => {
        const subSearch = subEl.dataset.search || '';
        const visible = subSearch.includes(q) || searchStr.includes(q);
        subEl.style.display = visible ? 'block' : 'none';
      });
    } else {
      grEl.querySelectorAll('.complex-picker-sub').forEach(subEl => {
        subEl.style.display = 'block';
      });
    }

    grEl.style.display = groupMatch ? 'block' : 'none';
  });

  if (!q) {
    pop.querySelectorAll('.complex-picker-group').forEach(grEl => {
      const gid = grEl.dataset.groupId;
      if (!gid) return;
      const body = grEl.querySelector('.complex-picker-group-body');
      const arrow = grEl.querySelector('.complex-picker-group-arrow');
      const isOpen = __openComplexGroups.has(gid);
      if (body) body.style.display = isOpen ? 'block' : 'none';
      if (arrow) arrow.textContent = isOpen ? '▼' : '▶';
    });
  }
}