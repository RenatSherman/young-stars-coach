/* ============================================================
   03-sync.js
   Supabase: авторизация, синхронизация данных, статус.

   РЕЖИМ СОВМЕСТИМОСТИ:
   Файл работает с двумя структурами таблицы coach_data:
     - новая (seasons + current_season + players)
     - старая (players)
   Режим определяется автоматически при сохранении и загрузке.

   Все функции — только определения. Никаких вызовов на верхнем
   уровне. Вызовы идут из 10-init.js (loadDB, initAuth) и из UI.

   Загружается после 02-utils.js.
   ============================================================ */

/* ===== Ключ для хранения режима облака ===== */
const SYNC_MODE_KEY = STORAGE_KEY + '_sync_mode';   // 'seasons' | 'players' | null

/* ===== Индикатор статуса синхронизации ===== */
function setSyncStatus(status, text) {
  const el = document.getElementById('sync-status');
  const txt = document.getElementById('sync-text');
  if (!el || !txt) return;
  el.classList.remove('ok', 'saving', 'error', 'offline');
  el.classList.add(status);
  txt.textContent = text;
}

/* ============================================================
   Гарантия, что DB.seasons существует.
   ============================================================ */
function ensureSeasonsShape() {
  if (DB.seasons && typeof DB.seasons === 'object' && Object.keys(DB.seasons).length > 0) {
    if (typeof currentSeason === 'string' && DB.seasons[currentSeason]) {
      DB.players = DB.seasons[currentSeason].players || [];
    }
    return;
  }

  const legacyPlayers = Array.isArray(DB.players) ? DB.players : [];
  const now = new Date().toISOString();

  const key = (typeof currentSeason === 'string' && currentSeason)
    ? currentSeason
    : (typeof DEFAULT_SEASON === 'string' ? DEFAULT_SEASON : '2026/27');

  DB.seasons = {
    [key]: {
      players: legacyPlayers,
      createdAt: now,
      archived: false
    }
  };

  if (typeof currentSeason !== 'string' || !currentSeason) {
    currentSeason = key;
  }
  DB.players = legacyPlayers;

  console.log('[sync] ensureSeasonsShape: создан сезон', key, '| игроков:', legacyPlayers.length);
}

/* ============================================================
   Определение режима облака.
   ============================================================ */
function getStoredSyncMode() {
  try { return localStorage.getItem(SYNC_MODE_KEY) || null; } catch (e) { return null; }
}
function setStoredSyncMode(mode) {
  try {
    if (mode) localStorage.setItem(SYNC_MODE_KEY, mode);
    else localStorage.removeItem(SYNC_MODE_KEY);
  } catch (e) {}
}

/* ============================================================
   Планирование синхронизации (debounce 1.5 сек)
   ============================================================ */
function scheduleSync() {
  if (!currentUser) return;
  if (syncTimeout) clearTimeout(syncTimeout);
  setSyncStatus('saving', 'Сохранение…');
  syncTimeout = setTimeout(() => { pushToCloud(); }, 1500);
}

/* ============================================================
   ОТПРАВКА В ОБЛАКО
   ============================================================ */

async function pushToCloud() {
  if (!currentUser) return;
  if (!navigator.onLine) { setSyncStatus('offline', 'Оффлайн'); return; }
  if (isSyncing) return;

  try {
    ensureSeasonsShape();
  } catch (e) {
    console.error('ensureSeasonsShape error:', e);
  }

  isSyncing = true;
  try {
    const mode = getStoredSyncMode() || 'seasons';

    if (mode === 'seasons') {
      const ok = await tryPushSeasons();
      if (!ok) {
        console.warn('[sync] pushToCloud: seasons недоступны, переключаюсь на players');
        setStoredSyncMode('players');
        await pushPlayers();
      }
    } else {
      await pushPlayers();
    }

    lastSyncedAt = new Date();
    setSyncStatus('ok', 'Синхр. ' + lastSyncedAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }));

  } catch (err) {
    console.error('Sync error:', err);
    setSyncStatus('error', 'Ошибка синхр.');
  } finally {
    isSyncing = false;
  }
}

