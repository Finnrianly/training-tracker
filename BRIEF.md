# Training Tracker: Build Brief

## What this is
A personal phone web app for one user (Finn) that tracks exercise load, sleep, recovery work, diet "damage" and bodyweight, then gives a Whoop-style weekly review with a Week Score out of 100. It stores all history on the phone, compares weeks and months, and motivates daily by showing "this week so far vs same point last week".

## Hard constraints
- No backend, no accounts, no external APIs, no AI calls, no connectors. Everything runs in the browser.
- Plain HTML, CSS and vanilla JavaScript (no framework, no build step), so it can be hosted as static files.
- Mobile first, designed for an iPhone at 390px wide. Must be installable to the home screen as a PWA (manifest + service worker, works offline).
- Data stored on the device in IndexedDB (or localStorage if simpler), with Export (download JSON backup) and Import (restore from JSON) buttons in Settings.
- Week runs Monday to Sunday.
- All default numbers below (minutes, RPE, targets, points) must live in one config object and be editable from a Settings screen.
- Never use em dashes in any UI text.

## Look and feel
Clean light style. Background #F6F7F9, cards white with 1px #E3E6EB border and 16px radius, text #15181E, secondary text #5A6270, accent blue #1F4FD1, good green #2E7D4F, warning orange #B4520F. Font: Manrope for text, JetBrains Mono for numbers (Google Fonts). Big tap targets (min 44px). Bottom tab bar: Today, Sleep, Week, History, Settings.

## Core formula
**Load = minutes × RPE ÷ 10** (RPE = effort out of 10).

---

## Screen 1: Today (logging)

### Top: pace card (daily motivation)
Two live numbers, each compared to the same point in last week (e.g. Monday to Wednesday this week vs Monday to Wednesday last week), with % change and colour:
1. **Training load so far** (higher is green)
2. **Takeaway Damage so far** (lower is green)

### Gym (one tap, duration pre-filled and editable)
| Type | RPE | Default minutes | Default load |
|---|---|---|---|
| Full body | 8 | 70 | 56 |
| Accessory | 6 | 45 | 27 |
| Abs | 5 | 25 | 12.5 |

### Activity tiles with follow-up questions (one tap per answer, saves on final tap)
| Tile | Follow-up | Minutes | RPE |
|---|---|---|---|
| Football training | Light / Heavy | 75 | 5 / 8 |
| Hurling training | Light / Heavy | 75 | 5 / 8 |
| Football match | Came on / Full game | 30 / 60 | 8 / 9 |
| Hurling match | Came on / Full game | 30 / 60 | 8 / 9 |
| Golf | Walk / Cart, then 18 / 9 holes | 18 holes = 240, 9 holes = 120 | Walk 2, Cart 1 |
| Padel / Tennis | Light / Heavy | 60 | 4 / 6 |
| Run | Enter km and time | from time | Pace under 4:45/km = 8, 4:45 to 5:30 = 7, slower = 5 |
| Conditioning | Enter minutes | entered | 8 |
| Gym cardio | Pick machine (Stairmaster, Treadmill incline walk, Bike, Rower, Cross trainer, Other), enter minutes, pick Easy / Moderate / Hard | entered | Easy 4, Moderate 6, Hard 8 |

### Recovery work (counters, log whenever done)
- Sauna: minutes (+5 / -5 buttons)
- Cold water (ice bath, sea swim, 2+ min cold shower): sessions (+1 / -1)
- Stretching / mobility / yoga: minutes (+5 / -5)

### Diet (log only when it happens; home cooked days need nothing)
**Takeaway Damage** (tap the item, points preset):
| Tier | Points | Preset buttons |
|---|---|---|
| Heavy | 3 | Spice bag, Chipper, Chinese, Indian with naan or chips, Pizza, Kebab |
| Medium | 2 | Burrito (Zambrero / similar), Wrap with chicken and sausage, Supermac's or McDonald's meal, Nando's with chips, Subway footlong |
| Light | 1 | Boojum / burrito bowl, Nando's chicken with rice or salad, Poké, Grilled chicken wrap, Breakfast wrap with vegetables |

