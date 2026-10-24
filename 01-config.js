/* ============================================================
   01-config.js
   ============================================================ */

const SUPABASE_URL = 'https://dexvvkvxpdpcmnjjtqzm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRleHZ2a3Z4cGRwY21uamp0cXptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwNzUyMzUsImV4cCI6MjEwNTY1MTIzNX0.5nVwdeOR-79T3ylfFDabz5Peh5CGWXcWUP7SH7pN9u0';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let syncTimeout = null;
let isSyncing = false;
let lastSyncedAt = null;
let isOnline = navigator.onLine;

const STORAGE_KEY = 'akbars_hockey_v2';
const STORAGE_SEASON_KEY = 'akbars_currentSeason';

let DB = {
  players: [],
  seasons: {},
  exercises: [],
  meta: { updatedAt: {} },
  testColumns: null,
  templates: [],
  playerGroups: {
    stars: { id: 'g_stars', name: 'Звездочки', subgroups: [] },
    general: { id: 'g_general', name: 'Общая группа', subgroups: [] },
    special: { id: 'g_special', name: 'Спецгруппа', subgroups: [] }
  },
  techStructure: null,
  otherStructure: null
};

let currentSeason = null;
let seasonsEditable = false;

const SEASON_START_MONTH = 7;
const SEASON_END_MONTH   = 5;
const DEFAULT_SEASON = '2026/27';

let openAccordions = new Set();
let currentPlayerId = null;
let currentTab = 'skills';
let currentPlanMonth = null;
let reportMonth = null;
let coachCalMonth = null;

/* ===== PIN-коды для игроков ===== */
const PIN_LENGTH = 4;
const PIN_ATTEMPTS_MAX = 3;
const PIN_BLOCK_SECONDS = 60;
const PIN_STORAGE_KEY = 'akbars_pin_attempts';

function generatePin() {
  try {
    const arr = new Uint8Array(PIN_LENGTH);
    (window.crypto || window.msCrypto).getRandomValues(arr);
    return Array.from(arr).map(b => (b % 10).toString()).join('');
  } catch (e) {
    let s = '';
    for (let i = 0; i < PIN_LENGTH; i++) s += Math.floor(Math.random() * 10);
    return s;
  }
}

const WORK_TYPES = ['Самостоятельная', 'Индивидуальная с тренером', 'В группе', 'Командная'];

const WORK_TYPE_COLORS = {
  'Самостоятельная':           '#f59e0b',
  'Индивидуальная с тренером': '#C8102E',
  'В группе':                  '#4f46e5',
  'Командная':                 '#059669'
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

function defaultTechDetail() {
  return [
    { group: 'Катание', sub: 'Посадка', name: 'Прокат в посадке', start: null, mid: null, end: null },
    { group: 'Катание', sub: 'Отталкивания', name: 'Отталкивание внутренним ребром', start: null, mid: null, end: null }
  ];
}

function defaultOtherDetail() {
  return [
    { group: 'Физические качества', sub: 'Скорость', name: 'Бег 30м', start: null, plan: null, fact: null },
    { group: 'Тактические навыки', sub: 'Позиция', name: 'Выбор позиции в обороне', start: null, plan: null, fact: null },
    { group: 'Психологические характеристики', sub: 'Воля', name: 'Настрой на игру', start: null, plan: null, fact: null }
  ];
}

const MONTH_NAMES_RU = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const MONTH_NAMES_RU_GEN = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
const DOW_SHORT_RU = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];

function getTestColumns() {
  if (Array.isArray(DB.testColumns) && DB.testColumns.length) return DB.testColumns;
  return DEFAULT_TEST_COLUMNS;
}

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

function currentSeasonKey(date) {
  const d = date ? new Date(date) : new Date();
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  if (m < SEASON_START_MONTH) return makeSeasonKey(y - 1);
  return makeSeasonKey(y);
}
function makeSeasonKey(startYear) {
  const y1 = Number(startYear);
  const y2 = String((y1 + 1) % 100).padStart(2, '0');
  return `${y1}/${y2}`;
}
function parseSeasonKey(key) {
  if (!key || typeof key !== 'string') return null;
  const m = key.match(/^(\d{4})\/(\d{2})$/);
  if (!m) return null;
  const startYear = parseInt(m[1], 10);
  return { startYear, endYear: startYear + 1, endYY: m[2] };
}
function formatSeasonLabel(key) { return key || '—'; }

function getSeasonKeys() {
  if (!DB.seasons || typeof DB.seasons !== 'object') return [];
  return Object.keys(DB.seasons).sort((a, b) => {
    const pa = parseSeasonKey(a), pb = parseSeasonKey(b);
    if (!pa || !pb) return 0;
    return pb.startYear - pa.startYear;
  });
}

function isArchiveSeason(key) {
  if (!key) return false;
  return key !== currentSeasonKey();
}

function persistCurrentSeason() {
  try { localStorage.setItem(STORAGE_SEASON_KEY, currentSeason || ''); } catch (e) {}
}

function ensureSeasonState(preferredKey) {
  if (!DB.seasons || !Object.keys(DB.seasons).length) {
    currentSeason = DEFAULT_SEASON;
    return;
  }
  const keys = Object.keys(DB.seasons);
  const stored = (() => { try { return localStorage.getItem(STORAGE_SEASON_KEY); } catch (e) { return null; } })();
  const calKey = currentSeasonKey();

  if (stored && DB.seasons[stored]) {
    currentSeason = stored;
    DB.players = DB.seasons[stored].players || [];
    persistCurrentSeason();
    return;
  }
  if (preferredKey && DB.seasons[preferredKey]) {
    currentSeason = preferredKey;
    DB.players = DB.seasons[preferredKey].players || [];
    persistCurrentSeason();
    return;
  }
  if (DB.seasons[calKey]) {
    currentSeason = calKey;
    DB.players = DB.seasons[calKey].players || [];
    persistCurrentSeason();
    return;
  }
  const last = keys.sort().slice(-1)[0];
  currentSeason = last;
  DB.players = DB.seasons[last].players || [];
  persistCurrentSeason();
}

function canEditSeason(key) {
  if (key === currentSeason) return true;
  return seasonsEditable === true;
}