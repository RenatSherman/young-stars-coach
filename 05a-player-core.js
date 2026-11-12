/* ============================================================
   05a-player-core.js
   ============================================================ */

let __saveDBTimer = null;

function saveDB() {
  scheduleSync();
  if (__saveDBTimer) clearTimeout(__saveDBTimer);
  __saveDBTimer = setTimeout(() => {
    __saveDBTimer = null;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(DB)); } catch (e) {}
  }, 400);
}

function saveDBNow() {
  if (__saveDBTimer) { clearTimeout(__saveDBTimer); __saveDBTimer = null; }
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(DB)); } catch (e) {}
}

window.addEventListener('beforeunload', () => { saveDBNow(); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') saveDBNow();
});

/* ===== Миграция PIN ===== */
function __ensurePlayerPin(p) {
  if (!p) return;
  if (typeof p.accessPin !== 'string') p.accessPin = '';
}

function personPinKey(p) {
  if (!p) return '';
  return `${(p.fio || '').toLowerCase().trim()}|${(p.birthYear || '').toString().trim()}`;
}

function loadDB() {
  const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem('akbars_hockey_v1');
  if (raw) { try { DB = JSON.parse(raw); } catch (e) {} }

  if (!DB.players)   DB.players = [];
  if (!DB.exercises) DB.exercises = [];
  if (!DB.meta)      DB.meta = {};
  if (!DB.meta.updatedAt) DB.meta.updatedAt = {};
  if (!DB.seasons)   DB.seasons = {};
  if (!Array.isArray(DB.templates)) DB.templates = [];

  if (!DB.playerGroups) {
    DB.playerGroups = {
      stars: { id: 'g_stars', name: 'Звездочки', subgroups: [] },
      general: { id: 'g_general', name: 'Общая группа', subgroups: [] },
      special: { id: 'g_special', name: 'Спецгруппа', subgroups: [] }
    };
  }

  DB.players.forEach(p => {
    migrateCalendar(p);
    __ensurePlayerPin(p);
    if (!Array.isArray(p.developmentPlans)) p.developmentPlans = [];
    if (!p.groupId) p.groupId = 'g_stars';
  });

  // Миграция PIN во всех сезонах
  if (DB.seasons && typeof DB.seasons === 'object') {
    Object.keys(DB.seasons).forEach(k => {
      const s = DB.seasons[k];
      if (s && Array.isArray(s.players)) {
        s.players.forEach(__ensurePlayerPin);
      }
    });
  }
}

function seedDemoData() {
  if (DB.players.length > 0 || (Array.isArray(DB.exercises) && DB.exercises.length > 0)) return;
  DB.exercises = [
    { id: 'g_posadka', name: 'Посадка', subgroups: [
      { id: 'sg_pos1', name: 'Посадка 1', items: ['Прокат в посадке на двух ногах (лицом)', 'Прокат в посадке на правой ноге (лицом)'], links: {} }
    ]},
    { id: 'g_ottalk', name: 'Отталкивания', subgroups: [
      { id: 'sg_ott1', name: 'Отталкивания 1', items: ['Отталкивание внутренним ребром', 'Отталкивание внешним ребром'], links: {} }
    ]}
  ];
  touchMeta('exercises');
  saveDB();
}

function computeScores(p, mode) {
  if (!p || !p.techDetail || !p.otherDetail) return { tehn: null, fiz: null, takt: null, psih: null };
  const isEnd = mode === 'end';
  const techCol = isEnd ? 'end' : 'start';
  const otherCol = isEnd ? 'fact' : 'start';
  const avgOf = arr => {
    const vals = arr.filter(v => v != null && v !== '' && !isNaN(Number(v)));
    return vals.length ? vals.reduce((a, b) => a + Number(b), 0) / vals.length : null;
  };
  const tehn = avgOf(p.techDetail.map(r => r[techCol]));
  const groupAvg = g => avgOf(p.otherDetail.filter(r => r.group === g).map(r => r[otherCol]));
  return {
    tehn,
    fiz:  groupAvg('Физические качества'),
    takt: groupAvg('Тактические навыки'),
    psih: groupAvg('Психологические характеристики')
  };
}
function getCurrentScores(p) { return computeScores(p, 'start'); }
function getEndScores(p)     { return computeScores(p, 'end'); }
function overallScore(p) {
  const s = getCurrentScores(p);
  const vals = [s.tehn, s.fiz, s.takt, s.psih].filter(v => v != null);
  if (!vals.length) return '—';
  return (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1);
}
function overallScoreEnd(p) {
  const s = getEndScores(p);
  const vals = [s.tehn, s.fiz, s.takt, s.psih].filter(v => v != null);
  if (!vals.length) return '—';
  return (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1);
}

