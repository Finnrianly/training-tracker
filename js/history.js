/* ============================================================
   HISTORY SCREEN
   Three views: Weeks | Months | Trends
   ============================================================ */

let _histView = 'weeks';

SCREEN_RENDERERS['history'] = renderHistory;

/* ----------------------------------------------------------
   Main render
   ---------------------------------------------------------- */
async function renderHistory() {
  const body = document.getElementById('history-body');
  const scrollTop = body.scrollTop;
  body.innerHTML = `<div class="card" style="text-align:center;padding:24px;">
    <span class="text-secondary">Loading...</span></div>`;

  try {
    const all = await getAllEntries();

    if (!all.length) {
      body.innerHTML = `<div class="card" style="text-align:center;padding:32px;">
        <div style="font-size:32px;margin-bottom:12px;">📊</div>
        <div style="font-weight:700;margin-bottom:6px;">No history yet</div>
        <div class="text-secondary" style="font-size:13px;">Start logging on Today and Sleep to build your history.</div>
      </div>`;
      return;
    }

    const weeks = computeAllWeekSummaries(all);

    const frag = document.createDocumentFragment();
    frag.appendChild(buildHistTabs());

    if (_histView === 'weeks')  frag.appendChild(buildWeeksView(weeks));
    if (_histView === 'months') frag.appendChild(buildMonthsView(weeks));
    if (_histView === 'trends') frag.appendChild(buildTrendsView(weeks));

    body.innerHTML = '';
    body.appendChild(frag);
    body.scrollTop = scrollTop;
    attachHistHandlers(weeks);

  } catch (err) {
    body.innerHTML = `<div class="card"><p class="text-secondary">Error: ${err.message}</p></div>`;
  }
}

/* ----------------------------------------------------------
   Tab strip
   ---------------------------------------------------------- */
function buildHistTabs() {
  const div = document.createElement('div');
  div.innerHTML = `
    <div style="display:flex;gap:6px;padding:2px 0 2px;">
      ${['weeks','months','trends'].map(v => `
        <button class="pill${_histView === v ? ' selected' : ''}" data-hist-view="${v}"
          style="flex:1;justify-content:center;">
          ${v.charAt(0).toUpperCase() + v.slice(1)}
        </button>`).join('')}
    </div>`;
  return div.firstElementChild;
}

/* ----------------------------------------------------------
   Compute all week summaries from pre-loaded entries
   ---------------------------------------------------------- */
function computeAllWeekSummaries(allEntries) {
  if (!allEntries.length) return [];

  const dates = allEntries.map(e => e.date).filter(Boolean);
  const earliest = dates.reduce((a, b) => a < b ? a : b);
  const currentMonday = weekStartStr(todayStr());

  const mondays = [];
  let m = weekStartStr(earliest);
  while (m <= currentMonday) { mondays.push(m); m = addWeeks(m, 1); }

  return mondays
    .map(monday => weekSummaryFromEntries(monday, allEntries))
    .filter(ws => ws.hasData)
    .reverse(); /* newest first */
}

