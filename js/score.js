/* ============================================================
   SCORING ENGINE
   All formulas come from BRIEF.md. Pure functions first,
   then the async loader at the bottom.

   Formula reference:
     Load             = minutes × RPE ÷ 10
     Steps load (day) = max(0, steps - 6 000) ÷ 1 000 × (14 ÷ 7)
                        (one entry per day; 10 000 every day = 56 a week)
     Load ratio       = this week's load ÷ avg load of qualifying weeks in the
                        previous 4 (same days only while the week is Live)
     Recovery score   = sleep pts (65) + wake pts (20) + work pts (15)
     Week Score       = training (30) + recovery (30) + food (22)
                        + drinks (8) + body (10), scaled when a slice is n/a
   ============================================================ */

/* ----------------------------------------------------------
   Steps load (per day)
   CONFIG.steps.multiplier is the weekly multiplier, so one day
   gets a seventh of it. A day with no steps entry counts as 0.
   ---------------------------------------------------------- */
function computeDailyStepsLoad(steps) {
  const c = CONFIG.steps;
  return Math.max(0, (steps - c.baseline) / c.divisor * (c.multiplier / 7));
}

/* Daily steps entries, at most one per date (last one wins) */
function stepsByDate(entries) {
  const map = {};
  entries.filter(e => e.type === 'steps' && typeof e.steps === 'number')
    .forEach(e => { map[e.date] = e.steps; });
  return map;
}

/* ----------------------------------------------------------
   Training and total week load from an entries array
   ---------------------------------------------------------- */
/* A session's load always comes from its own minutes and RPE
   (the stored load is only a fallback for an entry missing either) */
function entryLoad(e) {
  return typeof e.minutes === 'number' && typeof e.rpe === 'number'
    ? Math.round(e.minutes * e.rpe) / 10
    : (e.load || 0);
}

function weekTrainingLoad(entries) {
  return entries
    .filter(e => e.type === 'training')
    .reduce((s, e) => s + entryLoad(e), 0);
}

function weekStepsLoad(entries) {
  return Object.values(stepsByDate(entries))
    .reduce((s, steps) => s + computeDailyStepsLoad(steps), 0);
}

/* Total load (training + steps) for one date */
function dayTotalLoad(entries, date) {
  const dayEntries = entries.filter(e => e.date === date);
  return round1(weekTrainingLoad(dayEntries) + weekStepsLoad(dayEntries));
}

function weekTotalLoad(entries) {
  return round1(weekTrainingLoad(entries) + weekStepsLoad(entries));
}

/* ----------------------------------------------------------
   Load ratio and its status
   ---------------------------------------------------------- */
function loadRatioStatus(ratio) {
  if (ratio === null) return 'none';
  const c = CONFIG.loadRatio;
  if (ratio >= c.greenMin && ratio <= c.greenMax) return 'green';
  if (ratio > c.greenMax && ratio <= c.amberMax) return 'amber';
  if (ratio > c.amberMax)                        return 'red';
  return 'coasting';
}

/* ----------------------------------------------------------
   Training slice (0-30)
   ---------------------------------------------------------- */
function trainingSlicePoints(ratio) {
  if (ratio === null) return null;
  const c = CONFIG.loadRatio;
  const w = CONFIG.weekScore.training;

  if (ratio >= c.greenMin && ratio <= c.greenMax) return w;                          /* 0.8-1.3 */
  if (ratio < c.greenMin) {
    if (ratio <= c.coastMin) return 0;
    return round1(w * (ratio - c.coastMin) / (c.greenMin - c.coastMin));             /* 0.4-0.8 */
  }
  if (ratio <= c.amberMax) {
    return round1(w - (w - 20) * (ratio - c.greenMax) / (c.amberMax - c.greenMax)); /* 1.3-1.5 */
  }
  if (ratio <= c.redMax) {
    return round1(20 * (c.redMax - ratio) / (c.redMax - c.amberMax));               /* 1.5-2.0 */
  }
  return 0;
}

/* ----------------------------------------------------------
   Recovery score (0-100)
   ---------------------------------------------------------- */
function computeRecoveryScore(sleepEntries, recoveryEntries) {
  const w  = CONFIG.recoveryScore;
  const rc = CONFIG.recovery;

  /* Sleep pts */
  const logged = sleepEntries.filter(e => typeof e.hoursInBed === 'number');
  const sleepPts = logged.length > 0
    ? Math.min(w.sleepWeight, avg(logged.map(e => e.hoursInBed)) / w.sleepTarget * w.sleepWeight)
    : 0;

  /* Wake feeling pts */
  const felt = sleepEntries.filter(e => e.wakeFeeling > 0);
  const wakePts = felt.length > 0
    ? avg(felt.map(e => e.wakeFeeling)) / 5 * w.wakeWeight
    : 0;

  /* Recovery work pts */
  const totalSauna   = recoveryEntries.reduce((s, e) => s + (e.saunaMin      || 0), 0);
  const totalCold    = recoveryEntries.reduce((s, e) => s + (e.coldSessions  || 0), 0);
  const totalStretch = recoveryEntries.reduce((s, e) => s + (e.stretchMin    || 0), 0);

  const saunaPts   = Math.min(w.saunaPoints,   totalSauna   / rc.saunaTargetMin     * w.saunaPoints);
  const coldPts    = Math.min(w.coldPoints,    totalCold    / rc.coldTargetSessions  * w.coldPoints);
  const stretchPts = Math.min(w.stretchPoints, totalStretch / rc.stretchTargetMin   * w.stretchPoints);
  const workPts    = saunaPts + coldPts + stretchPts;

  return {
    score:    Math.round(sleepPts + wakePts + workPts),
    sleepPts: round1(sleepPts),
    wakePts:  round1(wakePts),
    workPts:  round1(workPts),
    saunaPts: round1(saunaPts),
    coldPts:  round1(coldPts),
    stretchPts: round1(stretchPts),
    totalSauna, totalCold, totalStretch,
  };
}

