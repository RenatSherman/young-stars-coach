/* ============================================================
   48-coach-templates.js
   Шаблоны тренировок.

   Возможности:
   - Сохранить текущую форму тренировки как шаблон.
   - Дропдаун «Заполнить из шаблона» в редакторе тренировки.
   - Удаление шаблона прямо из дропдауна (с подтверждением).

   Шаблон хранит:
   - name              — имя шаблона (для списка)
   - trainingName      — название тренировки (подставляется в поле)
   - trainingNote      — примечание тренировки (подставляется в поле)
   - blocks            — копия блоков (без id, без фактов)

   Шаблон НЕ хранит:
   - игроков
   - факты (done/partial/notdone)
   - комментарии
   - id блоков (генерируются заново при вставке)
   ============================================================ */

/* ============================================================
   ХЕЛПЕРЫ
   ============================================================ */

function getTemplatesSorted() {
  if (!Array.isArray(DB.templates)) return [];
  return DB.templates
    .slice()
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ru'));
}

function getTemplateById(id) {
  if (!Array.isArray(DB.templates)) return null;
  return DB.templates.find(t => t.id === id) || null;
}

/* ============================================================
   СОХРАНИТЬ ТЕКУЩУЮ ФОРМУ КАК ШАБЛОН
   ============================================================ */

function saveCurrentAsTemplate() {
  const ctx = __sessionEditContext;
  if (!ctx) return;

  syncFormToContext();

  const validBlocks = [];
  for (let i = 0; i < ctx.blocks.length; i++) {
    const b = ctx.blocks[i];
    const hasAny = (b.complex || '').trim() || (b.format || '').trim() || (b.note || '').trim();
    if (!hasAny) continue;
    validBlocks.push({
      complex: (b.complex || '').trim(),
      complexItems: Array.isArray(b.complexItems) ? b.complexItems.slice() : [],
      format: b.format || '',
      startTime: b.startTime || '',
      duration: Number(b.duration) || 0,
      note: (b.note || '').trim()
    });
  }

  if (!validBlocks.length) {
    uiAlert('Добавьте хотя бы один блок — тогда можно сохранить шаблон.');
    return;
  }

  const suggested = ctx.name ? ctx.name : 'Без названия';

  uiPrompt(
    'Как назвать шаблон? Это имя появится в списке «Заполнить из шаблона».',
    suggested,
    (templateName) => {
      const trimmed = (templateName || '').trim();
      if (!trimmed) return;

      const exists = DB.templates.find(t =>
        (t.name || '').toLowerCase() === trimmed.toLowerCase()
      );

      const doSave = () => {
        if (!Array.isArray(DB.templates)) DB.templates = [];
        DB.templates.push({
          id: uid('tpl'),
          name: trimmed,
          trainingName: (ctx.name || '').trim(),
          trainingNote: (ctx.note || '').trim(),
          blocks: validBlocks,
          createdAt: new Date().toISOString()
        });
        saveDB();
        toast(`Шаблон «${trimmed}» сохранён`);
        /* Перерисовать форму, чтобы появился дропдаун «Заполнить из шаблона» */
        renderSessionForm();
      };

      if (exists) {
        uiConfirm(
          `Шаблон с именем «${trimmed}» уже есть. Заменить его?`,
          doSave,
          () => {}
        );
      } else {
        doSave();
      }
    },
    () => {},
    { title: 'Новый шаблон', placeholder: 'Например: Ледовая УТ (стандарт)', okLabel: 'Сохранить' }
  );
}

/* ============================================================
   ЗАПОЛНИТЬ ФОРМУ ИЗ ШАБЛОНА
   ============================================================ */

