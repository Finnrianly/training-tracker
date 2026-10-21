/* ============================================================
   GOALS ENGINE
   Goal definitions live in localStorage ("tt_goals"). Progress
   is never stored: it is worked out from raw logs every time,
   so editing or deleting an entry always flows through.

   Goal shape:
     { id, name, kind: 'weekly'|'monthly'|'yearly'|'deadline',
       metric: { key, sessionTypes?, hours?, direction? },
       target, start, end?, archived?, archivedOn?, manualLog?: [{date, delta}] }
   ============================================================ */

const GOAL_KINDS = {
  weekly:   { label: 'Weekly',   unit: 'week'  },
  monthly:  { label: 'Monthly',  unit: 'month' },
  yearly:   { label: 'Yearly',   unit: 'year'  },
  deadline: { label: 'Deadline', unit: null    },
};

/* Session types: count(e) = how many sessions this entry adds */
const isSub = (...subs) => e => e.type === 'training' && subs.includes(e.subtype) ? 1 : 0;
const isGym = t => e => e.type === 'training' && e.subtype === 'gym' && e.gymType === t ? 1 : 0;
const SESSION_TYPES = {
  fullBody:      { label: 'Full body',  count: isGym('fullBody') },
  accessory:     { label: 'Accessory',  count: isGym('accessory') },
  abs:           { label: 'Abs',        count: isGym('abs') },
  pitchTraining: { label: 'Football/Hurling training', count: isSub('footballTraining', 'hurlingTraining') },
  matches:       { label: 'Matches',    count: isSub('footballMatch', 'hurlingMatch') },
  run:           { label: 'Run',        count: isSub('run') },
  conditioning:  { label: 'Conditioning', count: isSub('conditioning') },
  gymCardio:     { label: 'Gym cardio', count: isSub('gymCardio') },
  padel:         { label: 'Padel/Tennis', count: isSub('padel') },
  golf:          { label: 'Golf',       count: isSub('golf') },
  sauna:         { label: 'Sauna',      count: e => e.type === 'recovery' && e.saunaMin > 0 ? 1 : 0 },
  cold:          { label: 'Cold water', count: e => e.type === 'recovery' ? (e.coldSessions || 0) : 0 },
  stretch:       { label: 'Stretching', count: e => e.type === 'recovery' && e.stretchMin > 0 ? 1 : 0 },
};

/* mode: count = cumulative, more is better; limit = at most X;
         level = an average or weight compared to the target */
const sumBy = (es, f) => es.reduce((s, e) => s + f(e), 0);
const avgOrNull = arr => arr.length ? avg(arr) : null;
const GOAL_METRICS = {
  'weight':           { group: 'Weight', label: 'Weight (weekly average)', unit: 'kg', mode: 'level' },
  'sessions':         { group: 'Sessions', label: 'Session count', unit: 'sessions', mode: 'count', whole: true },
  'total:cardioMin':  { group: 'Totals', label: 'Cardio minutes', unit: 'min', mode: 'count',
                        value: es => weekCardioMinutes(es) },
  'total:kmRun':      { group: 'Totals', label: 'Km run', unit: 'km', mode: 'count',
                        value: es => round1(sumBy(es, e => e.subtype === 'run' ? (e.km || 0) : 0)) },
  'total:load':       { group: 'Totals', label: 'Total load', unit: 'load', mode: 'count',
                        value: es => weekTotalLoad(es) },
  'total:saunaMin':   { group: 'Totals', label: 'Sauna minutes', unit: 'min', mode: 'count',
                        value: es => sumBy(es, e => e.type === 'recovery' ? (e.saunaMin || 0) : 0) },
  'total:stretchMin': { group: 'Totals', label: 'Stretch minutes', unit: 'min', mode: 'count',
                        value: es => sumBy(es, e => e.type === 'recovery' ? (e.stretchMin || 0) : 0) },
  'total:steps':      { group: 'Totals', label: 'Steps', unit: 'steps', mode: 'count', whole: true,
                        value: es => sumBy(Object.values(stepsByDate(es)), s => s) },
  'avg:steps':        { group: 'Averages', label: 'Avg daily steps', unit: 'steps', mode: 'level', whole: true,
                        value: es => { const v = avgOrNull(Object.values(stepsByDate(es))); return v === null ? null : Math.round(v); } },
  'avg:bedHours':     { group: 'Averages', label: 'Avg time in bed', unit: 'h', mode: 'level',
                        value: es => avgOrNull(es.filter(e => e.type === 'sleep' && e.hoursInBed > 0).map(e => e.hoursInBed)) },
  'avg:wake':         { group: 'Averages', label: 'Avg wake feeling', unit: '/ 5', mode: 'level',
                        value: es => avgOrNull(es.filter(e => e.type === 'sleep' && e.wakeFeeling > 0).map(e => e.wakeFeeling)) },
  'nights':           { group: 'Sleep', label: 'Nights in bed at least X hours', unit: 'nights', mode: 'count', whole: true },
  'limit:takeaway':   { group: 'Limits', label: 'Takeaway Damage (at most)', unit: 'pts', mode: 'limit', whole: true,
                        value: es => weekTakeawayDamage(es) },
  'limit:drinks':     { group: 'Limits', label: 'Drinks points (at most)', unit: 'pts', mode: 'limit', whole: true,
                        value: es => weekDrinksPoints(es) },
  'manual':           { group: 'Manual', label: 'Manual count (+1 / -1)', unit: '', mode: 'count', whole: true },
};

