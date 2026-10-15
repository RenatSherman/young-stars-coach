/* ============================================================
   03-sync.js
   Supabase: авторизация, синхронизация.

   Логика разрешения конфликтов:
   - Каждый раздел (exercises, players, templates, seasons)
     имеет свою метку времени (DB.meta.updatedAt.section).
   - При pull сравниваем метки локальную и облачную.
   - Применяем облако ТОЛЬКО если оно строго новее.
   - Если локально новее — сразу push, чтобы не потерять данные.
   ============================================================ */

function setSyncStatus(status, text) {
  const el = document.getElementById('sync-status');
  const txt = document.getElementById('sync-text');
  if (!el || !txt) return;
  el.classList.remove('ok', 'saving', 'error', 'offline', 'local-newer');
  el.classList.add(status);
  txt.textContent = text;
}

function scheduleSync() {
  if (!currentUser) return;
  if (syncTimeout) clearTimeout(syncTimeout);
  setSyncStatus('saving', 'Сохранение…');
  syncTimeout = setTimeout(() => { pushToCloud(); }, 2000);
}

/* Немедленная отправка — используется, когда мы знаем,
   что локально новее облака, и ждать нельзя. */
async function pushNow() {
  if (syncTimeout) { clearTimeout(syncTimeout); syncTimeout = null; }
  await pushToCloud();
}

/* ===== Упаковка данных для отправки ===== */
function packPlayersForCloud() {
  if (DB.seasons && Object.keys(DB.seasons).length > 0) {
    return {
      __meta: {
        seasons: DB.seasons,
        currentSeason: currentSeason || null,
        templates: Array.isArray(DB.templates) ? DB.templates : [],
        updatedAt: (DB.meta && DB.meta.updatedAt) ? DB.meta.updatedAt : {}
      },
      list: DB.players || []
    };
  }
  return DB.players || [];
}

/* ===== Распаковка ===== */
function unpackPlayersFromCloud(cloudPlayers) {
  if (!cloudPlayers) return { players: [], seasons: null, currentSeason: null, templates: null, updatedAt: null };

  // Новый формат с мета-обёрткой
  if (cloudPlayers && !Array.isArray(cloudPlayers) && cloudPlayers.__meta) {
    return {
      players: Array.isArray(cloudPlayers.list) ? cloudPlayers.list : [],
      seasons: cloudPlayers.__meta.seasons || null,
      currentSeason: cloudPlayers.__meta.currentSeason || null,
      templates: Array.isArray(cloudPlayers.__meta.templates) ? cloudPlayers.__meta.templates : null,
      updatedAt: cloudPlayers.__meta.updatedAt || null
    };
  }

  // Старый формат — просто массив игроков
  if (Array.isArray(cloudPlayers)) {
    return { players: cloudPlayers, seasons: null, currentSeason: null, templates: null, updatedAt: null };
  }

  return { players: [], seasons: null, currentSeason: null, templates: null, updatedAt: null };
}

/* ===== Отправка ===== */
async function pushToCloud() {
  if (!currentUser) return;
  if (!navigator.onLine) { setSyncStatus('offline', 'Оффлайн'); return; }
  if (isSyncing) return;

  // Защита: не отправляем, если локально пусто
  const localPlayers = (DB.players || []).length;
  const localSeasons = DB.seasons ? Object.keys(DB.seasons).length : 0;
  if (localPlayers === 0 && localSeasons === 0) {
    console.warn('[sync] pushToCloud пропущен: локальные данные пусты');
    return;
  }

  isSyncing = true;
  try {
    if (typeof migrateAllExercises === 'function') migrateAllExercises();

    // Актуализируем players текущего сезона
    if (DB.seasons && currentSeason && DB.seasons[currentSeason]) {
      DB.seasons[currentSeason].players = DB.players;
    }

    // Синхронизируем метку players с seasons (players хранятся внутри seasons)
    // Это чтобы seasons и players не конфликтовали между собой.
    const payload = {
      user_id: currentUser.id,
      players: packPlayersForCloud(),
      exercises: DB.exercises,
      updated_at: new Date().toISOString()
    };

    const { error } = await sb
      .from('coach_data')
      .upsert(payload, { onConflict: 'user_id' });

    if (error) throw error;

    lastSyncedAt = new Date();
    setSyncStatus('ok', 'Синхр. ' + lastSyncedAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }));
    console.log('[sync] pushToCloud OK');
  } catch (err) {
    console.error('Sync error:', err);
    setSyncStatus('error', 'Ошибка синхр.');
  } finally {
    isSyncing = false;
  }
}

/* ===== Загрузка =====
   force = false — применяем облако только если оно новее
   force = true  — применяем облако целиком, без сравнения */
