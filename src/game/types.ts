export type Faction = "usa" | "canada" | "mexico" | "brazil" | "italy" | "germany" | "china" | "africa" | "neutral";

export type Nation = Exclude<Faction, "neutral">;

export const PLAYER_ORDER: Nation[] = ["usa", "canada", "mexico", "brazil", "italy", "germany", "china", "africa"];

export const AI_NATIONS: Nation[] = ["canada", "mexico", "brazil", "germany", "china", "africa"];

export interface NationInfo {
  name: string;
  color: string;
  fg: string;
  flag: string;
}

export const NATIONS: Record<Nation, NationInfo> = {
  usa: { name: "United States", color: "#1f3c88", fg: "#ffffff", flag: "🇺🇸" },
  canada: { name: "Canada", color: "#b8232f", fg: "#ffffff", flag: "🇨🇦" },
  mexico: { name: "Mexico", color: "#0f7b3e", fg: "#ffffff", flag: "🇲🇽" },
  brazil: { name: "Brazil", color: "#d4a017", fg: "#1a1a1a", flag: "🇧🇷" },
  italy: { name: "Italy", color: "#006600", fg: "#ffffff", flag: "🇮🇹" },
  germany: { name: "Germany", color: "#4a4a4a", fg: "#ffffff", flag: "🇩🇪" },
  china: { name: "China", color: "#d42426", fg: "#ffffff", flag: "🇨🇳" },
  africa: { name: "Africa", color: "#8B4513", fg: "#ffffff", flag: "🌍" },
};

export function factionColor(f: Faction): string {
  return f === "neutral" ? "var(--neutral-land)" : NATIONS[f].color;
}
export function factionForeground(f: Faction): string {
  return f === "neutral" ? "var(--parchment-ink)" : NATIONS[f].fg;
}
export function factionName(f: Faction): string {
  return f === "neutral" ? "Unclaimed" : NATIONS[f].name;
}

export type UnitType =
  // Land
  | "infantry" | "halftrack" | "artillery" | "howitzer" | "tank" | "amph_tank"
  | "heavy_tank" | "cargo_truck" | "dozer" | "aa_gun" | "railgun"
  // Air
  | "fighter" | "bomber" | "zeppelin" | "spy_plane"
  // Naval
  | "transport" | "higgins" | "submarine" | "destroyer" | "cruiser"
  | "light_carrier" | "battleship" | "fleet_carrier";

export interface UnitStats {
  attack: number;
  defense: number;
  move: number;
  cost: number;
  label: string;
  short: string;
  /** Bombardment/operational range in tiles (0 = none). */
  range: number;
  /** Number on the hit dice this unit counts as (targeting priority). */
  hitNumber: number;
  /** Order of loss — lower dies first when the defender can't choose. */
  orderOfLoss: number;
  /** Anti-air strength (0 = no AA ability). */
  antiAir: number;
  /** Bombard strength (0 = cannot bombard). */
  bombard: number;
  /** Transport seats this unit occupies (0 = not transportable). */
  seats: number;
  /** Rolls a D4 after a successful hit to determine kills (bomber/howitzer/battleship). */
  d4MultiKill: boolean;
}

