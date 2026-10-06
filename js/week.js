/* ============================================================
   WEEK SCREEN
   ============================================================ */

let _weekMonday = weekStartStr(todayStr());

SCREEN_RENDERERS['week'] = renderWeek;

/* ----------------------------------------------------------
   Main render
   ---------------------------------------------------------- */
async function renderWeek() {
  const body = document.getElementById('week-body');
  const scrollTop = body.scrollTop;
  body.innerHTML = `<div class="card" style="text-align:center;padding:24px;">
    <span class="text-secondary">Loading...</span></div>`;

  try {
    const data = await computeWeekData(_weekMonday);

    const frag = document.createDocumentFragment();
    frag.appendChild(buildWeekNav(data));
    frag.appendChild(buildStepsCard(data));
    frag.appendChild(buildScoreCard(data));
    frag.appendChild(buildDashboard(data));
    frag.appendChild(buildDailyChart(data));
    frag.appendChild(buildCategoryChart(data));
    if (data.flags.length) frag.appendChild(buildFlagsCard(data));

    const daysSince = daysSinceBackup();
    if (daysSince === null || daysSince >= CONFIG.backup.reminderDays) {
      frag.appendChild(buildBackupReminder(daysSince));
    }

    body.innerHTML = '';
    body.appendChild(frag);
    body.scrollTop = scrollTop;
    attachWeekHandlers(data);
  } catch (err) {
    body.innerHTML = `<div class="card"><p class="text-secondary">Error: ${err.message}</p></div>`;
  }
}

/* ----------------------------------------------------------
   Week navigation
   ---------------------------------------------------------- */
function buildWeekNav(data) {
  const mon = strToDate(data.mondayStr);
  const sun = strToDate(data.sundayStr);
  const isCurrent = data.mondayStr === weekStartStr(todayStr());

  const fmt = d => `${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`;
  const label = `${fmt(mon)} - ${fmt(sun)} ${sun.getFullYear()}`;

  const div = document.createElement('div');
  div.innerHTML = `
    <div class="card" style="display:flex;align-items:center;gap:4px;padding:10px 12px;">
      <button class="icon-btn" id="week-prev">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <div style="flex:1;text-align:center;">
        <div style="font-size:14px;font-weight:700;color:var(--text);">${isCurrent ? 'This week' : label}</div>
        ${isCurrent ? `<div style="font-size:11px;color:var(--text-secondary);">${label}</div>` : ''}
      </div>
      <button class="icon-btn" id="week-next" ${isCurrent ? 'disabled style="opacity:0.3;"' : ''}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>
      </button>
    </div>`;
  return div.firstElementChild;
}

/* ----------------------------------------------------------
   Steps input
   ---------------------------------------------------------- */
function buildStepsCard(data) {
  const current = data.avgSteps;
  const div = document.createElement('div');
  div.className = 'card';
  div.innerHTML = `
    <div class="card-title">Avg daily steps this week</div>
    <div class="form-row" style="padding:0;">
      <div class="form-label">
        From Apple Health
        ${current !== null
          ? `<div class="form-sublabel">Steps load: <span class="mono">${round1(data.stepsLoad)}</span></div>`
          : '<div class="form-sublabel">Enter once, ideally on Sunday</div>'}
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <input type="number" id="steps-input" class="input-field input-field-sm"
          value="${current ?? ''}" placeholder="10000" min="0" max="100000" style="width:90px;">
        <button class="btn btn-sm btn-primary" id="steps-save">Save</button>
      </div>
    </div>`;
  return div;
}

/* ----------------------------------------------------------
   Week score card
   ---------------------------------------------------------- */
