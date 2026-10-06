/* ============================================================
   DATA LAYER  --  IndexedDB wrapper + export / import
   All async operations return Promises.

   Entry schema (all types share these base fields):
     id       : string  (crypto.randomUUID)
     date     : string  "YYYY-MM-DD"  (the calendar day this belongs to;
                         for sleep it is the wake date)
     type     : string  see ENTRY_TYPES below
     + type-specific fields

   Settings are stored in localStorage (small, synchronous).
   ============================================================ */

const DB_NAME    = 'training-tracker';
const DB_VERSION = 1;
const STORE      = 'entries';

const ENTRY_TYPES = {
  TRAINING:   'training',
  SLEEP:      'sleep',
  RECOVERY:   'recovery',
  TAKEAWAY:   'takeaway',
  DRINK:      'drink',
  DESSERT:    'dessert',
  BODYWEIGHT: 'bodyweight',
  STEPS:      'steps',
};

let _db = null;

/* ----------------------------------------------------------
   Open / initialise the database
   ---------------------------------------------------------- */
function openDB() {
  if (_db) return Promise.resolve(_db);

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('date',      'date',             { unique: false });
        store.createIndex('type',      'type',             { unique: false });
        store.createIndex('date_type', ['date', 'type'],   { unique: false });
      }
    };

    req.onsuccess = (e) => {
      _db = e.target.result;
      resolve(_db);
    };

    req.onerror = (e) => reject(e.target.error);
  });
}

/* ----------------------------------------------------------
   Helpers
   ---------------------------------------------------------- */
function txStore(mode) {
  return _db.transaction([STORE], mode).objectStore(STORE);
}

function promisify(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror   = (e) => reject(e.target.error);
  });
}

function newId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  /* Fallback for older Safari */
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

/* ----------------------------------------------------------
   CRUD
   ---------------------------------------------------------- */
async function addEntry(entry) {
  await openDB();
  if (!entry.id)   entry.id   = newId();
  if (!entry.date) entry.date = todayStr();
  return promisify(txStore('readwrite').add(entry));
}

async function putEntry(entry) {
  await openDB();
  if (!entry.id)   entry.id   = newId();
  if (!entry.date) entry.date = todayStr();
  return promisify(txStore('readwrite').put(entry));
}

async function deleteEntry(id) {
  await openDB();
  return promisify(txStore('readwrite').delete(id));
}

async function getEntry(id) {
  await openDB();
  return promisify(txStore('readonly').get(id));
}

/* ----------------------------------------------------------
   Queries
   ---------------------------------------------------------- */
async function getAllEntries() {
  await openDB();
  return promisify(txStore('readonly').getAll());
}

async function getEntriesByDate(date) {
  await openDB();
  return promisify(
    txStore('readonly').index('date').getAll(IDBKeyRange.only(date))
  );
}

async function getEntriesByDateRange(startDate, endDate) {
  await openDB();
  return promisify(
    txStore('readonly').index('date').getAll(
      IDBKeyRange.bound(startDate, endDate)
    )
  );
}

async function getEntriesByType(type) {
  await openDB();
  return promisify(
    txStore('readonly').index('type').getAll(IDBKeyRange.only(type))
  );
}

async function getEntriesByDateAndType(date, type) {
  await openDB();
  return promisify(
    txStore('readonly').index('date_type').getAll(
      IDBKeyRange.only([date, type])
    )
  );
}

/* ----------------------------------------------------------
   Migration: weekly steps -> daily steps
   Old format (one per week, dated the Monday):
     { id: 'steps-<monday>', type: 'steps', avgSteps, stepsLoad }
   New format (one per day):
     { id: 'steps-<date>',   type: 'steps', steps }
   Each old weekly average becomes that value on every day of the
   week, so the week's steps load is unchanged. For the current
   week only days up to yesterday are filled (today and later are
   left for you to log). Safe to run repeatedly.
   ---------------------------------------------------------- */
