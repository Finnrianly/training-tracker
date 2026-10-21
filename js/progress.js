/* ============================================================
   PROGRESS SCREEN
   Two views: Weight | Goals
   ============================================================ */

let _progView    = 'weight';
let _weightRange = '8';      /* '4' | '8' | '12' | 'all' (weeks) */
let _goalFilter  = 'all';    /* 'all' | weekly | monthly | yearly | deadline */

SCREEN_RENDERERS['progress'] = renderProgress;

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ----------------------------------------------------------
   Main render
   ---------------------------------------------------------- */
async function renderProgress() {
  const body = document.getElementById('progress-body');
  const scrollTop = body.scrollTop;

  try {
    const entries = await getAllEntries();
    const today   = todayStr();
    const evals   = loadGoals().map(g => evaluateGoal(g, entries, today));

    const frag = document.createDocumentFragment();
    frag.appendChild(buildProgTabs());
    if (_progView === 'weight') buildWeightView(entries, evals).forEach(el => frag.appendChild(el));
    else                        buildGoalsView(evals).forEach(el => frag.appendChild(el));

    body.innerHTML = '';
    body.appendChild(frag);
    body.scrollTop = scrollTop;
    attachProgressHandlers(entries, evals);
  } catch (err) {
    body.innerHTML = `<div class="card"><p class="text-secondary">Error: ${err.message}</p></div>`;
  }
}

function buildProgTabs() {
  const div = document.createElement('div');
  div.innerHTML = `
    <div style="display:flex;gap:6px;padding:2px 0;">
      ${[['weight', 'Weight'], ['goals', 'Goals']].map(([v, l]) => `
        <button class="pill${_progView === v ? ' selected' : ''}" data-prog-view="${v}"
          style="flex:1;justify-content:center;">${l}</button>`).join('')}
    </div>`;
  return div.firstElementChild;
}

/* ============================================================
   WEIGHT
   ============================================================ */
function buildWeightView(entries, evals) {
  const weighIns = entries.filter(e => e.type === 'bodyweight' && typeof e.kg === 'number')
    .sort((a, b) => a.date.localeCompare(b.date));

  if (!weighIns.length) {
    return [emptyCard('No weigh-ins yet. Log your morning weight on Today to see it here.')];
  }

  const today = todayStr();
  const from  = _weightRange === 'all'
    ? weighIns[0].date
    : addWeeks(weekStartStr(today), -(parseInt(_weightRange) - 1));
  const points  = weighIns.filter(e => e.date >= from);
  const weeks   = weeklyWeightAverages(points);
  const targets = evals.filter(ev => ev.goal.metric.key === 'weight' && !isGoalArchived(ev))
    .map(ev => ({ name: ev.goal.name, kg: ev.goal.target }));

  const ranges = [['4', '4w'], ['8', '8w'], ['12', '12w'], ['all', 'All']].map(([v, l]) =>
    `<button class="pill${_weightRange === v ? ' selected' : ''}" data-weight-range="${v}">${l}</button>`).join('');

  const chart = document.createElement('div');
  chart.className = 'card';
  chart.innerHTML = `
    <div class="flex-between" style="margin-bottom:10px;">
      <div class="card-title" style="margin:0;">Weight</div>
      <div class="pill-group">${ranges}</div>
    </div>
    ${points.length ? weightChartSvg(points, weeks, targets, from, today)
      : '<p class="text-secondary" style="font-size:13px;">No weigh-ins in this range.</p>'}
    <div class="wchart-legend">
      <span><i class="lg-dot"></i>Weigh-in (tap to edit)</span>
      <span><i class="lg-line"></i>Weekly average</span>
      ${targets.length ? '<span><i class="lg-dash"></i>Goal</span>' : ''}
    </div>`;

  return [chart, buildWeightTiles(weeks)];
}