export const UNIT_STATS: Record<UnitType, UnitStats> = {
  // ---------- Land ----------
  infantry:    { attack: 1, defense: 2, move: 1, cost: 5,  label: "Infantry",     short: "I",   range: 0, hitNumber: 1, orderOfLoss: 1, antiAir: 0, bombard: 0, seats: 1, d4MultiKill: false },
  halftrack:   { attack: 2, defense: 1, move: 2, cost: 8,  label: "Halftrack",    short: "Ht",  range: 0, hitNumber: 2, orderOfLoss: 1, antiAir: 0, bombard: 0, seats: 2, d4MultiKill: false },
  artillery:   { attack: 1, defense: 2, move: 1, cost: 9,  label: "Artillery",    short: "A",   range: 1, hitNumber: 2, orderOfLoss: 2, antiAir: 0, bombard: 3, seats: 2, d4MultiKill: false },
  howitzer:    { attack: 0, defense: 1, move: 1, cost: 20, label: "Howitzer",     short: "Hw",  range: 1, hitNumber: 3, orderOfLoss: 3, antiAir: 0, bombard: 4, seats: 3, d4MultiKill: true },
  tank:        { attack: 3, defense: 3, move: 2, cost: 10, label: "Tank",         short: "T",   range: 0, hitNumber: 3, orderOfLoss: 3, antiAir: 0, bombard: 0, seats: 2, d4MultiKill: false },
  amph_tank:   { attack: 3, defense: 2, move: 2, cost: 12, label: "Amph Tank",    short: "At",  range: 0, hitNumber: 3, orderOfLoss: 3, antiAir: 0, bombard: 0, seats: 2, d4MultiKill: false },
  heavy_tank:  { attack: 4, defense: 3, move: 1, cost: 18, label: "Heavy Tank",   short: "Hv",  range: 0, hitNumber: 4, orderOfLoss: 4, antiAir: 0, bombard: 0, seats: 3, d4MultiKill: false },
  cargo_truck: { attack: 0, defense: 0, move: 2, cost: 6,  label: "Cargo Truck",  short: "Ct",  range: 0, hitNumber: 5, orderOfLoss: 5, antiAir: 0, bombard: 0, seats: 2, d4MultiKill: false },
  dozer:       { attack: 0, defense: 0, move: 2, cost: 25, label: "Dozer",        short: "Dz",  range: 0, hitNumber: 4, orderOfLoss: 4, antiAir: 0, bombard: 0, seats: 2, d4MultiKill: false },
  aa_gun:      { attack: 0, defense: 0, move: 1, cost: 12, label: "Anti-Air",     short: "AA",  range: 0, hitNumber: 4, orderOfLoss: 4, antiAir: 3, bombard: 0, seats: 2, d4MultiKill: false },
  railgun:     { attack: 0, defense: 0, move: 1, cost: 30, label: "Rail Gun",     short: "Rg",  range: 2, hitNumber: 5, orderOfLoss: 5, antiAir: 0, bombard: 5, seats: 4, d4MultiKill: false },
  // ---------- Air ----------
  fighter:     { attack: 3, defense: 3, move: 4, cost: 14, label: "Fighter",      short: "F",   range: 4, hitNumber: 2, orderOfLoss: 3, antiAir: 0, bombard: 0, seats: 0, d4MultiKill: false },
  bomber:      { attack: 4, defense: 1, move: 6, cost: 25, label: "Bomber",       short: "B",   range: 6, hitNumber: 3, orderOfLoss: 4, antiAir: 0, bombard: 0, seats: 0, d4MultiKill: true },
  zeppelin:    { attack: 0, defense: 0, move: 2, cost: 12, label: "Zeppelin",     short: "Z",   range: 1, hitNumber: 6, orderOfLoss: 6, antiAir: 0, bombard: 0, seats: 0, d4MultiKill: false },
  spy_plane:   { attack: 0, defense: 0, move: 4, cost: 10, label: "Spy Plane",    short: "Sp",  range: 4, hitNumber: 6, orderOfLoss: 3, antiAir: 0, bombard: 0, seats: 0, d4MultiKill: false },
  // ---------- Naval ----------
  transport:      { attack: 0, defense: 0, move: 3, cost: 6,  label: "Transport",     short: "Tr", range: 0, hitNumber: 6, orderOfLoss: 5, antiAir: 0, bombard: 0, seats: 0, d4MultiKill: false },
  higgins:        { attack: 0, defense: 0, move: 1, cost: 2,  label: "Higgins Boat",  short: "Hg", range: 0, hitNumber: 1, orderOfLoss: 1, antiAir: 0, bombard: 0, seats: 0, d4MultiKill: false },
  submarine:      { attack: 2, defense: 2, move: 3, cost: 10, label: "Submarine",     short: "Sb", range: 1, hitNumber: 2, orderOfLoss: 2, antiAir: 2, bombard: 2, seats: 0, d4MultiKill: false },
  destroyer:      { attack: 2, defense: 2, move: 3, cost: 10, label: "Destroyer",     short: "D",  range: 1, hitNumber: 2, orderOfLoss: 2, antiAir: 2, bombard: 2, seats: 0, d4MultiKill: false },
  cruiser:        { attack: 3, defense: 3, move: 3, cost: 15, label: "Cruiser",       short: "C",  range: 1, hitNumber: 3, orderOfLoss: 3, antiAir: 3, bombard: 3, seats: 0, d4MultiKill: false },
  light_carrier:  { attack: 0, defense: 1, move: 3, cost: 10, label: "Light Carrier", short: "Lc", range: 0, hitNumber: 3, orderOfLoss: 3, antiAir: 1, bombard: 0, seats: 0, d4MultiKill: false },
  battleship:     { attack: 4, defense: 4, move: 3, cost: 25, label: "Battleship",    short: "Bb", range: 1, hitNumber: 4, orderOfLoss: 4, antiAir: 4, bombard: 4, seats: 0, d4MultiKill: true },
  fleet_carrier:  { attack: 0, defense: 1, move: 3, cost: 20, label: "Fleet Carrier", short: "Fc", range: 0, hitNumber: 4, orderOfLoss: 5, antiAir: 2, bombard: 0, seats: 0, d4MultiKill: false },
};