/* ----------------------------------------------------------
   Date helpers
   ---------------------------------------------------------- */
function addDays(dateStr, n) {
  const d = strToDate(dateStr);
  d.setDate(d.getDate() + n);
  return dateToStr(d);
}
const minDate = (a, b) => a < b ? a : b;
const maxDate = (a, b) => a > b ? a : b;
function fmtDay(dateStr) {
  const d = strToDate(dateStr);
  return `${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`;
}
function endOfMonth(dateStr) {
  const d = strToDate(dateStr);
  return dateToStr(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

/* The weekly / monthly / yearly period containing dateStr */
function periodBounds(kind, dateStr) {
  const d = strToDate(dateStr);
  if (kind === 'weekly') {
    const from = weekStartStr(dateStr);
    return { from, to: addDays(from, 6), label: fmtDay(from) };
  }
  if (kind === 'monthly') {
    const from = dateToStr(new Date(d.getFullYear(), d.getMonth(), 1));
    return { from, to: endOfMonth(from), label: `${MONTH_SHORT[d.getMonth()]} ${d.getFullYear()}` };
  }
  return { from: `${d.getFullYear()}-01-01`, to: `${d.getFullYear()}-12-31`, label: String(d.getFullYear()) };
}

/* ----------------------------------------------------------
   Formatting
   ---------------------------------------------------------- */
function goalMetric(goal) { return GOAL_METRICS[goal.metric.key]; }

function fmtGoalValue(goal, v) {
  if (v === null || v === undefined) return '--';
  const k = goal.metric.key;
  if (k === 'avg:bedHours') return fmtHours(v);
  if (k === 'avg:steps' || k === 'total:steps') return Math.round(v).toLocaleString('en-IE');
  if (k === 'weight') return v.toFixed(1);
  return v % 1 === 0 ? String(v) : v.toFixed(1);
}

function fmtPace(v) {
  if (Math.abs(v) >= 100) return Math.round(v).toLocaleString('en-IE');
  return v % 1 === 0 ? String(v) : v.toFixed(1);
}

function goalUnit(goal) {
  const u = goalMetric(goal).unit;
  return u ? ` ${u}` : '';
}

/* One-line description: what is tracked and how */
function describeGoal(goal) {
  const m = goalMetric(goal);
  let what = m.label;
  if (goal.metric.key === 'sessions') {
    what = (goal.metric.sessionTypes || []).map(t => SESSION_TYPES[t]?.label).filter(Boolean).join(' + ');
  } else if (goal.metric.key === 'nights') {
    what = `Nights with ${goal.metric.hours}h+ in bed`;
  } else if (goal.metric.key === 'weight') {
    what = `Weight ${goal.metric.direction === 'up' ? 'up' : 'down'} to ${goal.target} kg`;
  }
  const when = goal.kind === 'deadline'
    ? `${fmtDay(goal.start)} to ${fmtDay(goal.end)} ${strToDate(goal.end).getFullYear()}`
    : GOAL_KINDS[goal.kind].label;
  return `${what} · ${when}`;
}

/* ----------------------------------------------------------
   Raw value of a goal's metric over [from, to]
   ---------------------------------------------------------- */
function goalValue(goal, entries, from, to) {
  const k  = goal.metric.key;
  if (k === 'manual') {
    return sumBy((goal.manualLog || []).filter(l => l.date >= from && l.date <= to), l => l.delta);
  }
  const es = entriesBetween(entries, from, to);
  if (k === 'weight') {
    return avgOrNull(es.filter(e => e.type === 'bodyweight').map(e => e.kg));
  }
  if (k === 'sessions') {
    const types = (goal.metric.sessionTypes || []).map(t => SESSION_TYPES[t]).filter(Boolean);
    return sumBy(es, e => sumBy(types, t => t.count(e)));
  }
  if (k === 'nights') {
    return es.filter(e => e.type === 'sleep' && e.hoursInBed >= goal.metric.hours).length;
  }
  return GOAL_METRICS[k].value(es);
}

/* Weekly weight averages, oldest first: [{ monday, avg, count }] */
function weeklyWeightAverages(entries) {
  const byWeek = {};
  entries.filter(e => e.type === 'bodyweight' && typeof e.kg === 'number').forEach(e => {
    const m = weekStartStr(e.date);
    (byWeek[m] = byWeek[m] || []).push(e.kg);
  });
  return Object.keys(byWeek).sort().map(m => ({ monday: m, avg: round2(avg(byWeek[m])), count: byWeek[m].length }));
}

/* ----------------------------------------------------------
   Evaluate a goal over one window [from, to] as of today.
   Status: done | on | slight | behind | missed | pending
   "slight" = within 10% of straight-line pace.
   ---------------------------------------------------------- */
const SLIGHT = 0.9;

function evalWindow(goal, entries, from, to, today, opts = {}) {
  const m        = goalMetric(goal);
  const T        = goal.target;
  const asOf     = minDate(today, to);
  const total    = daysDiff(from, to) + 1;
  const elapsed  = today < from ? 0 : Math.min(total, daysDiff(from, asOf) + 1);
  const frac     = elapsed / total;
  const ended    = today > to;
  const daysLeft = ended ? 0 : daysDiff(maxDate(today, from), to) + 1;
  const weeksLeft = Math.max(daysLeft, 1) / 7;
  const weeksIn   = Math.max(elapsed, 1) / 7;
  const unit = goalUnit(goal);
  const fv   = v => fmtGoalValue(goal, v);
  const base = { from, to, ended, daysLeft, total, elapsed, frac };

  /* Weight with a deadline: progress from the start weight to the target */
  if (goal.metric.key === 'weight' && opts.progress) {
    return evalWeightProgress(goal, entries, base, today);
  }

  if (m.mode === 'count') {
    const v = goalValue(goal, entries, from, asOf);
    const text = `${fv(v)} / ${fv(T)}${unit}`;
    const r = { ...base, value: v, text, bar: Math.min(1, Math.max(0, v / T)) };
    const remaining = T - v;
    r.needPerWeek   = remaining / weeksLeft;
    r.actualPerWeek = v / weeksIn;
    if (v >= T)            return { ...r, status: 'done',    line: `${text}. Done` };
    if (ended)             return { ...r, status: 'missed',  line: `Finished ${text}. Missed` };
    if (elapsed === 0)     return { ...r, status: 'pending', line: `${text}. Starts ${fmtDay(from)}` };
    const ratio = v / (T * frac);
    const status = ratio >= 1 ? 'on' : ratio >= SLIGHT ? 'slight' : 'behind';
    const need = daysLeft <= 7
      ? `${fv(round1(remaining))} more by ${fmtDay(to)}`
      : `${fmtPace(round1(r.needPerWeek))} a week from now`;
    const line = status === 'on'
      ? `${text}. You need ${daysLeft <= 7 ? need : `${fmtPace(round1(r.needPerWeek))} this week`}. On track so far`
      : status === 'slight'
        ? `${text}. You need ${need}. Slightly behind`
        : `${text}. Behind: you need ${need} to make it`;
    return { ...r, status, line };
  }

  if (m.mode === 'limit') {
    const v = goalValue(goal, entries, from, asOf);
    const text = `${fv(v)} / ${fv(T)}${unit} max`;
    const r = { ...base, value: v, text, bar: Math.min(1, v / T), limit: true };
    r.needPerWeek   = Math.max(0, T - v) / weeksLeft;   /* allowed from now */
    r.actualPerWeek = v / weeksIn;
    if (v > T)         return { ...r, status: ended ? 'missed' : 'behind', line: `${text}. Over the limit` };
    if (ended)         return { ...r, status: 'done',    line: `${text}. Kept under` };
    if (elapsed === 0) return { ...r, status: 'pending', line: `${text}. Starts ${fmtDay(from)}` };
    const allowed = T * frac;
    const status = v <= allowed ? 'on' : v <= allowed / SLIGHT ? 'slight' : 'behind';
    const keep = daysLeft <= 7
      ? `no more than ${fv(T - v)} by ${fmtDay(to)}`
      : `${fmtPace(round1(r.needPerWeek))} a week from now`;
    const tail = { on: 'On track so far', slight: 'Slightly behind', behind: 'Behind' }[status];
    return { ...r, status, line: `${text}. Keep to ${keep}. ${tail}` };
  }

  /* level: an average (or weight) compared to the target */
  const v = goalValue(goal, entries, from, asOf);
  const lower = goal.metric.key === 'weight' && goal.metric.direction !== 'up';
  const text = `${fv(v)}${unit} (target ${fv(T)})`;
  const r = { ...base, value: v, text, level: true };
  if (v === null) {
    return { ...r, text: `-- (target ${fv(T)}${unit})`, bar: 0,
      status: ended ? 'missed' : 'pending', line: ended ? 'No data logged. Missed' : 'No data yet' };
  }
  r.bar = Math.min(1, lower ? T / v : v / T);
  const meets = lower ? v <= T : v >= T;
  if (ended) return { ...r, status: meets ? 'done' : 'missed', line: `${text}. ${meets ? 'Done' : 'Missed'}` };
  /* Weight: within 0.5 kg counts as slightly behind; other levels within 10% */
  const close = goal.metric.key === 'weight' ? Math.abs(v - T) <= 0.5 : (lower ? v <= T / SLIGHT : v >= T * SLIGHT);
  const status = meets ? 'on' : close ? 'slight' : 'behind';
  return { ...r, status,
    line: `So far ${text}. ${{ on: 'On track', slight: 'Slightly behind', behind: 'Behind' }[status]}` };
}

/* Start weight: weekly average of the start week, else the latest before
   it, else the first after. Current: the latest weekly average. */
function evalWeightProgress(goal, entries, base, today) {
  const T     = goal.target;
  const down  = goal.metric.direction !== 'up';
  const weeks = weeklyWeightAverages(entries.filter(e => e.date <= minDate(today, base.to)));
  const startMon = weekStartStr(base.from);
  const startWk  = weeks.find(w => w.monday === startMon)
    || [...weeks].reverse().find(w => w.monday < startMon)
    || weeks.find(w => w.monday > startMon);
  const cur = weeks[weeks.length - 1];
  const r = { ...base, weight: true };
  if (!startWk || !cur) {
    return { ...r, value: null, bar: 0, text: `-- (target ${T.toFixed(1)} kg)`,
      status: base.ended ? 'missed' : 'pending', line: 'No weigh-ins yet' };
  }
  const s = startWk.avg, c = cur.avg, dir = down ? -1 : 1;
  const goalAmt = (T - s) * dir;
  const doneAmt = (c - s) * dir;
  const text = `${c.toFixed(1)} kg now (start ${s.toFixed(1)}, target ${T.toFixed(1)})`;
  Object.assign(r, { value: c, start: s, text,
    bar: goalAmt > 0 ? Math.min(1, Math.max(0, doneAmt / goalAmt)) : 1,
    needPerWeek:   (T - c) / (Math.max(base.daysLeft, 1) / 7),
    actualPerWeek: (c - s) / (Math.max(base.elapsed, 1) / 7) });
  const reached = down ? c <= T : c >= T;
  if (reached)          return { ...r, status: 'done',   line: `${text}. Done` };
  if (base.ended)       return { ...r, status: 'missed', line: `Finished at ${c.toFixed(1)} kg. Missed` };
  if (base.elapsed === 0) return { ...r, status: 'pending', line: `${text}. Starts ${fmtDay(base.from)}` };
  const expected = goalAmt * base.frac;
  const ratio = expected > 0 ? doneAmt / expected : 1;
  const status = ratio >= 1 ? 'on' : ratio >= SLIGHT ? 'slight' : 'behind';
  const need = `${r.needPerWeek > 0 ? '+' : ''}${r.needPerWeek.toFixed(2)} kg a week`;
  r.line = status === 'on' ? `${text}. You need ${need}. On track so far`
    : status === 'slight' ? `${text}. You need ${need}. Slightly behind`
    : `${text}. Behind: you need ${need} from now to make it`;
  r.status = status;
  /* Too-fast warning (same 0.75 kg/week limit as the Body slice) */
  if (down && -r.needPerWeek > CONFIG.bodyWeight.targetLossMax) {
    r.warning = 'Pace too fast, risk of losing strength. Consider a later date.';
  }
  return r;
}

/* ----------------------------------------------------------
   Full evaluation for a goal card
   ---------------------------------------------------------- */
function evaluateGoal(goal, entries, today = todayStr()) {
  const stopAt = goal.archived && goal.archivedOn ? minDate(today, goal.archivedOn) : today;

  if (goal.kind === 'deadline') {
    const cur = evalWindow(goal, entries, goal.start, goal.end, stopAt, { progress: true });
    /* Monthly milestone for goals over 6 weeks, on a straight line */
    if (cur.total > 42 && !cur.ended && cur.status !== 'done' && cur.elapsed > 0) {
      const eom = endOfMonth(stopAt);
      if (eom < goal.end) {
        const f = (daysDiff(goal.start, eom) + 1) / cur.total;
        let x;
        if (cur.weight) x = `${(cur.start + (goal.target - cur.start) * f).toFixed(1)} kg`;
        else if (goalMetric(goal).mode === 'count') {
          const raw = goal.target * f;
          x = `${goalMetric(goal).whole ? Math.ceil(raw) : fmtPace(round1(raw))}${goalUnit(goal)}`;
        }
        if (x) cur.milestone = `This month: reach ${x} by ${fmtDay(eom)} to stay on track`;
      }
    }
    const finished = cur.ended || cur.status === 'done';
    return { goal, current: cur, status: cur.status, finished,
      result: finished ? cur.line : null };
  }

  /* Recurring: every period from the start date's period to now */
  const periods = [];
  let p = periodBounds(goal.kind, goal.start);
  while (p.from <= stopAt) {
    periods.push({ ...p, ...evalWindow(goal, entries, p.from, p.to, stopAt) });
    p = periodBounds(goal.kind, addDays(p.to, 1));
  }
  const current = periods[periods.length - 1];
  const past    = periods.filter(x => x.ended);
  const hits    = past.filter(x => x.status === 'done').length;

  let streak = 0;
  for (let i = past.length - 1; i >= 0 && past[i].status === 'done'; i--) streak++;
  if (current && !current.ended && current.status === 'done') streak++;
  let best = 0, run = 0;
  periods.forEach(x => { run = x.status === 'done' ? run + 1 : 0; best = Math.max(best, run); });

  const unit = GOAL_KINDS[goal.kind].unit;
  const plural = n => `${n} ${unit}${n === 1 ? '' : 's'}`;
  return { goal, current, status: current ? current.status : 'pending', periods, past, hits, streak, best,
    finished: false,
    result: `Hit ${hits} of ${plural(past.length)}${best ? `, best streak ${plural(best)}` : ''}` };
}

/* Archive = archived by hand, or a deadline goal that is done or past its date */
function isGoalArchived(ev) {
  return !!ev.goal.archived || ev.finished;
}

/* Earliest date any goal needs entries from */
function goalsEarliestStart(goals) {
  const starts = goals.map(g => g.kind === 'deadline' ? g.start : periodBounds(g.kind, g.start).from);
  /* Weight progress may look back for a start weight */
  return starts.length ? addDays(starts.reduce(minDate), -56) : todayStr();
}

const STATUS_CHIP = {
  done:    ['chip-good', '✓ Done'],
  on:      ['chip-good', 'On track'],
  slight:  ['chip-warn', 'Slightly behind'],
  behind:  ['chip-bad',  'Behind'],
  missed:  ['chip-bad',  'Missed'],
  pending: ['chip-none', 'Not started'],
};
function goalChip(status) {
  const [cls, label] = STATUS_CHIP[status] || STATUS_CHIP.pending;
  return `<span class="chip ${cls}">${label}</span>`;
}