/* Пробуем записать в новую структуру. Возвращаем true, если удалось. */
async function tryPushSeasons() {
  const { error } = await sb
    .from('coach_data')
    .upsert({
      user_id: currentUser.id,
      seasons: DB.seasons || {},
      current_season: currentSeason || null,
      exercises: DB.exercises || [],
      test_columns: DB.testColumns || null,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' });

  if (error) {
    const msg = String(error.message || error);
    if (/column .* does not exist|seasons|current_season/i.test(msg)) {
      return false;
    }
    throw error;
  }
  return true;
}

/* Запись в старую структуру: только текущий сезон как players. */
async function pushPlayers() {
  let players = DB.players;
  if (DB.seasons && DB.seasons[currentSeason] && Array.isArray(DB.seasons[currentSeason].players)) {
    players = DB.seasons[currentSeason].players;
  }

  const { error } = await sb
    .from('coach_data')
    .upsert({
      user_id: currentUser.id,
      players: players || [],
      exercises: DB.exercises || [],
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' });

  if (error) throw error;
}

/* ============================================================
   ЗАГРУЗКА ИЗ ОБЛАКА
   ============================================================ */

async function pullFromCloud() {
  if (!currentUser) return false;
  setSyncStatus('saving', 'Загрузка…');

  try {
    const { data, error } = await sb
      .from('coach_data')
      .select('*')
      .eq('user_id', currentUser.id)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      ensureSeasonsShape();
      await pushToCloud();
      return true;
    }

    DB.exercises   = data.exercises || [];
    DB.testColumns = data.test_columns || null;

    const hasSeasons  = data.seasons && typeof data.seasons === 'object' && Object.keys(data.seasons).length > 0;
    const hasPlayers  = Array.isArray(data.players) && data.players.length > 0;

    if (hasSeasons) {
      setStoredSyncMode('seasons');
      DB.seasons = data.seasons;
      currentSeason = data.current_season || (typeof currentSeasonKey === 'function' ? currentSeasonKey() : DEFAULT_SEASON);

      if (!DB.seasons[currentSeason]) {
        const keys = Object.keys(DB.seasons);
        currentSeason = keys[0] || currentSeason;
      }
      DB.players = DB.seasons[currentSeason] ? (DB.seasons[currentSeason].players || []) : [];

      console.log('[sync] pullFromCloud: загружены сезоны:',
                  Object.keys(DB.seasons).join(', '), '| текущий:', currentSeason);

    } else if (hasPlayers) {
      setStoredSyncMode('players');

      const now = new Date().toISOString();
      const key = (typeof currentSeason === 'string' && currentSeason)
        ? currentSeason
        : DEFAULT_SEASON;

      DB.seasons = {
        [key]: {
          players: data.players,
          createdAt: now,
          archived: false
        }
      };
      currentSeason = key;
      DB.players = data.players;

      console.log('[sync] pullFromCloud: загружен старый формат, обёрнут в сезон', key,
                  '| игроков:', data.players.length);

    } else {
      ensureSeasonsShape();
    }

    Object.values(DB.seasons || {}).forEach(season => {
      (season.players || []).forEach(p => {
        if (typeof migrateCalendar === 'function') migrateCalendar(p);
        if (!Array.isArray(p.developmentPlans)) p.developmentPlans = [];
      });
    });

    persistLocal();
    setSyncStatus('ok', 'Загружено');
    return true;

  } catch (err) {
    console.error('Pull error:', err);
    setSyncStatus('error', 'Ошибка загрузки');
    return false;
  }
}

/* ===== Сохранение локально без синхронизации ===== */
function persistLocal() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DB));
  } catch (e) {
    console.error('localStorage save error:', e);
  }
}

/* ============================================================
   РУЧНЫЕ ДЕЙСТВИЯ
   ============================================================ */

