/* ============================================================
   SETTINGS SCREEN
   All config values are editable here. Changes write directly
   to CONFIG and persist via saveConfig() (localStorage).
   ============================================================ */

SCREEN_RENDERERS['settings'] = renderSettings;

/* ----------------------------------------------------------
   Main render
   ---------------------------------------------------------- */
function renderSettings() {
  const body = document.getElementById('settings-body');
  const scrollTop = body.scrollTop;

  const frag = document.createDocumentFragment();
  frag.appendChild(buildDataCard());
  frag.appendChild(buildPhaseCard());
  frag.appendChild(buildSampleDataCard());
  frag.appendChild(buildGymCard());
  frag.appendChild(buildActivitiesCard());
  frag.appendChild(buildRecoveryCard());
  frag.appendChild(buildTakeawayCard());
  frag.appendChild(buildDrinksCard());
  frag.appendChild(buildStepsCard());
  frag.appendChild(buildScoreCard());
  frag.appendChild(buildWeeklyChecksSettingsCard());
  frag.appendChild(buildResetCard());

  body.innerHTML = '';
  body.appendChild(frag);
  body.scrollTop = scrollTop;
  attachSettingsHandlers();
}

/* ----------------------------------------------------------
   Section builders
   ---------------------------------------------------------- */

function buildDataCard() {
  const days = daysSinceBackup();
  const backupInfo = days === null
    ? 'No backup yet'
    : days === 0 ? 'Backed up today'
    : `Last backup: ${days} day${days > 1 ? 's' : ''} ago`;
  const warn = days === null || days >= CONFIG.backup.reminderDays;

  return card('Data', `
    <div style="font-size:12px;font-weight:600;color:${warn ? 'var(--orange)' : 'var(--text-secondary)'};margin-bottom:12px;">
      💾 ${backupInfo}
    </div>
    <div class="btn-group">
      <button class="btn btn-secondary" id="s-export">Export backup</button>
      <button class="btn btn-secondary" id="s-import-trigger">Import backup</button>
    </div>
    <input type="file" id="s-import-file" accept=".json"
      style="position:absolute;opacity:0;pointer-events:none;width:0;height:0;">`);
}

/* Phase schedule: each phase runs from its start until the next one starts */
function buildPhaseCard() {
  const sched = [...CONFIG.phases.schedule].sort((a, b) => a.start < b.start ? -1 : 1);
  const rows = sched.map((s, i) => {
    const next = sched[i + 1];
    const until = next ? `Until ${fmtDate(addDays(next.start, -1))}` : 'Onwards';
    return `
      <div class="ph-row" data-idx="${i}">
        <select class="input-field" data-ph="phase" aria-label="Phase">
          ${Object.entries(PHASES).map(([k, v]) => `<option value="${k}" ${k === s.phase ? 'selected' : ''}>${v}</option>`).join('')}
        </select>
        <input type="date" class="input-field" data-ph="start" value="${s.start}" aria-label="Start date">
        <button class="icon-btn" data-ph-remove aria-label="Remove phase">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="ph-end">${until}</div>`;
  }).join('');

  const cur = weekPhaseInfo(weekStartStr(todayStr()));
  return card('Phase schedule', `
    <div style="font-size:12px;color:var(--text-secondary);margin-bottom:6px;">
      The phase sets how the Body slice scores weekly weight change. A week takes the phase in effect
      on its Sunday. Finished weeks keep the phase they were scored under, so editing this only
      changes this week and later.</div>
    <div style="font-size:13px;font-weight:700;margin-bottom:4px;">
      This week: ${PHASES[cur.phase]}${cur.source === 'manual' ? ' (set by you on the Week tab)' : ''}</div>
    ${rows}
    <div class="btn-group" style="margin-top:12px;">
      <button class="btn btn-secondary btn-sm" id="ph-add">Add phase</button>
      <button class="btn btn-ghost btn-sm" id="ph-reset">Reset schedule</button>
    </div>
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-secondary);padding:14px 0 2px;">Body score thresholds (kg a week)</div>
    ${sRow('Cut: target loss from', '', 'bodyScore.cut.lossMin', CONFIG.bodyScore.cut.lossMin, 0, 2, false, '', 0.05)}
    ${sRow('Cut: target loss up to', 'faster = losing too fast', 'bodyScore.cut.lossMax', CONFIG.bodyScore.cut.lossMax, 0, 2, false, '', 0.05)}
    ${sRow('Baseline / Hold / Season: full score within', 'either way', 'bodyScore.steady.inner', CONFIG.bodyScore.steady.inner, 0, 2, false, '', 0.05)}
    ${sRow('Baseline / Hold / Season: 6 pts up to', 'more = 0', 'bodyScore.steady.outer', CONFIG.bodyScore.steady.outer, 0, 2, false, '', 0.05)}
    ${sRow('Reverse: band', 'up within = 10, down within = 8', 'bodyScore.reverse.band', CONFIG.bodyScore.reverse.band, 0, 2, true, '', 0.05)}`);
}