async function pullFromCloud(force = false) {
  if (!currentUser) return { applied: {}, pushed: false };
  setSyncStatus('saving', 'Загрузка…');

  try {
    const { data, error } = await sb
      .from('coach_data')
      .select('players, exercises, updated_at')
      .eq('user_id', currentUser.id)
      .maybeSingle();

    if (error) {
      console.warn('[sync] pullFromCloud error:', error.message);
      setSyncStatus('error', 'Ошибка загрузки');
      return { applied: {}, pushed: false };
    }

    if (!data) {
      console.log('[sync] В облаке нет записи. Отправляем локальные.');
      await pushToCloud();
      return { applied: {}, pushed: true };
    }

    const unpacked = unpackPlayersFromCloud(data.players);
    const cloudMeta = unpacked.updatedAt || {};

    // Локальные метки
    const localMeta = (DB.meta && DB.meta.updatedAt) ? DB.meta.updatedAt : {};

    const localPlayers   = (DB.players || []).length;
    const localSeasons   = DB.seasons ? Object.keys(DB.seasons).length : 0;
    const localExercises = (DB.exercises || []).length;
    const localTemplates = Array.isArray(DB.templates) ? DB.templates.length : 0;

    const cloudPlayers   = unpacked.players.length;
    const cloudSeasons   = unpacked.seasons ? Object.keys(unpacked.seasons).length : 0;
    const cloudExercises = Array.isArray(data.exercises) ? data.exercises.length : 0;
    const cloudTemplates = Array.isArray(unpacked.templates) ? unpacked.templates.length : 0;

    console.log('[sync] pullFromCloud — локально:', { players: localPlayers, seasons: localSeasons, exercises: localExercises, templates: localTemplates },
                '| в облаке:', { players: cloudPlayers, seasons: cloudSeasons, exercises: cloudExercises, templates: cloudTemplates });
    console.log('[sync] метки времени — локально:', localMeta, '| в облаке:', cloudMeta);

    // Сравнение: применяем облако, только если оно СТРОГО новее,
    // либо если локально пусто (первый вход).
    const cmp = (section, cloudTs, localTs, cloudCount, localCount) => {
      if (force) return cloudCount > 0;
      if (cloudTs > localTs) return cloudCount > 0;
      if (cloudTs === 0 && localTs === 0) {
        // Меток нет ни там, ни там — считаем что облако новее только если локально пусто.
        // Иначе НЕ трогаем локальные данные.
        return localCount === 0 && cloudCount > 0;
      }
      return false;
    };

    const applyExercises = cmp('exercises', Date.parse(cloudMeta.exercises || 0), Date.parse(localMeta.exercises || 0), cloudExercises, localExercises);
    const applyPlayers   = cmp('players',   Date.parse(cloudMeta.players   || 0), Date.parse(localMeta.players   || 0), cloudPlayers,   localPlayers);
    const applyTemplates = cmp('templates', Date.parse(cloudMeta.templates || 0), Date.parse(localMeta.templates || 0), cloudTemplates, localTemplates);
    const applySeasons   = cmp('seasons',   Date.parse(cloudMeta.seasons   || 0), Date.parse(localMeta.seasons   || 0), cloudSeasons,   localSeasons);

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

    if (typeof migrateAllExercises === 'function') migrateAllExercises();
    if (typeof ensureSeasonState === 'function')   ensureSeasonState(unpacked.currentSeason || null);

    (DB.players || []).forEach(p => {
      if (typeof migrateCalendar === 'function') migrateCalendar(p);
      if (!Array.isArray(p.developmentPlans)) p.developmentPlans = [];
    });

    // Проверяем, есть ли раздел, где ЛОКАЛЬНО новее облака.
    // Если да — нужно отправить локальные данные, чтобы они не потерялись.
    const localNewer =
      (Date.parse(localMeta.exercises || 0) > Date.parse(cloudMeta.exercises || 0)) ||
      (Date.parse(localMeta.players   || 0) > Date.parse(cloudMeta.players   || 0)) ||
      (Date.parse(localMeta.templates || 0) > Date.parse(cloudMeta.templates || 0)) ||
      (Date.parse(localMeta.seasons   || 0) > Date.parse(cloudMeta.seasons   || 0));

    saveDBNow();

    if (localNewer) {
      console.log('[sync] локально новее — отправляем в облако');
      setSyncStatus('local-newer', 'Отправляю…');
      await pushToCloud();
      return { applied, pushed: true };
    }

    setSyncStatus('ok', 'Загружено');
    return { applied, pushed: false };
  } catch (err) {
    console.error('Pull error:', err);
    setSyncStatus('error', 'Ошибка загрузки');
    return { applied: {}, pushed: false };
  }
}

/* ===== Ручная синхронизация (soft) ===== */
async function manualSync() {
  await pullFromCloud();
  await pushToCloud();
  if (typeof renderPlayers === 'function') renderPlayers();
  if (typeof updateNotifBadge === 'function') updateNotifBadge();
  if (typeof renderCoachCalendar === 'function') renderCoachCalendar();
  if (typeof renderExercises === 'function') renderExercises();
  if (currentPlayerId) {
    const p = DB.players.find(x => x.id === currentPlayerId);
    if (p && typeof renderPlayerCard === 'function') renderPlayerCard(p);
  }
}

