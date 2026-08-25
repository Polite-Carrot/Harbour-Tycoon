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
src/state/              Persistence and the React lifecycle wiring
src/ui/                 Presentation
  port/                 The animated harbour scene (SVG)
  Hud.tsx               Money and berth status, overlaid on the scene
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

Purchase gaps must be measured **per port**. Purchases are aggregated across
every port, so six running ports make the overall gap about six times tighter
while each individual port is pacing perfectly. `npm run balance` prints both
and labels which one to tune against:

```
Late-game pacing (last 240 upgrades)
  aggregate gap   12.9s across 6 port(s)
  per-port gap    76.3s  <- the one to tune against
```

## Buying things

Upgrades live in a fixed dock at the bottom of the screen — three tiles under
the thumb — with an **x1 / x10 / MAX** selector. Bulk cost is the closed-form
geometric series, and MAX inverts it rather than looping:

```
n = log(1 + money * (g - 1) / firstCost) / log(g)
```

so buying a thousand levels costs one calculation. Tests assert ten single buys
cost exactly what one x10 buy costs, that MAX never overspends by a cent, and
that it still respects `maxLevel`.



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
| New port | a whole new harbour, in its own colour scheme |

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