Plus an "Other" option where Finn types a name and picks Heavy / Medium / Light.

**Desserts / treats:** +1 counter (each adds 1 point to Takeaway Damage).

**Drinks** (separate line, its own total, not part of Takeaway Damage). Tap one level per night, with the definition shown under each button:
| Level | Definition | Points |
|---|---|---|
| Light | Roughly 1 to 4 drinks | 2 |
| Medium | Roughly 4 to 8 drinks | 5 |
| Heavy | Any night with spirits, or 8+ drinks (nightclub, late night) | 9 |

### Bodyweight
Optional weigh-in field (kg, one decimal). Log as many or as few as Finn wants; ideally about 3 a week, mornings before food. Goal direction: losing weight slowly (0.25 to 0.75 kg a week).

### Logged today
List of everything logged today with its load or points, each deletable and editable. Allow logging to a previous day (date picker) in case Finn forgets.

---

## Screen 2: Sleep (morning, about 10 seconds)
1. **Phone away / lights off** time (e.g. 23:30)
2. **Wake time** (e.g. 08:00)
3. **Time in bed**, calculated automatically (handle crossing midnight)
4. **Wake feeling** 1 to 5 tap: 1 Wrecked, 2 Groggy, 3 OK, 4 Good, 5 Flying

A sleep entry belongs to the date of the morning you woke up.
Below: a 7-night bar chart of time in bed, with bars under 8h in orange.

---

## Screen 3: Week (the weekly review)

### Sunday input
One field: **average daily steps this week** (from Apple Health, entered once).

**Steps load = max(0, avg steps - 6,000) ÷ 1,000 × 14.** Example: 10,000 avg gives 56. Added to the week's total load.

### Headline
**Week Score out of 100**, shown as the full reveal once the week is complete (Sunday). Mid-week the Week screen shows the parts that exist so far and labels the score "in progress".

### Numbers dashboard (every number vs last week, arrow coloured by whether up is good or bad)
- Total training load
- Load ratio
- Gym sessions (count by type)
- Pitch sessions (football and hurling, training and matches)
- Cardio minutes (runs, conditioning, gym cardio)
- Avg time in bed
- Avg wake feeling
- Recovery score
- Sauna min / cold sessions / stretch min
- Takeaway Damage (lower is better)
- Drinks points (lower is better)
- Avg bodyweight and change vs last week
- Avg daily steps

### Charts
- Daily load bars, this week vs last week, Monday to Sunday
- "Where the load came from": load by category (Football, Hurling, Gym, Cardio, Golf/Padel/Tennis, Steps)

### Flags (auto-generated plain-English callouts, max 4, most important first)
Examples of rules:
- Cardio minutes down 20+ min vs last week: "Cardio down 40 min vs last week."
- Load ratio over 1.5: "Spike week. Injury risk is up, pull something back."
- Load ratio under 0.8: "Light week. You coasted."
- 3+ nights under 7.5h in bed: "3 nights under 7.5h in bed."
- Takeaway Damage up vs last week: "Takeaways up: 7 vs 3."
- Heavy drinks night followed by wake feeling of 2 or less: "Heavy night Friday, wake score 2 on Saturday."
- Positive flags in green too: "Takeaway Damage lowest in 4 weeks."

---

## Scoring

### Load ratio
**This week's total load ÷ average total load of the previous 4 weeks.**
- 0.8 to 1.3: green, building
- Under 0.8: coasting
- 1.3 to 1.5: amber, pushing hard
- Over 1.5: red, spike / injury risk
- Before 4 weeks of history: use the average of whatever previous weeks exist, show it greyed out with "Baseline building, X weeks to go". Week 1 has no ratio.

