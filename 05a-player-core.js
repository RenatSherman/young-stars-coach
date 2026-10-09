/* ============================================================
   05a-player-core.js
   Ядро карточки игрока.
   saveDB дебаунсится — не блокирует UI на каждом изменении.
   ============================================================ */

/* ===== Debounce сохранения в localStorage ===== */
let __saveDBTimer = null;

function saveDB() {
  scheduleSync();
  if (__saveDBTimer) clearTimeout(__saveDBTimer);
  __saveDBTimer = setTimeout(() => {
    __saveDBTimer = null;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(DB)); }
    catch (e) { console.warn('saveDB: не удалось сохранить', e); }
  }, 400);
}

function saveDBNow() {
  if (__saveDBTimer) { clearTimeout(__saveDBTimer); __saveDBTimer = null; }
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(DB)); }
  catch (e) { console.warn('saveDBNow: не удалось сохранить', e); }
}

window.addEventListener('beforeunload', () => { saveDBNow(); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') saveDBNow();
});

/* ===== Загрузка ===== */
function loadDB() {
  const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem('akbars_hockey_v1');
  if (raw) { try { DB = JSON.parse(raw); } catch (e) { console.error(e); } }
  if (!DB.players)   DB.players = [];
  if (!DB.exercises) DB.exercises = [];
  if (!DB.meta)      DB.meta = {};
  if (!DB.seasons)   DB.seasons = {};
  DB.players.forEach(p => {
    migrateCalendar(p);
    if (!Array.isArray(p.developmentPlans)) p.developmentPlans = [];
  });
}

function seedDemoData() {
  if (DB.players.length > 0 || (Array.isArray(DB.exercises) && DB.exercises.length > 0)) return;
  DB.exercises = [
    { id: 'g_posadka', name: 'Посадка', subgroups: [
      { id: 'sg_pos1', name: 'Посадка 1', items: ['Прокат в посадке на двух ногах (лицом)', 'Прокат в посадке на правой ноге (лицом)'], links: {} }
    ]},
    { id: 'g_ottalk', name: 'Отталкивания', subgroups: [
      { id: 'sg_ott1', name: 'Отталкивания 1', items: ['Отталкивание внутренним ребром', 'Отталкивание внешним ребром'], links: {} }
    ]},
    { id: 'g_fonar', name: 'Фонарики', subgroups: [
      { id: 'sg_fon1', name: 'Фонарики 1', items: ['Фонарики', 'Полуфонарики правой ногой'], links: {} }
    ]}
  ];
  saveDB();
}

/* ===== Оценки ===== */
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

/* ===== Создание ===== */
function addPlayer() {
  openModal(`<h3>Новый игрок</h3>
    <div class="field"><label>ФИО</label><input id="np-fio" autofocus></div>
    <div class="field"><label>Команда</label><input id="np-team" placeholder="Ак Барс 2012"></div>
    <div class="field"><label>Город</label><input id="np-city" placeholder="Казань"></div>
    <div class="field"><label>Амплуа</label><select id="np-pos"><option>Нападающий</option><option>Защитник</option><option>Вратарь</option></select></div>
    <div class="btn-row" style="margin-top:16px">
      <button class="btn" onclick="saveNewPlayer()">Создать</button>
      <button class="btn-ghost btn" onclick="closeModal()">Отмена</button>
    </div>`);
  setTimeout(() => document.getElementById('np-fio')?.focus(), 100);
}

function saveNewPlayer() {
  const fio = document.getElementById('np-fio').value.trim();
  if (!fio) { alert('Введите ФИО'); return; }
  DB.players.push({
    id: 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    fio,
    birthDay: '', birthMonth: '', birthYear: '',
    height: '', weight: '',
    team: document.getElementById('np-team').value,
    city: document.getElementById('np-city').value,
    firstSchool: '',
    position: document.getElementById('np-pos').value,
    grip: 'Правый', photo: '', characteristic: '',
    techDetail: defaultTechDetail(),
    otherDetail: defaultOtherDetail(),
    plans: {}, calendar: {}, stats: [], tests: [],
    developmentPlans: []
  });

  if (DB.seasons && currentSeason && DB.seasons[currentSeason]) {
    DB.seasons[currentSeason].players = DB.players;
  }

  saveDB(); closeModal(); renderPlayers();
  toast(`Игрок «${fio}» добавлен`);
}

