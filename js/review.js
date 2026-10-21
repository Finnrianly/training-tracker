/* ============================================================
   MONTHLY REVIEW  (History > Review)
   A week belongs to the month that contains its Thursday, so a
   month is a run of whole weeks. Everything is worked out from
   raw logs with the same scorer as the Week screen.
   ============================================================ */

let _reviewMonth = todayStr().slice(0, 7);   /* "YYYY-MM" */

const MONTH_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

function shiftMonth(key, n) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/* Mondays of the weeks whose Thursday falls in the month */
function monthMondays(key) {
  const [y, m] = key.split('-').map(Number);
  const first = dateToStr(new Date(y, m - 1, 1));
  const last  = dateToStr(new Date(y, m, 0));
  let mon = weekStartStr(first);
  if (addDays(mon, 3) < first) mon = addDays(mon, 7);
  const out = [];
  for (; addDays(mon, 3) <= last; mon = addDays(mon, 7)) out.push(mon);
  return out;
}

/* ----------------------------------------------------------
   Month summary (null when no week of the month has started)
   ---------------------------------------------------------- */
function monthSummary(key, all) {
  const today   = todayStr();
  const mondays = monthMondays(key).filter(m => m <= today);
  if (!mondays.length) return null;

  const from = mondays[0];
  const to   = minDate(weekSundayStr(mondays[mondays.length - 1]), today);
  const es   = entriesBetween(all, from, to);
  const weeks  = mondays.map(m => scoreWeekToDate(m, all));
  const finals = weeks.filter(w => !w.live);
  const nums   = arr => arr.filter(v => v !== null && v !== undefined);
  const avgN   = arr => { const a = nums(arr); return a.length ? avg(a) : null; };

  const sleep   = es.filter(e => e.type === 'sleep');
  const steps   = Object.values(stepsByDate(es));
  const wts     = weeklyWeightAverages(es);
  const wStart  = wts.length ? wts[0].avg : null;
  const wEnd    = wts.length ? wts[wts.length - 1].avg : null;
  const gym     = weekGymSessions(es);

  return {
    key, from, to, weeks, finals,
    qualifies: isQualifyingWeek(es),
    avgWeekScore:   finals.length ? Math.round(avg(finals.map(w => w.weekScore))) : null,
    totalLoad:      weekTotalLoad(es),
    avgWeeklyLoad:  finals.length ? round1(avg(finals.map(w => w.totalLoad))) : null,
    gym,
    pitchSessions:  weekPitchSessions(es).total,
    cardioMinutes:  weekCardioMinutes(es),
    avgHoursInBed:  avgN(sleep.filter(e => e.hoursInBed > 0).map(e => e.hoursInBed)),
    avgWakeFeeling: avgN(sleep.filter(e => e.wakeFeeling > 0).map(e => e.wakeFeeling)),
    avgRecovery:    (v => v === null ? null : Math.round(v))(avgN(weeks.map(w => w.recoveryScore))),
    takeawayDamage: weekTakeawayDamage(es),
    drinksPoints:   weekDrinksPoints(es),
    avgSteps:       steps.length ? Math.round(avg(steps)) : null,
    weightStart:    wStart,
    weightEnd:      wEnd,
    weightChange:   wts.length > 1 ? round2(wEnd - wStart) : null,
  };
}

/* ----------------------------------------------------------
   View
   ---------------------------------------------------------- */
function buildMonthReview(all) {
  const cur  = monthSummary(_reviewMonth, all);
  const prevRaw = monthSummary(shiftMonth(_reviewMonth, -1), all);
  /* Same sufficiency rule as weeks: 3+ days with any log */
  const prev = prevRaw && prevRaw.qualifies ? prevRaw : null;
  const out  = [buildMonthNav(all)];

  if (!cur) { out.push(emptyCard('This month has no weeks yet.')); return out; }

  out.push(buildMonthTiles(cur, prev));
  out.push(buildMonthScoreChart(cur));
  out.push(buildMonthGoals(cur, all));
  return out;
}

function buildMonthNav(all) {
  const [y, m] = _reviewMonth.split('-').map(Number);
  const atNow  = _reviewMonth >= todayStr().slice(0, 7);
  const first  = all.length ? all.map(e => e.date).reduce(minDate).slice(0, 7) : _reviewMonth;
  const atFirst = _reviewMonth <= first;
  const weeks  = monthMondays(_reviewMonth);
  const span   = weeks.length ? `Weeks ${fmtDay(weeks[0])} to ${fmtDay(weekSundayStr(weeks[weeks.length - 1]))}` : '';

  const div = document.createElement('div');
  div.innerHTML = `
    <div class="card" style="display:flex;align-items:center;gap:4px;padding:10px 12px;">
      <button class="icon-btn" id="month-prev" ${atFirst ? 'disabled style="opacity:0.3;"' : ''} aria-label="Previous month">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <div style="flex:1;text-align:center;">
        <div style="font-size:15px;font-weight:700;color:var(--text);">${MONTH_FULL[m - 1]} ${y}</div>
        <div style="font-size:11px;color:var(--text-secondary);">${span}</div>
      </div>
      <button class="icon-btn" id="month-next" ${atNow ? 'disabled style="opacity:0.3;"' : ''} aria-label="Next month">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>
      </button>
    </div>`;
  return div.firstElementChild;
}

