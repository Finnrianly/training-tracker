/* ============================================================
   TODAY SCREEN
   ============================================================ */

let _selectedDate = todayStr();

SCREEN_RENDERERS['today'] = renderToday;

/* ----------------------------------------------------------
   Main render
   ---------------------------------------------------------- */
/* keepTyped: carry unsaved typed values (steps, weight) across the re-render,
   so tapping a button elsewhere on the screen never wipes them */
async function renderToday({ keepTyped = true } = {}) {
  const body = document.getElementById('today-body');
  const scrollTop = body.scrollTop;

  try {
    const today       = strToDate(_selectedDate);
    const thisMonday  = weekStart(today);
    const lastMonday  = new Date(thisMonday);
    lastMonday.setDate(lastMonday.getDate() - 7);

    const allEntries = await getEntriesByDateRange(dateToStr(lastMonday), _selectedDate);

    const lastWeekSameDay = new Date(today);
    lastWeekSameDay.setDate(lastWeekSameDay.getDate() - 7);

    const thisWeekEntries = allEntries.filter(e =>
      e.date >= dateToStr(thisMonday) && e.date <= _selectedDate
    );
    const lastWeekEntries = allEntries.filter(e =>
      e.date >= dateToStr(lastMonday) && e.date <= dateToStr(lastWeekSameDay)
    );
    const todayEntries = allEntries.filter(e => e.date === _selectedDate);

    const recovery = todayEntries.find(e => e.type === 'recovery') || null;
    const takeaways = todayEntries.filter(e => e.type === 'takeaway');
    const desserts  = todayEntries.filter(e => e.type === 'dessert');
    const drink     = todayEntries.find(e => e.type === 'drink') || null;
    const weights   = todayEntries.filter(e => e.type === 'bodyweight');
    const steps     = todayEntries.find(e => e.type === 'steps' && typeof e.steps === 'number') || null;

    const frag = document.createDocumentFragment();
    frag.appendChild(buildDateBar());
    frag.appendChild(buildPaceCard(thisWeekEntries, lastWeekEntries));
    frag.appendChild(buildGymSection());
    frag.appendChild(buildActivitiesSection());
    frag.appendChild(buildRecoverySection(recovery));
    frag.appendChild(buildDietSection(takeaways, desserts, drink));
    frag.appendChild(buildStepsSection(steps));
    frag.appendChild(buildBodyweightSection(weights));
    frag.appendChild(buildLoggedSection(todayEntries));

    const typed = keepTyped ? unsavedInputs(body) : {};
    body.innerHTML = '';
    body.appendChild(frag);
    body.scrollTop = scrollTop;
    attachTodayHandlers();
    restoreInputs(body, typed);

  } catch (err) {
    body.innerHTML = `<div class="card"><p class="text-secondary">Error: ${err.message}</p></div>`;
  }
}

/* Inputs whose value differs from what was rendered, by id */
function unsavedInputs(root) {
  const out = {};
  root.querySelectorAll('input[id]:not([type=date])').forEach(i => {
    if (i.value !== i.defaultValue) out[i.id] = i.value;
  });
  return out;
}

function restoreInputs(root, values) {
  Object.entries(values).forEach(([id, v]) => {
    const i = root.querySelector('#' + id);
    if (!i) return;
    i.value = v;
    i.dispatchEvent(new Event('input'));
  });
}

/* ----------------------------------------------------------
   Event delegation
   ---------------------------------------------------------- */
function attachTodayHandlers() {
  const body = document.getElementById('today-body');

  body.querySelector('#date-prev')?.addEventListener('click', () => changeDate(-1));
  body.querySelector('#date-next')?.addEventListener('click', () => changeDate(1));
  body.querySelector('#date-label')?.addEventListener('click', () => {
    const p = body.querySelector('#date-picker');
    p.showPicker ? p.showPicker() : p.click();
  });
  body.querySelector('#date-picker')?.addEventListener('change', e => {
    if (e.target.value) { _selectedDate = e.target.value; renderToday({ keepTyped: false }); }
  });

  body.querySelectorAll('[data-gym]').forEach(t =>
    t.addEventListener('click', () => openGymModal(t.dataset.gym)));

  body.querySelectorAll('[data-activity]').forEach(t =>
    t.addEventListener('click', () => openActivityModal(t.dataset.activity)));

  body.querySelectorAll('[data-rec-field]').forEach(btn =>
    btn.addEventListener('click', () =>
      handleRecoveryUpdate(btn.dataset.recField, parseInt(btn.dataset.delta))));

  body.querySelectorAll('[data-takeaway-preset]').forEach(btn =>
    btn.addEventListener('click', async () => {
      await addEntry({ date: _selectedDate, type: 'takeaway',
        name: btn.dataset.name, tier: btn.dataset.tier,
        points: CONFIG.takeaway.tiers[btn.dataset.tier].points });
      showToast(`${btn.dataset.name} logged.`);
      renderToday();
    }));

  body.querySelector('#btn-takeaway-other')?.addEventListener('click', openTakeawayOtherModal);

  body.querySelector('#dessert-plus')?.addEventListener('click', async () => {
    await addEntry({ date: _selectedDate, type: 'dessert', points: 1 });
    renderToday();
  });
  body.querySelector('#dessert-minus')?.addEventListener('click', async () => {
    const list = await getEntriesByDateAndType(_selectedDate, 'dessert');
    if (list.length) { await deleteEntry(list[list.length - 1].id); renderToday(); }
  });

  body.querySelectorAll('[data-drink-level]').forEach(btn =>
    btn.addEventListener('click', async () => {
      await setDrinkEntry(_selectedDate, btn.dataset.drinkLevel);
      renderToday();
    }));
  body.querySelector('#clear-drink')?.addEventListener('click', async () => {
    await clearDrinkEntry(_selectedDate); renderToday();
  });

  body.querySelector('#steps-save')?.addEventListener('click', saveSteps);
  body.querySelector('#steps-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') saveSteps();
  });
  body.querySelector('#steps-input')?.addEventListener('input', e => {
    const n = parseSteps(e.target.value);
    const sub = body.querySelector('#steps-sub');
    if (sub && n !== null) sub.textContent = `${fmtLoad(round1(computeDailyStepsLoad(n)))} load`;
  });

  body.querySelector('#weight-save')?.addEventListener('click', saveWeight);
  body.querySelector('#weight-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') saveWeight();
  });

  body.querySelectorAll('[data-delete-id]').forEach(btn =>
    btn.addEventListener('click', async () => {
      await deleteEntry(btn.dataset.deleteId); renderToday();
    }));

  body.querySelectorAll('[data-edit-id]').forEach(btn =>
    btn.addEventListener('click', async () => {
      const entry = await getEntry(btn.dataset.editId);
      if (!entry) return;
      if (entry.type === 'training') {
        entry.subtype === 'gym'
          ? openGymModal(entry.gymType, entry)
          : openActivityModal(entry.subtype, entry);
      } else if (entry.type === 'bodyweight') {
        openBodyweightEditModal(entry);
      }
    }));
}

