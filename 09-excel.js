/* ============================================================
   09-excel.js
   Excel (экспорт игрока, шаблон, импорт), JSON (экспорт/импорт),
   CSV (массовый импорт), очистка данных.
   Загружается после 08-pdf.js.

   В файле лист «ФизТактПсих» имеет заголовки «Начало / Середина / Конец»,
   но данные в объекте игрока хранятся в start/plan/fact.
   ============================================================ */

/* ===== Экспорт одного игрока в Excel ===== */
function exportPlayerToExcel(pid) {
  const p = DB.players.find(x => x.id === pid);
  if (!p) { uiAlert('Игрок не найден'); return; }
  writePlayerWorkbook(p, `Игрок_${(p.fio || '').replace(/\s+/g, '_')}.xlsx`);
}

/* ===== Скачать пустой шаблон Excel ===== */
function downloadTemplateExcel() {
  const template = {
    fio: '', birthDay: '', birthMonth: '', birthYear: '',
    height: '', weight: '', team: '', city: '', firstSchool: '',
    position: 'Нападающий', grip: 'Правый', characteristic: '',
    techDetail: defaultTechDetail().map(t => ({ ...t, start: '', mid: '', end: '' })),
    otherDetail: defaultOtherDetail().map(t => ({ ...t, start: '', plan: '', fact: '' })),
    stats: [], tests: [], developmentPlans: []
  };
  writePlayerWorkbook(template, 'Шаблон_игрока.xlsx');
}

/* ===== Формирование XLSX-файла ===== */
function writePlayerWorkbook(p, filename) {
  const wb = XLSX.utils.book_new();

  const passport = [
    ['Поле', 'Значение'],
    ['ФИО', p.fio || ''],
    ['День рождения', p.birthDay || ''],
    ['Месяц', p.birthMonth || ''],
    ['Год', p.birthYear || ''],
    ['Возраст', computeAge(p) || ''],
    ['Рост', p.height || ''],
    ['Вес', p.weight || ''],
    ['Команда', p.team || ''],
    ['Город', p.city || ''],
    ['Первая школа', p.firstSchool || ''],
    ['Амплуа', p.position || ''],
    ['Хват', p.grip || ''],
    ['Характеристика', p.characteristic || '']
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(passport), 'Паспорт');

  const tech = [['Раздел', 'Подраздел', 'Критерий', 'Начало', 'Середина', 'Конец']];
  (p.techDetail || []).forEach(r => tech.push([
    r.group, r.sub || '', r.name, r.start ?? '', r.mid ?? '', r.end ?? ''
  ]));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(tech), 'Техника');

  /* Физ/Такт/Псих: заголовки «Начало / Середина / Конец», данные из start/plan/fact */
  const other = [['Раздел', 'Подраздел', 'Критерий', 'Начало', 'Середина', 'Конец']];
  (p.otherDetail || []).forEach(r => other.push([
    r.group, r.sub || '', r.name, r.start ?? '', r.plan ?? '', r.fact ?? ''
  ]));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(other), 'ФизТактПсих');

  const cols = getTestColumns();
  const tests = [['Дата', ...cols.map(c => c.label)]];
  (p.tests || []).forEach(t => tests.push([t.date || '', ...cols.map(c => t[c.key] || '')]));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(tests), 'Тесты');

  const stats = [['Клуб/турнир', 'Игры', 'Голы', 'Передачи', 'Очки', '+/-']];
  (p.stats || []).forEach(s => {
    if (s.season && !s.club) stats.push(['--- ' + s.season + ' ---', '', '', '', '', '']);
    else stats.push([s.club || '', s.games ?? '', s.goals ?? '', s.assists ?? '', s.points ?? '', s.plus ?? '']);
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(stats), 'Статистика');

  const dev = [['Навык', 'Текущая', 'Цель', 'Срок', 'Комплекс(ы)', 'Факт', 'Комментарий']];
  (p.developmentPlans || []).forEach(g => {
    const opt = (typeof getSkillOptionByRef === 'function') ? getSkillOptionByRef(p, g.section, g.index) : null;
    const label = opt ? opt.label : (g.skillLabel || '');
    const cur = opt ? (opt.currentStart ?? '') : '';
    dev.push([
      label, cur, g.target ?? '', g.deadline || '',
      Array.isArray(g.complexes) ? g.complexes.join(', ') : '',
      factLabel(g.fact), g.comment || ''
    ]);
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(dev), 'План развития');

  XLSX.writeFile(wb, filename);
}

/* ===== Импорт игрока из Excel ===== */
function importPlayerFromExcel() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.xlsx,.xls';
  input.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const wb = XLSX.read(new Uint8Array(ev.target.result), { type: 'array' });
        const parsed = parseExcelWorkbook(wb);
        if (typeof __ensurePlayerPin === 'function') __ensurePlayerPin(parsed);
        if (!parsed.accessPin) parsed.accessPin = generatePin();

        const finishImport = () => {
          DB.players.push(parsed);
          saveDB();

          const report = [
            `Игрок «${parsed.fio}» добавлен.`,
            `PIN для входа: ${parsed.accessPin}`,
            `Технических критериев: ${parsed.techDetail.length}`,
            `Физ/Такт/Псих критериев: ${parsed.otherDetail.length}`,
            `Тестов: ${parsed.tests.length}, статистики: ${parsed.stats.length}`,
            `Целей развития: ${(parsed.developmentPlans || []).length}`
          ].join('\n');

          uiAlert(report, () => {
            renderPlayers();
            openPlayer(parsed.id);
          });
        };

        if (!parsed.techDetail.length && !parsed.otherDetail.length) {
          uiConfirm(
            'Не удалось найти оценки. Игрок будет создан без них. Продолжить?',
            finishImport,
            () => {}
          );
          return;
        }

        finishImport();
      } catch (err) {
        uiAlert('Ошибка импорта: ' + err.message);
        console.error(err);
      }
    };
    reader.readAsArrayBuffer(file);
  };
  input.click();
}

