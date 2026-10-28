/* ============================================================
   04-ui.js
   Навигация, уведомления, рендер игроков, PIN-модалка.
   ============================================================ */

function goHome() {
  if (isPlayerMode) {
    if (currentPlayerId) {
      const p = DB.players.find(x => x.id === currentPlayerId);
      if (p) { showScreen('player'); renderPlayerCard(p); return; }
    }
    showScreen('player');
    return;
  }
  currentPlayerId = null;
  currentTab = 'skills';
  showScreen('players');
}

function showScreen(name) {
  try {
    if (isPlayerMode && name !== 'player') {
      name = 'player';
    }

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
        if (name === 'coach-calendar' && !isPlayerMode) renderCoachCalendar();
        if (name === 'coach-report'   && !isPlayerMode) renderCoachReport();
        if (name === 'player' && isPlayerMode && currentPlayerId && typeof renderPlayerCard === 'function') {
          const p = DB.players.find(x => x.id === currentPlayerId);
          if (p) renderPlayerCard(p);
        }
      } catch (err) {
        console.error('showScreen render error for', name, err);
      }
    }, 0);

    closeMobileNav();
    const notifPanel = document.getElementById('notif-panel');
    if (notifPanel) notifPanel.classList.remove('active');
    window.scrollTo(0, 0);

    if (typeof updateArchiveBadge === 'function') updateArchiveBadge();
  } catch (err) {
    console.error('showScreen error:', err);
  }
}

function bindNavigation() {
  document.querySelectorAll('nav button[data-screen]').forEach(btn => {
    btn.onclick = () => showScreen(btn.dataset.screen);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  bindNavigation();
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
      groups[key] = { id: uid('sess'), name: c.ex || '', note: c.note || '', groupId: c.groupId || null, blocks: [] };
    }
    groups[key].blocks.push({ id: uid('blk'), complex: c.ex || '', format: (Array.isArray(c.wt) && c.wt[0]) ? c.wt[0] : '', startTime: time, duration: 15, fact: c.fact || '', comment: c.comment || '', note: '' });
  });
  const result = Object.values(groups);
  result.forEach(s => s.blocks.sort((a, b) => (a.startTime || '').localeCompare(b.startTime || '')));
  return result;
}

function oldSessionToNew(s) {
  if (!s) return null;
  if (Array.isArray(s.blocks)) { if (!s.id) s.id = uid('sess'); return s; }
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
    blocks: [{ id: uid('blk'), complex: s.block || s.name || '', format: (Array.isArray(s.workTypes) && s.workTypes[0]) || (Array.isArray(s.wt) && s.wt[0]) || '', startTime: startT, duration: duration, fact: s.fact || '', comment: s.comment || '', note: '' }]
  };
}

/* ============================================================
   УВЕДОМЛЕНИЯ
   ============================================================ */
const NOTIF_WINDOW_DAYS = 7;

function collectNotifications() {
  const today = localDateStr(new Date());
  const sevenDaysAgo = localDateStr(new Date(Date.now() - NOTIF_WINDOW_DAYS * 86400000));
  const weekAhead = localDateStr(new Date(Date.now() + NOTIF_WINDOW_DAYS * 86400000));
  const items = [];

  DB.players.forEach(p => {
    if (!p.calendar) return;
    Object.keys(p.calendar).forEach(date => {
      const day = p.calendar[date];
      if (!Array.isArray(day)) return;
      day.forEach(sess => {
        if (!sess || !Array.isArray(sess.blocks)) return;
        sess.blocks.forEach(b => {
          if (!b || (!b.complex && !b.format && !b.note)) return;
          const fact = b.fact || '';
          if (fact === 'done') return;
          const time = b.startTime || '';
          const ex = b.complex || b.format || '';
          const who = p.fio, pid = p.id;

          if (fact === 'partial') {
            if (date < sevenDaysAgo || date > today) return;
            items.push({ type: 'partial', date, time, ex, note: b.note, who, pid, label: 'Выполнено частично', fact });
            return;
          }
          if (fact === 'notdone') {
            if (date < sevenDaysAgo || date > today) return;
            items.push({ type: 'notdone', date, time, ex, note: b.note, who, pid, label: 'Не выполнено', fact });
            return;
          }
          if (date < sevenDaysAgo) return;
          if (date < today) items.push({ type: 'overdue', date, time, ex, note: b.note, who, pid, label: 'Просрочено', fact: '' });
          else if (date === today) items.push({ type: 'today', date, time, ex, note: b.note, who, pid, label: 'Сегодня', fact: '' });
          else if (date <= weekAhead) items.push({ type: 'soon', date, time, ex, note: b.note, who, pid, label: 'Скоро', fact: '' });
        });
      });
    });
  });
  items.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  return items;
}