function buildScoreCard(data) {
  const inProgress = !data.isComplete;
  const score = data.weekScore;
  const color = score >= 80 ? 'var(--green)' : score >= 60 ? 'var(--accent)' : score >= 40 ? 'var(--orange)' : 'var(--red)';

  const sliceRows = [
    { key: 'training',   label: 'Training',     na: data.breakdown.training.na,   ratio: data.ratio },
    { key: 'recovery',   label: 'Recovery',     na: false },
    { key: 'dietFood',   label: 'Diet: food',   na: false },
    { key: 'dietDrinks', label: 'Diet: drinks', na: false },
    { key: 'body',       label: 'Body',         na: data.breakdown.body.na },
  ].map(({ key, label, na, ratio }) => {
    const s = data.breakdown[key];
    const pct = na ? 0 : Math.round((s.pts / s.max) * 100);
    const barColor = pct >= 80 ? 'var(--green)' : pct >= 50 ? 'var(--accent)' : 'var(--orange)';
    const naTag = na
      ? `<span class="badge" style="font-size:10px;">n/a</span>`
      : `<span class="mono" style="font-size:12px;color:var(--text-secondary);">${s.pts}/${s.max}</span>`;

    let sub = '';
    if (key === 'training' && ratio !== null) {
      const st = loadRatioStatus(ratio);
      const col = { green:'var(--green)', amber:'var(--orange)', red:'var(--red)', coasting:'var(--text-secondary)' }[st] || 'var(--text-secondary)';
      sub = `<span style="font-size:10px;font-weight:700;color:${col};">Ratio ${ratio}</span>`;
    }
    if (key === 'training' && ratio === null && data.weeksToBaseline > 0) {
      sub = `<span style="font-size:10px;color:var(--text-secondary);">Building baseline</span>`;
    }

    return `
      <div style="display:flex;align-items:center;gap:8px;padding:5px 0;">
        <div style="width:90px;font-size:12px;font-weight:600;color:var(--text-secondary);flex-shrink:0;">${label}</div>
        <div style="flex:1;height:6px;background:var(--card-border);border-radius:3px;overflow:hidden;">
          <div style="height:100%;width:${pct}%;background:${na ? 'var(--card-border)' : barColor};border-radius:3px;transition:width 0.4s;"></div>
        </div>
        <div style="width:54px;text-align:right;flex-shrink:0;">${naTag}</div>
      </div>
      ${sub ? `<div style="padding-left:98px;margin-top:-2px;margin-bottom:3px;">${sub}</div>` : ''}`;
  }).join('');

  /* Ratio status badge */
  let ratioBadge = '';
  if (data.ratio !== null) {
    const st = loadRatioStatus(data.ratio);
    const labels = { green: 'On track', amber: 'Pushing hard', red: 'Spike', coasting: 'Coasting' };
    const colors = { green: 'badge-green', amber: 'badge-orange', red: 'badge-red', coasting: '' };
    ratioBadge = `<span class="badge ${colors[st]}">${labels[st]}</span>`;
  } else if (data.weeksToBaseline > 0) {
    ratioBadge = `<span class="badge">Baseline building - ${data.weeksToBaseline} week${data.weeksToBaseline > 1 ? 's' : ''} to go</span>`;
  }

  const div = document.createElement('div');
  div.className = 'card';
  div.innerHTML = `
    <div style="text-align:center;padding:12px 0 8px;">
      <div style="font-family:var(--font-mono);font-size:52px;font-weight:600;color:${color};line-height:1;">${score}</div>
      <div style="font-size:13px;color:var(--text-secondary);font-weight:600;margin-top:4px;">
        / 100 ${inProgress ? '&nbsp;<span class="badge badge-blue">In progress</span>' : ''}
      </div>
      ${ratioBadge ? `<div style="margin-top:8px;">${ratioBadge}</div>` : ''}
    </div>
    <div class="divider" style="margin:12px 0;"></div>
    <div>${sliceRows}</div>`;
  return div;
}

/* ----------------------------------------------------------
   Numbers dashboard
   ---------------------------------------------------------- */