function fillFormFromTemplate(templateId) {
  const ctx = __sessionEditContext;
  if (!ctx) return;

  const tpl = getTemplateById(templateId);
  if (!tpl) {
    uiAlert('Шаблон не найден');
    return;
  }

  syncFormToContext();

  const hasBlocks = (ctx.blocks || []).some(b =>
    (b.complex || '').trim() || (b.format || '').trim() || (b.note || '').trim()
  );

  const doFill = () => {
    /* Блоки: полная замена, с генерацией свежих id для комплекс-модалок */
    ctx.blocks = tpl.blocks.map(b => ({
      id: null,
      complex: b.complex || '',
      complexItems: Array.isArray(b.complexItems) ? b.complexItems.slice() : [],
      format: b.format || '',
      startTime: b.startTime || '18:00',
      duration: Number(b.duration) || 60,
      note: b.note || '',
      fact: '',
      comment: ''
    }));

    if (!ctx.blocks.length) ctx.blocks = [newEmptyBlock()];

    /* Название тренировки — только если поле пустое */
    if (!ctx.name && tpl.trainingName) ctx.name = tpl.trainingName;

    /* Примечание тренировки — только если поле пустое */
    if (!ctx.note && tpl.trainingNote) ctx.note = tpl.trainingNote;

    /* Игроки — очищаем (правило №1) */
    ctx.playerIds = [];

    renderSessionForm();
    toast(`Шаблон «${tpl.name}» подставлен`);
  };

  if (hasBlocks) {
    const n = ctx.blocks.filter(b =>
      (b.complex || '').trim() || (b.format || '').trim() || (b.note || '').trim()
    ).length;
    uiConfirm(
      `В форме уже есть ${n} ${plural(n, 'блок', 'блока', 'блоков')}. Заменить на блоки шаблона (${tpl.blocks.length})?`,
      doFill,
      () => {}
    );
  } else {
    doFill();
  }
}

/* ============================================================
   УДАЛЕНИЕ ШАБЛОНА
   ============================================================ */

function deleteTemplate(templateId, event) {
  if (event) event.stopPropagation();
  const tpl = getTemplateById(templateId);
  if (!tpl) return;

  uiConfirm(
    `Удалить шаблон «${tpl.name}»?`,
    () => {
      DB.templates = DB.templates.filter(t => t.id !== templateId);
      saveDB();
      toast(`Шаблон «${tpl.name}» удалён`);
      /* Перерисовать форму, чтобы обновился дропдаун */
      renderSessionForm();
    },
    () => {}
  );
}

/* ============================================================
   ДРОПДАУН «ЗАПОЛНИТЬ ИЗ ШАБЛОНА»
   ============================================================ */

function toggleTemplateDropdown(event) {
  if (event) event.stopPropagation();
  const menu = document.getElementById('tpl-dropdown');
  if (!menu) return;
  menu.classList.toggle('active');
}

function closeTemplateDropdown() {
  const menu = document.getElementById('tpl-dropdown');
  if (menu) menu.classList.remove('active');
}

document.addEventListener('click', e => {
  const menu = document.getElementById('tpl-dropdown');
  if (!menu) return;
  if (!menu.classList.contains('active')) return;
  if (e.target.closest('#tpl-dropdown')) return;
  if (e.target.closest('#tpl-toggle-btn')) return;
  menu.classList.remove('active');
});

function renderTemplateDropdownHtml() {
  const list = getTemplatesSorted();
  if (!list.length) return '';

  const items = list.map(t => `
    <div class="tpl-item" data-tpl-id="${escapeAttr(t.id)}">
      <button type="button" class="tpl-item-fill" onclick="onTemplatePick('${escapeAttr(t.id)}')">
        <span class="tpl-item-name">${escapeHtml(t.name)}</span>
        <span class="tpl-item-meta">${t.blocks.length} ${plural(t.blocks.length, 'блок', 'блока', 'блоков')}</span>
      </button>
      <button type="button" class="tpl-item-del" title="Удалить шаблон"
              onclick="deleteTemplate('${escapeAttr(t.id)}', event)">🗑</button>
    </div>
  `).join('');

  return `
    <div class="tpl-dropdown-wrap">
      <button type="button" class="btn btn-sm btn-ghost tpl-toggle" id="tpl-toggle-btn"
              onclick="toggleTemplateDropdown(event)">
        ▼ Заполнить из шаблона
      </button>
      <div class="tpl-dropdown" id="tpl-dropdown">
        ${items}
      </div>
    </div>
  `;
}

function onTemplatePick(templateId) {
  closeTemplateDropdown();
  fillFormFromTemplate(templateId);
}