function weekSummaryFromEntries(monday, allEntries) {
  const sunday = weekSundayStr(monday);
  const w = allEntries.filter(e => e.date >= monday && e.date <= sunday);

  const trainingLoad = round1(weekTrainingLoad(w));
  const stepsE       = w.find(e => e.type === 'steps');
  const stepsLoad    = stepsE ? round1(computeStepsLoad(stepsE.avgSteps)) : 0;
  const totalLoad    = round1(trainingLoad + stepsLoad);

  /* Load ratio from previous 4 weeks */
  const prevLoads = [1,2,3,4].map(i => {
    const wM = addWeeks(monday, -i), wS = weekSundayStr(wM);
    return weekTotalLoad(allEntries.filter(e => e.date >= wM && e.date <= wS));
  });
  const ratio = computeLoadRatio(totalLoad, prevLoads);

  /* Sleep */
  const sleepE  = w.filter(e => e.type === 'sleep');
  const hoursA  = sleepE.filter(e => e.hoursInBed > 0).map(e => e.hoursInBed);
  const avgHours = hoursA.length ? round2(avg(hoursA)) : null;

  /* Recovery */
  const rec = computeRecoveryScore(sleepE, w.filter(e => e.type === 'recovery'));

  /* Diet */
  const takeawayDmg = weekTakeawayDamage(w);
  const drinksPts   = weekDrinksPoints(w);

  /* Body */
  const wtArrays = [0,1,2,3].map(i => {
    const wM = addWeeks(monday, -i), wS = weekSundayStr(wM);
    return allEntries.filter(e => e.date >= wM && e.date <= wS && e.type === 'bodyweight').map(e => e.kg);
  });
  const bodyRes  = computeBodySlice(wtArrays);
  const avgWt    = wtArrays[0].length ? round2(avg(wtArrays[0])) : null;

  /* Score */
  const trainPts = trainingSlicePoints(ratio);
  const breakdown = {
    training:   { pts: trainPts ?? 0, max: 30, na: trainPts === null },
    recovery:   { pts: Math.round(rec.score * 0.3), max: 30, na: false },
    dietFood:   { pts: dietFoodPoints(takeawayDmg),  max: 22, na: false },
    dietDrinks: { pts: dietDrinksPoints(drinksPts),  max: 8,  na: false },
    body:       { pts: bodyRes.points ?? 0,          max: 10, na: bodyRes.na },
  };
  const weekScore  = computeWeekScore(Object.values(breakdown));
  const isComplete = todayStr() > sunday;

  return {
    monday, sunday, isComplete, hasData: w.length > 0,
    totalLoad, ratio, ratioStatus: loadRatioStatus(ratio),
    avgHoursInBed: avgHours,
    recoveryScore: rec.score,
    takeawayDamage: takeawayDmg,
    drinksPoints: drinksPts,
    avgWeight: avgWt,
    weekScore, breakdown,
    gymSessions: weekGymSessions(w).total,
    cardioMinutes: weekCardioMinutes(w),
  };
}

/* ----------------------------------------------------------
   Weeks view
   ---------------------------------------------------------- */
function buildWeeksView(weeks) {
  if (!weeks.length) {
    return emptyCard('No completed weeks yet.');
  }

  const rows = weeks.map(ws => {
    const mon = strToDate(ws.monday);
    const sun = strToDate(ws.sunday);
    const label = `${mon.getDate()} ${MONTH_SHORT[mon.getMonth()]} - ${sun.getDate()} ${MONTH_SHORT[sun.getMonth()]}`;

    const scoreColor = ws.weekScore >= 80 ? 'var(--green)' : ws.weekScore >= 60 ? 'var(--accent)'
      : ws.weekScore >= 40 ? 'var(--orange)' : 'var(--red)';

    const ratioCol = { green:'var(--green)', amber:'var(--orange)', red:'var(--red)',
      coasting:'var(--text-secondary)', none:'var(--text-secondary)' }[ws.ratioStatus];

    const stats = [
      ws.totalLoad ? `Load ${ws.totalLoad}` : null,
      ws.ratio !== null ? `<span style="color:${ratioCol};">Ratio ${ws.ratio}</span>` : null,
      ws.avgHoursInBed ? `Sleep ${fmtHours(ws.avgHoursInBed)}` : null,
      `Recovery ${ws.recoveryScore}`,
      ws.takeawayDamage ? `Takeaway ${ws.takeawayDamage}` : null,
      ws.drinksPoints ? `Drinks ${ws.drinksPoints}` : null,
      ws.avgWeight ? `${ws.avgWeight} kg` : null,
    ].filter(Boolean).join(' &middot; ');

    return `
      <div class="list-item" data-open-week="${ws.monday}" role="button" tabindex="0"
        style="cursor:pointer;flex-wrap:wrap;gap:4px;padding:12px 0;">
        <div style="width:100%;display:flex;align-items:center;justify-content:space-between;">
          <div>
            <div style="font-size:14px;font-weight:700;color:var(--text);">${label}</div>
            ${!ws.isComplete ? '<span class="badge badge-blue" style="font-size:10px;">In progress</span>' : ''}
          </div>
          <div style="font-family:var(--font-mono);font-size:20px;font-weight:700;color:${scoreColor};">${ws.weekScore}</div>
        </div>
        <div style="font-size:11px;color:var(--text-secondary);width:100%;line-height:1.6;">${stats}</div>
      </div>`;
  }).join('');

  const div = document.createElement('div');
  div.className = 'card';
  div.innerHTML = `<div class="card-title">All weeks</div>${rows}`;
  return div;
}