/* Dots for every weigh-in, a weekly average line, dashed goal targets */
function weightChartSvg(points, weeks, targets, from, today) {
  const W = 340, H = 190, L = 36, R = 10, T = 10, B = 24;
  const t0 = strToDate(minDate(from, points[0].date)).getTime();
  const t1 = Math.max(strToDate(today).getTime(), t0 + 86400000);
  const kgs = [...points.map(p => p.kg), ...weeks.map(w => w.avg), ...targets.map(t => t.kg)];
  let lo = Math.floor(Math.min(...kgs) - 0.5), hi = Math.ceil(Math.max(...kgs) + 0.5);
  if (hi - lo < 2) { lo -= 1; hi += 1; }
  const x = d => L + (strToDate(d).getTime() - t0) / (t1 - t0) * (W - L - R);
  const y = kg => T + (hi - kg) / (hi - lo) * (H - T - B);

  const step = Math.max(1, Math.round((hi - lo) / 4));
  const grid = [];
  for (let v = lo; v <= hi; v += step) {
    grid.push(`<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="wc-grid"/>
      <text x="${L - 6}" y="${y(v) + 3}" class="wc-ylab">${v}</text>`);
  }
  const fromStr = dateToStr(new Date(t0));
  const midStr  = dateToStr(new Date((t0 + t1) / 2));
  const xlabs = [[fromStr, 'start'], [midStr, 'middle'], [today, 'end']].map(([d, a]) =>
    `<text x="${x(d)}" y="${H - 6}" text-anchor="${a}" class="wc-xlab">${fmtDay(d)}</text>`).join('');

  /* Weekly average plotted mid-week (Thursday), kept inside the chart */
  const avgPts = weeks.map(w => {
    const d = maxDate(minDate(addDays(w.monday, 3), today), dateToStr(new Date(t0)));
    return `${x(d).toFixed(1)},${y(w.avg).toFixed(1)}`;
  }).join(' ');

  const goalLines = targets.map(t => `
    <line x1="${L}" x2="${W - R}" y1="${y(t.kg)}" y2="${y(t.kg)}" class="wc-goal"/>
    <text x="${W - R}" y="${y(t.kg) - 4}" text-anchor="end" class="wc-goal-lab">Goal ${t.kg} kg</text>`).join('');

  const dots = points.map(p => `
    <circle cx="${x(p.date).toFixed(1)}" cy="${y(p.kg).toFixed(1)}" r="3.5" class="wc-dot"/>
    <circle cx="${x(p.date).toFixed(1)}" cy="${y(p.kg).toFixed(1)}" r="12" class="wc-hit" data-weigh-id="${p.id}">
      <title>${fmtDay(p.date)}: ${p.kg} kg</title></circle>`).join('');

  return `<svg viewBox="0 0 ${W} ${H}" class="wchart" role="img" aria-label="Weight chart">
    ${grid.join('')}${xlabs}${goalLines}
    ${weeks.length > 1 ? `<polyline points="${avgPts}" class="wc-avg"/>` : ''}
    ${dots}
  </svg>`;
}

