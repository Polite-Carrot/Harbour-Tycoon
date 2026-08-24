# Harbour Tycoon

Idle/incremental port management game. Expo + React Native + TypeScript.

This is the **vertical slice**: one berth, one cargo type, three upgrades,
save/load, and offline earnings on resume. The UI is deliberately plain.

## Run it

```bash
npm install
npm start          # then scan the QR code with Expo Go
```

```bash
npm test           # sim + balance regression tests
npm run typecheck
npm run balance    # economy tuning report (see below)
```

## Where things live

```
src/config/balance.ts   EVERY tunable number. Nothing else hard-codes balance.
src/sim/                Pure simulation. No React, no storage, no clock.
  engine.ts             advance / catchUp / buyUpgrade / sanitise
  economy.ts            cost curves and derived stats
  policy.ts             "active player" model, shared by report + tests
  format.ts             big-number and duration display
src/state/              Persistence and the React lifecycle wiring
src/ui/ + App.tsx       Presentation
scripts/balance-report.ts  Tuning harness
```

The split that matters: `src/sim/` imports nothing from React, AsyncStorage or
`Date.now()`. Time is always passed in. That is what makes the economy testable
without a device and portable if the UI is ever replaced.

## How the simulation works

A berth runs a repeating cycle:

```
|<-- arrival (4s) -->|<------- unload (6s) ------->|
   no income            cargo sells continuously
```

Progress is a **closed-form function of elapsed time**, not an accumulation of
frames. Given a delta of any size, the engine computes:

```
ships = fullCyclesCrossed - unloadedFractionAt(start) + unloadedFractionAt(end)
```

Two consequences, both deliberate:

- **Offline progress is not a special case.** Being away four hours is the same
  `advance()` call as a 100ms UI tick, with a bigger number. It costs O(1) and
  loses nothing to rounding — there's a test asserting one 3600s call equals
  36,000 stepped calls of 0.1s.
- **Frame rate cannot change payout.** A throttled timer or a blocked JS thread
  costs the player nothing; every tick asks the wall clock what really elapsed.

There is no `Math.random()` anywhere in `src/sim/`. Same state + same elapsed
time always produces the same result.

## Tuning the economy

All numbers are in `src/config/balance.ts`. Change them, then:

```bash
npm run balance
```

which simulates an active player for four hours and prints time-between-
purchases, the income curve, and offline yield. Current tune:

| metric | value |
|---|---|
| opening income | 0.80/s (8 cargo per 10s cycle) |
| first upgrade | 30 (~38s of play) |
| first 20 purchase gaps | mean 50s, all within the 30–90s target |
| gaps out to 4h | 35–64s |
| offline cap | 4 hours, full rate |

### The stability rule

Income is the **product** of every track's effect, so uncapped tracks compound
together. If their combined per-level effect exceeds the cheapest cost growth,
purchases accelerate without bound and the economy hits `Infinity` within the
hour — the first tune of this game did exactly that (`shipSize` reached level
3186 in 55 minutes). Keep:

```
shipSize.effectPerLevel * contracts.effectPerLevel  <  min costGrowth
current: 1.08 * 1.06 = 1.1448  <  1.15
```

`balance.test.ts` enforces this directly, and also plays three simulated hours
asserting nothing overflows. Cranes are exempt: they're capped at level 30 and
their effect asymptotes to the `minUnloadSeconds` floor, which is what rotates
the player onto the other two tracks.

## Save / load

- `AsyncStorage`, single JSON blob, versioned.
- Written on background/inactive (`AppState`), on unmount, on every purchase,
  and on a 15s autosave.
- Everything loaded from disk goes through `sanitise()` before it reaches the
  sim. A single `NaN` from a corrupt or tampered save would poison every
  subsequent tick, so every field is range-checked and upgrade levels are
  clamped to `maxLevel`.
- A save whose `lastTickAt` is in the future (clock moved back) credits nothing
  rather than paying out or going negative.

## Deliberately not built yet

Ads, IAP, prestige, art, sound, analytics, achievements — all out of scope for
the slice.

Two hooks are already in place for prestige when it lands: `lifetimeEarnings`
is tracked separately from spendable `money` and is never decremented by
purchases, and `deriveStats()` is the single choke point where a permanent
multiplier would be applied.

## Known limitations of the slice

- One berth. `berthCycleSeconds` is a single scalar; multiple berths will need
  it to become an array (the closed-form maths is per-berth and unchanged).
- Cargo sells instantly at the dock. There is no warehouse, so no storage cap
  and nothing to overflow.
- Cranes stop being worth buying at level 30 by design. Nothing in the UI says
  so yet beyond the `MAX` label.
