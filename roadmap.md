# Roadmap — A&A Rulebook Implementation

## World map expansion
- [x] Add 53 land territories by partitioning existing polygons without changing continent coastlines
- [x] Split the eight tallest Siberian regions north-to-south for compact Russian territories
- [x] Preserve old territory ids and migrate saved campaigns with neutral new regions
- [x] Validate silhouette equality, adjacency, sea access, world wrap, and full turn flow

## Phase 1 (DONE): Full unit roster + stats
- [x] All 23 unit types with rulebook stats (cost/attack/defense/move/range/hit#/order-of-loss/dice/seats)
- [x] Unit images for the 14 new types (halftrack, howitzer, amph tank, heavy tank, cargo truck, dozer, AA, railgun, zeppelin, spy plane, higgins boat, submarine, light carrier, fleet carrier)
- [x] Purchase panel listing all unit types

## Phase 2 (DONE): Structures
- [x] Flag buildings: Factory, Airfield, Harbor, Intel Center, Capital
- [x] Support buildings: Warehouse, Infirmary, Stock Market, Scrap Yard, Oil Platform
- [x] Fortifications: F.O.B., Island Outpost, Hedgehogs, Bunker, Sea Mines, Railroads, Coastal Gun, Runway
- [x] Construction panel, map icons, per-turn income, defense bonuses, AI builds structures
- Note: Intel Center / F.O.B. terrain / sea-mine + coastal-gun combat effects land in Phases 3 & 5

## Phase 3 (DONE): Combat & special rules
- [x] Opening fire: bombardment (artillery/howitzer/railgun + naval support), coastal guns, AA fire, sea mines
- [x] Order-of-loss casualties, D4 multi-hit, dogfights (air-vs-air first), retreat roll (D6 1-3)
- [x] Carrier decks (light 2 / fleet 4 aircraft), higgins boats (2), sub stealth unless a destroyer is present
- [x] Island unit cap of 15
- Terrain, canals and kamikaze are now implemented (see Phase 7 / Phase 8)

## Phase 4: Economy & VP
- [x] VP system + selling VP for NPP, capital VP penalties, income from capital/oil only
- [x] Stock market (bonds + day trading), scrap yard, infirmary recycling, warehouse bonus cards

## Phase 5 (DONE): Spy system
- [x] Spies trained at Intel Centers (8 NPP, 1 per turn), 1 mission per turn
- [x] Insertion overland or by submarine (2 tiles) / zeppelin / spy plane (1 tile)
- [x] Defender counter-intelligence roll (1-2 blocks), per-action D6 target
- [x] Intel report, espionage, sabotage, sapper, commandos, head hunter, blackout, provoke independence, incite rebellion

## Phase 6 (DONE): Campaign shell
- [x] Setup rolls (D6 placement, D8 capital) made at game start
- [x] Game days 1-6 with turn rotation, end-of-day-6 D6 roll (1-3 war continues, 4-6 game ends, highest VP wins)
- [x] 25-minute turn clock with unanimous pause (+5 min); the clock running out ends the turn
- [x] Contracts: cease-fire, alliance, right of passage, tribute — up to 5 turns, AI answers offers
- [x] Game-day counter is manually entered and no longer advances or ends the campaign automatically

## Phase 7 (DONE): Terrain & canals
- [x] Terrain data: deserts (W/C Sahara, Libya & Sinai, Arabia, Mongolia, Northern Territory), mountains (Caucasus & Anatolia, Central Asia, Urals, Kamchatka, Peru, Chile), jungle (Amazonia, Congo, SE Asia, Sumatra & Java, Borneo & Sulawesi, New Guinea, Central America)
- [x] Mountains/jungle: only Infantry, AA and Zeppelins may enter; Infantry needs an F.O.B. to build there; F.O.B.s never upgrade to factories
- [x] Deserts: vehicles (Halftrack/Tank/Amph Tank/Cargo Truck) pass through but never stop — no entering, stopping or building
- [x] Canals: Suez (Arabia province — 17-tile Med→Indian-Ocean shortcut) and Panama (Central America); naval crossing needs control of the canal or one side; air cannot cross sea→canal
- [x] D4 bombardment multi-kills disabled against mountain/jungle targets (D6 only)
- [x] Terrain/canal badges on the map, terrain blurbs in the command panel, save/load healing


## Phase 8 - Kamikaze (done)
- [x] Fighter kamikaze: up to 4 tiles, 1-3 on D6 to hit, fighter destroyed after.
- [x] Bomber kamikaze: up to 6 tiles, D4 targets then D6 1-4 per target (single D6 vs ships and rough terrain), bomber destroyed after.
- [x] Defending AA first strike: 1-2 downs a fighter, 3-4 downs a bomber.
- [x] Kamikaze panel in the command panel; casualties follow order of loss.

## Mobile & Touch Polish (done)
- [x] Pinch-zoom on the map (two-finger, anchored at midpoint, gesture taps suppressed)
- [x] Larger touch targets for zoom controls; controls moved to bottom-right (clear of music player)
- [x] Command panel becomes a bottom sheet on phones with collapsed summary bar (flag, NPP, clock, End Turn)
- [x] Music player repositioned on mobile; desktop layout unchanged
- [x] `touch-action: none` on map SVG; verified tap-zoom, sheet open/close, no console errors

## Transport & Carrying Rules (done)
- Halftrack (1 infantry + 1 gun, +1 attack with infantry aboard) and cargo truck (6 infantry or 1 howitzer) towing via Load/Unload in the Towing & Airdrops panel.
- Towed guns cannot bombard the same turn (`towedThisTurn`, cleared on turn refresh).
- Bomber airdrops: 3 seats of infantry/artillery/AA, drop zones within 6 tiles, flak 3-4 downs the bomber and each jumper survives on 1-2.
- Amphibious tanks cross a single ocean tile (never stop on water).
- Higgins boats grant +1 attack to infantry in a coastal assault.
- Piracy: transport-vs-transport in a shared sea zone; D6 1-3 succeeds. Failed dump loses your transport; failed boarding dumps your own cargo.

## Air Warfare - Escorted Bombing Runs (done)
- Bombers (range 6) fly escorted raids; fighters declared as escorts.
- Patrol: enemy fighters within 2 tiles of the target scramble; dogfight (1-3 to hit, up to 5 rounds).
- Escorts wiped out -> interceptors one shot at bombers (1-3), bombers one shot back (1); survivors grounded.
- AA over target fires first (1-2 fighters, 3-4 bombers), then bomber D4/D6 damage.
- Escorts within 2 tiles join with a strafing run (1-3). Survivors return home, spent for the turn.

## Fortifications & Upgrades (done)
- Hedgehogs cost +1 movement to enter (both sides); dozers clear them, spending their turn.
- Bunker bonus only applies with 3+ infantry garrisoning the tile.
- Runway holds 4 aircraft; upgrades Runway→Airfield (25), F.O.B.→Factory (15, not on rough ground), Island Outpost→Harbor (12).

## Railroads (done)
- Rail guns move only along connected railroad lines (origin and every tile entered must have a Railroad).
- Rail guns are built only on railroad tiles, max three active per nation.
- Railroads are razed when a capital territory is captured (already in capture handling).

## Artillery Spotter (done)
- Friendly infantry on or adjacent to the target gives artillery +1 to hit (max 6).
- Applies to pre-combat bombardment salvos, battle attack rolls and stand-off bombardment.
- Verified statistically: artillery hit rate rises from ~3/6 to ~4/6 with a spotter.

## Phase 9 - Warehouse cards & Atomic program (done)
- `WAREHOUSE_TIERS` (4 tiers, weighted cards) in `types.ts`; each warehouse owned unlocks one more tier, each tier its own D6 succeeding on 1-2.
- Cards: units, personal/world ceasefire (2 turns), and tier-4 A-bomb blueprints.
- 3 blueprints assemble 1 A-bomb (`ABOMB_BLUEPRINTS_REQUIRED`). `armAbomb` declares the carrying bomber; `abombStrike` flies up to `ABOMB_RANGE` (6) tiles, AA downs it on 3-4, otherwise destroys all units and structures in the province.
- Ceasefire blocks attacks in `confirmMove` while either side's counter is above zero; decremented each turn.
- Tests: `/tmp/abomb-test.ts` 9/9. Typecheck clean.

## World Map Geography (done)
- Restored the intact 110-territory real-world layout after the denser expansion distorted continent borders.
- World-seam ocean wrapping remains enabled.
- Tiny islands that fit inside a single blocked hex automatically connect to their nearest sea tile for transport access.

## Online multiplayer
- [x] Host / join rooms with a 5-letter code or invite link (peer-to-peer via PeerJS, no accounts)
- [x] Players claim nations; unclaimed nations are played by the host's AI
- [x] Host browser is the referee: keeps the save, runs the clock, relays each move; out-of-turn actions are blocked
- [ ] Optional: self-hosted PeerJS/TURN server for players behind strict firewalls (VITE_PEERJS_* env vars)
