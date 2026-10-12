/* ============================================================
   51-player-stats.js
   Вкладка «Статистика» в карточке игрока.

   Содержит:
   - renderStats
   - updateStat
   - addStat / addStatSection / removeStat
   ============================================================ */

function renderStats(p) {
  let rows = p.stats.map((s, i) => {
    if (s.season && !s.club) return `<tr class="section-row"><td colspan="7">${escapeHtml(s.season)}</td></tr>`;
    return `<tr>
      <td><input class="cell" value="${escapeAttr(s.club || '')}" onchange="updateStat('${p.id}',${i},'club',this.value)"></td>
      <td><input class="cell" type="number" value="${s.games ?? ''}" onchange="updateStat('${p.id}',${i},'games',this.value)"></td>
      <td><input class="cell" type="number" value="${s.goals ?? ''}" onchange="updateStat('${p.id}',${i},'goals',this.value)"></td>
      <td><input class="cell" type="number" value="${s.assists ?? ''}" onchange="updateStat('${p.id}',${i},'assists',this.value)"></td>
      <td><input class="cell" type="number" value="${s.points ?? ''}" onchange="updateStat('${p.id}',${i},'points',this.value)"></td>
      <td><input class="cell" type="number" value="${s.plus ?? ''}" onchange="updateStat('${p.id}',${i},'plus',this.value)"></td>
      <td class="no-print"><button class="btn btn-sm btn-ghost" onclick="removeStat('${p.id}',${i})">×</button></td></tr>`;
  }).join('');
  return `<div class="card"><h2>Статистика матчей</h2>
    <div class="btn-row no-print">
      <button class="btn btn-sm" onclick="addStat('${p.id}')">+ Строка</button>
      <button class="btn btn-sm btn-ghost" onclick="addStatSection('${p.id}')">+ Раздел</button>
    </div>
    <div style="overflow-x:auto"><table><thead><tr><th>Клуб / турнир</th><th>Игры</th><th>Голы</th><th>Передачи</th><th>Очки</th><th>+/-</th><th></th></tr></thead>
    <tbody>${rows}</tbody></table></div></div>`;
}

function updateStat(pid, i, f, v) {
  const p = DB.players.find(x => x.id === pid);
  if (!p || !p.stats || !p.stats[i]) return;
  p.stats[i][f] = (f === 'club' || f === 'season') ? v : (v === '' ? '' : Number(v));
  saveDB();
}

function addStat(pid) {
  const p = DB.players.find(x => x.id === pid);
  if (!p) return;
  p.stats.push({ season: '', club: '', games: '', goals: '', assists: '', points: '', plus: '' });
  saveDB();
  refreshProfile(pid);
}

function addStatSection(pid) {
  const p = DB.players.find(x => x.id === pid);
  if (!p) return;
  uiPrompt(
    'Название раздела:',
    '',
    (name) => {
      const trimmed = (name || '').trim();
      if (!trimmed) return;
      p.stats.push({ season: trimmed, club: '', games: '', goals: '', assists: '', points: '', plus: '' });
      saveDB();
      refreshProfile(pid);
    },
    () => {},
    { title: 'Новый раздел статистики', placeholder: 'Например: Кубок Татарстана', okLabel: 'Создать' }
  );
}

function removeStat(pid, i) {
  const p = DB.players.find(x => x.id === pid);
  if (!p || !p.stats) return;
  p.stats.splice(i, 1);
  saveDB();
  refreshProfile(pid);
}