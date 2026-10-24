/* ============================================================
   03-sync.js
   Supabase: авторизация, синхронизация.
   Регистрация тренера через UI отключена (аккаунт тренера один).
   ============================================================ */

let isPlayerMode = false;
let __authTab = 'login';

function setSyncStatus(status, text) {
  const el = document.getElementById('sync-status');
  const txt = document.getElementById('sync-text');
  if (!el || !txt) return;
  el.classList.remove('ok', 'saving', 'error', 'offline', 'local-newer');
  el.classList.add(status);
  txt.textContent = text;
}

function scheduleSync() {
  if (!currentUser && !isPlayerMode) return;
  if (syncTimeout) clearTimeout(syncTimeout);
  setSyncStatus('saving', 'Сохранение…');
  syncTimeout = setTimeout(() => { pushToCloud(); }, 2000);
}

async function pushNow() {
  if (syncTimeout) { clearTimeout(syncTimeout); syncTimeout = null; }
  await pushToCloud();
}

function packPlayersForCloud() {
  if (DB.seasons && Object.keys(DB.seasons).length > 0) {
    const coachSeason = isPlayerMode
      ? (localStorage.getItem('coach_default_season') || currentSeason || null)
      : (currentSeason || null);

    return {
      __meta: {
        seasons: DB.seasons,
        currentSeason: coachSeason,
        templates: Array.isArray(DB.templates) ? DB.templates : [],
        playerGroups: DB.playerGroups || null,
        updatedAt: (DB.meta && DB.meta.updatedAt) ? DB.meta.updatedAt : {}
      },
      list: DB.players || []
    };
  }
  return DB.players || [];
}

function unpackPlayersFromCloud(cloudPlayers) {
  if (!cloudPlayers) return { players: [], seasons: null, currentSeason: null, templates: null, playerGroups: null, updatedAt: null };
  if (cloudPlayers && !Array.isArray(cloudPlayers) && cloudPlayers.__meta) {
    return {
      players: Array.isArray(cloudPlayers.list) ? cloudPlayers.list : [],
      seasons: cloudPlayers.__meta.seasons || null,
      currentSeason: cloudPlayers.__meta.currentSeason || null,
      templates: Array.isArray(cloudPlayers.__meta.templates) ? cloudPlayers.__meta.templates : null,
      playerGroups: cloudPlayers.__meta.playerGroups || null,
      updatedAt: cloudPlayers.__meta.updatedAt || null
    };
  }
  if (Array.isArray(cloudPlayers)) {
    return { players: cloudPlayers, seasons: null, currentSeason: null, templates: null, playerGroups: null, updatedAt: null };
  }
  return { players: [], seasons: null, currentSeason: null, templates: null, playerGroups: null, updatedAt: null };
}

async function pushToCloud() {
  if (!currentUser && !isPlayerMode) return;
  if (!navigator.onLine) { setSyncStatus('offline', 'Оффлайн'); return; }
  if (isSyncing) return;

  const localPlayers = (DB.players || []).length;
  const localSeasons = DB.seasons ? Object.keys(DB.seasons).length : 0;
  if (localPlayers === 0 && localSeasons === 0) return;

  isSyncing = true;
  try {
    if (typeof migrateAllExercises === 'function') migrateAllExercises();
    if (DB.seasons && currentSeason && DB.seasons[currentSeason]) {
      DB.seasons[currentSeason].players = DB.players;
    }

    const coachId = isPlayerMode ? localStorage.getItem('coach_id') : (currentUser ? currentUser.id : null);
    if (!coachId) throw new Error('Не найден ID тренера');

    const payload = {
      user_id: coachId,
      players: packPlayersForCloud(),
      exercises: DB.exercises,
      updated_at: new Date().toISOString()
    };

    const { error } = await sb.from('coach_data').upsert(payload, { onConflict: 'user_id' });
    if (error) throw error;

    lastSyncedAt = new Date();
    setSyncStatus('ok', 'Синхр. ' + lastSyncedAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }));
  } catch (err) {
    console.error('Sync error:', err);
    setSyncStatus('error', 'Ошибка синхр.');
  } finally {
    isSyncing = false;
  }
}