/* Save an edited schedule. Finished weeks are locked to their phase first. */
async function saveSchedule(sched, msg) {
  await lockWeekPhases();
  CONFIG.phases.schedule = sched
    .filter(s => s.start && PHASES[s.phase])
    .sort((a, b) => a.start < b.start ? -1 : 1);
  saveConfig();
  showToast(msg, 'success');
  renderSettings();
}

function buildWeeklyChecksSettingsCard() {
  const b = CONFIG.weeklyChecks.bench, r = CONFIG.weeklyChecks.bronco;
  return card('Weekly checks', `
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-secondary);padding:4px 0 2px;">Bench e1RM (kg x (1 + reps / 30))</div>
    ${sRow('Green from', 'kg e1RM', 'weeklyChecks.bench.green', b.green, 1, 400, false, '', 0.5)}
    ${sRow('Amber from', 'kg e1RM (below = red)', 'weeklyChecks.bench.amber', b.amber, 1, 400, false, '', 0.5)}
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-secondary);padding:10px 0 2px;">Bronco (seconds)</div>
    ${sRow('Green under', `seconds (${fmtMmss(r.green)})`, 'weeklyChecks.bronco.green', r.green, 60, 900)}
    ${sRow('Amber up to', `seconds (${fmtMmss(r.amber)}, slower = red)`, 'weeklyChecks.bronco.amber', r.amber, 60, 900)}
    ${sRow('Best before the app', `seconds (${fmtMmss(r.priorBest)})`, 'weeklyChecks.bronco.priorBest', r.priorBest, 60, 900)}
    ${sRow('Goal', `seconds (${fmtMmss(r.goal)})`, 'weeklyChecks.bronco.goal', r.goal, 60, 900, true)}`);
}

function buildSampleDataCard() {
  return card('Developer', `
    <p style="font-size:13px;color:var(--text-secondary);margin-bottom:12px;">
      Load 6 weeks of realistic fake data to preview every screen before real use begins.
      Existing entries are not removed.
    </p>
    <button class="btn btn-secondary btn-full" id="s-sample">Load sample data</button>`);
}

function buildGymCard() {
  const g = CONFIG.gym;
  return card('Gym defaults', `
    ${sRow('Full body', 'minutes', 'gym.fullBody.minutes', g.fullBody.minutes, 5, 300)}
    ${sRow('Full body', 'RPE', 'gym.fullBody.rpe', g.fullBody.rpe, 1, 10)}
    ${sRow('Accessory', 'minutes', 'gym.accessory.minutes', g.accessory.minutes, 5, 300)}
    ${sRow('Accessory', 'RPE', 'gym.accessory.rpe', g.accessory.rpe, 1, 10)}
    ${sRow('Abs', 'minutes', 'gym.abs.minutes', g.abs.minutes, 5, 300)}
    ${sRow('Abs', 'RPE', 'gym.abs.rpe', g.abs.rpe, 1, 10, true)}`);
}

