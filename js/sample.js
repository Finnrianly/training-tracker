/* ============================================================
   SAMPLE DATA  --  6 weeks of realistic fake data.
   Covers: spike week, coasting week, heavy drinks + poor wake,
   takeaway fluctuation, slow weight loss, flags, trend charts.
   Remove or hide this button after real data exists.
   ============================================================ */

/* Called by the Settings screen */
async function loadSampleData() {
  confirmAction(
    'Add 6 weeks of sample data? Existing entries are kept (sample entries get their own IDs).',
    async () => {
      try {
        const entries = buildSampleEntries();
        for (const e of entries) await putEntry(e);
        showToast(`${entries.length} sample entries loaded.`, 'success');
        showScreen('today');
      } catch (err) {
        showToast('Sample load failed: ' + err.message, 'error');
      }
    }
  );
}

/* ----------------------------------------------------------
   Entry factory
   ---------------------------------------------------------- */
function buildSampleEntries() {
  const today   = todayStr();
  const thisMon = weekStartStr(today);
  const entries = [];
  let   uid     = 0;
  const id = (tag) => `sample-${tag}-${++uid}`;

  /* 6 full weeks + partial current week (weekOffset 0 = this week) */
  const weekProfiles = [
    /* weeksAgo, trainingStyle,  dietStyle,   noteForFlags          */
    { n: 6, training: 'light',   diet: 'moderate' },
    { n: 5, training: 'normal',  diet: 'clean'    },
    { n: 4, training: 'spike',   diet: 'bad'      }, /* ratio > 1.5, heavy drinks */
    { n: 3, training: 'light',   diet: 'moderate' }, /* coasting after spike      */
    { n: 2, training: 'normal',  diet: 'clean'    }, /* good week, no takeaways   */
    { n: 1, training: 'normal',  diet: 'moderate' },
    { n: 0, training: 'partial', diet: 'clean'    }, /* current partial week      */
  ];

  let weight = 84.8; /* kg, starting value */

  weekProfiles.forEach(({ n, training, diet }) => {
    const mon  = addWeeks(thisMon, -n);
    const days = weekDays(mon);

    /* Per-day generation */
    days.forEach((date, dow) => {
      if (date > today) return; /* no future entries */

      const seed  = dateToSeed(date);
      const rand  = seeded(seed);

      /* ---- TRAINING ---- */
      const sessions = dailySessions(dow, training, rand);
      sessions.forEach(s => entries.push({ ...s, id: id('tr'), date }));

      /* ---- RECOVERY ---- */
      const rec = dailyRecovery(dow, training, rand);
      if (rec.saunaMin || rec.coldSessions || rec.stretchMin) {
        entries.push({ id: `recovery-${date}`, date, type: 'recovery', ...rec });
      }

      /* ---- SLEEP ---- */
      /* Sleep entry belongs to wake morning; skip day 0 (Mon) -- that's last Sunday's sleep */
      if (dow > 0 || n < 6) {
        /* Generate sleep for this morning (i.e. last night's sleep) */
        const heavyNightBefore = diet === 'bad' && dow === 0; /* Sun heavy → Mon wake */
        const drinkNight = dietDrinksForDay(dow, diet, rand);
        const badWake    = (drinkNight?.level === 'heavy') || heavyNightBefore;

        const sleep = generateSleep(dow, training, badWake, rand);
        if (sleep) {
          entries.push({ id: `sleep-${date}`, date, type: 'sleep', ...sleep });
        }
      }

      /* ---- DIET: TAKEAWAYS ---- */
      const takeaways = dailyTakeaways(dow, diet, rand);
      takeaways.forEach(t => entries.push({ ...t, id: id('ta'), date }));

      /* ---- DIET: DESSERTS ---- */
      if (diet === 'bad' && rand() < 0.4 && (dow === 4 || dow === 5)) {
        entries.push({ id: id('de'), date, type: 'dessert', points: 1 });
      }

      /* ---- DIET: DRINKS ---- */
      const drinks = dietDrinksForDay(dow, diet, rand);
      if (drinks) {
        entries.push({ id: `drink-${date}`, date, type: 'drink', ...drinks });
      }

      /* ---- STEPS (most days; a few days left unlogged) ---- */
      if (rand() > 0.15) {
        const steps = Math.round(5000 + rand() * 9000);
        entries.push({ id: `steps-${date}`, date, type: 'steps', steps });
      }

      /* ---- BODYWEIGHT (Mon, Wed, Fri) ---- */
      if ([0, 2, 4].includes(dow) && rand() > 0.15) {
        const kg = round2(weight + (rand() - 0.5) * 0.4);
        entries.push({ id: id('bw'), date, type: 'bodyweight', kg });
      }
    });

    /* weight drifts down slightly each week */
    weight -= 0.2 + seeded(dateToSeed(mon))() * 0.35;
  });

  return entries;
}

/* ----------------------------------------------------------
   Daily session generator
   ---------------------------------------------------------- */