async function manualSync() {
  setStoredSyncMode(null);
  await pullFromCloud();
  await pushToCloud();
  if (typeof renderPlayers === 'function')    renderPlayers();
  if (typeof updateNotifBadge === 'function') updateNotifBadge();
  if (currentPlayerId) {
    const p = DB.players.find(x => x.id === currentPlayerId);
    if (p && typeof renderPlayerCard === 'function') renderPlayerCard(p);
  }
}

async function forceUpload() {
  if (!confirm('Загрузить ВСЕ локальные данные в облако? Данные в облаке будут перезаписаны.')) return;
  setStoredSyncMode(null);
  await pushToCloud();
  alert('Локальные данные отправлены в облако');
}

async function forceDownload() {
  if (!confirm('Скачать данные из облака? Все локальные изменения будут потеряны.')) return;
  setStoredSyncMode(null);
  await pullFromCloud();
  if (typeof renderPlayers === 'function')    renderPlayers();
  if (typeof updateNotifBadge === 'function') updateNotifBadge();
  if (currentPlayerId) {
    const p = DB.players.find(x => x.id === currentPlayerId);
    if (p && typeof renderPlayerCard === 'function') renderPlayerCard(p);
  }
  alert('Данные загружены из облака');
}

/* ============================================================
   АВТОРИЗАЦИЯ
   ============================================================ */

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
  el.textContent = msg;
  el.classList.add('active');
  document.getElementById('auth-info').classList.remove('active');
}

function showAuthInfo(msg) {
  const el = document.getElementById('auth-info');
  el.textContent = msg;
  el.classList.add('active');
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
    if (/invalid login credentials/i.test(msg)) {
      human = 'Неверный email или пароль. Проверьте раскладку клавиатуры, Caps Lock и подтверждение email.';
    } else if (/email not confirmed/i.test(msg)) {
      human = 'Email не подтверждён. Подтвердите адрес в письме или отключите подтверждение в Supabase.';
    } else if (/failed to fetch|network/i.test(msg)) {
      human = 'Нет соединения с сервером. Проверьте интернет.';
    }
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

    if (data.user && data.session) {
      currentUser = data.user;
      await onAuthorized();
    } else {
      setAuthLoading(false);
      showAuthInfo('Аккаунт создан. Проверьте email для подтверждения.');
    }
  } catch (err) {
    setAuthLoading(false);
    showAuthError('Ошибка регистрации: ' + (err.message || err));
  }
}

async function doLogout() {
  if (!confirm('Выйти из аккаунта?')) return;
  await sb.auth.signOut();
  currentUser = null;
  document.getElementById('auth-screen').classList.add('active');
  document.querySelector('header').style.display = 'none';
  document.querySelector('main').style.display = 'none';
  switchAuthTab('login');
}

async function onAuthorized() {
  document.getElementById('auth-screen').classList.remove('active');
  document.querySelector('header').style.display = 'flex';
  document.querySelector('main').style.display = 'block';

  document.getElementById('user-email').textContent = currentUser.email;
  document.getElementById('data-email').textContent = currentUser.email;

  const loaded = await pullFromCloud();
  if (!loaded) await pushToCloud();

  if (typeof seedDemoData === 'function') seedDemoData();
  if (typeof renderPlayers === 'function') renderPlayers();
  if (typeof updateNotifBadge === 'function') updateNotifBadge();
  if (typeof renderSeasonSelector === 'function') renderSeasonSelector();
  if (typeof updateArchiveBadge === 'function')   updateArchiveBadge();
  setInterval(() => {
    if (typeof updateNotifBadge === 'function') updateNotifBadge();
  }, 60000);
}

async function initAuth() {
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (session && session.user) {
      currentUser = session.user;
      await onAuthorized();
    } else {
      document.querySelector('header').style.display = 'none';
      document.querySelector('main').style.display = 'none';
    }
  } catch (err) {
    console.error('Auth init error:', err);
    document.querySelector('header').style.display = 'none';
    document.querySelector('main').style.display = 'none';
  }
}

window.addEventListener('online', () => {
  isOnline = true;
  if (currentUser) pushToCloud();
});
window.addEventListener('offline', () => {
  isOnline = false;
  setSyncStatus('offline', 'Оффлайн');
});