function buildWeightTiles(weeks) {
  const div = document.createElement('div');
  div.className = 'mtile-grid';
  if (!weeks.length) return div;

  const first = weeks[0], last = weeks[weeks.length - 1];
  const change  = round2(last.avg - first.avg);
  const spanWks = daysDiff(first.monday, last.monday) / 7;
  const perWeek = spanWks > 0 ? round2(change / spanWks) : null;
  const lowest  = weeks.reduce((m, w) => w.avg < m.avg ? w : m);
  /* Down = green, up = red */
  const cls  = v => v === null || v === 0 ? 'none' : v < 0 ? 'good' : 'bad';
  const sign = v => `${v > 0 ? '+' : ''}${v.toFixed(2)}`;

  const tiles = [
    { label: 'Start weight', v: first.avg.toFixed(1), unit: 'kg', sub: `Week of ${fmtDay(first.monday)}` },
    { label: 'Current', v: last.avg.toFixed(1), unit: 'kg', sub: `Weekly avg, ${fmtDay(last.monday)}` },
    { label: 'Total change', v: sign(change), unit: 'kg', status: cls(change) },
    { label: 'Avg change per week', v: perWeek === null ? '--' : sign(perWeek), unit: perWeek === null ? '' : 'kg',
      status: cls(perWeek), sub: perWeek === null ? 'Needs 2 weeks' : '' },
    { label: 'Lowest weekly avg', v: lowest.avg.toFixed(1), unit: 'kg', sub: `Week of ${fmtDay(lowest.monday)}` },
  ];
  div.innerHTML = tiles.map(t => `
    <div class="mtile mtile-${t.status || 'none'}" style="--cat:${DASH_CAT.body};">
      <div class="mtile-label">${t.label}</div>
      <div class="mtile-value mono">${t.v}${t.unit ? `<span class="mtile-unit">${t.unit}</span>` : ''}</div>
      ${t.sub ? `<div class="mtile-sub">${t.sub}</div>` : ''}
    </div>`).join('');
  return div;
}

function openWeighInModal(entry) {
  const c = document.createElement('div');
  c.innerHTML = `
    <div class="form-row">
      <span class="form-label">${fmtDate(entry.date)}</span>
      <div style="display:flex;align-items:center;gap:8px;">
        <input type="number" step="0.1" min="30" max="250" class="input-field input-field-sm"
          id="wi-kg" value="${entry.kg}" style="width:84px;">
        <span class="text-secondary">kg</span>
      </div>
    </div>
    <button class="btn btn-primary btn-full mt-12" id="wi-save">Save</button>
    <button class="btn btn-ghost btn-full" id="wi-delete" style="color:var(--red);margin-top:6px;">Delete weigh-in</button>`;
  openModal({ title: 'Weigh-in', content: c });
  c.querySelector('#wi-save').addEventListener('click', async () => {
    const kg = parseFloat(c.querySelector('#wi-kg').value);
    if (!kg || kg < 20 || kg > 300) return showToast('Enter a valid weight.', 'error');
    await putEntry({ ...entry, kg });
    closeModal(); showToast('Weigh-in updated.'); renderProgress();
  });
  c.querySelector('#wi-delete').addEventListener('click', () =>
    confirmAction(`Delete the ${entry.kg} kg weigh-in on ${fmtDate(entry.date)}?`, async () => {
      await deleteEntry(entry.id);
      showToast('Weigh-in deleted.'); renderProgress();
    }));
}

/* ============================================================
   GOALS
   ============================================================ */
function buildGoalsView(evals) {
  const match  = ev => _goalFilter === 'all' || ev.goal.kind === _goalFilter;
  const active = evals.filter(ev => !isGoalArchived(ev) && match(ev));
  const arch   = evals.filter(ev => isGoalArchived(ev) && match(ev));

  const top = document.createElement('div');
  top.innerHTML = `
    <div class="pill-group" style="margin-bottom:8px;">
      ${[['all', 'All'], ...Object.entries(GOAL_KINDS).map(([k, v]) => [k, v.label])].map(([v, l]) =>
        `<button class="pill${_goalFilter === v ? ' selected' : ''}" data-goal-filter="${v}">${l}</button>`).join('')}
    </div>
    <button class="btn btn-primary btn-full" id="goal-new">+ New goal</button>`;

  const out = [top];
  if (!active.length) out.push(emptyCard(_goalFilter === 'all' ? 'No active goals. Tap New goal to add one.' : 'No active goals of this kind.'));
  active.forEach(ev => out.push(goalCard(ev)));

  const archive = document.createElement('div');
  archive.className = 'card how-scores';
  archive.innerHTML = `
    <details>
      <summary>Archive (${arch.length})</summary>
      <div class="how-body">
        ${arch.length ? arch.map(archivedRow).join('') : '<p>Completed, expired and archived goals appear here.</p>'}
      </div>
    </details>`;
  out.push(archive);
  return out;
}