/* Tiles in the Week dashboard style, chips vs last month */
function buildMonthTiles(cur, prev) {
  const kg  = v => v.toFixed(1);
  const kgD = d => `${Math.abs(d).toFixed(1)} kg`;
  const defs = [
    { label: 'Avg Week Score', cat: 'training', dir: 1, v: s => s.avgWeekScore, unit: '/ 100',
      sub: s => `${s.finals.length} of ${s.weeks.length} week${s.weeks.length > 1 ? 's' : ''} Final` },
    { label: 'Total load', cat: 'training', dir: 1, pct: true, v: s => s.totalLoad, fmt: fmt1 },
    { label: 'Avg weekly load', cat: 'training', dir: 1, pct: true, v: s => s.avgWeeklyLoad, fmt: fmt1,
      sub: () => 'Final weeks' },
    { label: 'Gym sessions', cat: 'training', dir: 1, whole: true, v: s => s.gym.total,
      sub: s => `Full body ${s.gym.fullBody} · Acc ${s.gym.accessory} · Abs ${s.gym.abs}` },
    { label: 'Pitch sessions', cat: 'training', dir: 1, whole: true, v: s => s.pitchSessions },
    { label: 'Cardio minutes', cat: 'training', dir: 1, v: s => s.cardioMinutes, unit: 'min' },
    { label: 'Avg time in bed', cat: 'recovery', dir: 1, v: s => s.avgHoursInBed, fmt: fmtHours,
      dfmt: d => `${Math.round(Math.abs(d) * 60)}m` },
    { label: 'Avg wake feeling', cat: 'recovery', dir: 1, v: s => s.avgWakeFeeling,
      fmt: v => v.toFixed(1), unit: '/ 5', dfmt: d => Math.abs(d).toFixed(1) },
    { label: 'Avg recovery score', cat: 'recovery', dir: 1, v: s => s.avgRecovery, unit: '/ 100' },
    { label: 'Takeaway Damage', cat: 'diet', dir: -1, whole: true, v: s => s.takeawayDamage, unit: 'pts' },
    { label: 'Drinks points', cat: 'diet', dir: -1, whole: true, v: s => s.drinksPoints, unit: 'pts' },
    { label: 'Avg daily steps', cat: 'training', dir: 1, v: s => s.avgSteps,
      fmt: v => v.toLocaleString('en-IE'), dfmt: d => Math.round(Math.abs(d)).toLocaleString('en-IE') },
    { label: 'Weight, start of month', cat: 'body', dir: -1, v: s => s.weightStart, fmt: kg, unit: 'kg', dfmt: kgD },
    { label: 'Weight, end of month', cat: 'body', dir: -1, v: s => s.weightEnd, fmt: kg, unit: 'kg', dfmt: kgD },
    { label: 'Weight change', cat: 'body', dir: -1, v: s => s.weightChange,
      fmt: v => `${v > 0 ? '+' : ''}${v.toFixed(1)}`, unit: 'kg', dfmt: kgD },
  ];

  const tiles = defs.map(def => {
    const c = def.v(cur), p = prev ? def.v(prev) : null;
    const has = c !== null && c !== undefined, hasP = p !== null && p !== undefined;
    const fmt  = def.fmt  || (v => String(v));
    const dfmt = def.dfmt || (d => fmt1(round1(Math.abs(d))));

    let status = 'none', chip;
    if (!has) {
      chip = `<span class="chip chip-none">n/a</span>`;
    } else if (!hasP) {
      chip = `<span class="chip chip-none">No last month</span>`;
    } else {
      const diff = c - p;
      /* Weight change compares two changes, so judge it on 0.1 kg rather than % */
      const same = def.label === 'Weight change' ? Math.abs(diff) < 0.1 : isNoChange(diff, p, def.whole);
      if (same) {
        chip = `<span class="chip chip-none">${STATUS_ARROW.same} No change</span>`;
      } else {
        status = (diff > 0) === (def.dir > 0) ? 'good' : 'bad';
        const amount = def.pct && p > 0 ? `${Math.round(Math.abs(diff / p) * 100)}%` : dfmt(diff);
        chip = `<span class="chip chip-${status}">${STATUS_ARROW[diff > 0 ? 'up' : 'down']} ${amount}</span>`;
      }
    }
    const sub = def.sub ? def.sub(cur) : '';
    const big = has ? `${fmt(c)}${def.unit ? `<span class="mtile-unit">${def.unit}</span>` : ''}`
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

/* Week Scores of the month; a Live week is drawn faded */
function buildMonthScoreChart(cur) {
  const col = { good: 'var(--dash-good)', warn: 'var(--dash-warn)', bad: 'var(--dash-bad)' };
  const bars = cur.weeks.map(w => `
    <div class="mscore-col">
      <div class="mscore-val mono">${w.weekScore}</div>
      <div class="mscore-track">
        <div class="mscore-bar${w.live ? ' live' : ''}" style="height:${Math.max(3, w.weekScore)}%;background:${col[scoreBand(w.weekScore)]};"></div>
      </div>
      <div class="mscore-lab">${fmtDay(w.mondayStr)}${w.live ? '<br><b>Live</b>' : ''}</div>
    </div>`).join('');
  const div = document.createElement('div');
  div.className = 'card';
  div.innerHTML = `<div class="card-title">Week Scores</div><div class="mscore-chart">${bars}</div>`;
  return div;
}

/* ----------------------------------------------------------
   Goals this month
   Deadline goals: completed (or ended unmet) during the month.
   Recurring: hit / miss for the periods that belong to the month
   (weeks by their Thursday; months and years by their last day).
   ---------------------------------------------------------- */
function buildMonthGoals(cur, all) {
  const [y, m] = cur.key.split('-').map(Number);
  const mFirst = dateToStr(new Date(y, m - 1, 1));
  const mLast  = dateToStr(new Date(y, m, 0));
  const today  = todayStr();
  const rows = [];

  loadGoals().forEach(g => {
    const name = escapeHtml(g.name);
    if (g.kind === 'deadline') {
      const before = evaluateGoal(g, all, addDays(mFirst, -1)).status;
      const atEnd  = evaluateGoal(g, all, minDate(mLast, today));
      if (atEnd.status === 'done' && before !== 'done') {
        rows.push(`<div class="mgoal"><span class="mgoal-name">${name}</span>${goalChip('done')}</div>
          <div class="mgoal-sub">${atEnd.current.line}</div>`);
      } else if (g.end >= mFirst && g.end <= mLast && g.end < today && atEnd.status === 'missed') {
        rows.push(`<div class="mgoal"><span class="mgoal-name">${name}</span>${goalChip('missed')}</div>
          <div class="mgoal-sub">${atEnd.current.line}</div>`);
      }
      return;
    }
    const ev = evaluateGoal(g, all, today);
    const inMonth = (ev.periods || []).filter(p => {
      const key = g.kind === 'weekly' ? addDays(p.from, 3) : p.to;
      return key >= mFirst && key <= mLast;
    });
    if (!inMonth.length) return;
    const done = inMonth.filter(p => p.ended);
    const hits = done.filter(p => p.status === 'done').length;
    const dots = inMonth.map(p => {
      const cls = !p.ended ? 'live' : p.status === 'done' ? 'hit' : 'miss';
      return `<span class="goal-dot ${cls}" title="${p.label}: ${!p.ended ? 'in progress' : p.status === 'done' ? 'hit' : 'missed'}"></span>`;
    }).join('');
    const live = inMonth.length - done.length;
    rows.push(`<div class="mgoal"><span class="mgoal-name">${name}</span><span class="goal-dots">${dots}</span></div>
      <div class="mgoal-sub">${GOAL_KINDS[g.kind].label}: hit ${hits} of ${done.length}${live ? `, ${live} in progress` : ''}</div>`);
  });

  const div = document.createElement('div');
  div.className = 'card';
  div.innerHTML = `<div class="card-title">Goals this month</div>
    ${rows.length ? rows.map(r => `<div class="mgoal-row">${r}</div>`).join('')
      : '<p class="text-secondary" style="font-size:13px;">No goals completed or tracked this month.</p>'}`;
  return div;
}

/* ----------------------------------------------------------
   Navigation: arrows, plus swipe on the History body while
   the Review view is open (attached once; the body persists)
   ---------------------------------------------------------- */
function goMonth(n) {
  const next = shiftMonth(_reviewMonth, n);
  if (next > todayStr().slice(0, 7)) return;
  _reviewMonth = next;
  renderHistory();
}

function attachReviewHandlers() {
  const body = document.getElementById('history-body');
  body.querySelector('#month-prev')?.addEventListener('click', () => goMonth(-1));
  body.querySelector('#month-next')?.addEventListener('click', () => goMonth(1));
}

(function attachReviewSwipe() {
  const body = document.getElementById('history-body');
  if (!body) return;
  let x0 = null, y0 = null;
  body.addEventListener('touchstart', e => {
    if (_histView !== 'review' || e.touches.length !== 1) { x0 = null; return; }
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY;
  }, { passive: true });
  body.addEventListener('touchend', e => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0;
    const dy = e.changedTouches[0].clientY - y0;
    x0 = null;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 2) return;
    /* Swipe right = previous month, left = next month */
    if (dx > 0 && !document.getElementById('month-prev')?.disabled) goMonth(-1);
    if (dx < 0) goMonth(1);
  }, { passive: true });
})();
