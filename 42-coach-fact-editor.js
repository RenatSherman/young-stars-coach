/* ============================================================
   42-coach-fact-editor.js
   Черновик фактов и их сохранение.
   ============================================================ */

function onCoachDayBlockFactChange(ds, playerId, sessId, blockIndex, value) {
  const draft = getFactDraft(ds, sessId);
  const k = draftEntryKey(playerId, blockIndex);

  const player = DB.players.find(x => x.id === playerId);
  let curComment = '';
  if (player) {
    const sessions = collectDaySessions(ds);
    const s = sessions.find(x => x.id === sessId);
    const b = s && s.blocks[blockIndex];
    if (b && s) {
      const ref = findMatchingPlayerBlock(player, ds, s, b);
      if (ref) curComment = ref.block.comment || '';
    }
  }
  const existing = draft.get(k);
  if (existing && existing.comment) curComment = existing.comment;

  if (value !== 'partial' && value !== 'notdone') curComment = '';

  draft.set(k, { fact: value, comment: curComment });

  const sel = document.querySelector(
    `.cc-sess-item[data-sess-id="${cssEscapeSimple(sessId)}"] .cc-sess-block[data-block-idx="${blockIndex}"] .pde-fact[data-pid="${cssEscapeSimple(playerId)}"]`
  );
  if (sel) {
    sel.classList.remove('done', 'partial', 'notdone');
    if (value === 'done') sel.classList.add('done');
    else if (value === 'partial') sel.classList.add('partial');
    else if (value === 'notdone') sel.classList.add('notdone');
  }

  const inp = document.querySelector(
    `.cc-sess-item[data-sess-id="${cssEscapeSimple(sessId)}"] .cc-sess-block[data-block-idx="${blockIndex}"] .pde-comment[data-pid="${cssEscapeSimple(playerId)}"]`
  );
  if (inp) {
    const need = (value === 'partial' || value === 'notdone');
    inp.style.display = need ? 'block' : 'none';
    inp.placeholder = need ? 'Комментарий (обязательно)' : 'Комментарий';
    if (!need) inp.value = '';
    else inp.value = curComment;
  }

  updateDraftBadge(ds, sessId);
}

function onCoachDayBlockCommentChange(ds, playerId, sessId, blockIndex, value) {
  const draft = getFactDraft(ds, sessId);
  const k = draftEntryKey(playerId, blockIndex);
  const existing = draft.get(k);
  if (existing) {
    existing.comment = (value || '').trim();
  } else {
    const player = DB.players.find(x => x.id === playerId);
    if (!player) return;
    const sessions = collectDaySessions(ds);
    const s = sessions.find(x => x.id === sessId);
    const b = s && s.blocks[blockIndex];
    let curFact = '';
    if (b && s) {
      const ref = findMatchingPlayerBlock(player, ds, s, b);
      if (ref) curFact = ref.block.fact || '';
    }
    draft.set(k, { fact: curFact, comment: (value || '').trim() });
  }
  updateDraftBadge(ds, sessId);
}

function updateDraftBadge(ds, sessId) {
  const hasDraft = hasUnsavedDraft(ds, sessId);
  const count = hasDraft ? (__coachFactDraft.get(draftKey(ds, sessId)) || new Map()).size : 0;

  const item = document.querySelector(`.cc-sess-item[data-sess-id="${cssEscapeSimple(sessId)}"]`);
  if (!item) return;

  const nameEl = item.querySelector('.cc-sess-name');
  if (nameEl) {
    const existing = nameEl.querySelector('.cc-sess-draft-badge');
    if (hasDraft && !existing) {
      const badge = document.createElement('span');
      badge.className = 'cc-sess-draft-badge';
      badge.title = 'Есть несохранённые изменения';
      badge.textContent = '●';
      nameEl.appendChild(badge);
    } else if (!hasDraft && existing) {
      existing.remove();
    }
  }

  const hint = document.getElementById(`save-hint-${sessId}`);
  if (hint) {
    hint.textContent = hasDraft
      ? `Несохранённых изменений: ${count}`
      : 'Все изменения сохранены';
  }
  const btn = document.getElementById(`save-btn-${sessId}`);
  if (btn) btn.classList.toggle('has-changes', hasDraft);
}

function saveCoachSessionFacts(ds, sessId) {
  const draft = __coachFactDraft.get(draftKey(ds, sessId));
  if (!draft || !draft.size) {
    toast('Нечего сохранять');
    return;
  }

  const errors = [];
  draft.forEach((val, k) => {
    if ((val.fact === 'partial' || val.fact === 'notdone') && !(val.comment || '').trim()) {
      const [pid, bi] = k.split('::');
      const player = DB.players.find(x => x.id === pid);
      errors.push(`• ${player ? player.fio : pid} — блок #${Number(bi) + 1}`);
    }
  });
  if (errors.length) {
    uiAlert('Для «Частично» и «Не выполнено» обязателен комментарий:\n\n' + errors.join('\n'));
    return;
  }

  const sessions = collectDaySessions(ds);
  const sess = sessions.find(x => x.id === sessId);

  draft.forEach((val, k) => {
    const [pid, biStr] = k.split('::');
    const bi = parseInt(biStr, 10);
    const player = DB.players.find(x => x.id === pid);
    if (!player) return;
    if (!sess) return;
    const displayBlock = sess.blocks[bi];
    if (!displayBlock) return;

    const ref = findMatchingPlayerBlock(player, ds, sess, displayBlock);
    if (!ref) return;
    ref.block.fact = val.fact || '';
    ref.block.comment = (val.comment || '').trim();
  });

  clearFactDraft(ds, sessId);
  touchMeta('players');
  saveDB();
  updateNotifBadge();

  reRenderCoachSession(ds, sessId);
  const item = document.querySelector(`.cc-sess-item[data-sess-id="${cssEscapeSimple(sessId)}"]`);
  if (item) item.classList.add('open');

  toast('Факт сохранён');
}