/* ===== Разбор книги Excel на объект игрока ===== */
function parseExcelWorkbook(wb) {
  const player = {
    id: 'p_' + Date.now(),
    fio: 'Новый игрок',
    birthDay: '', birthMonth: '', birthYear: '',
    height: '', weight: '', team: '', city: '', firstSchool: '',
    position: 'Нападающий', grip: 'Правый', photo: '', characteristic: '',
    accessPin: '',
    techDetail: [], otherDetail: [],
    plans: {}, calendar: {}, stats: [], tests: [],
    developmentPlans: []
  };

  const sheetNames = wb.SheetNames;

  /* Паспорт */
  const passportName = sheetNames.find(n => /карточка|паспорт/i.test(n)) || sheetNames[0];
  const passportSheet = wb.Sheets[passportName];
  if (passportSheet) {
    const rows = XLSX.utils.sheet_to_json(passportSheet, { header: 1, raw: false, defval: '' });
    rows.forEach(r => {
      const key = String(r[0] || '').trim();
      const val = r[1], val2 = r[2], val3 = r[3];
      if (/^ФИО/i.test(key) && val) player.fio = String(val).trim();
      else if (/^Дата рождения/i.test(key)) {
        player.birthDay = val ? String(val).trim() : '';
        player.birthMonth = val2 ? String(val2).trim() : '';
        player.birthYear = val3 ? String(val3).trim() : '';
      } else if (/^Рост/i.test(key)) {
        if (val) { const m = String(val).match(/(\d+[\.,]?\d*)/); if (m) player.height = m[1].replace(',', '.'); }
        if (val3) { const m = String(val3).match(/(\d+[\.,]?\d*)/); if (m) player.weight = m[1].replace(',', '.'); }
        if (!player.weight && val2) { const m = String(val2).match(/(\d+[\.,]?\d*)/); if (m) player.weight = m[1].replace(',', '.'); }
      }
      else if (/^Команда/i.test(key) && val) player.team = String(val).trim();
      else if (/^Город/i.test(key) && val) player.city = String(val).trim();
      else if (/^Первая школа/i.test(key) && val) player.firstSchool = String(val).trim();
      else if (/^Амплуа/i.test(key) && val) player.position = String(val).trim();
      else if (/^Хват/i.test(key) && val) player.grip = String(val).trim();
      else if (/^Краткая характеристика/i.test(key) && val) player.characteristic = String(val).trim();
    });
  }

  /* Техника */
  const techName = sheetNames.find(n => /^тех\b|^техника/i.test(n));
  if (techName) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[techName], { header: 1, raw: false, defval: '' });
    player.techDetail = parseTechSheet(rows);
  }

  /* Физ/такт/псих */
  const otherName = sheetNames.find(n => /физ.*такт.*псих|физтактпсих/i.test(n));
  if (otherName) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[otherName], { header: 1, raw: false, defval: '' });
    player.otherDetail = parseOtherSheet(rows);
  }

  /* Тесты */
  const testsName = sheetNames.find(n => /^тесты?$/i.test(n));
  if (testsName) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[testsName], { header: 1, raw: false, defval: '' });
    let headerIdx = -1;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].some(c => /дата/i.test(String(c)))) { headerIdx = i; break; }
    }
    if (headerIdx >= 0) {
      const cols = getTestColumns();
      for (let i = headerIdx + 1; i < rows.length; i++) {
        const r = rows[i];
        if (!r[0] && !r[1]) continue;
        const row = { date: normalizeDate(r[0]) };
        cols.forEach((c, idx) => {
          row[c.key] = r[idx + 1] != null ? String(r[idx + 1]).replace(',', '.') : '';
        });
        player.tests.push(row);
      }
    }
  }

  /* Статистика */
  const statsName = sheetNames.find(n => /^статистика$/i.test(n));
  if (statsName) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[statsName], { header: 1, raw: false, defval: '' });
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const club = String(r[0] || '').trim();
      if (!club) continue;
      const restEmpty = r.slice(1).every(c => !c || String(c).trim() === '');
      if (restEmpty) {
        player.stats.push({ season: club, club: '', games: '', goals: '', assists: '', points: '', plus: '' });
      } else {
        player.stats.push({
          season: '', club,
          games: r[1] != null && r[1] !== '' ? Number(r[1]) : '',
          goals: r[2] != null && r[2] !== '' ? Number(r[2]) : '',
          assists: r[3] != null && r[3] !== '' ? Number(r[3]) : '',
          points: r[4] != null && r[4] !== '' ? Number(r[4]) : '',
          plus: r[5] != null && r[5] !== '' ? Number(r[5]) : ''
        });
      }
    }
  }

  /* План развития */
  const devName = sheetNames.find(n => /план развития/i.test(n));
  if (devName) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[devName], { header: 1, raw: false, defval: '' });
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r[0]) continue;
      player.developmentPlans.push({
        id: 'dp_' + Date.now() + '_' + i,
        section: '',
        index: -1,
        skillLabel: String(r[0] || ''),
        target: r[2] != null && r[2] !== '' ? Number(r[2]) : '',
        deadline: r[3] ? String(r[3]).trim() : '',
        complexes: r[4] ? String(r[4]).split(',').map(s => s.trim()).filter(Boolean) : [],
        fact: '',
        comment: r[6] ? String(r[6]) : ''
      });
    }
  }

  return player;
}

