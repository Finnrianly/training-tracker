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
    const [data, prevAll] = await Promise.all([
      computeWeekData(_weekMonday),
      computeWeekData(addWeeks(_weekMonday, -1)),
    ]);
    /* Only compare against last week if anything was logged in it */
    const prev = prevAll.allEntries.length > 0 ? prevAll : null;

    const frag = document.createDocumentFragment();
    frag.appendChild(buildWeekNav(data));
    frag.appendChild(buildHeroCard(data, prev));
    frag.appendChild(buildMetricGrid(data, prev));
    frag.appendChild(buildDailyChart(data, prevAll));
    frag.appendChild(buildCategoryChart(data));
    if (data.flags.length) frag.appendChild(buildFlagsCard(data));

    const daysSince = daysSinceBackup();
    if (daysSince === null || daysSince >= CONFIG.backup.reminderDays) {
      frag.appendChild(buildBackupReminder(daysSince));
    }
    frag.appendChild(buildHowScoresCard());

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
   Dashboard colours and helpers
   ---------------------------------------------------------- */
const DASH_CAT = {
  training: '#1F4FD1',
  recovery: '#7C3AED',
  diet:     '#EA7A1A',
  body:     '#0E9F9A',
};

const STATUS_ARROW = { up: '▲', down: '▼', same: '=' };

/* Score band: 80+ green, 60-79 amber, under 60 red */
function scoreBand(score) {
  return score >= 80 ? 'good' : score >= 60 ? 'warn' : 'bad';
}

/* Load ratio zone for tiles: 0.8-1.3 green, 1.3-1.5 amber, else red */
function ratioZone(ratio) {
  if (ratio === null) return 'none';
  const st = loadRatioStatus(ratio);
  return st === 'green' ? 'good' : st === 'amber' ? 'warn' : 'bad';
}

function ratioZoneLabel(ratio) {
  return { green: 'In range', amber: 'Pushing hard', red: 'Spike', coasting: 'Coasting' }[loadRatioStatus(ratio)];
}

function fmt1(v) { return v % 1 === 0 ? String(v) : v.toFixed(1); }

/* ----------------------------------------------------------
   Hero: Week Score ring + change vs last week + slice bars
   ---------------------------------------------------------- */
function buildHeroCard(data, prev) {
  const score = data.weekScore;
  const band  = scoreBand(score);
  const R = 52, C = 2 * Math.PI * R;
  const dash = (Math.max(0, Math.min(100, score)) / 100) * C;

  let deltaHtml = `<span class="chip chip-none">No last week to compare</span>`;
  if (prev) {
    const d   = score - prev.weekScore;
    const dir = d > 0 ? 'up' : d < 0 ? 'down' : 'same';
    const cls = d > 0 ? 'chip-good' : d < 0 ? 'chip-bad' : 'chip-none';
    deltaHtml = `<span class="chip ${cls}">${STATUS_ARROW[dir]} ${d > 0 ? '+' : ''}${d} vs last week</span>`;
  }

  const slices = [
    { key: 'training',   label: 'Training', col: DASH_CAT.training },
    { key: 'recovery',   label: 'Recovery', col: DASH_CAT.recovery },
    { key: 'dietFood',   label: 'Food',     col: DASH_CAT.diet },
    { key: 'dietDrinks', label: 'Drinks',   col: '#C2410C' },
    { key: 'body',       label: 'Body',     col: DASH_CAT.body },
  ].map(({ key, label, col }) => {
    const s   = data.breakdown[key];
    const pct = s.na ? 0 : Math.round((s.pts / s.max) * 100);
    const val = s.na ? '<span class="slice-na">n/a</span>' : `${fmt1(s.pts)}<span class="slice-max">/${s.max}</span>`;
    return `
      <div class="slice-row">
        <div class="slice-label"><span class="slice-dot" style="background:${col};"></span>${label}</div>
        <div class="slice-track"><div class="slice-fill" style="width:${pct}%;background:${col};"></div></div>
        <div class="slice-val mono">${val}</div>
      </div>`;
  }).join('');

  const div = document.createElement('div');
  div.className = 'card dash-hero';
  div.innerHTML = `
    <div class="hero-top">
      <div class="ring-wrap">
        <svg viewBox="0 0 128 128" class="ring" aria-hidden="true">
          <circle cx="64" cy="64" r="${R}" class="ring-track"/>
          <circle cx="64" cy="64" r="${R}" class="ring-fill ring-${band}"
            stroke-dasharray="${dash.toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 64 64)"/>
        </svg>
        <div class="ring-centre">
          <div class="ring-num mono band-${band}">${score}</div>
          <div class="ring-sub">/ 100</div>
        </div>
      </div>
      <div class="hero-side">
        <div class="hero-title">Week Score</div>
        ${data.isComplete ? '' : '<span class="badge badge-blue">In progress</span>'}
        <div style="margin-top:10px;">${deltaHtml}</div>
      </div>
    </div>
    <div class="slices">${slices}</div>`;
  return div;
}

