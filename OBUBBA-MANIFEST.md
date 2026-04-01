# OBubba Logic Manifest
**Last updated: 2026-03-28 — pre-launch session**

## App Ethos
OBubba is a hug from one tired parent to another. Every message, prompt, and notification should be gentle, warm, and supportive. Never clinical. Never judgmental. Always reassuring.

## Core Concept
A baby's day is simple: wake → wake window → nap → wake window → nap → ... → bedtime. The app tracks this rhythm and predicts next events.

---

## OBubba Day Rules
- **An OBubba day runs wake-to-wake**, NOT midnight-to-midnight
- Until the morning wake is logged, the new day does NOT start
- Everything between bedtime and the next morning wake belongs to the CURRENT OBubba day
- A 2:05am night feed on calendar date 26/03 belongs to the 25/03 OBubba day
- `resolveObubbaDay(dayKey, days)` merges cross-midnight entries into one logical day

## Data Storage
- Entries stored in `days[YYYY-MM-DD]` arrays (calendar dates)
- Each entry: `{id, type, time, night, modifiedAt, ...data}`
- Entry types: `wake`, `nap`, `feed`, `sleep` (bedtime), `poop`, `pump`, `note`, `med`, `photo`, `tummy`
- New entries get `modifiedAt: Date.now()` for sync conflict resolution
- `resolveObubbaDay()` combines entries from calendar day + cross-midnight entries

## CRITICAL RULES (learned the hard way)

### autoClassifyNight — CONTRACT
- **ONLY** `wake` and `feed` entries can ever have `night: true`. Everything else is ALWAYS `night: false`.
- Enforced at TWO points: `quickAddLog` (`_autoNight` only for wake/feed) AND `autoClassifyNight` (non-wake/feed → `night: false`)
- **Bedtime must be PM (>=12:00)** to act as night divider — prevents corrupt/early sleep entries from marking all logs as night
- Only runs on TODAY (`selDay === todayKey`) — past days are immutable
- `quickAddLog`, `saveEntry`, `delEntry` all guard: `if (selDay === _todayKey)` before calling autoClassifyNight
- **Why:** Running on past days caused sync conflicts; wrong night classification caused entries to vanish from day view

### Timer/Pill — ONLY shows on today or yesterday
- Nap timer pill: `selDay === todayStr() || selDay === prevCalDay(todayStr())`
- Countdown pill: same guard
- **Never** show timers on old days — it confuses users and creates ghost timers
- 14h bedtime timer safety cap — auto-stops with gentle message

