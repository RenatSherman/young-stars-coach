/* ============================================================
   04-ui.js
   Навигация, бургер-меню, уведомления, рендер игроков, дашборд.
   Миграция календаря приводит старые форматы к новому с блоками.
   + инициализация селектора сезонов и плашки архива.
   ============================================================ */

function goHome() {
  currentPlayerId = null;
  currentTab = 'skills';
  showScreen('players');
}

function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const target = document.getElementById('screen-' + name);
  if (target) target.classList.add('active');
  document.querySelectorAll('nav button[data-screen]').forEach(b => {
    b.classList.toggle('active', b.dataset.screen === name);
  });

  setTimeout(() => {
    try {
      if (name === 'players')        renderPlayers();
      if (name === 'exercises')      renderExercises();
      if (name === 'dashboard')      renderDashboard();
      if (name === 'report')         renderReport();
      if (name === 'coach-calendar') renderCoachCalendar();
      if (name === 'coach-report')   renderCoachReport();
    } catch (err) {
      console.error('showScreen error for', name, err);
    }
  }, 0);

  closeMobileNav();
  const notifPanel = document.getElementById('notif-panel');
  if (notifPanel) notifPanel.classList.remove('active');
  window.scrollTo(0, 0);

  // Плашка архива при переключении экранов (на всякий случай)
  if (typeof updateArchiveBadge === 'function') updateArchiveBadge();
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('nav button[data-screen]').forEach(btn => {
    btn.addEventListener('click', () => showScreen(btn.dataset.screen));
  });

  // Селектор сезона — рендерим, когда DOM готов
  if (typeof renderSeasonSelector === 'function') renderSeasonSelector();
  if (typeof updateArchiveBadge === 'function')   updateArchiveBadge();
});

function toggleMobileNav(e) {
  if (e) e.stopPropagation();
  const nav = document.getElementById('main-nav');
  if (nav) nav.classList.toggle('open');
}
function closeMobileNav() {
  const nav = document.getElementById('main-nav');
  if (nav) nav.classList.remove('open');
}
document.addEventListener('click', e => {
  const nav = document.getElementById('main-nav');
  if (!nav || !nav.classList.contains('open')) return;
  if (e.target.closest('#main-nav') || e.target.closest('#burger-btn')) return;
  closeMobileNav();
});

/* ============================================================
   МИГРАЦИЯ КАЛЕНДАРЯ
   ============================================================ */
function migrateCalendar(p) {
  if (!p.calendar) { p.calendar = {}; return; }
  let needSave = false;

  const hasWeekKeys = Object.keys(p.calendar).some(k => /^\d{4}-W\d+$/.test(k));
  if (hasWeekKeys) {
    const newCal = {};
    Object.keys(p.calendar).forEach(k => {
      if (/^\d{4}-W\d+$/.test(k)) {
        Object.keys(p.calendar[k]).forEach(date => {
          if (/^\d{4}-\d{2}-\d{2}$/.test(date)) newCal[date] = p.calendar[k][date];
        });
      } else {
        newCal[k] = p.calendar[k];
      }
    });
    p.calendar = newCal;
    needSave = true;
  }

  Object.keys(p.calendar).forEach(date => {
    const day = p.calendar[date];
    if (!day) return;

    if (Array.isArray(day) && day.every(s => s && Array.isArray(s.blocks))) {
      day.forEach(sess => {
        if (!sess.id) { sess.id = uid('sess'); needSave = true; }
        (sess.blocks || []).forEach(b => {
          if (!b.id) { b.id = uid('blk'); needSave = true; }
          if (b.complex === undefined) b.complex = b.block || '';
          if (b.format === undefined) b.format = (b.workTypes && b.workTypes[0]) || (b.wt && b.wt[0]) || '';
          if (b.comment === undefined) b.comment = '';
        });
      });
      return;
    }

    if (!Array.isArray(day) && typeof day === 'object') {
      p.calendar[date] = oldTimeObjectToSessions(day);
      needSave = true;
      return;
    }

    if (Array.isArray(day)) {
      p.calendar[date] = day.map(oldSessionToNew).filter(Boolean);
      needSave = true;
    }
  });

  if (needSave) saveDB();
}