async function saveWeight() {
  const inp = document.getElementById('weight-input');
  const val = parseFloat(inp?.value);
  if (!val || val < 20 || val > 300) return showToast('Enter a valid weight.', 'error');
  await addEntry({ date: _selectedDate, type: 'bodyweight', kg: val });
  inp.value = inp.defaultValue;
  showToast('Weight saved.');
  renderToday();
}

/* Accepts "10240", "10,240" or "10 240" */
function parseSteps(text) {
  const digits = String(text).replace(/[^0-9]/g, '');
  return digits ? parseInt(digits, 10) : null;
}

/* One steps entry per day: saving replaces that day's value */
async function saveSteps() {
  const inp = document.getElementById('steps-input');
  const n = parseSteps(inp?.value);
  if (n === null || n > 150000) return showToast('Enter a valid step count.', 'error');
  await putEntry({ id: `steps-${_selectedDate}`, date: _selectedDate, type: 'steps', steps: n });
  inp.value = inp.defaultValue;
  showToast(`${n.toLocaleString('en-IE')} steps saved. ${fmtLoad(round1(computeDailyStepsLoad(n)))} load.`);
  renderToday();
}

/* ----------------------------------------------------------
   Date bar
   ---------------------------------------------------------- */
function buildDateBar() {
  const d = strToDate(_selectedDate);
  const isToday = _selectedDate === todayStr();
  const label = isToday ? 'Today' : DAY_FULL[d.getDay()];
  const sub   = `${d.getDate()} ${MONTH_SHORT[d.getMonth()]} ${d.getFullYear()}`;
  const atToday = _selectedDate >= todayStr();

  const div = document.createElement('div');
  div.innerHTML = `
    <div class="card" style="display:flex;align-items:center;gap:4px;padding:10px 12px;">
      <button class="icon-btn" id="date-prev">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <button id="date-label" style="flex:1;background:none;border:none;cursor:pointer;text-align:center;padding:4px 0;">
        <div style="font-size:16px;font-weight:700;color:var(--text);">${label}</div>
        <div style="font-size:12px;color:var(--text-secondary);">${sub}</div>
      </button>
      <button class="icon-btn" id="date-next" ${atToday ? 'disabled style="opacity:0.3;"' : ''}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>
      </button>
      <input type="date" id="date-picker" max="${todayStr()}" value="${_selectedDate}"
        style="position:absolute;opacity:0;pointer-events:none;width:0;height:0;">
    </div>`;
  return div.firstElementChild;
}

function changeDate(delta) {
  const d = strToDate(_selectedDate);
  d.setDate(d.getDate() + delta);
  const s = dateToStr(d);
  if (s <= todayStr()) { _selectedDate = s; renderToday({ keepTyped: false }); }
}

/* ----------------------------------------------------------
   Pace card
   ---------------------------------------------------------- */
function buildPaceCard(thisW, lastW) {
  const thisLoad = calcTotalLoad(thisW);
  const lastLoad = calcTotalLoad(lastW);
  const thisDmg  = calcTakeawayDamage(thisW);
  const lastDmg  = calcTakeawayDamage(lastW);

  const div = document.createElement('div');
  div.className = 'card';
  div.innerHTML = `
    <div class="card-title">This week vs last week (same point)</div>
    <div class="pace-card">
      ${paceStat('Total load', thisLoad, lastLoad, true)}
      ${paceStat('Takeaway damage', thisDmg, lastDmg, false)}
    </div>`;
  return div;
}

function paceStat(label, cur, prev, higherGood) {
  let changeHtml = '<div style="font-size:11px;color:var(--text-secondary);">No last-week data</div>';
  if (prev > 0) {
    const pct  = Math.round(((cur - prev) / prev) * 100);
    const up   = cur >= prev;
    const good = higherGood ? up : !up;
    const col  = good ? 'var(--green)' : 'var(--orange)';
    changeHtml = `<div style="font-size:11px;font-weight:700;color:${col};">${up ? '↑' : '↓'} ${Math.abs(pct)}%</div>`;
  }
  const display = cur % 1 === 0 ? cur : cur.toFixed(1);
  return `
    <div class="pace-stat">
      <div class="pace-stat-value">${display}</div>
      <div class="pace-stat-label">${label}</div>
      ${changeHtml}
    </div>`;
}

