# Harbour Tycoon

Idle/incremental port management game. Expo + React Native + TypeScript.

Run a busy container port: ships sail in, gantry cranes unload them, and every
upgrade you buy shows up in the harbour.

## The 3D harbour

On the web the port is a full 3D scene (three.js) you can explore:

- **Drag** to pan around the port, **scroll / pinch** to zoom, **right-drag /
  two-finger twist** to orbit. The ⌖ button flies back to the berth.
- **Day and night.** One harbour day lasts 8 real minutes. The sun crosses the
  sky, then dusk, lit windows, street lamps, floodlights, a sweeping lighthouse
  and a moonlit sea. The clock top-left shows the harbour time.
- **Upgrades are visible.** Cranes add gantries on the quay rails, ship size
  grows the hull and its stacks, tugboats escort and hold the ship, floodlights
  put up light masts, the customs house appears on the quay, and contracts fill
  the container yard.

- **Detailed models.** The hero models (container ship, tug, 20 ft
  container, gantry crane, dolphin, humpback, shark, fish, yacht, cruise
  liner and the VIP tall ship) are built in code to a written spec, in
  `src/ui/port3d/models/`. Containers have corrugated walls, corner castings
  and door gear. Ships have lofted hulls painted in crisp bands, a bulbous
  bow, bridge wings, lifeboats, railings, lashing frames, a turning radar and
  a spinning propeller, plus funnel smoke and their name on the bow. Each
  port repaints the ship's hull, bottom and funnel and the cranes in its
  livery, and ship, tug and liner windows light up at night. See
  [The models](#the-models).
- **Living sea.** Rolling waves (calm inside the breakwater, a real swell
  outside), sky reflections, sun glitter, whitecaps, foam on the quay, beach
  and breakwater, and ship wakes drawn into the water. The water is slightly
  see-through, so you can see what is swimming under it.
- **A living town.** A street grid with pavements, crossings, street trees
  and lamps; blocks of shops (lit windows, awnings) and flats; a market square
  with a fountain, stalls, café, bunting and pigeons; and a town hall whose
  clock tower keeps harbour time. A few hundred people walk the pavements,
  stroll the square, chat, shop and sit at the café, some with dogs, while
  cars circle the blocks and buses run the ring road (lights on at night).
- **Every port is somewhere different.** The quay, cranes and yard work the
  same everywhere, but each port has its own setting (`src/ui/port3d/theme.ts`):
  Old Harbour is a green seaside town, Saltmere Quay a desert port with
  sandstone houses, domes, palms and red mesas, Kestrel Bay a big city of glass
  skyscrapers, Northreach a snowy northern harbour with pines and painted
  wooden houses, Cape Verity a tropical island with pastel houses, palms and a
  volcano, and Aurelia Deep a white-washed Mediterranean town with terracotta
  roofs, blue domes and cypresses. Past those, Hanami Wharf is a Japanese
  harbour in cherry blossom, Tulpenhaven a Dutch town of brick and windmills,
  Kilima Coast a savanna town under acacias with a snowy giant on the horizon,
  and Neo Arcadia a neon city of the future. Each has its own sea colour, and
  its own town square: the same square of stalls, café and benches, round its
  own landmark (fountain, oasis pavilion, steel ring, Christmas tree,
  bandstand, tiled fountain, torii gate and koi pond, windmill, baobab, neon
  spire) with the town hall in local colours (`square.ts`). Switching port
  rebuilds the land around you.
- **Four fun ports past the tenth.** Same economy, whole new worlds
  (`worlds.ts`, `models/vessels.ts`): **Skull Rock Cove**, a pirate cove
  where galleons bring in treasure chests under a skull-shaped crag;
  **Coral Deep**, a base on the seabed with cargo submarines and mini-sub
  tugs: glass domes with coral gardens inside, porthole towers, and tubes
  between them and over the avenues; **Tranquility Base**, a moon base of
  half-sunk habitat modules, white domes, solar farms, dish masts and
  landing pads, with space freighters hovering over a cratered landing field
  and Earth in the black sky; and **Orbital One**, the deck of a huge
  starship (stepped superstructure with light strips, radiator fins and
  turrets, a hull stepping down below, a long bow, a bank of glowing engines
  and the bridge behind town), where freighters dock in the void below a
  ringed planet, nudged in by thruster drones. These three build their towns
  in `habitat.ts`. Every vessel keeps the container ship's cargo layout, so the
  cranes work them all the same way.
- **Sea life.** A dolphin pod porpoises through the harbour, humpback whales
  blow, dive tail-up and breach out at sea, sharks patrol with their fins out,
  and schools of fish mill under the surface (now and then one jumps). A
  prompt pops up when a whale breaches; tap **Look** to fly the camera there.

**Ship handling.** Ships come in parallel to the quay and stop off the berth;
tugs (always one, a pair from Tugboats level 4) meet them, push them
sideways onto the berth, stand by during unloading, haul them off on towlines
and cruise back to meet the next ship. While she is alongside, each gantry crane
stands over its own bay and works it like a real one: it lifts the top
boxes off onto a stack on the quay under its legs, then loads the last
ship's boxes back into the gaps, so every box is always somewhere and each
ship leaves full (`src/ui/port3d/cargo.ts`). Faster cranes move more boxes
per ship. The economy's cargo cycle runs far
faster than any real berthing could, so the 3D berth runs its own steady
routine (`src/ui/port3d/berthing.ts`) while the money, the HUD and the "+$"
pops still follow the simulation exactly.

## The models

`src/ui/port3d/models/` builds the harbour's hero models. They follow one
spec, so the same code serves the game and a standalone .glb export:

- **Axes and units.** +Y up, bow or nose toward +X, 1 unit = 1 game unit.
  Boats sit with their origin on the waterline at the centre of the hull;
  the crane at the centre of its base on the ground; the container and the
  animals at their centre.
- **Moving parts are named nodes.** On the ship, `Radar` turns about Y and
  `Propeller` about X. On the crane, `Trolley` slides along Z, and
  `Spreader` and `HoistRopes` hang from it: lower the spreader by its local
  Y and stretch the ropes (scale Y) to match. The tall ship's square sails
  are `Sail…` meshes that billow along local X.
- **Budgets.** Container ship 15,000 triangles, tug 4,000, container 800,
  crane 6,000, dolphin and shark 3,000, whale 5,000, fish 300.
  `models.test.ts` holds every model to its budget, its dimensions and its
  named parts.
- **Colour.** The container is one pure-white material so each instance
  can be tinted. The animals are vertex-coloured (dark back, pale belly) and
  bend in the vertex shader as they swim, along evenly spaced rings.

```bash
npm run models:export               # every model -> models-out/*.glb + manifest.json
npm run models:export -- dolphin    # just the ids listed
```

The export fails if a model goes over budget, reaches 2 MB, or loses a
named moving part. `models-out/` is git-ignored: the game builds its models
at runtime and ships no model files.

## Coming back for more

A run takes a couple of hours to build a port empire; the game is built to be
played over weeks.

**Late upgrades.** Three dear, capped tracks open one after another through
the third and fourth hours:
**Rail Link** (container trains run inland along the coast), **Dredging** (a
grab dredger works the channel, and ships grow a size class) and **Cruise
Terminal** (a terminal hall and a liner alongside). Each one appears in the
3D harbour when bought.

**Head Office (prestige).** Once a run has earned $1M, the company can be sold
for Reputation stars. Stars are permanent: each adds +10% income on every port,
for good. Star milestones unlock perks:

| Stars | Perk |
| ---: | --- |
| 10 | Seed Capital: runs start with $10K |
| 25 | Night Shift: offline earnings build for 8h |
| 50 | Experienced Crews: new ports start at level 5, with a tug |
| 100 | Investor Network: ports cost 90% less |
| 200 | Harbour Master: offline earnings build for 12h |
| 400 | Trade Empire: daily rewards pay double |
| 800 | Golden Fleet: all income doubled |
| 1500 | Shipping Dynasty: doubled again |

Stars are linear in the exponent of what a run earned (5 per 10x). Steeper
curves snowballed in simulation: runs collapsed from hours to two minutes and
every perk unlocked on day one. With the linear curve a first 8-hour run is
worth ~38 stars and later runs 60-75, so the ladder takes many sessions.

**Daily.** A seven-day login streak (minutes of income, stars on day seven;
miss a day and it restarts), three daily contracts sized to the port (handle
N ships, buy N levels, earn $N; the earnings contract also grants 15 minutes
of double income), and a **VIP tall ship** that sails through the bay for two
minutes in every quarter hour; tap the banner while she's in for a bonus.
Rewards are paid as minutes of current income, so they matter at every stage.
Contracts, VIP visits and streak days are all deterministic and seeded from
the date (local midnight), so they need no server.

**While you were away (rewarded ad).** The popup that greets a returning
player offers **Watch ad: x3**: watch a rewarded ad and the away earnings
are tripled (`offline.adMultiplier`), or tap *No thanks* to keep them as
they are. Closing the ad early keeps the popup, so nothing is lost.

**Time Warp (rewarded ad).** The ⏩ pill in the top-left corner offers a
day of income at once (current rate × 24h) for watching a rewarded ad: up to
3 a day, at least 2 hours apart. The harbour plays a quick time-lapse of the
day as it pays out. Rules in `src/sim/timewarp.ts`, tuning in
`BALANCE.timeWarp`.

The ad itself sits behind `src/ads/rewardedAd.tsx`, which currently shows a
clearly labelled **test ad** (a 15-second countdown, no ad network). Going
live means swapping that one file for a real provider, keeping its contract
(resolve `true` only on the network's "reward earned" event):
`react-native-google-mobile-ads` for the apps (needs an EAS dev build and an
AdMob account), or a web rewarded-ad network for the browser build (Google's
H5 games ads need an approved AdSense site on your own domain).

Native builds (Expo Go) still draw the flat 2D SVG harbour; `PortView.tsx` /
`PortView.web.tsx` pick the right one per platform. If a browser cannot create
a WebGL context, the web build falls back to the 2D scene as well.

Add `?debug` to the URL to expose `window.__harbour` (camera, controls, world)
for poking at the scene from the browser console.

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

The site is served straight from `main`, with no GitHub Actions: Settings ->
Pages -> **Deploy from a branch** -> `main`, `/ (root)`. The built game is
committed in the repo root next to the source (`index.html`, `favicon.ico`,
`metadata.json`, `_expo/`, `.nojekyll`), so publishing an update is:

```bash
npm run publish:web   # typecheck, test, build, copy the build into the root
git add -A && git commit -m "Publish" && git push   # to main
```

`publish:web` refuses to build if the typecheck or tests fail, and replaces
the previous build (the bundle's file name changes every time). The site
lands at `https://polite-carrot.github.io/Harbour-Tycoon/`.

Two things about this are load-bearing:

- **It is a subpath, not a root.** Expo's web export writes absolute asset
  URLs (`/_expo/static/...`), which 404 under `/Harbour-Tycoon/`. The
  publish script sets `PAGES_BASE_URL` (default `/Harbour-Tycoon`) and
  `app.config.ts` feeds it to `experiments.baseUrl` so every URL is
  rewritten. Locally it is empty, so dev still serves from root.
- **`.nojekyll` is required.** Pages otherwise runs Jekyll, which drops
  underscore-prefixed directories (the whole `_expo/` bundle) and shows this
  README instead of the game.

Saves use `localStorage` on web, so progress is per-browser and does not follow
you between devices. Closing a tab is handled: `pagehide`/`beforeunload` flush
a save, since a browser tab can close without the `AppState` transition that
native relies on.

## Where things live

```
src/config/balance.ts   EVERY tunable number. Nothing else hard-codes balance.
src/sim/                Pure simulation. No React, no storage, no clock.
  engine.ts             advance / catchUp / buyUpgrade / buyPort / sellCompany
                        / claim rewards / sanitise
  prestige.ts           Reputation stars, perks, the income multiplier
  daily.ts              login streak, daily contracts, VIP visits (seeded)
  timewarp.ts           rewarded-ad Time Warp: limits and payout
src/ads/                Rewarded-ad provider (a test ad for now)
  economy.ts            cost curves, port tiers, bulk-buy maths
  policy.ts             "active player" model, shared by report + tests
  format.ts             big-number, currency and duration display
  stats.ts              the summary the settings panel reports
src/state/              Persistence and the React lifecycle wiring
src/ui/                 Presentation
  port/                 Harbour views: PortView picks 3D (web) or 2D SVG (native)
    timeline.ts         Berth cycle -> ship/cargo/payout at any instant
    daylight.ts         Day/night clock and sky colours (pure, tested)
  port3d/               The three.js harbour: world, sky, water, ship, crane, land,
                        containers, sealife (dolphins, whales, sharks, fish),
                        town (streets, square, town hall, people, traffic)
    models/             The hero models, built to spec (see "The models")
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
current tune the second opens about 2.5 hours into a first run and the rest
follow every 30-70 minutes (9 ports by the 8-hour mark). Each costs 9x the one
before: port 10 is ~$860B and the last, Orbital One, ~$5.6Qa.

The design rule that makes this safe: **port `i` scales its yields AND its
upgrade costs by the same tier factor** (`scaleGrowth^i`, currently 3.6). That
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

### Keeping the numbers small

`ports.costGrowth` used to be 20,000 and an 8-hour run reached ~$1e36: income
went from ~$1K/s to ~$1e26/s in half an hour once the late tracks unlocked
together, and port prices ran out to ~$8e55. The cause was the uncapped
tracks. Each extra bit of income makes Ship Size and Contracts levels cheap,
which buys more income, so every one-off multiplier (a capped track, a new
port) got amplified about 4x in the exponent.

The retune keeps the **cadence**, a purchase every minute or so, and makes
each step smaller: Ship Size +3.6% and Contracts +3.8% a level (were +5% and
+6%), with costGrowth lowered to match so cost-to-income stays the same. The
capped tracks are shorter and steeper (worth ~94x together, was ~500,000x) and
unlock one after another. The result: an 8-hour run reaches ~$30T, ports open
one at a time, and prestige pacing is unchanged (the first star comes at
~2h40, then ~18, ~8, ~4 minutes into later runs, as before). Saves from before
the change are migrated (`shrinkLegacyMoney` in `engine.ts`).

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
| Cranes | $30 | unload faster | x1.034 | 30 |
| Ship Size | $45 | more cargo per ship | x1.036 | — |
| Contracts | $75 | better price per unit | x1.038 | — |
| Tugboats | $400 | ships reach the berth sooner | x1.042 | 14 |
| Floodlights | $600 | multiplies what a ship is worth | x1.066 | 21 |
| Customs House | $2K | price multiplier | x1.069 | 12 |
| Rail Link | $50K | yield multiplier | x1.071 | 9 |
| Dredging | $250K | more cargo per ship | x1.074 | 11 |
| Cruise Terminal | $1.5M | yield multiplier | x1.080 | 13 |

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

- **`effectPerLevel` must stay below that track's own `costGrowth`**,
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
stylistic: the uncapped budget is 1.036 x 1.038 = 1.075 against a 1.14 ceiling.
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

which simulates an active player for eight hours and prints time-between-
purchases, the income curve, and offline yield. Current tune:

| metric | value |
|---|---|
| opening income | 0.80/s (8 cargo per 10s cycle) |
| first upgrade | 30 (~38s of play) |
| first 20 purchase gaps | mean 58s, all within the 30–90s target |
| ports opened in 8h | 9 (first at ~2h30) |
| earned in 8h | ~$30T |
| offline cap | 4 hours, full rate |

### The stability rule

Income is the **product** of every track's effect, so uncapped tracks compound
together. If their combined per-level effect exceeds the cheapest cost growth,
purchases accelerate without bound and the economy hits `Infinity` within the
hour — the first tune of this game did exactly that (`shipSize` reached level
3186 in 55 minutes). Keep:

```
shipSize.effectPerLevel * contracts.effectPerLevel  <  min costGrowth
current: 1.036 * 1.038 = 1.075  <  1.14
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

- `AsyncStorage`, single JSON blob, versioned. **Old saves migrate**: v1's
  flat single-port shape is lifted into `ports[0]`; v2 saves (before
  prestige) start with no stars, and their whole history counts as the
  current run, so selling straight away pays for what was already earned.
  New upgrade tracks default to level 0.
- Written on background/inactive (`AppState`), on unmount, on every purchase,
  and on a 15s autosave.
- Everything loaded from disk goes through `sanitise()` before it reaches the
  sim. A single `NaN` from a corrupt or tampered save would poison every
  subsequent tick, so every field is range-checked and upgrade levels are
  clamped to `maxLevel`.
- A save whose `lastTickAt` is in the future (clock moved back) credits nothing
  rather than paying out or going negative.

## Deliberately not built yet

Live ads (only the test ad exists), IAP, sound, analytics, achievements — out of scope for now.

Prestige is in (`src/sim/prestige.ts`, `sellCompany` in the engine): the
Reputation multiplier is applied in `derivePortStats` via `totalIncome` /
`deriveStats`, so every income figure in the game includes it.

## Known limitations of the slice

- One berth per port. Several berths within a port would need
  `berthCycleSeconds` to become an array (the closed-form maths is per-berth
  and unchanged).
- Fourteen ports is the ceiling (`BALANCE.ports.maxPorts`): ten real harbours and four fun ones. Prices still rise
  20,000x a port, so the last ones are long-term goals that take several runs
  and Head Office's discounts to reach.
- Cargo sells instantly at the dock. There is no warehouse, so no storage cap
  and nothing to overflow.
- Cranes stop being worth buying at level 30 by design. Nothing in the UI says
  so yet beyond the `MAX` label.
- Web saves live in `localStorage`, so clearing site data wipes the port and
  progress does not sync across devices.