### Night Timer (bedtime pill)
- Driven by `nightTick` state — `setInterval` every 1s when bedtime is active and napOn is false
- Elapsed calculated with seconds precision (hours*3600 + minutes*60 + seconds)
- `todayBedEntry` (tonight's bed) is never blocked by morningWake — only `prevBedEntry` (last night) is
- `prevBedEntry` only shown before noon (night implicitly over after midday)
- `nightEndWake` replaces `morningWake` in timer calculations to prevent tonight's timer vanishing

### Live Activity lifecycle
- `delEntry` stops LA when bedtime or active nap entry is deleted
- Shake-to-undo stops LA when undoing a sleep log
- `timerMode` reset to `"prediction"` when bedtime deleted

### In-app account creation (claimAccount)
- After 3rd log, if no username: shows "Protect your data" prompt
- `claimAccount(username, pin)` links username+PIN to EXISTING backup code — no data wipe, no new code
- Dismissed via "Skip for now" → `ob_claim_dismissed` in localStorage (permanent)
- Different from `reserveUsername` which generates NEW code and wipes data

### Entries are (nearly) immutable after creation
- `night: true/false` set once at creation time, based on context
- No background process should modify stored entries
- v2 goal: classify `isNight` at DISPLAY time, not STORAGE time

## Sleep Prediction Logic

### Wake Windows (WW)
- Age-appropriate ranges from `getWakeWindow(ageWeeks)` → `{min, max}`
- Progressive through the day (first WW shortest)
- **Gentle-nudge blending:**
  - Personal avg < NHS min → nudge up max 10min/day
  - Personal avg within NHS range → use personal as-is
  - Personal avg > NHS max → nudge down max 10min/day
- Applied in both `predictNextNap()` and `bedtimePrediction()`

### Nap Prediction
- Simple: `last sleep end + age WW = predicted next nap`
- Tick effect computes expected naps, checks if naps complete
- If predicted time passed → show "Nap Now!" or switch to bedtime

### Nap Count & Transitions
- Age defaults from `getAgeNapProfile(ageWeeks)`
- Transitions only flagged at NHS age windows (3→2 at 26+ weeks, NOT before)
- If baby naturally consolidates (fewer naps, healthy total sleep) → inform user, don't force extra naps
- If fewer naps AND total sleep below range → suggest bridge nap

### Bedtime
- After all naps done: `last nap end + last WW = bedtime`
- Clamped to age max (7:30pm for 3-9mo)
- Pill click logs `type: "sleep"` (bedtime), not `type: "nap"`
- 4h+ nap auto-converts to bedtime

## Sync Architecture

### Current (v1 — Step 1 deployed)
- Firebase Firestore: `families/{backupCode}` stores entire children JSON
- **Timestamp-based merge:** each entry has `modifiedAt`, newest wins
- Deletions tracked in `deletedEntryIdsRef` (session-level)
- `mergeChildren()` compares entries by id + modifiedAt
- Remote wins ties (safe default)

### Known issues
- `child_code_map` PERMISSION_DENIED — needs Firebase Console rule update
- Pin collision vulnerability — same pin + different username could show wrong data (MUST fix before v2)
- Full document overwrites still happen (giant JSON blob)

### v2 Plan (Step 2 — NOT yet implemented)
- Move to subcollections: `families/{code}/children/{childId}/days/{date}/entries/{entryId}`
- Migration plan: snapshot → write new → verify → dual-read 2 weeks → cleanup
- Backup document: `families/{code}_backup` before migration
- Version flag in localStorage controls which structure to read

## Weaning: Milk-to-Solid Ratio (NHS/WHO)
| Age | Milk Min | Solid Meals | Ratio |
|-----|----------|-------------|-------|
| <6mo | 500ml | 0 | 100% milk |
| 6mo | 500ml | 1 | 90/10 |
| 7mo | 500ml | 2 | 75/25 |
| 8-9mo | 500ml | 3 | 60/40 |
| 10-11mo | 400ml | 3+1 | 45/55 |
| 12mo+ | 300ml | 3+2 | 30/70 |
- Card shows in Feeding Insights at 5.5mo+
- Alerts: low milk (<500ml at <12mo), no solids at 8mo+

## Forgotten Wake Detection
- If logging daytime entry on today with no wake → gentle prompt
- 14h bedtime timer cap → auto-stop with warm message
- Phantom wake: 10 min before first daytime entry if user dismisses prompt
- Empty days (0 entries or only auto wake) excluded from averages

## UI Rules
- Toggles: selected = white background + shadow, unselected = transparent
- Keyboard: `resize: "native"` in Capacitor config
- Splash: `launchShowDuration: 5000`, `launchAutoHide: true`
- Date pills: `touchAction: "pan-x"` for scroll fix

## Native Plugins (all registered but need Xcode config)
- `OBLiveActivity` — Dynamic Island (needs widget extension embedded)
- `OBSiriShortcuts` — needs `.intentdefinition` file

- `OBWidgetBridge` — needs app group match
- `DisableBounce` — working
- Push notifications — working (APNs cert needed)

## Build Process
1. Edit `public/app.jsx` (source of truth)
2. `cp public/app.jsx dist/app.jsx`
3. `npx cap copy ios`
4. `rm -rf ~/Library/Developer/Xcode/DerivedData/App-*` (if caching)
5. Xcode: Shift+Cmd+K (clean), Cmd+B (build)

## Firebase Console TODO
- Add rule: `match /child_code_map/{docId} { allow read, write: if request.auth != null; }`
- Verify APNs certificate configured
- Check pin collision vulnerability in auth flow

## Weekend Launch Checklist
- [x] Bedtime pill fix (todayBedEntry/prevBedEntry split)
- [x] Nappy logs fix (day/night classification contract)
- [x] Live Activity cleanup on delete + undo
- [x] Night timer ticking (nightTick interval + seconds precision)
- [x] ACN safety guard (bedtime must be PM)
- [x] In-app account creation prompt (claimAccount)
- [x] App tour rewrite (TUT_STEPS — 15 steps, accurate)
- [x] Schedule builder personal wake windows
- [ ] Verify today's logging works (wake → nap → feed → bedtime → night wake)
- [ ] Verify past days don't change when browsed
- [ ] Verify sync between two devices doesn't corrupt data
- [ ] Fix Firebase child_code_map rules
- [ ] Test app cold start (splash → app load)
- [ ] Archive and submit to App Store
- [ ] GTMSessionFetcher/GoogleSignIn pods removed — should pass ITMS-91061

## Post-Launch (v1.1)
- Siri JS bridge (Swift side done, JS read side not built)
- Child sync code permanence for linked partners
- Widget "Nap" vs "Bed" prediction fix
- Step 2 database migration (subcollections)
- Display-time night classification (remove autoClassifyNight entirely)
- Native features: widgets, Live Activities, Siri intents
- Pin collision auth fix
- Entry-level sync with tombstones (proper deletion tracking)