/* ----------------------------------------------------------
   Gym
   ---------------------------------------------------------- */
function buildGymSection() {
  const tiles = ['fullBody', 'accessory', 'abs'].map(k => {
    const g = CONFIG.gym[k];
    return `<div class="tile" data-gym="${k}" role="button" tabindex="0">
      <div class="tile-label">${g.label}</div>
      <div class="tile-sub">${g.minutes} min · RPE ${g.rpe} · <span class="mono">${calcLoad(g.minutes, g.rpe)}</span></div>
    </div>`;
  }).join('');

  const div = document.createElement('div');
  div.className = 'card';
  div.innerHTML = `<div class="card-title">Gym</div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">${tiles}</div>`;
  return div;
}

/* ----------------------------------------------------------
   Activities
   ---------------------------------------------------------- */
const ACTIVITIES = [
  { key: 'footballTraining', emoji: '⚽', label: 'Football training' },
  { key: 'hurlingTraining',  emoji: '🏑', label: 'Hurling training'  },
  { key: 'footballMatch',    emoji: '⚽', label: 'Football match'    },
  { key: 'hurlingMatch',     emoji: '🏑', label: 'Hurling match'     },
  { key: 'golf',             emoji: '⛳', label: 'Golf'              },
  { key: 'padel',            emoji: '🎾', label: 'Padel / Tennis'   },
  { key: 'run',              emoji: '🏃', label: 'Run'               },
  { key: 'conditioning',     emoji: '💪', label: 'Conditioning'      },
  { key: 'gymCardio',        emoji: '🚴', label: 'Gym cardio'        },
];

function buildActivitiesSection() {
  const tiles = ACTIVITIES.map(({ key, emoji, label }) =>
    `<div class="tile" data-activity="${key}" role="button" tabindex="0">
      <div class="tile-icon">${emoji}</div>
      <div class="tile-label">${label}</div>
    </div>`).join('');

  const div = document.createElement('div');
  div.className = 'card';
  div.innerHTML = `<div class="card-title">Activities</div><div class="tile-grid">${tiles}</div>`;
  return div;
}

/* ----------------------------------------------------------
   Recovery
   ---------------------------------------------------------- */
function buildRecoverySection(rec) {
  const r = rec || { saunaMin: 0, coldSessions: 0, stretchMin: 0 };
  const div = document.createElement('div');
  div.className = 'card';
  div.innerHTML = `
    <div class="card-title">Recovery</div>
    ${recRow('🧖', 'Sauna', 'saunaMin', r.saunaMin, 5, 'min')}
    ${recRow('🧊', 'Cold water', 'coldSessions', r.coldSessions, 1, 'sessions')}
    ${recRow('🧘', 'Stretch / mobility', 'stretchMin', r.stretchMin, 5, 'min')}`;
  return div;
}

function recRow(emoji, label, field, val, step, unit) {
  return `
    <div class="form-row">
      <div>
        <div class="form-label">${emoji} ${label}</div>
        <div class="form-sublabel" id="rec-${field}-sub">${fmtRecVal(field, val)}</div>
      </div>
      <div class="counter-control">
        <button class="counter-btn" data-rec-field="${field}" data-delta="-${step}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
        <span class="counter-value" id="rec-${field}-value">${val}</span>
        <button class="counter-btn" data-rec-field="${field}" data-delta="${step}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
      </div>
    </div>`;
}

function fmtRecVal(field, val) {
  if (field === 'coldSessions') return val === 0 ? 'None' : `${val} session${val > 1 ? 's' : ''}`;
  return val === 0 ? '0 min' : `${val} min`;
}

async function handleRecoveryUpdate(field, delta) {
  const list = await getEntriesByDateAndType(_selectedDate, 'recovery');
  const rec  = list[0] || { id: `recovery-${_selectedDate}`, date: _selectedDate,
    type: 'recovery', saunaMin: 0, coldSessions: 0, stretchMin: 0 };
  rec[field] = Math.max(0, (rec[field] || 0) + delta);
  await putEntry(rec);
  const v = document.getElementById(`rec-${field}-value`);
  const s = document.getElementById(`rec-${field}-sub`);
  if (v) v.textContent = rec[field];
  if (s) s.textContent = fmtRecVal(field, rec[field]);
}

/* ----------------------------------------------------------
   Diet
   ---------------------------------------------------------- */