function updateNotifBadge() {
  const items = collectNotifications();
  const urgent = items.filter(i => i.type === 'overdue' || i.type === 'today' || i.type === 'partial' || i.type === 'notdone').length;
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
    const overdueCnt = items.filter(i => i.type === 'overdue').length;
    const todayCnt = items.filter(i => i.type === 'today').length;
    const partialCnt = items.filter(i => i.type === 'partial').length;
    const notdoneCnt = items.filter(i => i.type === 'notdone').length;
    const soonCnt = items.filter(i => i.type === 'soon').length;
    const summary = [];
    if (overdueCnt)  summary.push(`<span class="notif-sum overdue">Просрочено: ${overdueCnt}</span>`);
    if (todayCnt)    summary.push(`<span class="notif-sum today">Сегодня: ${todayCnt}</span>`);
    if (partialCnt)  summary.push(`<span class="notif-sum partial">Частично: ${partialCnt}</span>`);
    if (notdoneCnt)  summary.push(`<span class="notif-sum notdone">Не выполнено: ${notdoneCnt}</span>`);
    if (soonCnt)     summary.push(`<span class="notif-sum soon">Скоро: ${soonCnt}</span>`);

    panel.innerHTML = `<h3 style="margin-bottom:8px">Уведомления (${items.length})</h3>
      <div class="notif-summary">${summary.join('')}</div>
      <div style="max-height:400px;overflow-y:auto;margin-top:8px">
      ${items.map(i => {
        const factPill = i.fact ? `<span class="notif-fact-pill ${i.fact}">${factLabel(i.fact)}</span>` : '';
        return `<div class="notif-item ${i.type}" onclick="openPlayer('${i.pid}');toggleNotif(event)">
          <div class="n-title">${i.label} · ${escapeHtml(i.ex || '')}${factPill}</div>
          <div class="n-meta">${formatDate(i.date)} ${i.time} · ${escapeHtml((i.who || '').split(' ')[0])}${i.note ? ' · ' + escapeHtml(i.note) : ''}</div>
        </div>`;
      }).join('')}
      </div>`;
  }
  panel.classList.add('active');
}

document.addEventListener('click', e => {
  const panel = document.getElementById('notif-panel');
  if (!panel) return;
  if (!panel.contains(e.target) && !e.target.closest('.notif-btn')) panel.classList.remove('active');
});

/* ============================================================
   СПИСОК ИГРОКОВ С ГРУППИРОВКОЙ
   ============================================================ */
const __playerGroupOpen = new Set();

function togglePlayerGroup(gid) {
  if (__playerGroupOpen.has(gid)) __playerGroupOpen.delete(gid);
  else __playerGroupOpen.add(gid);
  renderPlayers();
}