function buildDashboard(data) {
  const p = data.prevData;

  function row(label, value, prev, higherGood, fmt) {
    const display = value === null || value === undefined ? '--' : fmt ? fmt(value) : value;
    let deltaHtml = '';
    if (prev !== null && prev !== undefined && value !== null && value !== undefined) {
      const diff   = value - prev;
      const pct    = prev > 0 ? Math.round(Math.abs(diff / prev) * 100) : null;
      const up     = diff > 0;
      const same   = Math.abs(diff) < 0.01;
      if (!same) {
        const good  = higherGood ? up : !up;
        const col   = good ? 'var(--green)' : 'var(--orange)';
        const arrow = up ? '↑' : '↓';
        const tag   = pct !== null ? `${arrow} ${pct}%` : arrow;
        deltaHtml = `<span style="font-size:11px;font-weight:700;color:${col};">${tag}</span>`;
      } else {
        deltaHtml = `<span style="font-size:11px;color:var(--text-secondary);">--</span>`;
      }
    }
    return `
      <div style="display:flex;align-items:center;padding:9px 0;border-bottom:1px solid var(--card-border);">
        <div style="flex:1;font-size:13px;color:var(--text-secondary);font-weight:600;">${label}</div>
        <div style="font-family:var(--font-mono);font-size:14px;font-weight:600;color:var(--text);margin-right:8px;">${display}</div>
        <div style="width:44px;text-align:right;">${deltaHtml}</div>
      </div>`;
  }

  /* Load ratio row (special - needs color) */
  const ratioColor = { green:'var(--green)', amber:'var(--orange)', red:'var(--red)', coasting:'var(--text-secondary)', none:'var(--text-secondary)' }[data.ratioStatus];
  const ratioDisplay = data.ratio !== null
    ? `<span style="color:${ratioColor};font-family:var(--font-mono);font-size:14px;font-weight:600;">${data.ratio}</span>`
    : `<span style="font-size:12px;color:var(--text-secondary);">No data</span>`;

  const div = document.createElement('div');
  div.className = 'card';
  div.innerHTML = `
    <div class="card-title">Dashboard</div>

    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-secondary);padding:6px 0 4px;">Training</div>
    ${row('Total load',      data.totalLoad,    p?.totalLoad,    true)}
    <div style="display:flex;align-items:center;padding:9px 0;border-bottom:1px solid var(--card-border);">
      <div style="flex:1;font-size:13px;color:var(--text-secondary);font-weight:600;">Load ratio</div>
      ${ratioDisplay}
    </div>
    ${row('Gym sessions',    data.gymSessions.total,   null,  true)}
    ${row('Pitch sessions',  data.pitchSessions.total, null,  true)}
    ${row('Cardio min',      data.cardioMinutes, p?.cardioMinutes, true)}
    ${data.avgSteps !== null ? row('Avg daily steps', data.avgSteps, null, true, v => v.toLocaleString()) : ''}

    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-secondary);padding:12px 0 4px;">Sleep & Recovery</div>
    ${row('Avg time in bed', data.avgHoursInBed,   p?.avgHoursInBed,   true, v => fmtHours(v))}
    ${row('Avg wake feeling',data.avgWakeFeeling,  null,               true, v => `${v} / 5`)}
    ${row('Recovery score',  data.recoveryScore,   p?.recoveryScore,   true)}
    ${row('Sauna min',       data.saunaMin,         null,               true)}
    ${row('Cold sessions',   data.coldSessions,     null,               true)}
    ${row('Stretch min',     data.stretchMin,        null,               true)}

    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-secondary);padding:12px 0 4px;">Diet</div>
    ${row('Takeaway Damage', data.takeawayDamage, p?.takeawayDamage, false)}
    ${row('Drinks points',   data.drinksPoints,   p?.drinksPoints,   false)}

    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-secondary);padding:12px 0 4px;">Body</div>
    ${row('Avg weight (kg)', data.avgWeight, p?.avgWeight, false, v => v.toFixed(1))}
    ${data.weightChange !== null ? row('Weight change', data.weightChange, null, false, v => `${v > 0 ? '+' : ''}${v.toFixed(2)} kg`) : ''}`;

  /* Remove last border */
  div.querySelectorAll('[style*="border-bottom"]').forEach((el, i, arr) => {
    if (i === arr.length - 1) el.style.borderBottom = 'none';
  });

  return div;
}