function buildDietSection(takeaways, desserts, drink) {
  const tierRows = ['heavy', 'medium', 'light'].map(tier => {
    const cfg = CONFIG.takeaway.tiers[tier];
    const pills = CONFIG.takeaway.presets[tier].map(name =>
      `<button class="pill" data-takeaway-preset data-name="${name}" data-tier="${tier}">${name}</button>`
    ).join('');
    return `<div style="margin-bottom:10px;">
      <div class="section-label" style="margin-bottom:6px;">${cfg.label} (${cfg.points} pt${cfg.points > 1 ? 's' : ''})</div>
      <div class="pill-group">${pills}</div>
    </div>`;
  }).join('');

  const drinkTiles = ['light', 'medium', 'heavy'].map(lvl => {
    const cfg = CONFIG.drinks.levels[lvl];
    const sel = drink?.level === lvl;
    return `<div class="tile" data-drink-level="${lvl}" role="button" tabindex="0"
      style="${sel ? 'border-color:var(--accent);' : ''}">
      <div class="tile-label" style="${sel ? 'color:var(--accent);' : ''}">${cfg.label}</div>
      <div class="tile-sub">${cfg.def}</div>
      <div class="tile-sub mono">${cfg.points} pts</div>
    </div>`;
  }).join('');

  const div = document.createElement('div');
  div.className = 'card';
  div.innerHTML = `
    <div class="card-title">Diet</div>
    <div style="font-size:14px;font-weight:700;margin-bottom:10px;">Takeaway Damage</div>
    ${tierRows}
    <button class="btn btn-ghost btn-sm" id="btn-takeaway-other" style="padding-left:0;margin-bottom:4px;">+ Other</button>

    <div class="divider" style="margin:12px 0;"></div>

    <div class="form-row" style="padding:0 0 12px;">
      <div>
        <div class="form-label">Desserts / treats</div>
        <div class="form-sublabel">1 pt each</div>
      </div>
      <div class="counter-control">
        <button class="counter-btn" id="dessert-minus">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
        <span class="counter-value">${desserts.length}</span>
        <button class="counter-btn" id="dessert-plus">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
      </div>
    </div>

    <div class="divider" style="margin-bottom:12px;"></div>
    <div style="font-size:14px;font-weight:700;margin-bottom:10px;">Drinks</div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">${drinkTiles}</div>
    ${drink ? `<button class="btn btn-ghost btn-sm" id="clear-drink" style="margin-top:8px;padding-left:0;color:var(--text-secondary);">Clear drinks</button>` : ''}`;
  return div;
}

async function setDrinkEntry(date, level) {
  const existing = await getEntriesByDateAndType(date, 'drink');
  const cfg = CONFIG.drinks.levels[level];
  await putEntry({ id: existing[0]?.id || `drink-${date}`, date, type: 'drink', level, points: cfg.points });
}

async function clearDrinkEntry(date) {
  const existing = await getEntriesByDateAndType(date, 'drink');
  if (existing[0]) await deleteEntry(existing[0].id);
}

/* ----------------------------------------------------------
   Steps (day total from Apple Health)
   ---------------------------------------------------------- */
function buildStepsSection(entry) {
  const has  = entry !== null;
  const sub  = has
    ? `${fmtLoad(round1(computeDailyStepsLoad(entry.steps)))} load`
    : `Day total from Apple Health. Over ${CONFIG.steps.baseline.toLocaleString('en-IE')} adds load`;
  const div = document.createElement('div');
  div.className = 'card';
  div.innerHTML = `
    <div class="card-title">Steps</div>
    <div class="form-row" style="padding:0;">
      <div class="form-label">
        ${has ? 'Logged' : 'Daily steps'}
        <div class="form-sublabel" id="steps-sub">${sub}</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <input type="text" inputmode="numeric" pattern="[0-9,]*" autocomplete="off"
          class="input-field input-field-sm mono" id="steps-input" placeholder="10,240"
          value="${has ? entry.steps.toLocaleString('en-IE') : ''}" style="width:96px;">
        <button class="btn btn-sm btn-primary" id="steps-save">${has ? 'Update' : 'Save'}</button>
      </div>
    </div>`;
  return div;
}

/* ----------------------------------------------------------
   Bodyweight
   ---------------------------------------------------------- */
function buildBodyweightSection(weights) {
  const latest = weights[weights.length - 1];
  const div = document.createElement('div');
  div.className = 'card';
  div.innerHTML = `
    <div class="card-title">Bodyweight</div>
    <div class="form-row" style="padding:0;">
      <div class="form-label">
        Morning weight
        <div class="form-sublabel">${latest ? `Last: ${latest.kg} kg` : 'Log before food'}</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <input type="number" step="0.1" min="30" max="250" class="input-field input-field-sm"
          id="weight-input" placeholder="kg" style="width:76px;">
        <button class="btn btn-sm btn-primary" id="weight-save">Save</button>
      </div>
    </div>`;
  return div;
}

function openBodyweightEditModal(entry) {
  const c = document.createElement('div');
  c.innerHTML = `
    <div class="form-row">
      <span class="form-label">Weight (kg)</span>
      <input type="number" step="0.1" min="30" max="250" class="input-field input-field-sm"
        id="edit-weight" value="${entry.kg}" style="width:80px;">
    </div>
    <button class="btn btn-primary btn-full mt-12" id="edit-weight-save">Save</button>`;
  openModal({ title: 'Edit weight', content: c });
  setTimeout(() => c.querySelector('#edit-weight').focus(), 50);
  c.querySelector('#edit-weight-save').addEventListener('click', async () => {
    const val = parseFloat(c.querySelector('#edit-weight').value);
    if (!val || val < 20) return showToast('Invalid weight.', 'error');
    await putEntry({ ...entry, kg: val });
    closeModal(); showToast('Weight updated.'); renderToday();
  });
}

/* ----------------------------------------------------------
   Logged today
   ---------------------------------------------------------- */
function buildLoggedSection(entries) {
  const div = document.createElement('div');
  div.className = 'card';
  const label = _selectedDate === todayStr() ? 'today' : fmtDate(_selectedDate);

  const rows = entries
    .map(e => loggedRow(e))
    .filter(Boolean)
    .join('');

  div.innerHTML = `
    <div class="card-title">Logged ${label}</div>
    ${rows || '<p class="text-secondary" style="font-size:13px;padding:6px 0;">Nothing logged yet.</p>'}`;
  return div;
}