/* ===== Удаление ===== */
function confirmDeletePlayer(pid) {
  const p = DB.players.find(x => x.id === pid);
  if (!p) return;
  const scoresCount = (p.techDetail || []).filter(r => r.start != null || r.end != null).length
                    + (p.otherDetail || []).filter(r => r.start != null || r.fact != null).length;
  const calCount = p.calendar
    ? Object.values(p.calendar).reduce((acc, day) => acc + (Array.isArray(day) ? day.reduce((s, sess) => s + (Array.isArray(sess.blocks) ? sess.blocks.length : 0), 0) : 0), 0)
    : 0;
  const statsCount = (p.stats || []).filter(s => s.club || s.season).length;
  const testsCount = (p.tests || []).filter(t => t.date).length;
  const devCount = (p.developmentPlans || []).length;
  const hasData = scoresCount + calCount + statsCount + testsCount + devCount > 0;
  const lastName = (p.fio || '').trim().split(/\s+/)[0] || '';
  const needConfirm = hasData && lastName;

  openModal(`
    <h3 style="color:var(--ak-red-dark)">Удаление игрока</h3>
    <div class="danger-box">
      <h4>⚠ Внимание</h4>
      <p>Вы собираетесь удалить игрока:</p>
      <p style="font-weight:900;font-size:16px;color:var(--ak-green);margin:8px 0;font-family:var(--font-display);text-transform:uppercase">${escapeHtml(p.fio)}</p>
      ${hasData ? `
        <p>Вместе с ним будут удалены:</p>
        <ul>
          ${scoresCount ? `<li>${scoresCount} ${plural(scoresCount, 'оценка', 'оценки', 'оценок')} навыков</li>` : ''}
          ${calCount ? `<li>${calCount} ${plural(calCount, 'блок', 'блока', 'блоков')} в календаре</li>` : ''}
          ${statsCount ? `<li>${statsCount} ${plural(statsCount, 'строка', 'строки', 'строк')} статистики</li>` : ''}
          ${testsCount ? `<li>${testsCount} ${plural(testsCount, 'тест', 'теста', 'тестов')}</li>` : ''}
          ${devCount ? `<li>${devCount} ${plural(devCount, 'цель', 'цели', 'целей')} развития</li>` : ''}
        </ul>
        <p><strong>Действие необратимо.</strong> Рекомендуем сначала экспортировать данные игрока в PDF.</p>
      ` : '<p>У игрока пока нет данных. Удаление безопасно.</p>'}
    </div>
    ${needConfirm ? `
      <div class="field">
        <label>Для подтверждения введите фамилию игрока: <strong>${escapeHtml(lastName)}</strong></label>
        <input id="del-confirm" placeholder="${escapeAttr(lastName)}" autocomplete="off">
      </div>
    ` : ''}
    <div class="btn-row" style="margin-top:16px">
      <button class="btn btn-red" id="del-final-btn" onclick="doDeletePlayer('${pid}')" ${needConfirm ? 'disabled style="opacity:.5;cursor:not-allowed"' : ''}>🗑 Удалить навсегда</button>
      <button class="btn-ghost btn" onclick="closeModal()">Отмена</button>
      <button class="btn btn-ghost" onclick="closeModal();exportPlayerToPDF('${pid}')" style="margin-left:auto">📄 Сначала экспорт</button>
    </div>
  `);

  if (needConfirm) {
    setTimeout(() => {
      const inp = document.getElementById('del-confirm');
      const btn = document.getElementById('del-final-btn');
      if (!inp || !btn) return;
      inp.focus();
      inp.addEventListener('input', () => {
        const ok = inp.value.trim().toLowerCase() === lastName.toLowerCase();
        btn.disabled = !ok;
        btn.style.opacity = ok ? '1' : '.5';
        btn.style.cursor = ok ? 'pointer' : 'not-allowed';
      });
    }, 100);
  }
}
function doDeletePlayer(pid) {
  const p = DB.players.find(x => x.id === pid);
  if (!p) return;
  DB.players = DB.players.filter(x => x.id !== pid);
  if (DB.seasons && currentSeason && DB.seasons[currentSeason]) {
    DB.seasons[currentSeason].players = DB.players;
  }
  saveDB(); closeModal();
  currentPlayerId = null;
  showScreen('players'); renderPlayers(); updateNotifBadge();
  toast(`Игрок «${p.fio}» удалён`);
}
function deletePlayerFromTile(event, pid) { event.stopPropagation(); confirmDeletePlayer(pid); }

/* ===== Открытие карточки ===== */
function openPlayer(id) {
  currentPlayerId = id;
  currentTab = 'skills';
  const p = DB.players.find(x => x.id === id);
  if (!p) return;
  currentPlanMonth = null;
  if (typeof playerCalMonth !== 'undefined') playerCalMonth = null;
  showScreen('player');
  renderPlayerCard(p);
}

