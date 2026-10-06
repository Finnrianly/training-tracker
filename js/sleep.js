/* ============================================================
   SLEEP SCREEN
   ============================================================ */

let _sleepDate = todayStr();

SCREEN_RENDERERS['sleep'] = renderSleep;

const WAKE_LABELS = ['', 'Wrecked', 'Groggy', 'OK', 'Good', 'Flying'];

/* ----------------------------------------------------------
   Main render
   ---------------------------------------------------------- */
async function renderSleep() {
  const body = document.getElementById('sleep-body');
  const scrollTop = body.scrollTop;

  try {
    /* Current date's sleep entry (if exists) */
    const list    = await getEntriesByDateAndType(_sleepDate, 'sleep');
    const current = list[0] || null;

    /* Last 7 nights for the chart (ending at _sleepDate) */
    const d7 = strToDate(_sleepDate);
    d7.setDate(d7.getDate() - 6);
    const chartEntries = await getEntriesByDateRange(dateToStr(d7), _sleepDate);
    const sleepEntries = chartEntries.filter(e => e.type === 'sleep');

    const frag = document.createDocumentFragment();
    frag.appendChild(buildSleepDateBar());
    frag.appendChild(buildSleepForm(current));
    frag.appendChild(buildSleepChart(sleepEntries));

    body.innerHTML = '';
    body.appendChild(frag);
    body.scrollTop = scrollTop;
    attachSleepHandlers(current);

  } catch (err) {
    body.innerHTML = `<div class="card"><p class="text-secondary">Error: ${err.message}</p></div>`;
  }
}

/* ----------------------------------------------------------
   Date bar
   ---------------------------------------------------------- */
function buildSleepDateBar() {
  const d      = strToDate(_sleepDate);
  const isToday = _sleepDate === todayStr();
  const label  = isToday ? 'This morning' : `Morning of ${DAY_FULL[d.getDay()]}`;
  const sub    = `${d.getDate()} ${MONTH_SHORT[d.getMonth()]} ${d.getFullYear()}`;
  const atToday = _sleepDate >= todayStr();

  const div = document.createElement('div');
  div.innerHTML = `
    <div class="card" style="display:flex;align-items:center;gap:4px;padding:10px 12px;">
      <button class="icon-btn" id="sleep-date-prev">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <button id="sleep-date-label" style="flex:1;background:none;border:none;cursor:pointer;text-align:center;padding:4px 0;">
        <div style="font-size:15px;font-weight:700;color:var(--text);">${label}</div>
        <div style="font-size:12px;color:var(--text-secondary);">${sub}</div>
      </button>
      <button class="icon-btn" id="sleep-date-next" ${atToday ? 'disabled style="opacity:0.3;"' : ''}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>
      </button>
      <input type="date" id="sleep-date-picker" max="${todayStr()}" value="${_sleepDate}"
        style="position:absolute;opacity:0;pointer-events:none;width:0;height:0;">
    </div>`;
  return div.firstElementChild;
}

/* ----------------------------------------------------------
   Sleep log form
   ---------------------------------------------------------- */