### Recovery score (0 to 100)
| Part | Points | Formula |
|---|---|---|
| Sleep | 65 | avg hours in bed ÷ 8 × 65, capped at 65 |
| Wake feeling | 20 | avg wake score ÷ 5 × 20 |
| Recovery work | 15 | Sauna 5 (min ÷ 45, capped) + Cold 5 (sessions ÷ 3, capped) + Stretch 5 (min ÷ 45, capped) |

Averages use only the nights actually logged.

### Week Score (0 to 100)
| Slice | Points | Rule |
|---|---|---|
| Training | 30 | Ratio 0.8 to 1.3 = 30. Below 0.8: falls linearly to 0 at 0.4. 1.3 to 1.5: falls linearly to 20. Above 1.5: falls linearly to 0 at 2.0. Week 1 (no ratio): show slice as n/a and scale the Week Score from the other slices to out of 100 (same rule for any slice that is n/a). |
| Recovery | 30 | Recovery score × 0.3 |
| Diet: food | 22 | Takeaway Damage (takeaways + desserts) of 2 or under = 22, falls linearly to 0 at 12 |
| Diet: drinks | 8 | Drinks points of 4 or under = 8, falls linearly to 0 at 15 |
| Body | 10 | Weight trend, goal is to lose weight slowly (see below) |

Show the breakdown under the score so Finn can see exactly where points were lost.

### Body slice: weight trend (goal = down)
Weekly change = this week's average weigh-in minus last week's average weigh-in.
| Weekly change | Points | Label |
|---|---|---|
| Down 0.25 to 0.75 kg | 10 | On target |
| Down more than 0.75 kg | 6 | Losing too fast, watch strength |
| Down 0 to 0.25 kg | 6 | Slow |
| Up 0 to 0.25 kg | 3 | Flat |
| Up more than 0.25 kg | 0 | Going the wrong way |
| No weigh-ins this week | 0 | No data |

Thin data rule: if this week or last week has only 1 weigh-in, use a 2-week rolling comparison instead (average of the last 2 weeks minus average of the 2 weeks before, divided by 2) and show a small "low data" tag.
First week ever (nothing to compare to): Body slice is n/a and the Week Score is scaled from the other slices to out of 100.
Extra flags: "Losing too fast, over 0.75 kg this week" and "Weight up 2 weeks running".

---

## Screen 4: History
- **Weekly list:** every past week with Week Score, total load, load ratio, avg time in bed, recovery score, Takeaway Damage, drinks, avg weight. Tap a week to open its full Week review.
- **Monthly view:** per calendar month, the averages of the above plus totals (sessions, cardio minutes, takeaways).
- **Trend charts:** Week Score, total load, avg time in bed, Takeaway Damage and bodyweight over the last 12 weeks.

## Screen 5: Settings
- Edit all defaults (minutes, RPE, targets, takeaway presets and their points, drinks points, score thresholds).
- Export data (download JSON backup with date in filename). Show a gentle reminder on the Week screen if no backup in 14+ days.
- Import data (restore from JSON, with a confirm step).

---

## Build plan (do it in this order, test each step)
1. Project structure, design tokens, tab bar, data layer (save, load, export, import).
2. Today screen: gym, activity tiles with follow-ups, recovery counters, diet, bodyweight, logged-today list.
3. Sleep screen.
4. Scoring engine (load, steps load, load ratio, recovery score, Week Score) as a separate, well-commented JS module with a few unit-style checks using the worked examples in this brief.
5. Week screen with dashboard, charts, flags, pace card on Today.
6. History screen.
7. Settings screen.
8. PWA manifest, icon and service worker for offline use and home-screen install.
9. A "Load sample data" button (in Settings, removable later) that fills 6 weeks of realistic fake data so every screen can be checked before real use.
10. Explain step by step how to host it for free (GitHub Pages or Netlify Drop) so Finn can open it on his iPhone and add it to the home screen.

Ask Finn before changing any number or rule in this brief.