/* ===== Разбор листа «Техника» ===== */
function parseTechSheet(rows) {
  const result = [];
  let lastGroup = '', lastSub = '';
  const isNumberedFormat = rows.some(r => /^\d+$/.test(String(r[3] || '').trim()));

  rows.forEach(r => {
    const colA = String(r[0] || '').trim();
    const colB = String(r[1] || '').trim();
    const colC = String(r[2] || '').trim();
    const colD = String(r[3] || '').trim();
    const colE = String(r[4] || '').trim();

    if (isNumberedFormat) {
      if (!/^\d+$/.test(colD)) return;
      if (colB) lastGroup = colB;
      if (colC) lastSub = colC;
      const name = colE;
      if (!name) return;
      result.push({
        group: cleanMultiLine(lastGroup) || 'Катание',
        sub: cleanMultiLine(lastSub),
        name,
        start: toNumber(r[6]),
        mid: toNumber(r[7]),
        end: toNumber(r[8])
      });
    } else {
      if (!colA && !colC) return;
      if (/раздел|критерий|подраздел/i.test(colA) || /критерий/i.test(colC)) return;
      if (!colC) return;
      result.push({
        group: colA || 'Катание',
        sub: colB,
        name: colC,
        start: toNumber(r[3]),
        mid: toNumber(r[4]),
        end: toNumber(r[5])
      });
    }
  });
  return result;
}