async function pullFromCloud(force = false) {
  if (!currentUser && !isPlayerMode) return { applied: {}, pushed: false };
  setSyncStatus('saving', 'Загрузка…');

  try {
    const coachId = isPlayerMode ? localStorage.getItem('coach_id') : (currentUser ? currentUser.id : null);
    if (!coachId) throw new Error('Нет ID тренера');

    const { data, error } = await sb.from('coach_data').select('players, exercises, updated_at').eq('user_id', coachId).maybeSingle();

    if (error) { setSyncStatus('error', 'Ошибка загрузки'); return { applied: {}, pushed: false }; }
    if (!data) { if (!isPlayerMode) await pushToCloud(); return { applied: {}, pushed: true }; }

    const unpacked = unpackPlayersFromCloud(data.players);
    const cloudMeta = unpacked.updatedAt || {};
    const localMeta = (DB.meta && DB.meta.updatedAt) ? DB.meta.updatedAt : {};

    const cmp = (section, cloudTs, localTs, cloudCount, localCount) => {
      if (force) return cloudCount > 0;
      if (cloudTs > localTs) return cloudCount > 0;
      if (cloudTs === 0 && localTs === 0) return localCount === 0 && cloudCount > 0;
      return false;
    };

    const applyExercises = cmp('exercises', Date.parse(cloudMeta.exercises||0), Date.parse(localMeta.exercises||0), Array.isArray(data.exercises)?data.exercises.length:0, (DB.exercises||[]).length);
    const applyPlayers   = cmp('players',   Date.parse(cloudMeta.players||0),   Date.parse(localMeta.players||0),   unpacked.players.length, (DB.players||[]).length);
    const applyTemplates = cmp('templates', Date.parse(cloudMeta.templates||0), Date.parse(localMeta.templates||0), unpacked.templates?unpacked.templates.length:0, (DB.templates||[]).length);
    const applySeasons   = cmp('seasons',   Date.parse(cloudMeta.seasons||0),   Date.parse(localMeta.seasons||0),   unpacked.seasons?Object.keys(unpacked.seasons).length:0, DB.seasons?Object.keys(DB.seasons).length:0);

    const applied = { exercises: false, players: false, templates: false, seasons: false };

    if (applySeasons && unpacked.seasons) {
      DB.seasons = unpacked.seasons;
      if (!DB.meta.updatedAt) DB.meta.updatedAt = {};
      DB.meta.updatedAt.seasons = cloudMeta.seasons || new Date().toISOString();
      applied.seasons = true;
    }

    if (applyPlayers && unpacked.players.length > 0) {
      const targetSeason = unpacked.currentSeason || currentSeason;
      if (DB.seasons && targetSeason && DB.seasons[targetSeason]) {
        DB.seasons[targetSeason].players = unpacked.players;
        DB.players = unpacked.players;
      } else {
        DB.players = unpacked.players;
      }
      if (!DB.meta.updatedAt) DB.meta.updatedAt = {};
      DB.meta.updatedAt.players = cloudMeta.players || new Date().toISOString();
      applied.players = true;
    }

    if (applyExercises && Array.isArray(data.exercises) && data.exercises.length > 0) {
      DB.exercises = data.exercises;
      if (!DB.meta.updatedAt) DB.meta.updatedAt = {};
      DB.meta.updatedAt.exercises = cloudMeta.exercises || new Date().toISOString();
      applied.exercises = true;
    }

    if (applyTemplates && Array.isArray(unpacked.templates)) {
      DB.templates = unpacked.templates;
      if (!DB.meta.updatedAt) DB.meta.updatedAt = {};
      DB.meta.updatedAt.templates = cloudMeta.templates || new Date().toISOString();
      applied.templates = true;
    }

    if (unpacked.playerGroups && (!DB.playerGroups || force)) {
      DB.playerGroups = unpacked.playerGroups;
    }

    if (typeof migrateAllExercises === 'function') migrateAllExercises();
    if (typeof ensureSeasonState === 'function')   ensureSeasonState(unpacked.currentSeason || null);

    (DB.players || []).forEach(p => {
      if (typeof migrateCalendar === 'function') migrateCalendar(p);
      if (typeof __ensurePlayerPin === 'function') __ensurePlayerPin(p);
      if (!Array.isArray(p.developmentPlans)) p.developmentPlans = [];
    });

    const localNewer =
      (Date.parse(localMeta.exercises||0) > Date.parse(cloudMeta.exercises||0)) ||
      (Date.parse(localMeta.players||0) > Date.parse(cloudMeta.players||0)) ||
      (Date.parse(localMeta.templates||0) > Date.parse(cloudMeta.templates||0)) ||
      (Date.parse(localMeta.seasons||0) > Date.parse(cloudMeta.seasons||0));

    saveDBNow();

    if (localNewer) {
      setSyncStatus('local-newer', 'Отправляю…');
      await pushToCloud();
      return { applied, pushed: true };
    }

    setSyncStatus('ok', 'Загружено');
    return { applied, pushed: false };
  } catch (err) {
    setSyncStatus('error', 'Ошибка загрузки');
    return { applied: {}, pushed: false };
  }
}

