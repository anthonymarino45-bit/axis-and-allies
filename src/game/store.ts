import { create } from "zustand";
import type { GameState, Unit, UnitType, Nation, StructureType, Territory, BondCategory, SpyAction } from "./types";
import {
  UNIT_STATS, FACTORY_COST, NATIONS, PLAYER_ORDER,
  STRUCTURE_STATS, structureIncome, structureDefenseBonus, hasStructure,
  WAREHOUSE_TIERS, ABOMB_BLUEPRINTS_REQUIRED, ABOMB_RANGE,
  isNaval, isAir, isLand, TRANSPORT_CAPACITY, HIGGINS_CAPACITY,
  incomeFor, freshEconomyFlags, vpSellRate, dayTradeTarget, BOND_SPECS,
  BOND_CATEGORIES, MAX_DAY_TRADE, MAX_SCRAP_PER_TURN,
  SPY_ACTIONS, SPY_COST, SPY_INSERT_RANGE,
  TURN_SECONDS, PAUSE_BONUS_SECONDS, MAX_CONTRACT_TURNS,
  CONTRACT_KINDS, endGameVP,
  ROUGH_TERRAIN_UNITS, DESERT_VEHICLES, isRoughTerrain,
  GROUND_CARRIER_CAPACITY, GROUND_CARRIER_CARGO,
  RUNWAY_CAPACITY, STRUCTURE_UPGRADES,
} from "./types";
import type { Contract, ContractKind } from "./types";
import { createInitialState } from "./initialState";
import {
  saveCampaign,
  clearSavedCampaign,
  loadSavedCampaign,
} from "./persistence";
import { isAINation, persistLocally } from "./control";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

interface MoveDialogState {
  targetId: string;
  idsByType: Record<string, string[]>;
  chosen: Record<string, number>;
  /** Other territories whose units can join this attack. */
  extras?: Array<{ fromId: string; idsByType: Record<string, string[]>; chosen: Record<string, number> }>;
}

interface UIState {
  selectedTerritoryId: string | null;
  selectedUnitIds: string[];
}

export interface DieRoll {
  unitId: string;
  type: UnitType;
  roll: number;
  target: number;
  hit: boolean;
  casualty: boolean;
  /** For bombers that hit: extra d4 roll determining how many enemy units this bomber kills. */
  bomberKills?: number;
  /** Label override for special fire (bombard, AA, mines, coastal gun). */
  label?: string;
}


export interface BattleRound {
  attackRolls: DieRoll[];
  defenseRolls: DieRoll[];
  attackHits: number;
  defenseHits: number;
  /** Air-vs-air dogfight resolved before the main exchange. */
  dogfight?: boolean;
}

/** Pre-combat salvo: bombardment, AA fire, coastal guns and sea mines. */
export interface OpeningFire {
  bombardRolls: DieRoll[];
  coastalRolls: DieRoll[];
  aaRolls: DieRoll[];
  mineRolls: DieRoll[];
  defenderLosses: number;
  attackerLosses: number;
  notes: string[];
}

export type BattleStatus =
  | "ongoing" | "attacker-won" | "defender-won" | "stalemate" | "retreated";

export interface PendingBattle {
  attackerId: string;
  defenderId: string;
  attackerUnitIds: string[];
  rounds: BattleRound[];
  status: BattleStatus;
  opening?: OpeningFire;
  /** Last retreat attempt (D6, 1-3 succeeds). */
  retreatRoll?: { roll: number; success: boolean };
}

/** One gun's fire in a stand-alone bombardment. */
export interface BombardShot {
  unitId: string;
  type: UnitType;
  /** Each die thrown (a battleship throws several) and whether it hit. */
  rolls: Array<{ roll: number; hit: boolean }>;
  /** Battleships first roll a D4: how many shots (land units it may hit). */
  d4?: number;
  target: number;
  /** Units this gun destroyed. */
  killed: string[];
}

/** A completed bombardment, kept so the cut scene can replay it. */
export interface BombardEvent {
  id: number;
  fromId: string;
  targetId: string;
  player: Nation;
  /** The target's units just before the guns fired. */
  targetUnits: Unit[];
  shots: BombardShot[];
}

export type MapAnimationKind = "march" | "attack" | "retreat" | "capture";

export interface MapAnimationUnit {
  owner: Nation;
  type: UnitType;
  count: number;
}

export interface MapAnimationEvent {
  id: number;
  kind: MapAnimationKind;
  fromId: string;
  toId: string;
  units: MapAnimationUnit[];
}

function animationUnits(units: Unit[]): MapAnimationUnit[] {
  const grouped = new Map<string, MapAnimationUnit>();
  for (const unit of units) {
    if (unit.owner === "neutral") continue;
    const key = `${unit.owner}:${unit.type}`;
    const entry = grouped.get(key);
    if (entry) entry.count += 1;
    else grouped.set(key, { owner: unit.owner, type: unit.type, count: 1 });
  }
  return [...grouped.values()];
}

function mapAnimation(
  kind: MapAnimationKind,
  fromId: string,
  toId: string,
  units: Unit[],
): MapAnimationEvent {
  return { id: Date.now() + Math.random(), kind, fromId, toId, units: animationUnits(units) };
}

interface Store extends UIState {
  game: GameState;
  pendingBattle: PendingBattle | null;
  moveDialog: MoveDialogState | null;
  mapAnimation: MapAnimationEvent | null;
  aiTurnInProgress: boolean;
  /** The most recent stand-alone bombardment (for its cut scene). */
  bombardEvent: BombardEvent | null;
  /** When true, clicking a highlighted enemy tile on the map bombards it. */
  bombardTargeting: boolean;
  setBombardTargeting: (on: boolean) => void;
  /** Phase 6: 25-minute turn clock. */
  turnSecondsLeft: number;
  paused: boolean;
  tickTimer: () => void;
  togglePause: () => void;
  setGameDay: (day: number) => void;
  proposeContract: (kind: ContractKind, to: Nation, turns: number) => void;
  respondContract: (id: string, accept: boolean) => void;
  cancelContract: (id: string) => void;
  selectTerritory: (id: string | null) => void;
  toggleUnit: (unitId: string) => void;
  selectAllUnitsHere: () => void;
  openMoveDialog: (targetId: string) => void;
  setMoveCount: (type: UnitType, count: number) => void;
  /** How many units of a type join the attack from another territory. */
  setExtraCount: (fromId: string, type: UnitType, count: number) => void;
  confirmMove: () => void;
  cancelMove: () => void;
  buyUnit: (type: UnitType) => void;
  /** Buy a whole order of mixed units at the selected territory; returns how many were bought. */
  buyUnits: (order: Partial<Record<UnitType, number>>) => number;
  buyFactory: () => void;
  buildStructure: (type: StructureType) => void;
  upgradeStructure: (from: StructureType) => void;
  dismantleHedgehogs: () => void;
  rollBattleRound: () => void;
  retreatBattle: () => void;
  closeBattle: () => void;
  endTurn: () => void;
  sellVictoryPoint: () => void;
  rollStockMarket: () => void;
  sellBonds: (category: BondCategory, amount: number) => void;
  dayTrade: (stake: number) => void;
  scrapUnit: (unitId: string) => void;
  claimInfirmaryInfantry: () => void;
  drawWarehouseCard: () => void;
  armAbomb: (unitId: string) => void;
  abombStrike: (targetId: string) => void;
  bombardTerritory: (targetId: string) => void;
  trainSpy: () => void;
  runSpyMission: (action: SpyAction) => void;
  loadCargo: (carrierId: string) => void;
  unloadCargo: (carrierId: string) => void;
  airdropCargo: (carrierId: string, targetId: string) => void;
  piracyRaid: (targetUnitId: string, mode: "dump" | "capture") => void;
  saveGameNow: () => void;
  reset: () => void;
  runAITurn: () => Promise<void>;
  kamikazeStrike: (targetId: string) => void;
  bombingRun: (targetId: string) => void;
}

function log(g: GameState, msg: string) {
  g.log = [msg, ...g.log].slice(0, 40);
}

/** Roll an N-sided die. */
function dN(sides: number): number {
  return 1 + Math.floor(Math.random() * sides);
}

/** Does this nation hold this structure anywhere on the map? */
function ownsStructure(g: GameState, nation: Nation, type: StructureType): boolean {
  return Object.values(g.territories).some(
    (t) => t.owner === nation && (t.structures ?? []).includes(type),
  );
}

/**
 * A spy infiltrates from a neighbouring friendly province, or is delivered by a
 * submarine (2 tiles), zeppelin or spy plane (1 tile).
 */
export function spyCanReach(g: GameState, nation: Nation, targetId: string): boolean {
  const target = g.territories[targetId];
  if (!target) return false;
  // Overland from an adjacent province we hold.
  if (target.adjacent.some((id) => g.territories[id]?.owner === nation)) return true;
  // Delivered by a carrier unit within its insertion range.
  for (const t of Object.values(g.territories)) {
    const carrier = t.units.find(
      (u) => u.owner === nation && SPY_INSERT_RANGE[u.type] !== undefined,
    );
    if (!carrier) continue;
    const range = SPY_INSERT_RANGE[carrier.type];
    // Breadth-first walk out to `range` tiles.
    let frontier = [t.id];
    const seen = new Set(frontier);
    for (let step = 0; step < range; step++) {
      const nextFrontier: string[] = [];
      for (const id of frontier) {
        for (const nb of g.territories[id]?.adjacent ?? []) {
          if (seen.has(nb)) continue;
          seen.add(nb);
          nextFrontier.push(nb);
        }
      }
      frontier = nextFrontier;
    }
    if (seen.has(targetId)) return true;
  }
  return false;
}


/**
 * Hand a province to its conqueror: award VP for every enemy structure taken
 * out, raze the capital and the railroad, and note the capital penalty.
 */
function captureTerritory(g: GameState, t: Territory, conqueror: Nation) {
  const loser = t.owner;
  t.owner = conqueror;
  if (loser === "neutral" || loser === conqueror) return;
  let vp = 0;
  const razed: StructureType[] = [];
  for (const s of t.structures ?? []) {
    const spec = STRUCTURE_STATS[s];
    if (spec.vpDestroyed > 0) vp += spec.vpDestroyed;
    if (s === "capital" || s === "railroad") razed.push(s);
  }
  if (razed.includes("capital")) {
    g.capitalLosses[loser] = (g.capitalLosses[loser] ?? 0) + 1;
    log(g, `${NATIONS[loser].name}'s capital at ${t.name} has fallen.`);
  }
  if (razed.length) {
    t.structures = (t.structures ?? []).filter((s) => !razed.includes(s));
    t.hasFactory = t.structures.includes("factory");
  }
  if (vp > 0) {
    g.vp[conqueror] = (g.vp[conqueror] ?? 0) + vp;
    log(g, `${NATIONS[conqueror].name} gained ${vp} VP from captured structures.`);
  }
}


type Kind = "naval" | "land" | "air" | "mixed" | "empty";
function classify(units: Pick<Unit, "type">[]): Kind {
  if (units.length === 0) return "empty";
  let n = 0, l = 0, a = 0;
  for (const u of units) {
    if (isNaval(u.type)) n++;
    else if (isAir(u.type)) a++;
    else l++;
  }
  const k = (n > 0 ? 1 : 0) + (l > 0 ? 1 : 0) + (a > 0 ? 1 : 0);
  if (k > 1) return "mixed";
  if (n) return "naval";
  if (a) return "air";
  return "land";
}

/** Seats each carrying ship offers, and what it may carry. */
const CARRIER_CAPACITY: Partial<Record<UnitType, number>> = {
  transport: TRANSPORT_CAPACITY,
  higgins: HIGGINS_CAPACITY,
  light_carrier: 2,
  fleet_carrier: 4,
};
function carrierCargoKind(t: UnitType): "land" | "air" | null {
  if (t === "transport" || t === "higgins") return "land";
  if (t === "light_carrier" || t === "fleet_carrier") return "air";
  return null;
}

function transportCapacityRemaining(t: Unit): number {
  const cap = CARRIER_CAPACITY[t.type];
  if (!cap) return 0;
  const kind = carrierCargoKind(t.type);
  const used = (t.cargo ?? []).reduce(
    (n, c) => n + (kind === "air" ? 1 : Math.max(1, UNIT_STATS[c.type].seats)),
    0,
  );
  return cap - used;
}

/** ---------- Ground/air carrying: halftrack & cargo-truck towing, bomber airdrops ---------- */

/** Free seats left on a halftrack, cargo truck or bomber. */
export function groundCarrierRemaining(carrier: Unit): number {
  const cap = GROUND_CARRIER_CAPACITY[carrier.type];
  if (!cap) return 0;
  const used = (carrier.cargo ?? []).reduce(
    (n, c) => n + Math.max(1, UNIT_STATS[c.type].seats),
    0,
  );
  return cap - used;
}

/** Rulebook load-out limits for the ground/air carriers. */
export function canCarryUnits(carrier: Unit, extra: Unit[]): boolean {
  const allowed = GROUND_CARRIER_CARGO[carrier.type];
  if (!allowed) return false;
  if (extra.some((u) => !allowed.includes(u.type) || u.owner !== carrier.owner)) return false;
  const load = [...(carrier.cargo ?? []), ...extra];
  const seats = load.reduce((n, c) => n + Math.max(1, UNIT_STATS[c.type].seats), 0);
  if (seats > (GROUND_CARRIER_CAPACITY[carrier.type] ?? 0)) return false;
  const count = (t: UnitType) => load.filter((c) => c.type === t).length;
  if (carrier.type === "halftrack") {
    // 1 infantry plus 1 AA or artillery.
    if (count("infantry") > 1) return false;
    if (count("artillery") + count("aa_gun") > 1) return false;
  }
  if (carrier.type === "cargo_truck") {
    // up to 6 infantry OR a single howitzer — never both.
    if (count("howitzer") > 1) return false;
    if (count("howitzer") > 0 && count("infantry") > 0) return false;
  }
  return true;
}

/** Enemy transports sharing this sea zone that our transports could raid. */
export function piracyTargets(g: GameState, seaId: string, player: Nation): Unit[] {
  const sea = g.territories[seaId];
  if (!sea?.isSea) return [];
  return sea.units.filter(
    (u) => u.type === "transport" && u.owner !== player && u.owner !== "neutral",
  );
}



function friendlyTransportWithCap(
  g: GameState, terrId: string, player: Nation, needed: number,
  kind: "land" | "air" = "land",
): Unit | null {
  const terr = g.territories[terrId];
  if (!terr || !terr.isSea) return null;
  for (const u of terr.units) {
    if (u.owner !== player) continue;
    if (carrierCargoKind(u.type) !== kind) continue;
    if (transportCapacityRemaining(u) >= needed) return u;
  }
  return null;
}

/** A land territory with no land neighbours — rulebook island (max 15 units). */
export const ISLAND_UNIT_CAP = 15;
function isIslandTerritory(g: GameState, t: GameState["territories"][string]): boolean {
  if (t.isSea) return false;
  return !t.adjacent.some((nid) => g.territories[nid] && !g.territories[nid].isSea);
}
function islandFull(g: GameState, id: string, incoming: number): boolean {
  const t = g.territories[id];
  if (!t || !isIslandTerritory(g, t)) return false;
  return t.units.length + incoming > ISLAND_UNIT_CAP;
}

/** Movement points a unit has left this turn. */
export function movesLeft(u: Unit): number {
  return Math.max(0, UNIT_STATS[u.type].move - (u.movesUsed ?? 0));
}

