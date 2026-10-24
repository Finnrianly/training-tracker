/* ============================================================
   WEEKLY CHECKS  --  card on the Week screen
   Fasted waist, bench top set (e1RM) and Bronco time, saved
   per week in the week record (see setWeekRec in data.js).
   Not part of the Week Score.
   ============================================================ */

/* Weeks (Mondays, oldest first) whose record has a value for field */
function weeksWith(field) {
  const weeks = loadWeeks();
  return Object.keys(weeks).filter(m => typeof weeks[m][field] === 'number').sort();
}

function fmtWeekOf(mondayStr) {
  const d = strToDate(mondayStr);
  return `${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`;
}

/* Grey change chip with arrow, e.g. "▼ 0.8 cm vs last week" */
function checkChangeChip(diff, unit, vs) {
  if (Math.abs(diff) < 0.05) return `<span class="chip chip-none">${STATUS_ARROW.same} No change ${vs}</span>`;
  return `<span class="chip chip-none">${STATUS_ARROW[diff > 0 ? 'up' : 'down']} ${Math.abs(diff).toFixed(1)} ${unit} ${vs}</span>`;
}

/* ----------------------------------------------------------
   Card
   ---------------------------------------------------------- */
function buildWeeklyChecksCard(mondayStr) {
  const div = document.createElement('div');
  div.className = 'card';
  div.id = 'weekly-checks';
  div.innerHTML = `
    <div class="card-title">Weekly checks</div>
    ${waistRowHtml(mondayStr)}
    ${benchRowHtml(mondayStr)}
    ${broncoRowHtml(mondayStr)}`;
  return div;
}

function waistRowHtml(mondayStr) {
  const rec  = getWeekRec(mondayStr);
  const all  = weeksWith('waist');
  const weeks = loadWeeks();
  let chips = '';
  if (typeof rec.waist === 'number') {
    const before = all.filter(m => m < mondayStr);
    const prev   = before[before.length - 1];
    const first  = all[0];
    if (!prev) {
      chips = `<span class="wc-note">First waist logged</span>`;
    } else {
      /* vs the previous logged waist (named by week if not last week), and vs the first */
      const vs = prev === addWeeks(mondayStr, -1) ? 'vs last week' : `vs w/c ${fmtWeekOf(prev)}`;
      chips += checkChangeChip(rec.waist - weeks[prev].waist, 'cm', vs);
      chips += checkChangeChip(rec.waist - weeks[first].waist, 'cm', `vs first (${fmtWeekOf(first)})`);
    }
  }
  return `
    <div class="wc-row">
      <div class="wc-head">
        <div class="form-label">Fasted waist
          <div class="form-sublabel">cm, morning before food</div></div>
        <div class="wc-inputs">
          <input type="number" step="0.1" min="40" max="200" inputmode="decimal"
            class="input-field input-field-sm" id="wc-waist" placeholder="cm"
            value="${rec.waist ?? ''}" style="width:80px;">
        </div>
      </div>
      ${chips ? `<div class="wc-chips">${chips}</div>` : ''}
    </div>`;
}

function benchRowHtml(mondayStr) {
  const rec   = getWeekRec(mondayStr);
  const weeks = loadWeeks();
  const has   = typeof rec.benchKg === 'number' && typeof rec.benchReps === 'number';

  let chip = '';
  if (has) {
    const e = estimated1RM(rec.benchKg, rec.benchReps);
    chip = `<span class="chip chip-${benchBand(e)}">● e1RM ${e.toFixed(1)} kg</span>`;
  }

  /* Last 4 weeks with a full top set, up to this week, newest first */
  const recent = weeksWith('benchKg')
    .filter(m => m <= mondayStr && typeof weeks[m].benchReps === 'number')
    .slice(-4).reverse();
  const list = recent.length ? `
    <div class="wc-list">
      ${recent.map(m => {
        const w = weeks[m], e = estimated1RM(w.benchKg, w.benchReps);
        return `
          <div class="wc-list-row">
            <span class="wc-list-date">${m === mondayStr ? 'This week' : `w/c ${fmtWeekOf(m)}`}</span>
            <span class="mono">${fmt1(w.benchKg)} x ${w.benchReps}</span>
            <span class="wc-e1rm mono band-${benchBand(e)}"><i class="wc-dot dot-${benchBand(e)}"></i>${e.toFixed(1)}</span>
          </div>`;
      }).join('')}
    </div>` : '';

  const c = CONFIG.weeklyChecks.bench;
  return `
    <div class="wc-row">
      <div class="wc-head">
        <div class="form-label">Bench top set
          <div class="form-sublabel">Green ${c.green}+, amber ${c.amber}+</div></div>
        <div class="wc-inputs">
          <input type="number" step="0.5" min="1" max="400" inputmode="decimal"
            class="input-field input-field-sm" id="wc-bench-kg" placeholder="kg"
            value="${rec.benchKg ?? ''}" style="width:72px;">
          <span class="wc-x">x</span>
          <input type="number" step="1" min="1" max="30" inputmode="numeric"
            class="input-field input-field-sm" id="wc-bench-reps" placeholder="reps"
            value="${rec.benchReps ?? ''}" style="width:60px;">
        </div>
      </div>
      ${chip ? `<div class="wc-chips">${chip}</div>` : ''}
      ${list}
    </div>`;
}