/* ===== Рендер карточки ===== */
function renderPlayerCard(p) {
  const el = document.getElementById('player-card');
  if (!el) return;
  const s = getCurrentScores(p);
  const sEnd = getEndScores(p);
  const age = computeAge(p);

  el.innerHTML = `
    <div class="card"><div class="passport">
      <div>
        <div class="passport-photo">${p.photo ? `<img src="${p.photo}">` : 'ФОТО'}</div>
        <div style="margin-top:12px;text-align:center" class="no-print">
          <button class="btn btn-sm btn-ghost" onclick="uploadPhoto('${p.id}')">Загрузить фото</button></div>
      </div>
      <div>
        <h1 contenteditable="true" onblur="updateField('${p.id}','fio',this.innerText)" style="outline:none;border-radius:4px;padding:2px 4px">${escapeHtml(p.fio)}</h1>
        <p class="subtitle">${escapeHtml(p.team)} · ${escapeHtml(p.city)}</p>
        <div class="passport-fields">
          <div class="field"><label>День рождения</label><div class="value" contenteditable="true" onblur="updateField('${p.id}','birthDay',this.innerText);updateAgeDisplay('${p.id}')">${escapeHtml(p.birthDay)}</div></div>
          <div class="field"><label>Месяц</label><div class="value" contenteditable="true" onblur="updateField('${p.id}','birthMonth',this.innerText);updateAgeDisplay('${p.id}')">${escapeHtml(p.birthMonth)}</div></div>
          <div class="field"><label>Год</label><div class="value" contenteditable="true" onblur="updateField('${p.id}','birthYear',this.innerText);updateAgeDisplay('${p.id}')">${escapeHtml(p.birthYear)}</div></div>
          <div class="field"><label>Возраст</label><div class="value readonly" id="age-field-${p.id}">${age || '—'}</div></div>
          <div class="field"><label>Рост (см)</label><div class="value" contenteditable="true" onblur="updateField('${p.id}','height',this.innerText)">${escapeHtml(p.height)}</div></div>
          <div class="field"><label>Вес (кг)</label><div class="value" contenteditable="true" onblur="updateField('${p.id}','weight',this.innerText)">${escapeHtml(p.weight)}</div></div>
          <div class="field"><label>Команда</label><div class="value" contenteditable="true" onblur="updateField('${p.id}','team',this.innerText)">${escapeHtml(p.team)}</div></div>
          <div class="field"><label>Город</label><div class="value" contenteditable="true" onblur="updateField('${p.id}','city',this.innerText)">${escapeHtml(p.city)}</div></div>
          <div class="field"><label>Первая школа</label><div class="value" contenteditable="true" onblur="updateField('${p.id}','firstSchool',this.innerText)">${escapeHtml(p.firstSchool)}</div></div>
          <div class="field"><label>Амплуа</label><select class="value" style="border:none;background:transparent" onchange="updateField('${p.id}','position',this.value)">
            ${['Нападающий','Защитник','Вратарь'].map(o => `<option ${p.position === o ? 'selected' : ''}>${o}</option>`).join('')}</select></div>
          <div class="field"><label>Хват</label><select class="value" style="border:none;background:transparent" onchange="updateField('${p.id}','grip',this.value)">
            ${['Правый','Левый'].map(o => `<option ${p.grip === o ? 'selected' : ''}>${o}</option>`).join('')}</select></div>
          <div class="char-block"><label>Краткая характеристика</label>
            <div class="value" contenteditable="true" onblur="updateField('${p.id}','characteristic',this.innerText)">${escapeHtml(p.characteristic)}</div></div>
        </div>
      </div>
    </div></div>

    <div class="card"><h2>Профиль навыков</h2>
      <p class="subtitle" style="margin-top:-8px">Оценки рассчитываются автоматически как средние по разделам</p>
      <div class="radar-wrap">
        <div class="radar-box"><canvas id="radar-${p.id}"></canvas></div>
        <div class="scores-legend">
          ${scoreDisplay('Техника', s.tehn, 'среднее по «Технике»')}
          ${scoreDisplay('Физика', s.fiz, 'раздел «Физические качества»')}
          ${scoreDisplay('Тактика', s.takt, 'раздел «Тактические навыки»')}
          ${scoreDisplay('Психология', s.psih, 'раздел «Психологические характеристики»')}
          <div style="margin-top:8px;padding:14px;background:var(--ak-green);color:#fff;border-radius:4px;text-align:center;border-bottom:4px solid var(--ak-red)">
            <div style="font-size:10px;text-transform:uppercase;letter-spacing:2px;opacity:.85;font-family:var(--font-display);font-weight:900">Общая оценка</div>
            <div style="font-size:32px;font-weight:900;font-family:var(--font-display)">${overallScore(p)}</div></div>
        </div>
      </div>
    </div>

    <div class="card red-top"><h2>Динамика: начало сезона → конец сезона</h2>
      <div class="radar-wrap">
        <div class="radar-box"><canvas id="radar2-${p.id}"></canvas></div>
        <div class="scores-legend">
          ${scoreDisplay('Техника (конец)', sEnd.tehn, 'столбец «Конец»')}
          ${scoreDisplay('Физика (конец)', sEnd.fiz, 'столбец «Конец»')}
          ${scoreDisplay('Тактика (конец)', sEnd.takt, 'столбец «Конец»')}
          ${scoreDisplay('Психология (конец)', sEnd.psih, 'столбец «Конец»')}
          <div style="margin-top:8px;padding:14px;background:var(--ak-red);color:#fff;border-radius:4px;text-align:center">
            <div style="font-size:10px;text-transform:uppercase;letter-spacing:2px;opacity:.9;font-family:var(--font-display);font-weight:900">Общая (конец)</div>
            <div style="font-size:32px;font-weight:900;font-family:var(--font-display)">${overallScoreEnd(p)}</div></div>
        </div>
      </div>
    </div>

    <div class="tabs no-print">
      <button data-tab="skills" class="${currentTab === 'skills' ? 'active' : ''}">Навыки</button>
      <button data-tab="development" class="${currentTab === 'development' ? 'active' : ''}">План развития</button>
      <button data-tab="calendar" class="${currentTab === 'calendar' ? 'active' : ''}">Календарь</button>
      <button data-tab="stats" class="${currentTab === 'stats' ? 'active' : ''}">Статистика</button>
      <button data-tab="tests" class="${currentTab === 'tests' ? 'active' : ''}">Тесты</button>
      <button data-tab="charts" class="${currentTab === 'charts' ? 'active' : ''}">Графики</button>
    </div>

    <div id="tab-skills" class="tab-content ${currentTab === 'skills' ? 'active' : ''}">${renderSkillsTab(p)}</div>
    <div id="tab-development" class="tab-content ${currentTab === 'development' ? 'active' : ''}">${renderDevelopmentPlan(p)}</div>
    <div id="tab-calendar" class="tab-content ${currentTab === 'calendar' ? 'active' : ''}">${renderPlayerCalendarTab(p)}</div>
    <div id="tab-stats" class="tab-content ${currentTab === 'stats' ? 'active' : ''}">${renderStats(p)}</div>
    <div id="tab-tests" class="tab-content ${currentTab === 'tests' ? 'active' : ''}">${renderTests(p)}</div>
    <div id="tab-charts" class="tab-content ${currentTab === 'charts' ? 'active' : ''}">${renderTestCharts(p)}</div>
  `;

  el.querySelectorAll('.tabs button').forEach(btn => {
    btn.addEventListener('click', () => {
      currentTab = btn.dataset.tab;
      el.querySelectorAll('.tabs button').forEach(b => b.classList.remove('active'));
      el.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
      if (btn.dataset.tab === 'charts')      drawTestCharts(p);
      if (btn.dataset.tab === 'calendar')    renderPlayerCalendarContent(p);
      if (btn.dataset.tab === 'development') renderDevelopmentPlanContent(p);
      if (btn.dataset.tab === 'skills')      renderSkillsContent(p);
    });
  });

  drawRadar(p);
  drawRadarCompare(p);
  if (currentTab === 'charts')      drawTestCharts(p);
  if (currentTab === 'calendar')    renderPlayerCalendarContent(p);
  if (currentTab === 'development') renderDevelopmentPlanContent(p);
  if (currentTab === 'skills')      renderSkillsContent(p);
}

/* ===== Утилиты ===== */
function updateField(playerId, field, val) {
  const p = DB.players.find(x => x.id === playerId);
  if (!p || p[field] === val) return;
  p[field] = val;
  saveDB();
}
function scoreDisplay(label, val, hint) {
  const v = val != null ? val : 0;
  return `<div class="score-item">
    <span class="lbl">${label}</span>
    <span class="bar"><span style="width:${v * 10}%"></span></span>
    <span class="val">${val != null ? val.toFixed(1) : '—'}</span>
    <span class="hint">${hint || ''}</span>
  </div>`;
}
function refreshProfile(pid) {
  const p = DB.players.find(x => x.id === pid);
  if (!p) return;
  const scrollY = window.scrollY;
  const savedTab = currentTab;
  renderPlayerCard(p);
  currentTab = savedTab;
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === savedTab));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === 'tab-' + savedTab));
  window.scrollTo(0, scrollY);
}