/* ----------------------------------------------------------
   Monthly view
   ---------------------------------------------------------- */
function buildMonthsView(weeks) {
  const months = groupByMonth(weeks);
  if (!months.length) return emptyCard('No monthly data yet.');

  const cards = months.map(m => {
    const stats = [
      `Avg load ${m.avgLoad}`,
      m.avgSleep ? `Sleep ${fmtHours(m.avgSleep)}` : null,
      `Recovery ${m.avgRecovery}`,
      `Gym ${m.totalGym}`,
      m.totalCardio ? `Cardio ${m.totalCardio}min` : null,
      m.totalTakeaway ? `Takeaway ${m.totalTakeaway}` : null,
      m.avgWeight ? `${m.avgWeight} kg` : null,
    ].filter(Boolean).join(' · ');

    const scoreDisplay = m.avgScore !== null
      ? `<span style="font-family:var(--font-mono);font-size:20px;font-weight:700;color:var(--accent);">${m.avgScore}</span>`
      : `<span style="font-size:13px;color:var(--text-secondary);">--</span>`;

    return `
      <div style="padding:12px 0;border-bottom:1px solid var(--card-border);">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
          <div>
            <div style="font-size:15px;font-weight:700;">${m.label}</div>
            <div style="font-size:11px;color:var(--text-secondary);">${m.weekCount} week${m.weekCount > 1 ? 's' : ''}</div>
          </div>
          ${scoreDisplay}
        </div>
        <div style="font-size:11px;color:var(--text-secondary);line-height:1.6;">${stats}</div>
      </div>`;
  }).join('');

  const div = document.createElement('div');
  div.className = 'card';
  div.innerHTML = `<div class="card-title">Monthly overview</div>${cards.replace(/border-bottom[^;]+;[^"]*"([^"]*last[^"]*)"/g, '')}`;

  /* Remove last divider */
  const lastDivider = div.querySelectorAll('[style*="border-bottom"]');
  if (lastDivider.length) lastDivider[lastDivider.length - 1].style.borderBottom = 'none';
  return div;
}

function groupByMonth(weeks) {
  const map = {};
  weeks.forEach(ws => {
    const d   = strToDate(ws.monday);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    if (!map[key]) map[key] = { year: d.getFullYear(), month: d.getMonth(), weeks: [] };
    map[key].weeks.push(ws);
  });

  return Object.values(map).map(m => {
    const ws = m.weeks;
    const done = ws.filter(w => w.isComplete);
    return {
      label:         `${MONTH_SHORT[m.month]} ${m.year}`,
      year:          m.year,
      month:         m.month,
      weekCount:     ws.length,
      avgScore:      done.length ? Math.round(avg(done.map(w => w.weekScore))) : null,
      avgLoad:       round1(avg(ws.map(w => w.totalLoad))),
      avgSleep:      ws.some(w => w.avgHoursInBed)
                       ? round2(avg(ws.filter(w => w.avgHoursInBed).map(w => w.avgHoursInBed)))
                       : null,
      avgRecovery:   Math.round(avg(ws.map(w => w.recoveryScore))),
      totalTakeaway: ws.reduce((s, w) => s + w.takeawayDamage, 0),
      totalDrinks:   ws.reduce((s, w) => s + w.drinksPoints, 0),
      totalGym:      ws.reduce((s, w) => s + w.gymSessions, 0),
      totalCardio:   ws.reduce((s, w) => s + w.cardioMinutes, 0),
      avgWeight:     ws.some(w => w.avgWeight)
                       ? round2(avg(ws.filter(w => w.avgWeight).map(w => w.avgWeight)))
                       : null,
    };
  }).sort((a, b) => b.year - a.year || b.month - a.month);
}