export const NAVAL_UNITS: ReadonlySet<UnitType> = new Set([
  "transport", "higgins", "submarine", "destroyer", "cruiser",
  "light_carrier", "battleship", "fleet_carrier",
]);
export const AIR_UNITS: ReadonlySet<UnitType> = new Set(["fighter", "bomber", "zeppelin", "spy_plane"]);
export const TRANSPORT_CAPACITY = 6;
export const HIGGINS_CAPACITY = 2;

export function isNaval(t: UnitType): boolean { return NAVAL_UNITS.has(t); }
export function isAir(t: UnitType): boolean { return AIR_UNITS.has(t); }
export function isLand(t: UnitType): boolean { return !NAVAL_UNITS.has(t) && !AIR_UNITS.has(t); }

export const FACTORY_COST = 15;

// ---------------------------------------------------------------------------
// Structures (Phase 2)
// ---------------------------------------------------------------------------

export type StructureCategory = "flag" | "support" | "fortification";

export type StructureType =
  // Flag buildings
  | "factory" | "airfield" | "harbor" | "intel_center" | "capital"
  // Support buildings
  | "warehouse" | "infirmary" | "stock_market" | "scrap_yard" | "oil_platform"
  // Fortifications
  | "fob" | "island_outpost" | "hedgehogs" | "bunker" | "sea_mines"
  | "railroad" | "coastal_gun" | "runway";

export interface StructureStats {
  label: string;
  icon: string;
  category: StructureCategory;
  cost: number;
  /** Extra NPP collected each turn while held. Rulebook: capital & oil only. */
  income: number;
  /** Added to the defense value of every unit defending here. */
  defenseBonus: number;
  /** Bombard strength this structure contributes (coastal gun). */
  bombard: number;
  /** Must border a sea hex. */
  coastal: boolean;
  /** End-game VP for holding this structure. */
  vpOwned: number;
  /** VP awarded to whoever destroys/captures this structure. */
  vpDestroyed: number;
  blurb: string;
}