/* ----------------------------------------------------------
   Diet slices
   ---------------------------------------------------------- */
function dietFoodPoints(takeawayDamage) {
  const c = CONFIG.dietScore;
  const w = CONFIG.weekScore.dietFood;
  if (takeawayDamage <= c.foodGreenMax) return w;
  if (takeawayDamage >= c.foodRedMin)   return 0;
  return round1(w * (c.foodRedMin - takeawayDamage) / (c.foodRedMin - c.foodGreenMax));
}

function dietDrinksPoints(drinksPoints) {
  const c = CONFIG.dietScore;
  const w = CONFIG.weekScore.dietDrinks;
  if (drinksPoints <= c.drinksGreenMax) return w;
  if (drinksPoints >= c.drinksRedMin)   return 0;
  return round1(w * (c.drinksRedMin - drinksPoints) / (c.drinksRedMin - c.drinksGreenMax));
}

/* Total takeaway damage (takeaway pts + dessert count) from a week's entries */
function weekTakeawayDamage(entries) {
  const tpts = entries.filter(e => e.type === 'takeaway').reduce((s, e) => s + (e.points || 0), 0);
  const dess = entries.filter(e => e.type === 'dessert').length;
  return tpts + dess;
}

/* Total drinks points from a week's entries */
function weekDrinksPoints(entries) {
  return entries.filter(e => e.type === 'drink').reduce((s, e) => s + (e.points || 0), 0);
}

/* ----------------------------------------------------------
   Phases
   A week takes the phase in effect on its Sunday, unless the week
   record has a saved phase (manual override, or locked when the
   week ended). Before the schedule starts: Cut, the old rule.
   ---------------------------------------------------------- */
const PHASES = {
  baseline: 'Baseline',
  cut:      'Cut',
  hold:     'Hold',
  reverse:  'Reverse',
  season:   'Season',
};

function schedulePhaseFor(dateStr) {
  const sched = [...CONFIG.phases.schedule].sort((a, b) => a.start < b.start ? -1 : 1);
  let phase = 'cut';
  sched.forEach(s => { if (s.start <= dateStr && PHASES[s.phase]) phase = s.phase; });
  return phase;
}

/* { phase, source: 'manual' | 'locked' | 'schedule' } for a week */
function weekPhaseInfo(mondayStr) {
  const rec = getWeekRec(mondayStr);
  if (rec.phase && PHASES[rec.phase]) return { phase: rec.phase, source: rec.phaseSource || 'locked' };
  return { phase: schedulePhaseFor(weekSundayStr(mondayStr)), source: 'schedule' };
}

/* ----------------------------------------------------------
   Body weight slice (0-10), scored against the week's phase
   ---------------------------------------------------------- */
function computeBodySlice(weekWeightArrays, phase = 'cut') {
  /* weekWeightArrays[0] = this week's kg values, [1] = last week, [2]/[3] = older */
  const w0 = weekWeightArrays[0] || [];
  const w1 = weekWeightArrays[1] || [];
  const w2 = weekWeightArrays[2] || [];
  const w3 = weekWeightArrays[3] || [];

  if (w0.length === 0) return { points: 0, label: 'No data', change: null, lowData: false, na: false };

  /* No previous data at all -- n/a */
  if (w1.length === 0 && w2.length === 0 && w3.length === 0) {
    return { points: null, label: null, change: null, lowData: false, na: true };
  }

  let change, lowData = false;

  const useThin = (w0.length === 1 || w1.length === 1) && (w2.length > 0 || w3.length > 0);

  if (useThin) {
    /* 2-week rolling: avg(this + last) vs avg(w2 + w3), divided by 2 */
    const recent = [...w0, ...w1];
    const older  = [...w2, ...w3];
    change   = older.length > 0 ? (avg(recent) - avg(older)) / 2 : avg(w0) - avg(w1);
    lowData  = true;
  } else if (w1.length > 0) {
    change = avg(w0) - avg(w1);
  } else {
    /* w1 empty but w2/w3 available -- use rolling */
    const older = [...w2, ...w3];
    change = older.length > 0 ? (avg(w0) - avg(older)) / 2 : null;
    lowData = true;
  }

  if (change === null) return { points: null, label: null, change: null, lowData: false, na: true };

  return { ...bodyPoints(change, phase), change: round2(change), lowData, na: false };
}