function addPlayer() {
  let groupOptions = `<option value="g_stars">Звездочки</option><option value="g_special">Спецгруппа</option>`;
  if (DB.playerGroups && DB.playerGroups.general.subgroups) {
    DB.playerGroups.general.subgroups.forEach(sg => {
      groupOptions += `<option value="${escapeAttr(sg.id)}">Общая группа · ${escapeHtml(sg.name)}</option>`;
    });
  }

  openModal(`<h3>Новый игрок</h3>
    <div class="field"><label>ФИО</label><input id="np-fio" autofocus></div>
    <div class="field"><label>Группа</label><select id="np-group">${groupOptions}</select></div>
    <div class="field"><label>Команда (текст)</label><input id="np-team" placeholder="Ак Барс 2012"></div>
    <div class="field"><label>Город</label><input id="np-city" placeholder="Казань"></div>
    <div class="field"><label>Амплуа</label><select id="np-pos"><option>Нападающий</option><option>Защитник</option><option>Вратарь</option></select></div>
    <div class="btn-row" style="margin-top:16px">
      <button class="btn" onclick="saveNewPlayer()">Создать</button>
      <button class="btn" onclick="closeModal()">Отмена</button>
    </div>`);
  setTimeout(() => document.getElementById('np-fio')?.focus(), 100);
}

function saveNewPlayer() {
  const fio = document.getElementById('np-fio').value.trim();
  if (!fio) { uiAlert('Введите ФИО'); return; }
  const pinInput = document.getElementById('np-pin');
  let pin = (pinInput ? pinInput.value : '').trim();
  if (!/^\d{4}$/.test(pin)) pin = generatePin();

  // БЕРЕМ СТРУКТУРУ НАВЫКОВ ОТ ПЕРВОГО ИГРОКА В СПИСКЕ
  let techD = [];
  let otherD = [];
  
  if (DB.players && DB.players.length > 0) {
    const etalon = DB.players[0];
    techD = JSON.parse(JSON.stringify(etalon.techDetail || []));
    otherD = JSON.parse(JSON.stringify(etalon.otherDetail || []));
  } else {
    techD = defaultTechDetail();
    otherD = defaultOtherDetail();
  }

  techD.forEach(r => { r.start = null; r.mid = null; r.end = null; });
  otherD.forEach(r => { r.start = null; r.plan = null; r.fact = null; });

  DB.players.push({
    id: 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    fio,
    groupId: document.getElementById('np-group').value,
    birthDay: '', birthMonth: '', birthYear: '',
    height: '', weight: '',
    team: document.getElementById('np-team').value,
    city: document.getElementById('np-city').value,
    firstSchool: '',
    position: document.getElementById('np-pos').value,
    grip: 'Правый', photo: '', characteristic: '',
    accessPin: pin,
    techDetail: techD,
    otherDetail: otherD,
    plans: {}, calendar: {}, stats: [], tests: [],
    developmentPlans: []
  });

  if (DB.seasons && currentSeason && DB.seasons[currentSeason]) {
    DB.seasons[currentSeason].players = DB.players;
  }

  touchMeta('players');
  saveDB(); closeModal(); renderPlayers();
  toast(`Игрок «${fio}» добавлен. PIN: ${pin}`);
}

// ... ОСТАЛЬНЫЕ ФУНКЦИИ (confirmDeletePlayer, doDeletePlayer, openPlayer и т.д.) остаются без изменений ...