export const STRUCTURE_STATS: Record<StructureType, StructureStats> = {
  // ---------- Flag buildings ----------
  factory:       { label: "Factory",       icon: "⚙", category: "flag", cost: 15, income: 0, defenseBonus: 0, bombard: 0, coastal: false, vpOwned: 2, vpDestroyed: 3, blurb: "Recruit land units without the conscription limit." },
  airfield:      { label: "Airfield",      icon: "✈", category: "flag", cost: 15, income: 0, defenseBonus: 0, bombard: 0, coastal: false, vpOwned: 1, vpDestroyed: 2, blurb: "Required to purchase air units here." },
  harbor:        { label: "Harbor",        icon: "⚓", category: "flag", cost: 15, income: 0, defenseBonus: 0, bombard: 0, coastal: true,  vpOwned: 1, vpDestroyed: 2, blurb: "Required to purchase naval units here." },
  intel_center:  { label: "Intel Center",  icon: "🕵", category: "flag", cost: 20, income: 0, defenseBonus: 0, bombard: 0, coastal: false, vpOwned: 3, vpDestroyed: 5, blurb: "Trains spies and produces intel reports." },
  capital:       { label: "Capital",       icon: "★", category: "flag", cost: 30, income: 5, defenseBonus: 1, bombard: 0, coastal: false, vpOwned: 20, vpDestroyed: 15, blurb: "Seat of government. Only the capital and oil platforms pay income." },
  // ---------- Support buildings ----------
  warehouse:     { label: "Warehouse",     icon: "📦", category: "support", cost: 10, income: 0, defenseBonus: 0, bombard: 0, coastal: false, vpOwned: 0, vpDestroyed: 0, blurb: "Draw a supply card each turn (D6 1-2 succeeds)." },
  infirmary:     { label: "Infirmary",     icon: "✚", category: "support", cost: 12, income: 0, defenseBonus: 1, bombard: 0, coastal: false, vpOwned: 0, vpDestroyed: 0, blurb: "Recycles losses — 1 free infantry for every 3 infantry lost." },
  stock_market:  { label: "Stock Market",  icon: "📈", category: "support", cost: 25, income: 0, defenseBonus: 0, bombard: 0, coastal: false, vpOwned: 0, vpDestroyed: 0, blurb: "Bonds, market rolls and day trading." },
  scrap_yard:    { label: "Scrap Yard",    icon: "♻", category: "support", cost: 10, income: 0, defenseBonus: 0, bombard: 0, coastal: false, vpOwned: 0, vpDestroyed: 0, blurb: "Scrap non-infantry units for half cost (5 per turn)." },
  oil_platform:  { label: "Oil Platform",  icon: "🛢", category: "support", cost: 9,  income: 4, defenseBonus: 0, bombard: 0, coastal: true,  vpOwned: 0, vpDestroyed: 0, blurb: "Coastal derrick — 4 NPP per turn." },
  // ---------- Fortifications ----------
  fob:           { label: "F.O.B.",        icon: "⛺", category: "fortification", cost: 8,  income: 0, defenseBonus: 1, bombard: 0, coastal: false, vpOwned: 0, vpDestroyed: 0, blurb: "Forward base — allows infantry in mountains and jungle; upgrades to a Factory (not on rough ground)." },
  island_outpost:{ label: "Island Outpost",icon: "🏝", category: "fortification", cost: 8,  income: 0, defenseBonus: 1, bombard: 0, coastal: true,  vpOwned: 0, vpDestroyed: 0, blurb: "Garrisons a remote island; upgrades to a Harbor for 12 NPP." },
  hedgehogs:     { label: "Hedgehogs",     icon: "✖", category: "fortification", cost: 5,  income: 0, defenseBonus: 1, bombard: 0, coastal: false, vpOwned: 0, vpDestroyed: 0, blurb: "Beach obstacles — costs an extra movement point to enter; a dozer can clear them." },
  bunker:        { label: "Bunker",        icon: "🛡", category: "fortification", cost: 12, income: 0, defenseBonus: 2, bombard: 0, coastal: false, vpOwned: 0, vpDestroyed: 0, blurb: "Hardened works — +2 defense while 3 infantry garrison the tile." },
  sea_mines:     { label: "Sea Mines",     icon: "💣", category: "fortification", cost: 10, income: 0, defenseBonus: 1, bombard: 0, coastal: true,  vpOwned: 0, vpDestroyed: 0, blurb: "Mines the approaches to this coast." },
  railroad:      { label: "Railroad",      icon: "🚂", category: "fortification", cost: 10, income: 0, defenseBonus: 0, bombard: 0, coastal: false, vpOwned: 0, vpDestroyed: 0, blurb: "Rail network — rail guns move only along connected railroads (max 3 active)." },
  coastal_gun:   { label: "Coastal Gun",   icon: "🎯", category: "fortification", cost: 14, income: 0, defenseBonus: 1, bombard: 3, coastal: true,  vpOwned: 0, vpDestroyed: 0, blurb: "Bombards attackers at strength 3." },
  runway:        { label: "Runway",        icon: "🛬", category: "fortification", cost: 8,  income: 0, defenseBonus: 0, bombard: 0, coastal: false, vpOwned: 0, vpDestroyed: 0, blurb: "Rough strip — holds 4 aircraft; upgrades to an Airfield for 25 NPP." },
};

export const STRUCTURE_ORDER: StructureType[] = [
  "factory", "airfield", "harbor", "intel_center", "capital",
  "warehouse", "infirmary", "stock_market", "scrap_yard", "oil_platform",
  "fob", "island_outpost", "hedgehogs", "bunker", "sea_mines",
  "railroad", "coastal_gun", "runway",
];