function statusClass(status) {
  return { done: 'good', on: 'good', slight: 'warn', behind: 'bad', missed: 'bad' }[status] || 'none';
}

function goalCard(ev) {
  const g = ev.goal, cur = ev.current;
  const div = document.createElement('div');
  div.className = 'card goal-card';
  if (!cur) { div.innerHTML = `<div class="goal-name">${escapeHtml(g.name)}</div>`; return div; }

  let extra = '';
  if (g.kind === 'deadline') {
    if (cur.needPerWeek !== undefined && cur.status !== 'done') {
      const u = cur.weight ? ' kg' : '';
      const f = v => cur.weight ? `${v > 0 ? '+' : ''}${v.toFixed(2)}` : fmtPace(round1(v));
      extra += `
        <div class="goal-stats">
          <div><b class="mono">${cur.daysLeft}</b><span>day${cur.daysLeft === 1 ? '' : 's'} left</span></div>
          <div><b class="mono">${f(cur.needPerWeek)}${u}</b><span>${cur.limit ? 'allowed' : 'needed'} / week</span></div>
          <div><b class="mono">${f(cur.actualPerWeek)}${u}</b><span>so far / week</span></div>
        </div>`;
    }
    if (cur.milestone) extra += `<div class="goal-note">${cur.milestone}</div>`;
    if (cur.warning)   extra += `<div class="goal-note goal-warn">⚠ ${cur.warning}</div>`;
  } else {
    const unit = GOAL_KINDS[g.kind].unit;
    const dots = ev.past.slice(-12).map(p =>
      `<span class="goal-dot ${p.status === 'done' ? 'hit' : 'miss'}" title="${p.label}: ${p.status === 'done' ? 'hit' : 'missed'}"></span>`).join('');
    extra += `
      <div class="goal-hist">
        ${dots ? `<div class="goal-dots">${dots}</div>` : `<span class="text-secondary">No past ${unit}s yet</span>`}
        <span class="goal-streak">Streak <b>${ev.streak}</b> · Hit ${ev.hits} of ${ev.past.length}</span>
      </div>`;
  }

  const manual = g.metric.key === 'manual' ? `
    <div class="counter-control">
      <button class="counter-btn" data-goal-inc="-1" data-goal-id="${g.id}" aria-label="Minus one">${SVG_MINUS}</button>
      <button class="counter-btn" data-goal-inc="1" data-goal-id="${g.id}" aria-label="Plus one">${SVG_PLUS}</button>
    </div>` : '';

  div.innerHTML = `
    <div class="goal-head">
      <div style="min-width:0;">
        <div class="goal-name">${escapeHtml(g.name)}</div>
        <div class="goal-sub">${escapeHtml(describeGoal(g))}</div>
      </div>
      ${goalChip(cur.status)}
    </div>
    ${g.kind !== 'deadline' ? `<div class="goal-period">This ${GOAL_KINDS[g.kind].unit} (${cur.label})</div>` : ''}
    <div class="goal-bar"><div class="goal-fill fill-${statusClass(cur.status)}" style="width:${Math.round(cur.bar * 100)}%;"></div></div>
    <div class="goal-line">${cur.line}</div>
    ${extra}
    <div class="goal-actions">
      ${manual}
      <span style="flex:1;"></span>
      <button class="btn btn-ghost btn-sm" data-goal-edit="${g.id}">Edit</button>
      <button class="btn btn-ghost btn-sm" data-goal-archive="${g.id}">Archive</button>
    </div>`;
  return div;
}

