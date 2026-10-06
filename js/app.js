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
  /* Run screen-specific render if registered */
  if (typeof SCREEN_RENDERERS === 'object' && SCREEN_RENDERERS[name]) {
    SCREEN_RENDERERS[name]();
  }
}

tabs.forEach(tab => {
  tab.addEventListener('click', () => showScreen(tab.dataset.screen));
});

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
  showToast('Data restored successfully.', 'success');
  const active = document.querySelector('.tab.active');
  if (active) showScreen(active.dataset.screen);
}

/* ----------------------------------------------------------
   Init: open DB, then show Today tab
   ---------------------------------------------------------- */
openDB()
  .then(() => migrateWeeklySteps())
  .then(n => {
    if (n) console.log(`Migrated ${n} weekly steps entr${n > 1 ? 'ies' : 'y'} to daily.`);
    showScreen('today');
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