function oldTimeObjectToSessions(day) {
  const times = Object.keys(day).sort();
  const groups = {};
  times.forEach(time => {
    const c = day[time];
    if (!c) return;
    if (!c.ex && !c.note && (!c.wt || !c.wt.length)) return;
    const key = c.groupId || ('single_' + time + '_' + Math.random().toString(36).slice(2, 6));
    if (!groups[key]) {
      groups[key] = {
        id: uid('sess'),
        name: c.ex || '',
        note: c.note || '',
        groupId: c.groupId || null,
        blocks: []
      };
    }
    groups[key].blocks.push({
      id: uid('blk'),
      complex: c.ex || '',
      format: (Array.isArray(c.wt) && c.wt[0]) ? c.wt[0] : '',
      startTime: time,
      duration: 15,
      fact: c.fact || '',
      comment: c.comment || '',
      note: ''
    });
  });
  const result = Object.values(groups);
  result.forEach(s => s.blocks.sort((a, b) => (a.startTime || '').localeCompare(b.startTime || '')));
  return result;
}

function oldSessionToNew(s) {
  if (!s) return null;
  if (Array.isArray(s.blocks)) {
    if (!s.id) s.id = uid('sess');
    return s;
  }

  const startT = s.timeStart || s.startTime || '18:00';
  const endT = s.timeEnd || s.endTime || '';
  let duration = Number(s.duration) || 0;
  if (!duration && endT) duration = Math.max(0, timeToMinutes(endT) - timeToMinutes(startT));
  if (!duration) duration = 60;

  return {
    id: s.id || uid('sess'),
    name: s.name || s.block || '',
    note: s.note || '',
    groupId: s.groupId || null,
    blocks: [{
      id: uid('blk'),
      complex: s.block || s.name || '',
      format: (Array.isArray(s.workTypes) && s.workTypes[0]) || (Array.isArray(s.wt) && s.wt[0]) || '',
      startTime: startT,
      duration: duration,
      fact: s.fact || '',
      comment: s.comment || '',
      note: ''
    }]
  };
}

/* ===== Уведомления ===== */
function collectNotifications() {
  const today = localDateStr(new Date());
  const weekAhead = localDateStr(new Date(Date.now() + 7 * 86400000));
  const items = [];

  DB.players.forEach(p => {
    if (!p.calendar) return;
    Object.keys(p.calendar).forEach(date => {
      const day = p.calendar[date];
      if (!Array.isArray(day)) return;
      day.forEach(sess => {
        if (!sess || !Array.isArray(sess.blocks)) return;
        sess.blocks.forEach(b => {
          if (!b) return;
          if (!b.complex && !b.format && !b.note) return;
          const time = b.startTime || '';
          const ex = b.complex || b.format || '';
          const who = p.fio, pid = p.id;
          if (date < today) items.push({ type: 'overdue', date, time, ex, note: b.note, who, pid, label: 'Просрочено' });
          else if (date === today) items.push({ type: 'today', date, time, ex, note: b.note, who, pid, label: 'Сегодня' });
          else if (date <= weekAhead) items.push({ type: 'soon', date, time, ex, note: b.note, who, pid, label: 'Скоро' });
        });
      });
    });
  });

  items.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  return items;
}

function updateNotifBadge() {
  const items = collectNotifications();
  const urgent = items.filter(i => i.type === 'overdue' || i.type === 'today').length;
  const badge = document.getElementById('notif-badge');
  if (!badge) return;
  if (urgent > 0) { badge.textContent = urgent; badge.style.display = 'block'; }
  else badge.style.display = 'none';
}

