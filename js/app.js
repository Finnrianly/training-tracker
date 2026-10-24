/* ============================================================
   APP SHELL  --  tab routing, toast, modal helpers
   ============================================================ */

/* ----------------------------------------------------------
   Tab bar routing
   ---------------------------------------------------------- */
const tabs    = document.querySelectorAll('.tab');
const screens = document.querySelectorAll('.screen');

function showScreen(name) {
  screens.forEach(s => {
    s.classList.toggle('hidden', s.dataset.screen !== name);
  });
  tabs.forEach(t => {
    const active = t.dataset.screen === name;
    t.classList.toggle('active', active);
    t.setAttribute('aria-selected', active);
  });
  document.querySelectorAll('[data-open-settings]').forEach(b =>
    b.classList.toggle('active', name === 'settings'));
  /* Run screen-specific render if registered */
  if (typeof SCREEN_RENDERERS === 'object' && SCREEN_RENDERERS[name]) {
    SCREEN_RENDERERS[name]();
  }
}

tabs.forEach(tab => {
  tab.addEventListener('click', () => showScreen(tab.dataset.screen));
});

/* Settings lives behind the gear in every screen header */
document.querySelectorAll('[data-open-settings]').forEach(b =>
  b.addEventListener('click', () => showScreen('settings')));

/* ----------------------------------------------------------
   Screen renderer registry (populated by each screen module)
   ---------------------------------------------------------- */
const SCREEN_RENDERERS = {};

/* ----------------------------------------------------------
   Toast notifications
   ---------------------------------------------------------- */
const toastContainer = document.getElementById('toast-container');

function showToast(message, type = '') {
  const el = document.createElement('div');
  el.className = `toast${type ? ' toast-' + type : ''}`;
  el.textContent = message;
  toastContainer.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

/* ----------------------------------------------------------
   Bottom-sheet modal
   ---------------------------------------------------------- */
let _activeModal = null;

function openModal({ title = '', content = '', onClose } = {}) {
  if (_activeModal) closeModal();

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const sheet = document.createElement('div');
  sheet.className = 'modal-sheet';

  sheet.innerHTML = `
    <div class="modal-handle"></div>
    <div class="modal-title">${title}</div>
    <div class="modal-content"></div>
  `;

  const body = sheet.querySelector('.modal-content');
  if (typeof content === 'string') {
    body.innerHTML = content;
  } else {
    body.appendChild(content);
  }

  overlay.appendChild(sheet);
  document.body.appendChild(overlay);
  _activeModal = { overlay, onClose };

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });

  return { overlay, sheet, body };
}

function closeModal() {
  if (!_activeModal) return;
  const { overlay, onClose } = _activeModal;
  overlay.remove();
  _activeModal = null;
  if (typeof onClose === 'function') onClose();
}

/* ----------------------------------------------------------
   Confirm dialog (uses the modal sheet)
   ---------------------------------------------------------- */
function confirmAction(message, onConfirm) {
  const frag = document.createElement('div');
  frag.innerHTML = `
    <p style="font-size:14px;color:var(--text-secondary);margin-bottom:16px;">${message}</p>
    <div class="btn-group">
      <button class="btn btn-secondary btn-full" id="modal-cancel">Cancel</button>
      <button class="btn btn-danger btn-full" id="modal-confirm">Confirm</button>
    </div>
  `;
  const { overlay } = openModal({ title: 'Are you sure?', content: frag });
  frag.querySelector('#modal-cancel').addEventListener('click', closeModal);
  frag.querySelector('#modal-confirm').addEventListener('click', () => {
    closeModal();
    onConfirm();
  });
}

/* Export / Import helpers -- called by settings.js and week.js */
async function doExport() {
  await exportData();
  showToast('Backup downloaded.', 'success');
}

async function doImport(jsonText) {
  await importData(jsonText);
  CONFIG = loadConfig();
  await lockWeekPhases();
  showToast('Data restored successfully.', 'success');
  const active = document.querySelector('.tab.active');
  if (active) showScreen(active.dataset.screen);
  offerMatchDefaultsUpdate();
}

/* ----------------------------------------------------------
   One-time: move past match entries onto the new defaults.
   Downloads a backup first, shows what will change, and saves
   only when you tap Confirm. "Not now" asks again next launch.
   ---------------------------------------------------------- */