function buildActivitiesCard() {
  const a = CONFIG.activities;
  return card('Activity defaults', `
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-secondary);padding:6px 0 2px;">Training</div>
    ${sRow('Football training', 'minutes', 'activities.footballTraining.minutes', a.footballTraining.minutes, 5, 300)}
    ${sRow('Football training', 'Light RPE', 'activities.footballTraining.rpe.light', a.footballTraining.rpe.light, 1, 10)}
    ${sRow('Football training', 'Heavy RPE', 'activities.footballTraining.rpe.heavy', a.footballTraining.rpe.heavy, 1, 10)}
    ${sRow('Hurling training', 'minutes', 'activities.hurlingTraining.minutes', a.hurlingTraining.minutes, 5, 300)}
    ${sRow('Hurling training', 'Light RPE', 'activities.hurlingTraining.rpe.light', a.hurlingTraining.rpe.light, 1, 10)}
    ${sRow('Hurling training', 'Heavy RPE', 'activities.hurlingTraining.rpe.heavy', a.hurlingTraining.rpe.heavy, 1, 10)}
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-secondary);padding:10px 0 2px;">Matches</div>
    ${sRow('Football match', 'Came on (min)', 'activities.footballMatch.minutes.cameOn', a.footballMatch.minutes.cameOn, 5, 120)}
    ${sRow('Football match', 'Came on RPE', 'activities.footballMatch.rpe.cameOn', a.footballMatch.rpe.cameOn, 1, 10)}
    ${sRow('Football match', 'Full game (min, incl. warm-up)', 'activities.footballMatch.minutes.fullGame', a.footballMatch.minutes.fullGame, 5, 150)}
    ${sRow('Football match', 'Full game RPE', 'activities.footballMatch.rpe.fullGame', a.footballMatch.rpe.fullGame, 1, 10)}
    ${sRow('Hurling match', 'Came on (min)', 'activities.hurlingMatch.minutes.cameOn', a.hurlingMatch.minutes.cameOn, 5, 120)}
    ${sRow('Hurling match', 'Came on RPE', 'activities.hurlingMatch.rpe.cameOn', a.hurlingMatch.rpe.cameOn, 1, 10)}
    ${sRow('Hurling match', 'Full game (min, incl. warm-up)', 'activities.hurlingMatch.minutes.fullGame', a.hurlingMatch.minutes.fullGame, 5, 150)}
    ${sRow('Hurling match', 'Full game RPE', 'activities.hurlingMatch.rpe.fullGame', a.hurlingMatch.rpe.fullGame, 1, 10)}
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-secondary);padding:10px 0 2px;">Padel / Tennis</div>
    ${sRow('Padel / Tennis', 'minutes', 'activities.padel.minutes', a.padel.minutes, 5, 300)}
    ${sRow('Padel / Tennis', 'Light RPE', 'activities.padel.rpe.light', a.padel.rpe.light, 1, 10)}
    ${sRow('Padel / Tennis', 'Heavy RPE', 'activities.padel.rpe.heavy', a.padel.rpe.heavy, 1, 10)}
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-secondary);padding:10px 0 2px;">Cardio</div>
    ${sRow('Conditioning', 'RPE', 'activities.conditioning.rpe', a.conditioning.rpe, 1, 10)}
    ${sRow('Gym cardio Easy', 'RPE', 'activities.gymCardio.rpe.easy', a.gymCardio.rpe.easy, 1, 10)}
    ${sRow('Gym cardio Moderate', 'RPE', 'activities.gymCardio.rpe.moderate', a.gymCardio.rpe.moderate, 1, 10)}
    ${sRow('Gym cardio Hard', 'RPE', 'activities.gymCardio.rpe.hard', a.gymCardio.rpe.hard, 1, 10)}
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-secondary);padding:10px 0 2px;">Run pace thresholds (sec/km)</div>
    ${sRow('Fast pace (RPE 8)', 'sec/km', 'activities.run.paceThresholds.fast', a.run.paceThresholds.fast, 60, 600, false, 'Under this = RPE 8 (285 = 4:45/km)')}
    ${sRow('Medium pace (RPE 7)', 'sec/km', 'activities.run.paceThresholds.medium', a.run.paceThresholds.medium, 60, 600, true, 'Under this = RPE 7 (330 = 5:30/km)')}`);
}

function buildRecoveryCard() {
  const r = CONFIG.recovery;
  return card('Recovery targets', `
    <div style="font-size:12px;color:var(--text-secondary);margin-bottom:10px;">Minutes or sessions required to earn full score for each component.</div>
    ${sRow('Sauna', 'min for full score', 'recovery.saunaTargetMin', r.saunaTargetMin, 5, 180)}
    ${sRow('Cold water', 'sessions for full score', 'recovery.coldTargetSessions', r.coldTargetSessions, 1, 10)}
    ${sRow('Stretch / mobility', 'min for full score', 'recovery.stretchTargetMin', r.stretchTargetMin, 5, 180, true)}`);
}

function buildTakeawayCard() {
  const t = CONFIG.takeaway.tiers;
  return card('Takeaway tiers', `
    ${sRow('Heavy', 'points', 'takeaway.tiers.heavy.points', t.heavy.points, 1, 10)}
    ${sRow('Medium', 'points', 'takeaway.tiers.medium.points', t.medium.points, 1, 10)}
    ${sRow('Light', 'points', 'takeaway.tiers.light.points', t.light.points, 1, 10, true)}`);
}