async function manualSync() {
  await pullFromCloud();
  await pushToCloud();
  if (typeof renderPlayers === 'function') renderPlayers();
  if (typeof updateNotifBadge === 'function') updateNotifBadge();
  if (!isPlayerMode && typeof renderCoachCalendar === 'function') renderCoachCalendar();
  if (typeof renderExercises === 'function') renderExercises();
  if (currentPlayerId) {
    const p = DB.players.find(x => x.id === currentPlayerId);
    if (p && typeof renderPlayerCard === 'function') renderPlayerCard(p);
  }
}

async function forceUpload() {
  if (isPlayerMode) { uiAlert('Недоступно в режиме игрока'); return; }
  uiConfirm('Загрузить ВСЕ локальные данные в облако? Данные в облаке будут перезаписаны.', async () => {
      await pushToCloud();
      uiAlert('Локальные данные отправлены в облако');
    }, () => {});
}

async function forceDownload() {
  if (isPlayerMode) { uiAlert('Недоступно в режиме игрока'); return; }
  uiConfirm('Скачать данные из облака? Все локальные изменения будут потеряны.', async () => {
      await pullFromCloud(true);
      if (typeof renderPlayers === 'function') renderPlayers();
      if (typeof updateNotifBadge === 'function') updateNotifBadge();
      if (typeof renderCoachCalendar === 'function') renderCoachCalendar();
      if (typeof renderExercises === 'function') renderExercises();
      if (currentPlayerId) {
        const p = DB.players.find(x => x.id === currentPlayerId);
        if (p && typeof renderPlayerCard === 'function') renderPlayerCard(p);
      }
      uiAlert('Данные загружены из облака');
    }, () => {});
}

/* ============================================================
   АВТОРИЗАЦИЯ
   ============================================================ */

function switchAuthTab(tab) {
  __authTab = tab;

  const tabLogin = document.getElementById('tab-login');
  const tabPlayer = document.getElementById('tab-player');
  if (tabLogin)  tabLogin.classList.toggle('active', tab === 'login');
  if (tabPlayer) tabPlayer.classList.toggle('active', tab === 'player');

  const formLogin = document.getElementById('auth-form-login');
  const formPlayer = document.getElementById('auth-form-player');
  if (formLogin)  formLogin.style.display  = (tab === 'login')  ? 'block' : 'none';
  if (formPlayer) formPlayer.style.display = (tab === 'player') ? 'block' : 'none';

  const errEl = document.getElementById('auth-error');
  const infEl = document.getElementById('auth-info');
  if (errEl) errEl.classList.remove('active');
  if (infEl) infEl.classList.remove('active');

  if (tab === 'player' && typeof playerAuthReset === 'function') playerAuthReset();
}