function loggedRow(entry) {
  const d = entryDisplay(entry);
  if (!d) return null;

  const canEdit   = entry.type === 'training' || entry.type === 'bodyweight';
  const canDelete = entry.type !== 'recovery';

  const editBtn = canEdit ? `
    <button class="icon-btn" data-edit-id="${entry.id}" aria-label="Edit">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M11 4H4a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2v-7"/>
        <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/>
      </svg>
    </button>` : '';

  const delBtn = canDelete ? `
    <button class="icon-btn" data-delete-id="${entry.id}" aria-label="Delete" style="color:#C0392B;">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
        <path d="M10 11v6M14 11v6"/>
      </svg>
    </button>` : '';

  return `
    <div class="list-item">
      <div class="list-item-icon">${d.icon}</div>
      <div class="list-item-body">
        <div class="list-item-title">${d.title}</div>
        ${d.sub ? `<div class="list-item-sub">${d.sub}</div>` : ''}
      </div>
      ${d.value ? `<div class="list-item-value">${d.value}</div>` : ''}
      <div class="list-item-actions">${editBtn}${delBtn}</div>
    </div>`;
}

function entryDisplay(e) {
  switch (e.type) {
    case 'training':
      return { icon: activityEmoji(e), title: e.label,
        sub: `${e.minutes} min · RPE ${e.rpe}`,
        value: `${fmtLoad(entryLoad(e))} load` };
    case 'recovery': {
      if (!e.saunaMin && !e.coldSessions && !e.stretchMin) return null;
      const parts = [];
      if (e.saunaMin      > 0) parts.push(`Sauna ${e.saunaMin}m`);
      if (e.coldSessions  > 0) parts.push(`Cold x${e.coldSessions}`);
      if (e.stretchMin    > 0) parts.push(`Stretch ${e.stretchMin}m`);
      return { icon: '🧘', title: 'Recovery', sub: parts.join(', '), value: null };
    }
    case 'takeaway':
      return { icon: '🍔', title: e.name,
        sub: e.tier.charAt(0).toUpperCase() + e.tier.slice(1) + ' tier',
        value: `+${e.points} pts` };
    case 'dessert':
      return { icon: '🍰', title: 'Dessert / treat', sub: null, value: '+1 pt' };
    case 'drink':
      return { icon: '🍺', title: `Drinks (${e.level})`,
        sub: CONFIG.drinks.levels[e.level]?.def,
        value: `${e.points} pts` };
    case 'bodyweight':
      return { icon: '⚖️', title: 'Weigh-in', sub: null, value: `${e.kg} kg` };
    case 'steps':
      if (typeof e.steps !== 'number') return null;
      return { icon: '👟', title: 'Steps', sub: e.steps.toLocaleString('en-IE'),
        value: `${fmtLoad(round1(computeDailyStepsLoad(e.steps)))} load` };
    default: return null;
  }
}

function activityEmoji(e) {
  if (e.subtype === 'gym') return { fullBody: '🏋️', accessory: '💪', abs: '🔥' }[e.gymType] || '🏋️';
  return { footballTraining:'⚽', hurlingTraining:'🏑', footballMatch:'⚽', hurlingMatch:'🏑',
    golf:'⛳', padel:'🎾', run:'🏃', conditioning:'💪', gymCardio:'🚴' }[e.subtype] || '🏃';
}

function fmtLoad(load) {
  return load % 1 === 0 ? load : load.toFixed(1);
}

/* ----------------------------------------------------------
   Session fields: minutes + effort (RPE) + live load.
   Both start at the preset for the options picked. Once you
   change one yourself, picking another option keeps your value.
   An entry is marked manual when it differs from its preset,
   so later changes to the defaults never overwrite your values.
   ---------------------------------------------------------- */
const SVG_MINUS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>';
const SVG_PLUS  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';

function minutesRowHtml() {
  return `
    <div class="form-row">
      <span class="form-label">Duration</span>
      <div style="display:flex;align-items:center;gap:8px;">
        <input type="number" id="sess-min" class="input-field input-field-sm" inputmode="numeric"
          placeholder="30" min="1" max="600" style="width:76px;">
        <span class="text-secondary">min</span>
      </div>
    </div>`;
}

function effortRowHtml() {
  return `
    <div class="form-row">
      <div>
        <div class="form-label">Effort (RPE)</div>
        <div class="form-sublabel" id="sess-rpe-hint"></div>
      </div>
      <div class="counter-control">
        <button class="counter-btn" data-rpe-step="-1" aria-label="Lower effort">${SVG_MINUS}</button>
        <span class="counter-value mono" id="sess-rpe">--</span>
        <button class="counter-btn" data-rpe-step="1" aria-label="Raise effort">${SVG_PLUS}</button>
      </div>
    </div>`;
}

function loadRowHtml() {
  return `
    <div class="form-row" style="border:none;">
      <span class="form-label">Load</span>
      <span id="sess-load" class="mono" style="font-size:16px;font-weight:700;">--</span>
    </div>`;
}

/* preset: { minutes, rpe } (either may be null until an option is picked).
   getMinutes: optional, for forms where minutes come from elsewhere (run time). */