/* ===== Разбор листа «Физ/Такт/Псих» =====
   Читаем данные из start/plan/fact по позиции столбца — независимо от того,
   как называются заголовки в файле («План/Факт» или «Середина/Конец»).
*/
function parseOtherSheet(rows) {
  const result = [];
  let lastGroup = '', lastSub = '';
  const isNumberedFormat = rows.some(r => /^\d+$/.test(String(r[2] || '').trim()));

  rows.forEach(r => {
    const colA = String(r[0] || '').trim();
    const colB = String(r[1] || '').trim();
    const colC = String(r[2] || '').trim();
    const colD = String(r[3] || '').trim();

    if (isNumberedFormat) {
      if (!/^\d+$/.test(colC)) return;
      if (colA) lastGroup = colA;
      if (colB) lastSub = colB;
      const name = colD;
      if (!name) return;
      result.push({
        group: normalizeGroup(cleanMultiLine(lastGroup)),
        sub: cleanMultiLine(lastSub),
        name,
        start: toNumber(r[6]),
        plan: toNumber(r[7]),
        fact: toNumber(r[8])
      });
    } else {
      if (!colA && !colC) return;
      if (/раздел|критерий|подраздел/i.test(colA) || /критерий/i.test(colC)) return;
      if (!colC) return;
      result.push({
        group: normalizeGroup(colA),
        sub: colB,
        name: colC,
        start: toNumber(r[3]),
        plan: toNumber(r[4]),
        fact: toNumber(r[5])
      });
    }
  });
  return result;
}

/* ============================================================
   JSON: экспорт / импорт всех данных
   ============================================================ */

function exportData() {
  const blob = new Blob([JSON.stringify(DB, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `akbars_backup_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importData() {
  const file = document.getElementById('import-file').files[0];
  if (!file) { uiAlert('Выберите файл'); return; }

  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.players) throw new Error('Нет поля players');

      DB = data;
      if (!DB.exercises) DB.exercises = [];
      if (!DB.meta)      DB.meta = {};
      DB.players.forEach(p => {
        migrateCalendar(p);
        if (typeof __ensurePlayerPin === 'function') __ensurePlayerPin(p);
        if (!Array.isArray(p.developmentPlans)) p.developmentPlans = [];
      });

      saveDB();
      pushToCloud();
      uiAlert('Импорт завершён', () => {
        renderPlayers();
        showScreen('players');
      });
    } catch (err) {
      uiAlert('Ошибка: ' + err.message);
    }
  };
  reader.readAsText(file);
}

/* ============================================================
   CSV: массовый импорт игроков
   ============================================================ */

function importCSVFile() {
  const file = document.getElementById('csv-file').files[0];
  if (!file) { uiAlert('Выберите CSV-файл'); return; }

  const reader = new FileReader();
  reader.onload = e => {
    try {
      const lines = e.target.result.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) { uiAlert('Файл пуст'); return; }

      let added = 0;
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(';').map(c => c.trim());
        if (!cols[0]) continue;

        DB.players.push({
          id: 'p_' + Date.now() + '_' + i,
          fio: cols[0],
          team: cols[1] || '',
          city: cols[2] || '',
          position: cols[3] || 'Нападающий',
          grip: cols[4] || 'Правый',
          height: cols[5] || '',
          weight: cols[6] || '',
          birthYear: cols[7] || '',
          birthDay: '', birthMonth: '', firstSchool: '', photo: '', characteristic: '',
          accessPin: generatePin(),
          techDetail: defaultTechDetail(),
          otherDetail: defaultOtherDetail(),
          plans: {}, calendar: {}, stats: [], tests: [],
          developmentPlans: []
        });
        added++;
      }

      saveDB();
      uiAlert(`Добавлено игроков: ${added}.\nНе забудьте раздать PIN'ы через раздел «PIN-коды».`, () => {
        renderPlayers();
        showScreen('players');
      });
    } catch (err) {
      uiAlert('Ошибка: ' + err.message);
    }
  };
  reader.readAsText(file, 'UTF-8');
}

/* ============================================================
   Экспорт PIN-кодов игроков в Excel
   ============================================================ */

function exportPlayerPinsExcel() {
  if (!DB.players || !DB.players.length) { uiAlert('Нет игроков'); return; }
  const rows = [['ФИО', 'Амплуа', 'Команда', 'Год рождения', 'PIN']];
  DB.players.forEach(p => {
    rows.push([
      p.fio || '',
      p.position || '',
      p.team || '',
      p.birthYear || '',
      p.accessPin || ''
    ]);
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'PIN-коды');
  XLSX.writeFile(wb, `PIN-коды_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

/* ============================================================
   Очистка локальных данных
   ============================================================ */

function clearAll() {
  uiConfirm(
    'Удалить ВСЕ локальные данные? Данные в облаке останутся.',
    () => {
      localStorage.removeItem(STORAGE_KEY);
      DB = { players: [], exercises: [], meta: {}, testColumns: null };
      openAccordions.clear();
      saveDB();
      seedDemoData();
      renderPlayers();
      uiAlert('Локальные данные сброшены. Данные в облаке — при следующей синхронизации.');
    },
    () => {}
  );
}