/* ----------------------------------------------------------
   Metric tiles (2 per row)
   ---------------------------------------------------------- */
function buildMetricGrid(data, prev) {
  const ratio = data.ratio;
  /* Total load: higher is better while the ratio is 1.5 or under;
     above that (spike) a drop is the better direction */
  const loadDir = ratio !== null && ratio > CONFIG.loadRatio.amberMax ? -1 : 1;

  const defs = [
    { label: 'Total load', cat: 'training', dir: loadDir, pct: true,
      v: d => d.totalLoad, fmt: fmt1 },
    { label: 'Load ratio', cat: 'training', zone: true,
      v: d => d.ratio, fmt: v => v.toFixed(2), dfmt: d => Math.abs(d).toFixed(2) },
    { label: 'Recovery score', cat: 'recovery', dir: 1,
      v: d => d.recoveryScore, unit: '/ 100' },
    { label: 'Avg time in bed', cat: 'recovery', dir: 1,
      v: d => d.avgHoursInBed, fmt: fmtHours, dfmt: d => `${Math.round(Math.abs(d) * 60)}m` },
    { label: 'Avg wake feeling', cat: 'recovery', dir: 1,
      v: d => d.avgWakeFeeling, fmt: v => v.toFixed(1), unit: '/ 5', dfmt: d => Math.abs(d).toFixed(1) },
    { label: 'Gym sessions', cat: 'training', dir: 1,
      v: d => d.gymSessions.total },
    { label: 'Pitch sessions', cat: 'training', dir: 1,
      v: d => d.pitchSessions.total },
    { label: 'Cardio minutes', cat: 'training', dir: 1,
      v: d => d.cardioMinutes, unit: 'min' },
    { label: 'Avg daily steps', cat: 'training', dir: 1,
      v: d => d.avgSteps, fmt: v => v.toLocaleString('en-IE'),
      dfmt: d => Math.round(Math.abs(d)).toLocaleString('en-IE'),
      sub: d => `${d.stepsDaysLogged} of 7 days logged` },
    { label: 'Takeaway Damage', cat: 'diet', dir: -1,
      v: d => d.takeawayDamage, unit: 'pts' },
    { label: 'Drinks points', cat: 'diet', dir: -1,
      v: d => d.drinksPoints, unit: 'pts' },
    { label: 'Avg bodyweight', cat: 'body', dir: -1,
      v: d => d.avgWeight, fmt: v => v.toFixed(1), unit: 'kg', dfmt: d => `${Math.abs(d).toFixed(1)} kg` },
  ];

  const tiles = defs.map(def => {
    const cur  = def.v(data);
    const prv  = prev ? def.v(prev) : null;
    const has  = cur !== null && cur !== undefined;
    const hasP = prv !== null && prv !== undefined;
    const fmt  = def.fmt  || (v => String(v));
    const dfmt = def.dfmt || (d => fmt1(round1(Math.abs(d))));

    /* Change chip: arrow + amount, coloured better / worse / none */
    let status = 'none', chip;
    if (has && hasP) {
      const diff = cur - prv;
      const same = Math.abs(diff) < 0.005;
      const dir  = same ? 'same' : diff > 0 ? 'up' : 'down';
      let amount;
      if (same)                     amount = 'Same';
      else if (def.pct && prv > 0)  amount = `${Math.round(Math.abs(diff / prv) * 100)}%`;
      else                          amount = dfmt(diff);
      if (def.zone)   status = ratioZone(cur);
      else if (!same) status = (diff > 0) === (def.dir > 0) ? 'good' : 'bad';
      chip = `<span class="chip chip-${status}">${STATUS_ARROW[dir]} ${amount}</span>`;
    } else if (def.zone && has) {
      status = ratioZone(cur);
      chip = `<span class="chip chip-${status}">● ${ratioZoneLabel(cur)}</span>`;
    } else {
      chip = `<span class="chip chip-none">No last week</span>`;
    }

    let sub = def.sub ? def.sub(data) : '';
    if (def.zone) {
      sub = has
        ? ratioZoneLabel(cur)
        : data.weeksToBaseline > 0 && data.weeksWithLoad > 0
          ? `Baseline building, ${data.weeksToBaseline} week${data.weeksToBaseline > 1 ? 's' : ''} to go`
          : 'Needs a previous week';
    }

    const big = has
      ? `${fmt(cur)}${def.unit ? `<span class="mtile-unit">${def.unit}</span>` : ''}`
      : '<span class="mtile-empty">--</span>';

    return `
      <div class="mtile mtile-${status}" style="--cat:${DASH_CAT[def.cat]};">
        <div class="mtile-label">${def.label}</div>
        <div class="mtile-value mono">${big}</div>
        ${sub ? `<div class="mtile-sub">${sub}</div>` : ''}
        <div class="mtile-chip">${chip}</div>
      </div>`;
  }).join('');

  const div = document.createElement('div');
  div.className = 'mtile-grid';
  div.innerHTML = tiles;
  return div;
}