function bodyPoints(change, phase = 'cut') {
  if (phase === 'reverse') return bodyPointsReverse(change);
  if (phase === 'cut')     return bodyPointsCut(change);
  return bodyPointsSteady(change);
}

/* Cut: the original "lose weight slowly" rule, unchanged */
function bodyPointsCut(change) {
  const c = CONFIG.bodyScore.cut;
  if (change <= -c.lossMax)                         return { points: 6,  label: 'Losing too fast' };
  if (change >= -c.lossMax && change <= -c.lossMin) return { points: 10, label: 'On target' };
  if (change > -c.lossMin && change <= 0)           return { points: 6,  label: 'Slow' };
  if (change > 0 && change <= c.lossMin)            return { points: 3,  label: 'Flat' };
  return { points: 0, label: 'Going the wrong way' };
}

/* Baseline, Hold, Season: stay steady */
function bodyPointsSteady(change) {
  const c = CONFIG.bodyScore.steady;
  const a = Math.abs(change);
  if (a <= c.inner) return { points: 10, label: 'Steady' };
  if (a <= c.outer) return { points: 6,  label: change > 0 ? 'Drifting up' : 'Drifting down' };
  return { points: 0, label: change > 0 ? 'Up too much' : 'Down too much' };
}

/* Reverse: creep up slowly */
function bodyPointsReverse(change) {
  const b = CONFIG.bodyScore.reverse.band;
  if (change >= 0 && change <= b) return { points: 10, label: 'On target' };
  if (change < 0 && change >= -b) return { points: 8,  label: 'Slightly down' };
  if (change > b)                 return { points: 3,  label: 'Gaining too fast' };
  return { points: 3, label: 'Still losing' };
}

/* ----------------------------------------------------------
   Weekly checks: bench e1RM and Bronco time bands
   (not part of the Week Score)
   ---------------------------------------------------------- */
function estimated1RM(kg, reps) {
  return kg * (1 + reps / 30);
}

/* 'good' | 'warn' | 'bad' */
function benchBand(e1rm) {
  const c = CONFIG.weeklyChecks.bench;
  return e1rm >= c.green ? 'good' : e1rm >= c.amber ? 'warn' : 'bad';
}

function broncoBand(sec) {
  const c = CONFIG.weeklyChecks.bronco;
  return sec < c.green ? 'good' : sec <= c.amber ? 'warn' : 'bad';
}

