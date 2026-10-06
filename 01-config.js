/* ============================================================
   01-config.js
   Настройки Supabase, глобальные переменные состояния, константы.
   Сезоны: константы и глобальные переменные для системы сезонов.
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

/* ===== Ключ локального хранилища ===== */
const STORAGE_KEY = 'akbars_hockey_v2';

/* ===== Главная база данных приложения =====
   DB.players  — динамический указатель на массив игроков ТЕКУЩЕГО сезона.
                 При switchSeason() он подменяется на DB.seasons[currentSeason].players.
   DB.seasons  — постоянное хранилище: { '2026/27': { players: [...], createdAt, archived }, ... }
   DB.exercises — общий справочник упражнений для всех сезонов.
   DB.testColumns, DB.meta — общие настройки.
*/
let DB = {
  players: [],       // указатель на текущий сезон (перезаписывается)
  seasons: {},       // { 'YYYY/YY': { players: [...], createdAt, archived } }
  exercises: [],     // справочник — общий
  meta: {},
  testColumns: null
};

/* ===== Сезоны: глобальные переменные ===== */

/* Текущий сезон в формате YYYY/YY, например '2026/27' */
let currentSeason = null;

/* Флаг: разрешено ли редактирование архивного сезона.
   По умолчанию false — архивные сезоны только для чтения. */
let seasonsEditable = false;

/* Границы сезона:
   - старт: 1 июля
   - конец: 31 мая (следующего календарного года)
   Эти значения используются для определения сезона по датам
   (например, при добавлении тренировок в календарь). */
const SEASON_START_MONTH = 7;  // июль
const SEASON_END_MONTH   = 5;  // май

/* Сезон по умолчанию, если данных ещё нет ни в localStorage, ни в облаке. */
const DEFAULT_SEASON = '2026/27';

/* ===== Состояние UI ===== */
let openAccordions = new Set();
let currentPlayerId = null;
let currentTab = 'skills';
let currentPlanMonth = null;
let reportMonth = null;

/* Календарь тренера */
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

/* ===== Хелперы для работы с тестовыми столбцами ===== */
function getTestColumns() {
  if (Array.isArray(DB.testColumns) && DB.testColumns.length) {
    return DB.testColumns;
  }
  return DEFAULT_TEST_COLUMNS;
}

/* ===== Хелперы для меток факта ===== */
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