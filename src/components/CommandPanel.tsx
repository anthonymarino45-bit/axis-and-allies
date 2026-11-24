import { useEffect, useState } from "react";
import { useGame } from "@/game/store";
import {
  UNIT_STATS,
  FACTORY_COST,
  NATIONS,
  PLAYER_ORDER,
  TRANSPORT_CAPACITY,
  STRUCTURE_STATS,
  STRUCTURE_ORDER,
  STRUCTURE_UPGRADES,
  TERRAIN_INFO,
  CANAL_INFO,
  structureIncome,
  structureDefenseBonus,
  factionName,
  isNaval,
  hasStructure,
  incomeFor,
  endGameVP,
  vpSellRate,
  BOND_CATEGORIES,
  BOND_SPECS,
  SPY_ACTIONS,
  SPY_ACTION_ORDER,
  SPY_COST,
  GAME_DAYS,
  CONTRACT_KINDS,
  CONTRACT_KIND_ORDER,
  MAX_CONTRACT_TURNS,
  type UnitType,
  type ContractKind,
  type Nation,
} from "@/game/types";
import {
  spyCanReach,
  bombardTargetsFor,
  canBombardNow,
  kamikazeTargets,
  groundCarrierRemaining,
  canCarryUnits,
  piracyTargets,
  tileDistance,
} from "@/game/store";
import { useCanAct, useNet } from "@/game/multiplayer";
import { OnlineTurnBanner } from "@/components/MultiplayerPanel";
import { RecruitPanel } from "@/components/RecruitPanel";
import { useSavesPanel } from "@/components/SavesPanel";
import { GROUND_CARRIER_CAPACITY, ABOMB_RANGE, ABOMB_BLUEPRINTS_REQUIRED } from "@/game/types";


