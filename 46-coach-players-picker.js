/* ============================================================
   46-coach-players-picker.js
   Группированный список игроков в редакторе тренировки.

   Содержит:
   - renderCoachGroupedPlayers
   - toggleCoachTeam / expandAllCoachTeams
   - selectCoachTeam / clearCoachGroupSelection
   - filterCoachGroupPlayers
   ============================================================ */

function renderCoachGroupedPlayers(players, preselectedIds) {
  const selected = new Set(preselectedIds || []);
  const groups = {};
  players.forEach(p => {
    const key = (p.team || '').trim() || '— Без команды —';
    if (!groups[key]) groups[key] = [];
    groups[key].push(p);
  });
  const teamNames = Object.keys(groups).sort((a, b) => a.localeCompare(b, 'ru'));

  return teamNames.map(team => {
    const list = groups[team].slice().sort((a, b) => (a.fio || '').localeCompare(b.fio || '', 'ru'));
    const safeId = 'cteam-' + team.replace(/[^a-zA-Zа-яА-Я0-9]/g, '_') + '-' + Math.random().toString(36).slice(2, 6);
    return `<div class="group-team" data-team="${escapeAttr(team)}" id="${safeId}">
      <div class="group-team-head" onclick="toggleCoachTeam('${safeId}', event)">
        <span class="arrow">▶</span>
        <span>${escapeHtml(team)}</span>
        <span class="count">${list.length}</span>
        <span class="team-actions" onclick="event.stopPropagation()">
          <button type="button" onclick="selectCoachTeam('${safeId}', true)">Все</button>
          <button type="button" onclick="selectCoachTeam('${safeId}', false)">Никто</button>
        </span>
      </div>
      <div class="group-team-body">
        ${list.map(o => `<label>
          <input type="checkbox" class="cc-grp-player" value="${o.id}" ${selected.has(o.id) ? 'checked' : ''}>
          <span>${escapeHtml(o.fio)}${o.position ? ' <span style="color:var(--ak-gray-dark);font-size:11px">· ' + escapeHtml(o.position) + '</span>' : ''}</span>
        </label>`).join('')}
      </div>
    </div>`;
  }).join('');
}

function toggleCoachTeam(teamId, event) {
  if (event) event.stopPropagation();
  const el = document.getElementById(teamId);
  if (!el) return;
  el.classList.toggle('open');
}

function expandAllCoachTeams(listId, open) {
  document.querySelectorAll('#' + listId + ' .group-team').forEach(el => el.classList.toggle('open', open));
}

function selectCoachTeam(teamId, checked) {
  const el = document.getElementById(teamId);
  if (!el) return;
  el.querySelectorAll('.cc-grp-player').forEach(cb => { cb.checked = checked; });
}

function clearCoachGroupSelection(listId) {
  document.querySelectorAll('#' + listId + ' .cc-grp-player').forEach(cb => { cb.checked = false; });
}

function filterCoachGroupPlayers(listId, searchId) {
  const q = (document.getElementById(searchId)?.value || '').trim().toLowerCase();
  const list = document.getElementById(listId);
  if (!list) return;

  list.querySelectorAll('.group-team').forEach(teamEl => {
    const teamName = (teamEl.dataset.team || '').toLowerCase();
    let visibleInTeam = 0;
    teamEl.querySelectorAll('.group-team-body label').forEach(lbl => {
      const text = lbl.innerText.toLowerCase();
      const match = !q || teamName.includes(q) || text.includes(q);
      lbl.style.display = match ? 'flex' : 'none';
      if (match) visibleInTeam++;
    });
    teamEl.style.display = visibleInTeam ? 'block' : 'none';
    if (q && visibleInTeam) teamEl.classList.add('open');
  });
}