/** Mark a unit as having moved `dist` tiles; only exhausts its turn when out of points. */
function spendMoves<T extends Unit>(u: T, dist: number): T {
  const used = (u.movesUsed ?? 0) + Math.max(1, dist);
  return { ...u, movesUsed: used, movedThisTurn: used >= UNIT_STATS[u.type].move };
}

/** Hops between two provinces, crossing land or sea alike (-1 if unreachable within `max`). */
export function tileDistance(g: GameState, fromId: string, toId: string, max = 4): number {
  if (fromId === toId) return 0;
  const seen = new Set([fromId]);
  let frontier = [fromId];
  for (let d = 1; d <= max; d++) {
    const nextFrontier: string[] = [];
    for (const id of frontier) {
      for (const nid of g.territories[id]?.adjacent ?? []) {
        if (seen.has(nid)) continue;
        if (nid === toId) return d;
        seen.add(nid);
        nextFrontier.push(nid);
      }
    }
    frontier = nextFrontier;
  }
  return -1;
}

export const BOMBARD_UNITS: UnitType[] = [
  "artillery", "howitzer", "railgun", "destroyer", "cruiser", "battleship",
];

/** Can this unit fire a stand-off bombardment right now (rulebook timing rules)? */
export function canBombardNow(g: GameState, tileId: string, u: Unit, player: Nation): boolean {
  if (u.owner !== player || !BOMBARD_UNITS.includes(u.type) || u.bombardedThisTurn) return false;
  const t = g.territories[tileId];
  if (!t) return false;
  switch (u.type) {
    case "artillery":
      return !t.isSea; // move then bombard and vice versa; may fire after a tow/offload
    case "howitzer":
      return !t.isSea && !u.towedThisTurn; // move then bombard, never after a tow
    case "railgun":
      return !t.isSea && hasStructure(t, "railroad"); // immobile & silent without R.R.
    default:
      return !!t.isSea; // warships fire from the sea: ^^^B or B^^^
  }
}

/** Units on `t` that a bombardment by `shooter` may hit (rulebook targeting limits). */
export function bombardablePool(t: Territory, player: Nation, shooter: UnitType): Unit[] {
  const enemies = t.units.filter((u) => u.owner !== player);
  if (shooter === "battleship") {
    // Battleships hit land units only — never naval or grounded air.
    return t.isSea ? [] : enemies.filter((u) => isLand(u.type));
  }
  // Submarines can never be bombarded.
  const pool = enemies.filter((u) => u.type !== "submarine");
  const nonAir = pool.filter((u) => !isAir(u.type));
  // Grounded aircraft only when nothing else (units or structures) is on the tile.
  if (nonAir.length > 0 || (t.structures ?? []).length > 0) return nonAir;
  return pool;
}

/** Tiles the given guns in `fromId` can bombard. */
export function bombardTargetsFor(g: GameState, fromId: string, guns: Unit[]): Set<string> {
  const out = new Set<string>();
  const player = g.currentPlayer;
  for (const gun of guns) {
    const reach = UNIT_STATS[gun.type].range;
    if (reach <= 0) continue;
    const naval = isNaval(gun.type);
    for (const t of Object.values(g.territories)) {
      if (t.id === fromId || out.has(t.id)) continue;
      if (naval && t.isSea) continue; // warships shell the shore
      if (bombardablePool(t, player, gun.type).length === 0) continue;
      const d = tileDistance(g, fromId, t.id, reach);
      if (d > 0 && d <= reach) out.add(t.id);
    }
  }
  return out;
}

/** Enemy or neutral-held provinces a battery in `fromId` can shell at `reach` tiles. */
export function bombardTargets(g: GameState, fromId: string, reach: number): Set<string> {
  const out = new Set<string>();
  const from = g.territories[fromId];
  if (!from || reach <= 0) return out;
  const player = g.currentPlayer;
  for (const t of Object.values(g.territories)) {
    if (t.isSea || t.id === fromId || t.owner === player) continue;
    if (t.units.length === 0) continue;
    const d = tileDistance(g, fromId, t.id);
    if (d > 0 && d <= reach) out.add(t.id);
  }
  return out;
}

/** Provinces and sea zones a kamikaze flight from `fromId` can reach at `reach` tiles. */
export function kamikazeTargets(g: GameState, fromId: string, reach: number): Set<string> {
  const out = new Set<string>();
  if (!g.territories[fromId] || reach <= 0) return out;
  const player = g.currentPlayer;
  for (const t of Object.values(g.territories)) {
    if (t.id === fromId) continue;
    if (t.units.length === 0) continue;
    if (t.units.every((u) => u.owner === player)) continue;
    const d = tileDistance(g, fromId, t.id, reach);
    if (d > 0 && d <= reach) out.add(t.id);
  }
  return out;
}


const d6 = () => Math.floor(Math.random() * 6) + 1;
const d4 = () => Math.floor(Math.random() * 4) + 1;

/** Submarines cannot be targeted unless the other side fields a destroyer. */
/** Artillery spotter: a friendly infantry on or adjacent to the target gives artillery +1 to hit. */
export function hasSpotter(g: GameState, targetId: string, player: Nation): boolean {
  const t = g.territories[targetId];
  if (!t) return false;
  const spotted = (id: string) =>
    (g.territories[id]?.units ?? []).some((u) => u.owner === player && u.type === "infantry");
  return spotted(targetId) || t.adjacent.some(spotted);
}

function hiddenSubs(pool: Unit[], enemies: Unit[]): Set<string> {
  if (enemies.some((u) => u.type === "destroyer")) return new Set();
  return new Set(pool.filter((u) => u.type === "submarine").map((u) => u.id));
}

/** Lowest order-of-loss dies first (ties broken by cheaper cost); hidden units last. */
function orderedCasualties(pool: Unit[], hits: number, immune: Set<string>): Set<string> {
  if (hits <= 0) return new Set();
  const rank = (u: Unit) => UNIT_STATS[u.type].orderOfLoss * 1000 + UNIT_STATS[u.type].cost;
  const sorted = [...pool].sort(
    (a, b) => Number(immune.has(a.id)) - Number(immune.has(b.id)) || rank(a) - rank(b),
  );
  return new Set(sorted.slice(0, hits).map((u) => u.id));
}

/**
 * Pre-combat salvo: attacker bombardment (artillery, howitzer, railgun and
 * supporting warships), defending coastal guns, anti-air fire against
 * incoming aircraft, and sea mines against amphibious landings.
 */
function resolveOpeningFire(
  g: GameState,
  from: GameState["territories"][string],
  to: GameState["territories"][string],
  attackerIds: string[],
): OpeningFire {
  const out: OpeningFire = {
    bombardRolls: [], coastalRolls: [], aaRolls: [], mineRolls: [],
    defenderLosses: 0, attackerLosses: 0, notes: [],
  };
  const attackers = () => from.units.filter((u) => attackerIds.includes(u.id));
  const player = g.currentPlayer;

  // ----- attacker bombardment -----
  const bombarders: Unit[] = attackers().filter((u) => UNIT_STATS[u.type].bombard > 0);
  // warships in sea hexes bordering the target can lend supporting fire
  if (!to.isSea) {
    for (const nid of to.adjacent) {
      const sea = g.territories[nid];
      if (!sea?.isSea) continue;
      for (const u of sea.units) {
        if (u.owner === player && UNIT_STATS[u.type].bombard > 0 && !attackerIds.includes(u.id)) {
          bombarders.push(u);
        }
      }
    }
  }
  let defHits = 0;
  const spotted = hasSpotter(g, to.id, player);
  for (const u of bombarders) {
    const r = d6();
    let target = UNIT_STATS[u.type].bombard;
    if (u.type === "artillery" && spotted) target += 1;
    const hit = r <= target;
    const dr: DieRoll = { unitId: u.id, type: u.type, roll: r, target, hit, casualty: false, label: "Bombard" };
    if (hit && UNIT_STATS[u.type].d4MultiKill && !isRoughTerrain(to.terrain)) dr.bomberKills = d4();
    out.bombardRolls.push(dr);
    if (hit) defHits += dr.bomberKills ?? 1;
  }

  // ----- defending coastal gun -----
  if (!to.isSea && hasStructure(to, "coastal_gun")) {
    const bombard = STRUCTURE_STATS.coastal_gun.bombard;
    const r = d6();
    out.coastalRolls.push({
      unitId: "coastal_gun", type: "artillery", roll: r, target: bombard,
      hit: r <= bombard, casualty: false, label: "Coastal Gun",
    });
  }

  // ----- anti-air fire against incoming aircraft -----
  const incomingAir = attackers().filter((u) => isAir(u.type));
  if (incomingAir.length > 0) {
    for (const u of to.units) {
      const aa = UNIT_STATS[u.type].antiAir;
      if (aa <= 0) continue;
      const r = d6();
      out.aaRolls.push({ unitId: u.id, type: u.type, roll: r, target: aa, hit: r <= aa, casualty: false, label: "AA Fire" });
    }
  }

  // ----- sea mines against an amphibious assault -----
  if (from.isSea && !to.isSea && hasStructure(to, "sea_mines")) {
    const r = d6();
    out.mineRolls.push({ unitId: "sea_mines", type: "transport", roll: r, target: 2, hit: r <= 2, casualty: false, label: "Sea Mines" });
  }

  // ----- apply casualties -----
  if (defHits > 0) {
    const dead = orderedCasualties(to.units, defHits, hiddenSubs(to.units, attackers()));
    to.units = to.units.filter((u) => !dead.has(u.id));
    out.defenderLosses = dead.size;
  }
  const aaHits = out.aaRolls.filter((r) => r.hit).length;
  if (aaHits > 0 && incomingAir.length > 0) {
    const dead = orderedCasualties(incomingAir, aaHits, new Set());
    from.units = from.units.filter((u) => !dead.has(u.id));
    out.attackerLosses += dead.size;
  }
  const otherHits =
    out.coastalRolls.filter((r) => r.hit).length + out.mineRolls.filter((r) => r.hit).length;
  if (otherHits > 0) {
    const pool = attackers();
    const dead = orderedCasualties(pool, otherHits, new Set());
    from.units = from.units.filter((u) => !dead.has(u.id));
    out.attackerLosses += dead.size;
  }

  if (out.bombardRolls.length) out.notes.push(`Bombardment of ${to.name}: ${out.defenderLosses} lost.`);
  if (aaHits) out.notes.push(`Anti-air fire over ${to.name} downed ${aaHits} aircraft.`);
  if (out.coastalRolls.some((r) => r.hit)) out.notes.push(`Coastal guns at ${to.name} found their mark.`);
  if (out.mineRolls.some((r) => r.hit)) out.notes.push(`Sea mines off ${to.name} claimed a landing craft.`);
  return out;
}

// ----- Phase 7 terrain helpers (rulebook: desert / mountain / jungle / canals) -----

/** Can this group enter (and stand on) mountain/jungle? Infantry, AA, zeppelins only. */
function groupCanEnterRough(units: Unit[]): boolean {
  return units.every((u) => ROUGH_TERRAIN_UNITS.has(u.type));
}

/** Vehicles pass deserts but never stop there — a group containing one can't end there. */
function groupCanStopOn(dest: Territory, units: Unit[]): boolean {
  if (dest.terrain === "desert") {
    return !units.some((u) => DESERT_VEHICLES.has(u.type));
  }
  return true;
}

/**
 * Canal passage (naval): ships cross only when they control the canal
 * province or at least one land territory on either side of it.
 */
function canalPassable(g: GameState, canalId: string, player: Nation): boolean {
  const canal = g.territories[canalId];
  if (!canal?.canal) return false;
  if (canal.owner === player) return true;
  return canal.adjacent.some((nid) => g.territories[nid]?.owner === player);
}

/** Sea hexes reachable through a controlled canal from a given sea zone. */
function canalSeaExits(g: GameState, fromSeaId: string, player: Nation): string[] {
  const exits: string[] = [];
  for (const cid of g.territories[fromSeaId]?.adjacent ?? []) {
    const canal = g.territories[cid];
    if (!canal?.canal || !canalPassable(g, cid, player)) continue;
    for (const nid of canal.adjacent) {
      if (nid !== fromSeaId && g.territories[nid]?.isSea) exits.push(nid);
    }
  }
  return exits;
}

/** A rough Runway strip can only host 4 aircraft (an Airfield lifts the cap). */
function runwayFull(g: GameState, id: string, incoming: number): boolean {
  const t = g.territories[id];
  if (!t || t.isSea) return false;
  const list = t.structures ?? [];
  if (!list.includes("runway") || list.includes("airfield")) return false;
  const planes = t.units.filter((u) => isAir(u.type)).length;
  return planes + incoming > RUNWAY_CAPACITY;
}