async function offerMatchDefaultsUpdate() {
  if (localStorage.getItem('tt_match_entries_v2')) return;
  const { all, updates } = await findMatchDefaultUpdates();
  if (!updates.length) { localStorage.setItem('tt_match_entries_v2', '1'); return; }

  let backupOk = true;
  try { await exportData(); } catch { backupOk = false; }

  /* Total load before vs after for each week that changes, newest first */
  const byId  = new Map(updates.map(u => [u.id, u]));
  const after = all.map(e => byId.get(e.id) || e);
  const weekLoad = (list, mon) => weekTotalLoad(list.filter(e => e.date >= mon && e.date <= weekSundayStr(mon)));
  const mondays  = [...new Set(updates.map(u => weekStartStr(u.date)))].sort().reverse();
  const rows = mondays.map(mon => {
    const d = strToDate(mon);
    return `<tr><td>${d.getDate()} ${MONTH_SHORT[d.getMonth()]} ${d.getFullYear()}</td>
      <td class="mono">${fmt1(weekLoad(all, mon))}</td><td class="mono">${fmt1(weekLoad(after, mon))}</td></tr>`;
  }).join('');

  const fb = CONFIG.activities.footballMatch;
  const c = document.createElement('div');
  c.innerHTML = `
    <p style="font-size:14px;margin-bottom:10px;">
      Match defaults are now Full game ${fb.minutes.fullGame} min (RPE ${fb.rpe.fullGame}, includes warm-up)
      and Came on ${fb.minutes.cameOn} min (RPE ${fb.rpe.cameOn}).
      <b>${updates.length}</b> past match entr${updates.length > 1 ? 'ies' : 'y'} still on the old defaults
      will be updated. Entries you changed by hand keep your values.</p>
    <p style="font-size:13px;margin-bottom:10px;color:${backupOk ? 'var(--green)' : 'var(--red)'};">
      ${backupOk ? `✓ Backup downloaded first (training-tracker-backup-${todayStr()}.json).`
                 : '⚠ The backup could not be downloaded. Tap Download backup before confirming.'}</p>
    <table class="mig-table">
      <thead><tr><th>Week of</th><th>Load before</th><th>After</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <button class="btn btn-ghost btn-sm" id="mig-backup" style="padding-left:0;margin:8px 0;">Download backup again</button>
    <div class="btn-group">
      <button class="btn btn-secondary btn-full" id="mig-later">Not now</button>
      <button class="btn btn-primary btn-full" id="mig-confirm">Confirm</button>
    </div>`;
  openModal({ title: 'Update past matches', content: c });

  c.querySelector('#mig-backup').addEventListener('click', () =>
    doExport().catch(() => showToast('Export failed.', 'error')));
  c.querySelector('#mig-later').addEventListener('click', closeModal);
  c.querySelector('#mig-confirm').addEventListener('click', async () => {
    await saveEntries(updates);
    localStorage.setItem('tt_match_entries_v2', '1');
    closeModal();
    showToast(`${updates.length} match entr${updates.length > 1 ? 'ies' : 'y'} updated.`, 'success');
    const active = document.querySelector('.tab.active');
    if (active) showScreen(active.dataset.screen);
  });
}

/* ----------------------------------------------------------
   Init: open DB, then show Today tab
   ---------------------------------------------------------- */
openDB()
  .then(() => migrateWeeklySteps())
  .then(async n => {
    if (n) console.log(`Migrated ${n} weekly steps entr${n > 1 ? 'ies' : 'y'} to daily.`);
    /* Save each finished week's phase so it keeps the score it earned */
    const locked = await lockWeekPhases().catch(err => { console.warn('Phase lock skipped:', err); return 0; });
    if (locked) console.log(`Saved the phase for ${locked} finished week${locked > 1 ? 's' : ''}.`);
    showScreen('today');
    return offerMatchDefaultsUpdate()
      .catch(err => console.warn('Match defaults update skipped:', err));
  })
  .catch((err) => {
    document.getElementById('today-body').innerHTML =
      `<div class="card"><p class="text-secondary">Could not open database: ${err.message}</p></div>`;
  });

/* ----------------------------------------------------------
   Service worker registration (HTTPS / localhost only)
   ---------------------------------------------------------- */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .catch(err => console.warn('[SW] Registration failed:', err));
  });
}