function buildSleepForm(current) {
  const lightsOff   = current?.lightsOff   || '';
  const wakeTime    = current?.wakeTime    || '';
  const hoursInBed  = (lightsOff && wakeTime) ? hoursBetween(lightsOff, wakeTime) : null;
  const feeling     = current?.wakeFeeling || 0;

  const hoursDisplay = hoursInBed !== null
    ? `<span style="font-weight:700;color:${hoursInBed < CONFIG.sleep.lowHoursThreshold ? 'var(--orange)' : 'var(--green)'};">${fmtHours(hoursInBed)}</span>`
    : '<span style="color:var(--text-secondary);">Enter times above</span>';

  const feelingBtns = [1,2,3,4,5].map(n => `
    <button class="feeling-btn${feeling === n ? ' feeling-selected' : ''}" data-feeling="${n}">
      <div class="feeling-num">${n}</div>
      <div class="feeling-lbl">${WAKE_LABELS[n]}</div>
    </button>`).join('');

  const div = document.createElement('div');
  div.className = 'card';
  div.id = 'sleep-form-card';
  div.innerHTML = `
    <div class="card-title">${current ? 'Update sleep' : 'Log sleep'}</div>

    <div class="form-row">
      <div class="form-label">
        Phone away
        <div class="form-sublabel">Lights off time</div>
      </div>
      <input type="time" id="lights-off" class="input-field" value="${lightsOff}"
        style="width:110px;text-align:center;font-family:var(--font-mono);font-size:16px;font-weight:600;">
    </div>

    <div class="form-row">
      <div class="form-label">
        Wake time
      </div>
      <input type="time" id="wake-time" class="input-field" value="${wakeTime}"
        style="width:110px;text-align:center;font-family:var(--font-mono);font-size:16px;font-weight:600;">
    </div>

    <div class="form-row" style="border-bottom:none;">
      <span class="form-label">Time in bed</span>
      <div id="hours-in-bed" style="font-size:16px;">${hoursDisplay}</div>
    </div>

    <div class="divider" style="margin:12px 0;"></div>

    <div style="font-size:14px;font-weight:700;margin-bottom:10px;">Wake feeling</div>
    <div class="feeling-row">${feelingBtns}</div>

    <button class="btn btn-primary btn-full mt-12" id="sleep-save">
      ${current ? 'Update' : 'Save sleep'}
    </button>
    ${current ? `<button class="btn btn-ghost btn-full" id="sleep-delete"
      style="margin-top:6px;color:var(--text-secondary);">Delete this entry</button>` : ''}`;
  return div;
}

/* ----------------------------------------------------------
   7-night bar chart
   ---------------------------------------------------------- */
function buildSleepChart(sleepEntries) {
  /* Build a map date -> entry for fast lookup */
  const byDate = {};
  sleepEntries.forEach(e => { byDate[e.date] = e; });

  /* 7 nights ending on _sleepDate */
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(strToDate(_sleepDate));
    d.setDate(d.getDate() - i);
    days.push(dateToStr(d));
  }

  const maxH  = 10;  /* chart ceiling */
  const target = CONFIG.sleep.targetHours;
  const low    = CONFIG.sleep.lowHoursThreshold;

  const cols = days.map(date => {
    const entry = byDate[date];
    const h     = entry?.hoursInBed || 0;
    const pct   = Math.min(100, (h / maxH) * 100);
    const d     = strToDate(date);
    const dayLbl = DAY_SHORT[d.getDay()];
    const color  = h === 0 ? 'var(--card-border)' : h < low ? 'var(--orange)' : 'var(--accent)';
    const valLbl = h > 0 ? fmtHours(h) : '';

    return `
      <div class="bar-chart-col" style="height:100%;">
        <div style="font-size:9px;color:var(--text-secondary);font-weight:600;margin-bottom:2px;min-height:14px;text-align:center;">${valLbl}</div>
        <div style="flex:1;display:flex;align-items:flex-end;width:100%;">
          <div style="width:100%;height:${Math.max(pct, 2)}%;background:${color};border-radius:3px 3px 0 0;min-height:3px;transition:height 0.3s;"></div>
        </div>
        <div style="font-size:10px;color:var(--text-secondary);font-weight:600;margin-top:4px;text-align:center;">${dayLbl}</div>
      </div>`;
  }).join('');

  /* Target line position: (target/maxH)*100% from bottom */
  const targetPct = (target / maxH) * 100;

  const div = document.createElement('div');
  div.className = 'card';
  div.innerHTML = `
    <div class="card-title">Last 7 nights</div>
    <div style="position:relative;height:120px;display:flex;flex-direction:column;">
      <!-- target line -->
      <div style="position:absolute;bottom:${targetPct}%;left:0;right:0;border-top:1px dashed var(--card-border);z-index:1;"></div>
      <div style="position:absolute;bottom:calc(${targetPct}% + 2px);right:0;font-size:9px;color:var(--text-secondary);font-weight:600;">8h</div>
      <!-- bars -->
      <div style="flex:1;display:flex;align-items:stretch;gap:4px;padding-bottom:0;">
        ${cols}
      </div>
    </div>
    <div style="margin-top:8px;display:flex;gap:12px;">
      <div style="display:flex;align-items:center;gap:4px;">
        <div style="width:10px;height:10px;border-radius:2px;background:var(--accent);"></div>
        <span style="font-size:11px;color:var(--text-secondary);">8h+</span>
      </div>
      <div style="display:flex;align-items:center;gap:4px;">
        <div style="width:10px;height:10px;border-radius:2px;background:var(--orange);"></div>
        <span style="font-size:11px;color:var(--text-secondary);">Under 8h</span>
      </div>
    </div>`;
  return div;
}