function bindSessionFields(root, preset, existing, getMinutes) {
  const minInp = root.querySelector('#sess-min');
  const rpeEl  = root.querySelector('#sess-rpe');
  const hint   = root.querySelector('#sess-rpe-hint');
  const loadEl = root.querySelector('#sess-load');
  let p = preset;
  let minTouched = !!existing?.manual;
  let rpeTouched = !!existing?.manual;
  let rpe = existing?.rpe ?? p.rpe;
  if (minInp) minInp.value = existing?.minutes ?? p.minutes ?? '';
  const minutes = () => getMinutes ? getMinutes() : (parseInt(minInp.value) || 0);

  function show() {
    rpeEl.textContent = rpe ?? '--';
    hint.textContent = p.rpe == null ? 'Pick an option, or set it yourself'
      : rpe === p.rpe ? `Preset ${p.rpe}` : `Adjusted (preset ${p.rpe})`;
    const m = minutes();
    loadEl.textContent = m > 0 && rpe ? fmtLoad(calcLoad(m, rpe)) : '--';
  }

  minInp?.addEventListener('input', () => { minTouched = true; show(); });
  root.querySelectorAll('[data-rpe-step]').forEach(b => b.addEventListener('click', () => {
    rpe = Math.min(10, Math.max(1, (rpe ?? p.rpe ?? 5) + parseInt(b.dataset.rpeStep)));
    rpeTouched = true;
    show();
  }));
  show();

  return {
    minutes,
    rpe: () => rpe,
    setPreset(next) {
      p = next;
      if (!minTouched && minInp && p.minutes != null) minInp.value = p.minutes;
      if (!rpeTouched && p.rpe != null) rpe = p.rpe;
      show();
    },
    manual() {
      const offMin = !getMinutes && p.minutes != null && minutes() !== p.minutes;
      return (offMin || rpe !== p.rpe) && (minTouched || rpeTouched || !!existing?.manual);
    },
  };
}

/* ----------------------------------------------------------
   Session modal: option groups (tiles or pills) + session fields.
   Rendered once; taps only restyle, so typed values are never wiped.
   groups:  [{ key, pick, label?, pills?, options: [{ value, label, sub? }] }]
   preset:  sel => { minutes, rpe }
   toEntry: sel => entry fields other than minutes / rpe / load
   ---------------------------------------------------------- */
function openSessionModal({ title, groups = [], selected = {}, preset, toEntry, existing, saveLabel = 'Log session' }) {
  const sel = { ...selected };
  const groupHtml = g => `
    <div style="margin-bottom:14px;">
      ${g.label ? `<div class="section-label" style="margin-bottom:8px;">${g.label}</div>` : ''}
      ${g.pills
        ? `<div class="pill-group">${g.options.map(o =>
            `<button class="pill" data-group="${g.key}" data-val="${o.value}">${o.label}</button>`).join('')}</div>`
        : `<div style="display:grid;grid-template-columns:repeat(${g.options.length},1fr);gap:8px;">${g.options.map(o => `
            <button class="tile" data-group="${g.key}" data-val="${o.value}" style="text-align:center;align-items:center;justify-content:center;">
              <div class="tile-label">${o.label}</div>
              ${o.sub ? `<div class="tile-sub">${o.sub}</div>` : ''}
            </button>`).join('')}</div>`}
    </div>`;

  const c = document.createElement('div');
  c.innerHTML = groups.map(groupHtml).join('') + minutesRowHtml() + effortRowHtml() + loadRowHtml() +
    `<button class="btn btn-primary btn-full mt-12" id="sess-save">${existing ? 'Update' : saveLabel}</button>`;
  openModal({ title, content: c });

  const f = bindSessionFields(c, preset(sel), existing);

  function markSelected() {
    c.querySelectorAll('[data-group]').forEach(b => {
      const on = sel[b.dataset.group] === b.dataset.val;
      if (b.classList.contains('pill')) { b.classList.toggle('selected', on); return; }
      b.style.borderColor = on ? 'var(--accent)' : '';
      b.querySelector('.tile-label').style.color = on ? 'var(--accent)' : '';
    });
  }
  markSelected();

  c.querySelectorAll('[data-group]').forEach(b => b.addEventListener('click', () => {
    sel[b.dataset.group] = b.dataset.val;
    markSelected();
    f.setPreset(preset(sel));
  }));

  c.querySelector('#sess-save').addEventListener('click', async () => {
    const missing = groups.find(g => !sel[g.key]);
    if (missing) return showToast(missing.pick, 'error');
    const minutes = f.minutes();
    const rpe     = f.rpe();
    if (!minutes || minutes < 1) return showToast('Enter duration.', 'error');
    if (!rpe)                    return showToast('Set effort.', 'error');
    const entry = { date: existing?.date ?? _selectedDate, type: 'training', ...toEntry(sel),
      minutes, rpe, load: calcLoad(minutes, rpe), manual: f.manual() };
    await saveActivity(entry, existing);
    closeModal(); showToast(`${entry.label} logged.`); renderToday();
  });
}

const capFirst = s => s.charAt(0).toUpperCase() + s.slice(1);

/* ----------------------------------------------------------
   Gym modal
   ---------------------------------------------------------- */
function openGymModal(gymType, existing) {
  const g = CONFIG.gym[gymType];
  openSessionModal({ title: g.label, existing,
    preset:  () => ({ minutes: g.minutes, rpe: g.rpe }),
    toEntry: () => ({ subtype: 'gym', gymType, label: g.label, category: 'gym' }) });
}

/* ----------------------------------------------------------
   Activity modals
   ---------------------------------------------------------- */
function openActivityModal(key, existing) {
  switch (key) {
    case 'footballTraining': case 'hurlingTraining': case 'padel':
      openIntensityModal(key, existing); break;
    case 'footballMatch': case 'hurlingMatch':
      openMatchModal(key, existing); break;
    case 'golf':        openGolfModal(existing);        break;
    case 'run':         openRunModal(existing);         break;
    case 'conditioning':openConditioningModal(existing);break;
    case 'gymCardio':   openGymCardioModal(existing);   break;
  }
}

