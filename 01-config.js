/* ============================================================
   01-config.js
   Настройки Supabase, глобальные переменные состояния, константы.
   Сезоны: константы, переменные и хелперы (с приоритетом localStorage).
   Загружается ПЕРВЫМ.
   ============================================================ */

/* ===== Настройки Supabase ===== */
const SUPABASE_URL = 'https://dexvvkvxpdpcmnjjtqzm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRleHZ2a3Z4cGRwY21uamp0cXptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwNzUyMzUsImV4cCI6MjEwNTY1MTIzNX0.5nVwdeOR-79T3ylfFDabz5Peh5CGWXcWUP7SH7pN9u0';

/* ===== Клиент Supabase ===== */
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ===== Глобальное состояние приложения ===== */
let currentUser = null;
let syncTimeout = null;
let isSyncing = false;
let lastSyncedAt = null;
let isOnline = navigator.onLine;

/* ===== Ключи локального хранилища ===== */
const STORAGE_KEY = 'akbars_hockey_v2';
const STORAGE_SEASON_KEY = 'akbars_currentSeason';

/* ===== Главная база данных ===== */
let DB = {
  players: [],
  seasons: {},
  exercises: [],
  meta: {
    // Метки времени последнего изменения разделов
    // { exercises: ISO-строка, players: ISO, templates: ISO, seasons: ISO }
    updatedAt: {}
  },
  testColumns: null,
  templates: []
};

/* ===== Сезоны: переменные ===== */
let currentSeason = null;
let seasonsEditable = false;

const SEASON_START_MONTH = 7;  // июль
const SEASON_END_MONTH   = 5;  // май
const DEFAULT_SEASON = '2026/27';

/* ===== Состояние UI ===== */
let openAccordions = new Set();
let currentPlayerId = null;
let currentTab = 'skills';
let currentPlanMonth = null;
let reportMonth = null;
let coachCalMonth = null;

/* ===== Константы ===== */
const WORK_TYPES = ['Самостоятельная', 'Индивидуальная с тренером', 'В группе'];

const WORK_TYPE_COLORS = {
  'Самостоятельная':           '#f59e0b',
  'Индивидуальная с тренером': '#C8102E',
  'В группе':                  '#4f46e5'
};

const FACT_OPTIONS = [
  { value: 'done',    label: 'Выполнено' },
  { value: 'partial', label: 'Выполнено частично' },
  { value: 'notdone', label: 'Не выполнено' },
  { value: '',        label: '—' }
];

const DEFAULT_TEST_COLUMNS = [
  { key: 'vertical', label: 'Верт. прыжок',  unit: 'см' },
  { key: 'sprint',   label: 'Спринт 30м',    unit: 'с'  },
  { key: 'bench',    label: 'Жим 5ПМ',       unit: 'кг' },
  { key: 'deadlift', label: 'Становая',      unit: 'кг' },
  { key: 'squat',    label: 'Присед 5ПМ',    unit: 'кг' },
  { key: 'pullups',  label: 'Подтягивания',  unit: 'раз' }
];

const MONTH_NAMES_RU = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const MONTH_NAMES_RU_GEN = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
const DOW_SHORT_RU = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];

/* ===== Хелперы тестовых столбцов ===== */
function getTestColumns() {
  if (Array.isArray(DB.testColumns) && DB.testColumns.length) return DB.testColumns;
  return DEFAULT_TEST_COLUMNS;
}

/* ===== Хелперы факта ===== */
function factLabel(value) {
  const f = FACT_OPTIONS.find(x => x.value === value);
  return f ? f.label : '—';
}
function factClass(value) {
  if (value === 'done')    return 'done';
  if (value === 'partial') return 'partial';
  if (value === 'notdone') return 'notdone';
  return '';
}

/* ============================================================
   МЕТКИ ВРЕМЕНИ РАЗДЕЛОВ
   Каждый раздел (exercises, players, templates, seasons)
   имеет свою метку последнего изменения. Она:
   1) обновляется при каждом изменении раздела;
   2) уезжает в облако вместе с данными;
   3) используется при pull, чтобы понять, чья версия новее.
   ============================================================ */
function touchMeta(section) {
  if (!DB.meta) DB.meta = {};
  if (!DB.meta.updatedAt) DB.meta.updatedAt = {};
  DB.meta.updatedAt[section] = new Date().toISOString();
}