function legalMoveTargets(g: GameState, fromId: string, units: Unit[]): Set<string> {
  const result = new Set<string>();
  if (units.length === 0) return result;
  const kind = classify(units);
  if (kind === "mixed" || kind === "empty") return result;
  const player = g.currentPlayer;
  const from = g.territories[fromId];
  if (!from) return result;
  const maxMove = Math.min(...units.map((u) => movesLeft(u)));
  if (maxMove <= 0) return result;

  if (kind === "air") {
    // unrestricted BFS; a sea hex is only a legal landing spot when a friendly
    // carrier there has deck space, and islands are capped at 15 units.
    const queue: Array<{ id: string; d: number }> = [{ id: fromId, d: 0 }];
    const seen = new Set<string>([fromId]);
    while (queue.length) {
      const { id, d } = queue.shift()!;
      const terr = g.territories[id];
      if (d > 0 && terr) {
        const seaOk = !terr.isSea || !!friendlyTransportWithCap(g, id, player, units.length, "air");
        if (seaOk && !islandFull(g, id, units.length) && !runwayFull(g, id, units.length)) result.add(id);
      }
      if (d >= maxMove) continue;
      // Rulebook canals: air units cannot cross from sea tile to sea tile —
      // never expand a sea hex into a canal province.
      const expandingFromSea = terr?.isSea ?? false;
      for (const nid of g.territories[id]?.adjacent ?? []) {
        if (seen.has(nid)) continue;
        if (expandingFromSea && g.territories[nid]?.canal) continue;
        seen.add(nid);
        queue.push({ id: nid, d: d + 1 });
      }
    }
    return result;
  }

  if (kind === "naval") {
    if (!from.isSea) return result;
    const queue: Array<{ id: string; d: number }> = [{ id: fromId, d: 0 }];
    const seen = new Set<string>([fromId]);
    while (queue.length) {
      const { id, d } = queue.shift()!;
      if (d > 0) result.add(id);
      if (d >= maxMove) continue;
      for (const nid of g.territories[id]?.adjacent ?? []) {
        const n = g.territories[nid];
        if (!n || !n.isSea || seen.has(nid)) continue;
        seen.add(nid);
        queue.push({ id: nid, d: d + 1 });
      }
      // Suez / Panama: hop to the sea hexes on the other side when controlled.
      if (d + 1 <= maxMove) {
        for (const exitId of canalSeaExits(g, id, player)) {
          if (!seen.has(exitId)) {
            seen.add(exitId);
            queue.push({ id: exitId, d: d + 1 });
          }
        }
      }
    }
    return result;
  }

  // ----- land -----
  if (from.isSea) {
    // these are cargo units disembarking — adjacent land only
    for (const nid of from.adjacent) {
      const n = g.territories[nid];
      if (!n || n.isSea || islandFull(g, nid, units.length)) continue;
      // Mountains/jungle: only infantry, AA and zeppelins may land here.
      if (isRoughTerrain(n.terrain) && !groupCanEnterRough(units)) continue;
      // Deserts: vehicles may pass but an amphibious landing means stopping.
      if (!groupCanStopOn(n, units)) continue;
      result.add(nid);
    }
    return result;
  }
  // land starting from land: BFS through land tiles
  // Amphibious tanks may swim across a single ocean tile, but never stop on one.
  const amphibious = units.every((u) => u.type === "amph_tank");
  // Rail guns move only along connected railroad lines.
  const railOnly = units.every((u) => u.type === "railgun");
  if (railOnly && !hasStructure(from, "railroad")) return result;
  const queue: Array<{ id: string; d: number; swam: boolean }> = [
    { id: fromId, d: 0, swam: false },
  ];
  const seen = new Set<string>([fromId]);
  while (queue.length) {
    const { id, d, swam } = queue.shift()!;
    const terr = g.territories[id];
    // Vehicles may pass deserts but never stop on one; nobody stops at sea.
    if (d > 0 && !terr?.isSea && !islandFull(g, id, units.length) && groupCanStopOn(terr, units)) {
      result.add(id);
    }
    if (d >= maxMove) continue;
    for (const nid of g.territories[id]?.adjacent ?? []) {
      const n = g.territories[nid];
      if (!n || seen.has(nid)) continue;
      if (n.isSea) {
        // Only amphibious tanks, and only for one tile of open water at a time.
        if (!amphibious || swam) continue;
        seen.add(nid);
        queue.push({ id: nid, d: d + 1, swam: true });
        continue;
      }
      // Mountains/jungle: only infantry, AA and zeppelins may enter.
      if (isRoughTerrain(n.terrain) && !groupCanEnterRough(units)) continue;
      // Rail guns can only enter tiles on the rail network.
      if (railOnly && !hasStructure(n, "railroad")) continue;
      // Hedgehogs cost an extra movement point to push through — for both sides.
      const cost = (n.structures ?? []).includes("hedgehogs") ? 2 : 1;
      if (d + cost > maxMove) continue;
      seen.add(nid);
      queue.push({ id: nid, d: d + cost, swam: false });
    }
  }
  // ...plus adjacent sea zones that contain a friendly transport with room
  for (const nid of from.adjacent) {
    const n = g.territories[nid];
    if (n && n.isSea && friendlyTransportWithCap(g, nid, player, units.length)) {
      result.add(nid);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// AI helpers — strength estimates used to decide where to fight and defend.
// Each hit kills one unit, so a force's strength is its expected hits per
// round times the hits it can absorb (Lanchester's square law).
// ---------------------------------------------------------------------------

type Terr = GameState["territories"][string];

function aiAttackPower(units: Unit[]): number {
  return units.reduce((s, u) => s + UNIT_STATS[u.type].attack / 6, 0);
}

function aiDefensePower(units: Unit[], t: Terr): number {
  const fort = t.isSea ? 0 : structureDefenseBonus(t);
  return units.reduce((s, u) => {
    const d = UNIT_STATS[u.type].defense;
    return s + (d > 0 ? Math.min(6, d + fort) : 0) / 6;
  }, 0);
}

/** Attacker's strength relative to the defenders (above 1 favours the attacker). */
function aiOdds(attackers: Unit[], defenders: Unit[], t: Terr): number {
  const fighting = defenders.filter((u) => !isNaval(u.type) || t.isSea);
  if (fighting.length === 0) return Infinity;
  const a = aiAttackPower(attackers) * attackers.length;
  const d = Math.max(0.05, aiDefensePower(fighting, t)) * fighting.length;
  return a / d;
}

/** Strongest attack any enemy could launch on `t` next turn from a neighbour. */
function aiThreat(g: GameState, t: Terr, player: Nation): number {
  let worst = 0;
  for (const nid of t.adjacent) {
    const n = g.territories[nid];
    if (!n || n.isSea) continue;
    const enemies = n.units.filter((u) => u.owner !== player && u.owner !== "neutral" && isLand(u.type));
    if (enemies.length === 0) continue;
    worst = Math.max(worst, aiAttackPower(enemies) * enemies.length);
  }
  return worst;
}

/** How much a territory is worth taking. */
function aiValue(t: Terr, player: Nation): number {
  let v = 2 + (t.ipc ?? 0) * 3;
  if (t.hasFactory) v += 10;
  if (hasStructure(t, "capital")) v += 20;
  if ((t.structures ?? []).length) v += 2 * (t.structures ?? []).length;
  if (t.owner !== "neutral" && t.owner !== player) v += 3; // weakening a rival
  return v;
}

/**
 * Units that must stay put so `t` can hold against the threat next door:
 * the best defenders first, enough to match the threat (more for a factory).
 */
function aiGarrison(g: GameState, t: Terr, player: Nation, movable: Unit[]): Set<string> {
  const threat = aiThreat(g, t, player);
  const keep = new Set<string>();
  const fixed = t.units.filter((u) => u.owner === player && !movable.includes(u));
  const margin = t.hasFactory ? 1.25 : 0.9;
  const strength = (us: Unit[]) => aiDefensePower(us, t) * us.length;
  // Factories always keep a token guard against a surprise attack.
  const minGuard = t.hasFactory ? 1 : 0;
  const pool = [...movable].sort((a, b) => UNIT_STATS[b.type].defense - UNIT_STATS[a.type].defense);
  const kept: Unit[] = [...fixed];
  for (const u of pool) {
    if (kept.length >= minGuard && strength(kept) >= threat * margin) break;
    kept.push(u);
    keep.add(u.id);
  }
  return keep;
}

const savedCampaign = loadSavedCampaign();

export const useGame = create<Store>((set, get) => ({
  game: savedCampaign?.game ?? createInitialState(),
  selectedTerritoryId: null,
  selectedUnitIds: [],
  pendingBattle: null,
  moveDialog: null,
  mapAnimation: null,
  aiTurnInProgress: false,
  bombardEvent: null,
  bombardTargeting: false,
  setBombardTargeting: (on) => set({ bombardTargeting: on }),
  turnSecondsLeft: savedCampaign?.turnSecondsLeft ?? TURN_SECONDS,
  paused: savedCampaign?.paused ?? false,

  tickTimer: () => {
    const { paused, turnSecondsLeft, game, pendingBattle } = get();
    if (paused || game.gameOver || pendingBattle) return;
    if (turnSecondsLeft <= 1) {
      set({ turnSecondsLeft: 0 });
      get().endTurn();
      return;
    }
    set({ turnSecondsLeft: turnSecondsLeft - 1 });
  },

  togglePause: () => {
    const { paused, turnSecondsLeft } = get();
    // Unanimous pause: the clock stops and the turn gains five minutes.
    set(
      paused
        ? { paused: false }
        : { paused: true, turnSecondsLeft: turnSecondsLeft + PAUSE_BONUS_SECONDS },
    );
  },

  setGameDay: (day) => {
    if (!Number.isFinite(day)) return;
    const nextDay = Math.max(1, Math.min(999, Math.floor(day)));
    const next: GameState = JSON.parse(JSON.stringify(get().game));
    if (next.day === nextDay) return;
    next.day = nextDay;
    log(next, `Game day manually set to ${nextDay}.`);
    set({ game: next });
  },

  proposeContract: (kind, to, turns) => {
    const { game } = get();
    if (game.gameOver) return;
    const from = game.currentPlayer;
    if (to === from) return;
    const next: GameState = JSON.parse(JSON.stringify(game));
    const contract: Contract = {
      id: `ct_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      kind,
      from,
      to,
      turns: Math.max(1, Math.min(MAX_CONTRACT_TURNS, turns)),
      status: "proposed",
    };
    next.contracts.push(contract);
    log(next, `${NATIONS[from].name} offers a ${CONTRACT_KINDS[kind].label} to ${NATIONS[to].name} (${contract.turns} turns).`);
    // AI nations answer immediately — they accept unless they are winning outright.
    if (isAINation(to)) {
      const confident = endGameVP(next, to) > endGameVP(next, from) + 20;
      contract.status = confident ? "declined" : "active";
      log(next, `${NATIONS[to].name} ${confident ? "refuses" : "signs"} the ${CONTRACT_KINDS[kind].label}.`);
    }
    set({ game: next });
  },

  respondContract: (id, accept) => {
    const { game } = get();
    const next: GameState = JSON.parse(JSON.stringify(game));
    const c = next.contracts.find((x) => x.id === id);
    if (!c || c.status !== "proposed") return;
    c.status = accept ? "active" : "declined";
    log(next, `${NATIONS[c.to].name} ${accept ? "signs" : "rejects"} the ${CONTRACT_KINDS[c.kind].label} with ${NATIONS[c.from].name}.`);
    set({ game: next });
  },

  cancelContract: (id) => {
    const { game } = get();
    const next: GameState = JSON.parse(JSON.stringify(game));
    const c = next.contracts.find((x) => x.id === id);
    if (!c) return;
    c.status = "expired";
    log(next, `The ${CONTRACT_KINDS[c.kind].label} between ${NATIONS[c.from].name} and ${NATIONS[c.to].name} is torn up.`);
    set({ game: next });
  },

  selectTerritory: (id) =>
    set({ selectedTerritoryId: id, selectedUnitIds: [], bombardTargeting: false }),
  toggleUnit: (unitId) =>
    set((s) => ({
      selectedUnitIds: s.selectedUnitIds.includes(unitId)
        ? s.selectedUnitIds.filter((x) => x !== unitId)
        : [...s.selectedUnitIds, unitId],
    })),
  selectAllUnitsHere: () => {
    const { game, selectedTerritoryId } = get();
    if (!selectedTerritoryId) return;
    const t = game.territories[selectedTerritoryId];
    const player = game.currentPlayer;
    const ids: string[] = [];
    for (const u of t.units) {
      if (u.owner === player && !u.movedThisTurn && movesLeft(u) > 0) ids.push(u.id);
    }
    // Also let "select all" grab cargo riding on friendly transports in this sea zone.
    if (t.isSea) {
      for (const u of t.units) {
        if (u.cargo && u.cargo.length) {
          for (const c of u.cargo) {
            if (c.owner === player && !c.movedThisTurn && movesLeft(c) > 0) ids.push(c.id);
          }
        }
      }
    }
    set({ selectedUnitIds: ids });
  },

  openMoveDialog: (targetId: string) => {
    const { game, selectedTerritoryId, selectedUnitIds, pendingBattle } = get();
    if (pendingBattle) return;
    if (!selectedTerritoryId || selectedUnitIds.length === 0) return;
    const from = game.territories[selectedTerritoryId];
    const to = game.territories[targetId];
    if (!from || !to || from.id === to.id) return;

    // Build pool: regular units on the territory, OR (if sea) cargo riding
    // on friendly transports that match the selected IDs.
    const pool: Unit[] = [...from.units];
    if (from.isSea) {
      for (const u of from.units) {
        if (u.cargo && u.cargo.length) pool.push(...u.cargo);
      }
    }
    const moving = pool.filter((u) => selectedUnitIds.includes(u.id));
    if (moving.length === 0) return;
    if (moving.some((u) => u.owner !== game.currentPlayer || u.movedThisTurn || movesLeft(u) <= 0)) return;

    const reach = legalMoveTargets(game, from.id, moving);
    if (!reach.has(to.id)) return;

    const idsByType: Record<string, string[]> = {};
    for (const u of moving) {
      if (!idsByType[u.type]) idsByType[u.type] = [];
      idsByType[u.type].push(u.id);
    }
    const chosen: Record<string, number> = {};
    for (const type in idsByType) chosen[type] = idsByType[type].length;

    // Attacking an enemy-held land territory: units in other territories
    // that can also reach it may join the same battle.
    const player = game.currentPlayer;
    const isAttack =
      !from.isSea && !to.isSea && to.owner !== "neutral" && to.owner !== player && to.units.length > 0 &&
      moving.every((u) => isLand(u.type));
    const extras: NonNullable<MoveDialogState["extras"]> = [];
    if (isAttack) {
      for (const other of Object.values(game.territories)) {
        if (other.id === from.id || other.isSea || other.owner !== player) continue;
        const ready = other.units.filter(
          (u) =>
            u.owner === player && !u.movedThisTurn && movesLeft(u) > 0 && isLand(u.type) &&
            legalMoveTargets(game, other.id, [u]).has(to.id),
        );
        if (!ready.length) continue;
        const byType: Record<string, string[]> = {};
        for (const u of ready) (byType[u.type] ??= []).push(u.id);
        extras.push({ fromId: other.id, idsByType: byType, chosen: {} });
      }
    }

    set({ moveDialog: { targetId, idsByType, chosen, extras: extras.length ? extras : undefined } });
  },

  setExtraCount: (fromId, type, count) => {
    set((s) => {
      if (!s.moveDialog?.extras) return s;
      return {
        moveDialog: {
          ...s.moveDialog,
          extras: s.moveDialog.extras.map((e) =>
            e.fromId !== fromId
              ? e
              : {
                  ...e,
                  chosen: {
                    ...e.chosen,
                    [type]: Math.max(0, Math.min(e.idsByType[type]?.length ?? 0, count)),
                  },
                },
          ),
        },
      };
    });
  },

  setMoveCount: (type: UnitType, count: number) => {
    set((s) => {
      if (!s.moveDialog) return s;
      const max = s.moveDialog.idsByType[type]?.length ?? 0;
      const nextCount = Math.max(0, Math.min(max, count));
      return {
        moveDialog: {
          ...s.moveDialog,
          chosen: { ...s.moveDialog.chosen, [type]: nextCount },
        },
      };
    });
  },

  confirmMove: () => {
    const { game, selectedTerritoryId, moveDialog } = get();
    if (!moveDialog || !selectedTerritoryId) return;
    const from = game.territories[selectedTerritoryId];
    const to = game.territories[moveDialog.targetId];
    if (!from || !to) return;

    const chosenUnitIds: string[] = [];
    for (const [type, ids] of Object.entries(moveDialog.idsByType)) {
      const want = moveDialog.chosen[type] ?? 0;
      chosenUnitIds.push(...ids.slice(0, want));
    }
    if (chosenUnitIds.length === 0) {
      set({ moveDialog: null });
      return;
    }

    const next: GameState = JSON.parse(JSON.stringify(game));
    const fromN = next.territories[from.id];
    const toN = next.territories[to.id];
    const player = next.currentPlayer;

    // Locate every chosen unit — could be on territory or in cargo.
    const allFromUnits: Unit[] = [...fromN.units];
    for (const u of fromN.units) {
      if (u.cargo && carrierCargoKind(u.type)) allFromUnits.push(...u.cargo);
    }
    const movers = allFromUnits.filter((u) => chosenUnitIds.includes(u.id));
    if (movers.length === 0) { set({ moveDialog: null }); return; }
    const kind = classify(movers);

    // Ceasefire cards: neither side may be attacked while the truce holds.
    const hostile =
      toN.owner !== player && (toN.units.some((u) => u.owner !== player) || toN.owner !== "neutral");
    if (hostile) {
      const foe = toN.units.find((u) => u.owner !== player && u.owner !== "neutral")?.owner
        ?? (toN.owner !== "neutral" ? toN.owner : null);
      const truce =
        (next.ceasefire[player] ?? 0) > 0 ||
        (foe && foe !== "neutral" && (next.ceasefire[foe] ?? 0) > 0);
      if (truce) {
        set({ moveDialog: null });
        return;
      }
    }

    // ===== Embark: land units boarding a transport/higgins, or aircraft
    // landing on a friendly carrier in a sea zone =====
    if ((kind === "land" || kind === "air") && toN.isSea && !(kind === "land" && fromN.isSea)) {
      const cargoKind = kind === "air" ? "air" : "land";
      const need = kind === "air"
        ? movers.length
        : movers.reduce((n, u) => n + Math.max(1, UNIT_STATS[u.type].seats), 0);
      const transport = toN.units.find(
        (u) => u.owner === player && carrierCargoKind(u.type) === cargoKind
          && transportCapacityRemaining(u) >= need,
      );
      if (!transport) { set({ moveDialog: null }); return; }
      // remove movers from wherever they were (territory or another carrier)
      fromN.units = fromN.units.filter((u) => !chosenUnitIds.includes(u.id));
      for (const u of fromN.units) {
        if (u.cargo) u.cargo = u.cargo.filter((c) => !chosenUnitIds.includes(c.id));
      }
      transport.cargo = [
        ...(transport.cargo ?? []),
        ...movers.map((u) => ({ ...u, movedThisTurn: true })),
      ];
      log(next, `${NATIONS[player].name} ${cargoKind === "air" ? "landed" : "embarked"} ${movers.length} unit(s) onto a ${UNIT_STATS[transport.type].label} in ${toN.name}.`);
      set({
        game: next,
        moveDialog: null,
        selectedUnitIds: [],
        mapAnimation: mapAnimation("march", fromN.id, toN.id, movers),
      });
      return;
    }

    // ===== Disembark: cargo units leaving a transport onto adjacent land =====
    if (kind === "land" && fromN.isSea && !toN.isSea) {
      // remove movers from every transport's cargo
      for (const u of fromN.units) {
        if (u.cargo && u.cargo.length) {
          u.cargo = u.cargo.filter((c) => !chosenUnitIds.includes(c.id));
        }
      }
      const disembarked = movers.map((u) => ({ ...u, movedThisTurn: true, cargo: undefined }));
      const isEnemyHeld = toN.owner !== "neutral" && toN.owner !== player && toN.units.length > 0;
      if (isEnemyHeld) {
        // stage disembark on the sea zone as "attackers from sea" — to make
        // battle code work we temporarily place them on fromN as ghosts.
        fromN.units.push(...disembarked);
        const ghostIds = disembarked.map((u) => u.id);
        log(next, `Landing at ${toN.name} — roll the dice!`);
        set({
          game: next,
          pendingBattle: {
            attackerId: fromN.id, defenderId: toN.id,
            attackerUnitIds: ghostIds, rounds: [], status: "ongoing",
          },
          moveDialog: null, selectedUnitIds: [],
          mapAnimation: mapAnimation("attack", fromN.id, toN.id, disembarked),
        });
        return;
      }
      toN.units.push(...disembarked);
      const capturesTerritory = toN.owner !== player;
      if (capturesTerritory) {
        captureTerritory(next, toN, player);
        log(next, `${toN.name} occupied by ${NATIONS[player].name} (amphibious landing).`);
      } else {
        log(next, `${NATIONS[player].name} disembarked ${movers.length} unit(s) at ${toN.name}.`);
      }
      set({
        game: next,
        moveDialog: null,
        selectedTerritoryId: toN.id,
        selectedUnitIds: [],
        mapAnimation: mapAnimation(capturesTerritory ? "capture" : "march", fromN.id, toN.id, movers),
      });
      return;
    }

    // ===== Standard move (land→land, naval→sea, air anywhere) =====
    const isEnemyHeld =
      toN.owner !== "neutral" && toN.owner !== player && toN.units.length > 0;
    const isEnemyTerritory =
      toN.owner !== "neutral" && toN.owner !== player;

    // Aircraft taking off from a carrier: lift them out of the deck first.
    for (const u of fromN.units) {
      if (u.cargo && u.cargo.length) {
        const leaving = u.cargo.filter((c) => chosenUnitIds.includes(c.id));
        if (leaving.length) {
          u.cargo = u.cargo.filter((c) => !chosenUnitIds.includes(c.id));
          fromN.units.push(...leaving);
        }
      }
    }

    if (isEnemyHeld && kind === "land" && moveDialog.extras) {
      // Units joining from neighbouring territories assemble with the main
      // force for the battle, remembering where they came from.
      for (const extra of moveDialog.extras) {
        const src = next.territories[extra.fromId];
        if (!src || src.owner !== player) continue;
        const ids: string[] = [];
        for (const [type, list] of Object.entries(extra.idsByType)) ids.push(...list.slice(0, extra.chosen[type] ?? 0));
        if (!ids.length) continue;
        const joining = src.units.filter((u) => ids.includes(u.id) && !u.movedThisTurn);
        src.units = src.units.filter((u) => !joining.some((j) => j.id === u.id));
        fromN.units.push(...joining.map((u) => ({ ...u, stagedFrom: src.id })));
        chosenUnitIds.push(...joining.map((u) => u.id));
        movers.push(...joining);
      }
    }

    if (isEnemyHeld) {
      log(next, `Engagement at ${toN.name} — roll the dice!`);
      set({
        game: next,
        pendingBattle: {
          attackerId: fromN.id, defenderId: toN.id,
          attackerUnitIds: chosenUnitIds, rounds: [], status: "ongoing",
        },
          moveDialog: null, selectedUnitIds: [],
          mapAnimation: mapAnimation("attack", fromN.id, toN.id, movers),
      });
      return;
    }

    fromN.units = fromN.units.filter((u) => !chosenUnitIds.includes(u.id));
    const moveDist = Math.max(1, tileDistance(game, from.id, to.id, 8));
    toN.units.push(...movers.map((u) => spendMoves(u, moveDist)));
    if (!toN.isSea && (isEnemyTerritory || toN.owner === "neutral")) {
      captureTerritory(next, toN, player);
      log(next, `${toN.name} occupied by ${NATIONS[player].name}.`);
    }

    set({
      game: next,
      moveDialog: null,
      selectedTerritoryId: to.id,
      selectedUnitIds: [],
      mapAnimation: mapAnimation(
        !toN.isSea && (isEnemyTerritory || to.owner === "neutral") ? "capture" : "march",
        fromN.id,
        toN.id,
        movers,
      ),
    });
  },

  cancelMove: () => set({ moveDialog: null }),

  rollBattleRound: () => {
    const { game, pendingBattle } = get();
    if (!pendingBattle || pendingBattle.status !== "ongoing") return;

    const next: GameState = JSON.parse(JSON.stringify(game));
    const from = next.territories[pendingBattle.attackerId];
    const to = next.territories[pendingBattle.defenderId];
    let attackerIds = [...pendingBattle.attackerUnitIds];

    // ---------- Opening fire (first round only) ----------
    let opening: OpeningFire | undefined = pendingBattle.opening;
    if (pendingBattle.rounds.length === 0) {
      opening = resolveOpeningFire(next, from, to, attackerIds);
      attackerIds = attackerIds.filter((id) => from.units.some((u) => u.id === id));
      for (const note of opening.notes) log(next, note);
      if (to.units.length === 0 && attackerIds.length > 0) {
        set({
          game: next,
          pendingBattle: { ...pendingBattle, attackerUnitIds: attackerIds, opening, status: "attacker-won" },
          mapAnimation: mapAnimation("attack", from.id, to.id, from.units),
        });
        return;
      }
      if (attackerIds.length === 0) {
        set({
          game: next,
          pendingBattle: {
            ...pendingBattle, attackerUnitIds: [], opening,
            status: to.units.length > 0 ? "defender-won" : "stalemate",
          },
        });
        return;
      }
    }

    const attackers = from.units.filter((u) => attackerIds.includes(u.id));
    const defenders = [...to.units];

    // ---------- Dogfight: while both sides have aircraft, only planes fire ----------
    const atkAir = attackers.filter((u) => isAir(u.type));
    const defAir = defenders.filter((u) => isAir(u.type));
    const dogfight = atkAir.length > 0 && defAir.length > 0;
    const firingAttackers = dogfight ? atkAir : attackers;
    const firingDefenders = dogfight ? defAir : defenders;

    // Higgins boats give the infantry they land a +1 on a coastal assault, and a
    // halftrack carrying infantry attacks at +1.
    const higginsSupport = from.isSea && from.units.some(
      (u) => u.type === "higgins" && u.owner === next.currentPlayer,
    );
    const spotted = hasSpotter(next, to.id, next.currentPlayer);
    const attackRolls: DieRoll[] = firingAttackers.map((u) => {
      const r = d6();
      let target = UNIT_STATS[u.type].attack;
      if (higginsSupport && u.type === "infantry") target += 1;
      if (u.type === "artillery" && spotted) target += 1;
      if (u.type === "halftrack" && (u.cargo ?? []).some((c) => c.type === "infantry")) target += 1;
      target = Math.min(6, target);
      const hit = r <= target;
      const dr: DieRoll = { unitId: u.id, type: u.type, roll: r, target, hit, casualty: false };
      if (hit && UNIT_STATS[u.type].d4MultiKill && !isRoughTerrain(to.terrain)) dr.bomberKills = d4();
      return dr;
    });
    // Fortifications and other buildings stiffen every defender here.
    const fortBonus = to.isSea ? 0 : structureDefenseBonus(to);
    const defenseRolls: DieRoll[] = firingDefenders.map((u) => {
      const r = d6();
      const target = Math.min(6, UNIT_STATS[u.type].defense + fortBonus);
      return { unitId: u.id, type: u.type, roll: r, target, hit: r <= target, casualty: false };
    });
    const attackHits = attackRolls.reduce(
      (n, r) => n + (r.hit ? (r.bomberKills ?? 1) : 0),
      0,
    );
    const defenseHits = defenseRolls.filter((r) => r.hit).length;

    // Casualty pools — a dogfight can only shoot down aircraft, and submarines
    // stay hidden unless the other side brought a destroyer.
    const defPool = dogfight ? defAir : defenders;
    const atkPool = dogfight ? atkAir : attackers;
    const deadDef = orderedCasualties(defPool, attackHits, hiddenSubs(defPool, attackers));
    const deadAtk = orderedCasualties(atkPool, defenseHits, hiddenSubs(atkPool, defenders));

    for (const r of defenseRolls) if (deadAtk.has(r.unitId)) r.casualty = true;
    for (const r of attackRolls) if (deadDef.has(r.unitId)) r.casualty = true;

    // Infirmary recycling: remember every infantry lost, per nation.
    for (const u of [...to.units, ...from.units]) {
      if (u.type !== "infantry" || u.owner === "neutral") continue;
      if (deadDef.has(u.id) || deadAtk.has(u.id)) {
        next.infirmaryPool[u.owner] = (next.infirmaryPool[u.owner] ?? 0) + 1;
      }
    }

    to.units = to.units.filter((u) => !deadDef.has(u.id));
    from.units = from.units.filter((u) => !deadAtk.has(u.id));

    const survivingAttackerIds = attackerIds.filter((id) => !deadAtk.has(id));

    let status: BattleStatus = "ongoing";
    if (to.units.length === 0 && survivingAttackerIds.length > 0) status = "attacker-won";
    else if (survivingAttackerIds.length === 0 && to.units.length > 0) status = "defender-won";
    else if (survivingAttackerIds.length === 0 && to.units.length === 0) status = "stalemate";

    log(
      next,
      `${dogfight ? "Dogfight" : "Round"} ${pendingBattle.rounds.length + 1} at ${to.name}: ${attackHits} hit / ${defenseHits} hit.`,
    );

    set({
      game: next,
      pendingBattle: {
        ...pendingBattle,
        attackerUnitIds: survivingAttackerIds,
        opening,
        rounds: [...pendingBattle.rounds, { attackRolls, defenseRolls, attackHits, defenseHits, dogfight }],
        status,
      },
      mapAnimation: mapAnimation("attack", from.id, to.id, attackers),
    });
  },

  retreatBattle: () => {
    const { game, pendingBattle } = get();
    if (!pendingBattle || pendingBattle.status !== "ongoing") return;
    // Withdrawing is free, but only between rounds: the first round must be fought.
    if (pendingBattle.rounds.length === 0) return;
    const next: GameState = JSON.parse(JSON.stringify(game));
    log(next, `${NATIONS[next.currentPlayer].name} withdraws from ${next.territories[pendingBattle.defenderId].name}.`);
    set({
      game: next,
      pendingBattle: { ...pendingBattle, status: "retreated" },
    });
  },

  closeBattle: () => {
    const { game, pendingBattle } = get();
    if (!pendingBattle) return;
    const next: GameState = JSON.parse(JSON.stringify(game));
    const from = next.territories[pendingBattle.attackerId];
    const to = next.territories[pendingBattle.defenderId];
    const player = next.currentPlayer;

    let nextSelectedId: string | null = from.id;
    let resolvedAnimation: MapAnimationEvent | null = null;
    if (pendingBattle.status === "attacker-won") {
      const movers = from.units.filter((u) => pendingBattle.attackerUnitIds.includes(u.id));
      from.units = from.units.filter((u) => !pendingBattle.attackerUnitIds.includes(u.id));
      // Each unit pays for the distance from where it actually set out.
      to.units = movers.map((u) => {
        const dist = Math.max(1, tileDistance(game, u.stagedFrom ?? from.id, to.id, 8));
        const { stagedFrom: _origin, ...rest } = spendMoves(u, dist);
        void _origin;
        return rest;
      });
      if (!to.isSea) captureTerritory(next, to, player);
      log(next, `${NATIONS[player].name} captured ${to.name}.`);
      nextSelectedId = to.id;
      resolvedAnimation = mapAnimation("capture", from.id, to.id, movers);
    } else if (pendingBattle.status === "retreated") {
      const retreating = from.units.filter((u) => pendingBattle.attackerUnitIds.includes(u.id));
      from.units = from.units.map((u) =>
        pendingBattle.attackerUnitIds.includes(u.id) ? { ...u, movedThisTurn: true } : u,
      );
      // Units that joined from elsewhere go back where they came from.
      const stayed: Unit[] = [];
      for (const u of from.units) {
        const home = u.stagedFrom ? next.territories[u.stagedFrom] : null;
        const { stagedFrom: _origin, ...rest } = u;
        void _origin;
        if (home && home.owner === player) home.units.push(rest);
        else stayed.push(rest);
      }
      from.units = stayed;
      log(next, `Forces withdrew from ${to.name}.`);
      resolvedAnimation = mapAnimation("retreat", to.id, from.id, retreating);
    } else if (pendingBattle.status === "defender-won") {
      log(next, `Attack on ${to.name} crushed.`);
    } else if (pendingBattle.status === "stalemate") {
      log(next, `Both sides annihilated at ${to.name}.`);
    }

    set({
      game: next,
      pendingBattle: null,
      selectedTerritoryId: nextSelectedId,
      selectedUnitIds: [],
      mapAnimation: resolvedAnimation ?? get().mapAnimation,
    });
  },

  buyUnit: (type) => {
    const { game, selectedTerritoryId } = get();
    if (!selectedTerritoryId) return;
    const t = game.territories[selectedTerritoryId];
    const player = game.currentPlayer;
    if (t.owner !== player) return;
    if (t.isSea) return;
    // Phase 7 terrain production rules.
    if (isRoughTerrain(t.terrain)) {
      if (!ROUGH_TERRAIN_UNITS.has(type)) return;
      if (type === "infantry" && !hasStructure(t, "fob")) return;
    } else if (t.terrain === "desert" && DESERT_VEHICLES.has(type)) {
      return; // vehicles may pass deserts but never stop there, so no building them here
    }
    const cost = UNIT_STATS[type].cost;
    if (game.treasury[player] < cost) return;

    if (!t.hasFactory) {
      if (type !== "infantry") return;
      if (t.builtInfantryThisTurn) return;
    }
    // Airfields/harbors are required for air and naval production.
    if (isAir(type) && !hasStructure(t, "airfield")) return;
    if (isNaval(type) && !hasStructure(t, "harbor")) return;
    // Rail guns are built on the rail network, max three active per nation.
    if (type === "railgun") {
      if (!hasStructure(t, "railroad")) return;
      const active = Object.values(game.territories).reduce(
        (n, terr) => n + terr.units.filter((u) => u.owner === player && u.type === "railgun").length,
        0,
      );
      if (active >= 3) return;
    }

    // Naval units need an adjacent sea zone to launch into.
    let spawnTerritoryId = t.id;
    if (isNaval(type)) {
      const seaId = t.adjacent.find((nid) => game.territories[nid]?.isSea);
      if (!seaId) return;
      spawnTerritoryId = seaId;
    }

    const next: GameState = JSON.parse(JSON.stringify(game));
    next.treasury[player] -= cost;
    const newUnit: Unit = {
      id: `u${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
      type,
      owner: player,
      movedThisTurn: true,
    };
    if (CARRIER_CAPACITY[type]) newUnit.cargo = [];
    next.territories[spawnTerritoryId].units.push(newUnit);
    if (!t.hasFactory) next.territories[t.id].builtInfantryThisTurn = true;
    const where = next.territories[spawnTerritoryId].name;
    log(next, `${NATIONS[player].name} built ${UNIT_STATS[type].label} in ${where}.`);
    set({ game: next });
  },

  buyUnits: (order) => {
    const player = get().game.currentPlayer;
    let bought = 0;
    for (const [type, count] of Object.entries(order) as Array<[UnitType, number]>) {
      for (let i = 0; i < (count ?? 0); i++) {
        const before = get().game.treasury[player];
        get().buyUnit(type);
        if (get().game.treasury[player] >= before) break; // not allowed here, or out of money
        bought++;
      }
    }
    return bought;
  },

  buyFactory: () => {
    const { game, selectedTerritoryId } = get();
    if (!selectedTerritoryId) return;
    const t = game.territories[selectedTerritoryId];
    const player = game.currentPlayer;
    if (t.owner !== player) return;
    if (t.isSea) return;
    if (t.hasFactory) return;
    // F.O.B.s on mountains/jungle can never become factories (rulebook terrain 2).
    if (isRoughTerrain(t.terrain)) return;
    if (game.treasury[player] < FACTORY_COST) return;

    const next: GameState = JSON.parse(JSON.stringify(game));
    next.treasury[player] -= FACTORY_COST;
    next.territories[t.id].hasFactory = true;
    if (!next.territories[t.id].structures.includes("factory")) {
      next.territories[t.id].structures.push("factory");
    }
    log(next, `${NATIONS[player].name} constructed a Factory in ${t.name}.`);
    set({ game: next });
  },

  buildStructure: (type) => {
    const { game, selectedTerritoryId } = get();
    if (!selectedTerritoryId) return;
    const t = game.territories[selectedTerritoryId];
    const player = game.currentPlayer;
    if (t.owner !== player || t.isSea) return;
    if (hasStructure(t, type)) return;
    const spec = STRUCTURE_STATS[type];
    if (game.treasury[player] < spec.cost) return;
    if (spec.coastal && !t.adjacent.some((nid) => game.territories[nid]?.isSea)) return;
    // Only one capital per nation.
    if (type === "capital" && Object.values(game.territories).some(
      (x) => x.owner === player && hasStructure(x, "capital"),
    )) return;

    const next: GameState = JSON.parse(JSON.stringify(game));
    next.treasury[player] -= spec.cost;
    const nt = next.territories[t.id];
    nt.structures = [...(nt.structures ?? []), type];
    if (type === "factory") nt.hasFactory = true;
    // A new Stock Market comes with its opening portfolio of bonds.
    if (type === "stock_market") {
      for (const cat of BOND_CATEGORIES) {
        next.bonds[player][cat] += BOND_SPECS[cat].starting;
      }
      log(next, `${NATIONS[player].name} opened a Stock Market and received starting bonds.`);
    }
    log(next, `${NATIONS[player].name} built a ${spec.label} in ${t.name}.`);
    set({ game: next });
  },

  /** Rulebook upgrades: Runway → Airfield, F.O.B. → Factory, Outpost → Harbor. */
  upgradeStructure: (from) => {
    const { game, selectedTerritoryId } = get();
    if (!selectedTerritoryId) return;
    const t = game.territories[selectedTerritoryId];
    const player = game.currentPlayer;
    if (!t || t.isSea || t.owner !== player) return;
    const up = STRUCTURE_UPGRADES[from];
    if (!up || !hasStructure(t, from) || hasStructure(t, up.to)) return;
    // A F.O.B. in mountains or jungle can never become a factory.
    if (up.to === "factory" && isRoughTerrain(t.terrain)) return;
    if (STRUCTURE_STATS[up.to].coastal && !t.adjacent.some((nid) => game.territories[nid]?.isSea)) return;
    if (game.treasury[player] < up.cost) return;

    const next: GameState = JSON.parse(JSON.stringify(game));
    next.treasury[player] -= up.cost;
    const nt = next.territories[t.id];
    nt.structures = [...(nt.structures ?? []).filter((s) => s !== from), up.to];
    if (up.to === "factory") nt.hasFactory = true;
    log(next, `${NATIONS[player].name} upgraded the ${STRUCTURE_STATS[from].label} in ${t.name} to a ${STRUCTURE_STATS[up.to].label}.`);
    set({ game: next });
  },

  /** A dozer spends its turn clearing hedgehogs from the tile it stands on. */
  dismantleHedgehogs: () => {
    const { game, selectedTerritoryId } = get();
    if (!selectedTerritoryId) return;
    const t = game.territories[selectedTerritoryId];
    const player = game.currentPlayer;
    if (!t || t.isSea || !hasStructure(t, "hedgehogs")) return;
    const dozer = t.units.find((u) => u.type === "dozer" && u.owner === player && !u.movedThisTurn);
    if (!dozer) return;

    const next: GameState = JSON.parse(JSON.stringify(game));
    const nt = next.territories[t.id];
    nt.structures = (nt.structures ?? []).filter((s) => s !== "hedgehogs");
    const nd = nt.units.find((u) => u.id === dozer.id);
    if (nd) nd.movedThisTurn = true;
    log(next, `${NATIONS[player].name} cleared the hedgehogs in ${t.name} with a dozer.`);
    set({ game: next });
  },


  // ---------------- Phase 4: economy & victory points ----------------

  sellVictoryPoint: () => {
    const { game } = get();
    const player = game.currentPlayer;
    if (game.turn < 2) return; // selling opens on game day 2
    if ((game.vp[player] ?? 0) < 1) return;
    const next: GameState = JSON.parse(JSON.stringify(game));
    const rate = vpSellRate(incomeFor(next, player));
    next.vp[player] -= 1;
    next.treasury[player] += rate;
    next.economy.soldVPThisTurn += 1;
    log(next, `${NATIONS[player].name} sold 1 VP for ${rate} NPP.`);
    set({ game: next });
  },

  rollStockMarket: () => {
    const { game } = get();
    const player = game.currentPlayer;
    if (game.economy.stockRolledThisTurn) return;
    if (!ownsStructure(game, player, "stock_market")) return;
    const next: GameState = JSON.parse(JSON.stringify(game));
    const parts: string[] = [];
    for (const cat of BOND_CATEGORIES) {
      const spec = BOND_SPECS[cat];
      const roll = dN(spec.die);
      const bull = roll % 2 === 0; // even = gain, odd = loss
      const held = next.bonds[player][cat];
      if (held < roll) { parts.push(`${spec.label} skipped`); continue; }
      const delta = bull ? roll : -roll;
      next.bonds[player][cat] = Math.max(0, held + delta);
      parts.push(`${spec.label} ${delta > 0 ? "+" : ""}${delta}`);
    }
    next.economy.stockRolledThisTurn = true;
    log(next, `Market report — ${parts.join(", ")}.`);
    set({ game: next });
  },

  sellBonds: (category, amount) => {
    const { game } = get();
    const player = game.currentPlayer;
    if (!ownsStructure(game, player, "stock_market")) return;
    const spec = BOND_SPECS[category];
    const held = game.bonds[player][category];
    const sellable = Math.max(0, held - spec.minimum);
    const qty = Math.min(amount, sellable);
    if (qty <= 0) return;
    const next: GameState = JSON.parse(JSON.stringify(game));
    next.bonds[player][category] -= qty;
    next.treasury[player] += qty; // 1 bond = 1 NPP
    log(next, `${NATIONS[player].name} cashed ${qty} ${spec.label} bond(s) for ${qty} NPP.`);
    set({ game: next });
  },

  dayTrade: (stake) => {
    const { game } = get();
    const player = game.currentPlayer;
    if (game.economy.dayTradedThisTurn) return;
    if (!ownsStructure(game, player, "stock_market")) return;
    const bet = Math.min(Math.max(1, Math.floor(stake)), MAX_DAY_TRADE);
    if (game.treasury[player] < bet) return;
    const next: GameState = JSON.parse(JSON.stringify(game));
    const target = dayTradeTarget(bet, incomeFor(next, player));
    const roll = d6();
    const win = roll <= target;
    next.treasury[player] += win ? bet : -bet;
    next.economy.dayTradedThisTurn = true;
    log(
      next,
      `Day trade ${bet} NPP — rolled ${roll} (needs ≤${target}): ${win ? `won +${bet}` : `lost -${bet}`} NPP.`,
    );
    set({ game: next });
  },

  scrapUnit: (unitId) => {
    const { game, selectedTerritoryId } = get();
    const player = game.currentPlayer;
    if (!selectedTerritoryId) return;
    if (!ownsStructure(game, player, "scrap_yard")) return;
    if (game.economy.scrappedThisTurn >= MAX_SCRAP_PER_TURN) return;
    const t = game.territories[selectedTerritoryId];
    const unit = t.units.find((u) => u.id === unitId);
    if (!unit || unit.owner !== player || unit.type === "infantry") return;
    const next: GameState = JSON.parse(JSON.stringify(game));
    const nt = next.territories[t.id];
    nt.units = nt.units.filter((u) => u.id !== unitId);
    const refund = Math.floor(UNIT_STATS[unit.type].cost / 2);
    next.treasury[player] += refund;
    next.economy.scrappedThisTurn += 1;
    log(next, `${UNIT_STATS[unit.type].label} scrapped for ${refund} NPP.`);
    set({ game: next, selectedUnitIds: [] });
  },

  claimInfirmaryInfantry: () => {
    const { game } = get();
    const player = game.currentPlayer;
    if ((game.infirmaryPool[player] ?? 0) < 3) return;
    const home = Object.values(game.territories).find(
      (t) => t.owner === player && hasStructure(t, "infirmary"),
    );
    if (!home) return;
    const next: GameState = JSON.parse(JSON.stringify(game));
    next.infirmaryPool[player] -= 3;
    next.territories[home.id].units.push({
      id: `u${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
      type: "infantry",
      owner: player,
      movedThisTurn: true,
    });
    log(next, `Infirmary in ${home.name} returned 1 Infantry to the line.`);
    set({ game: next });
  },

  /**
   * Rulebook warehouse draw. Everyone rolls the first tier; each warehouse owned
   * unlocks one further tier, each with its own D6 that succeeds on 1-2. Cards are
   * drawn by weight and can be units, a ceasefire, or an A-bomb blueprint.
   */
  drawWarehouseCard: () => {
    const { game } = get();
    const player = game.currentPlayer;
    if (game.economy.warehouseDrawnThisTurn) return;
    const homes = Object.values(game.territories).filter(
      (t) => t.owner === player && hasStructure(t, "warehouse"),
    );
    const anchor =
      homes[0] ??
      Object.values(game.territories).find(
        (t) => t.owner === player && (hasStructure(t, "capital") || t.hasFactory),
      );
    if (!anchor) return;

    const next: GameState = JSON.parse(JSON.stringify(game));
    next.economy.warehouseDrawnThisTurn = true;
    const tiers = Math.min(WAREHOUSE_TIERS.length, 1 + homes.length);
    const lines: string[] = [];

    for (let tier = 0; tier < tiers; tier++) {
      const roll = d6();
      if (roll > 2) {
        lines.push(`tier ${tier + 1}: ${roll} ✘`);
        continue;
      }
      const deck = WAREHOUSE_TIERS[tier];
      const total = deck.reduce((s, c) => s + c.weight, 0);
      let pick = Math.random() * total;
      let card = deck[deck.length - 1];
      for (const c of deck) {
        pick -= c.weight;
        if (pick <= 0) {
          card = c;
          break;
        }
      }
      if (card.kind === "unit") {
        next.territories[anchor.id].units.push({
          id: `u${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
          type: card.unit,
          owner: player,
          movedThisTurn: true,
          ...(CARRIER_CAPACITY[card.unit] ? { cargo: [] } : {}),
        });
        lines.push(`tier ${tier + 1}: ${roll} ✔ 1 ${UNIT_STATS[card.unit].label}`);
      } else if (card.kind === "ceasefire") {
        if (card.scope === "world") {
          for (const n of PLAYER_ORDER) next.ceasefire[n] = 2;
          lines.push(`tier ${tier + 1}: ${roll} ✔ worldwide ceasefire (2 turns)`);
        } else {
          next.ceasefire[player] = 2;
          lines.push(`tier ${tier + 1}: ${roll} ✔ personal ceasefire (2 turns)`);
        }
      } else {
        next.blueprints[player] = (next.blueprints[player] ?? 0) + 1;
        if (next.blueprints[player] >= ABOMB_BLUEPRINTS_REQUIRED) {
          next.blueprints[player] -= ABOMB_BLUEPRINTS_REQUIRED;
          next.abombs[player] = (next.abombs[player] ?? 0) + 1;
          lines.push(`tier ${tier + 1}: ${roll} ✔ blueprint — A-BOMB ASSEMBLED`);
        } else {
          lines.push(
            `tier ${tier + 1}: ${roll} ✔ A-bomb blueprint (${next.blueprints[player]}/${ABOMB_BLUEPRINTS_REQUIRED})`,
          );
        }
      }
    }
    log(next, `Warehouse draw — ${lines.join(", ")}.`);
    set({ game: next });
  },

  /** Declare which bomber is carrying an assembled A-bomb. */
  armAbomb: (unitId) => {
    const { game, selectedTerritoryId } = get();
    const player = game.currentPlayer;
    if (!selectedTerritoryId) return;
    if ((game.abombs[player] ?? 0) <= 0) return;
    const here = game.territories[selectedTerritoryId];
    const bomber = here?.units.find(
      (u) => u.id === unitId && u.owner === player && u.type === "bomber" && !u.abomb,
    );
    if (!bomber) return;
    const next: GameState = JSON.parse(JSON.stringify(game));
    const nb = next.territories[selectedTerritoryId].units.find((u) => u.id === unitId)!;
    nb.abomb = true;
    next.abombs[player] -= 1;
    log(next, `${NATIONS[player].name} loaded an A-bomb onto a bomber in ${here.name}.`);
    set({ game: next });
  },

  /**
   * Fly the A-bomb. The armed bomber reaches six tiles; AA over the target fires
   * first (3-4 downs the plane and the bomb is lost with it). A detonation wipes
   * out every unit and every building in the province.
   */
  abombStrike: (targetId) => {
    const { game, selectedTerritoryId, pendingBattle } = get();
    if (pendingBattle) return;
    const player = game.currentPlayer;
    if (!selectedTerritoryId) return;
    const from = game.territories[selectedTerritoryId];
    const target = game.territories[targetId];
    if (!from || !target) return;
    const bomber = from.units.find(
      (u) => u.owner === player && u.type === "bomber" && u.abomb && !u.movedThisTurn,
    );
    if (!bomber) return;
    const dist = tileDistance(game, selectedTerritoryId, targetId, ABOMB_RANGE);
    if (dist < 0 || dist > ABOMB_RANGE) return;

    const next: GameState = JSON.parse(JSON.stringify(game));
    const nFrom = next.territories[selectedTerritoryId];
    const nTo = next.territories[targetId];
    nFrom.units = nFrom.units.filter((u) => u.id !== bomber.id);

    const aa = nTo.units.some((u) => u.owner !== player && u.type === "aa_gun");
    if (aa) {
      const roll = d6();
      if (roll >= 3 && roll <= 4) {
        log(next, `AA over ${nTo.name} rolled ${roll} — the A-bomb carrier was shot down.`);
        set({ game: next, selectedUnitIds: [] });
        return;
      }
    }

    const killed = nTo.units.length;
    nTo.units = [];
    let vp = 0;
    for (const s of nTo.structures ?? []) {
      if (nTo.owner !== player && nTo.owner !== "neutral") vp += STRUCTURE_STATS[s].vpDestroyed;
      if (s === "capital" && nTo.owner !== "neutral" && nTo.owner !== player) {
        next.capitalLosses[nTo.owner] = (next.capitalLosses[nTo.owner] ?? 0) + 1;
      }
    }
    nTo.structures = [];
    nTo.hasFactory = false;
    if (vp > 0) next.vp[player] = (next.vp[player] ?? 0) + vp;
    log(
      next,
      `☢ A-BOMB detonated over ${nTo.name} — ${killed} unit(s) and every building destroyed${vp > 0 ? `, +${vp} VP` : ""}.`,
    );
    set({
      game: next,
      selectedUnitIds: [],
      mapAnimation: mapAnimation("attack", selectedTerritoryId, targetId, [bomber]),
    });
  },


  // ---------------- Phase 5: espionage ----------------

  /**
   * Stand-off bombardment (rulebook): artillery, howitzers, rail guns and
   * destroyers / cruisers / battleships shell a nearby tile.
   */
  bombardTerritory: (targetId) => {
    const { game, selectedTerritoryId, selectedUnitIds, pendingBattle } = get();
    if (pendingBattle) return;
    const player = game.currentPlayer;
    if (!selectedTerritoryId) return;
    const from = game.territories[selectedTerritoryId];
    const target = game.territories[targetId];
    if (!from || !target) return;
    const available = from.units.filter((u) => canBombardNow(game, selectedTerritoryId, u, player));
    const picked = available.filter((u) => selectedUnitIds.includes(u.id));
    const guns = picked.length > 0 ? picked : available;
    if (guns.length === 0) return;
    const allowed = guns.filter((u) =>
      bombardTargetsFor(game, selectedTerritoryId, [u]).has(targetId),
    );
    if (allowed.length === 0) return;

    const next: GameState = JSON.parse(JSON.stringify(game));
    const nFrom = next.territories[selectedTerritoryId];
    const nTo = next.territories[targetId];
    const rough = isRoughTerrain(nTo.terrain);
    const spotted = hasSpotter(next, targetId, player);
    const lines: string[] = [];
    let lost = 0;
    const targetUnits: Unit[] = JSON.parse(JSON.stringify(nTo.units));
    const shots: BombardShot[] = [];
    for (const u of allowed) {
      const gun = nFrom.units.find((x) => x.id === u.id);
      if (gun) {
        gun.bombardedThisTurn = true;
        // Howitzers may move then bombard, but not bombard then move.
        if (u.type === "howitzer") gun.movedThisTurn = true;
      }
      const pool = bombardablePool(nTo, player, u.type);
      if (pool.length === 0) continue;
      let kills = 0;
      const shot: BombardShot = { unitId: u.id, type: u.type, rolls: [], target: 0, killed: [] };
      shots.push(shot);
      if (u.type === "battleship" && !rough) {
        // Battleship: D4 for how many land units can be hit, then D6 (1-4) each.
        const n = d4();
        const rolls: number[] = [];
        for (let i = 0; i < n; i++) {
          const r = d6();
          rolls.push(r);
          if (r <= 4) kills++;
          shot.rolls.push({ roll: r, hit: r <= 4 });
        }
        shot.target = 4;
        shot.d4 = n;
        lines.push(
          `Battleship rolled a D4: ${n} shot${n === 1 ? "" : "s"} — ${rolls.join(", ")} (hit on 1-4) → ${kills} hit${kills === 1 ? "" : "s"}`,
        );
      } else {
        const roll = d6();
        const tgt =
          u.type === "battleship"
            ? 4
            : Math.min(6, UNIT_STATS[u.type].bombard + (u.type === "artillery" && spotted ? 1 : 0));
        const hit = roll <= tgt;
        kills = hit ? 1 : 0;
        shot.rolls.push({ roll, hit });
        shot.target = tgt;
        // D4 multi-kills never apply to mountain/jungle targets or naval targets.
        if (hit && u.type === "howitzer" && !rough && !nTo.isSea) kills = d4();
        lines.push(`${UNIT_STATS[u.type].short} ${roll}/${tgt}${hit ? ` ✔×${kills}` : " ✘"}`);
      }
      if (kills > 0) {
        const dead = orderedCasualties(pool, kills, new Set());
        nTo.units = nTo.units.filter((x) => !dead.has(x.id));
        lost += dead.size;
        shot.killed = [...dead];
      }
    }
    log(next, `Bombardment of ${nTo.name} — ${lines.join(", ")} — ${lost} unit(s) destroyed.`);
    set({
      game: next,
      selectedUnitIds: [],
      bombardTargeting: false,
      mapAnimation: mapAnimation("attack", selectedTerritoryId, targetId, allowed),
      bombardEvent: shots.length
        ? { id: Date.now() + Math.random(), fromId: selectedTerritoryId, targetId, player, targetUnits, shots }
        : null,
    });
  },

  /**
   * Kamikaze run: fighters (4 tiles, 1-3 to hit) and bombers (6 tiles, D4 kills then
   * D6 1-4 each) strike a distant target and are destroyed afterwards.
   * Defending AA guns get first strike (1-2 downs a fighter, 3-4 downs a bomber).
   */
  kamikazeStrike: (targetId) => {
    const { game, selectedTerritoryId, selectedUnitIds, pendingBattle } = get();
    if (pendingBattle) return;
    const player = game.currentPlayer;
    if (!selectedTerritoryId) return;
    const from = game.territories[selectedTerritoryId];
    const target = game.territories[targetId];
    if (!from || !target) return;
    const planes = from.units.filter(
      (u) =>
        selectedUnitIds.includes(u.id) &&
        u.owner === player &&
        !u.movedThisTurn &&
        (u.type === "fighter" || u.type === "bomber"),
    );
    if (planes.length === 0) return;
    const reach = Math.max(...planes.map((u) => UNIT_STATS[u.type].range));
    if (!kamikazeTargets(game, selectedTerritoryId, reach).has(targetId)) return;

    const next: GameState = JSON.parse(JSON.stringify(game));
    const nFrom = next.territories[selectedTerritoryId];
    const nTo = next.territories[targetId];
    const lines: string[] = [];
    let hits = 0;

    // AA first strike against the incoming flight.
    let aaShots = nTo.units.filter((u) => u.owner !== player && u.type === "aa_gun").length;
    const survivors: Unit[] = [];
    for (const p of planes) {
      const dist = tileDistance(next, selectedTerritoryId, targetId, UNIT_STATS[p.type].range);
      if (dist < 0) continue;
      if (aaShots > 0) {
        aaShots -= 1;
        const roll = d6();
        const downed = p.type === "fighter" ? roll <= 2 : roll >= 3 && roll <= 4;
        lines.push(`AA ${roll}${downed ? ` ✔ ${UNIT_STATS[p.type].short} downed` : " ✘"}`);
        if (downed) continue;
      }
      survivors.push(p);
    }

    for (const p of survivors) {
      if (p.type === "fighter") {
        const roll = d6();
        const hit = roll <= 3;
        if (hit) hits += 1;
        lines.push(`F ${roll}/3${hit ? " ✔" : " ✘"}`);
      } else {
        // Bombers: one D6 per ship at sea; over land a D4 sets how many units may be hit.
        const attempts = nTo.isSea || isRoughTerrain(nTo.terrain) ? 1 : d4();
        let kills = 0;
        for (let i = 0; i < attempts; i++) if (d6() <= 4) kills += 1;
        hits += kills;
        lines.push(`B ×${attempts} ✔${kills}`);
      }
    }

    // Every plane that launched is expended, shot down or not.
    const launched = new Set(planes.map((u) => u.id));
    nFrom.units = nFrom.units.filter((u) => !launched.has(u.id));

    let lost = 0;
    if (hits > 0 && nTo.units.length > 0) {
      const pool = nTo.units.filter((u) => u.owner !== player);
      const dead = orderedCasualties(pool, hits, new Set());
      nTo.units = nTo.units.filter((u) => !dead.has(u.id));
      lost = dead.size;
    }
    log(
      next,
      `Kamikaze strike on ${nTo.name} — ${lines.join(", ")} — ${lost} unit(s) destroyed, ${planes.length} aircraft expended.`,
    );
    set({
      game: next,
      selectedUnitIds: [],
      mapAnimation: mapAnimation("attack", selectedTerritoryId, targetId, planes),
    });
  },



  /**
   * Escorted bombing run (rulebook Air Warfare). Bombers fly up to 6 tiles with
   * declared fighter escorts. Defending fighters within 2 tiles of the target
   * scramble on patrol and a dogfight is resolved first; if every escort dies the
   * interceptors get one shot at the bombers (1-3) and the bombers one shot back (1).
   * AA over the target then fires (1-2 downs fighters, 3-4 downs bombers) before the
   * bombers roll their D4/D6 damage. Escorts within 2 tiles also make a strafing run.
   * Survivors fly home and are spent for the turn.
   */
  bombingRun: (targetId) => {
    const { game, selectedTerritoryId, selectedUnitIds, pendingBattle } = get();
    if (pendingBattle) return;
    const player = game.currentPlayer;
    if (!selectedTerritoryId) return;
    const from = game.territories[selectedTerritoryId];
    const target = game.territories[targetId];
    if (!from || !target || targetId === selectedTerritoryId) return;

    const picked = from.units.filter(
      (u) => selectedUnitIds.includes(u.id) && u.owner === player && !u.movedThisTurn,
    );
    let bombers = picked.filter((u) => u.type === "bomber" && !(u.cargo ?? []).length);
    let escorts = picked.filter((u) => u.type === "fighter");
    if (bombers.length === 0) return;

    const dist = tileDistance(game, selectedTerritoryId, targetId, UNIT_STATS.bomber.range);
    if (dist < 1) return;
    bombers = bombers.filter((u) => UNIT_STATS[u.type].range >= dist);
    if (bombers.length === 0) return;
    if (!target.units.some((u) => u.owner !== player)) return;

    const next: GameState = JSON.parse(JSON.stringify(game));
    const nFrom = next.territories[selectedTerritoryId];
    const nTo = next.territories[targetId];
    const lines: string[] = [];
    const downed = new Set<string>();

    // --- Patrol: defending fighters within 2 tiles of the target scramble ---
    const interceptors: { unit: Unit; tileId: string }[] = [];
    for (const terr of Object.values(next.territories)) {
      if (terr.id === selectedTerritoryId) continue;
      const d = terr.id === targetId ? 0 : tileDistance(next, targetId, terr.id, 2);
      if (d < 0 || d > 2) continue;
      for (const u of terr.units) {
        if (u.type === "fighter" && u.owner !== player && u.owner !== "neutral" && !u.movedThisTurn) {
          interceptors.push({ unit: u, tileId: terr.id });
        }
      }
    }

    const deadInterceptors = new Set<string>();
    if (interceptors.length > 0) {
      lines.push(`${interceptors.length} fighter(s) scramble on patrol`);
      let atk = [...escorts];
      let def = interceptors.map((i) => i.unit);
      for (let round = 1; round <= 5 && atk.length > 0 && def.length > 0; round++) {
        let atkHits = 0;
        let defHits = 0;
        for (let i = 0; i < atk.length; i++) if (d6() <= 3) atkHits++;
        for (let i = 0; i < def.length; i++) if (d6() <= 3) defHits++;
        const killedDef = def.slice(0, atkHits);
        const killedAtk = atk.slice(0, defHits);
        killedDef.forEach((u) => deadInterceptors.add(u.id));
        killedAtk.forEach((u) => downed.add(u.id));
        def = def.slice(atkHits);
        atk = atk.slice(defHits);
        lines.push(`Dogfight ${round}: ${atkHits}/${defHits} kills`);
      }
      escorts = escorts.filter((u) => !downed.has(u.id));
      // Escorts wiped out: interceptors shoot at the bombers, bombers fire back.
      if (escorts.length === 0 && def.length > 0) {
        let hits = 0;
        for (let i = 0; i < def.length; i++) if (d6() <= 3) hits++;
        bombers.slice(0, hits).forEach((u) => downed.add(u.id));
        bombers = bombers.filter((u) => !downed.has(u.id));
        lines.push(`Interceptors down ${hits} bomber(s)`);
        let back = 0;
        for (let i = 0; i < bombers.length; i++) if (d6() === 1) back++;
        def.slice(0, back).forEach((u) => deadInterceptors.add(u.id));
        if (back) lines.push(`Bomber gunners down ${back} fighter(s)`);
      }
      // Surviving interceptors are grounded for the rest of this turn.
      for (const { unit, tileId } of interceptors) {
        const terr = next.territories[tileId];
        if (deadInterceptors.has(unit.id)) {
          terr.units = terr.units.filter((u) => u.id !== unit.id);
        } else {
          const live = terr.units.find((u) => u.id === unit.id);
          if (live) live.movedThisTurn = true;
        }
      }
    }

    // --- AA over the target ---
    let aaShots = nTo.units.filter((u) => u.owner !== player && u.type === "aa_gun").length;
    const flight = [...bombers, ...escorts];
    for (const p of flight) {
      if (aaShots <= 0) break;
      aaShots -= 1;
      const roll = d6();
      const hit = p.type === "fighter" ? roll <= 2 : roll >= 3 && roll <= 4;
      lines.push(`AA ${roll}${hit ? ` ✔ ${UNIT_STATS[p.type].short} downed` : " ✘"}`);
      if (hit) downed.add(p.id);
    }
    bombers = bombers.filter((u) => !downed.has(u.id));
    escorts = escorts.filter((u) => !downed.has(u.id));

    // --- Bombing, plus strafing escorts inside their 2-tile operational range ---
    let hits = 0;
    for (let i = 0; i < bombers.length; i++) {
      const attempts = nTo.isSea || isRoughTerrain(nTo.terrain) ? 1 : d4();
      let kills = 0;
      for (let a = 0; a < attempts; a++) if (d6() <= 4) kills += 1;
      hits += kills;
      lines.push(`B ×${attempts} ✔${kills}`);
    }
    if (dist <= 2) {
      for (const f of escorts) {
        void f;
        const roll = d6();
        if (roll <= 3) hits += 1;
        lines.push(`Strafe ${roll}/3${roll <= 3 ? " ✔" : " ✘"}`);
      }
    }

    let lost = 0;
    if (hits > 0) {
      const pool = nTo.units.filter((u) => u.owner !== player);
      const dead = orderedCasualties(pool, hits, new Set());
      nTo.units = nTo.units.filter((u) => !dead.has(u.id));
      lost = dead.size;
    }

    // Aircraft that were shot down never come home; the rest are spent.
    nFrom.units = nFrom.units.filter((u) => !downed.has(u.id));
    const spent = new Set([...bombers, ...escorts].map((u) => u.id));
    for (const u of nFrom.units) if (spent.has(u.id)) u.movedThisTurn = true;

    log(
      next,
      `Bombing run on ${nTo.name}${dist <= 2 && escorts.length ? " (escorted, strafing)" : escorts.length ? " (escorted)" : ""} — ${lines.join(", ")} — ${lost} unit(s) destroyed, ${downed.size} aircraft lost.`,
    );
    set({
      game: next,
      selectedUnitIds: [],
      mapAnimation: mapAnimation("attack", selectedTerritoryId, targetId, picked),
    });
  },

  trainSpy: () => {
    const { game } = get();
    const player = game.currentPlayer;
    if (game.economy.spyTrainedThisTurn) return;
    if (!ownsStructure(game, player, "intel_center")) return;
    if (game.treasury[player] < SPY_COST) return;
    const next: GameState = JSON.parse(JSON.stringify(game));
    next.treasury[player] -= SPY_COST;
    next.spies[player] = (next.spies[player] ?? 0) + 1;
    next.economy.spyTrainedThisTurn = true;
    log(next, `${NATIONS[player].name} trained a spy at the Intel Center (${SPY_COST} NPP).`);
    set({ game: next });
  },

  runSpyMission: (action) => {
    const { game, selectedTerritoryId } = get();
    const player = game.currentPlayer;
    if (!selectedTerritoryId) return;
    const target = game.territories[selectedTerritoryId];
    if (!target || target.isSea) return;
    if (target.owner === player || target.owner === "neutral") return;
    if (game.economy.spyMissionThisTurn) return;
    if ((game.spies[player] ?? 0) < 1) return;
    if (!spyCanReach(game, player, target.id)) return;
    const spec = SPY_ACTIONS[action];
    if (game.treasury[player] < spec.cost) return;

    const victim = target.owner as Nation;
    const next: GameState = JSON.parse(JSON.stringify(game));
    const nt = next.territories[target.id];
    next.spies[player] -= 1;
    next.treasury[player] -= spec.cost;
    next.economy.spyMissionThisTurn = true;

    // Counter-intelligence: the defender blocks the mission on a 1-2.
    const counter = d6();
    if (counter <= 2) {
      log(next, `${NATIONS[victim].name} counter-intelligence rolled ${counter} — the spy in ${nt.name} was caught.`);
      set({ game: next });
      return;
    }
    const roll = d6();
    if (roll > spec.target) {
      log(next, `${spec.label} in ${nt.name} failed — rolled ${roll}, needed ${spec.target} or less. The spy is lost.`);
      set({ game: next });
      return;
    }

    switch (action) {
      case "intel_report": {
        const garrison = nt.units.length;
        const builds = (nt.structures ?? []).map((s) => STRUCTURE_STATS[s].label).join(", ") || "none";
        log(next, `Intel on ${nt.name}: ${garrison} unit(s), buildings: ${builds}. ${NATIONS[victim].name} holds ${next.treasury[victim]} NPP.`);
        next.spies[player] += 1; // the spy slips back out
        break;
      }
      case "espionage": {
        const stolen = Math.min(next.treasury[victim], d6() * 2);
        next.treasury[victim] -= stolen;
        next.treasury[player] += stolen;
        log(next, `Espionage in ${nt.name} — stole ${stolen} NPP from ${NATIONS[victim].name}.`);
        break;
      }
      case "sabotage": {
        const list = nt.structures ?? [];
        if (list.length === 0) { log(next, `Sabotage in ${nt.name} found nothing to blow up.`); break; }
        const hit = list[Math.floor(Math.random() * list.length)];
        nt.structures = list.filter((s) => s !== hit);
        if (hit === "factory") nt.hasFactory = false;
        next.vp[player] = (next.vp[player] ?? 0) + STRUCTURE_STATS[hit].vpDestroyed;
        if (hit === "capital") next.capitalLosses[victim] = (next.capitalLosses[victim] ?? 0) + 1;
        log(next, `Sabotage destroyed the ${STRUCTURE_STATS[hit].label} in ${nt.name}.`);
        break;
      }
      case "sapper": {
        const before = (nt.structures ?? []).length;
        nt.structures = (nt.structures ?? []).filter(
          (s) => STRUCTURE_STATS[s].category !== "fortification",
        );
        const removed = before - nt.structures.length;
        log(next, removed
          ? `Sappers levelled ${removed} fortification(s) in ${nt.name}.`
          : `Sappers found no fortifications in ${nt.name}.`);
        break;
      }
      case "commandos": {
        const kills = Math.min(2, nt.units.filter((u) => u.owner === victim).length);
        for (let i = 0; i < kills; i++) {
          const idx = nt.units.findIndex((u) => u.owner === victim);
          if (idx >= 0) {
            const dead = nt.units[idx];
            if (dead.type === "infantry") next.infirmaryPool[victim] = (next.infirmaryPool[victim] ?? 0) + 1;
            nt.units.splice(idx, 1);
          }
        }
        log(next, `Commandos killed ${kills} unit(s) in ${nt.name}.`);
        break;
      }
      case "head_hunter": {
        if ((next.spies[victim] ?? 0) > 0) {
          next.spies[victim] -= 1;
          log(next, `Head hunter eliminated one of ${NATIONS[victim].name}'s spies.`);
        } else {
          log(next, `Head hunter found no enemy spies to eliminate.`);
        }
        next.spies[player] += 1;
        break;
      }
      case "blackout": {
        next.blackout[victim] = 1;
        log(next, `Blackout — ${NATIONS[victim].name}'s income is halved next turn.`);
        break;
      }
      case "provoke_independence": {
        if (nt.units.length > 0) {
          log(next, `${nt.name} is garrisoned — the independence movement fizzled.`);
          break;
        }
        nt.owner = "neutral";
        nt.structures = [];
        nt.hasFactory = false;
        log(next, `${nt.name} declared independence from ${NATIONS[victim].name}.`);
        break;
      }
      case "incite_rebellion": {
        const idx = nt.units.findIndex((u) => u.owner === victim);
        if (idx < 0) { log(next, `No troops in ${nt.name} to turn.`); break; }
        nt.units[idx] = { ...nt.units[idx], owner: player, movedThisTurn: true };
        log(next, `Rebellion in ${nt.name} — 1 ${UNIT_STATS[nt.units[idx].type].label} defected to ${NATIONS[player].name}.`);
        break;
      }
    }
    set({ game: next });
  },


  endTurn: () => {
    const { game, pendingBattle } = get();
    if (pendingBattle || game.gameOver) return;
    const next: GameState = JSON.parse(JSON.stringify(game));
    const ending = next.currentPlayer;
    // Rulebook: provinces pay out; of the buildings only the capital and oil
    // platforms earn, and they stop earning if the capital has fallen.
    const income = incomeFor(next, ending);
    next.treasury[ending] += income;
    log(next, `${NATIONS[ending].name} collected ${income} NPP.`);
    next.economy = freshEconomyFlags();
    // A blackout lasts one collection.
    if ((next.blackout[ending] ?? 0) > 0) next.blackout[ending] -= 1;
    // Ceasefire cards last two of the holder's turns.
    if ((next.ceasefire[ending] ?? 0) > 0) next.ceasefire[ending] -= 1;

    // Contracts run for a set number of the signatory's turns.
    for (const c of next.contracts) {
      if (c.status !== "active" || c.from !== ending) continue;
      if (c.kind === "tribute" && next.treasury[ending] >= 5) {
        next.treasury[ending] -= 5;
        next.treasury[c.to] += 5;
      }
      c.turns -= 1;
      if (c.turns <= 0) {
        c.status = "expired";
        log(next, `The ${CONTRACT_KINDS[c.kind].label} with ${NATIONS[c.to].name} has run out.`);
      }
    }

    const idx = PLAYER_ORDER.indexOf(ending);
    const nextPlayer = PLAYER_ORDER[(idx + 1) % PLAYER_ORDER.length];
    next.currentPlayer = nextPlayer;
    if (idx === PLAYER_ORDER.length - 1) {
      next.turn += 1;
    }
    for (const id in next.territories) {
      const terr = next.territories[id];
      terr.units = terr.units.map((u) => {
        if (u.owner !== nextPlayer) return u;
        const refreshed = { ...u, movedThisTurn: false, movesUsed: 0, towedThisTurn: false, bombardedThisTurn: false };
        if (u.cargo) {
          refreshed.cargo = u.cargo.map((c) =>
            c.owner === nextPlayer ? { ...c, movedThisTurn: false, movesUsed: 0 } : c,
          );
        }
        return refreshed;
      });
      if (terr.owner === nextPlayer) terr.builtInfantryThisTurn = false;
    }
    log(next, `Turn ${next.turn} — ${NATIONS[nextPlayer].name} to move.`);
    set({
      game: next,
      selectedTerritoryId: null,
      selectedUnitIds: [],
      turnSecondsLeft: TURN_SECONDS,
      paused: false,
    });
  },

  // ---------- Towing & airdrops ----------
  loadCargo: (carrierId) => {
    const { game, selectedTerritoryId, selectedUnitIds, pendingBattle } = get();
    if (pendingBattle || !selectedTerritoryId) return;
    const player = game.currentPlayer;
    const terr = game.territories[selectedTerritoryId];
    const carrier = terr?.units.find((u) => u.id === carrierId && u.owner === player);
    if (!terr || !carrier || !GROUND_CARRIER_CAPACITY[carrier.type]) return;
    const riders = terr.units.filter(
      (u) => u.id !== carrierId && selectedUnitIds.includes(u.id) && u.owner === player,
    );
    if (riders.length === 0 || !canCarryUnits(carrier, riders)) return;

    const next: GameState = JSON.parse(JSON.stringify(game));
    const nTerr = next.territories[selectedTerritoryId];
    const nCarrier = nTerr.units.find((u) => u.id === carrierId)!;
    const riderIds = riders.map((r) => r.id);
    const loaded = nTerr.units.filter((u) => riderIds.includes(u.id));
    nTerr.units = nTerr.units.filter((u) => !riderIds.includes(u.id));
    nCarrier.cargo = [
      ...(nCarrier.cargo ?? []),
      ...loaded.map((u) => ({ ...u, towedThisTurn: true })),
    ];
    log(
      next,
      `${UNIT_STATS[carrier.type].label} takes on ${loaded.length} unit${loaded.length > 1 ? "s" : ""} in ${nTerr.name}.`,
    );
    set({ game: next, selectedUnitIds: [carrierId] });
  },

  unloadCargo: (carrierId) => {
    const { game, selectedTerritoryId, pendingBattle } = get();
    if (pendingBattle || !selectedTerritoryId) return;
    const player = game.currentPlayer;
    const terr = game.territories[selectedTerritoryId];
    const carrier = terr?.units.find((u) => u.id === carrierId && u.owner === player);
    if (!terr || terr.isSea || !carrier || !(carrier.cargo ?? []).length) return;

    const next: GameState = JSON.parse(JSON.stringify(game));
    const nTerr = next.territories[selectedTerritoryId];
    const nCarrier = nTerr.units.find((u) => u.id === carrierId)!;
    const dropped = nCarrier.cargo ?? [];
    nCarrier.cargo = [];
    nTerr.units.push(...dropped.map((u) => ({ ...u, movedThisTurn: true })));
    log(next, `${UNIT_STATS[carrier.type].label} unhitches ${dropped.length} unit(s) in ${nTerr.name}.`);
    set({ game: next });
  },

  airdropCargo: (carrierId, targetId) => {
    const { game, selectedTerritoryId, pendingBattle } = get();
    if (pendingBattle || !selectedTerritoryId) return;
    const player = game.currentPlayer;
    const from = game.territories[selectedTerritoryId];
    const target = game.territories[targetId];
    const bomber = from?.units.find(
      (u) => u.id === carrierId && u.owner === player && u.type === "bomber",
    );
    if (!from || !target || target.isSea || !bomber) return;
    if (!(bomber.cargo ?? []).length || bomber.movedThisTurn) return;
    if (target.units.some((u) => u.owner !== player && u.owner !== "neutral")) return;
    const reach = UNIT_STATS.bomber.move;
    if (tileDistance(game, selectedTerritoryId, targetId, reach) > reach) return;

    const next: GameState = JSON.parse(JSON.stringify(game));
    const nFrom = next.territories[selectedTerritoryId];
    const nTo = next.territories[targetId];
    const nBomber = nFrom.units.find((u) => u.id === carrierId)!;
    const payload = nBomber.cargo ?? [];
    nBomber.cargo = [];
    nBomber.movedThisTurn = true;

    // Anti-air over the drop zone: 3-4 downs the bomber; each dropped unit then
    // survives on a 1-2.
    const aa = nTo.units.some((u) => u.type === "aa_gun" && u.owner !== player);
    let survivors = payload;
    if (aa) {
      const flak = d6();
      if (flak === 3 || flak === 4) {
        survivors = payload.filter(() => d6() <= 2);
        nFrom.units = nFrom.units.filter((u) => u.id !== carrierId);
        log(next, `Flak ${flak} — the bomber is shot down; ${survivors.length} of ${payload.length} jumpers land.`);
      } else {
        log(next, `Flak ${flak} — the bomber runs the gauntlet.`);
      }
    }
    nTo.units.push(...survivors.map((u) => ({ ...u, movedThisTurn: true, towedThisTurn: false })));
    if (nTo.owner !== player && survivors.length > 0) {
      captureTerritory(next, nTo, player);
    }
    log(next, `${NATIONS[player].name} airdrops ${survivors.length} unit(s) into ${nTo.name}.`);
    set({
      game: next,
      selectedUnitIds: [],
      mapAnimation: mapAnimation("march", nFrom.id, nTo.id, survivors),
    });
  },

  piracyRaid: (targetUnitId, mode) => {
    const { game, selectedTerritoryId, selectedUnitIds, pendingBattle } = get();
    if (pendingBattle || !selectedTerritoryId) return;
    const player = game.currentPlayer;
    const sea = game.territories[selectedTerritoryId];
    if (!sea?.isSea) return;
    const raider = sea.units.find(
      (u) => selectedUnitIds.includes(u.id) && u.owner === player && u.type === "transport",
    );
    const victim = sea.units.find((u) => u.id === targetUnitId);
    if (!raider || !victim || victim.owner === player || victim.type !== "transport") return;
    if (mode === "capture" && !(raider.cargo ?? []).some((c) => c.type === "infantry")) return;

    const next: GameState = JSON.parse(JSON.stringify(game));
    const nSea = next.territories[selectedTerritoryId];
    const nRaider = nSea.units.find((u) => u.id === raider.id)!;
    const nVictim = nSea.units.find((u) => u.id === victim.id)!;
    const roll = d6();
    const success = roll <= 3;

    if (mode === "dump") {
      if (success) {
        const lost = (nVictim.cargo ?? []).length;
        nVictim.cargo = [];
        log(next, `Piracy ${roll} — ${lost} embarked unit(s) are dumped into the sea.`);
      } else {
        nRaider.owner = nVictim.owner;
        log(next, `Piracy ${roll} failed — the raiding transport is captured.`);
      }
    } else {
      if (success) {
        nVictim.owner = player;
        nVictim.movedThisTurn = true;
        for (const c of nVictim.cargo ?? []) c.owner = player;
        log(next, `Boarding ${roll} — the enemy transport and its cargo are seized.`);
      } else {
        const lost = (nRaider.cargo ?? []).length;
        nRaider.cargo = [];
        log(next, `Boarding ${roll} failed — our own ${lost} embarked unit(s) go overboard.`);
      }
    }
    nRaider.movedThisTurn = true;
    set({ game: next, selectedUnitIds: [] });
  },

  saveGameNow: () => {
    if (!persistLocally()) return;
    const { game, turnSecondsLeft, paused } = get();
    saveCampaign(game, turnSecondsLeft, paused);
  },

  reset: () => {
    clearSavedCampaign();
    set({
      game: createInitialState(),
      selectedTerritoryId: null,
      selectedUnitIds: [],
      pendingBattle: null,
      moveDialog: null,
      mapAnimation: null,
      turnSecondsLeft: TURN_SECONDS,
      paused: false,
    });
  },

  runAITurn: async () => {
    set({ aiTurnInProgress: true });
    try {
      await aiPlayTurn(get, set);
    } catch (err) {
      // Never let a bad decision stall the game: log it and end the turn.
      console.error("AI turn failed", err);
    } finally {
      const { pendingBattle, closeBattle, retreatBattle, rollBattleRound } = get();
      if (pendingBattle) {
        for (let i = 0; i < 20 && get().pendingBattle?.status === "ongoing"; i++) {
          rollBattleRound();
          if (get().pendingBattle?.status === "ongoing") retreatBattle();
        }
        closeBattle();
      }
      useGame.setState({ moveDialog: null, selectedUnitIds: [] });
      get().endTurn();
      set({ aiTurnInProgress: false });
    }
  },
}));

// ---------------------------------------------------------------------------
// Autosave — mirror the campaign into localStorage so a refresh never loses
// the war. Saves shortly after any change, at least once every 5 seconds
// while the clock ticks, and never mid-AI-turn or mid-battle.
// ---------------------------------------------------------------------------

let saveIdleTimer: ReturnType<typeof setTimeout> | null = null;
let saveMaxTimer: ReturnType<typeof setTimeout> | null = null;

function flushSave() {
  if (saveIdleTimer) { clearTimeout(saveIdleTimer); saveIdleTimer = null; }
  if (saveMaxTimer) { clearTimeout(saveMaxTimer); saveMaxTimer = null; }
  // A guest in someone else's online room never overwrites their own campaign.
  if (!persistLocally()) return;
  const { game, turnSecondsLeft, paused } = useGame.getState();
  if (game.gameOver) {
    // The war is decided — there is nothing left to resume.
    clearSavedCampaign();
    return;
  }
  saveCampaign(game, turnSecondsLeft, paused);
}

useGame.subscribe((state) => {
  if (!persistLocally()) return;
  if (state.aiTurnInProgress || state.pendingBattle || state.moveDialog) return;
  if (!saveIdleTimer) {
    saveIdleTimer = setTimeout(flushSave, 1200);
    saveMaxTimer = setTimeout(flushSave, 5000);
  }
});

export function getReachable(): Set<string> {
  const { game, selectedTerritoryId, selectedUnitIds, pendingBattle } = useGame.getState();
  if (pendingBattle) return new Set();
  if (!selectedTerritoryId || selectedUnitIds.length === 0) return new Set();
  const from = game.territories[selectedTerritoryId];
  if (!from) return new Set();
  const pool: Unit[] = [...from.units];
  if (from.isSea) {
    for (const u of from.units) {
      if (u.cargo && u.cargo.length) pool.push(...u.cargo);
    }
  }
  const moving = pool.filter((u) => selectedUnitIds.includes(u.id));
  if (moving.length === 0) return new Set();
  if (moving.some((u) => u.movedThisTurn || u.owner !== game.currentPlayer)) return new Set();
  return legalMoveTargets(game, from.id, moving);
}

// ---------------------------------------------------------------------------
// The AI's turn. Every action goes through the same store actions a human
// uses, so all rules (terrain, canals, multiplayer guards) still apply.
// ---------------------------------------------------------------------------

const AI_OFFENSE: UnitType[] = ["infantry", "tank", "infantry", "artillery", "tank"];
const AI_DEFENSE: UnitType[] = ["infantry", "infantry", "artillery"];

async function aiPlayTurn(get: () => Store, _set: unknown): Promise<void> {
  void _set;
  await sleep(300);
  const player = get().game.currentPlayer as Nation;
  const owned = () =>
    Object.values(get().game.territories).filter((t) => t.owner === player && !t.isSea);

  // ---------- Construction: fortify the homeland when there is spare cash ----------
  {
    const priority: StructureType[] = ["bunker", "harbor", "airfield", "oil_platform", "warehouse", "scrap_yard"];
    for (const t of owned()) {
      const g = get().game;
      const tt = g.territories[t.id];
      if (!tt.hasFactory || g.treasury[player] < 60) continue;
      const pick = priority.find(
        (s) =>
          !hasStructure(tt, s) &&
          g.treasury[player] >= STRUCTURE_STATS[s].cost + 35 &&
          (!STRUCTURE_STATS[s].coastal || tt.adjacent.some((nid) => g.territories[nid]?.isSea)),
      );
      if (!pick) continue;
      get().selectTerritory(t.id);
      get().buildStructure(pick);
      await sleep(40);
    }
  }

  // ---------- Purchasing: spend the treasury where it is needed most ----------
  {
    const g0 = get().game;
    const factories = owned()
      .filter((t) => t.hasFactory)
      .map((t) => {
        const threat = aiThreat(g0, t, player);
        const def = aiDefensePower(t.units.filter((u) => u.owner === player), t) * t.units.length;
        return { t, threat, gap: threat - def };
      })
      .sort((a, b) => b.gap - a.gap);
    let plan = 0;
    let guard = 0;
    while (factories.length && guard++ < 40) {
      const g = get().game;
      if (g.treasury[player] < UNIT_STATS.infantry.cost) break;
      // Shore up the most endangered factory first, then build to attack.
      const f = factories[0].gap > 0 ? factories[0] : factories[plan % factories.length];
      const list = f.gap > 0 ? AI_DEFENSE : AI_OFFENSE;
      const want = list[plan % list.length];
      plan++;
      get().selectTerritory(f.t.id);
      const before = get().game.treasury[player];
      get().buyUnit(want);
      if (get().game.treasury[player] === before && want !== "infantry") get().buyUnit("infantry");
      if (get().game.treasury[player] === before) {
        factories.splice(factories.indexOf(f), 1); // this factory can't build anything affordable
        continue;
      }
      if (f.gap > 0) f.gap -= UNIT_STATS.infantry.defense / 6 * 2;
      await sleep(30);
    }
    // Frontline provinces without a factory may each raise one infantry.
    for (const t of owned()) {
      const g = get().game;
      if (g.treasury[player] < UNIT_STATS.infantry.cost) break;
      if (t.hasFactory || t.builtInfantryThisTurn || aiThreat(g, t, player) === 0) continue;
      get().selectTerritory(t.id);
      get().buyUnit("infantry");
    }
  }
  await sleep(200);

  // ---------- Attacks and expansion ----------
  const failed = new Set<string>();
  // Nations we have signed a cease-fire or alliance with are left alone.
  const partners = new Set<Nation>(
    get()
      .game.contracts.filter(
        (c) =>
          c.status === "active" &&
          (c.kind === "ceasefire" || c.kind === "alliance") &&
          (c.from === player || c.to === player),
      )
      .map((c) => (c.from === player ? c.to : c.from)),
  );
  for (let step = 0; step < 60; step++) {
    const g = get().game;
    let best: {
      from: string;
      to: string;
      ids: string[];
      score: number;
      /** Units joining from other territories (a joint attack). */
      extras?: Array<{ from: string; units: Unit[] }>;
    } | null = null;
    // What each territory could contribute to an attack on each enemy-held target.
    const offers = new Map<string, Array<{ from: string; units: Unit[] }>>();
    for (const src of owned()) {
      const movable = src.units.filter(
        (u) => u.owner === player && !u.movedThisTurn && movesLeft(u) > 0 && isLand(u.type),
      );
      if (movable.length === 0) continue;
      const keep = aiGarrison(g, src, player, movable);
      const avail = movable.filter((u) => !keep.has(u.id));
      // A stack held back by a big army next door may still send out a
      // detachment (up to 40% of it) against a clearly weaker neighbour.
      const detachMax = Math.max(2, Math.floor(movable.length * 0.4));
      const pool = avail.length ? avail : movable;
      // Where can each unit go?
      const reach = new Map<string, Unit[]>();
      for (const u of pool) {
        for (const id of legalMoveTargets(g, src.id, [u])) {
          const t = g.territories[id];
          if (!t || t.isSea || t.owner === player) continue;
          if (failed.has(`${src.id}>${id}`)) continue;
          if (t.owner !== "neutral" && partners.has(t.owner)) continue; // honour our treaties
          (reach.get(id) ?? reach.set(id, []).get(id)!).push(u);
        }
      }
      for (const [id, units] of reach) {
        const t = g.territories[id];
        const defenders = t.units.filter((u) => u.owner !== player);
        const value = aiValue(t, player);
        let ids: string[];
        let score: number;
        const spare = avail.length > 0;
        if (defenders.length === 0) {
          if (!spare && movable.length < 3) continue;
          // Empty ground: claim it with the cheapest single unit that can reach.
          const cheapest = [...units].sort((a, b) => UNIT_STATS[a.type].cost - UNIT_STATS[b.type].cost)[0];
          ids = [cheapest.id];
          score = value + 5;
        } else {
          // Only units that can make the trip together (the slowest sets the range).
          let group = units.filter((u) => legalMoveTargets(g, src.id, [u]).has(id));
          if (!legalMoveTargets(g, src.id, group).has(id)) continue;
          let needed = value >= 20 ? 1.15 : 1.4;
          if (!spare) {
            // Detachment: the strongest attackers, just enough for 2:1 odds.
            needed = 2;
            const strongest = [...group].sort((a, b) => UNIT_STATS[b.type].attack - UNIT_STATS[a.type].attack);
            const picked: Unit[] = [];
            for (const u of strongest) {
              if (picked.length >= detachMax) break;
              picked.push(u);
              if (aiOdds(picked, defenders, t) >= needed * 1.15) break;
            }
            group = picked;
          }
          if (group.length) (offers.get(id) ?? offers.set(id, []).get(id)!).push({ from: src.id, units: group });
          const odds = aiOdds(group, defenders, t);
          if (odds < needed) continue;
          ids = group.map((u) => u.id);
          score = value * Math.min(odds, 3) - defenders.length - (spare ? 0 : 4);
        }
        if (!best || score > best.score) best = { from: src.id, to: id, ids, score };
      }
    }
    // Joint attacks: pool the spare forces of several territories against a
    // target none of them could take alone (or could take more safely together).
    for (const [id, list] of offers) {
      if (list.length < 2) continue;
      const t = g.territories[id];
      const defenders = t.units.filter((u) => u.owner !== player);
      const value = aiValue(t, player);
      const needed = value >= 20 ? 1.15 : 1.4;
      const byPower = [...list].sort((a, b) => aiAttackPower(b.units) - aiAttackPower(a.units));
      const used: typeof list = [];
      const all: Unit[] = [];
      for (const offer of byPower) {
        used.push(offer);
        all.push(...offer.units);
        if (aiOdds(all, defenders, t) >= needed * 1.3) break;
      }
      if (used.length < 2) continue;
      const odds = aiOdds(all, defenders, t);
      if (odds < needed) continue;
      // Lead from the territory whose whole group can make the trip together.
      const lead = used.find((o) => legalMoveTargets(g, o.from, o.units).has(id));
      if (!lead) continue;
      const score = value * Math.min(odds, 3) - defenders.length - 2 * used.length;
      if (!best || score > best.score) {
        best = {
          from: lead.from,
          to: id,
          ids: lead.units.map((u) => u.id),
          score,
          extras: used.filter((o) => o !== lead),
        };
      }
    }
    if (!best) break;

    get().selectTerritory(best.from);
    useGame.setState({ selectedUnitIds: best.ids });
    get().openMoveDialog(best.to);
    if (!get().moveDialog) {
      failed.add(`${best.from}>${best.to}`);
      continue;
    }
    for (const extra of best.extras ?? []) {
      const counts: Partial<Record<UnitType, number>> = {};
      for (const u of extra.units) counts[u.type] = (counts[u.type] ?? 0) + 1;
      for (const [type, n] of Object.entries(counts) as Array<[UnitType, number]>) {
        get().setExtraCount(extra.from, type, n);
      }
    }
    get().confirmMove();
    await sleep(220);
    await aiFightBattle(get);
  }

  // ---------- Reinforcement: march idle units toward the front ----------
  {
    const g = get().game;
    const mine = owned();
    const isFront = (t: Terr) =>
      t.adjacent.some((nid) => {
        const n = g.territories[nid];
        return n && !n.isSea && n.owner !== player;
      });
    // Distance (through own land) from every province to the nearest front.
    const dist = new Map<string, number>();
    const queue: string[] = [];
    for (const t of mine) if (isFront(t)) { dist.set(t.id, 0); queue.push(t.id); }
    while (queue.length) {
      const id = queue.shift()!;
      for (const nid of g.territories[id].adjacent) {
        const n = g.territories[nid];
        if (!n || n.isSea || n.owner !== player || dist.has(nid)) continue;
        dist.set(nid, dist.get(id)! + 1);
        queue.push(nid);
      }
    }
    // Front provinces that most need help get it first.
    const needs = (t: Terr) => aiThreat(g, t, player) - aiDefensePower(t.units.filter((u) => u.owner === player), t) * t.units.length;
    for (const src of mine) {
      const gg = get().game;
      const s = gg.territories[src.id];
      const movable = s.units.filter((u) => u.owner === player && !u.movedThisTurn && movesLeft(u) > 0 && isLand(u.type));
      if (!movable.length) continue;
      const keep = aiGarrison(gg, s, player, movable);
      const spare = movable.filter((u) => !keep.has(u.id));
      if (!spare.length) continue;
      const here = dist.get(s.id) ?? 99;
      const options = s.adjacent
        .map((id) => gg.territories[id])
        .filter((n) => n && !n.isSea && n.owner === player && (dist.get(n.id) ?? 99) < here);
      if (!options.length) continue;
      options.sort((a, b) => needs(b) - needs(a));
      get().selectTerritory(s.id);
      useGame.setState({ selectedUnitIds: spare.map((u) => u.id) });
      get().openMoveDialog(options[0].id);
      if (get().moveDialog) {
        get().confirmMove();
        await sleep(120);
      }
    }
  }
  await sleep(250);
}

/** Roll out a battle the AI started, withdrawing if it turns against it. */
async function aiFightBattle(get: () => Store): Promise<void> {
  for (let round = 0; round < 25 && get().pendingBattle?.status === "ongoing"; round++) {
    get().rollBattleRound();
    await sleep(350);
    const { pendingBattle, game } = get();
    if (!pendingBattle || pendingBattle.status !== "ongoing") break;
    const from = game.territories[pendingBattle.attackerId];
    const to = game.territories[pendingBattle.defenderId];
    const attackers = from.units.filter((u) => pendingBattle.attackerUnitIds.includes(u.id));
    const defenders = to.units.filter((u) => u.owner !== game.currentPlayer);
    if (aiOdds(attackers, defenders, to) < 0.75) {
      get().retreatBattle();
      await sleep(250);
    }
  }
  if (get().pendingBattle) {
    get().closeBattle();
    await sleep(200);
  }
}
