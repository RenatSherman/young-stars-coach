/* ============================================================
   10-init.js
   Точка входа + миграция справочника (безопасная).
   Приоритет: локальные данные не перезаписываются облаком.
   ============================================================ */

function isExercisesMigrated(arr) {
  if (!Array.isArray(arr) || !arr.length) return true;
  const first = arr[0];
  return first && typeof first.name === 'string' && Array.isArray(first.subgroups);
}
function isExercisesOldFormat(arr) {
  if (!Array.isArray(arr) || !arr.length) return false;
  const first = arr[0];
  return first && typeof first.group === 'string' && Array.isArray(first.items);
}

function migrateExercisesArray(old) {
  if (!Array.isArray(old) || !old.length) return [];
  if (isExercisesMigrated(old)) return old;
  const buckets = new Map();
  old.forEach(g => {
    if (!g || typeof g.group !== 'string') return;
    const stripped = String(g.group).replace(/\s*(?:№|#)?\s*\d+(?:[.\-]\d+)*\s*$/u, '').trim();
    const prefix = stripped || g.group;
    if (!buckets.has(prefix)) buckets.set(prefix, []);
    buckets.get(prefix).push(g);
  });
  const newExercises = [];
  buckets.forEach((groups, prefix) => {
    groups.sort((a, b) => String(a.group || '').localeCompare(String(b.group || ''), 'ru'));
    const parentId = 'g_' + slugify(prefix) + '_' + Math.random().toString(36).slice(2, 6);
    const subgroups = groups.map(g => ({
      id: g.id || ('sg_' + slugify(g.group) + '_' + Math.random().toString(36).slice(2, 6)),
      name: g.group,
      items: Array.isArray(g.items) ? g.items.slice() : [],
      links: g.links && typeof g.links === 'object' ? { ...g.links } : {}
    }));
    newExercises.push({ id: parentId, name: prefix, subgroups });
  });
  newExercises.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ru'));
  return newExercises;
}

/* Безопасная миграция: не трогаем новый формат, не затираем данные */
function migrateAllExercises() {
  if (isExercisesOldFormat(DB.exercises)) {
    DB.exercises = migrateExercisesArray(DB.exercises);
    console.log('[migration] DB.exercises переведён в новый формат');
  }
  if (DB.seasons && typeof DB.seasons === 'object') {
    Object.keys(DB.seasons).forEach(sName => {
      const s = DB.seasons[sName];
      if (s && isExercisesOldFormat(s.exercises)) {
        s.exercises = migrateExercisesArray(s.exercises);
        console.log('[migration] Сезон', sName, '— справочник мигрирован');
      }
    });
  }
}

function slugify(s) {
  if (!s) return 'x';
  const map = {
    'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'e','ж':'zh','з':'z',
    'и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r',
    'с':'s','т':'t','у':'u','ф':'f','х':'h','ц':'c','ч':'ch','ш':'sh','щ':'sch',
    'ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya',
    'А':'A','Б':'B','В':'V','Г':'G','Д':'D','Е':'E','Ё':'E','Ж':'Zh','З':'Z',
    'И':'I','Й':'Y','К':'K','Л':'L','М':'M','Н':'N','О':'O','П':'P','Р':'R',
    'С':'S','Т':'T','У':'U','Ф':'F','Х':'H','Ц':'C','Ч':'Ch','Ш':'Sh','Щ':'Sch',
    'Ъ':'','Ы':'Y','Ь':'','Э':'E','Ю':'Yu','Я':'Ya'
  };
  return String(s).split('').map(ch => map[ch] !== undefined ? map[ch] : ch).join('')
    .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24) || 'x';
}

function flattenSubgroups() {
  if (!Array.isArray(DB.exercises)) return [];
  const out = [];
  DB.exercises.forEach(parent => {
    if (!parent || !Array.isArray(parent.subgroups)) return;
    parent.subgroups.forEach(sg => {
      out.push({
        parentId: parent.id,
        parentName: parent.name || '',
        subgroupId: sg.id,
        subgroupName: sg.name || '',
        fullName: parent.name + ' · ' + (sg.name || ''),
        items: Array.isArray(sg.items) ? sg.items : []
      });
    });
  });
  return out;
}
function findSubgroupById(sgId) {
  if (!Array.isArray(DB.exercises)) return null;
  for (const parent of DB.exercises) {
    if (!parent || !Array.isArray(parent.subgroups)) continue;
    const sg = parent.subgroups.find(s => s.id === sgId);
    if (sg) return { parent, subgroup: sg };
  }
  return null;
}
function getAllSubgroupNames() {
  return flattenSubgroups().map(x => x.subgroupName);
}

/* ЗАПУСК */
loadDB();
migrateAllExercises();
initAuth();