function showAuthError(msg) {
  const el = document.getElementById('auth-error');
  if (!el) return;
  el.textContent = msg; el.classList.add('active');
  const inf = document.getElementById('auth-info');
  if (inf) inf.classList.remove('active');
}
function showAuthInfo(msg) {
  const el = document.getElementById('auth-info');
  if (!el) return;
  el.textContent = msg; el.classList.add('active');
  const err = document.getElementById('auth-error');
  if (err) err.classList.remove('active');
}
function setAuthLoading(on) {
  const loading = document.getElementById('auth-loading');
  if (loading) loading.classList.toggle('active', on);

  const formLogin = document.getElementById('auth-form-login');
  const formPlayer = document.getElementById('auth-form-player');
  if (formLogin)  formLogin.style.display  = (on || __authTab !== 'login')  ? 'none' : 'block';
  if (formPlayer) formPlayer.style.display = (on || __authTab !== 'player') ? 'none' : 'block';

  const tabs = document.querySelector('.auth-tabs');
  if (tabs) tabs.style.display = on ? 'none' : 'flex';
}

async function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  if (!email || !password) { showAuthError('Введите email и пароль'); return; }
  document.getElementById('auth-error').classList.remove('active');
  setAuthLoading(true);
  try {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    currentUser = data.user;
    isPlayerMode = false;
    await onAuthorized();
  } catch (err) {
    setAuthLoading(false);
    const msg = String(err.message || err);
    let human = msg;
    if (/invalid login credentials/i.test(msg))      human = 'Неверный email или пароль.';
    else if (/email not confirmed/i.test(msg))        human = 'Email не подтверждён.';
    else if (/failed to fetch|network/i.test(msg))    human = 'Нет соединения с сервером.';
    showAuthError(human);
  }
}

/* ============================================================
   ВХОД ИГРОКА (многошаговый, с PIN)
   ============================================================ */

let __playerAuthCtx = null;

function playerAuthReset() {
  __playerAuthCtx = null;
  const stepFio = document.getElementById('player-auth-step-fio');
  const stepSel = document.getElementById('player-auth-step-select');
  const stepPin = document.getElementById('player-auth-step-pin');
  if (stepFio) stepFio.style.display = 'block';
  if (stepSel) { stepSel.style.display = 'none'; stepSel.innerHTML = ''; }
  if (stepPin) { stepPin.style.display = 'none'; stepPin.innerHTML = ''; }
  const inp = document.getElementById('player-login-fio');
  if (inp) inp.value = '';
  const err = document.getElementById('auth-error');
  if (err) err.classList.remove('active');
}

async function playerAuthStepFio() {
  const fio = document.getElementById('player-login-fio').value.trim();
  if (!fio) { showAuthError('Введите вашу фамилию'); return; }
  document.getElementById('auth-error').classList.remove('active');
  setAuthLoading(true);

  try {
    const { data, error } = await sb.from('coach_data').select('user_id, players').limit(1).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('База данных тренера не найдена в облаке');
    localStorage.setItem('coach_id', data.user_id);

    const unpacked = unpackPlayersFromCloud(data.players);
    const allSeasons = unpacked.seasons || {};
    const cloudCurSeason = unpacked.currentSeason || currentSeasonKey();
    const fioLower = fio.toLowerCase().trim();

    const matches = [];
    const seen = new Set();
    const pushMatch = (p, seasonKey) => {
      const key = (typeof personPinKey === 'function') ? personPinKey(p) : ('fio:' + (p.fio || ''));
      if (seen.has(key)) {
        const m = matches.find(x => ((typeof personPinKey === 'function') ? personPinKey(x.player) : ('fio:' + (x.player.fio || ''))) === key);
        if (m && seasonKey && !m.allSeasons.includes(seasonKey)) m.allSeasons.push(seasonKey);
        return;
      }
      seen.add(key);
      matches.push({ player: p, season: seasonKey, allSeasons: seasonKey ? [seasonKey] : [] });
    };
    const collect = (players, seasonKey) => {
      (players || []).forEach(p => {
        if (!(p.fio || '').toLowerCase().includes(fioLower)) return;
        pushMatch(p, seasonKey);
      });
    };

    if (cloudCurSeason && allSeasons[cloudCurSeason]) {
      collect(allSeasons[cloudCurSeason].players, cloudCurSeason);
    }
    Object.keys(allSeasons).sort().reverse().forEach(k => {
      if (k === cloudCurSeason) return;
      collect(allSeasons[k].players, k);
    });
    if (!Object.keys(allSeasons).length && Array.isArray(unpacked.players)) {
      collect(unpacked.players, null);
    }

    if (!matches.length) throw new Error('Игрок с такой фамилией не найден');

    setAuthLoading(false);
    __playerAuthCtx = { matches, unpacked, cloudCurSeason, allSeasons };

    if (matches.length === 1) showPlayerAuthPinStep(0);
    else showPlayerAuthSelectStep();

  } catch (err) {
    setAuthLoading(false);
    showAuthError('Ошибка входа: ' + err.message);
  }
}

