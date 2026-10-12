/* ============================================================
   03-sync.js
   Supabase: авторизация, синхронизация.
   Работает с существующей схемой coach_data:
     user_id, players (jsonb), exercises (jsonb), updated_at.
   Сезоны и шаблоны хранятся ВНУТРИ поля players (в служебном
   ключе __meta), поэтому изменять схему Supabase не нужно.
   ============================================================ */

function setSyncStatus(status, text) {
  const el = document.getElementById('sync-status');
  const txt = document.getElementById('sync-text');
  if (!el || !txt) return;
  el.classList.remove('ok', 'saving', 'error', 'offline');
  el.classList.add(status);
  txt.textContent = text;
}

function scheduleSync() {
  if (!currentUser) return;
  if (syncTimeout) clearTimeout(syncTimeout);
  setSyncStatus('saving', 'Сохранение…');
  syncTimeout = setTimeout(() => { pushToCloud(); }, 2000);
}

/* ===== Упаковка данных для отправки =====
   В поле players кладём объект:
     {
       __meta: {
         seasons: {...},
         currentSeason: 'YYYY/YY',
         templates: [...]
       },
       list: [...игроки текущего сезона]
     }
   Если у нас нет сезонов (старый формат) — просто массив игроков. */
function packPlayersForCloud() {
  if (DB.seasons && Object.keys(DB.seasons).length > 0) {
    return {
      __meta: {
        seasons: DB.seasons,
        currentSeason: currentSeason || null,
        templates: Array.isArray(DB.templates) ? DB.templates : []
      },
      list: DB.players || []
    };
  }
  return DB.players || [];
}

/* ===== Распаковка ===== */
function unpackPlayersFromCloud(cloudPlayers) {
  if (!cloudPlayers) return { players: [], seasons: null, currentSeason: null, templates: null };

  // Новый формат с мета-обёрткой
  if (cloudPlayers && !Array.isArray(cloudPlayers) && cloudPlayers.__meta) {
    return {
      players: Array.isArray(cloudPlayers.list) ? cloudPlayers.list : [],
      seasons: cloudPlayers.__meta.seasons || null,
      currentSeason: cloudPlayers.__meta.currentSeason || null,
      templates: Array.isArray(cloudPlayers.__meta.templates) ? cloudPlayers.__meta.templates : null
    };
  }

  // Старый формат — просто массив игроков
  if (Array.isArray(cloudPlayers)) {
    return { players: cloudPlayers, seasons: null, currentSeason: null, templates: null };
  }

  return { players: [], seasons: null, currentSeason: null, templates: null };
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

    // Отправляем ТОЛЬКО те поля, что есть в схеме Supabase
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
    console.log('[sync] pushToCloud OK. players упаковано:', Array.isArray(payload.players) ? payload.players.length : 'meta');
  } catch (err) {
    console.error('Sync error:', err);
    setSyncStatus('error', 'Ошибка синхр.');
  } finally {
    isSyncing = false;
  }
}

/* ===== Загрузка =====
   force = false — защищаемся от пустого облака
   force = true  — принимаем всё из облака как есть */