/* ----------------------------------------------------------
   How scores work (collapsed by default)
   ---------------------------------------------------------- */
function buildHowScoresCard() {
  const st = CONFIG.steps, lr = CONFIG.loadRatio, ws = CONFIG.weekScore;
  const ds = CONFIG.dietScore, rs = CONFIG.recoveryScore, rc = CONFIG.recovery;
  const bw = CONFIG.bodyWeight;
  const perDay = st.multiplier / 7;
  const eg10k  = computeDailyStepsLoad(10000);

  const div = document.createElement('div');
  div.className = 'card how-scores';
  div.innerHTML = `
    <details>
      <summary>How scores work</summary>
      <div class="how-body">
        <h4>Training load</h4>
        <p>Load = minutes x RPE / 10.</p>

        <h4>Steps load</h4>
        <p>Each day: max(0, steps - ${st.baseline.toLocaleString('en-IE')}) / ${st.divisor.toLocaleString('en-IE')}
          x ${fmt1(round2(perDay))} (weekly multiplier ${st.multiplier} / 7).
          10,000 steps = ${fmt1(round1(eg10k))} load that day, 10,000 every day = ${fmt1(round1(eg10k * 7))} for the week.
          Days with no steps logged count as 0. Avg daily steps uses only the days logged.</p>

        <h4>Load ratio</h4>
        <p>This week's total load / average total load of the previous 4 weeks.
          ${lr.greenMin} to ${lr.greenMax} green (building), ${lr.greenMax} to ${lr.amberMax} amber (pushing hard),
          under ${lr.greenMin} coasting, over ${lr.amberMax} red (spike).</p>

        <h4>Recovery score (0 to 100)</h4>
        <p>Sleep ${rs.sleepWeight}: avg hours in bed / ${rs.sleepTarget} x ${rs.sleepWeight}, capped.
          Wake feeling ${rs.wakeWeight}: avg / 5 x ${rs.wakeWeight}.
          Recovery work ${rs.workWeight}: sauna ${rs.saunaPoints} (min / ${rc.saunaTargetMin}),
          cold ${rs.coldPoints} (sessions / ${rc.coldTargetSessions}),
          stretch ${rs.stretchPoints} (min / ${rc.stretchTargetMin}), each capped.</p>

        <h4>Week Score (0 to 100)</h4>
        <p>Training ${ws.training}: full at ratio ${lr.greenMin} to ${lr.greenMax}, falls to 0 at ${lr.coastMin},
          to 20 at ${lr.amberMax}, to 0 at ${lr.redMax}.<br>
          Recovery ${ws.recovery}: recovery score x 0.3.<br>
          Food ${ws.dietFood}: Takeaway Damage ${ds.foodGreenMax} or under = full, falls to 0 at ${ds.foodRedMin}.<br>
          Drinks ${ws.dietDrinks}: ${ds.drinksGreenMax} or under = full, falls to 0 at ${ds.drinksRedMin}.<br>
          Body ${ws.body}: weekly weight change. Down ${bw.targetLossMin} to ${bw.targetLossMax} kg = 10,
          down more = 6, down 0 to ${bw.targetLossMin} = 6, up 0 to ${bw.targetLossMin} = 3, up more = 0.<br>
          A slice that is n/a is left out and the score is scaled to 100.</p>
        <p>Score colour: 80+ green, 60 to 79 amber, under 60 red.</p>

        <h4>Tile colours</h4>
        <p>Green = better than last week, red = worse, grey = no change or nothing to compare.
          Lower is better for Takeaway Damage, drinks points and bodyweight. Total load counts as better
          going up while the load ratio is ${lr.amberMax} or under. Load ratio is coloured by zone.</p>
      </div>
    </details>`;
  return div;
}