async function saveActivity(entry, existing) {
  if (existing) { entry.id = existing.id; await putEntry(entry); }
  else await addEntry(entry);
}

/* Light / Heavy */
function openIntensityModal(key, existing) {
  const act   = CONFIG.activities[key];
  const sport = key.includes('football') ? 'football' : key.includes('hurling') ? 'hurling' : 'other';
  openSessionModal({ title: act.label, existing,
    groups: [{ key: 'intensity', pick: 'Pick intensity.', options: ['light', 'heavy'].map(i =>
      ({ value: i, label: capFirst(i), sub: `${act.minutes} min · RPE ${act.rpe[i]}` })) }],
    selected: { intensity: existing?.intensity },
    preset:  s => ({ minutes: act.minutes, rpe: s.intensity ? act.rpe[s.intensity] : null }),
    toEntry: s => ({ subtype: key, label: act.label, intensity: s.intensity, category: sport }) });
}

/* Came on / Full game */
function openMatchModal(key, existing) {
  const act   = CONFIG.activities[key];
  const sport = key.includes('football') ? 'football' : 'hurling';
  openSessionModal({ title: act.label, existing,
    groups: [{ key: 'option', pick: 'Pick came on or full game.', options: [['cameOn', 'Came on'], ['fullGame', 'Full game']].map(([o, l]) =>
      ({ value: o, label: l, sub: `${act.minutes[o]} min · RPE ${act.rpe[o]}` })) }],
    selected: { option: existing?.option },
    preset:  s => ({ minutes: s.option ? act.minutes[s.option] : null, rpe: s.option ? act.rpe[s.option] : null }),
    toEntry: s => ({ subtype: key, label: act.label + (s.option === 'cameOn' ? ' (sub)' : ''),
      option: s.option, category: sport }) });
}

/* Golf: walk or cart, 18 or 9 holes */
function openGolfModal(existing) {
  const act = CONFIG.activities.golf;
  openSessionModal({ title: 'Golf', existing,
    groups: [
      { key: 'transport', label: 'How did you get around?', pick: 'Pick walk or cart.',
        options: ['walk', 'cart'].map(t => ({ value: t, label: capFirst(t), sub: `RPE ${act.rpe[t]}` })) },
      { key: 'holes', label: 'Holes', pick: 'Pick 18 or 9 holes.',
        options: [['18', 'holes18'], ['9', 'holes9']].map(([h, k]) => ({ value: h, label: `${h} holes`, sub: `${act.minutes[k]} min` })) },
    ],
    selected: { transport: existing?.transport, holes: existing?.holes ? String(existing.holes) : undefined },
    preset: s => ({ minutes: s.holes ? act.minutes[s.holes === '18' ? 'holes18' : 'holes9'] : null,
                    rpe: s.transport ? act.rpe[s.transport] : null }),
    toEntry: s => ({ subtype: 'golf', label: `Golf (${s.transport}, ${s.holes} holes)`,
      transport: s.transport, holes: parseInt(s.holes), category: 'other' }) });
}

/* Run: RPE preset comes from pace, minutes from the run time */
function openRunModal(existing) {
  const c = document.createElement('div');
  c.innerHTML = `
    <div class="form-row">
      <span class="form-label">Distance</span>
      <div style="display:flex;align-items:center;gap:8px;">
        <input type="number" id="run-km" class="input-field input-field-sm" value="${existing?.km||''}"
          placeholder="0.0" step="0.1" min="0.1" max="100" style="width:76px;">
        <span class="text-secondary">km</span>
      </div>
    </div>
    <div class="form-row">
      <span class="form-label">Time</span>
      <div style="display:flex;align-items:center;gap:6px;">
        <input type="number" id="run-m" class="input-field input-field-sm" value="${existing?.timeMinutes||''}"
          placeholder="00" min="1" max="600" style="width:60px;">
        <span class="text-secondary">min</span>
        <input type="number" id="run-s" class="input-field input-field-sm" value="${existing?.timeSecs||0}"
          placeholder="00" min="0" max="59" style="width:60px;">
        <span class="text-secondary">sec</span>
      </div>
    </div>
    <div id="run-preview" style="display:none;margin:10px 0;padding:10px;background:var(--bg);border-radius:8px;font-size:13px;color:var(--text-secondary);"></div>
    ${effortRowHtml()}
    ${loadRowHtml()}
    <button class="btn btn-primary btn-full mt-4" id="run-save">${existing?'Update':'Log run'}</button>`;
  openModal({ title: 'Run', content: c });
  setTimeout(() => c.querySelector('#run-km').focus(), 50);

  function readRun() {
    const km = parseFloat(c.querySelector('#run-km').value) || 0;
    const m  = parseInt(c.querySelector('#run-m').value)    || 0;
    const s  = parseInt(c.querySelector('#run-s').value)    || 0;
    return { km, m, s, totalMin: m + s / 60 };
  }

  const f = bindSessionFields(c, { minutes: null, rpe: null }, existing, () => Math.round(readRun().totalMin));
  const preview = c.querySelector('#run-preview');
  function updatePreview() {
    const { km, totalMin } = readRun();
    if (km <= 0 || totalMin <= 0) { preview.style.display = 'none'; f.setPreset({ minutes: null, rpe: null }); return; }
    const { rpe, paceStr } = runRpe((totalMin * 60) / km);
    preview.style.display = 'block';
    preview.textContent   = `Pace: ${paceStr}/km · preset RPE ${rpe}`;
    f.setPreset({ minutes: null, rpe });
  }
  c.querySelectorAll('input').forEach(i => i.addEventListener('input', updatePreview));
  updatePreview();

  c.querySelector('#run-save').addEventListener('click', async () => {
    const { km, m, s, totalMin } = readRun();
    if (!km || km <= 0)    return showToast('Enter distance.', 'error');
    if (totalMin <= 0)     return showToast('Enter a run time.', 'error');
    const rpe     = f.rpe();
    if (!rpe)              return showToast('Set effort.', 'error');
    const paceS   = (totalMin * 60) / km;
    const minutes = Math.round(totalMin);
    await saveActivity({ date: existing?.date ?? _selectedDate, type:'training', subtype:'run', label:`Run ${km}km`,
      km, timeMinutes:m, timeSecs:s, paceSecPerKm:Math.round(paceS),
      minutes, rpe, load:calcLoad(minutes,rpe), manual: f.manual(), category:'cardio' }, existing);
    closeModal(); showToast(`Run ${km}km logged.`); renderToday();
  });
}