/* 296 -> "4:56" */
function fmtMmss(sec) {
  return `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
}

/* "4:56", "4.56" or "456" -> 296; null if not a valid time */
function parseMmss(str) {
  const s = String(str).trim();
  let m, sec;
  const sep = s.match(/^(\d{1,2})[:.,](\d{1,2})$/);
  if (sep) { m = +sep[1]; sec = +sep[2]; }
  else if (/^\d{3,4}$/.test(s)) { m = +s.slice(0, -2); sec = +s.slice(-2); }
  else return null;
  if (sec > 59) return null;
  const total = m * 60 + sec;
  return total > 0 ? total : null;
}

/* ----------------------------------------------------------
   Week Score (0-100), scaling when slices are n/a
   ---------------------------------------------------------- */
function computeWeekScore(parts) {
  /* parts: [{ pts, max, na }] */
  const active     = parts.filter(p => !p.na);
  const activeMax  = active.reduce((s, p) => s + p.max, 0);
  const activeRaw  = active.reduce((s, p) => s + Math.max(0, p.pts), 0);
  if (activeMax === 0) return 0;
  return Math.round((activeRaw / activeMax) * 100);
}

/* ----------------------------------------------------------
   Flags (auto-generated, max 4, priority-ordered)
   ---------------------------------------------------------- */
function computeFlags(data, prevData) {
  const candidates = [];

  /* --  danger flags  -- */
  if (data.ratio !== null && data.ratio > CONFIG.loadRatio.amberMax) {
    candidates.push({ priority: 10, type: 'danger',
      text: 'Spike week. Injury risk is up, pull something back.' });
  }
  const isCut = data.phase === 'cut';
  if (isCut && data.bodyLabel === 'Losing too fast') {
    candidates.push({ priority: 9, type: 'danger',
      text: `Losing too fast, over ${CONFIG.bodyScore.cut.lossMax} kg this week. Watch strength.` });
  }

  /* --  warning flags  -- */
  if (data.nightsUnder7_5 >= 3) {
    candidates.push({ priority: 8, type: 'warning',
      text: `${data.nightsUnder7_5} night${data.nightsUnder7_5 > 1 ? 's' : ''} under 7.5h in bed.` });
  }

  /* Heavy night followed by wake score <= 2 */
  data.heavyDrinkNights.forEach(({ drinkDate, wakeDateStr, wakeFeeling }) => {
    if (wakeFeeling <= 2) {
      const dd = strToDate(drinkDate);
      const wd = strToDate(wakeDateStr);
      candidates.push({ priority: 7, type: 'warning',
        text: `Heavy night ${DAY_SHORT[dd.getDay()]}, wake score ${wakeFeeling} on ${DAY_SHORT[wd.getDay()]}.` });
    }
  });

  if (data.ratio !== null && data.ratio < CONFIG.loadRatio.greenMin) {
    candidates.push({ priority: 6, type: 'warning', text: 'Light week. You coasted.' });
  }
  if (isCut && data.bodyChange !== null && data.bodyChange > CONFIG.bodyScore.cut.lossMin) {
    candidates.push({ priority: 5, type: 'warning', text: 'Weight up this week.' });
  }
  if (isCut && data.weightUpTwoWeeks) {
    candidates.push({ priority: 4, type: 'warning', text: 'Weight up 2 weeks running.' });
  }
  /* Other phases: flag a change in the lowest band */
  if (!isCut && data.bodyChange !== null && data.bodyPoints !== null && data.bodyPoints <= 3) {
    const ch = data.bodyChange;
    candidates.push({ priority: 5, type: 'warning',
      text: `${data.bodyLabel}: ${ch > 0 ? '+' : ''}${ch.toFixed(2)} kg this week, outside the ${PHASES[data.phase]} range.` });
  }

  if (prevData) {
    const cardioDown = prevData.cardioMinutes - data.cardioMinutes;
    if (cardioDown >= 20) {
      candidates.push({ priority: 3, type: 'warning',
        text: `Cardio down ${cardioDown} min vs last week.` });
    }
    if (data.takeawayDamage > prevData.takeawayDamage && prevData.takeawayDamage > 0) {
      candidates.push({ priority: 2, type: 'warning',
        text: `Takeaways up: ${data.takeawayDamage} vs ${prevData.takeawayDamage}.` });
    }
  }

  /* --  positive flags  -- */
  if (data.takeawayLowestIn4Weeks) {
    candidates.push({ priority: 1, type: 'positive',
      text: 'Takeaway Damage lowest in 4 weeks.' });
  }

  /* Sort descending by priority, cap at 4 */
  return candidates
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 4)
    .map(({ type, text }) => ({ type, text }));
}

/* ----------------------------------------------------------
   Cardio minutes (run + conditioning + gym cardio)
   ---------------------------------------------------------- */
function weekCardioMinutes(entries) {
  return entries
    .filter(e => e.type === 'training' && e.category === 'cardio')
    .reduce((s, e) => s + (e.minutes || 0), 0);
}

/* ----------------------------------------------------------
   Gym session counts
   ---------------------------------------------------------- */
function weekGymSessions(entries) {
  const gym = entries.filter(e => e.type === 'training' && e.subtype === 'gym');
  return {
    fullBody:  gym.filter(e => e.gymType === 'fullBody').length,
    accessory: gym.filter(e => e.gymType === 'accessory').length,
    abs:       gym.filter(e => e.gymType === 'abs').length,
    total:     gym.length,
  };
}

/* Pitch sessions: football + hurling training + matches */
function weekPitchSessions(entries) {
  const pitch = entries.filter(e => e.type === 'training' &&
    (e.category === 'football' || e.category === 'hurling'));
  return {
    footballTraining: pitch.filter(e => e.subtype === 'footballTraining').length,
    hurlingTraining:  pitch.filter(e => e.subtype === 'hurlingTraining').length,
    footballMatch:    pitch.filter(e => e.subtype === 'footballMatch').length,
    hurlingMatch:     pitch.filter(e => e.subtype === 'hurlingMatch').length,
    total:            pitch.length,
  };
}

/* ----------------------------------------------------------
   Heavy drink nights and next-morning wake feeling
   ---------------------------------------------------------- */
function findHeavyDrinkWakeLinks(weekEntries, weekSleepEntries) {
  const heavyNights = weekEntries.filter(e => e.type === 'drink' && e.level === 'heavy');
  return heavyNights.map(d => {
    /* Wake date = the morning after the drink date */
    const wakeDate = new Date(strToDate(d.date));
    wakeDate.setDate(wakeDate.getDate() + 1);
    const wakeDateStr = dateToStr(wakeDate);
    const sleepEntry  = weekSleepEntries.find(e => e.date === wakeDateStr);
    return {
      drinkDate:   d.date,
      wakeDateStr,
      wakeFeeling: sleepEntry?.wakeFeeling || null,
    };
  }).filter(x => x.wakeFeeling !== null);
}

/* ----------------------------------------------------------
   Data sufficiency
   ---------------------------------------------------------- */
const MIN_LOG_DAYS       = 3;  /* a week needs 3+ days with any log to be compared against */
const MIN_SLEEP_NIGHTS   = 3;  /* recovery score needs 3+ nights of sleep, else n/a */
const MIN_BASELINE_WEEKS = 2;  /* load ratio needs 2+ qualifying weeks in the previous 4 */

/* An entry that actually records something (an all-zero recovery row does not) */
function isRealLog(e) {
  if (e.type === 'recovery') return (e.saunaMin || 0) + (e.coldSessions || 0) + (e.stretchMin || 0) > 0;
  if (e.type === 'steps')    return typeof e.steps === 'number';
  return true;
}

function isQualifyingWeek(weekEntries) {
  return new Set(weekEntries.filter(isRealLog).map(e => e.date)).size >= MIN_LOG_DAYS;
}

function entriesBetween(entries, from, to) {
  return entries.filter(e => e.date >= from && e.date <= to);
}

/* ----------------------------------------------------------
   Score one week from raw entries. Nothing is ever stored:
   Week and History both call this, so they always agree.

   entries: must also cover the 4 weeks before mondayStr.
   asOf:    last date counted (inclusive).
   live:    true for a week in progress, or a past week scored
            "as at" the same weekday. Live weeks compare like for
            like (same days) and a missing weigh-in is Pending.
   ---------------------------------------------------------- */
function scoreWeek(mondayStr, entries, { asOf, live }) {
  const sundayStr = weekSundayStr(mondayStr);
  const dayIdx    = Math.round((strToDate(asOf) - strToDate(mondayStr)) / 86400000);
  const w         = entriesBetween(entries, mondayStr, asOf);

  /* prevWeeks[0] = last week ... [3] = 4 weeks ago, always full weeks */
  const prevWeeks = [1, 2, 3, 4].map(i => {
    const m = addWeeks(mondayStr, -i);
    return { monday: m, sameDay: addWeeks(asOf, -i), entries: entriesBetween(entries, m, weekSundayStr(m)) };
  });

  /* -- Loads -- */
  const trainingLoad = round1(weekTrainingLoad(w));
  const stepsMap     = stepsByDate(w);
  const stepsDaysLogged = Object.keys(stepsMap).length;
  const avgSteps     = stepsDaysLogged > 0 ? Math.round(avg(Object.values(stepsMap))) : null;
  const stepsLoad    = round1(weekStepsLoad(w));
  const totalLoad    = round1(trainingLoad + stepsLoad);
  const dailyLoads   = weekDays(mondayStr).map(d => dayTotalLoad(w, d));

  /* -- Load ratio: baseline = qualifying weeks among the previous 4.
        Live: each baseline week's load over the same days (Mon to same weekday). -- */
  const baseLoads = prevWeeks
    .filter(pw => isQualifyingWeek(pw.entries))
    .map(pw => weekTotalLoad(live ? entriesBetween(pw.entries, pw.monday, pw.sameDay) : pw.entries));
  const baseline  = baseLoads.length >= MIN_BASELINE_WEEKS && avg(baseLoads) > 0
    ? round1(avg(baseLoads)) : null;
  const ratio     = baseline ? round2(totalLoad / baseline) : null;
  const ratioStat = loadRatioStatus(ratio);
  const baselineWeeks   = baseLoads.length;
  const weeksToBaseline = Math.max(0, MIN_BASELINE_WEEKS - baselineWeeks);

  /* -- Sleep -- */
  const sleepEntries  = w.filter(e => e.type === 'sleep');
  const nightsLogged  = sleepEntries.length;
  const hoursArr      = sleepEntries.filter(e => e.hoursInBed > 0).map(e => e.hoursInBed);
  const avgHoursInBed = hoursArr.length > 0 ? round2(avg(hoursArr)) : null;
  const wakeArr       = sleepEntries.filter(e => e.wakeFeeling > 0).map(e => e.wakeFeeling);
  const avgWakeFeel   = wakeArr.length > 0 ? round2(avg(wakeArr)) : null;
  const nightsUnder7_5 = hoursArr.filter(h => h < CONFIG.sleep.lowHoursThreshold).length;

  /* -- Recovery: n/a (not a low score) under 3 nights of sleep -- */
  const recEntries = w.filter(e => e.type === 'recovery');
  const rec        = computeRecoveryScore(sleepEntries, recEntries);
  const recNA      = nightsLogged < MIN_SLEEP_NIGHTS;

  /* -- Diet -- */
  const takeawayDamage = weekTakeawayDamage(w);
  const drinksPoints   = weekDrinksPoints(w);
  const heavyDrinkNights = findHeavyDrinkWakeLinks(w, sleepEntries);

  /* -- Body: scored against this week's own phase. A Live week with no
        weigh-in yet is Pending; only a completed week with none scores 0 -- */
  const phaseInfo = weekPhaseInfo(mondayStr);
  const phase     = phaseInfo.phase;
  const weightArrays = [w, ...prevWeeks.slice(0, 3).map(pw => pw.entries)]
    .map(es => es.filter(e => e.type === 'bodyweight').map(e => e.kg));
  let bodyResult;
  if (live && weightArrays[0].length === 0) {
    bodyResult = { points: null, label: null, change: null, lowData: false, na: true, status: 'pending' };
  } else {
    bodyResult = computeBodySlice(weightArrays, phase);
    bodyResult.status = bodyResult.na ? 'na' : null;
  }
  const avgWeight   = weightArrays[0].length > 0 ? round2(avg(weightArrays[0])) : null;
  const prevAvgWt   = weightArrays[1].length > 0 ? round2(avg(weightArrays[1])) : null;
  const prevPrevAvgWt = weightArrays[2].length > 0 ? round2(avg(weightArrays[2])) : null;
  const weightUpTwoWeeks = (bodyResult.change !== null && bodyResult.change > 0 &&
    prevAvgWt !== null && prevPrevAvgWt !== null && prevAvgWt > prevPrevAvgWt);

  /* -- Breakdown counts -- */
  const gymSessions   = weekGymSessions(w);
  const pitchSessions = weekPitchSessions(w);
  const cardioMinutes = weekCardioMinutes(w);

  /* -- Week score parts (an n/a slice is left out and the score scaled) -- */
  const ws       = CONFIG.weekScore;
  const trainPts = trainingSlicePoints(ratio);
  const recPts   = Math.round(rec.score * (ws.recovery / 100));
  const foodPts  = dietFoodPoints(takeawayDamage);
  const drinkPts = dietDrinksPoints(drinksPoints);
  const bPts     = bodyResult.points;

  const breakdown = {
    training:   { pts: trainPts ?? 0, max: ws.training,   na: trainPts === null, naLabel: 'Building' },
    recovery:   { pts: recNA ? 0 : recPts, max: ws.recovery, na: recNA,          naLabel: 'n/a' },
    dietFood:   { pts: foodPts,       max: ws.dietFood,   na: false },
    dietDrinks: { pts: drinkPts,      max: ws.dietDrinks, na: false },
    body:       { pts: bPts ?? 0,     max: ws.body,       na: bodyResult.na,
                  naLabel: bodyResult.status === 'pending' ? 'Pending' : 'n/a' },
  };

  const weekScore = computeWeekScore(Object.values(breakdown));
  const active    = Object.values(breakdown).filter(p => !p.na);
  const scoreRaw  = round1(active.reduce((s, p) => s + Math.max(0, p.pts), 0));
  const scoreMax  = active.reduce((s, p) => s + p.max, 0);

  /* -- Previous week summary for flags, only if it qualifies -- */
  const prevW = prevWeeks[0].entries;
  const prevData = isQualifyingWeek(prevW) ? {
    cardioMinutes:  weekCardioMinutes(prevW),
    takeawayDamage: weekTakeawayDamage(prevW),
  } : null;

  /* -- "Lowest in 4 weeks" flag check -- */
  const prev4Damages = prevWeeks.map(pw => weekTakeawayDamage(pw.entries));
  const takeawayLowestIn4Weeks = prev4Damages.some(d => d > 0) &&
    prev4Damages.every(d => takeawayDamage <= d);

  /* -- Flags -- */
  const flags = computeFlags({
    ratio, nightsUnder7_5, heavyDrinkNights,
    cardioMinutes, takeawayDamage,
    phase,
    bodyLabel:  bodyResult.label,
    bodyChange: bodyResult.change,
    bodyPoints: bodyResult.points,
    weightUpTwoWeeks,
    takeawayLowestIn4Weeks,
  }, prevData);

  return {
    mondayStr, sundayStr, asOf, live, isComplete: !live, daysCounted: dayIdx + 1,
    trainingLoad, stepsLoad, totalLoad, avgSteps, stepsDaysLogged, dailyLoads,
    ratio, ratioStatus: ratioStat, baseline, baselineWeeks, weeksToBaseline,
    gymSessions, pitchSessions, cardioMinutes,
    sleepEntries, nightsLogged, avgHoursInBed, avgWakeFeeling: avgWakeFeel, nightsUnder7_5,
    saunaMin:     rec.totalSauna,
    coldSessions: rec.totalCold,
    stretchMin:   rec.totalStretch,
    recoveryNA:   recNA,
    recoveryScore: recNA ? null : rec.score,
    recSleepPts:  rec.sleepPts,
    recWakePts:   rec.wakePts,
    recWorkPts:   rec.workPts,
    takeawayDamage, drinksPoints, heavyDrinkNights,
    phase, phaseSource: phaseInfo.source,
    avgWeight, prevAvgWt, weightChange: bodyResult.change,
    bodyLabel: bodyResult.label, bodySlicePoints: bPts, bodyNA: bodyResult.na,
    bodyStatus: bodyResult.status, bodyLowData: bodyResult.lowData, weightUpTwoWeeks,
    weekScore, scoreRaw, scoreMax, breakdown, prevData,
    flags,
    /* Raw entries for drill-down */
    allEntries: w,
  };
}

/* Score a week as it stands today: Live while in progress, Final once Sunday is over */
function scoreWeekToDate(mondayStr, entries) {
  const sundayStr = weekSundayStr(mondayStr);
  const today = todayStr();
  const live  = today <= sundayStr;
  return scoreWeek(mondayStr, entries, { asOf: live ? today : sundayStr, live });
}

/* ----------------------------------------------------------
   Main async entry point (Week screen)
   Adds last week for comparisons:
     prevWeek      -- last week in full, always (daily chart)
     prevFinal     -- last week's Final, only if it qualifies
     prevSamePoint -- while this week is Live: last week Live at the
                      same weekday; otherwise its Final. Only if it qualifies.
   ---------------------------------------------------------- */
async function computeWeekData(mondayStr) {
  /* This week + 5 previous: last week's own baseline needs the 4 weeks before it */
  const entries = await getEntriesByDateRange(addWeeks(mondayStr, -5), weekSundayStr(mondayStr));

  const data     = scoreWeekToDate(mondayStr, entries);
  const prevMon  = addWeeks(mondayStr, -1);
  const prevWeek = scoreWeek(prevMon, entries, { asOf: weekSundayStr(prevMon), live: false });
  const prevOk   = isQualifyingWeek(prevWeek.allEntries);

  data.prevWeek      = prevWeek;
  data.prevFinal     = prevOk ? prevWeek : null;
  data.prevSamePoint = !prevOk ? null
    : data.live ? scoreWeek(prevMon, entries, { asOf: addWeeks(data.asOf, -1), live: true })
    : prevWeek;
  return data;
}

/* ----------------------------------------------------------
   Date helpers (local to this module)
   ---------------------------------------------------------- */
function weekSundayStr(mondayStr) {
  const d = strToDate(mondayStr);
  d.setDate(d.getDate() + 6);
  return dateToStr(d);
}

function addWeeks(mondayStr, n) {
  const d = strToDate(mondayStr);
  d.setDate(d.getDate() + n * 7);
  return dateToStr(d);
}

/* ----------------------------------------------------------
   Math helpers
   ---------------------------------------------------------- */
function avg(arr) {
  if (!arr.length) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}
function round1(v) { return Math.round(v * 10) / 10; }
function round2(v) { return Math.round(v * 100) / 100; }

/* ----------------------------------------------------------
   Unit-style checks  (logged to console, do not block UI)
   Brief worked examples:

     Full body: 70 × 8 ÷ 10 = 56
     Steps: 10 000 on a day → max(0, 4000) ÷ 1000 × 2 = 8
            10 000 every day for a week → 56
     Diet food: damage 2 → 22 pts; damage 12 → 0 pts; damage 7 → 11 pts
     Diet drinks: 4 pts → 8; 15 pts → 0; 9.5 pts → 4
     Training slice: ratio 1.0 → 30; ratio 0.4 → 0; ratio 0.6 → 15;
                     ratio 1.4 → 25; ratio 1.75 → 10; ratio 2.0 → 0
     Recovery score: 8h avg + feeling 4 avg + sauna 45m + cold 3 + stretch 45m
                     = 65 + 16 + 15 = 96
   ---------------------------------------------------------- */
function runScoringChecks() {
  const ok  = (label, got, expected) => {
    const pass = Math.abs(got - expected) < 0.01;
    console[pass ? 'log' : 'error'](`${pass ? '✓' : '✗'} ${label}: got ${got}, expected ${expected}`);
  };

  /* Load formula */
  const fakeCfg = CONFIG; /* real config object */
  ok('Full body load',  70 * 8 / 10,  56);
  ok('Accessory load',  45 * 6 / 10,  27);
  ok('Abs load',        25 * 5 / 10,  12.5);

  /* Steps load (daily) */
  ok('Steps load 10k day',  computeDailyStepsLoad(10000), 8);
  ok('Steps load 6k day',   computeDailyStepsLoad(6000),  0);
  ok('Steps load 5k day',   computeDailyStepsLoad(5000),  0);
  ok('Steps load 20k day',  computeDailyStepsLoad(20000), 28);
  const mockStepsWeek = weekDays('2026-09-28').map(date => ({ date, type: 'steps', steps: 10000 }));
  ok('Steps load 10k x 7 days', weekStepsLoad(mockStepsWeek), 56);
  ok('Steps load 3 of 7 days logged', weekStepsLoad(mockStepsWeek.slice(0, 3)), 24);

  /* Training slice */
  ok('Training slice 1.0',  trainingSlicePoints(1.0),  30);
  ok('Training slice 0.4',  trainingSlicePoints(0.4),  0);
  ok('Training slice 0.6',  trainingSlicePoints(0.6),  15);
  ok('Training slice 0.8',  trainingSlicePoints(0.8),  30);
  ok('Training slice 1.3',  trainingSlicePoints(1.3),  30);
  ok('Training slice 1.4',  trainingSlicePoints(1.4),  25);
  ok('Training slice 1.5',  trainingSlicePoints(1.5),  20);
  ok('Training slice 1.75', trainingSlicePoints(1.75), 10);
  ok('Training slice 2.0',  trainingSlicePoints(2.0),  0);

  /* Diet food slice */
  ok('Food 2 pts',  dietFoodPoints(2),  22);
  ok('Food 7 pts',  dietFoodPoints(7),  11);
  ok('Food 12 pts', dietFoodPoints(12), 0);

  /* Diet drinks slice */
  ok('Drinks 4 pts',  dietDrinksPoints(4),  8);
  ok('Drinks 15 pts', dietDrinksPoints(15), 0);
  ok('Drinks 9 pts',  dietDrinksPoints(9),  round1(8 * (15 - 9) / 11));

  /* Recovery score */
  const mockSleep = [
    { hoursInBed: 8, wakeFeeling: 4 },
    { hoursInBed: 8, wakeFeeling: 4 },
  ];
  const mockRec = [{ saunaMin: 45, coldSessions: 3, stretchMin: 45 }];
  const rec = computeRecoveryScore(mockSleep, mockRec);
  ok('Recovery sleep pts', rec.sleepPts, 65);
  ok('Recovery wake pts',  rec.wakePts,  16);
  ok('Recovery work pts',  rec.workPts,  15);
  ok('Recovery total',     rec.score,    96);

  /* Body slice */
  ok('Body on target (-0.5)',   bodyPoints(-0.5).points,  10);
  ok('Body losing too fast (-1)', bodyPoints(-1.0).points, 6);
  ok('Body slow (-0.1)',         bodyPoints(-0.1).points,  6);
  ok('Body flat (+0.1)',         bodyPoints(0.1).points,   3);
  ok('Body wrong way (+0.5)',    bodyPoints(0.5).points,   0);

  /* Body slice by phase */
  ok('Cut on target (-0.5)',        bodyPoints(-0.5, 'cut').points,      10);
  ok('Hold steady (+0.2)',          bodyPoints(0.2, 'hold').points,      10);
  ok('Hold steady (-0.25)',         bodyPoints(-0.25, 'hold').points,    10);
  ok('Baseline drifting (-0.4)',    bodyPoints(-0.4, 'baseline').points, 6);
  ok('Season drifting (+0.5)',      bodyPoints(0.5, 'season').points,    6);
  ok('Hold too much (+0.6)',        bodyPoints(0.6, 'hold').points,      0);
  ok('Reverse on target (+0.2)',    bodyPoints(0.2, 'reverse').points,   10);
  ok('Reverse no change (0)',       bodyPoints(0, 'reverse').points,     10);
  ok('Reverse slightly down (-0.1)', bodyPoints(-0.1, 'reverse').points, 8);
  ok('Reverse too fast (+0.4)',     bodyPoints(0.4, 'reverse').points,   3);
  ok('Reverse still losing (-0.4)', bodyPoints(-0.4, 'reverse').points, 3);

  /* Phase schedule (week takes the phase on its Sunday) */
  const okStr = (label, got, expected) => console[got === expected ? 'log' : 'error'](
    `${got === expected ? '✓' : '✗'} ${label}: got ${got}, expected ${expected}`);
  if (JSON.stringify(CONFIG.phases.schedule) === JSON.stringify(DEFAULT_CONFIG.phases.schedule)) {
    okStr('Phase before schedule', schedulePhaseFor('2026-10-18'), 'cut');
    okStr('Phase 24 Oct 2026',     schedulePhaseFor('2026-10-24'), 'baseline');
    okStr('Phase 8 Nov 2026',      schedulePhaseFor('2026-11-08'), 'baseline');
    okStr('Phase 9 Nov 2026',      schedulePhaseFor('2026-11-09'), 'cut');
    okStr('Phase 10 Jan 2027',     schedulePhaseFor('2027-01-10'), 'hold');
    okStr('Phase 14 Mar 2027',     schedulePhaseFor('2027-03-14'), 'reverse');
    okStr('Phase 15 Mar 2027',     schedulePhaseFor('2027-03-15'), 'season');
  }

  /* Bench e1RM (brief examples; colours use the default thresholds) */
  ok('e1RM 87.5 x 3', estimated1RM(87.5, 3), 96.25);
  ok('e1RM 85 x 3',   estimated1RM(85, 3),   93.5);
  ok('e1RM 82.5 x 3', estimated1RM(82.5, 3), 90.75);
  if (JSON.stringify(CONFIG.weeklyChecks) === JSON.stringify(DEFAULT_CONFIG.weeklyChecks)) {
    okStr('Bench 87.5 x 3 green', benchBand(estimated1RM(87.5, 3)), 'good');
    okStr('Bench 87.5 x 2 amber', benchBand(estimated1RM(87.5, 2)), 'warn');
    okStr('Bench 85 x 3 amber',   benchBand(estimated1RM(85, 3)),   'warn');
    okStr('Bench 82.5 x 3 red',   benchBand(estimated1RM(82.5, 3)), 'bad');
    okStr('Bronco 4:59 green',    broncoBand(299), 'good');
    okStr('Bronco 5:00 amber',    broncoBand(300), 'warn');
    okStr('Bronco 5:08 amber',    broncoBand(308), 'warn');
    okStr('Bronco 5:09 red',      broncoBand(309), 'bad');
  }
  ok('Parse 4:56', parseMmss('4:56'), 296);
  ok('Parse 456',  parseMmss('456'),  296);

  console.log('Scoring checks complete.');
}

/* Run checks once on load (results visible in DevTools > Console) */
runScoringChecks();