function archivedRow(ev) {
  const g = ev.goal;
  const why = g.archived ? 'Archived' : ev.status === 'done' ? 'Completed' : 'Expired';
  return `
    <div class="goal-arch">
      <div class="goal-head">
        <div style="min-width:0;">
          <div class="goal-name">${escapeHtml(g.name)}</div>
          <div class="goal-sub">${escapeHtml(describeGoal(g))} · ${why}</div>
        </div>
        ${g.kind === 'deadline' ? goalChip(ev.status) : ''}
      </div>
      <div class="goal-line">${ev.result || ''}</div>
      <div class="goal-actions">
        <span style="flex:1;"></span>
        <button class="btn btn-ghost btn-sm" data-goal-edit="${g.id}">Edit</button>
        ${g.archived ? `<button class="btn btn-ghost btn-sm" data-goal-restore="${g.id}">Restore</button>` : ''}
        <button class="btn btn-ghost btn-sm" data-goal-delete="${g.id}" style="color:var(--red);">Delete</button>
      </div>
    </div>`;
}

/* ----------------------------------------------------------
   Goal editor (create and edit). Rendered once: taps only
   toggle selections, so typed values are never wiped.
   ---------------------------------------------------------- */
function openGoalEditor(existing) {
  const g = existing ? JSON.parse(JSON.stringify(existing)) : {
    kind: 'weekly', target: '', start: todayStr(), end: '',
    metric: { key: 'sessions', sessionTypes: [] },
  };
  g.metric.sessionTypes = g.metric.sessionTypes || [];
  let kind = g.kind, dir = g.metric.direction || 'down';
  const types = new Set(g.metric.sessionTypes);

  const groups = {};
  Object.entries(GOAL_METRICS).forEach(([k, m]) => (groups[m.group] = groups[m.group] || []).push([k, m]));
  const metricOpts = Object.entries(groups).map(([grp, list]) => `
    <optgroup label="${grp}">${list.map(([k, m]) =>
      `<option value="${k}"${g.metric.key === k ? ' selected' : ''}>${m.label}</option>`).join('')}</optgroup>`).join('');

  const c = document.createElement('div');
  c.innerHTML = `
    <div class="goal-form">
      <label class="goal-field"><span>Name</span>
        <input type="text" id="g-name" class="input-field" maxlength="60" value="${escapeHtml(g.name || '')}"
          placeholder="e.g. 10k avg daily steps"></label>
      <div class="goal-field"><span>Kind</span>
        <div class="pill-group">${Object.entries(GOAL_KINDS).map(([k, v]) =>
          `<button class="pill" data-g-kind="${k}">${v.label}</button>`).join('')}</div></div>
      <label class="goal-field"><span>Tracks</span>
        <select id="g-metric" class="input-field">${metricOpts}</select></label>
      <div class="goal-field" id="g-types-wrap"><span>Session types (tick any)</span>
        <div class="pill-group">${Object.entries(SESSION_TYPES).map(([k, t]) =>
          `<button class="pill" data-g-type="${k}">${t.label}</button>`).join('')}</div></div>
      <label class="goal-field" id="g-hours-wrap"><span>Hours in bed, at least</span>
        <input type="number" id="g-hours" class="input-field input-field-sm" step="0.25" min="1" max="14"
          value="${g.metric.hours ?? 8}"></label>
      <div class="goal-field" id="g-dir-wrap"><span>Direction</span>
        <div class="pill-group">
          <button class="pill" data-g-dir="down">Down</button>
          <button class="pill" data-g-dir="up">Up</button>
        </div></div>
      <label class="goal-field"><span id="g-target-label">Target</span>
        <div style="display:flex;align-items:center;gap:8px;">
          <input type="number" id="g-target" class="input-field input-field-sm" step="any" min="0"
            value="${g.target}" style="width:110px;">
          <span id="g-unit" class="text-secondary"></span>
        </div></label>
      <label class="goal-field"><span id="g-start-label">Start date</span>
        <input type="date" id="g-start" class="input-field" value="${g.start}"></label>
      <label class="goal-field" id="g-end-wrap"><span>End date</span>
        <input type="date" id="g-end" class="input-field" value="${g.end || ''}"></label>
      <button class="btn btn-primary btn-full mt-12" id="g-save">${existing ? 'Save goal' : 'Create goal'}</button>
      ${existing ? `<button class="btn btn-ghost btn-full" id="g-delete" style="color:var(--red);margin-top:6px;">Delete goal</button>` : ''}
    </div>`;
  openModal({ title: existing ? 'Edit goal' : 'New goal', content: c });

  const $ = s => c.querySelector(s);
  function sync() {
    const key = $('#g-metric').value, m = GOAL_METRICS[key];
    $('#g-types-wrap').style.display = key === 'sessions' ? '' : 'none';
    $('#g-hours-wrap').style.display = key === 'nights'   ? '' : 'none';
    $('#g-dir-wrap').style.display   = key === 'weight'   ? '' : 'none';
    $('#g-end-wrap').style.display   = kind === 'deadline' ? '' : 'none';
    $('#g-start-label').textContent  = kind === 'deadline' ? 'Start date' : 'Track from';
    $('#g-target-label').textContent = m.mode === 'limit' ? 'At most'
      : key === 'weight' ? 'Target weight'
      : m.mode === 'level' ? `Target average${kind === 'deadline' ? '' : ` per ${GOAL_KINDS[kind].unit}`}`
      : kind === 'deadline' ? 'Target' : `Target per ${GOAL_KINDS[kind].unit}`;
    $('#g-unit').textContent = m.unit;
    c.querySelectorAll('[data-g-kind]').forEach(b => b.classList.toggle('selected', b.dataset.gKind === kind));
    c.querySelectorAll('[data-g-type]').forEach(b => b.classList.toggle('selected', types.has(b.dataset.gType)));
    c.querySelectorAll('[data-g-dir]').forEach(b => b.classList.toggle('selected', b.dataset.gDir === dir));
  }
  sync();

  $('#g-metric').addEventListener('change', sync);
  c.querySelectorAll('[data-g-kind]').forEach(b => b.addEventListener('click', () => { kind = b.dataset.gKind; sync(); }));
  c.querySelectorAll('[data-g-dir]').forEach(b => b.addEventListener('click', () => { dir = b.dataset.gDir; sync(); }));
  c.querySelectorAll('[data-g-type]').forEach(b => b.addEventListener('click', () => {
    types.has(b.dataset.gType) ? types.delete(b.dataset.gType) : types.add(b.dataset.gType);
    sync();
  }));

  $('#g-save').addEventListener('click', () => {
    const key    = $('#g-metric').value;
    const name   = $('#g-name').value.trim();
    const target = parseFloat($('#g-target').value);
    const start  = $('#g-start').value;
    const end    = $('#g-end').value;
    if (!name)                       return showToast('Give the goal a name.', 'error');
    if (!(target > 0))               return showToast('Enter a target above 0.', 'error');
    if (!start)                      return showToast('Pick a start date.', 'error');
    if (key === 'sessions' && !types.size) return showToast('Tick at least one session type.', 'error');
    if (kind === 'deadline' && !end) return showToast('Pick an end date.', 'error');
    if (kind === 'deadline' && end <= start) return showToast('End date must be after the start date.', 'error');

    const metric = { key };
    if (key === 'sessions') metric.sessionTypes = [...types];
    if (key === 'nights')   metric.hours = parseFloat($('#g-hours').value) || 8;
    if (key === 'weight')   metric.direction = dir;

    const goal = { ...g, id: g.id || `goal-${Date.now().toString(36)}`, name, kind, metric, target, start };
    if (kind === 'deadline') goal.end = end; else delete goal.end;
    if (key !== 'manual') delete goal.manualLog;

    const goals = loadGoals();
    const i = goals.findIndex(x => x.id === goal.id);
    if (i >= 0) goals[i] = goal; else goals.push(goal);
    saveGoals(goals);
    closeModal(); showToast(existing ? 'Goal saved.' : 'Goal created.'); renderProgress();
  });

  $('#g-delete')?.addEventListener('click', () => confirmDeleteGoal(g.id, g.name));
}