export interface Unit {
  id: string;
  type: UnitType;
  owner: Faction;
  movedThisTurn: boolean;
  /** Movement points already spent this turn — a unit may move again while
   *  movesUsed < UNIT_STATS[type].move (e.g. tanks always get 2 hexes). */
  movesUsed?: number;
  /** Only set on transports — units currently embarked. */
  cargo?: Unit[];
  /** Towed by a halftrack/cargo truck this turn — guns cannot bombard after a tow. */
  towedThisTurn?: boolean;
  /** Joined an attack from a neighbouring territory; it returns there on a withdrawal. */
  stagedFrom?: string;
  /** Already fired a stand-off bombardment this turn. */
  bombardedThisTurn?: boolean;
  /** This bomber is the declared carrier of an assembled A-bomb. */
  abomb?: boolean;
}

/** ---------------- Warehouse supply cards & the A-bomb ---------------- */

export type WarehouseCard =
  | { kind: "unit"; unit: UnitType; weight: number }
  | { kind: "ceasefire"; scope: "personal" | "world"; weight: number }
  | { kind: "blueprint"; weight: number };

/**
 * Rulebook warehouse draws. Every nation rolls the first tier; each warehouse
 * owned unlocks one more tier. Each tier is its own D6 and succeeds on 1-2.
 */
export const WAREHOUSE_TIERS: WarehouseCard[][] = [
  [
    { kind: "unit", unit: "infantry", weight: 10 },
    { kind: "unit", unit: "artillery", weight: 7 },
    { kind: "unit", unit: "transport", weight: 5 },
    { kind: "ceasefire", scope: "personal", weight: 5 },
  ],
  [
    { kind: "unit", unit: "tank", weight: 10 },
    { kind: "unit", unit: "aa_gun", weight: 7 },
    { kind: "unit", unit: "submarine", weight: 5 },
    { kind: "unit", unit: "destroyer", weight: 5 },
  ],
  [
    { kind: "unit", unit: "fighter", weight: 10 },
    { kind: "unit", unit: "bomber", weight: 7 },
    { kind: "unit", unit: "cruiser", weight: 5 },
    { kind: "unit", unit: "fleet_carrier", weight: 5 },
    { kind: "ceasefire", scope: "world", weight: 5 },
  ],
  [
    { kind: "unit", unit: "battleship", weight: 5 },
    { kind: "unit", unit: "railgun", weight: 5 },
    { kind: "blueprint", weight: 6 },
  ],
];

/** Three blueprints assemble one A-bomb. */
export const ABOMB_BLUEPRINTS_REQUIRED = 3;
/** A bomber may fly the bomb up to six tiles. */
export const ABOMB_RANGE = 6;


/** ---------------- Land & air carrying (rulebook: towing, airdrops) ---------------- */

/** Seats on land/air carriers that can pick cargo up on their own tile. */
export const GROUND_CARRIER_CAPACITY: Partial<Record<UnitType, number>> = {
  halftrack: 3,
  cargo_truck: 6,
  bomber: 3,
};

/** Which unit types each ground/air carrier may carry. */
export const GROUND_CARRIER_CARGO: Partial<Record<UnitType, UnitType[]>> = {
  halftrack: ["infantry", "artillery", "aa_gun"],
  cargo_truck: ["infantry", "howitzer"],
  bomber: ["infantry", "artillery", "aa_gun"],
};

/** ---------------- Terrain (rulebook: deserts, mountains, jungle, canals) ---------------- */

export type Terrain = "desert" | "mountain" | "jungle";
export type CanalId = "suez" | "panama";

export const TERRAIN_INFO: Record<Terrain, { label: string; icon: string; blurb: string }> = {
  desert: {
    label: "Desert",
    icon: "🏜️",
    blurb:
      "Vehicles (Halftrack, Tank, Amph. Tank, Cargo Truck) may pass through but never stop here.",
  },
  mountain: {
    label: "Mountains",
    icon: "⛰️",
    blurb:
      "Only Infantry, Anti-Air and Zeppelins may enter. Infantry needs an F.O.B. to build here. Bombardment rolls D6 only — no D4 multi-kills.",
  },
  jungle: {
    label: "Jungle",
    icon: "🌴",
    blurb:
      "Only Infantry, Anti-Air and Zeppelins may enter. Infantry needs an F.O.B. to build here. Bombardment rolls D6 only — no D4 multi-kills.",
  },
};

export const CANAL_INFO: Record<CanalId, { label: string; blurb: string }> = {
  suez: {
    label: "Suez Canal",
    blurb:
      "Land and sea units may cross; air units cannot cross from sea to sea. Ships pass only if they control the canal or at least one side of it.",
  },
  panama: {
    label: "Panama Canal",
    blurb:
      "Land and sea units may cross; air units cannot cross from sea to sea. Ships pass only if they control the canal or at least one side of it.",
  },
};