/* ----------------------------------------------------------
   Daily load chart (this week vs last week)
   ---------------------------------------------------------- */
function buildDailyChart(data) {
  const days = weekDays(data.mondayStr);
  const lastDays = weekDays(addWeeks(data.mondayStr, -1));

  function dayLoad(entries, date) {
    return round1(entries
      .filter(e => e.date === date && e.type === 'training')
      .reduce((s, e) => s + (e.load || 0), 0));
  }

  const thisLoads = days.map(d => dayLoad(data.allEntries, d));
  const lastLoads = lastDays.map(d => dayLoad(data.prevWeekEntries, d));
  const maxLoad   = Math.max(...thisLoads, ...lastLoads, 1);

  const cols = days.map((date, i) => {
    const th   = thisLoads[i];
    const la   = lastLoads[i];
    const thPct = Math.round((th / maxLoad) * 100);
    const laPct = Math.round((la / maxLoad) * 100);
    const dayLbl = DAY_SHORT[strToDate(date).getDay()];
    const isToday = date === todayStr();

    return `
      <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;">
        <div style="width:100%;display:flex;align-items:flex-end;gap:2px;height:70px;">
          <div style="flex:1;background:var(--accent);border-radius:2px 2px 0 0;height:${Math.max(thPct,th>0?4:0)}%;opacity:1;min-height:${th>0?3:0}px;"></div>
          <div style="flex:1;background:var(--card-border);border-radius:2px 2px 0 0;height:${Math.max(laPct,la>0?4:0)}%;opacity:1;min-height:${la>0?3:0}px;"></div>
        </div>
        <div style="font-size:10px;font-weight:${isToday?'800':'600'};color:${isToday?'var(--accent)':'var(--text-secondary)'};">${dayLbl}</div>
      </div>`;
  }).join('');

  const div = document.createElement('div');
  div.className = 'card';
  div.innerHTML = `
    <div class="card-title">Daily load</div>
    <div style="display:flex;gap:4px;align-items:stretch;">${cols}</div>
    <div style="display:flex;gap:12px;margin-top:10px;">
      <div style="display:flex;align-items:center;gap:4px;">
        <div style="width:10px;height:10px;border-radius:2px;background:var(--accent);"></div>
        <span style="font-size:11px;color:var(--text-secondary);">This week</span>
      </div>
      <div style="display:flex;align-items:center;gap:4px;">
        <div style="width:10px;height:10px;border-radius:2px;background:var(--card-border);border:1px solid #ccc;"></div>
        <span style="font-size:11px;color:var(--text-secondary);">Last week</span>
      </div>
    </div>`;
  return div;
}

/* ----------------------------------------------------------
   Category load chart
   ---------------------------------------------------------- */