function renderPlayers() {
  const el = document.getElementById('players-list');
  if (!el) return;
  if (!DB.players.length) {
    el.innerHTML = '<div class="empty-state"><div class="big">🐯</div><p>Пока нет игроков.<br>Нажмите «Добавить игрока».</p></div>';
    return;
  }

  const playersByGroup = { 'g_stars': [], 'g_special': [] };
  if (DB.playerGroups && DB.playerGroups.general.subgroups) {
    DB.playerGroups.general.subgroups.forEach(sg => { playersByGroup[sg.id] = []; });
  }

  DB.players.forEach(p => {
    if (!p.groupId) p.groupId = 'g_stars';
    if (!playersByGroup[p.groupId]) playersByGroup[p.groupId] = [];
    playersByGroup[p.groupId].push(p);
  });

  const renderPlayerTile = (p) => {
    const avatar = p.photo ? `<img src="${p.photo}" alt="${escapeAttr(p.fio)}">` : (p.fio ? escapeHtml(p.fio[0]) : '?');
    return `<div class="player-tile" onclick="openPlayer('${p.id}')">
      <button class="tile-delete no-print" title="Удалить" onclick="deletePlayerFromTile(event, '${p.id}')">🗑</button>
      <div class="player-avatar">${avatar}</div>
      <div class="player-info">
        <div class="name">${escapeHtml(p.fio || 'Без имени')}</div>
        <div class="meta">${escapeHtml(p.position || '')} · ${escapeHtml(p.team || '')}</div>
      </div>
      <div class="player-score">${overallScore(p)}</div>
    </div>`;
  };

  let html = '';

  const starsOpen = __playerGroupOpen.has('g_stars');
  html += `<div class="ex-parent ${starsOpen ? 'open' : ''}" style="margin-bottom:12px">
    <div class="ex-parent-head">
      <button type="button" class="ex-parent-toggle" onclick="togglePlayerGroup('g_stars')">
        <span class="ex-parent-arrow">▶</span>
        <span class="ex-parent-name">Звездочки</span>
        <span class="ex-parent-count">${playersByGroup['g_stars'].length} игроков</span>
      </button>
    </div>
    ${starsOpen ? `<div class="ex-parent-body">
      <div class="player-group-inner">${playersByGroup['g_stars'].map(renderPlayerTile).join('') || '<p class="subtitle">Нет игроков</p>'}</div>
    </div>` : ''}
  </div>`;

  const generalOpen = __playerGroupOpen.has('g_general');
  html += `<div class="ex-parent ${generalOpen ? 'open' : ''}" style="margin-bottom:12px">
    <div class="ex-parent-head">
      <button type="button" class="ex-parent-toggle" onclick="togglePlayerGroup('g_general')">
        <span class="ex-parent-arrow">▶</span>
        <span class="ex-parent-name">Общая группа</span>
        <span class="ex-parent-count">${DB.playerGroups?.general?.subgroups?.length || 0} команд</span>
      </button>
      <div class="ex-parent-actions no-print" onclick="event.stopPropagation()">
        <button class="btn-icon" title="Добавить подраздел" onclick="addPlayerSubgroup()">+</button>
      </div>
    </div>
    ${generalOpen ? `<div class="ex-parent-body">
      ${(DB.playerGroups?.general?.subgroups || []).map(sg => {
        const sgOpen = __playerGroupOpen.has(sg.id);
        const players = playersByGroup[sg.id] || [];
        return `<div class="ex-sub ${sgOpen ? 'open' : ''}" style="margin-bottom:8px">
          <div class="ex-sub-head">
            <button type="button" class="ex-sub-toggle" onclick="togglePlayerGroup('${sg.id}')">
              <span class="ex-sub-arrow">▶</span>
              <span class="ex-sub-name">${escapeHtml(sg.name)}</span>
              <span class="ex-sub-count">${players.length}</span>
            </button>
            <div class="ex-sub-actions no-print" onclick="event.stopPropagation()">
              <button class="btn-icon" title="Переименовать" onclick="renamePlayerSubgroup('${sg.id}')">✎</button>
              <button class="btn-icon red" title="Удалить" onclick="deletePlayerSubgroup('${sg.id}')">🗑</button>
            </div>
          </div>
          ${sgOpen ? `<div class="ex-sub-body">
            <div class="player-group-inner">${players.map(renderPlayerTile).join('') || '<p class="subtitle">Нет игроков</p>'}</div>
          </div>` : ''}
        </div>`;
      }).join('') || '<p class="subtitle">Нет команд. Нажмите «+» чтобы добавить.</p>'}
    </div>` : ''}
  </div>`;

  const specialOpen = __playerGroupOpen.has('g_special');
  html += `<div class="ex-parent ${specialOpen ? 'open' : ''}">
    <div class="ex-parent-head">
      <button type="button" class="ex-parent-toggle" onclick="togglePlayerGroup('g_special')">
        <span class="ex-parent-arrow">▶</span>
        <span class="ex-parent-name">Спецгруппа</span>
        <span class="ex-parent-count">${playersByGroup['g_special'].length} игроков</span>
      </button>
    </div>
    ${specialOpen ? `<div class="ex-parent-body">
      <div class="player-group-inner">${playersByGroup['g_special'].map(renderPlayerTile).join('') || '<p class="subtitle">Нет игроков</p>'}</div>
    </div>` : ''}
  </div>`;

  el.innerHTML = html;
  updateNotifBadge();
}

function addPlayerSubgroup() {
  if (isPlayerMode) return;
  uiPrompt('Название команды (подраздела):', '', (name) => {
    if (!name.trim()) return;
    if (!DB.playerGroups.general.subgroups) DB.playerGroups.general.subgroups = [];
    DB.playerGroups.general.subgroups.push({ id: uid('sg'), name: name.trim() });
    saveDB();
    renderPlayers();
  }, () => {}, { title: 'Новая команда', okLabel: 'Создать' });
}