/** Units allowed onto mountain/jungle tiles (rulebook: jungle/mountain rules 2). */
export const ROUGH_TERRAIN_UNITS: ReadonlySet<UnitType> = new Set([
  "infantry",
  "aa_gun",
  "zeppelin",
]);

/** Vehicles that may pass through deserts but never stop there. */
export const DESERT_VEHICLES: ReadonlySet<UnitType> = new Set([
  "halftrack",
  "tank",
  "amph_tank",
  "cargo_truck",
]);

export function isRoughTerrain(t?: Terrain): boolean {
  return t === "mountain" || t === "jungle";
}

export interface Territory {
  id: string;
  name: string;
  points: string;
  centroid: { x: number; y: number };
  adjacent: string[];
  owner: Faction;
  ipc: number;
  units: Unit[];
  hasFactory: boolean;
  /** Buildings constructed here (Phase 2). */
  structures: StructureType[];
  builtInfantryThisTurn: boolean;
  /** Sea zones can only host naval units; they have no owner & no NPP. */
  isSea: boolean;
  /** Rulebook terrain, Phase 7. */
  terrain?: Terrain;
  /** Canal provinces (Suez / Panama), Phase 7. */
  canal?: CanalId;
}

export function structureIncome(t: Territory): number {
  return (t.structures ?? []).reduce((n, s) => n + STRUCTURE_STATS[s].income, 0);
}
/** A bunker only stiffens the line when a garrison of 3 infantry mans it. */
export const BUNKER_INFANTRY_REQUIRED = 3;
/** A rough strip can only host 4 aircraft; an Airfield has no such limit. */
export const RUNWAY_CAPACITY = 4;
/** Rulebook upgrades: pay the difference and the building is replaced. */
export const STRUCTURE_UPGRADES: Partial<Record<StructureType, { to: StructureType; cost: number }>> = {
  runway: { to: "airfield", cost: 25 },
  fob: { to: "factory", cost: 15 },
  island_outpost: { to: "harbor", cost: 12 },
};

export function structureDefenseBonus(t: Territory): number {
  return (t.structures ?? []).reduce((n, s) => {
    if (s === "bunker") {
      const infantry = (t.units ?? []).filter((u) => u.type === "infantry").length;
      return n + (infantry >= BUNKER_INFANTRY_REQUIRED ? STRUCTURE_STATS.bunker.defenseBonus : 0);
    }
    return n + STRUCTURE_STATS[s].defenseBonus;
  }, 0);
}
export function hasStructure(t: Territory, s: StructureType): boolean {
  return (t.structures ?? []).includes(s);
}


/** ---------------- Phase 4: economy & victory points ---------------- */

export const BOND_CATEGORIES = ["coal", "lumber", "steel", "oil"] as const;
export type BondCategory = (typeof BOND_CATEGORIES)[number];

export interface BondSpec {
  label: string;
  die: number;
  /** Bonds granted when the Stock Market is built. */
  starting: number;
  /** Must always keep at least this many bonds in the category. */
  minimum: number;
  speed: string;
}

export const BOND_SPECS: Record<BondCategory, BondSpec> = {
  coal:   { label: "Coal",   die: 4,  starting: 4,  minimum: 4,  speed: "Very slow" },
  lumber: { label: "Lumber", die: 6,  starting: 6,  minimum: 6,  speed: "Slow" },
  steel:  { label: "Steel",  die: 10, starting: 10, minimum: 10, speed: "Fast" },
  oil:    { label: "Oil",    die: 20, starting: 12, minimum: 20, speed: "Very fast" },
};

export type Bonds = Record<BondCategory, number>;

export const emptyBonds = (): Bonds => ({ coal: 0, lumber: 0, steel: 0, oil: 0 });

/** End-game VP for simply holding a province. */
export const TERRITORY_END_VP = 1;

/** Sell tiers: NPP paid per VP sold, based on the seller's income per turn. */
export function vpSellRate(incomePerTurn: number): number {
  if (incomePerTurn <= 50) return 20;
  if (incomePerTurn <= 100) return 10;
  if (incomePerTurn <= 150) return 5;
  return 5;
}