function confirmDeleteGoal(id, name) {
  confirmAction(`Delete "${escapeHtml(name)}"? This cannot be undone.`, () => {
    saveGoals(loadGoals().filter(x => x.id !== id));
    showToast('Goal deleted.'); renderProgress();
  });
}

function updateGoal(id, fn) {
  const goals = loadGoals();
  const g = goals.find(x => x.id === id);
  if (!g) return;
  fn(g);
  saveGoals(goals);
}

/* ----------------------------------------------------------
   Event handlers
   ---------------------------------------------------------- */
function attachProgressHandlers(entries, evals) {
  const body = document.getElementById('progress-body');
  const on = (sel, fn) => body.querySelectorAll(sel).forEach(el => el.addEventListener('click', () => fn(el)));

  on('[data-prog-view]',    el => { _progView = el.dataset.progView; renderProgress(); });
  on('[data-weight-range]', el => { _weightRange = el.dataset.weightRange; renderProgress(); });
  on('[data-goal-filter]',  el => { _goalFilter = el.dataset.goalFilter; renderProgress(); });
  on('[data-weigh-id]', el => {
    const entry = entries.find(e => e.id === el.getAttribute('data-weigh-id'));
    if (entry) openWeighInModal(entry);
  });

  body.querySelector('#goal-new')?.addEventListener('click', () => openGoalEditor());
  const goalById = id => loadGoals().find(g => g.id === id);
  on('[data-goal-edit]', el => { const g = goalById(el.dataset.goalEdit); if (g) openGoalEditor(g); });
  on('[data-goal-archive]', el => {
    updateGoal(el.dataset.goalArchive, g => { g.archived = true; g.archivedOn = todayStr(); });
    showToast('Goal archived.'); renderProgress();
  });
  on('[data-goal-restore]', el => {
    updateGoal(el.dataset.goalRestore, g => { delete g.archived; delete g.archivedOn; });
    showToast('Goal restored.'); renderProgress();
  });
  on('[data-goal-delete]', el => {
    const g = goalById(el.dataset.goalDelete);
    if (g) confirmDeleteGoal(g.id, g.name);
  });

  /* Manual goals: +1 / -1 logged on today's date; never below 0 this period */
  on('[data-goal-inc]', el => {
    const delta = parseInt(el.dataset.goalInc);
    const ev = evals.find(x => x.goal.id === el.dataset.goalId);
    if (delta < 0 && !(ev?.current?.value > 0)) return;
    updateGoal(el.dataset.goalId, g => (g.manualLog = g.manualLog || []).push({ date: todayStr(), delta }));
    renderProgress();
  });
}

/* ----------------------------------------------------------
   Compact strip of active goals for the Today screen
   ---------------------------------------------------------- */
function goalShortText(ev) {
  const g = ev.goal, cur = ev.current;
  if (!cur) return '';
  const fv = v => fmtGoalValue(g, v);
  if (cur.weight) return cur.value === null ? '--' : `${cur.value.toFixed(1)} → ${g.target} kg`;
  if (cur.level)  return `${fv(cur.value)} / ${fv(g.target)}${goalUnit(g)}`;
  return `${fv(cur.value)} / ${fv(g.target)}${cur.limit ? ' max' : ''}`;
}

function buildGoalsStrip(evals) {
  const active = evals.filter(ev => !isGoalArchived(ev));
  const div = document.createElement('div');
  div.className = 'card goal-strip';
  div.setAttribute('role', 'button');
  div.id = 'goals-strip';
  div.innerHTML = `
    <div class="card-title">Goals</div>
    ${active.map(ev => `
      <div class="goal-strip-row">
        <span class="goal-strip-name">${escapeHtml(ev.goal.name)}</span>
        <span class="goal-strip-val mono">${goalShortText(ev)}</span>
        ${goalChip(ev.status)}
      </div>`).join('')}`;
  return active.length ? div : null;
}