function buildDrinksCard() {
  const d = CONFIG.drinks.levels;
  return card('Drinks points', `
    ${sRow('Light (1-4 drinks)', 'points', 'drinks.levels.light.points', d.light.points, 1, 20)}
    ${sRow('Medium (4-8 drinks)', 'points', 'drinks.levels.medium.points', d.medium.points, 1, 20)}
    ${sRow('Heavy (spirits / 8+)', 'points', 'drinks.levels.heavy.points', d.heavy.points, 1, 20, true)}`);
}

function buildStepsCard() {
  const s = CONFIG.steps;
  return card('Steps formula', `
    <div style="font-size:12px;color:var(--text-secondary);margin-bottom:10px;">Daily load = max(0, day's steps - baseline) / divisor x (weekly multiplier / 7)</div>
    ${sRow('Baseline steps', 'per day', 'steps.baseline', s.baseline, 0, 20000)}
    ${sRow('Weekly multiplier', 'per 1000 steps above baseline, a day gets 1/7', 'steps.multiplier', s.multiplier, 1, 100)}
    ${sRow('Divisor', '', 'steps.divisor', s.divisor, 100, 10000, true)}`);
}

function buildScoreCard() {
  const lr = CONFIG.loadRatio;
  const d  = CONFIG.dietScore;
  const sl = CONFIG.sleep;
  return card('Score thresholds', `
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-secondary);padding:4px 0 2px;">Load ratio zones</div>
    ${sRow('Green zone min', '(below = coasting)', 'loadRatio.greenMin', lr.greenMin, 0.1, 2, false, '', 0.05)}
    ${sRow('Green zone max', '(above = amber)', 'loadRatio.greenMax', lr.greenMax, 0.1, 2, false, '', 0.05)}
    ${sRow('Amber zone max', '(above = red)', 'loadRatio.amberMax', lr.amberMax, 0.1, 3, false, '', 0.05)}
    ${sRow('Coasting floor', '(below = 0 training pts)', 'loadRatio.coastMin', lr.coastMin, 0, 1, false, '', 0.05)}
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-secondary);padding:10px 0 2px;">Diet food</div>
    ${sRow('Full score up to (pts)', '', 'dietScore.foodGreenMax', d.foodGreenMax, 0, 20)}
    ${sRow('Zero score at (pts)', '', 'dietScore.foodRedMin', d.foodRedMin, 1, 30)}
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-secondary);padding:10px 0 2px;">Diet drinks</div>
    ${sRow('Full score up to (pts)', '', 'dietScore.drinksGreenMax', d.drinksGreenMax, 0, 20)}
    ${sRow('Zero score at (pts)', '', 'dietScore.drinksRedMin', d.drinksRedMin, 1, 50)}
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-secondary);padding:10px 0 2px;">Sleep</div>
    ${sRow('Low hours threshold', 'hours (bar goes orange below this)', 'sleep.lowHoursThreshold', sl.lowHoursThreshold, 4, 10, false, '', 0.5)}
    ${sRow('Sleep target', 'hours (full recovery score)', 'sleep.targetHours', sl.targetHours, 4, 12, true, '', 0.5)}
    <div style="font-size:12px;color:var(--text-secondary);padding-top:10px;">Body score thresholds are under Phase schedule.</div>`);
}

function buildResetCard() {
  return card('Reset', `
    <p style="font-size:13px;color:var(--text-secondary);margin-bottom:12px;">
      Reset all settings to the original defaults. Your logged data is not affected.
    </p>
    <button class="btn btn-danger btn-full" id="s-reset">Reset to defaults</button>`);
}

/* ----------------------------------------------------------
   Row + card helpers
   ---------------------------------------------------------- */
function card(title, bodyHtml) {
  const div = document.createElement('div');
  div.className = 'card';
  div.innerHTML = `<div class="card-title">${title}</div>${bodyHtml}`;
  return div;
}

/* sRow: one settings row with a number input bound to a CONFIG path */
function sRow(label, unit, path, value, min, max, last = false, sub = '', step = 1) {
  const id  = 'si-' + path.replace(/\./g, '-');
  const borderStyle = last ? 'none' : '1px solid var(--card-border)';
  const subHtml = sub ? `<div class="settings-row-sub">${sub}</div>` : '';
  return `
    <div class="settings-row" style="border-bottom:${borderStyle};">
      <div>
        <div class="settings-row-label">${label}</div>
        ${subHtml || (unit ? `<div class="settings-row-sub">${unit}</div>` : '')}
      </div>
      <input type="number" class="settings-input" id="${id}"
        data-path="${path}" value="${value}" min="${min}" max="${max}" step="${step}">
    </div>`;
}