function toggleNotif(e) {
  if (e) e.stopPropagation();
  const panel = document.getElementById('notif-panel');
  if (!panel) return;
  const items = collectNotifications();
  if (panel.classList.contains('active')) { panel.classList.remove('active'); return; }

  if (!items.length) {
    panel.innerHTML = '<p class="subtitle" style="text-align:center;padding:20px 0">Нет уведомлений</p>';
  } else {
    panel.innerHTML = `<h3 style="margin-bottom:12px">Уведомления (${items.length})</h3>` +
      items.map(i => `<div class="notif-item ${i.type}" onclick="openPlayer('${i.pid}');toggleNotif(event)">
        <div class="n-title">${i.label} · ${escapeHtml(i.ex || '')}</div>
        <div class="n-meta">${formatDate(i.date)} ${i.time} · ${escapeHtml((i.who || '').split(' ')[0])}${i.note ? ' · ' + escapeHtml(i.note) : ''}</div>
      </div>`).join('');
  }
  panel.classList.add('active');
}

document.addEventListener('click', e => {
  const panel = document.getElementById('notif-panel');
  if (!panel) return;
  if (!panel.contains(e.target) && !e.target.closest('.notif-btn')) panel.classList.remove('active');
});

/* ===== Список игроков ===== */
function renderPlayers() {
  const el = document.getElementById('players-list');
  if (!el) return;
  if (!DB.players.length) {
    el.innerHTML = '<div class="empty-state"><div class="big">🐯</div><p>Пока нет игроков.<br>Нажмите «Добавить игрока» или загрузите из Excel.</p></div>';
    return;
  }
  el.innerHTML = DB.players.map(p => {
    const avatar = p.photo ? `<img src="${p.photo}" alt="${escapeAttr(p.fio)}">` : (p.fio ? escapeHtml(p.fio[0]) : '?');
    return `<div class="player-tile" onclick="openPlayer('${p.id}')">
      <button class="tile-delete no-print" title="Удалить игрока" onclick="deletePlayerFromTile(event, '${p.id}')">🗑</button>
      <div class="player-avatar">${avatar}</div>
      <div class="player-info">
        <div class="name">${escapeHtml(p.fio || 'Без имени')}</div>
        <div class="meta">${escapeHtml(p.position || '')} · ${escapeHtml(p.team || '')}</div>
      </div>
      <div class="player-score">${overallScore(p)}</div>
    </div>`;
  }).join('');
  updateNotifBadge();
}