export function CommandPanel() {
  const game = useGame((s) => s.game);
  const selectedId = useGame((s) => s.selectedTerritoryId);
  const selectedUnitIds = useGame((s) => s.selectedUnitIds);
  const aiTurnInProgress = useGame((s) => s.aiTurnInProgress);
  const selectAllUnitsHere = useGame((s) => s.selectAllUnitsHere);
  const toggleUnit = useGame((s) => s.toggleUnit);
  const buyFactory = useGame((s) => s.buyFactory);
  const buildStructure = useGame((s) => s.buildStructure);
  const upgradeStructure = useGame((s) => s.upgradeStructure);
  const dismantleHedgehogs = useGame((s) => s.dismantleHedgehogs);
  const endTurn = useGame((s) => s.endTurn);
  const reset = useGame((s) => s.reset);
  const saveGameNow = useGame((s) => s.saveGameNow);
  const sellVictoryPoint = useGame((s) => s.sellVictoryPoint);
  const rollStockMarket = useGame((s) => s.rollStockMarket);
  const sellBonds = useGame((s) => s.sellBonds);
  const dayTrade = useGame((s) => s.dayTrade);
  const scrapUnit = useGame((s) => s.scrapUnit);
  const claimInfirmaryInfantry = useGame((s) => s.claimInfirmaryInfantry);
  const drawWarehouseCard = useGame((s) => s.drawWarehouseCard);
  const trainSpy = useGame((s) => s.trainSpy);
  const runSpyMission = useGame((s) => s.runSpyMission);
  const bombardTerritory = useGame((s) => s.bombardTerritory);
  const bombardTargeting = useGame((s) => s.bombardTargeting);
  const setBombardTargeting = useGame((s) => s.setBombardTargeting);
  const kamikazeStrike = useGame((s) => s.kamikazeStrike);

  const t = selectedId ? game.territories[selectedId] : null;
  const player = game.currentPlayer;
  const playerInfo = NATIONS[player];
  const canAffordFactory = game.treasury[player] >= FACTORY_COST;
  // Online, only the player in this nation's seat sees its controls.
  const canAct = useCanAct();
  const online = useNet((s) => s.mode !== "local");
  const isGuest = useNet((s) => s.mode === "guest");
  const isAIPlayer = !canAct;
  const hasAdjacentSea =
    !!t && t.adjacent.some((nid) => game.territories[nid]?.isSea);
  const built = t?.structures ?? [];
  const hasAirfield = built.includes("airfield");
  const hasHarbor = built.includes("harbor");
  const hasOwnCapital = Object.values(game.territories).some(
    (x) => x.owner === player && (x.structures ?? []).includes("capital"),
  );

  // ---- Phase 4 economy ----
  const owned = Object.values(game.territories).filter((x) => x.owner === player && !x.isSea);
  const income = incomeFor(game, player);
  const myVP = game.vp[player] ?? 0;
  const ownsStockMarket = owned.some((x) => hasStructure(x, "stock_market"));
  const ownsScrapYard = owned.some((x) => hasStructure(x, "scrap_yard"));
  const ownsInfirmary = owned.some((x) => hasStructure(x, "infirmary"));
  const ownsWarehouse = owned.some((x) => hasStructure(x, "warehouse"));
  const bonds = game.bonds[player];
  const wounded = game.infirmaryPool[player] ?? 0;
  const canSellVP = game.turn >= 2 && myVP >= 1;
  const scrapsLeft = 5 - game.economy.scrappedThisTurn;

  // ---- Phase 5 espionage ----
  const mySpies = game.spies[player] ?? 0;
  const ownsIntel = owned.some((x) => hasStructure(x, "intel_center"));
  const spyTargetOk =
    !!t && !t.isSea && t.owner !== player && t.owner !== "neutral" &&
    spyCanReach(game, player, t.id);

  // ---- Phase 6 campaign ----
  const secondsLeft = useGame((s) => s.turnSecondsLeft);
  const paused = useGame((s) => s.paused);
  const tickTimer = useGame((s) => s.tickTimer);
  const togglePause = useGame((s) => s.togglePause);
  const setGameDay = useGame((s) => s.setGameDay);
  const proposeContract = useGame((s) => s.proposeContract);
  const respondContract = useGame((s) => s.respondContract);
  const cancelContract = useGame((s) => s.cancelContract);

  useEffect(() => {
    const h = window.setInterval(() => tickTimer(), 1000);
    return () => window.clearInterval(h);
  }, [tickTimer]);

  // Clock text depends on restored local state, so it is only rendered after
  // hydration to keep the server and client markup identical.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const clock = hydrated
    ? `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}`
    : "--:--";
  const myContracts = game.contracts.filter(
    (c) => (c.from === player || c.to === player) && (c.status === "active" || c.status === "proposed"),
  );
  const [contractKind, setContractKind] = useState<ContractKind>("ceasefire");
  const [contractTo, setContractTo] = useState<Nation>(
    PLAYER_ORDER.find((n) => n !== player) as Nation,
  );
  const [contractTurns, setContractTurns] = useState(3);

  // ---- Bombardment batteries (artillery, howitzer, rail gun, warships) ----
  const batteries = t ? t.units.filter((u) => canBombardNow(game, t.id, u, player)) : [];
  const pickedBatteries = batteries.filter((u) => selectedUnitIds.includes(u.id));
  // If no guns are explicitly selected (e.g. selection cleared after a move),
  // fall back to every available battery so the fire buttons stay visible.
  const selectedBatteries = pickedBatteries.length > 0 ? pickedBatteries : batteries;
  const batteryReach = selectedBatteries.length
    ? Math.max(...selectedBatteries.map((u) => UNIT_STATS[u.type].range))
    : 0;
  const shellTargets =
    t && selectedBatteries.length ? [...bombardTargetsFor(game, t.id, selectedBatteries)] : [];

  // ---- Kamikaze flights (fighters, bombers) ----
  const kamiPlanes =
    t && t.owner === player
      ? t.units.filter(
          (u) =>
            u.owner === player &&
            !u.movedThisTurn &&
            (u.type === "fighter" || u.type === "bomber"),
        )
      : [];
  const selectedPlanes = kamiPlanes.filter((u) => selectedUnitIds.includes(u.id));
  const kamiReach = selectedPlanes.length
    ? Math.max(...selectedPlanes.map((u) => UNIT_STATS[u.type].range))
    : 0;
  const kamiTargetList =
    t && selectedPlanes.length ? [...kamikazeTargets(game, t.id, kamiReach)] : [];

  // ---- Escorted bombing runs ----
  const bombingRun = useGame((s) => s.bombingRun);
  const raidBombers = selectedPlanes.filter(
    (u) => u.type === "bomber" && !(u.cargo ?? []).length,
  );
  const raidEscorts = selectedPlanes.filter((u) => u.type === "fighter");
  const bombRunTargets =
    t && raidBombers.length
      ? [...kamikazeTargets(game, t.id, UNIT_STATS.bomber.range)]
      : [];

  // ---- A-bomb (assembled from three warehouse blueprints) ----
  const armAbomb = useGame((s) => s.armAbomb);
  const abombStrike = useGame((s) => s.abombStrike);
  const abombsReady = game.abombs?.[player] ?? 0;
  const blueprintsHeld = game.blueprints?.[player] ?? 0;
  const bombersHere =
    t && t.owner === player && !isAIPlayer
      ? t.units.filter((u) => u.owner === player && u.type === "bomber")
      : [];
  const armedBomber = bombersHere.find((u) => u.abomb && !u.movedThisTurn);
  const abombTargets =
    t && armedBomber
      ? Object.values(game.territories)
          .filter(
            (x) =>
              x.id !== t.id &&
              x.owner !== player &&
              (x.units.length > 0 || (x.structures ?? []).length > 0) &&
              tileDistance(game, t.id, x.id, ABOMB_RANGE) > 0,
          )
          .map((x) => x.id)
      : [];

  // ---- Towing, airdrops and piracy ----
  const loadCargo = useGame((s) => s.loadCargo);
  const unloadCargo = useGame((s) => s.unloadCargo);
  const airdropCargo = useGame((s) => s.airdropCargo);
  const piracyRaid = useGame((s) => s.piracyRaid);

  const groundCarriers =
    t && !isAIPlayer
      ? t.units.filter((u) => u.owner === player && GROUND_CARRIER_CAPACITY[u.type])
      : [];
  const riderCandidates =
    t ? t.units.filter((u) => u.owner === player && selectedUnitIds.includes(u.id)) : [];
  const dropZones =
    t && groundCarriers.some((u) => u.type === "bomber" && (u.cargo ?? []).length)
      ? Object.values(game.territories).filter(
          (x) =>
            !x.isSea &&
            x.id !== t.id &&
            !x.units.some((u) => u.owner !== player && u.owner !== "neutral") &&
            tileDistance(game, t.id, x.id, UNIT_STATS.bomber.move) <= UNIT_STATS.bomber.move,
        ).slice(0, 12)
      : [];

  const myRaider =
    t && t.isSea
      ? t.units.find(
          (u) => u.owner === player && u.type === "transport" && selectedUnitIds.includes(u.id),
        )
      : undefined;
  const raidTargets = t && myRaider ? piracyTargets(game, t.id, player) : [];



  // Mobile: bottom-sheet toggle for the command panel
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <>
      {/* Mobile collapsed bar — always-visible summary + sheet toggle */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border bg-card/90 px-3 py-2 backdrop-blur lg:hidden">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          onClick={() => setSheetOpen(true)}
          aria-label="Open command panel"
        >
          <span className="truncate text-sm font-bold" style={{ color: playerInfo.color }}>
            {playerInfo.flag} {playerInfo.name}
          </span>
          <span className="shrink-0 text-xs font-semibold">{game.treasury[player]} NPP</span>
        </button>
        <span className="shrink-0 font-mono text-xs tabular-nums">{clock}</span>
        <button
          type="button"
          onClick={endTurn}
          disabled={aiTurnInProgress || game.gameOver}
          className="h-9 shrink-0 rounded border border-border px-2 text-xs font-semibold disabled:opacity-40"
        >
          End Turn
        </button>
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          aria-label="Open command panel"
          className="h-9 w-9 shrink-0 rounded border border-border text-base leading-none"
        >
          ☰
        </button>
      </div>

      {sheetOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setSheetOpen(false)}
          aria-hidden
        />
      )}

      <aside
        className={
          "flex-col gap-4 overflow-y-auto border-border bg-card/70 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur lg:static lg:z-auto lg:h-full lg:max-h-none lg:w-80 lg:shrink-0 lg:rounded-none lg:border-l lg:border-t-0 lg:p-4 lg:shadow-none " +
          (sheetOpen
            ? "fixed inset-x-0 bottom-0 z-40 flex max-h-[75dvh] rounded-t-xl border-t shadow-2xl"
            : "hidden border-t lg:flex")
        }
      >
        {/* Mobile close row */}
        <div className="flex items-center justify-between lg:hidden">
          <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">War Room</span>
          <button
            type="button"
            onClick={() => setSheetOpen(false)}
            aria-label="Close panel"
            className="h-10 w-10 rounded border border-border text-lg leading-none"
          >
            ✕
          </button>
        </div>
        <header>
          <div className="hidden text-xs uppercase tracking-[0.2em] text-muted-foreground lg:block">War Room</div>
        <h1 className="font-serif text-2xl font-bold text-foreground">Free-For-All</h1>
      </header>

      <OnlineTurnBanner />

      {/* ---- Phase 6: campaign day, turn clock ---- */}
      <div className="rounded-md border border-border bg-card p-3 text-sm">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Game Day
            </div>
            <div className="flex items-center gap-1 font-bold">
              <input
                type="number"
                min={1}
                max={999}
                value={game.day}
                onChange={(event) => setGameDay(event.currentTarget.valueAsNumber)}
                aria-label="Game day"
                className="h-7 w-14 rounded border border-border bg-background px-1 text-center font-mono text-sm font-bold text-foreground"
              />
              <span className="text-muted-foreground">/ {GAME_DAYS}</span>
              {game.day > GAME_DAYS && <span className="ml-1 text-xs text-destructive">overtime</span>}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Turn Clock
            </div>
            <div
              className={`font-mono text-lg font-bold ${secondsLeft <= 60 ? "text-destructive" : ""}`}
            >
              {clock}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={togglePause}
          disabled={game.gameOver}
          className="mt-2 w-full rounded border border-border px-2 py-1 text-xs disabled:opacity-40"
        >
          {paused ? "▶ Resume" : "⏸ Unanimous pause (+5 min)"}
        </button>
        {game.gameOver && game.winner && (
          <div className="mt-2 rounded border border-primary bg-primary/10 p-2 text-center text-xs font-semibold">
            🏆 The war is over — {NATIONS[game.winner].flag} {NATIONS[game.winner].name} wins.
          </div>
        )}
      </div>

      <div className="rounded-md border border-border bg-parchment/60 p-3 text-sm">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Turn</div>
            <div className="font-bold">{game.turn}</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Active
            </div>
            <div className="font-bold" style={{ color: playerInfo.color }}>
              {playerInfo.flag} {playerInfo.name}
            </div>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-1.5 text-xs">
          {PLAYER_ORDER.map((n) => {
            const info = NATIONS[n];
            const active = n === player;
            return (
              <div
                key={n}
                className="rounded border p-1.5"
                style={{
                  borderColor: active ? info.color : "var(--border)",
                  background: active
                    ? `color-mix(in oklab, ${info.color} 18%, transparent)`
                    : undefined,
                }}
              >
                <div className="text-[9px] uppercase text-muted-foreground">
                  {info.flag} {info.name}
                </div>
                <div className="text-sm font-bold" style={{ color: info.color }}>
                  {game.treasury[n]} NPP
                </div>
                <div className="text-[9px] text-muted-foreground">
                  {endGameVP(game, n)} VP projected
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {!isAIPlayer && (
        <div className="rounded-md border border-border bg-card p-3 text-sm">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="font-semibold">War Economy</span>
            <span className="text-xs text-muted-foreground">Income {income} NPP/turn</span>
          </div>

          <div className="mb-2 flex items-center justify-between rounded border border-border/60 p-2">
            <div>
              <div className="text-xs text-muted-foreground">Victory Points</div>
              <div className="text-lg font-bold">{myVP}</div>
            </div>
            <button
              type="button"
              disabled={!canSellVP}
              onClick={sellVictoryPoint}
              className="rounded bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground disabled:opacity-40"
            >
              Sell 1 VP → {vpSellRate(income)} NPP
            </button>
          </div>

          {ownsStockMarket && (
            <div className="mb-2 rounded border border-border/60 p-2">
              <div className="mb-1 text-xs font-semibold">Stock Market</div>
              <div className="space-y-1">
                {BOND_CATEGORIES.map((cat) => {
                  const spec = BOND_SPECS[cat];
                  const held = bonds[cat];
                  const sellable = Math.max(0, held - spec.minimum);
                  return (
                    <div key={cat} className="flex items-center justify-between text-xs">
                      <span>
                        {spec.label} <span className="text-muted-foreground">×{held}</span>
                      </span>
                      <button
                        type="button"
                        disabled={sellable < 1}
                        onClick={() => sellBonds(cat, Math.min(5, sellable))}
                        className="rounded border border-border px-1.5 py-0.5 disabled:opacity-40"
                      >
                        Cash {Math.min(5, sellable)}
                      </button>
                    </div>
                  );
                })}
              </div>
              <div className="mt-2 flex gap-1.5">
                <button
                  type="button"
                  disabled={game.economy.stockRolledThisTurn}
                  onClick={rollStockMarket}
                  className="flex-1 rounded border border-border px-2 py-1 text-xs disabled:opacity-40"
                >
                  Market roll
                </button>
                <button
                  type="button"
                  disabled={game.economy.dayTradedThisTurn || game.treasury[player] < 10}
                  onClick={() => dayTrade(10)}
                  className="flex-1 rounded border border-border px-2 py-1 text-xs disabled:opacity-40"
                >
                  Day trade 10
                </button>
              </div>
            </div>
          )}

          {ownsInfirmary && (
            <div className="mb-2 flex items-center justify-between rounded border border-border/60 p-2 text-xs">
              <span>Infirmary — {wounded} wounded</span>
              <button
                type="button"
                disabled={wounded < 3}
                onClick={claimInfirmaryInfantry}
                className="rounded border border-border px-1.5 py-0.5 disabled:opacity-40"
              >
                Recover Infantry
              </button>
            </div>
          )}

          {ownsWarehouse && (
            <button
              type="button"
              disabled={game.economy.warehouseDrawnThisTurn}
              onClick={drawWarehouseCard}
              className="w-full rounded border border-border px-2 py-1 text-xs disabled:opacity-40"
            >
              Warehouse supply draw
            </button>
          )}
        </div>
      )}

      {/* ---- Phase 6: contracts / terms of agreement ---- */}
      {!isAIPlayer && !game.gameOver && (
        <div className="rounded-md border border-border bg-card p-3 text-sm">
          <div className="mb-2 font-semibold">Terms of Agreement</div>

          {myContracts.length > 0 && (
            <div className="mb-2 space-y-1">
              {myContracts.map((c) => {
                const spec = CONTRACT_KINDS[c.kind];
                const other = c.from === player ? c.to : c.from;
                return (
                  <div
                    key={c.id}
                    className="flex items-center justify-between rounded border border-border/60 p-1.5 text-xs"
                  >
                    <span>
                      {spec.icon} {spec.label} — {NATIONS[other].flag} {NATIONS[other].name}
                      <span className="text-muted-foreground">
                        {" "}
                        {c.status === "proposed" ? "(pending)" : `${c.turns}t`}
                      </span>
                    </span>
                    {c.status === "proposed" && c.to === player ? (
                      <span className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => respondContract(c.id, true)}
                          className="rounded border border-border px-1.5 py-0.5"
                        >
                          Sign
                        </button>
                        <button
                          type="button"
                          onClick={() => respondContract(c.id, false)}
                          className="rounded border border-border px-1.5 py-0.5"
                        >
                          Refuse
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => cancelContract(c.id)}
                        className="rounded border border-border px-1.5 py-0.5"
                      >
                        Tear up
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="grid grid-cols-2 gap-1.5 text-xs">
            <select
              value={contractKind}
              onChange={(e) => setContractKind(e.target.value as ContractKind)}
              className="rounded border border-border bg-background px-1.5 py-1"
            >
              {CONTRACT_KIND_ORDER.map((k) => (
                <option key={k} value={k}>
                  {CONTRACT_KINDS[k].icon} {CONTRACT_KINDS[k].label}
                </option>
              ))}
            </select>
            <select
              value={contractTo}
              onChange={(e) => setContractTo(e.target.value as Nation)}
              className="rounded border border-border bg-background px-1.5 py-1"
            >
              {PLAYER_ORDER.filter((n) => n !== player).map((n) => (
                <option key={n} value={n}>
                  {NATIONS[n].flag} {NATIONS[n].name}
                </option>
              ))}
            </select>
          </div>
          <div className="mt-1.5 flex items-center gap-2 text-xs">
            <label className="text-muted-foreground" htmlFor="ct-turns">
              Term
            </label>
            <input
              id="ct-turns"
              type="range"
              min={1}
              max={MAX_CONTRACT_TURNS}
              value={contractTurns}
              onChange={(e) => setContractTurns(Number(e.target.value))}
              className="flex-1"
            />
            <span className="w-8 text-right">{contractTurns}t</span>
          </div>
          <div className="mt-1 text-[10px] text-muted-foreground">
            {CONTRACT_KINDS[contractKind].blurb}
          </div>
          <button
            type="button"
            onClick={() => proposeContract(contractKind, contractTo, contractTurns)}
            className="mt-2 w-full rounded bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground"
          >
            Offer terms
          </button>
        </div>
      )}

      {!isAIPlayer && batteries.length > 0 && (
        <div className="rounded-md border border-border bg-card p-3 text-sm">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="font-semibold">Bombardment</span>
            <span className="text-xs text-muted-foreground">{batteries.length} batteries</span>
          </div>
          {selectedBatteries.length === 0 ? (
            <div className="text-[10px] italic text-muted-foreground">
              Select artillery, howitzers, rail guns, destroyers, cruisers or battleships above
              to shell a nearby tile.
            </div>
          ) : (
            <>
            <button
              type="button"
              onClick={() => setBombardTargeting(!bombardTargeting)}
              className={`mb-1 w-full rounded border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${
                bombardTargeting
                  ? "border-destructive bg-destructive text-destructive-foreground"
                  : "border-border bg-card hover:bg-accent"
              }`}
            >
              {bombardTargeting ? "Cancel — click a glowing tile to shell it" : "🎯 Pick target on map"}
            </button>
            {shellTargets.length === 0 ? (
              <div className="text-[10px] italic text-muted-foreground">
                No enemy target within {batteryReach} tile{batteryReach > 1 ? "s" : ""}.
              </div>
            ) : (
            <div className="grid grid-cols-2 gap-1">
              {shellTargets.map((id) => {
                const target = game.territories[id];
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => bombardTerritory(id)}
                    className="rounded border border-border bg-parchment px-1 py-1.5 text-[10px] font-semibold uppercase tracking-wide hover:bg-accent"
                  >
                    💥 {target.name}
                    <div className="text-[9px] font-normal text-muted-foreground">
                      {target.units.length} units
                    </div>
                  </button>
                );
              })}
            </div>
            )}
            </>
          )}
          <div className="mt-2 text-[9px] text-muted-foreground">
            One bombardment per unit per turn. Artillery and rail guns may move before or after
            firing; howitzers must move first. Warships move then fire, or fire then move — not
            both. Battleships roll a D4 for shots, then 1–4 per shot (land units only). No subs;
            grounded planes only when nothing else is there.
          </div>
        </div>
      )}

      {!isAIPlayer && kamiPlanes.length > 0 && (
        <div className="rounded-md border border-destructive/60 bg-card p-3 text-sm">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="font-semibold text-destructive">Kamikaze</span>
            <span className="text-xs text-muted-foreground">{kamiPlanes.length} aircraft</span>
          </div>
          {selectedPlanes.length === 0 ? (
            <div className="text-[10px] italic text-muted-foreground">
              Select fighters or bombers above to launch a one-way strike.
            </div>
          ) : kamiTargetList.length === 0 ? (
            <div className="text-[10px] italic text-muted-foreground">
              No enemy force within {kamiReach} tiles.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-1">
              {kamiTargetList.map((id) => {
                const target = game.territories[id];
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => kamikazeStrike(id)}
                    className="rounded border border-destructive/50 bg-parchment px-1 py-1.5 text-[10px] font-semibold uppercase tracking-wide hover:bg-destructive/20"
                  >
                    ☠ {target.name}
                    <div className="text-[9px] font-normal text-muted-foreground">
                      {target.units.length} units
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          <div className="mt-2 text-[9px] text-muted-foreground">
            Fighters strike up to 4 tiles (1-3 hits); bombers up to 6 tiles (D4 targets, then D6
            1-4 each). Defending AA fires first. Every aircraft sent is lost.
          </div>
        </div>
      )}

      {!isAIPlayer && (blueprintsHeld > 0 || abombsReady > 0 || armedBomber) && (
        <div className="rounded-md border border-destructive bg-card p-3 text-sm">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="font-semibold text-destructive">☢ Atomic Program</span>
            <span className="text-xs text-muted-foreground">
              {blueprintsHeld}/{ABOMB_BLUEPRINTS_REQUIRED} blueprints · {abombsReady} ready
            </span>
          </div>

          {abombsReady > 0 && bombersHere.some((u) => !u.abomb) && (
            <div className="mb-2 space-y-1">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Load the bomb onto a bomber here
              </div>
              {bombersHere
                .filter((u) => !u.abomb)
                .map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => armAbomb(u.id)}
                    className="w-full rounded border border-destructive/50 bg-parchment px-2 py-1 text-[11px] font-semibold uppercase tracking-wide hover:bg-destructive/20"
                  >
                    Arm bomber
                  </button>
                ))}
            </div>
          )}

          {armedBomber && (
            abombTargets.length === 0 ? (
              <div className="text-[10px] italic text-muted-foreground">
                No target within {ABOMB_RANGE} tiles.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-1">
                {abombTargets.map((id) => {
                  const target = game.territories[id];
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => abombStrike(id)}
                      className="rounded border border-destructive bg-parchment px-1 py-1.5 text-[10px] font-semibold uppercase tracking-wide hover:bg-destructive/20"
                    >
                      ☢ {target.name}
                      <div className="text-[9px] font-normal text-muted-foreground">
                        {target.units.length} units · {(target.structures ?? []).length} buildings
                      </div>
                    </button>
                  );
                })}
              </div>
            )
          )}

          <div className="mt-2 text-[9px] text-muted-foreground">
            Three blueprints from tier-four warehouse draws assemble one A-bomb. The declared
            bomber flies up to {ABOMB_RANGE} tiles; anti-air downs it on a 3-4 and the bomb is lost.
            A detonation destroys every unit and every building in the province.
          </div>
        </div>
      )}



      {!isAIPlayer && kamiPlanes.some((u) => u.type === "bomber") && (
        <div className="rounded-md border border-border bg-card p-3 text-sm">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="font-semibold">Bombing Run</span>
            <span className="text-xs text-muted-foreground">
              {raidBombers.length} bombers · {raidEscorts.length} escorts
            </span>
          </div>
          {raidBombers.length === 0 ? (
            <div className="text-[10px] italic text-muted-foreground">
              Select bombers (and any fighters to escort them) above.
            </div>
          ) : bombRunTargets.length === 0 ? (
            <div className="text-[10px] italic text-muted-foreground">
              No enemy force within {UNIT_STATS.bomber.range} tiles.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-1">
              {bombRunTargets.map((id) => {
                const target = game.territories[id];
                const d = tileDistance(game, t!.id, id, UNIT_STATS.bomber.range);
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => bombingRun(id)}
                    className="rounded border border-border bg-parchment px-1 py-1.5 text-[10px] font-semibold uppercase tracking-wide hover:bg-accent"
                  >
                    🛩 {target.name}
                    <div className="text-[9px] font-normal text-muted-foreground">
                      {d} tiles · {target.units.length} units{d <= 2 ? " · strafe" : ""}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          <div className="mt-2 text-[9px] text-muted-foreground">
            Bombers fly up to {UNIT_STATS.bomber.range} tiles. Enemy fighters within 2 tiles
            scramble on patrol and duel your escorts; AA then fires. Escorts within 2 tiles join
            with a strafing run. Survivors return home.
          </div>
        </div>
      )}

      {groundCarriers.length > 0 && (
        <div className="rounded-md border border-border bg-card p-3 text-sm">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="font-semibold">Towing &amp; Airdrops</span>
            <span className="text-xs text-muted-foreground">{groundCarriers.length} carriers</span>
          </div>
          <div className="space-y-2">
            {groundCarriers.map((c) => {
              const riders = riderCandidates.filter((u) => u.id !== c.id);
              const canLoad = riders.length > 0 && canCarryUnits(c, riders);
              const load = c.cargo ?? [];
              return (
                <div key={c.id} className="rounded border border-border/60 p-2">
                  <div className="flex items-baseline justify-between text-xs font-semibold">
                    <span>{UNIT_STATS[c.type].label}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {load.length ? load.map((u) => UNIT_STATS[u.type].short).join(", ") : "empty"} ·{" "}
                      {groundCarrierRemaining(c)} seats
                    </span>
                  </div>
                  <div className="mt-1 flex gap-1">
                    <button
                      type="button"
                      disabled={!canLoad}
                      onClick={() => loadCargo(c.id)}
                      className="flex-1 rounded border border-border px-2 py-1 text-[10px] disabled:opacity-40"
                    >
                      Load selected
                    </button>
                    <button
                      type="button"
                      disabled={load.length === 0 || !!t?.isSea}
                      onClick={() => unloadCargo(c.id)}
                      className="flex-1 rounded border border-border px-2 py-1 text-[10px] disabled:opacity-40"
                    >
                      Unload here
                    </button>
                  </div>
                  {c.type === "bomber" && load.length > 0 && dropZones.length > 0 && (
                    <div className="mt-1 grid grid-cols-2 gap-1">
                      {dropZones.map((z) => (
                        <button
                          key={z.id}
                          type="button"
                          onClick={() => airdropCargo(c.id, z.id)}
                          className="rounded border border-border bg-parchment px-1 py-1 text-[9px] font-semibold uppercase hover:bg-accent"
                        >
                          🪂 {z.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-2 text-[9px] text-muted-foreground">
            Halftracks tow 1 infantry plus 1 gun (+1 attack with infantry aboard); cargo trucks
            carry 6 infantry or 1 howitzer. A gun that was towed cannot bombard that turn. Bombers
            drop 3 seats of infantry, artillery or AA — flak on a 3-4 downs the plane and each
            jumper then survives on a 1-2.
          </div>
        </div>
      )}

      {myRaider && raidTargets.length > 0 && (
        <div className="rounded-md border border-destructive/60 bg-card p-3 text-sm">
          <div className="mb-2 font-semibold text-destructive">Piracy</div>
          <div className="space-y-1">
            {raidTargets.map((v) => (
              <div key={v.id} className="flex items-center gap-1">
                <span className="flex-1 text-[10px] uppercase">
                  {factionName(v.owner)} transport · {(v.cargo ?? []).length} aboard
                </span>
                <button
                  type="button"
                  onClick={() => piracyRaid(v.id, "dump")}
                  className="rounded border border-border px-2 py-1 text-[10px] hover:bg-accent"
                >
                  Dump
                </button>
                <button
                  type="button"
                  disabled={!(myRaider.cargo ?? []).some((c) => c.type === "infantry")}
                  onClick={() => piracyRaid(v.id, "capture")}
                  className="rounded border border-border px-2 py-1 text-[10px] disabled:opacity-40 hover:bg-accent"
                >
                  Board
                </button>
              </div>
            ))}
          </div>
          <div className="mt-2 text-[9px] text-muted-foreground">
            A raid succeeds on a D6 of 1-3. A failed dump loses your transport to the enemy; a
            failed boarding throws your own cargo overboard.
          </div>
        </div>
      )}


      {!isAIPlayer && (
        <div className="rounded-md border border-border bg-card p-3 text-sm">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="font-semibold">Intelligence</span>
            <span className="text-xs text-muted-foreground">{mySpies} spies ready</span>
          </div>
          <button
            type="button"
            disabled={!ownsIntel || game.economy.spyTrainedThisTurn || game.treasury[player] < SPY_COST}
            onClick={trainSpy}
            title={!ownsIntel ? "Requires an Intel Center" : ""}
            className="w-full rounded border border-border px-2 py-1 text-xs disabled:opacity-40"
          >
            Train a spy · {SPY_COST} NPP
          </button>

          {spyTargetOk ? (
            <>
              <div className="mt-2 text-[10px] uppercase tracking-widest text-muted-foreground">
                Mission vs {t!.name}
              </div>
              <div className="mt-1 grid grid-cols-3 gap-1">
                {SPY_ACTION_ORDER.map((a) => {
                  const spec = SPY_ACTIONS[a];
                  const disabled =
                    mySpies < 1 ||
                    game.economy.spyMissionThisTurn ||
                    game.treasury[player] < spec.cost;
                  return (
                    <button
                      key={a}
                      type="button"
                      disabled={disabled}
                      onClick={() => runSpyMission(a)}
                      title={`${spec.blurb} — roll ${spec.target} or less on a D6.`}
                      className="rounded border border-border bg-parchment px-1 py-1.5 text-[10px] font-semibold uppercase tracking-wide hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {spec.icon} {spec.label}
                      <div className="text-[9px] font-normal text-muted-foreground">
                        {spec.cost ? `${spec.cost} NPP · ` : ""}≤{spec.target}
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="mt-2 text-[10px] italic text-muted-foreground">
              Select an enemy province within reach of your borders, a submarine (2),
              a zeppelin or a spy plane (1) to run a mission.
            </div>
          )}
          {game.economy.spyMissionThisTurn && (
            <div className="mt-1 text-[10px] italic text-muted-foreground">
              One spy mission per turn — already used.
            </div>
          )}
        </div>
      )}




      {t ? (
        <div className="rounded-md border border-border bg-card p-3 text-sm">
          <div className="flex items-baseline justify-between">
            <h2 className="font-serif text-lg font-bold">{t.name}</h2>
            <span
              className="text-[10px] uppercase tracking-widest"
              style={{ color: t.owner === "neutral" ? "var(--muted-foreground)" : NATIONS[t.owner].color }}
            >
              {t.isSea ? "Open Sea" : factionName(t.owner)}
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {t.isSea
                ? "Naval zone"
                : `NPP value: ${t.ipc}${structureIncome(t) ? ` (+${structureIncome(t)})` : ""}`}
            </span>
            {!t.isSea && structureDefenseBonus(t) > 0 && (
              <span className="font-semibold text-foreground">
                Fortified +{structureDefenseBonus(t)} def
              </span>
            )}
          </div>
          {t.terrain && (
            <div className="mt-1 flex items-start gap-1 text-xs text-muted-foreground">
              <span aria-hidden>{TERRAIN_INFO[t.terrain].icon}</span>
              <span>
                <span className="font-semibold text-foreground">{TERRAIN_INFO[t.terrain].label} — </span>
                {TERRAIN_INFO[t.terrain].blurb}
              </span>
            </div>
          )}
          {t.canal && (
            <div className="mt-1 flex items-start gap-1 text-xs text-muted-foreground">
              <span aria-hidden>🚢</span>
              <span>
                <span className="font-semibold text-foreground">{CANAL_INFO[t.canal].label} — </span>
                {CANAL_INFO[t.canal].blurb}
              </span>
            </div>
          )}

          {!t.isSea && built.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {built.map((s) => (
                <span
                  key={s}
                  title={STRUCTURE_STATS[s].blurb}
                  className="rounded border border-border bg-parchment/60 px-1.5 py-0.5 text-[10px] font-semibold"
                >
                  {STRUCTURE_STATS[s].icon} {STRUCTURE_STATS[s].label}
                </span>
              ))}
            </div>
          )}


          <div className="mt-3 space-y-1">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
              {t.isSea ? "Fleet" : "Garrison"}
            </div>
            {t.units.length === 0 ? (
              <div className="text-xs italic text-muted-foreground">— empty —</div>
            ) : (
              <ul className="grid grid-cols-2 gap-1 text-xs">
                {t.units.map((u) => {
                  const mine = u.owner === player;
                  return (
                  <li
                    key={u.id}
                    onClick={mine ? () => toggleUnit(u.id) : undefined}
                    className={`flex items-center justify-between rounded border border-border px-2 py-1 ${mine ? "cursor-pointer hover:bg-accent/40" : ""}`}
                    style={{
                      opacity: u.movedThisTurn ? 0.5 : 1,
                      borderColor: selectedUnitIds.includes(u.id)
                        ? "var(--accent)"
                        : undefined,
                    }}
                  >
                    <span className="font-semibold">
                      {UNIT_STATS[u.type].label}
                      {u.type === "transport" && (
                        <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                          [{u.cargo?.length ?? 0}/{TRANSPORT_CAPACITY}]
                        </span>
                      )}
                    </span>
                    <span className="flex items-center gap-1 text-muted-foreground">
                      {UNIT_STATS[u.type].attack}/{UNIT_STATS[u.type].defense}
                      {mine && ownsScrapYard && u.type !== "infantry" && scrapsLeft > 0 && (
                        <button
                          type="button"
                          title={`Scrap for ${Math.floor(UNIT_STATS[u.type].cost / 2)} NPP`}
                          onClick={(e) => { e.stopPropagation(); scrapUnit(u.id); }}
                          className="rounded border border-border px-1 text-[9px] hover:bg-accent/40"
                        >
                          ♻
                        </button>
                      )}
                    </span>
                  </li>
                  );
                })}
              </ul>
            )}
            {/* Cargo riding on transports in this sea zone */}
            {t.isSea &&
              t.units
                .filter((u) => u.type === "transport" && u.cargo && u.cargo.length > 0)
                .map((tr) => (
                  <div key={tr.id} className="mt-2 rounded border border-dashed border-border bg-parchment/30 p-2">
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                      Cargo aboard Transport
                    </div>
                    <ul className="mt-1 grid grid-cols-2 gap-1 text-xs">
                      {tr.cargo!.map((c) => {
                        const mine = c.owner === player;
                        return (
                        <li
                          key={c.id}
                          onClick={mine ? () => toggleUnit(c.id) : undefined}
                          className={`flex items-center justify-between rounded border border-border bg-card px-2 py-1 ${mine ? "cursor-pointer hover:bg-accent/40" : ""}`}
                          style={{
                            opacity: c.movedThisTurn ? 0.5 : 1,
                            borderColor: selectedUnitIds.includes(c.id)
                              ? "var(--accent)"
                              : undefined,
                          }}
                        >
                          <span className="font-semibold">{UNIT_STATS[c.type].label}</span>
                          <span className="text-muted-foreground">
                            {UNIT_STATS[c.type].attack}/{UNIT_STATS[c.type].defense}
                          </span>
                        </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
          </div>

          {t.units.some((u) => u.owner === player && !u.movedThisTurn) && (
            <button
              onClick={selectAllUnitsHere}
              className="mt-3 w-full rounded border border-border bg-secondary px-2 py-1.5 text-xs font-semibold uppercase tracking-wider hover:bg-accent"
            >
              Select all my units
            </button>
          )}

          {t.owner === player && !t.isSea && (
            <div className="mt-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  {t.hasFactory ? "Recruit (factory)" : "Conscript Militia"}
                </div>
                {!t.hasFactory && (
                  <button
                    onClick={buyFactory}
                    disabled={!canAffordFactory}
                    className="rounded border border-border bg-parchment px-2 py-1 text-[10px] font-semibold uppercase tracking-wider hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    ⚙ Factory · {FACTORY_COST} NPP
                  </button>
                )}
              </div>

              <RecruitPanel
                territory={t}
                treasury={game.treasury[player]}
                hasAirfield={hasAirfield}
                hasHarbor={hasHarbor}
                hasAdjacentSea={hasAdjacentSea}
              />
              {!t.hasFactory && (
                <div className="mt-1 text-[10px] italic text-muted-foreground">
                  Without a factory you may conscript one Infantry per turn.
                </div>
              )}

              {/* ---------------- Construction ---------------- */}
              <div className="mt-4 text-[10px] uppercase tracking-widest text-muted-foreground">
                Construction
              </div>
              {(["flag", "support", "fortification"] as const).map((cat) => (
                <div key={cat}>
                  <div className="mt-2 text-[9px] uppercase tracking-widest text-muted-foreground/70">
                    {cat === "flag" ? "Flag Buildings" : cat === "support" ? "Support" : "Fortifications"}
                  </div>
                  <div className="mt-1 grid grid-cols-3 gap-1">
                    {STRUCTURE_ORDER.filter((s) => STRUCTURE_STATS[s].category === cat).map((type) => {
                      const s = STRUCTURE_STATS[type];
                      const already = built.includes(type);
                      const afford = game.treasury[player] >= s.cost;
                      const coastalOk = !s.coastal || hasAdjacentSea;
                      const capitalOk = type !== "capital" || !hasOwnCapital;
                      const disabled = already || !afford || !coastalOk || !capitalOk;
                      return (
                        <button
                          key={type}
                          onClick={() => buildStructure(type)}
                          disabled={disabled}
                          title={
                            already
                              ? "Already built here"
                              : !coastalOk
                                ? "Must border the sea"
                                : !capitalOk
                                  ? "You already have a capital"
                                  : s.blurb
                          }
                          className="rounded border border-border bg-parchment px-1 py-1.5 text-[10px] font-semibold uppercase tracking-wide hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {s.icon} {s.label}
                          <div className="text-[9px] font-normal text-muted-foreground">
                            {already ? "built" : `${s.cost} NPP`}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

              {/* ---------------- Upgrades & engineering ---------------- */}
              {(built.some((s) => STRUCTURE_UPGRADES[s]) || built.includes("hedgehogs")) && (
                <>
                  <div className="mt-4 text-[10px] uppercase tracking-widest text-muted-foreground">
                    Upgrades & Engineering
                  </div>
                  <div className="mt-1 grid grid-cols-2 gap-1">
                    {built.filter((s) => STRUCTURE_UPGRADES[s]).map((from) => {
                      const up = STRUCTURE_UPGRADES[from]!;
                      const to = STRUCTURE_STATS[up.to];
                      const roughBlock = up.to === "factory" && (t.terrain === "mountain" || t.terrain === "jungle");
                      const disabled =
                        built.includes(up.to) || roughBlock || game.treasury[player] < up.cost ||
                        (to.coastal && !hasAdjacentSea);
                      return (
                        <button
                          key={from}
                          onClick={() => upgradeStructure(from)}
                          disabled={disabled}
                          title={roughBlock ? "A F.O.B. on rough ground can never become a factory" : to.blurb}
                          className="rounded border border-border bg-parchment px-1 py-1.5 text-[10px] font-semibold uppercase tracking-wide hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {STRUCTURE_STATS[from].icon}→{to.icon} {to.label}
                          <div className="text-[9px] font-normal text-muted-foreground">{up.cost} NPP</div>
                        </button>
                      );
                    })}
                    {built.includes("hedgehogs") && (
                      <button
                        onClick={() => dismantleHedgehogs()}
                        disabled={!t.units.some((u) => u.type === "dozer" && u.owner === player && !u.movedThisTurn)}
                        title="A dozer on this tile can clear the hedgehogs, spending its turn."
                        className="rounded border border-border bg-parchment px-1 py-1.5 text-[10px] font-semibold uppercase tracking-wide hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        ✖ Clear Hedgehogs
                        <div className="text-[9px] font-normal text-muted-foreground">needs a dozer</div>
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-border bg-card/50 p-3 text-xs text-muted-foreground">
          Click a territory to inspect. Anyone may attack anyone — this is a free-for-all.
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={endTurn}
          disabled={isAIPlayer || aiTurnInProgress}
          className="flex-1 rounded border border-border bg-primary px-3 py-2 text-sm font-bold uppercase tracking-widest text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {aiTurnInProgress
            ? "🤖 AI Thinking…"
            : online && !canAct
              ? `Waiting for ${playerInfo.name}…`
              : "End Turn"}
        </button>
        <button
          onClick={() => {
            saveGameNow();
            useSavesPanel.getState().setOpen(true);
          }}
          aria-label="Saved games"
          title="Save, load, download or import games (your current game also autosaves)"
          className="rounded border border-border bg-secondary px-3 py-2 text-xs font-semibold uppercase tracking-wider hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
        >
          💾
        </button>
        <button
          onClick={() => {
            if (window.confirm("Abandon this campaign and start a new war?")) reset();
          }}
          disabled={aiTurnInProgress || isGuest}
          title={isGuest ? "Only the host can restart an online game" : undefined}
          className="rounded border border-border bg-secondary px-3 py-2 text-xs font-semibold uppercase tracking-wider hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
        >
          Reset
        </button>
      </div>

      <div className="flex-1 overflow-y-auto rounded-md border border-border bg-parchment/40 p-2 text-xs">
        <div className="mb-1 text-[10px] uppercase tracking-widest text-muted-foreground">
          Dispatches
        </div>
        <ul className="space-y-1">
          {game.log.map((line, i) => (
            <li key={i} className="leading-snug">
              · {line}
            </li>
          ))}
        </ul>
      </div>
    </aside>
    </>
  );
}
