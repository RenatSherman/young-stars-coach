/* ============================================================
   47-coach-delete.js
   Удаление тренировок из календаря тренера.

   Содержит:
   - deleteSessionFromDay
   - deleteSessionOnlyThisDay
   - deleteSessionWholeSeries
   - countSeriesEntries
   ============================================================ */

function deleteSessionFromDay(ds, idx, ev) {
  if (ev) ev.stopPropagation();
  const sessions = collectDaySessions(ds);
  const s = sessions[idx];
  if (!s) return;

  /* Если тренировка — часть серии, показываем радиовыбор */
  if (s.seriesId) {
    const entriesCount = countSeriesEntries(s.seriesId);
    uiChoice(
      'Эта тренировка — часть серии. Что именно удалить?',
      [
        {
          label: 'Только эту тренировку',
          hint: `Остальные ${Math.max(0, entriesCount - 1)} ${plural(Math.max(0, entriesCount - 1), 'день', 'дня', 'дней')} серии останутся`,
          value: 'one',
          checked: true
        },
        {
          label: `Всю серию`,
          hint: `Будет удалено ${entriesCount} ${plural(entriesCount, 'тренировка', 'тренировки', 'тренировок')} во всех днях`,
          value: 'all'
        }
      ],
      (choice) => {
        if (choice === 'one') {
          deleteSessionOnlyThisDay(ds, s.seriesId, idx);
        } else if (choice === 'all') {
          deleteSessionWholeSeries(s.seriesId, ds);
        }
        /* choice === null → Отмена */
      },
      'Удаление тренировки из серии'
    );
    return;
  }

  /* Одиночное удаление (не из серии) */
  uiConfirm('Удалить тренировку у всех игроков?', () => {
    clearFactDraft(ds, s.id);
    deleteSessionOnlyThisDay(ds, null, idx);
  }, () => {});
}

/* Подсчёт, сколько всего записей содержит серия (уникальных дней) */
function countSeriesEntries(seriesId) {
  if (!seriesId) return 0;
  const dates = new Set();
  DB.players.forEach(p => {
    if (!p.calendar) return;
    Object.keys(p.calendar).forEach(ds => {
      const day = p.calendar[ds];
      if (!Array.isArray(day)) return;
      if (day.some(s => s.seriesId === seriesId)) dates.add(ds);
    });
  });
  return dates.size;
}

/* Удаляет тренировку только за один день.
   Работает и для случая, когда тренировка — часть серии
   (остальные дни серии остаются нетронутыми). */
function deleteSessionOnlyThisDay(ds, seriesId, idx) {
  const sessions = collectDaySessions(ds);
  const s = sessions[idx];
  if (!s) return;

  clearFactDraft(ds, s.id);

  const targetId = s.realId;
  const targetGroupId = s.groupId;
  const targetSig = (s.blocks || []).map(b =>
    (b.startTime || '') + '|' + (b.complex || '') + '|' + (b.format || '') + '|' + (b.duration || '')
  ).sort().join(';');

  DB.players.forEach(p => {
    if (!p.calendar || !p.calendar[ds]) return;
    const day = p.calendar[ds];
    if (!Array.isArray(day)) return;
    p.calendar[ds] = day.filter(sess => {
      if (targetId && sess.id === targetId) return false;
      if (targetGroupId && sess.groupId === targetGroupId) return false;
      if (!targetId && !targetGroupId) {
        if ((sess.name || '') !== (s.name || '')) return true;
        const sig = (sess.blocks || []).map(b =>
          (b.startTime || '') + '|' + (b.complex || '') + '|' + (b.format || '') + '|' + (b.duration || '')
        ).sort().join(';');
        return sig !== targetSig;
      }
      return true;
    });
    if (!p.calendar[ds].length) delete p.calendar[ds];
  });

  saveDB();
  renderCoachCalendar();
  if (__coachDayCurrentDs === ds) openDaySessionsInner(ds);
  updateNotifBadge();

  if (seriesId) {
    toast('Удалена одна тренировка из серии');
  } else {
    toast('Тренировка удалена');
  }
}

/* Удаляет всю серию целиком — по всем дням и всем игрокам. */
function deleteSessionWholeSeries(seriesId, ds) {
  let removed = 0;
  DB.players.forEach(p => {
    if (!p.calendar) return;
    Object.keys(p.calendar).forEach(date => {
      const day = p.calendar[date];
      if (!Array.isArray(day)) return;
      const before = day.length;
      p.calendar[date] = day.filter(s => s.seriesId !== seriesId);
      removed += before - p.calendar[date].length;
      if (!p.calendar[date].length) delete p.calendar[date];
    });
  });
  saveDB();
  renderCoachCalendar();
  if (__coachDayCurrentDs === ds) openDaySessionsInner(ds);
  updateNotifBadge();
  toast(`Удалена вся серия (${removed} записей)`);
}