/* ----------------------------------------------------------
   Event handlers
   ---------------------------------------------------------- */
function attachSleepHandlers(current) {
  const body = document.getElementById('sleep-body');

  /* Date nav */
  body.querySelector('#sleep-date-prev')?.addEventListener('click', () => changeSleepDate(-1));
  body.querySelector('#sleep-date-next')?.addEventListener('click', () => changeSleepDate(1));
  body.querySelector('#sleep-date-label')?.addEventListener('click', () => {
    const p = body.querySelector('#sleep-date-picker');
    p.showPicker ? p.showPicker() : p.click();
  });
  body.querySelector('#sleep-date-picker')?.addEventListener('change', e => {
    if (e.target.value) { _sleepDate = e.target.value; renderSleep(); }
  });

  /* Live time-in-bed calculation */
  const lightsOffInput = body.querySelector('#lights-off');
  const wakeInput      = body.querySelector('#wake-time');
  const hoursEl        = body.querySelector('#hours-in-bed');

  function updateHours() {
    const lo = lightsOffInput.value;
    const wt = wakeInput.value;
    if (!lo || !wt) { hoursEl.innerHTML = '<span style="color:var(--text-secondary);">Enter times above</span>'; return; }
    const h   = hoursBetween(lo, wt);
    const low = CONFIG.sleep.lowHoursThreshold;
    hoursEl.innerHTML = `<span style="font-weight:700;color:${h < low ? 'var(--orange)' : 'var(--green)'};">${fmtHours(h)}</span>`;
  }

  lightsOffInput?.addEventListener('change', updateHours);
  wakeInput?.addEventListener('change', updateHours);

  /* Wake feeling selection */
  let selectedFeeling = current?.wakeFeeling || 0;
  body.querySelectorAll('.feeling-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedFeeling = parseInt(btn.dataset.feeling);
      body.querySelectorAll('.feeling-btn').forEach(b => b.classList.remove('feeling-selected'));
      btn.classList.add('feeling-selected');
    });
  });

  /* Save */
  body.querySelector('#sleep-save')?.addEventListener('click', async () => {
    const lo = lightsOffInput.value;
    const wt = wakeInput.value;
    if (!lo) return showToast('Enter phone-away time.', 'error');
    if (!wt) return showToast('Enter wake time.', 'error');
    if (!selectedFeeling) return showToast('Pick a wake feeling.', 'error');

    const h = hoursBetween(lo, wt);
    const entry = {
      id:          `sleep-${_sleepDate}`,
      date:        _sleepDate,
      type:        'sleep',
      lightsOff:   lo,
      wakeTime:    wt,
      hoursInBed:  Math.round(h * 100) / 100,
      wakeFeeling: selectedFeeling,
    };
    await putEntry(entry);
    showToast('Sleep saved.');
    renderSleep();
  });

  /* Delete */
  body.querySelector('#sleep-delete')?.addEventListener('click', () => {
    confirmAction('Delete this sleep entry?', async () => {
      if (current?.id) await deleteEntry(current.id);
      showToast('Sleep entry deleted.');
      renderSleep();
    });
  });
}

function changeSleepDate(delta) {
  const d = strToDate(_sleepDate);
  d.setDate(d.getDate() + delta);
  const s = dateToStr(d);
  if (s <= todayStr()) { _sleepDate = s; renderSleep(); }
}

/* ----------------------------------------------------------
   Format helpers
   ---------------------------------------------------------- */
function fmtHours(h) {
  const hrs  = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  if (mins === 0) return `${hrs}h`;
  return `${hrs}h ${mins}m`;
}