function dailySessions(dow, training, rand) {
  const sessions = [];

  const prob = training === 'spike' ? 1.05 : training === 'light' ? 0.55 : 0.80;
  if (rand() > prob) return [];  /* rest day */

  switch (dow) {
    case 0: /* Monday: full body gym */
      sessions.push(gymEntry('fullBody', rand));
      break;

    case 1: /* Tuesday: football or hurling training */
      if (rand() < 0.65) {
        sessions.push(actEntry('footballTraining', rand() < 0.5 ? 'heavy' : 'light', rand));
      } else {
        sessions.push(actEntry('hurlingTraining', 'light', rand));
      }
      if (training === 'spike') sessions.push(gymEntry('abs', rand));
      break;

    case 2: /* Wednesday: accessory gym or run */
      if (rand() < 0.55) {
        sessions.push(gymEntry('accessory', rand));
      } else {
        sessions.push(runEntry(rand));
      }
      break;

    case 3: /* Thursday: hurling or football training */
      if (rand() < 0.60) {
        sessions.push(actEntry('hurlingTraining', rand() < 0.55 ? 'heavy' : 'light', rand));
      } else {
        sessions.push(actEntry('footballTraining', 'light', rand));
      }
      if (training === 'spike') sessions.push(condEntry(rand));
      break;

    case 4: /* Friday: abs or nothing */
      if (rand() < 0.45) sessions.push(gymEntry('abs', rand));
      break;

    case 5: /* Saturday: match, cardio, or golf */
      if (rand() < 0.35) {
        sessions.push(actEntry('footballMatch', rand() < 0.7 ? 'fullGame' : 'cameOn', rand));
      } else if (rand() < 0.35) {
        sessions.push(actEntry('hurlingMatch', rand() < 0.6 ? 'fullGame' : 'cameOn', rand));
      } else if (training === 'spike' || rand() < 0.30) {
        sessions.push(condEntry(rand));
      }
      break;

    case 6: /* Sunday: rest */
      break;
  }

  return sessions;
}

function gymEntry(gymType, rand) {
  const g   = CONFIG.gym[gymType];
  const min = Math.round(g.minutes + (rand() - 0.5) * 10);
  return {
    type: 'training', subtype: 'gym', gymType,
    label: g.label, minutes: min, rpe: g.rpe,
    load: calcLoad(min, g.rpe), category: 'gym',
  };
}

function actEntry(key, option, rand) {
  const a = CONFIG.activities[key];
  let minutes, rpe, label = a.label, category;

  if (key === 'footballTraining' || key === 'hurlingTraining') {
    rpe     = a.rpe[option];
    minutes = Math.round(a.minutes + (rand() - 0.5) * 10);
    label   = `${a.label}`;
    category = key.includes('football') ? 'football' : 'hurling';
  } else { /* match */
    rpe     = a.rpe[option];
    minutes = a.minutes[option];
    label   = a.label + (option === 'cameOn' ? ' (sub)' : '');
    category = key.includes('football') ? 'football' : 'hurling';
  }

  return {
    type: 'training', subtype: key, label,
    intensity: option, option,
    minutes, rpe, load: calcLoad(minutes, rpe), category,
  };
}

function runEntry(rand) {
  const km      = round1(4 + rand() * 7);           /* 4-11 km */
  const paceS   = 270 + Math.round(rand() * 90);    /* 4:30-6:00/km */
  const totalMin = Math.round((paceS * km) / 60);
  const { rpe } = runRpe(paceS);
  return {
    type: 'training', subtype: 'run', label: `Run ${km}km`,
    km, timeMinutes: totalMin, timeSecs: 0,
    paceSecPerKm: paceS, minutes: totalMin,
    rpe, load: calcLoad(totalMin, rpe), category: 'cardio',
  };
}

function condEntry(rand) {
  const min = 20 + Math.round(rand() * 20);
  const rpe = CONFIG.activities.conditioning.rpe;
  return {
    type: 'training', subtype: 'conditioning', label: 'Conditioning',
    minutes: min, rpe, load: calcLoad(min, rpe), category: 'cardio',
  };
}

/* ----------------------------------------------------------
   Daily recovery
   ---------------------------------------------------------- */
function dailyRecovery(dow, training, rand) {
  let saunaMin = 0, coldSessions = 0, stretchMin = 0;

  if (dow === 3 && rand() < 0.50) saunaMin    = 20 + Math.round(rand() * 25);
  if (dow === 5 && rand() < 0.35) coldSessions = 1;
  if (dow === 6 && rand() < 0.65) {
    stretchMin   = 20 + Math.round(rand() * 25);
    if (rand() < 0.30) coldSessions = 1;
  }
  if (training === 'spike' && dow === 1 && rand() < 0.40) saunaMin = 30;

  return { saunaMin, coldSessions, stretchMin };
}

/* ----------------------------------------------------------
   Sleep generation
   ---------------------------------------------------------- */