function getMetaTs(section) {
  if (!DB.meta || !DB.meta.updatedAt) return 0;
  const v = DB.meta.updatedAt[section];
  return v ? Date.parse(v) || 0 : 0;
}

/* ============================================================
   ХЕЛПЕРЫ СЕЗОНОВ — ЕДИНОЕ МЕСТО
   ============================================================ */

/* Ключ сезона по календарю: с 1 июля — новый сезон.
   Например: август 2026 → '2026/27'; февраль 2027 → '2026/27';
             июнь 2027 → '2026/27'; июль 2027 → '2027/28'. */
function currentSeasonKey(date) {
  const d = date ? new Date(date) : new Date();
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  if (m < SEASON_START_MONTH) {
    return makeSeasonKey(y - 1);
  }
  return makeSeasonKey(y);
}

/* '2026/27' из '2026' */
function makeSeasonKey(startYear) {
  const y1 = Number(startYear);
  const y2 = String((y1 + 1) % 100).padStart(2, '0');
  return `${y1}/${y2}`;
}

/* Разбор '2026/27' → { startYear, endYear, endYY } */
function parseSeasonKey(key) {
  if (!key || typeof key !== 'string') return null;
  const m = key.match(/^(\d{4})\/(\d{2})$/);
  if (!m) return null;
  const startYear = parseInt(m[1], 10);
  return { startYear, endYear: startYear + 1, endYY: m[2] };
}

/* Красивая надпись '2026/27' */
function formatSeasonLabel(key) {
  if (!key) return '—';
  return key;
}

/* Список ключей сезонов, отсортированный по убыванию (свежие сверху) */
function getSeasonKeys() {
  if (!DB.seasons || typeof DB.seasons !== 'object') return [];
  return Object.keys(DB.seasons).sort((a, b) => {
    const pa = parseSeasonKey(a), pb = parseSeasonKey(b);
    if (!pa || !pb) return 0;
    return pb.startYear - pa.startYear;
  });
}

/* Архивный ли сезон. Архивным считается всё, что не равно текущему по календарю. */
function isArchiveSeason(key) {
  if (!key) return false;
  return key !== currentSeasonKey();
}

/* Сохранить текущий сезон в localStorage */
function persistCurrentSeason() {
  try { localStorage.setItem(STORAGE_SEASON_KEY, currentSeason || ''); }
  catch (e) { /* ignore */ }
}

/* Гарантирует корректный currentSeason.
   Приоритет:
   1) localStorage (последний выбор пользователя)   — ГЛАВНЫЙ
   2) аргумент preferredKey (например, из облака)
   3) текущий по календарю
   4) последний по алфавиту
   5) DEFAULT_SEASON, если ничего нет. */
function ensureSeasonState(preferredKey) {
  if (!DB.seasons || !Object.keys(DB.seasons).length) {
    currentSeason = DEFAULT_SEASON;
    return;
  }

  const keys = Object.keys(DB.seasons);
  const stored = (() => { try { return localStorage.getItem(STORAGE_SEASON_KEY); } catch (e) { return null; } })();
  const calKey = currentSeasonKey();

  // 1. Приоритет — localStorage
  if (stored && DB.seasons[stored]) {
    currentSeason = stored;
    DB.players = DB.seasons[stored].players || [];
    persistCurrentSeason();
    return;
  }

  // 2. Сезон-подсказка (например, из облака)
  if (preferredKey && DB.seasons[preferredKey]) {
    currentSeason = preferredKey;
    DB.players = DB.seasons[preferredKey].players || [];
    persistCurrentSeason();
    return;
  }

  // 3. Текущий по календарю
  if (DB.seasons[calKey]) {
    currentSeason = calKey;
    DB.players = DB.seasons[calKey].players || [];
    persistCurrentSeason();
    return;
  }

  // 4. Последний по алфавиту
  const last = keys.sort().slice(-1)[0];
  currentSeason = last;
  DB.players = DB.seasons[last].players || [];
  persistCurrentSeason();
}

/* Может ли пользователь редактировать указанный сезон */
function canEditSeason(key) {
  if (key === currentSeason) return true;
  return seasonsEditable === true;
}