async function pullFromCloud(force = false) {
  if (!currentUser) return false;
  setSyncStatus('saving', 'Загрузка…');

  try {
    // Запрашиваем ТОЛЬКО существующие колонки
    const { data, error } = await sb
      .from('coach_data')
      .select('players, exercises, updated_at')
      .eq('user_id', currentUser.id)
      .maybeSingle();

    if (error) {
      // Если 400/404 и т.п. — просто считаем, что записи нет
      console.warn('[sync] pullFromCloud error, игнорируем:', error.message);
      setSyncStatus('error', 'Ошибка загрузки');
      return false;
    }

    if (!data) {
      // Нет записи — создаём из локальных
      console.log('[sync] В облаке нет записи. Отправляем локальные.');
      await pushToCloud();
      return true;
    }

    const unpacked = unpackPlayersFromCloud(data.players);

    const localPlayers    = (DB.players || []).length;
    const localSeasons    = DB.seasons ? Object.keys(DB.seasons).length : 0;
    const localExercises  = (DB.exercises || []).length;
    const localTemplates  = Array.isArray(DB.templates) ? DB.templates.length : 0;

    const cloudPlayers    = unpacked.players.length;
    const cloudSeasons    = unpacked.seasons ? Object.keys(unpacked.seasons).length : 0;
    const cloudExercises  = Array.isArray(data.exercises) ? data.exercises.length : 0;
    const cloudTemplates  = Array.isArray(unpacked.templates) ? unpacked.templates.length : 0;

    console.log('[sync] pullFromCloud — локально:',
                { players: localPlayers, seasons: localSeasons, exercises: localExercises, templates: localTemplates },
                '| в облаке:',
                { players: cloudPlayers, seasons: cloudSeasons, exercises: cloudExercises, templates: cloudTemplates });

    // Решение: применять или нет
    const applySeasons = force
      || (cloudSeasons > 0 && cloudSeasons >= localSeasons)
      || localSeasons === 0;

    const applyPlayers = force
      || (cloudPlayers > 0 && cloudPlayers >= localPlayers)
      || localPlayers === 0;

    const applyExercises = force
      || (cloudExercises > 0 && cloudExercises >= localExercises)
      || localExercises === 0;

    const applyTemplates = force
      || (cloudTemplates > 0 && cloudTemplates >= localTemplates)
      || localTemplates === 0;

    if (applySeasons && unpacked.seasons) {
      DB.seasons = unpacked.seasons;
    }

    if (applyPlayers && unpacked.players.length > 0) {
      // Если применяем players — и это игроки для текущего сезона
      if (DB.seasons && (unpacked.currentSeason || currentSeason) && DB.seasons[unpacked.currentSeason || currentSeason]) {
        // Уже обёрнуто в seasons — просто обновим текущий список
        DB.players = DB.seasons[unpacked.currentSeason || currentSeason].players || unpacked.players;
      } else {
        DB.players = unpacked.players;
      }
    }

    if (applyExercises && Array.isArray(data.exercises) && data.exercises.length > 0) {
      DB.exercises = data.exercises;
    }

    if (applyTemplates && Array.isArray(unpacked.templates)) {
      DB.templates = unpacked.templates;
    }

    if (typeof migrateAllExercises === 'function') migrateAllExercises();
    if (typeof ensureSeasonState === 'function')   ensureSeasonState(unpacked.currentSeason || null);

    (DB.players || []).forEach(p => {
      if (typeof migrateCalendar === 'function') migrateCalendar(p);
      if (!Array.isArray(p.developmentPlans)) p.developmentPlans = [];
    });

    saveDBNow();
    setSyncStatus('ok', 'Загружено');
    return true;
  } catch (err) {
    console.error('Pull error:', err);
    setSyncStatus('error', 'Ошибка загрузки');
    return false;
  }
}

/* ===== Ручная синхронизация (soft) ===== */
async function manualSync() {
  await pullFromCloud();
  await pushToCloud();
  if (typeof renderPlayers === 'function') renderPlayers();
  if (typeof updateNotifBadge === 'function') updateNotifBadge();
  if (typeof renderCoachCalendar === 'function') renderCoachCalendar();
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

  // 2. Фоном — облако (с защитой от пустой перезаписи)
  pullFromCloud().then(() => {
    if (typeof seedDemoData === 'function') seedDemoData();
    if (typeof migrateToSeasons === 'function')  migrateToSeasons();
    if (typeof ensureSeasonState === 'function') ensureSeasonState();
    if (typeof updateSeasonSelector === 'function') updateSeasonSelector();
    if (typeof updateArchiveBadge === 'function')   updateArchiveBadge();
    if (typeof renderPlayers === 'function') renderPlayers();
    if (typeof renderCoachCalendar === 'function') renderCoachCalendar();
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

window.addEventListener('online', () => { isOnline = true; if (currentUser) pushToCloud(); });
window.addEventListener('offline', () => { isOnline = false; setSyncStatus('offline', 'Оффлайн'); });