function runRpe(paceSecPerKm) {
  const t = CONFIG.activities.run.paceThresholds;
  const r = CONFIG.activities.run.rpe;
  let rpe;
  if (paceSecPerKm < t.fast)        rpe = r.fast;
  else if (paceSecPerKm <= t.medium) rpe = r.medium;
  else                               rpe = r.slow;
  const pm = Math.floor(paceSecPerKm / 60);
  const ps = Math.round(paceSecPerKm % 60);
  return { rpe, paceStr: `${pm}:${String(ps).padStart(2,'0')}` };
}

/* Conditioning */
function openConditioningModal(existing) {
  const act = CONFIG.activities.conditioning;
  openSessionModal({ title: 'Conditioning', existing, saveLabel: 'Log conditioning',
    preset:  () => ({ minutes: null, rpe: act.rpe }),
    toEntry: () => ({ subtype: 'conditioning', label: 'Conditioning', category: 'cardio' }) });
}

/* Gym cardio */
function openGymCardioModal(existing) {
  const act = CONFIG.activities.gymCardio;
  openSessionModal({ title: 'Gym cardio', existing, saveLabel: 'Log cardio',
    groups: [
      { key: 'machine', label: 'Machine', pick: 'Pick a machine.', pills: true,
        options: act.machines.map(m => ({ value: m, label: m })) },
      { key: 'intensity', label: 'Intensity', pick: 'Pick intensity.',
        options: ['easy', 'moderate', 'hard'].map(i => ({ value: i, label: capFirst(i), sub: `RPE ${act.rpe[i]}` })) },
    ],
    selected: { machine: existing?.machine, intensity: existing?.intensity },
    preset:  s => ({ minutes: null, rpe: s.intensity ? act.rpe[s.intensity] : null }),
    toEntry: s => ({ subtype: 'gymCardio', label: `Gym cardio (${s.machine}, ${s.intensity})`,
      machine: s.machine, intensity: s.intensity, category: 'cardio' }) });
}

/* ----------------------------------------------------------
   Takeaway "Other"
   ---------------------------------------------------------- */
function openTakeawayOtherModal() {
  let tier = null;
  const c = document.createElement('div');
  c.innerHTML = `
    <div class="form-row">
      <span class="form-label">Name</span>
      <input type="text" id="other-name" class="input-field" placeholder="e.g. KFC" style="max-width:180px;">
    </div>
    <div style="margin-top:12px;">
      <div class="section-label" style="margin-bottom:8px;">Tier</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">
        ${['heavy','medium','light'].map(t => {
          const cfg = CONFIG.takeaway.tiers[t];
          return `<button class="tile" data-tier="${t}" style="text-align:center;align-items:center;justify-content:center;">
            <div class="tile-label">${cfg.label}</div><div class="tile-sub">${cfg.points} pts</div>
          </button>`;
        }).join('')}
      </div>
    </div>
    <button class="btn btn-primary btn-full mt-12" id="other-save">Log it</button>`;
  openModal({ title: 'Other takeaway', content: c });
  setTimeout(() => c.querySelector('#other-name').focus(), 50);
  c.querySelectorAll('[data-tier]').forEach(b =>
    b.addEventListener('click', () => {
      tier = b.dataset.tier;
      c.querySelectorAll('[data-tier]').forEach(x => x.style.borderColor = '');
      b.style.borderColor = 'var(--accent)';
    }));
  c.querySelector('#other-save').addEventListener('click', async () => {
    const name = c.querySelector('#other-name').value.trim();
    if (!name) return showToast('Enter a name.', 'error');
    if (!tier) return showToast('Pick a tier.', 'error');
    await addEntry({ date: _selectedDate, type: 'takeaway', name, tier,
      points: CONFIG.takeaway.tiers[tier].points });
    closeModal(); showToast(`${name} logged.`); renderToday();
  });
}

/* ----------------------------------------------------------
   Calculation helpers
   ---------------------------------------------------------- */
function calcLoad(minutes, rpe) {
  return Math.round((minutes * rpe / 10) * 10) / 10;
}

/* Training + steps load */
function calcTotalLoad(entries) {
  return round1(weekTrainingLoad(entries) + weekStepsLoad(entries));
}

function calcTakeawayDamage(entries) {
  return entries.filter(e => e.type === 'takeaway').reduce((s, e) => s + (e.points || 0), 0)
    + entries.filter(e => e.type === 'dessert').length;
}