/** Day-trading: D6 target to win the bet, by stake and income bracket. */
export function dayTradeTarget(stake: number, incomePerTurn: number): number {
  if (incomePerTurn > 50) return 3; // 50/50
  if (stake <= 10) return 5;
  if (stake <= 20) return 4;
  return 3;
}

export const MAX_DAY_TRADE = 30;
export const MAX_SCRAP_PER_TURN = 5;

export interface EconomyFlags {
  soldVPThisTurn: number;
  stockRolledThisTurn: boolean;
  dayTradedThisTurn: boolean;
  scrappedThisTurn: number;
  warehouseDrawnThisTurn: boolean;
  /** Rulebook: one spy mission per game day. */
  spyMissionThisTurn: boolean;
  spyTrainedThisTurn: boolean;
}

export const freshEconomyFlags = (): EconomyFlags => ({
  soldVPThisTurn: 0,
  stockRolledThisTurn: false,
  dayTradedThisTurn: false,
  scrappedThisTurn: 0,
  warehouseDrawnThisTurn: false,
  spyMissionThisTurn: false,
  spyTrainedThisTurn: false,
});

/** ---------------- Phase 5: espionage ---------------- */

export type SpyAction =
  | "intel_report" | "sabotage" | "commandos" | "head_hunter" | "blackout"
  | "espionage" | "provoke_independence" | "incite_rebellion" | "sapper";

export interface SpyActionSpec {
  label: string;
  icon: string;
  /** D6 roll must be this number or lower to succeed. */
  target: number;
  /** Extra NPP spent on top of the spy itself. */
  cost: number;
  /** Mission must be flown/landed against an enemy-held province. */
  blurb: string;
}

/** Cost of training one spy at an Intel Center. */
export const SPY_COST = 8;
/** Spies infiltrate from a submarine (2), zeppelin or spy plane (1) — tiles. */
export const SPY_INSERT_RANGE: Record<string, number> = {
  submarine: 2,
  zeppelin: 1,
  spy_plane: 1,
};

export const SPY_ACTIONS: Record<SpyAction, SpyActionSpec> = {
  intel_report:        { label: "Intel Report",    icon: "📄", target: 5, cost: 0,  blurb: "Reveal the garrison, buildings and treasury of the target nation." },
  sabotage:            { label: "Sabotage",        icon: "🧨", target: 3, cost: 4,  blurb: "Destroy one enemy building in the province." },
  commandos:           { label: "Commandos",       icon: "🔪", target: 3, cost: 6,  blurb: "Kill up to two enemy units in the province." },
  head_hunter:         { label: "Head Hunter",     icon: "🎯", target: 4, cost: 4,  blurb: "Hunt down one enemy spy." },
  blackout:            { label: "Blackout",        icon: "🌑", target: 3, cost: 6,  blurb: "Halve the target nation's income on its next turn." },
  espionage:           { label: "Espionage",       icon: "💰", target: 4, cost: 0,  blurb: "Steal D6 × 2 NPP from the target's treasury." },
  provoke_independence:{ label: "Provoke Indep.",  icon: "🏳", target: 2, cost: 10, blurb: "An undefended province declares itself neutral." },
  incite_rebellion:    { label: "Incite Rebellion",icon: "🔥", target: 2, cost: 10, blurb: "Turn one enemy unit in the province to your side." },
  sapper:              { label: "Sapper",          icon: "⛏", target: 3, cost: 5,  blurb: "Demolish every fortification in the province." },
};

export const SPY_ACTION_ORDER: SpyAction[] = [
  "intel_report", "espionage", "sabotage", "sapper", "commandos",
  "head_hunter", "blackout", "provoke_independence", "incite_rebellion",
];

