# Harbour Tycoon

Idle/incremental port management game. Expo + React Native + TypeScript.

This is the **vertical slice**: one berth, one cargo type, three upgrades,
save/load, and offline earnings on resume. The UI is deliberately plain.

## Run it

```bash
npm install
npm start          # then scan the QR code with Expo Go
npm run web        # or play it in a browser
```

```bash
npm test           # sim + balance regression tests
npm run typecheck
npm run balance    # economy tuning report (see below)
npm run build:web  # static web bundle into dist/
```

## Playing it on GitHub Pages

Pushing to `main` builds and deploys automatically
(`.github/workflows/pages.yml`). It runs typecheck and tests first, so a broken
build never reaches the site.

**One-time setup:** repo Settings -> Pages -> Source -> **GitHub Actions**.
Not "Deploy from a branch" — the site is built, not committed.

The site lands at `https://polite-carrot.github.io/Harbour-Tycoon/`.

Two things about that URL are load-bearing:

- **It is a subpath, not a root.** Expo's web export writes absolute asset
  URLs (`/_expo/static/...`), which 404 under `/Harbour-Tycoon/`. The workflow
  sets `PAGES_BASE_URL` and `app.config.ts` feeds it to `experiments.baseUrl`
  so every URL is rewritten. The var is derived from the repo name, so a fork
  or a rename still builds. Locally it is empty, so dev still serves from root.
- **`.nojekyll` is required.** Pages otherwise runs Jekyll, which drops
  underscore-prefixed directories — silently deleting the entire `_expo/`
  bundle and leaving a blank page.

Saves use `localStorage` on web, so progress is per-browser and does not follow
you between devices. Closing a tab is handled: `pagehide`/`beforeunload` flush
a save, since a browser tab can close without the `AppState` transition that
native relies on.

## Where things live

```
src/config/balance.ts   EVERY tunable number. Nothing else hard-codes balance.
src/sim/                Pure simulation. No React, no storage, no clock.
  engine.ts             advance / catchUp / buyUpgrade / buyPort / sanitise
  economy.ts            cost curves, port tiers, bulk-buy maths
  policy.ts             "active player" model, shared by report + tests
  format.ts             big-number, currency and duration display
  stats.ts              the summary the settings panel reports
src/state/              Persistence and the React lifecycle wiring
src/ui/                 Presentation
  port/                 The animated harbour scene (SVG)
  Hud.tsx               Money and berth status, overlaid on the scene
  SettingsButton.tsx    Gear cog, top right of the scene
  SettingsModal.tsx     Lifetime stats, resume, guarded reset
  PortSwitcher.tsx      Owned ports + the buy-a-port card
  BuyDock.tsx           Upgrade tiles and the x1/x10/MAX selector
App.tsx                 Screen composition
scripts/balance-report.ts  Tuning harness
```

## Owning several ports

The harbour is not one port. Each port runs **its own berth and its own
upgrade levels**, and they all tick at once — total income is the sum.

A new port costs `baseCost * costGrowth^i` and is a real milestone: on the
current tune the second opens around 80 minutes in, and the rest follow roughly
every half hour.

The design rule that makes this safe: **port `i` scales its yields AND its
upgrade costs by the same tier factor** (`scaleGrowth^i`, currently 12). That
makes every port a self-similar copy of the first, so the stability rule below
holds per-port and therefore holds for the sum, no matter how many are owned.
Scaling yields without costs would make each new port trivially farmable — a
fresh cheap upgrade track funded by an established port's income. There is a
test asserting both sides scale together.

New ports start at level 0, so expansion gives back the fast early-game
purchase rhythm at a higher tier. Each has its own livery, so switching ports
visibly changes where you are.

### Reading the pacing numbers

Purchase gaps must be measured **per track, per port**. Purchases aggregate
across every port AND every upgrade, so six ports times six tracks makes the
overall gap about thirty-six times tighter — which says nothing about whether
any one thing paces well. A genuine runaway shows up as the per-track number
collapsing toward zero. `npm run balance` prints all three and labels which
matters:

```
Late-game pacing (last 240 upgrades)
  aggregate gap   9.4s across 6 port(s)
  per-port gap    46.8s
  per-track gap   93.9s  <- the runaway detector
```

### Pricing cannot pace expansion

`ports.costGrowth` is 20,000. That looks absurd and it is, deliberately.