function showPlayerAuthSelectStep() {
  const ctx = __playerAuthCtx;
  if (!ctx) return;
  const stepFio = document.getElementById('player-auth-step-fio');
  if (stepFio) stepFio.style.display = 'none';

  const sel = document.getElementById('player-auth-step-select');
  if (!sel) return;
  sel.style.display = 'block';
  sel.innerHTML = `
    <p style="font-size:12px;color:#5a6169;margin-bottom:12px;text-align:center;">Найдено несколько игроков. Выберите себя:</p>
    ${ctx.matches.map((m, i) => `
      <button class="btn btn-block btn-ghost" style="margin-bottom:8px;text-align:left;justify-content:flex-start" onclick="showPlayerAuthPinStep(${i})">
        <strong>${escapeHtml(m.player.fio || '')}</strong>
        <span style="font-size:11px;color:#5a6169;margin-left:8px">${escapeHtml(m.player.position || '')}${m.player.birthYear ? ' · ' + escapeHtml(m.player.birthYear) : ''}${m.player.team ? ' · ' + escapeHtml(m.player.team) : ''}</span>
      </button>
    `).join('')}
    <button class="btn btn-ghost btn-block" style="margin-top:8px" onclick="playerAuthReset()">← Назад</button>
  `;
}

function showPlayerAuthPinStep(idx) {
  const ctx = __playerAuthCtx;
  if (!ctx) return;
  const m = ctx.matches[idx];
  if (!m) return;

  if (!m.player.accessPin) {
    showAuthError('Доступ не настроен. Обратитесь к тренеру.');
    return;
  }

  ctx.selectedIndex = idx;

  const stepFio = document.getElementById('player-auth-step-fio');
  const stepSel = document.getElementById('player-auth-step-select');
  const stepPin = document.getElementById('player-auth-step-pin');
  if (stepFio) stepFio.style.display = 'none';
  if (stepSel) stepSel.style.display = 'none';
  if (!stepPin) return;

  stepPin.style.display = 'block';
  stepPin.innerHTML = `
    <p style="font-size:13px;color:var(--ak-green);margin-bottom:12px;text-align:center;font-weight:700;">
      ${escapeHtml(m.player.fio || '')}${m.player.position ? ' · ' + escapeHtml(m.player.position) : ''}
    </p>
    <p style="font-size:12px;color:#5a6169;margin-bottom:12px;text-align:center;">Введите PIN (4 цифры), который выдал тренер</p>
    <div class="auth-field">
      <input type="password" id="player-login-pin" maxlength="6" inputmode="numeric" pattern="[0-9]*"
             placeholder="••••" autocomplete="off"
             onkeypress="if(event.key==='Enter')doPlayerPinLogin()"
             style="text-align:center;font-size:20px;letter-spacing:6px;">
    </div>
    <button class="btn btn-block btn-red" onclick="doPlayerPinLogin()">Войти</button>
    <button class="btn btn-ghost btn-block" style="margin-top:8px" onclick="playerAuthReset()">← Ввести другую фамилию</button>
  `;
  setTimeout(() => document.getElementById('player-login-pin')?.focus(), 100);
}