function buildCategoryChart(data) {
  const cats = {
    football: 0, hurling: 0, gym: 0, cardio: 0, other: 0,
  };
  data.allEntries.filter(e => e.type === 'training').forEach(e => {
    const c = e.category || 'other';
    cats[c] = (cats[c] || 0) + (e.load || 0);
  });
  const stepsLoad = data.stepsLoad;

  const rows = [
    { label: 'Gym',              val: round1(cats.gym),      col: '#1F4FD1' },
    { label: 'Football',         val: round1(cats.football), col: '#2E7D4F' },
    { label: 'Hurling',          val: round1(cats.hurling),  col: '#B4520F' },
    { label: 'Cardio',           val: round1(cats.cardio),   col: '#7C3AED' },
    { label: 'Golf / Padel / Tennis', val: round1(cats.other), col: '#0891B2' },
    { label: 'Steps',            val: round1(stepsLoad),     col: '#059669' },
  ].filter(r => r.val > 0);

  if (!rows.length) {
    const div = document.createElement('div');
    div.className = 'card';
    div.innerHTML = `<div class="card-title">Load breakdown</div>
      <p class="text-secondary" style="font-size:13px;">No sessions logged this week.</p>`;
    return div;
  }

  const maxVal = Math.max(...rows.map(r => r.val));
  const rowsHtml = rows.map(r => `
    <div style="display:flex;align-items:center;gap:8px;padding:4px 0;">
      <div style="width:110px;font-size:12px;font-weight:600;color:var(--text-secondary);flex-shrink:0;">${r.label}</div>
      <div style="flex:1;height:8px;background:var(--bg);border-radius:4px;overflow:hidden;">
        <div style="height:100%;width:${Math.round((r.val/maxVal)*100)}%;background:${r.col};border-radius:4px;"></div>
      </div>
      <div style="width:36px;text-align:right;font-family:var(--font-mono);font-size:12px;font-weight:600;color:var(--text-secondary);">${r.val}</div>
    </div>`).join('');

  const div = document.createElement('div');
  div.className = 'card';
  div.innerHTML = `<div class="card-title">Load breakdown</div>${rowsHtml}`;
  return div;
}

/* ----------------------------------------------------------
   Flags
   ---------------------------------------------------------- */
function buildFlagsCard(data) {
  const icons = { positive: '✓', warning: '⚠', danger: '⚡' };
  const cssClass = { positive: 'flag-positive', warning: 'flag-warning', danger: 'flag-danger' };

  const flagHtml = data.flags.map(f => `
    <div class="flag ${cssClass[f.type]}">
      <span class="flag-icon">${icons[f.type]}</span>
      <span>${f.text}</span>
    </div>`).join('');

  const div = document.createElement('div');
  div.className = 'card';
  div.innerHTML = `<div class="card-title">Highlights</div>${flagHtml}`;
  return div;
}

/* ----------------------------------------------------------
   Backup reminder
   ---------------------------------------------------------- */
function buildBackupReminder(daysSince) {
  const msg = daysSince === null
    ? 'Back up your data to keep it safe.'
    : `Last backup was ${daysSince} days ago. Consider backing up.`;

  const div = document.createElement('div');
  div.innerHTML = `
    <div class="card" style="border-color:var(--card-border);">
      <div style="display:flex;align-items:center;gap:10px;">
        <span style="font-size:18px;">💾</span>
        <div style="flex:1;">
          <div style="font-size:13px;font-weight:600;color:var(--text-secondary);">${msg}</div>
        </div>
        <button class="btn btn-sm btn-secondary" id="week-export">Export</button>
      </div>
    </div>`;
  return div.firstElementChild;
}

/* ----------------------------------------------------------
   Event handlers
   ---------------------------------------------------------- */
function attachWeekHandlers(data) {
  const body = document.getElementById('week-body');

  body.querySelector('#week-prev')?.addEventListener('click', () => {
    _weekMonday = addWeeks(_weekMonday, -1); renderWeek();
  });
  body.querySelector('#week-next')?.addEventListener('click', () => {
    const next = addWeeks(_weekMonday, 1);
    if (next <= weekStartStr(todayStr())) { _weekMonday = next; renderWeek(); }
  });

  body.querySelector('#steps-save')?.addEventListener('click', async () => {
    const val = parseInt(body.querySelector('#steps-input').value);
    if (!val || val < 0) return showToast('Enter average steps per day.', 'error');
    const stepsLoad = round1(computeStepsLoad(val));
    await putEntry({ id: `steps-${_weekMonday}`, date: _weekMonday, type: 'steps', avgSteps: val, stepsLoad });
    showToast(`Steps saved. Steps load: ${stepsLoad}.`);
    renderWeek();
  });

  body.querySelector('#week-export')?.addEventListener('click', async () => {
    try { await doExport(); } catch (e) { showToast('Export failed.', 'error'); }
  });
}

/* round1 / fmtHours / addWeeks / weekDays / weekStartStr
   are all defined in score.js / sleep.js (loaded earlier). */
