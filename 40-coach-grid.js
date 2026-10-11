/* ============================================================
   40-coach-grid.js
   Месячная сетка календаря тренера.

   Содержит:
   - renderCoachCalendar / renderCoachMonthGrid — отрисовка
   - навигация по месяцам (shift, today)
   - сбор сессий за день (collectDaySessions + ключи группировки)
   - цвет сессии, длительность, диапазон времени
   ============================================================ */

/* ============================================================
   МЕСЯЧНАЯ СЕТКА
   ============================================================ */
function renderCoachCalendar() {
  const el = document.getElementById('coach-calendar-content');
  if (!el) return;

  const today = new Date();
  const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

  if (!coachCalMonth) coachCalMonth = currentMonth;

  const [year, month] = coachCalMonth.split('-').map(Number);

  el.innerHTML = `
    <div class="card cc-toolbar-card">
      <div class="cc-toolbar">
        <div class="cc-nav">
          <button class="cc-nav-btn" onclick="coachCalShiftMonth(-1)" title="Предыдущий месяц">‹</button>
          <div class="cc-month-title">${MONTH_NAMES_RU[month - 1]} ${year}</div>
          <button class="cc-nav-btn" onclick="coachCalShiftMonth(1)" title="Следующий месяц">›</button>
        </div>
        <button class="btn btn-sm btn-ghost" onclick="coachCalToday()">Текущий месяц</button>
        <button class="btn btn-sm" onclick="openNewSessionForDate(localDateStr(new Date()))">+ Тренировка</button>
        <div class="cc-legend">
          <span><span class="cc-dot cc-dot-self"></span> Самостоятельная</span>
          <span><span class="cc-dot cc-dot-ind"></span> Индивидуальная</span>
          <span><span class="cc-dot cc-dot-grp"></span> В группе</span>
        </div>
      </div>
    </div>
    <div class="card cc-month-card">
      <div class="cc-month-wrap">
        <div class="cc-month-head">
          ${DOW_SHORT_RU.map((d, i) => `<div class="cc-dow-head ${i >= 5 ? 'weekend' : ''}">${d}</div>`).join('')}
        </div>
        <div class="cc-month-grid" id="cc-month-grid"></div>
      </div>
    </div>
  `;

  renderCoachMonthGrid(year, month);
}

function coachCalShiftMonth(delta) {
  const [y, m] = coachCalMonth.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  coachCalMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  renderCoachCalendar();
}

function coachCalToday() {
  const today = new Date();
  coachCalMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  renderCoachCalendar();
}

function renderCoachMonthGrid(year, month) {
  const grid = document.getElementById('cc-month-grid');
  if (!grid) return;

  const first = new Date(year, month - 1, 1);
  let dow = first.getDay(); if (dow === 0) dow = 7;
  const firstMonday = new Date(year, month - 1, 1 - (dow - 1));

  const today = localDateStr(new Date());
  const days = [];

  for (let i = 0; i < 42; i++) {
    const d = new Date(firstMonday);
    d.setDate(firstMonday.getDate() + i);
    days.push(d);
  }
  while (days.length > 35) {
    const lastWeek = days.slice(-7);
    if (lastWeek.every(d => d.getMonth() !== (month - 1))) {
      days.length = days.length - 7;
    } else break;
  }

  let html = '';
  days.forEach(d => {
    const ds = localDateStr(d);
    const isOther = d.getMonth() !== (month - 1);
    const isWeekend = (d.getDay() === 0 || d.getDay() === 6);
    const isToday = ds === today;

    const sessions = collectDaySessions(ds);
    const total = sessions.length;
    const visible = sessions.slice(0, 3);

    html += `<div class="cc-day ${isOther ? 'other-month' : ''} ${isWeekend ? 'weekend' : ''} ${isToday ? 'today' : ''}"
                  onclick="openDaySessions('${ds}')">
      <div class="cc-day-head">
        <span class="cc-day-num ${isToday ? 'today-badge' : ''}">${d.getDate()}</span>
        ${total ? `<span class="cc-day-total">${total}</span>` : ''}
      </div>
      <div class="cc-day-bars">
        ${visible.map(sess => {
          const color = sessionColor(sess);
          const label = sess.name || (sess.blocks[0] && sess.blocks[0].complex) || 'Тренировка';
          const t = sessionFirstTime(sess);
          return `<div class="cc-day-bar" style="background:${color}">
            ${t ? `<span class="cc-bar-time">${escapeHtml(t)}</span>` : ''}
            <span class="cc-bar-label">${escapeHtml(label)}</span>
          </div>`;
        }).join('')}
        ${sessions.length > 3 ? `<div class="cc-more">+${sessions.length - 3} ещё</div>` : ''}
      </div>
    </div>`;
  });

  grid.innerHTML = html;
}