function getPinAttempts(key) {
  try {
    const raw = localStorage.getItem(PIN_STORAGE_KEY);
    const data = raw ? JSON.parse(raw) : {};
    return data[key] || { count: 0, blockedUntil: 0 };
  } catch (e) { return { count: 0, blockedUntil: 0 }; }
}
function savePinAttempts(key, val) {
  try {
    const raw = localStorage.getItem(PIN_STORAGE_KEY);
    const data = raw ? JSON.parse(raw) : {};
    data[key] = val;
    localStorage.setItem(PIN_STORAGE_KEY, JSON.stringify(data));
  } catch (e) {}
}
function clearPinAttempts(key) {
  try {
    const raw = localStorage.getItem(PIN_STORAGE_KEY);
    const data = raw ? JSON.parse(raw) : {};
    delete data[key];
    localStorage.setItem(PIN_STORAGE_KEY, JSON.stringify(data));
  } catch (e) {}
}

async function doPlayerPinLogin() {
  const ctx = __playerAuthCtx;
  if (!ctx || ctx.selectedIndex == null) return;

  const m = ctx.matches[ctx.selectedIndex];
  const pinEl = document.getElementById('player-login-pin');
  const pin = (pinEl ? pinEl.value : '').trim();

  if (!/^\d{4,6}$/.test(pin)) { showAuthError('PIN — 4 цифры'); return; }

  const rateKey = (typeof personPinKey === 'function') ? (personPinKey(m.player) || m.player.fio) : m.player.fio;
  const rate = getPinAttempts(rateKey);
  if (rate.blockedUntil && Date.now() < rate.blockedUntil) {
    const sec = Math.ceil((rate.blockedUntil - Date.now()) / 1000);
    showAuthError(`Слишком много попыток. Подождите ${sec} сек.`);
    return;
  }

  if (pin !== m.player.accessPin) {
    rate.count = (rate.count || 0) + 1;
    if (rate.count >= PIN_ATTEMPTS_MAX) {
      rate.blockedUntil = Date.now() + PIN_BLOCK_SECONDS * 1000;
      rate.count = 0;
      savePinAttempts(rateKey, rate);
      showAuthError(`Неверный PIN. Блокировка на ${PIN_BLOCK_SECONDS} сек.`);
    } else {
      savePinAttempts(rateKey, rate);
      const left = PIN_ATTEMPTS_MAX - rate.count;
      showAuthError(`Неверный PIN. Осталось попыток: ${left}`);
    }
    return;
  }

  clearPinAttempts(rateKey);
  document.getElementById('auth-error').classList.remove('active');

  applyPlayerSession(m, ctx.unpacked, ctx.allSeasons, ctx.cloudCurSeason);
}

function applyPlayerSession(m, unpacked, allSeasons, cloudCurSeason) {
  const matchedPlayer = m.player;
  const matchedSeason = m.season;

  if (Object.keys(allSeasons).length) {
    DB.seasons = allSeasons;
    if (matchedSeason) {
      currentSeason = matchedSeason;
      DB.players = DB.seasons[matchedSeason].players || [matchedPlayer];
    } else {
      DB.players = unpacked.players;
    }
  } else {
    DB.players = unpacked.players;
  }

  if (typeof persistCurrentSeason === 'function') persistCurrentSeason();
  if (typeof ensureSeasonState === 'function') ensureSeasonState(cloudCurSeason);
  if (cloudCurSeason) localStorage.setItem('coach_default_season', cloudCurSeason);

  isPlayerMode = true;
  currentPlayerId = matchedPlayer.id;
  currentTab = 'calendar';

  setAuthLoading(false);
  document.getElementById('auth-screen').classList.remove('active');
  document.querySelector('header').style.display = 'flex';
  document.querySelector('main').style.display = 'block';

  document.getElementById('user-email').textContent = matchedPlayer.fio;
  document.getElementById('data-email').textContent = matchedPlayer.fio;

  document.querySelectorAll('#main-nav button[data-screen]').forEach(btn => {
    btn.style.display = 'none';
  });

  const playersBtn = document.querySelector('#main-nav button[data-screen="players"]');
  if (playersBtn) {
    playersBtn.style.display = 'block';
    playersBtn.textContent = 'Моя карточка';
    playersBtn.onclick = () => {
      showScreen('player');
      renderPlayerCard(matchedPlayer);
    };
  }

  const notifBtn = document.querySelector('.notif-btn');
  if (notifBtn) notifBtn.style.display = 'none';

  if (typeof updateSeasonSelector === 'function') updateSeasonSelector();
  if (typeof updateArchiveBadge === 'function')   updateArchiveBadge();

  showScreen('player');
  renderPlayerCard(matchedPlayer);
}