/* ----------------------------------------------------------
   Trends view (last 12 weeks)
   ---------------------------------------------------------- */
function buildTrendsView(weeks) {
  const recent = weeks.slice(0, 12).reverse(); /* oldest left, newest right */
  if (!recent.length) return emptyCard('Not enough data for trends yet.');

  const charts = [
    { label: 'Week Score',       vals: recent.map(w => w.isComplete ? w.weekScore : null), max: 100, unit: '' },
    { label: 'Total load',       vals: recent.map(w => w.totalLoad),   max: null, unit: '' },
    { label: 'Avg time in bed',  vals: recent.map(w => w.avgHoursInBed), max: 10, unit: 'h',
      low: CONFIG.sleep.lowHoursThreshold },
    { label: 'Takeaway Damage',  vals: recent.map(w => w.takeawayDamage), max: null, unit: '',
      lowerGood: true },
    { label: 'Avg weight (kg)',  vals: recent.map(w => w.avgWeight), max: null, unit: 'kg' },
  ].map(c => buildMiniChart(c, recent)).join('');

  const div = document.createElement('div');
  div.className = 'card';
  div.innerHTML = `<div class="card-title">Last ${recent.length} weeks</div>${charts}`;
  return div;
}

function buildMiniChart({ label, vals, max, unit, low, lowerGood }, weeks) {
  const nonNull = vals.filter(v => v !== null && v !== undefined);
  if (!nonNull.length) return '';

  const dataMax = max || Math.max(...nonNull, 1);
  const labels  = weeks.map(w => {
    const d = strToDate(w.monday);
    return `${d.getDate()}/${d.getMonth() + 1}`;
  });

  const bars = vals.map((v, i) => {
    if (v === null || v === undefined) {
      return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;">
        <div style="flex:1;"></div>
        <div style="width:100%;height:3px;background:var(--card-border);border-radius:1px;"></div>
      </div>`;
    }
    const pct = Math.round(Math.min(100, (v / dataMax) * 100));
    let color = 'var(--accent)';
    if (low && v < low)         color = 'var(--orange)';
    if (lowerGood && v > 2)     color = 'var(--orange)';
    if (!lowerGood && v >= dataMax * 0.8) color = 'var(--green)';

    return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;">
      <div style="font-size:8px;color:var(--text-secondary);font-weight:600;">${v}${unit}</div>
      <div style="flex:1;display:flex;align-items:flex-end;width:100%;">
        <div style="width:100%;height:${Math.max(pct, 4)}%;background:${color};border-radius:2px 2px 0 0;min-height:3px;"></div>
      </div>
    </div>`;
  }).join('');

  return `
    <div style="margin-bottom:16px;">
      <div style="font-size:12px;font-weight:700;color:var(--text-secondary);margin-bottom:6px;">${label}</div>
      <div style="display:flex;align-items:stretch;gap:3px;height:50px;">${bars}</div>
    </div>`;
}

/* ----------------------------------------------------------
   Event handlers
   ---------------------------------------------------------- */
function attachHistHandlers(weeks) {
  const body = document.getElementById('history-body');

  body.querySelectorAll('[data-hist-view]').forEach(btn =>
    btn.addEventListener('click', () => {
      _histView = btn.dataset.histView;
      renderHistory();
    }));

  body.querySelectorAll('[data-open-week]').forEach(row =>
    row.addEventListener('click', () => {
      _weekMonday = row.dataset.openWeek;
      showScreen('week');
    }));
}

/* ----------------------------------------------------------
   Helpers
   ---------------------------------------------------------- */
function emptyCard(msg) {
  const div = document.createElement('div');
  div.className = 'card';
  div.innerHTML = `<p class="text-secondary" style="font-size:13px;padding:8px 0;">${msg}</p>`;
  return div;
}