/* ----------------------------------------------------------
   Daily load chart (this week vs last week)
   ---------------------------------------------------------- */
function buildDailyChart(data, prevData) {
  /* Daily totals include training and steps load */
  const days      = weekDays(data.mondayStr);
  const thisLoads = data.dailyLoads;
  const lastLoads = prevData.dailyLoads;
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
    <div class="card-title">Daily load (training + steps)</div>
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
    div.innerHTML = `<div class="card-title">Where the load came from</div>
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
  div.innerHTML = `<div class="card-title">Where the load came from</div>${rowsHtml}`;
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

  body.querySelector('#week-export')?.addEventListener('click', async () => {
    try { await doExport(); } catch (e) { showToast('Export failed.', 'error'); }
  });
}

/* ----------------------------------------------------------
   Swipe between weeks (in addition to the arrow buttons).
   Swipe right = previous week, swipe left = next week.
   Attached once; the week body element is never replaced.
   ---------------------------------------------------------- */
(function attachWeekSwipe() {
  const body = document.getElementById('week-body');
  if (!body) return;
  let x0 = null, y0 = null;
  body.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) { x0 = null; return; }
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY;
  }, { passive: true });
  body.addEventListener('touchend', e => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0;
    const dy = e.changedTouches[0].clientY - y0;
    x0 = null;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 2) return;
    if (dx > 0) {
      _weekMonday = addWeeks(_weekMonday, -1); renderWeek();
    } else {
      const next = addWeeks(_weekMonday, 1);
      if (next <= weekStartStr(todayStr())) { _weekMonday = next; renderWeek(); }
    }
  }, { passive: true });
})();

/* round1 / fmtHours / addWeeks / weekDays / weekStartStr
   are all defined in score.js / sleep.js (loaded earlier). */