/* ===== Принудительная отправка ===== */
async function forceUpload() {
  uiConfirm(
    'Загрузить ВСЕ локальные данные в облако? Данные в облаке будут перезаписаны.',
    async () => {
      await pushToCloud();
      uiAlert('Локальные данные отправлены в облако');
    },
    () => {}
  );
}

/* ===== Принудительная загрузка ===== */
async function forceDownload() {
  uiConfirm(
    'Скачать данные из облака? Все локальные изменения будут потеряны.',
    async () => {
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
    },
    () => {}
  );
}

/* ===== Авторизация ===== */
function switchAuthTab(tab) {
  document.getElementById('tab-login').classList.toggle('active', tab === 'login');
  document.getElementById('tab-register').classList.toggle('active', tab === 'register');
  document.getElementById('auth-form-login').style.display = (tab === 'login') ? 'block' : 'none';
  document.getElementById('auth-form-register').style.display = (tab === 'register') ? 'block' : 'none';
  document.getElementById('auth-error').classList.remove('active');
  document.getElementById('auth-info').classList.remove('active');
}
function showAuthError(msg) {
  const el = document.getElementById('auth-error');
  el.textContent = msg; el.classList.add('active');
  document.getElementById('auth-info').classList.remove('active');
}
function showAuthInfo(msg) {
  const el = document.getElementById('auth-info');
  el.textContent = msg; el.classList.add('active');
  document.getElementById('auth-error').classList.remove('active');
}
function setAuthLoading(on) {
  document.getElementById('auth-loading').classList.toggle('active', on);
  document.getElementById('auth-form-login').style.display = on ? 'none' : 'block';
  document.getElementById('auth-form-register').style.display = 'none';
  document.querySelector('.auth-tabs').style.display = on ? 'none' : 'flex';
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
async function doRegister() {
  const email = document.getElementById('reg-email').value.trim();
  const p1 = document.getElementById('reg-password').value;
  const p2 = document.getElementById('reg-password2').value;
  if (!email || !p1) { showAuthError('Введите email и пароль'); return; }
  if (p1.length < 6) { showAuthError('Пароль должен быть минимум 6 символов'); return; }
  if (p1 !== p2) { showAuthError('Пароли не совпадают'); return; }
  document.getElementById('auth-error').classList.remove('active');
  setAuthLoading(true);
  try {
    const { data, error } = await sb.auth.signUp({ email, password: p1 });
    if (error) throw error;
    if (data.user && data.session) { currentUser = data.user; await onAuthorized(); }
    else { setAuthLoading(false); showAuthInfo('Аккаунт создан. Проверьте email.'); }
  } catch (err) {
    setAuthLoading(false);
    showAuthError('Ошибка регистрации: ' + (err.message || err));
  }
}

async function doLogout() {
  uiConfirm(
    'Выйти из аккаунта?',
    async () => {
      saveDBNow();
      await sb.auth.signOut();
      currentUser = null;
      document.getElementById('auth-screen').classList.add('active');
      document.querySelector('header').style.display = 'none';
      document.querySelector('main').style.display = 'none';
      switchAuthTab('login');
    },
    () => {}
  );
}

/* ===== После входа ===== */
async function onAuthorized() {
  document.getElementById('auth-screen').classList.remove('active');
  document.querySelector('header').style.display = 'flex';
  document.querySelector('main').style.display = 'block';

  document.getElementById('user-email').textContent = currentUser.email;
  document.getElementById('data-email').textContent = currentUser.email;

  // 1. Показываем интерфейс из локальных данных
  if (typeof migrateToSeasons === 'function')  migrateToSeasons();
  if (typeof ensureSeasonState === 'function') ensureSeasonState();
  if (typeof updateSeasonSelector === 'function') updateSeasonSelector();
  if (typeof updateArchiveBadge === 'function')   updateArchiveBadge();
  if (typeof showScreen === 'function') showScreen('coach-calendar');
  if (typeof renderPlayers === 'function') renderPlayers();
  if (typeof updateNotifBadge === 'function') updateNotifBadge();

  // 2. Фоном — облако (с защитой от затирания локального)
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
    const { data: { session } } = await sb.auth.getSession();
    if (session && session.user) { currentUser = session.user; await onAuthorized(); }
    else {
      document.querySelector('header').style.display = 'none';
      document.querySelector('main').style.display = 'none';
    }
  } catch (err) {
    console.error('Auth init error:', err);
    document.querySelector('header').style.display = 'none';
    document.querySelector('main').style.display = 'none';
  }
}

window.addEventListener('online', () => { isOnline = true; if (currentUser) pushNow(); });
window.addEventListener('offline', () => { isOnline = false; setSyncStatus('offline', 'Оффлайн'); });