async function doLogout() {
  uiConfirm('Выйти из аккаунта?', async () => {
      saveDBNow();
      if (!isPlayerMode) {
          await sb.auth.signOut();
      }
      currentUser = null;
      isPlayerMode = false;
      localStorage.removeItem('coach_id');
      localStorage.removeItem('coach_default_season');

      window.location.reload();
    }, () => {});
}

async function onAuthorized() {
  document.getElementById('auth-screen').classList.remove('active');
  document.querySelector('header').style.display = 'flex';
  document.querySelector('main').style.display = 'block';

  document.getElementById('user-email').textContent = currentUser.email;
  document.getElementById('data-email').textContent = currentUser.email;

  document.querySelectorAll('#main-nav button[data-screen]').forEach(btn => btn.style.display = 'block');
  const notifBtn = document.querySelector('.notif-btn');
  if (notifBtn) notifBtn.style.display = 'block';

  if (typeof bindNavigation === 'function') bindNavigation();

  if (typeof migrateToSeasons === 'function')  migrateToSeasons();
  if (typeof ensureSeasonState === 'function') ensureSeasonState();
  if (typeof updateSeasonSelector === 'function') updateSeasonSelector();
  if (typeof updateArchiveBadge === 'function')   updateArchiveBadge();
  if (typeof showScreen === 'function') showScreen('coach-calendar');
  if (typeof renderPlayers === 'function') renderPlayers();
  if (typeof updateNotifBadge === 'function') updateNotifBadge();

  pullFromCloud().then(() => {
    if (typeof seedDemoData === 'function') seedDemoData();
    if (typeof migrateToSeasons === 'function')  migrateToSeasons();
    if (typeof ensureSeasonState === 'function') ensureSeasonState();
    if (typeof updateSeasonSelector === 'function') updateSeasonSelector();
    if (typeof updateArchiveBadge === 'function')   updateArchiveBadge();
    if (typeof renderPlayers === 'function') renderPlayers();
    if (typeof renderCoachCalendar === 'function') renderCoachCalendar();
    if (typeof renderExercises === 'function') renderExercises();
    if (typeof updateNotifBadge === 'function') updateNotifBadge();
  }).catch(err => console.warn('pullFromCloud bg error:', err));

  setInterval(updateNotifBadge, 60000);
}

async function initAuth() {
  try {
    if (localStorage.getItem('coach_id') && localStorage.getItem('player_mode')) {
      localStorage.removeItem('player_mode');
    }

    const { data: { session } } = await sb.auth.getSession();
    if (session && session.user) {
      currentUser = session.user;
      isPlayerMode = false;
      await onAuthorized();
    }
    else {
      document.querySelector('header').style.display = 'none';
      document.querySelector('main').style.display = 'none';
      setAuthLoading(false);
    }
  } catch (err) {
    document.querySelector('header').style.display = 'none';
    document.querySelector('main').style.display = 'none';
  }
}

window.addEventListener('online', () => { isOnline = true; if (currentUser || isPlayerMode) pushNow(); });
window.addEventListener('offline', () => { isOnline = false; setSyncStatus('offline', 'Оффлайн'); });