async function migrateWeeklySteps() {
  await openDB();
  const old = (await getEntriesByType(ENTRY_TYPES.STEPS))
    .filter(e => typeof e.avgSteps === 'number' && typeof e.steps !== 'number');
  if (!old.length) return 0;

  const today = todayStr();
  const tx    = _db.transaction([STORE], 'readwrite');
  const store = tx.objectStore(STORE);
  for (const e of old) {
    store.delete(e.id);
    for (const date of weekDays(weekStartStr(e.date))) {
      if (date >= today) continue;
      store.put({ id: `steps-${date}`, date, type: ENTRY_TYPES.STEPS,
        steps: e.avgSteps, migratedFrom: 'weekly' });
    }
  }
  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror    = (ev) => reject(ev.target.error);
  });
  return old.length;
}

/* ----------------------------------------------------------
   Export (download JSON file)
   ---------------------------------------------------------- */
async function exportData() {
  const entries  = await getAllEntries();
  const settings = localStorage.getItem('tt_config') || '{}';
  const payload  = {
    version:  1,
    exported: new Date().toISOString(),
    entries,
    settings: JSON.parse(settings),
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  const date = todayStr();
  a.href     = url;
  a.download = `training-tracker-backup-${date}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  /* Record backup timestamp */
  localStorage.setItem('tt_last_backup', new Date().toISOString());
}

/* ----------------------------------------------------------
   Import (restore from JSON)
   Caller must show a confirm prompt before calling this.
   ---------------------------------------------------------- */
async function importData(jsonString) {
  const payload = JSON.parse(jsonString);

  if (!payload.entries || !Array.isArray(payload.entries)) {
    throw new Error('Invalid backup file: missing entries array.');
  }

  await openDB();

  /* Clear existing entries */
  await promisify(_db.transaction([STORE], 'readwrite').objectStore(STORE).clear());

  /* Re-insert all entries */
  const tx    = _db.transaction([STORE], 'readwrite');
  const store = tx.objectStore(STORE);
  for (const entry of payload.entries) {
    store.put(entry);
  }

  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror    = (e) => reject(e.target.error);
  });

  /* Older backups may still hold weekly steps */
  await migrateWeeklySteps();

  /* Restore settings if present */
  if (payload.settings) {
    localStorage.setItem('tt_config', JSON.stringify(payload.settings));
  }

  localStorage.setItem('tt_last_backup', new Date().toISOString());
}

/* ----------------------------------------------------------
   Date utilities (shared across all modules)
   ---------------------------------------------------------- */
function todayStr() {
  const d = new Date();
  return dateToStr(d);
}

function dateToStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function strToDate(s) {
  /* Parse YYYY-MM-DD without timezone shift */
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/* Monday of the week containing date d */
function weekStart(d) {
  const date = new Date(d);
  const day  = date.getDay(); /* 0=Sun */
  const diff = (day === 0 ? -6 : 1 - day);
  date.setDate(date.getDate() + diff);
  return date;
}

function weekStartStr(dateStr) {
  return dateToStr(weekStart(strToDate(dateStr)));
}

/* Array of "YYYY-MM-DD" strings for the 7 days of a week given its Monday */
function weekDays(mondayStr) {
  const start = strToDate(mondayStr);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return dateToStr(d);
  });
}

/* Difference in whole days between two date strings */
function daysDiff(aStr, bStr) {
  return Math.round(
    (strToDate(bStr) - strToDate(aStr)) / 86_400_000
  );
}

/* Days since last backup (null if never) */
function daysSinceBackup() {
  const ts = localStorage.getItem('tt_last_backup');
  if (!ts) return null;
  return Math.floor((Date.now() - new Date(ts).getTime()) / 86_400_000);
}

/* Format minutes as "1h 25m" or "45m" */
function fmtMinutes(min) {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/* Format a time string "HH:MM" for display */
function fmtTime(hhmm) {
  if (!hhmm) return '--';
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h < 12 ? 'am' : 'pm';
  const h12    = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')}${suffix}`;
}

/* Hours between two "HH:MM" strings, handling midnight crossover */
function hoursBetween(start, end) {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let startMins  = sh * 60 + sm;
  let endMins    = eh * 60 + em;
  if (endMins <= startMins) endMins += 24 * 60; /* crossed midnight */
  return (endMins - startMins) / 60;
}

/* Short day names */
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_FULL  = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function fmtDate(dateStr) {
  const d = strToDate(dateStr);
  return `${DAY_SHORT[d.getDay()]} ${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`;
}