Late-game income doubles every couple of minutes, so a port priced at 16x the
last one is reached almost instantly and every port unlocks in one compressed
burst. Measured spacing between port unlocks: **16x -> ~8 min apart, 1000x ->
~13 min, 20000x -> ~15-18 min**. Four orders of magnitude of price bought about
ten minutes.

The conclusion is that money cannot gate expansion in an economy that compounds
this fast. Properly spacing ports needs a gate money cannot buy — a
requirement on the previous port's development, or prestige. Neither exists in
the slice yet, so ports currently all open inside the first ~2.5 hours.

## Buying things

Upgrades live in a horizontal **carousel** at the bottom of the screen —
cheapest on the left, most expensive on the right — with an **x1 / x10 / MAX**
selector.

The order is fixed in `UPGRADE_ORDER`, **not** sorted by live cost. Costs grow
exponentially as you level, so a live sort would reshuffle tiles between taps
and you would buy the wrong thing. A test asserts the base costs stay
ascending, which makes that ordering the UI's contract.

### The value ladder

**A dearer track must buy more.** Measured on a fresh port, one level of each
track multiplies income by more as base cost rises:

| track | base cost | effect | fresh-port gain | cap |
|---|---|---|---|---|
| Cranes | $30 | unload faster | x1.037 | 30 |
| Ship Size | $45 | more cargo per ship | x1.05 | — |
| Contracts | $75 | better price per unit | x1.06 | — |
| Tugboats | $900 | ships reach the berth sooner | x1.080 | 7 |
| Floodlights | $12K | multiplies what a ship is worth | x1.10 | 25 |
| Customs House | $250K | biggest price multiplier | x1.13 | 40 |

`balance.test.ts` asserts that ordering. It was wrong before, in two ways worth
knowing about if this is ever retuned:

- **Contracts cost more than Ship Size and did less** ($75 for +6% against $45
  for +8%) — a plain inversion.
- **The expensive tracks were irrelevant.** `npm run balance` now tallies
  purchases per track, which is how this was caught: over eight hours the old
  tune bought `shipSize` 3454 times but `customs` exactly 75 — 15 levels on
  each of 5 ports, then never again. Their whole lifetime contribution was
  `1.10^15 = 4.2x` against shipSize's `1.08^726 ~ 10^24`. Retuned, customs is
  bought 200 times and the capped tracks together are worth ~1400x.

Two constraints shape what is possible here:

- **`effectPerLevel` must stay below that track's own `costGrowth`** (~1.15),
  or each level is better value than the last and the whole track gets bought
  in one burst. So per-level effects *cannot* scale freely with price — deeper
  **caps** are what let a dear track be worth more overall.
- **Timing tracks are bounded by the cycle floors**, so they can never sit high
  on the ladder and belong at the cheap end. Floodlights used to be one, which
  is why a $12K tile was buying less than a $45 one; it is now a yield
  multiplier.

### Payback time

Every tile shows how long a purchase takes to repay itself (`cost / income
gained`). Price alone does not compare two tiles — a $250K upgrade buying
+$185/s and a $15K one buying +$101/s look similar until you see one repays in
22 minutes and the other in 2.5.

Note the carousel is ordered by **base** cost, which is stable. Once tracks are
levelled unevenly their *current* prices will not be in order; payback is the
signal to read instead.

Every track after the original three is **capped**, and that is forced, not
stylistic: the uncapped budget is 1.05 x 1.06 = 1.113 against a 1.15 ceiling.
A capped track terminates, contributing a bounded one-off multiplier, so it
cannot compound into a runaway. Any new uncapped track would have to come out
of that budget.

A track pinned against a floor (arrival or unload) has levels left but adds
nothing. The carousel greys those out as **CAPPED / no further effect** rather
than inviting the spend — without it, Tugboats kept selling at $5.64K a level
for $0.00/s.

Bulk cost is the closed-form geometric series, and MAX inverts it rather than
looping:

```
n = log(1 + money * (g - 1) / firstCost) / log(g)
```

so buying a thousand levels costs one calculation. Tests assert ten single buys
cost exactly what one x10 buy costs, that MAX never overspends by a cent, and
that it still respects `maxLevel`.

Purchases also refuse a price that has overflowed to `Infinity`. A deep enough
session genuinely reaches it, and `Infinity < Infinity` is false — so an
unguarded compare would let an infinitely rich player buy at an infinite price
and land on `money = NaN`, poisoning every later tick. Past the suffix table
(`Dc`, 10^33) numbers render as `1.83e44` rather than an unreadable
`181642849488Dc`.



