/* ============================================================
   02-utils.js
   Утилиты: экранирование, toast, модалки, даты, возраст, время.
   + хелперы сезонов.
   Загружается после 01-config.js.
   ============================================================ */

/* ===== Экранирование ===== */
function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}

function escapeAttr(s) {
  if (s == null) return '';
  return String(s).replace(/"/g, '&quot;');
}

/* ===== Уникальный id ===== */
function uid(prefix = 'id') {
  return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

/* ===== Склонение существительных ===== */
function plural(n, one, few, many) {
  const mod10 = n % 10, mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

/* ===== Уведомление-«тост» ===== */
function toast(msg) {
  const el = document.createElement('div');
  el.textContent = msg;
  el.style.cssText = `
    position:fixed;bottom:24px;left:50%;transform:translateX(-50%);
    background:var(--ak-green);color:#fff;padding:14px 28px;border-radius:4px;
    font-size:13px;font-weight:900;box-shadow:var(--shadow-lg);z-index:2000;
    font-family:var(--font-display);letter-spacing:.5px;text-transform:uppercase;
    border-left:5px solid var(--ak-red);max-width:90vw;text-align:center;`;
  document.body.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity .3s';
    setTimeout(() => el.remove(), 300);
  }, 2500);
}

/* ===== Модальные окна ===== */
function openModal(html) {
  document.getElementById('modal-content').innerHTML = html;
  document.getElementById('modal-bg').classList.add('active');
  document.body.classList.add('modal-open');
}

function closeModal() {
  document.getElementById('modal-bg').classList.remove('active');
  document.body.classList.remove('modal-open');
}

/* Закрытие кликом по затемнённому фону */
document.addEventListener('DOMContentLoaded', () => {
  const bg = document.getElementById('modal-bg');
  if (bg) {
    bg.addEventListener('click', e => {
      if (e.target.id === 'modal-bg') closeModal();
    });
  }
});

/* ===== Даты ===== */
function localDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDate(d) {
  const [y, m, day] = d.split('-');
  const months = ['янв','фев','мар','апр','мая','июн','июл','авг','сен','окт','ноя','дек'];
  return `${parseInt(day)} ${months[parseInt(m) - 1]}`;
}

function formatDateFull(dateStr) {
  const [y, m, d] = dateStr.split('-');
  const dow = ['вс','пн','вт','ср','чт','пт','сб'];
  const dt = new Date(dateStr + 'T00:00:00');
  return `${d} ${MONTH_NAMES_RU_GEN[parseInt(m) - 1]} ${y} (${dow[dt.getDay()]})`;
}

function normalizeDate(v) {
  if (v == null) return '';
  if (typeof v === 'number') {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return s;
}

/* ===== Время ===== */
function timeToMinutes(t) {
  if (!t) return 0;
  const [h, m] = String(t).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function minutesToTime(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

function formatTimeRange(t1, t2) {
  return `${t1}–${t2}`;
}

/* ===== Возраст из даты рождения ===== */
function computeAge(p) {
  if (!p) return '';
  const day = parseInt(p.birthDay);
  const year = parseInt(p.birthYear);
  const monthStr = (p.birthMonth || '').toLowerCase().trim();
  if (!year || isNaN(year)) return '';
  if (!monthStr) return '';

  const months = {
    'январь':0,'января':0,'янв':0,
    'февраль':1,'февраля':1,'фев':1,
    'март':2,'марта':2,'мар':2,
    'апрель':3,'апреля':3,'апр':3,
    'май':4,'мая':4,
    'июнь':5,'июня':5,'июн':5,
    'июль':6,'июля':6,'июл':6,
    'август':7,'августа':7,'авг':7,
    'сентябрь':8,'сентября':8,'сен':8,'сент':8,
    'октябрь':9,'октября':9,'окт':9,
    'ноябрь':10,'ноября':10,'ноя':10,
    'декабрь':11,'декабря':11,'дек':11
  };
  let month = months[monthStr];
  if (month === undefined) {
    const numMatch = monthStr.match(/^\d{1,2}$/);
    if (numMatch) month = parseInt(numMatch[1]) - 1;
    else return '';
  }

  const birthDay = isNaN(day) ? 1 : day;
  const birth = new Date(year, month, birthDay);
  const today = new Date();

  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  if (age < 0 || age > 100) return '';

  const lastDigit = age % 10;
  const lastTwo = age % 100;
  let suffix = 'лет';
  if (lastTwo < 11 || lastTwo > 14) {
    if (lastDigit === 1) suffix = 'год';
    else if (lastDigit >= 2 && lastDigit <= 4) suffix = 'года';
  }
  return `${age} ${suffix}`;
}

/* ===== Работа с числами ===== */
function toNumber(v) {
  if (v == null || v === '') return null;
  const s = String(v).replace(',', '.').replace(/\s+/g, '').replace(/[^\d.\-]/g, '');
  if (!s) return null;
  const n = Number(s);
  return isNaN(n) ? null : n;
}

function cleanMultiLine(s) {
  if (!s) return '';
  return String(s).replace(/\s+/g, ' ').trim();
}

/* ===== Нормализация названий разделов ===== */
function normalizeGroup(g) {
  if (!g) return '';
  const s = g.toLowerCase();
  if (/^физ/.test(s))  return 'Физические качества';
  if (/^такт/.test(s)) return 'Тактические навыки';
  if (/^псих/.test(s)) return 'Психологические характеристики';
  if (/^тех/.test(s))  return 'Техническая оснащённость';
  return g;
}

/* ===== Обновление отображения возраста в карточке ===== */
function updateAgeDisplay(pid) {
  const p = DB.players.find(x => x.id === pid);
  if (!p) return;
  const el = document.getElementById('age-field-' + pid);
  if (el) el.textContent = computeAge(p) || '—';
}

/* ===== Форматирование «Пн 29.09» ===== */
function formatDowDate(d) {
  const dow = (d.getDay() + 6) % 7;
  const day = String(d.getDate()).padStart(2, '0');
  const mon = String(d.getMonth() + 1).padStart(2, '0');
  return `${DOW_SHORT_RU[dow]} ${day}.${mon}`;
}

/* ============================================================
   СЕЗОНЫ: хелперы
   ============================================================ */

/**
 * Определяет сезон по дате.
 * Сезон: с 1 июля по 31 мая следующего года.
 * Примеры:
 *   '2026-08-15' → '2026/27'
 *   '2027-03-10' → '2026/27'
 *   '2027-06-20' → '2027/28'   (июнь — это межсезонье, уже следующий сезон)
 *   '2027-07-01' → '2027/28'
 */
function seasonOfDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const m = dateStr.match(/^(\d{4})-(\d{2})/);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  // Июнь (6) — межсезонье, относим к следующему сезону.
  // Июль (7) — старт нового сезона.
  // Январь–май (1–5) — конец текущего сезона (начавшегося в прошлом году).
  let startYear;
  if (month >= 7) {
    // июль–декабрь — текущий сезон начался в этом году
    startYear = year;
  } else if (month === 6) {
    // июнь — межсезонье, уже следующий сезон
    startYear = year;
  } else {
    // январь–май — сезон начался в прошлом году
    startYear = year - 1;
  }
  return makeSeasonKey(startYear);
}

/** Формирует ключ сезона: '2026/27' из 2026 */
function makeSeasonKey(startYear) {
  const y1 = startYear;
  const y2 = (startYear + 1) % 100;
  return `${y1}/${String(y2).padStart(2, '0')}`;
}

/** Разбирает '2026/27' → { startYear: 2026, endYear: 2027 } */
function parseSeasonKey(key) {
  if (!key || typeof key !== 'string') return null;
  const m = key.match(/^(\d{4})\/(\d{2})$/);
  if (!m) return null;
  const startYear = parseInt(m[1], 10);
  const endShort = parseInt(m[2], 10);
  // endShort — это последние 2 цифры конечного года
  const endYear = Math.floor(startYear / 100) * 100 + endShort;
  return { startYear, endYear };
}

/** Текущий сезон по календарю (например, сегодня 2026-10-06 → '2026/27') */
function currentSeasonKey() {
  return seasonOfDate(localDateStr(new Date()));
}

/** Красивая метка сезона для отображения */
function formatSeasonLabel(key) {
  if (!key) return '';
  return key;  // '2026/27' — уже красиво
}

/** Возвращает true, если сезон архивный (не текущий по календарю) */
function isArchiveSeason(key) {
  return key !== currentSeasonKey();
}

/** Проверяет и при необходимости чинит структуру DB.seasons */
function ensureSeasonState() {
  if (!DB.seasons || typeof DB.seasons !== 'object') {
    DB.seasons = {};
  }
  if (!currentSeason || !DB.seasons[currentSeason]) {
    // Если текущий сезон невалиден — берём по календарю, либо DEFAULT_SEASON
    const def = DB.seasons[currentSeasonKey()] ? currentSeasonKey() : DEFAULT_SEASON;
    currentSeason = DB.seasons[def] ? def : (Object.keys(DB.seasons)[0] || DEFAULT_SEASON);
  }
  // Синхронизируем DB.players с текущим сезоном
  if (DB.seasons[currentSeason]) {
    DB.players = DB.seasons[currentSeason].players || [];
  } else {
    DB.players = [];
  }
}

/** Возвращает отсортированный список ключей сезонов */
function getSeasonKeys() {
  if (!DB.seasons) return [];
  return Object.keys(DB.seasons).sort((a, b) => {
    // Сортируем по году начала (по убыванию, новые сверху)
    const pa = parseSeasonKey(a), pb = parseSeasonKey(b);
    if (!pa || !pb) return 0;
    return pb.startYear - pa.startYear;
  });
}

/** Возвращает true, если сезон редактируемый (текущий или явно разрешён) */
function canEditSeason(key) {
  if (key === currentSeason) return true;
  return seasonsEditable === true;
}