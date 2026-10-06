/* ============================================================
   CONFIG  --  all tunable numbers and labels live here.
   Settings screen reads from and writes back to this object
   (persisted to localStorage under the key "tt_config").
   ============================================================ */

const DEFAULT_CONFIG = {
  gym: {
    fullBody:  { label: 'Full body',  rpe: 8, minutes: 70 },
    accessory: { label: 'Accessory',  rpe: 6, minutes: 45 },
    abs:       { label: 'Abs',        rpe: 5, minutes: 25 },
  },

  activities: {
    footballTraining: {
      label: 'Football training', emoji: '⚽',
      minutes: 75,
      rpe: { light: 5, heavy: 8 },
    },
    hurlingTraining: {
      label: 'Hurling training', emoji: '🏑',
      minutes: 75,
      rpe: { light: 5, heavy: 8 },
    },
    footballMatch: {
      label: 'Football match', emoji: '⚽',
      minutes: { cameOn: 30, fullGame: 60 },
      rpe:     { cameOn:  8, fullGame:  9 },
    },
    hurlingMatch: {
      label: 'Hurling match', emoji: '🏑',
      minutes: { cameOn: 30, fullGame: 60 },
      rpe:     { cameOn:  8, fullGame:  9 },
    },
    golf: {
      label: 'Golf', emoji: '⛳',
      minutes: { holes18: 240, holes9: 120 },
      rpe:     { walk: 2, cart: 1 },
    },
    padel: {
      label: 'Padel / Tennis', emoji: '🎾',
      minutes: 60,
      rpe: { light: 4, heavy: 6 },
    },
    run: {
      label: 'Run', emoji: '🏃',
      /* RPE determined by pace per km */
      paceThresholds: {
        fast:   285,   /* 4:45 /km in seconds  => RPE 8 */
        medium: 330,   /* 5:30 /km in seconds  => RPE 7 */
        /* slower => RPE 5 */
      },
      rpe: { fast: 8, medium: 7, slow: 5 },
    },
    conditioning: {
      label: 'Conditioning', emoji: '💪',
      rpe: 8,
    },
    gymCardio: {
      label: 'Gym cardio', emoji: '🚴',
      machines: ['Stairmaster', 'Treadmill incline walk', 'Bike', 'Rower', 'Cross trainer', 'Other'],
      rpe: { easy: 4, moderate: 6, hard: 8 },
    },
  },

  recovery: {
    saunaTargetMin:  45,   /* full score threshold */
    coldTargetSessions: 3,
    stretchTargetMin: 45,
  },

  takeaway: {
    tiers: {
      heavy:  { label: 'Heavy',  points: 3 },
      medium: { label: 'Medium', points: 2 },
      light:  { label: 'Light',  points: 1 },
    },
    presets: {
      heavy:  ['Spice bag', 'Chipper', 'Chinese', 'Indian with naan or chips', 'Pizza', 'Kebab'],
      medium: ['Burrito (Zambrero)', 'Wrap with chicken and sausage', "Supermac's or McDonald's meal", "Nando's with chips", 'Subway footlong'],
      light:  ['Boojum / burrito bowl', "Nando's chicken with rice or salad", 'Poke', 'Grilled chicken wrap', 'Breakfast wrap with vegetables'],
    },
  },

  drinks: {
    levels: {
      light:  { label: 'Light',  def: 'Roughly 1 to 4 drinks',                              points: 2 },
      medium: { label: 'Medium', def: 'Roughly 4 to 8 drinks',                              points: 5 },
      heavy:  { label: 'Heavy',  def: 'Any night with spirits, or 8+ drinks (nightclub, late night)', points: 9 },
    },
  },

  steps: {
    baseline:    6000,
    multiplier:  14,
    divisor:     1000,
  },

  loadRatio: {
    coastMin:    0.4,
    greenMin:    0.8,
    greenMax:    1.3,
    amberMax:    1.5,
    redMax:      2.0,
  },

  recoveryScore: {
    sleepWeight:    65,
    wakeWeight:     20,
    workWeight:     15,
    sleepTarget:    8,    /* hours */
    saunaPoints:    5,
    coldPoints:     5,
    stretchPoints:  5,
  },

  weekScore: {
    training:    30,
    recovery:    30,
    dietFood:    22,
    dietDrinks:   8,
    body:        10,
  },

  dietScore: {
    foodGreenMax:   2,
    foodRedMin:    12,
    drinksGreenMax: 4,
    drinksRedMin:  15,
  },

  bodyWeight: {
    targetLossMin: 0.25,
    targetLossMax: 0.75,
  },

  sleep: {
    lowHoursThreshold: 7.5,
    targetHours:       8,
  },

  backup: {
    reminderDays: 14,
  },
};

/* ----------------------------------------------------------
   Runtime config: merge persisted overrides with defaults
   ---------------------------------------------------------- */
let CONFIG = loadConfig();

function loadConfig() {
  try {
    const stored = localStorage.getItem('tt_config');
    if (!stored) return deepClone(DEFAULT_CONFIG);
    return deepMerge(deepClone(DEFAULT_CONFIG), JSON.parse(stored));
  } catch {
    return deepClone(DEFAULT_CONFIG);
  }
}

function saveConfig() {
  localStorage.setItem('tt_config', JSON.stringify(CONFIG));
}

function resetConfig() {
  CONFIG = deepClone(DEFAULT_CONFIG);
  saveConfig();
}

/* ----------------------------------------------------------
   Helpers
   ---------------------------------------------------------- */
function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function deepMerge(target, source) {
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      if (!target[key]) target[key] = {};
      deepMerge(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}