The split that matters: `src/sim/` imports nothing from React, AsyncStorage or
`Date.now()`. Time is always passed in. That is what makes the economy testable
without a device and portable if the UI is ever replaced.

## The port scene

`src/ui/port/` draws a night harbour in SVG: ships sail in, moor, and are
worked by gantry cranes while the container yard on the quay fills up.

The scene fills whatever space the controls do not need, and is rendered with
`preserveAspectRatio="slice"` so it crops rather than letterboxes. That is why
the berth is **centred** at every ship scale — the crop then eats empty water
instead of the hull. A test asserts it.

It is **derived from the simulation, not animated alongside it**. The scene
recomputes its position in the berth cycle from the save's own clock —
`berthCycleSeconds` as of `lastTickAt`, plus wall time since — so it holds no
animation state of its own and can never drift from the economy. Pause the sim,
reload, come back four hours later: the scene picks up wherever the maths says
the ship should be.

The sim ticks at 10Hz, which would make ships visibly stutter, so the scene
keeps its own 45fps frame clock (`useSceneClock`). That only affects pixels —
money still comes from the sim alone.

What the upgrades actually look like:

| upgrade | visible effect |
|---|---|
| Cranes | more gantries on the quay (1 -> 4), working faster |
| Ship Size | bigger hulls, taller deck stacks |
| Contracts | no direct visual — it is a price multiplier |
| Tugboats | tugs escorting the ship in |
| Floodlights | lit masts along the quay |
| Customs House | a lit shed on the quay |
| New port | a whole new harbour, in its own colour scheme |

Quayside structures must sit within roughly x 60-260 of the viewBox. The scene
renders with `slice`, so anything outside that band is cropped away and never
seen — which is exactly what happened to the first placement of the floodlight
masts. There is a test.

Both ship dimensions **cap** well before the numbers do: ship size passes level
130 within a few hours, so the art saturates around level 14 or the hull would
grow off the edge of the scene. `geometry.test.ts` enforces the caps, that
growth is monotonic up to them, and that a fully laden deck stack still passes
under the crane booms — the invariant most easily broken by nudging one
constant.

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

## Settings

A gear cog sits at the top right of the scene. It opens the Harbour Office:
lifetime stats, **Resume**, and **Reset save**.

Reset is guarded by an explicit confirmation that names what is about to be
lost — lifetime earnings, ports, upgrades bought — before anything happens.
Three details worth keeping if this is ever restyled:

- The confirmation **swaps the panel's contents** rather than stacking a second
  `Modal`. Nested modals are unreliable on react-native-web, and this keeps the
  destructive action on a screen where nothing else is tappable.
- **Cancel has equal visual weight** to the destructive button, so the safe
  choice is never the harder target. The two also sit at different heights from
  the "Reset save" link that opened the screen, so a stray second tap cannot
  fall through onto the confirm.
- Reopening settings always lands on the stats, never back on the
  confirmation.

The reported numbers come from `gameStats()`, a pure function in `src/sim/`,
so the panel cannot invent a stat the sim disagrees with — there is a test
asserting its income matches `totalIncome()` exactly.

## Save / load

- `AsyncStorage`, single JSON blob, versioned. **v1 saves migrate**: the old
  flat single-port shape is lifted into `ports[0]`, keeping levels, money and
  lifetime earnings. Anyone who played the deployed build keeps their harbour.
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
the slice. Buying ports is **expansion, not prestige**: nothing resets, and no
permanent multiplier is earned.

Two hooks are already in place for prestige when it lands: `lifetimeEarnings`
is tracked separately from spendable `money` and is never decremented by
purchases, and `deriveStats()` is the single choke point where a permanent
multiplier would be applied.

## Known limitations of the slice

- One berth per port. Several berths within a port would need
  `berthCycleSeconds` to become an array (the closed-form maths is per-berth
  and unchanged).
- Six ports is the ceiling, and the switcher is a horizontal strip — it will
  need rethinking if that ever grows.
- Cargo sells instantly at the dock. There is no warehouse, so no storage cap
  and nothing to overflow.
- Cranes stop being worth buying at level 30 by design. Nothing in the UI says
  so yet beyond the `MAX` label.
- Web saves live in `localStorage`, so clearing site data wipes the port and
  progress does not sync across devices.