function renamePlayerSubgroup(sgId) {
  if (isPlayerMode) return;
  const sg = DB.playerGroups?.general?.subgroups?.find(x => x.id === sgId);
  if (!sg) return;
  uiPrompt('Новое название команды:', sg.name, (name) => {
    if (!name.trim()) return;
    sg.name = name.trim();
    saveDB();
    renderPlayers();
  }, () => {}, { title: 'Переименовать', okLabel: 'Сохранить' });
}

function deletePlayerSubgroup(sgId) {
  if (isPlayerMode) return;
  uiConfirm('Удалить этот подраздел? Игроки из него перейдут в "Звездочки".', () => {
    DB.playerGroups.general.subgroups = DB.playerGroups.general.subgroups.filter(x => x.id !== sgId);
    DB.players.forEach(p => { if (p.groupId === sgId) p.groupId = 'g_stars'; });
    saveDB();
    renderPlayers();
  }, () => {});
}

/* ============================================================
   ДАШБОРД
   ============================================================ */
function renderDashboard() {
  if (isPlayerMode) return;
  const el = document.getElementById('dashboard-content');
  if (!el) return;

  if (!DB.players.length) {
    el.innerHTML = `
      <div class="card"><div class="empty-state"><div class="big">📊</div><p>Нет данных.</p></div></div>
      <div class="card"><h2>Быстрые переходы</h2>
        <div class="btn-row" style="margin:0">
          <button class="btn" onclick="showScreen('coach-calendar')">📅 Календарь тренера</button>
          <button class="btn" onclick="showScreen('coach-report')">📊 Отчёт тренера</button>
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
    <div class="card">
      <h2>Быстрые переходы</h2>
      <div class="btn-row" style="margin:0">
        <button class="btn" onclick="showScreen('coach-calendar')">📅 Календарь тренера</button>
        <button class="btn" onclick="showScreen('coach-report')">📊 Отчёт тренера</button>
        <button class="btn" onclick="showScreen('report')">📄 Отчёт по игрокам</button>
      </div>
    </div>
    <div class="dash-grid">
      <div class="kpi"><div class="lbl">Игроков</div><div class="val">${n}</div><div class="sub">в группе развития</div></div>
      <div class="kpi"><div class="lbl">Средняя общая</div><div class="val">${avgOverall}</div><div class="sub">из 10 баллов</div></div>
      <div class="kpi"><div class="lbl">Техника</div><div class="val">${avgField('tehn')}</div><div class="sub">средняя по группе</div></div>
      <div class="kpi"><div class="lbl">Физика</div><div class="val">${avgField('fiz')}</div><div class="sub">средняя по группе</div></div>
      <div class="kpi"><div class="lbl">Тактика</div><div class="val">${avgField('takt')}</div><div class="sub">средняя по группе</div></div>
      <div class="kpi"><div class="lbl">Психология</div><div class="val">${avgField('psih')}</div><div class="sub">средняя по группе</div></div>
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
    <div class="card"><h2>Ближайшие тренировки</h2>
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

/* ============================================================
   PIN-КОДЫ ИГРОКОВ
   ============================================================ */

function syncPinsAcrossSeasons() {
  if (!DB.seasons) return;

  const canonical = {};
  if (Array.isArray(DB.players)) {
    DB.players.forEach(p => {
      if (!p.accessPin) return;
      const k = (typeof personPinKey === 'function') ? personPinKey(p) : '';
      if (k) canonical[k] = p.accessPin;
    });
  }
  Object.keys(DB.seasons).forEach(sk => {
    (DB.seasons[sk].players || []).forEach(p => {
      if (!p.accessPin) return;
      const k = (typeof personPinKey === 'function') ? personPinKey(p) : '';
      if (!k) return;
      if (!canonical[k]) canonical[k] = p.accessPin;
    });
  });

  Object.keys(DB.seasons).forEach(sk => {
    (DB.seasons[sk].players || []).forEach(p => {
      const k = (typeof personPinKey === 'function') ? personPinKey(p) : '';
      if (k && canonical[k]) p.accessPin = canonical[k];
    });
  });
}

function openPlayerPinsModal() {
  if (isPlayerMode) return;

  const players = DB.players || [];
  const missing = players.filter(p => !p.accessPin).length;

  const rows = players.map(p => {
    const hasPin = !!p.accessPin;
    const pinCell = hasPin
      ? `<code style="font-family:monospace;letter-spacing:2px;font-size:15px;font-weight:900;color:var(--ak-green);padding:4px 10px;background:#f0f4f2;border-radius:4px;display:inline-block">${escapeHtml(p.accessPin)}</code>
         <button class="btn btn-sm" onclick="regeneratePlayerPin('${p.id}', true)">Сбросить</button>`
      : `<span style="color:var(--ak-red);font-size:12px">— не задан —</span>
         <button class="btn btn-sm" onclick="regeneratePlayerPin('${p.id}', true)">Сгенерировать</button>`;

    return `<div class="ms-row" style="align-items:center">
      <div class="ms-row-info">
        <div class="ms-row-name">${escapeHtml(p.fio || '')}</div>
        <div class="ms-row-meta">${escapeHtml(p.position || '')}${p.team ? ' · ' + escapeHtml(p.team) : ''}${p.birthYear ? ' · ' + escapeHtml(p.birthYear) : ''}</div>
      </div>
      <div class="ms-row-actions" style="align-items:center;gap:8px">
        ${pinCell}
      </div>
    </div>`;
  }).join('');

  openModal(`
    <h3>🔑 PIN-коды игроков</h3>
    <p class="subtitle" style="margin-top:-8px">4-значный код для входа в личный кабинет. Выдайте каждому игроку лично.</p>
    <div class="btn-row" style="margin:12px 0;flex-wrap:wrap">
      ${missing ? `<button class="btn" onclick="generatePinsForAll()">Сгенерировать всем (${missing} без PIN)</button>` : ''}
      <button class="btn" onclick="exportPlayerPinsExcel()">📤 Экспорт в Excel</button>
    </div>
    <div class="ms-list" style="max-height:60vh;overflow-y:auto">${rows || '<p class="subtitle">Нет игроков.</p>'}</div>
    <div class="btn-row" style="margin-top:16px">
      <button class="btn" onclick="closeModal()">Закрыть</button>
    </div>
  `);
}

function generatePinsForAll() {
  if (isPlayerMode) return;

  const personPin = {};
  const allPins = new Set();
  if (DB.seasons) {
    Object.keys(DB.seasons).forEach(k => {
      (DB.seasons[k].players || []).forEach(p => {
        if (p.accessPin) {
          const pk = (typeof personPinKey === 'function') ? personPinKey(p) : '';
          if (pk && !personPin[pk]) personPin[pk] = p.accessPin;
          allPins.add(p.accessPin);
        }
      });
    });
  }

  let generated = 0, reused = 0;
  (DB.players || []).forEach(p => {
    if (p.accessPin) return;
    const pk = (typeof personPinKey === 'function') ? personPinKey(p) : '';
    let pin = pk ? personPin[pk] : null;
    if (!pin) {
      let guard = 0;
      do { pin = generatePin(); guard++; } while (allPins.has(pin) && guard < 50);
      allPins.add(pin);
      if (pk) personPin[pk] = pin;
      generated++;
    } else {
      reused++;
    }
    p.accessPin = pin;
  });

  if (generated || reused) {
    touchMeta('players');
    saveDB();
    syncPinsAcrossSeasons();
    toast(`PIN: новых ${generated}, скопировано из других сезонов ${reused}`);
  }
  openPlayerPinsModal();
}

function regeneratePlayerPin(pid, inModal) {
  if (isPlayerMode) return;
  const p = DB.players.find(x => x.id === pid);
  if (!p) return;

  const doIt = () => {
    const allPins = new Set((DB.players || []).map(x => x.accessPin).filter(x => x && x !== p.accessPin));
    let pin, guard = 0;
    do { pin = generatePin(); guard++; } while (allPins.has(pin) && guard < 50);
    p.accessPin = pin;
    touchMeta('players');
    saveDB();
    syncPinsAcrossSeasons();
    toast(`Новый PIN для «${p.fio}»: ${pin}`);
    if (inModal) openPlayerPinsModal();
    else if (currentPlayerId === pid) refreshProfile(pid);
  };

  if (inModal) {
    doIt();
  } else {
    uiConfirm(`Сгенерировать новый PIN для «${p.fio}»? Старый перестанет работать.`, doIt, () => {});
  }
}