function sessionFirstTime(sess) {
  if (!sess || !Array.isArray(sess.blocks) || !sess.blocks.length) return '';
  const times = sess.blocks.map(b => b.startTime).filter(Boolean);
  if (!times.length) return '';
  return times.sort()[0];
}

/* ============================================================
   СБОР ТРЕНИРОВОК ЗА ДЕНЬ
   ============================================================ */
function collectDaySessions(ds) {
  const map = new Map();

  DB.players.forEach(p => {
    const day = p.calendar && p.calendar[ds];
    if (!Array.isArray(day)) return;
    day.forEach((sess, sessIdxInPlayer) => {
      if (!sess) return;

      const key = makeSessionGroupKey(sess, p, ds, sessIdxInPlayer);

      if (!map.has(key)) {
        map.set(key, {
          id: sess.id || (ds + '::' + key),
          realId: sess.id || null,
          groupId: sess.groupId || null,
          seriesId: sess.seriesId || null,
          name: sess.name || '',
          note: sess.note || '',
          blocks: [],
          players: []
        });
      }
      const entry = map.get(key);

      const existingKeys = new Set(entry.blocks.map(b => blockIdentityKey(b)));
      const incoming = Array.isArray(sess.blocks) ? sess.blocks : [];
      incoming.forEach(b => {
        const k = blockIdentityKey(b);
        if (existingKeys.has(k)) return;
        existingKeys.add(k);
        entry.blocks.push({ ...b });
      });

      if (!entry.players.find(x => x.id === p.id)) {
        entry.players.push({ id: p.id, fio: p.fio, team: p.team || '' });
      }
    });
  });

  map.forEach(entry => {
    entry.blocks.sort((a, b) => (a.startTime || '99:99').localeCompare(b.startTime || '99:99'));
  });

  return Array.from(map.values()).sort((a, b) => {
    const ta = sessionFirstTime(a);
    const tb = sessionFirstTime(b);
    return (ta || '').localeCompare(tb || '');
  });
}

function makeSessionGroupKey(sess, player, ds, sessIdxInPlayer) {
  if (sess.id) return 'id:' + sess.id;
  if (sess.groupId) return 'grp:' + sess.groupId + '|' + ds;

  const blocks = Array.isArray(sess.blocks) ? sess.blocks : [];
  const sigParts = blocks.map(b =>
    (b.id || '') + '|' + (b.startTime || '') + '|' + (b.complex || '') + '|' + (b.format || '') + '|' + (b.duration || '')
  ).sort().join(';');

  return 'solo:' + player.id + '|' + ds + '|' + sessIdxInPlayer + '|' + (sess.name || '') + '|' + sigParts;
}

function blockIdentityKey(b) {
  if (!b) return 'empty';
  if (b.id) return 'id:' + b.id;
  return 'sig:' + (b.startTime || '') + '|' + (b.complex || '') + '|' + (b.format || '') + '|' + (b.duration || '');
}

function sessionColor(sess) {
  const set = new Set();
  (sess.blocks || []).forEach(b => { if (b.format) set.add(b.format); });
  if (set.has('В группе')) return WORK_TYPE_COLORS['В группе'];
  if (set.has('Индивидуальная с тренером')) return WORK_TYPE_COLORS['Индивидуальная с тренером'];
  if (set.has('Самостоятельная')) return WORK_TYPE_COLORS['Самостоятельная'];
  return '#5a6169';
}

function sessionTotalMinutes(sess) {
  return (sess.blocks || []).reduce((acc, b) => acc + (Number(b.duration) || 0), 0);
}

function sessionTimeRange(sess) {
  if (!sess.blocks || !sess.blocks.length) return '';
  const sorted = sess.blocks
    .filter(b => b.startTime)
    .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
  if (!sorted.length) return '';
  const firstStart = sorted[0].startTime;
  const last = sorted[sorted.length - 1];
  const end = minutesToTime(timeToMinutes(last.startTime) + (Number(last.duration) || 0));
  return `${firstStart}–${end}`;
}