/* ============================================================
   11-dashboard-calendar.js  v24
   Календарь тренера: только хелперы для черновиков фактов
   и утилиты complexItems (метка + рендер списка упражнений).

   Вся логика вынесена в модули:
   - 40-coach-grid.js           — сетка месяца
   - 41-coach-day-modal.js      — модалка дня
   - 42-coach-fact-editor.js    — редактор фактов
   - 43-coach-session-editor.js — редактор тренировки
   - 44-coach-complex-picker.js — поповер комплексов
   - 45-coach-repeat-block.js   — повтор на другие дни
   - 46-coach-players-picker.js — выбор игроков
   - 47-coach-delete.js         — удаление тренировок
   ============================================================ */

let __coachOpenSessions = new Set();
let __coachFactDraft = new Map();
let __coachDayCurrentDs = null;

/* ============================================================
   ХЕЛПЕРЫ ЧЕРНОВИКА ФАКТОВ
   ============================================================ */
function cssEscapeSimple(s) {
  return String(s).replace(/([^\w-])/g, '\\$1');
}

function draftKey(ds, sessId) { return ds + '|' + sessId; }
function draftEntryKey(pid, blockIdx) { return pid + '::' + blockIdx; }

function getFactDraft(ds, sessId) {
  const k = draftKey(ds, sessId);
  if (!__coachFactDraft.has(k)) __coachFactDraft.set(k, new Map());
  return __coachFactDraft.get(k);
}

function clearFactDraft(ds, sessId) {
  __coachFactDraft.delete(draftKey(ds, sessId));
}

function hasUnsavedDraft(ds, sessId) {
  const d = __coachFactDraft.get(draftKey(ds, sessId));
  return d && d.size > 0;
}

function listUnsavedSessions(ds) {
  const result = [];
  __coachFactDraft.forEach((map, key) => {
    if (!key.startsWith(ds + '|')) return;
    if (map.size > 0) result.push(key.slice(ds.length + 1));
  });
  return result;
}

/* ============================================================
   COMPLEXITEMS: метка «X из Y» + рендер списка упражнений
   ============================================================ */
function blockComplexLabel(block) {
  const name = (block && block.complex) ? block.complex : '';
  const items = (block && Array.isArray(block.complexItems)) ? block.complexItems : [];
  if (!name) return '';
  if (!items.length) return name;

  const found = findSubgroupByName(name);
  if (found && Array.isArray(found.subgroup.items)) {
    const total = found.subgroup.items.length;
    return `${name} (${items.length} из ${total})`;
  }
  return `${name} (${items.length} выбр.)`;
}

function findSubgroupByName(name) {
  if (!name || !Array.isArray(DB.exercises)) return null;
  for (const parent of DB.exercises) {
    if (!parent || !Array.isArray(parent.subgroups)) continue;
    const sg = parent.subgroups.find(s => s.name === name);
    if (sg) return { parent, subgroup: sg };
  }
  return null;
}

function renderBlockExercisesLine(b) {
  const name = b.complex || '';
  if (!name) return '';
  const found = findSubgroupByName(name);
  if (!found) return '';

  const allItems = Array.isArray(found.subgroup.items) ? found.subgroup.items : [];
  const selected = Array.isArray(b.complexItems) ? b.complexItems : [];
  const isWhole = selected.length === 0;

  if (!allItems.length) return '';

  const itemsToShow = isWhole ? allItems : selected;
  if (!itemsToShow.length) return '';

  const list = itemsToShow.map(it =>
    `<li><span class="bx-dot"></span><span class="bx-text">${escapeHtml(it)}</span></li>`
  ).join('');

  const headerText = isWhole
    ? `Весь комплекс «${escapeHtml(name)}» — ${allItems.length} ${plural(allItems.length, 'упражнение', 'упражнения', 'упражнений')}`
    : `Из «${escapeHtml(name)}» выбрано ${selected.length} из ${allItems.length} ${plural(allItems.length, 'упражнения', 'упражнений', 'упражнений')}`;

  return `<div class="bx-block">
    <div class="bx-head">${headerText}</div>
    <ul class="bx-list">${list}</ul>
  </div>`;
}