/* ===== Дашборд ===== */
function renderDashboard() {
  const el = document.getElementById('dashboard-content');
  if (!el) return;

  if (!DB.players.length) {
    el.innerHTML = `
      <div class="card"><div class="empty-state"><div class="big">📊</div><p>Нет данных.</p></div></div>
      <div class="card"><h2>Быстрые переходы</h2>
        <div class="btn-row" style="margin:0">
          <button class="btn" onclick="showScreen('coach-calendar')">📅 Календарь тренера</button>
          <button class="btn btn-red" onclick="showScreen('coach-report')">📊 Отчёт тренера</button>
        </div>
      </div>`;
    return;
  }

  const n = DB.players.length;
  const avgField = f => {
    const v = DB.players.map(p => getCurrentScores(p)[f]).filter(x => x != null);
    return v.length ? (v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) : '—';
  };
  const avgOverall = (() => {
    const v = DB.players.map(p => overallScore(p)).filter(x => x !== '—');
    return v.length ? (v.reduce((a, b) => a + Number(b), 0) / v.length).toFixed(1) : '—';
  })();
  const upcoming = collectNotifications().filter(i => i.type !== 'overdue').slice(0, 10);

  el.innerHTML = `
    <div class="card" style="border-top-color:var(--ak-red)">
      <h2>Быстрые переходы</h2>
      <div class="btn-row" style="margin:0">
        <button class="btn" onclick="showScreen('coach-calendar')">📅 Календарь тренера</button>
        <button class="btn btn-red" onclick="showScreen('coach-report')">📊 Отчёт тренера</button>
        <button class="btn btn-ghost" onclick="showScreen('report')">📄 Отчёт по игрокам</button>
      </div>
    </div>
    <div class="dash-grid">
      <div class="kpi"><div class="lbl">Игроков</div><div class="val">${n}</div><div class="sub">в группе развития</div></div>
      <div class="kpi red"><div class="lbl">Средняя общая</div><div class="val">${avgOverall}</div><div class="sub">из 10 баллов</div></div>
      <div class="kpi"><div class="lbl">Техника</div><div class="val">${avgField('tehn')}</div><div class="sub">средняя по группе</div></div>
      <div class="kpi red"><div class="lbl">Физика</div><div class="val">${avgField('fiz')}</div><div class="sub">средняя по группе</div></div>
      <div class="kpi"><div class="lbl">Тактика</div><div class="val">${avgField('takt')}</div><div class="sub">средняя по группе</div></div>
      <div class="kpi red"><div class="lbl">Психология</div><div class="val">${avgField('psih')}</div><div class="sub">средняя по группе</div></div>
    </div>
    <div class="card"><h2>Сравнение игроков</h2>
      <div style="position:relative;height:380px"><canvas id="dash-radar"></canvas></div></div>
    <div class="card"><h2>Сводная таблица</h2>
      <div style="overflow-x:auto">
      <table><thead><tr><th>Игрок</th><th>Амплуа</th><th>Команда</th><th>Тех</th><th>Физ</th><th>Такт</th><th>Псих</th><th>Общая</th></tr></thead>
      <tbody>${DB.players.map(p => {
        const s = getCurrentScores(p);
        return `<tr style="cursor:pointer" onclick="openPlayer('${p.id}')">
        <td><strong>${escapeHtml(p.fio)}</strong></td><td>${escapeHtml(p.position || '')}</td><td>${escapeHtml(p.team || '')}</td>
        <td>${s.tehn != null ? s.tehn.toFixed(1) : '—'}</td>
        <td>${s.fiz != null ? s.fiz.toFixed(1) : '—'}</td>
        <td>${s.takt != null ? s.takt.toFixed(1) : '—'}</td>
        <td>${s.psih != null ? s.psih.toFixed(1) : '—'}</td>
        <td><strong style="color:var(--ak-green);font-family:var(--font-display)">${overallScore(p)}</strong></td></tr>`;
      }).join('')}
      </tbody></table></div></div>
    <div class="card red-top"><h2>Ближайшие тренировки</h2>
      ${upcoming.length ? upcoming.map(u => `<div class="upcoming" onclick="openPlayer('${u.pid}')">
        <div class="date">${formatDate(u.date)} · ${u.time}</div>
        <div class="what"><strong>${escapeHtml(u.ex || '')}</strong>${u.note ? ' · ' + escapeHtml(u.note) : ''}</div>
        <div class="who">${escapeHtml((u.who || '').split(' ')[0])}</div></div>`).join('') : '<p class="subtitle">Нет запланированных тренировок.</p>'}
    </div>
  `;

  const ctx = document.getElementById('dash-radar');
  if (ctx && n > 0) {
    const colors = ['#154734','#C8102E','#1e5a44','#9a0c23','#5a6169','#f59e0b'];
    new Chart(ctx, {
      type: 'radar',
      data: {
        labels: ['Техника','Физика','Тактика','Психология'],
        datasets: DB.players.map((p, i) => {
          const s = getCurrentScores(p);
          return {
            label: (p.fio || '').split(' ')[0],
            data: [s.tehn, s.fiz, s.takt, s.psih],
            backgroundColor: colors[i % colors.length] + '22',
            borderColor: colors[i % colors.length],
            borderWidth: 2,
            pointBackgroundColor: colors[i % colors.length],
            pointRadius: 4
          };
        })
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: { r: { beginAtZero: true, max: 10, ticks: { stepSize: 2, color: '#5a6169', backdropColor: 'transparent' }, grid: { color: '#C1C6C8' }, angleLines: { color: '#C1C6C8' }, pointLabels: { font: { size: 13, weight: '900' }, color: '#154734' } } },
        plugins: { legend: { position: 'bottom', labels: { font: { size: 12 }, padding: 16 } } }
      }
    });
  }
}