function broncoRowHtml(mondayStr) {
  const rec   = getWeekRec(mondayStr);
  const weeks = loadWeeks();
  const c     = CONFIG.weeklyChecks.bronco;
  const logged = weeksWith('broncoSec');

  const loggedBest = logged.length ? Math.min(...logged.map(m => weeks[m].broncoSec)) : null;
  const best   = loggedBest !== null && loggedBest < c.priorBest ? loggedBest : c.priorBest;
  const toGo   = best - c.goal;

  let chip = '';
  if (typeof rec.broncoSec === 'number') {
    const s = rec.broncoSec;
    chip = `<span class="chip chip-${broncoBand(s)}">● ${fmtMmss(s)}</span>`;
    if (s === best && loggedBest === s) chip += `<span class="wc-note wc-pb">Best time</span>`;
  } else {
    const before = logged.filter(m => m < mondayStr);
    const last   = before[before.length - 1];
    if (last) {
      const ago = Math.round(daysDiff(last, mondayStr) / 7);
      chip = `<span class="wc-note">Last ${fmtMmss(weeks[last].broncoSec)}, w/c ${fmtWeekOf(last)}
        (${ago} week${ago === 1 ? '' : 's'} ago)</span>${ago >= 4 ? '<span class="badge badge-blue">Due</span>' : ''}`;
    }
  }

  return `
    <div class="wc-row">
      <div class="wc-head">
        <div class="form-label">Bronco
          <div class="form-sublabel">Optional, about every 4 weeks</div></div>
        <div class="wc-inputs">
          <input type="text" inputmode="numeric" autocomplete="off"
            class="input-field input-field-sm" id="wc-bronco" placeholder="m:ss"
            value="${typeof rec.broncoSec === 'number' ? fmtMmss(rec.broncoSec) : ''}" style="width:80px;">
        </div>
      </div>
      ${chip ? `<div class="wc-chips">${chip}</div>` : ''}
      <div class="goal-stats wc-stats">
        <div><b class="mono">${fmtMmss(best)}</b><span>Best</span></div>
        <div><b class="mono">${fmtMmss(c.goal)}</b><span>Goal</span></div>
        <div><b class="mono">${toGo > 0 ? `${toGo}s` : 'Done'}</b><span>${toGo > 0 ? 'To go' : 'Goal hit'}</span></div>
      </div>
    </div>`;
}

/* ----------------------------------------------------------
   Handlers: each field saves on change (blur or Enter).
   Only this card is redrawn, so the field you move to keeps focus.
   ---------------------------------------------------------- */
function attachWeeklyChecksHandlers(root, mondayStr) {
  const card = root.querySelector('#weekly-checks');
  if (!card) return;

  const num = id => {
    const raw = card.querySelector(id).value.trim();
    return raw === '' ? null : parseFloat(raw);
  };

  const save = (patch, msg) => {
    setWeekRec(mondayStr, patch);
    showToast(msg, 'success');
    /* Redraw after focus has moved to the next field */
    setTimeout(() => {
      const focusId = document.activeElement?.id;
      const fresh = buildWeeklyChecksCard(mondayStr);
      card.replaceWith(fresh);
      attachWeeklyChecksHandlers(root, mondayStr);
      if (focusId && fresh.querySelector('#' + focusId)) fresh.querySelector('#' + focusId).focus();
    }, 0);
  };

  card.querySelector('#wc-waist').addEventListener('change', () => {
    const v = num('#wc-waist');
    if (v !== null && (isNaN(v) || v < 40 || v > 200)) return showToast('Enter a waist in cm.', 'error');
    save({ waist: v === null ? null : round1(v) }, v === null ? 'Waist cleared.' : 'Waist saved.');
  });

  const saveBench = () => {
    const kg = num('#wc-bench-kg'), reps = num('#wc-bench-reps');
    if (kg !== null && (isNaN(kg) || kg <= 0 || kg > 400)) return showToast('Enter the bench weight in kg.', 'error');
    if (reps !== null && (isNaN(reps) || reps < 1 || reps > 30 || reps % 1)) return showToast('Enter reps as a whole number.', 'error');
    save({ benchKg: kg, benchReps: reps },
      kg === null && reps === null ? 'Bench cleared.' : 'Bench saved.');
  };
  card.querySelector('#wc-bench-kg').addEventListener('change', saveBench);
  card.querySelector('#wc-bench-reps').addEventListener('change', saveBench);

  card.querySelector('#wc-bronco').addEventListener('change', e => {
    const raw = e.target.value.trim();
    if (raw === '') return save({ broncoSec: null }, 'Bronco cleared.');
    const sec = parseMmss(raw);
    if (!sec || sec < 120 || sec > 900) return showToast('Enter the time as m:ss, e.g. 4:56 or 456.', 'error');
    save({ broncoSec: sec }, `Bronco ${fmtMmss(sec)} saved.`);
  });

  card.querySelectorAll('input').forEach(inp => inp.addEventListener('keydown', e => {
    if (e.key === 'Enter') inp.blur();
  }));
}