export interface GameState {
  turn: number;
  currentPlayer: Nation;
  territories: Record<string, Territory>;
  treasury: Record<Nation, number>;
  log: string[];
  /** VP earned in play (destroyed structures, minus VP sold). */
  vp: Record<Nation, number>;
  /** Stock-market bonds held per nation. */
  bonds: Record<Nation, Bonds>;
  /** Infantry lost per nation — an Infirmary converts every 3 into a free unit. */
  infirmaryPool: Record<Nation, number>;
  /** How many times each nation's capital has been captured. */
  capitalLosses: Record<Nation, number>;
  /** Trained spies waiting for a mission. */
  spies: Record<Nation, number>;
  /** Turns of blackout remaining — income is halved while above zero. */
  blackout: Record<Nation, number>;
  /** A-bomb blueprints collected (3 assemble a bomb). */
  blueprints: Record<Nation, number>;
  /** Assembled A-bombs waiting to be loaded onto a bomber. */
  abombs: Record<Nation, number>;
  /** Turns of ceasefire remaining — this nation cannot attack or be attacked. */
  ceasefire: Record<Nation, number>;
  /** Per-turn purchase-phase limits for the active player. */
  economy: EconomyFlags;
  /** ---- Phase 6: campaign shell ---- */
  /** Manually maintained current game day. */
  day: number;
  /** Set once the end-of-campaign roll ends the war. */
  gameOver: boolean;
  winner: Nation | null;
  /** Setup rolls made before day 1: D6 placement order, D8 capital pick. */
  setupRolls: Record<Nation, { placement: number; capital: number }>;
  /** Terms of agreement between nations. */
  contracts: Contract[];
}

/** ---------------- Phase 6: campaign shell ---------------- */

/** The campaign is scheduled for six game days. */
export const GAME_DAYS = 6;
/** Each turn is timed at 25 minutes. */
export const TURN_SECONDS = 25 * 60;
/** A unanimous pause adds five minutes. */
export const PAUSE_BONUS_SECONDS = 5 * 60;
/** A contract may run at most five turns. */
export const MAX_CONTRACT_TURNS = 5;

export type ContractStatus = "proposed" | "active" | "declined" | "expired";

export type ContractKind = "ceasefire" | "alliance" | "passage" | "tribute";

export interface ContractKindSpec {
  label: string;
  icon: string;
  blurb: string;
}

export const CONTRACT_KINDS: Record<ContractKind, ContractKindSpec> = {
  ceasefire: { label: "Cease-fire", icon: "🕊", blurb: "Neither side attacks the other." },
  alliance:  { label: "Alliance",   icon: "🤝", blurb: "Joint war against a common enemy." },
  passage:   { label: "Right of Passage", icon: "🛣", blurb: "Units may cross each other's provinces." },
  tribute:   { label: "Tribute",    icon: "💰", blurb: "5 NPP paid each turn for the term." },
};

export const CONTRACT_KIND_ORDER: ContractKind[] = ["ceasefire", "alliance", "passage", "tribute"];

export interface Contract {
  id: string;
  kind: ContractKind;
  from: Nation;
  to: Nation;
  /** Turns left to run — counts down each time the proposer's turn ends. */
  turns: number;
  status: ContractStatus;
}

/** NPP collected per turn: provinces plus capital & oil platforms only. */
export function incomeFor(game: GameState, nation: Nation): number {
  const hasCapital = Object.values(game.territories).some(
    (t) => t.owner === nation && hasStructure(t, "capital"),
  );
  let income = 0;
  for (const t of Object.values(game.territories)) {
    if (t.owner !== nation || t.isSea) continue;
    income += t.ipc;
    if (hasCapital) income += structureIncome(t);
  }
  // A successful enemy Blackout halves this nation's take next turn.
  if ((game.blackout?.[nation] ?? 0) > 0) income = Math.floor(income / 2);
  return income;
}

/** Breakdown of a nation's end-game VP: earned + provinces + structures - capital penalties. */
export function vpBreakdown(game: GameState, nation: Nation): {
  earned: number;
  provinces: number;
  provinceCount: number;
  structures: number;
  capitalPenalty: number;
  total: number;
} {
  let provinces = 0;
  let provinceCount = 0;
  let structures = 0;
  for (const t of Object.values(game.territories)) {
    if (t.owner !== nation || t.isSea) continue;
    provinceCount += 1;
    provinces += TERRITORY_END_VP;
    for (const s of t.structures ?? []) structures += STRUCTURE_STATS[s].vpOwned;
  }
  const losses = game.capitalLosses[nation] ?? 0;
  const capitalPenalty = losses === 1 ? -10 : losses >= 2 ? -20 : 0;
  const earned = game.vp[nation] ?? 0;
  return {
    earned,
    provinces,
    provinceCount,
    structures,
    capitalPenalty,
    total: earned + provinces + structures + capitalPenalty,
  };
}

/** Projected end-game VP: provinces + held structures + earned VP - capital penalties. */
export function endGameVP(game: GameState, nation: Nation): number {
  return vpBreakdown(game, nation).total;
}

export const MAP_VIEWBOX = { x: -40, y: -360, width: 4400, height: 2400 };