/* ----------------------------------------------------------
   Event handlers
   ---------------------------------------------------------- */
let _saveTimer = null;

function attachSettingsHandlers() {
  const body = document.getElementById('settings-body');

  /* Config input changes -- debounced save */
  body.querySelectorAll('.settings-input[data-path]').forEach(inp => {
    inp.addEventListener('change', () => handleConfigChange(inp));
    inp.addEventListener('input',  () => handleConfigChange(inp, true));
  });

  /* Export */
  body.querySelector('#s-export')?.addEventListener('click', async () => {
    try { await doExport(); } catch (e) { showToast('Export failed: ' + e.message, 'error'); }
  });

  /* Import */
  body.querySelector('#s-import-trigger')?.addEventListener('click', () => {
    body.querySelector('#s-import-file').click();
  });

  body.querySelector('#s-import-file')?.addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    const reader = new FileReader();
    reader.onload = ev => {
      confirmAction(
        'This will replace all your data with the backup. This cannot be undone.',
        async () => {
          try { await doImport(ev.target.result); }
          catch (err) { showToast('Import failed: ' + err.message, 'error'); }
        }
      );
    };
    reader.readAsText(file);
  });

  /* Phase schedule */
  const sorted = () => [...CONFIG.phases.schedule].sort((a, b) => a.start < b.start ? -1 : 1);
  body.querySelectorAll('.ph-row').forEach(row => {
    const i = +row.dataset.idx;
    row.querySelectorAll('[data-ph]').forEach(el => el.addEventListener('change', () => {
      if (el.dataset.ph === 'start' && !el.value) return;
      const sched = sorted().map(s => ({ ...s }));
      sched[i][el.dataset.ph] = el.value;
      saveSchedule(sched, 'Schedule saved.');
    }));
    row.querySelector('[data-ph-remove]').addEventListener('click', () => {
      if (CONFIG.phases.schedule.length <= 1) return showToast('Keep at least one phase.', 'error');
      const sched = sorted();
      confirmAction(`Remove ${PHASES[sched[i].phase]} from ${fmtDate(sched[i].start)}?`,
        () => saveSchedule(sched.filter((_, j) => j !== i), 'Phase removed.'));
    });
  });
  body.querySelector('#ph-add')?.addEventListener('click', () => {
    const sched = sorted();
    const last  = sched[sched.length - 1];
    const start = last && last.start >= todayStr() ? addDays(last.start, 7) : todayStr();
    saveSchedule([...sched, { phase: 'hold', start }], 'Phase added. Set its type and date.');
  });
  body.querySelector('#ph-reset')?.addEventListener('click', () => {
    confirmAction('Reset the phase schedule to the default dates? Finished weeks keep their phase.',
      () => saveSchedule(deepClone(DEFAULT_CONFIG.phases.schedule), 'Schedule reset.'));
  });

  /* Sample data */
  body.querySelector('#s-sample')?.addEventListener('click', () => loadSampleData());

  /* Reset */
  body.querySelector('#s-reset')?.addEventListener('click', () => {
    confirmAction(
      'Reset all settings to their original defaults?',
      async () => {
        await lockWeekPhases();
        resetConfig();
        showToast('Settings reset to defaults.');
        renderSettings();
      }
    );
  });
}

function handleConfigChange(input, debounce = false) {
  const path = input.dataset.path;
  const raw  = input.value;
  const val  = parseFloat(raw);
  if (raw === '' || isNaN(val)) return;

  setAtPath(CONFIG, path, val);

  if (debounce) {
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(() => {
      saveConfig();
      showToast('Setting saved.', '');
    }, 600);
  } else {
    clearTimeout(_saveTimer);
    saveConfig();
    showToast('Setting saved.', '');
  }
}

/* ----------------------------------------------------------
   CONFIG path helpers
   ---------------------------------------------------------- */
function getAtPath(obj, path) {
  return path.split('.').reduce((o, k) => (o != null ? o[k] : undefined), obj);
}

function setAtPath(obj, path, val) {
  const keys = path.split('.');
  let o = obj;
  for (let i = 0; i < keys.length - 1; i++) o = o[keys[i]];
  o[keys[keys.length - 1]] = val;
}