function generateSleep(dow, training, badWake, rand) {
  if (rand() < 0.08) return null; /* occasionally skips logging */

  let lightsHour, lightsMin, wakeHour, wakeMin, feeling;

  if (dow >= 1 && dow <= 5) { /* Mon wake to Fri wake (Tue wake -- Fri wake) */
    /* weeknight */
    lightsHour = 23;
    lightsMin  = Math.round(rand() * 45);          /* 23:00-23:45 */
    wakeHour   = 7;
    wakeMin    = Math.round(rand() * 45);           /* 07:00-07:45 */
    feeling    = badWake ? Math.ceil(rand() * 2) : 3 + Math.round(rand() * 1.5);
  } else if (dow === 6) { /* Sunday wake */
    lightsHour = 22 + Math.round(rand());
    lightsMin  = Math.round(rand() * 59);
    wakeHour   = 8;
    wakeMin    = Math.round(rand() * 60);           /* 08:00-09:00 */
    feeling    = 4 + Math.round(rand());
  } else { /* Monday wake (Sun night) */
    lightsHour = 23;
    lightsMin  = Math.round(rand() * 30);
    wakeHour   = 7;
    wakeMin    = Math.round(rand() * 30);
    feeling    = badWake ? 1 + Math.round(rand()) : 3 + Math.round(rand() * 2);
  }

  if (badWake && dow === 0) { /* heavy Sat night -> Sun lights off late */
    lightsHour = 1; lightsMin = Math.round(rand() * 30);
    wakeHour   = 9; wakeMin   = Math.round(rand() * 30);
    feeling    = 1 + Math.round(rand());
  }

  const lightsOff = `${String(lightsHour).padStart(2,'0')}:${String(lightsMin).padStart(2,'0')}`;
  const wakeTime  = `${String(wakeHour).padStart(2,'0')}:${String(wakeMin).padStart(2,'0')}`;
  const hoursInBed = round2(hoursBetween(lightsOff, wakeTime));
  feeling = Math.max(1, Math.min(5, feeling));

  return { lightsOff, wakeTime, hoursInBed, wakeFeeling: feeling };
}

/* ----------------------------------------------------------
   Takeaways
   ---------------------------------------------------------- */
const TAKEAWAY_PRESETS = {
  heavy:  ['Spice bag', 'Chipper', 'Pizza', 'Chinese', 'Kebab'],
  medium: ["Supermac's or McDonald's meal", 'Burrito (Zambrero)', "Nando's with chips"],
  light:  ['Boojum / burrito bowl', "Nando's chicken with rice or salad", 'Poke'],
};

function dailyTakeaways(dow, diet, rand) {
  const entries = [];
  /* Takeaways mainly Fri/Sat */
  if (dow !== 4 && dow !== 5) return entries;

  const chance = diet === 'bad' ? 0.65 : diet === 'moderate' ? 0.35 : 0.15;
  if (rand() > chance) return entries;

  const tier   = diet === 'bad' ? 'heavy' : rand() < 0.5 ? 'medium' : 'light';
  const pts    = CONFIG.takeaway.tiers[tier].points;
  const presets = TAKEAWAY_PRESETS[tier];
  const name   = presets[Math.floor(rand() * presets.length)];

  entries.push({ type: 'takeaway', name, tier, points: pts });
  return entries;
}

/* ----------------------------------------------------------
   Drinks
   ---------------------------------------------------------- */
function dietDrinksForDay(dow, diet, rand) {
  /* Primary drinks night: Friday (or Saturday for spike weeks) */
  const isFri = dow === 4;
  const isSat = dow === 5;
  if (!isFri && !isSat) return null;

  let chance;
  if (diet === 'bad')      chance = isFri ? 0.70 : 0.55;
  else if (diet === 'moderate') chance = isFri ? 0.50 : 0.25;
  else                     chance = isFri ? 0.25 : 0.10;

  if (rand() > chance) return null;

  let level;
  if (diet === 'bad' && isSat) {
    level = 'heavy'; /* triggers the heavy-drinks flag */
  } else if (diet === 'bad') {
    level = rand() < 0.5 ? 'medium' : 'heavy';
  } else {
    level = rand() < 0.7 ? 'light' : 'medium';
  }

  const pts = CONFIG.drinks.levels[level].points;
  return { type: 'drink', level, points: pts };
}

/* ----------------------------------------------------------
   Utilities
   ---------------------------------------------------------- */
/* Deterministic seed from date string for reproducible-ish data */
function dateToSeed(dateStr) {
  return dateStr.split('').reduce((acc, c) => acc * 31 + c.charCodeAt(0), 0) & 0x7FFFFFFF;
}

/* Seeded LCG random -- returns a function that yields [0,1) */
function seeded(s) {
  let state = s || 1;
  return function () {
    state = (state * 1664525 + 1013904223) & 0xFFFFFFFF;
    return (state >>> 0) / 4294967296;
  };
}

function round1(v) { return Math.round(v * 10)   / 10; }
function round2(v) { return Math.round(v * 100)  / 100; }
function calcLoad(min, rpe) { return Math.round(min * rpe / 10 * 10) / 10; }
