import { useEffect, useRef, useState } from "react";
import { useGame, type BombardEvent, type DieRoll, type PendingBattle } from "@/game/store";
import { useSettings } from "@/game/settings";
import { isAINation } from "@/game/control";
import {
  NATIONS,
  isAir,
  type Faction,
  type GameState,
  type Unit,
  type UnitType,
} from "@/game/types";
import { UNIT_ICONS } from "@/game/unitIcons";
import { duckMusic, sfxBurst, sfxExplosion, sfxFlyby, sfxGunshot, sfxShell } from "@/audio/engine";

/**
 * The battle cut scene. Each time the dice are rolled, the round plays out
 * on a battlefield (or at sea) with both sides' own miniatures: every unit
 * that rolls fires in turn with its die shown above it, each hit strikes a
 * unit that really died, and the fallen topple and burn while the survivors
 * hold their ground. Plays for battles that involve a human player; click or
 * press any key to skip.
 */

const MAX_PER_SIDE = 10;
const HEAVY = new Set<UnitType>([
  "artillery",
  "howitzer",
  "railgun",
  "tank",
  "heavy_tank",
  "amph_tank",
  "aa_gun",
  "battleship",
  "cruiser",
  "destroyer",
  "bomber",
]);

type Side = "att" | "def";

interface Actor {
  id: string;
  type: UnitType;
  side: Side;
  air: boolean;
  img: HTMLImageElement;
  x: number;
  y: number;
  size: number;
  roll?: { value: number | string; hit: boolean };
  fireAt?: number;
  /** When a killing shot lands. */
  deathAt?: number;
  /** When a non-killing hit or near miss lands nearby. */
  jolts: number[];
}

interface Shot {
  from: Actor | null;
  side: Side;
  at: number;
  travel: number;
  heavy: boolean;
  bomb: boolean;
  /** Where it lands, and any units it kills there. */
  impact: { x: number; y: number };
  kills: Actor[];
  hit: boolean;
}

interface FactionInfo {
  faction: Faction;
  name: string;
  flag: string;
  color: string;
}

interface RoundScene {
  key: string;
  seed: number;
  title: string;
  subtitle: string;
  sea: boolean;
  attacker: FactionInfo & { lost: number; hits: number; hidden: number };
  defender: FactionInfo & { lost: number; hits: number; hidden: number };
  actors: Actor[];
  shots: Shot[];
  /** Deaths with no matching shot (e.g. a bomber's extra kills) land in a final barrage. */
  barrage: { at: number; kills: Actor[] };
  summaryAt: number;
  duration: number;
  outcome: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const imageCache = new Map<string, HTMLImageElement>();
function icon(type: UnitType): HTMLImageElement {
  const src = UNIT_ICONS[type];
  let img = imageCache.get(src);
  if (!img) {
    img = new Image();
    img.src = src;
    imageCache.set(src, img);
  }
  return img;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function rng(seed: number) {
  let a = seed || 1;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Who is defending: the territory's owner, or for sea zones (which nobody
 * owns) the nation whose ships are there. */
function defendingFaction(to: { owner: Faction; units: Unit[] }, attacker: Faction): Faction {
  if (to.owner !== "neutral" && to.owner !== attacker) return to.owner;
  return to.units.find((u) => u.owner !== attacker && u.owner !== "neutral")?.owner ?? to.owner;
}

function factionInfo(f: Faction): FactionInfo {
  return f === "neutral"
    ? { faction: f, name: "Neutral forces", flag: "🏳️", color: "#9a8f7a" }
    : { faction: f, name: NATIONS[f].name, flag: NATIONS[f].flag, color: NATIONS[f].color };
}

// ---------------------------------------------------------------------------
// Building a round's scene from the board before and after the roll
// ---------------------------------------------------------------------------

function layoutSide(units: Unit[], side: Side, rand: () => number): Actor[] {
  const ground = units.filter((u) => !isAir(u.type));
  const air = units.filter((u) => isAir(u.type));
  const n = ground.length;
  const ranks = n > 6 ? 3 : n > 2 ? 2 : 1;
  const cols = Math.max(1, Math.ceil(n / ranks));
  const spacing = Math.min(0.085, 0.34 / cols);
  const base = n > 6 ? 0.13 : n > 3 ? 0.16 : 0.19;
  const rankY = [0.76, 0.67, 0.6];
  const actors: Actor[] = ground.map((u, i) => {
    const rank = i % ranks;
    const col = Math.floor(i / ranks);
    const off = 0.07 + col * spacing + rank * 0.025 + (rand() - 0.5) * 0.012;
    return {
      id: u.id,
      type: u.type,
      side,
      air: false,
      img: icon(u.type),
      x: side === "att" ? off : 1 - off,
      y: rankY[rank],
      size: base * (rank === 0 ? 1 : rank === 1 ? 0.84 : 0.72),
      jolts: [],
    };
  });
  air.forEach((u, i) => {
    const off = 0.12 + (i % 4) * 0.08;
    actors.push({
      id: u.id,
      type: u.type,
      side,
      air: true,
      img: icon(u.type),
      x: side === "att" ? off : 1 - off,
      y: 0.2 + Math.floor(i / 4) * 0.09 + (i % 2) * 0.04,
      size: 0.11,
      jolts: [],
    });
  });
  return actors;
}

/** Keep the dead and the shooters on screen when a side is too big to show whole. */
function pickShown(units: Unit[], dead: Set<string>, firing: Set<string>): Unit[] {
  const score = (u: Unit) => (dead.has(u.id) ? 2 : 0) + (firing.has(u.id) ? 1 : 0);
  return [...units].sort((a, b) => score(b) - score(a)).slice(0, MAX_PER_SIDE);
}

function buildRoundScene(
  prevGame: GameState,
  game: GameState,
  before: PendingBattle,
  after: PendingBattle,
): RoundScene | null {
  const fromPrev = prevGame.territories[before.attackerId];
  const toPrev = prevGame.territories[before.defenderId];
  const toNow = game.territories[after.defenderId];
  if (!fromPrev || !toPrev || !toNow) return null;
  const attackerFaction = prevGame.currentPlayer;
  const ids = new Set(before.attackerUnitIds);
  const pool: Unit[] = [...fromPrev.units, ...toPrev.units];
  for (const u of fromPrev.units) if (u.cargo) pool.push(...u.cargo);
  const attackers = pool.filter(
    (u, i) => ids.has(u.id) && pool.findIndex((x) => x.id === u.id) === i,
  );
  const defenders = toPrev.units.filter((u) => u.owner !== attackerFaction && !ids.has(u.id));
  const survivingAtk = new Set(after.attackerUnitIds);
  const survivingDef = new Set(toNow.units.map((u) => u.id));
  const deadAtk = new Set(attackers.filter((u) => !survivingAtk.has(u.id)).map((u) => u.id));
  const deadDef = new Set(defenders.filter((u) => !survivingDef.has(u.id)).map((u) => u.id));
  // A retreat only removes the attackers from the battle — nobody died.
  if (after.status === "retreated") deadAtk.clear();

  const round =
    after.rounds.length > before.rounds.length ? after.rounds[after.rounds.length - 1] : null;
  const opening =
    before.rounds.length === 0 && after.opening && !before.opening ? after.opening : null;

  const atkRolls: DieRoll[] = [...(opening?.bombardRolls ?? []), ...(round?.attackRolls ?? [])];
  const defRolls: DieRoll[] = [
    ...(opening?.coastalRolls ?? []),
    ...(opening?.aaRolls ?? []),
    ...(opening?.mineRolls ?? []),
    ...(round?.defenseRolls ?? []),
  ];
  const key = `${before.attackerId}>${before.defenderId}#${after.rounds.length}:${[...deadAtk, ...deadDef].join(",")}`;
  const seed = hash(key);
  const rand = rng(seed);

  const shownAtk = pickShown(attackers, deadAtk, new Set(atkRolls.map((r) => r.unitId)));
  const shownDef = pickShown(defenders, deadDef, new Set(defRolls.map((r) => r.unitId)));
  const actors = [...layoutSide(shownAtk, "att", rand), ...layoutSide(shownDef, "def", rand)];
  const byId = new Map(actors.map((a) => [a.id, a]));

  // Queues of the units each side's hits must claim.
  const killQueue: Record<Side, Actor[]> = {
    def: actors.filter((a) => a.side === "def" && deadDef.has(a.id)),
    att: actors.filter((a) => a.side === "att" && deadAtk.has(a.id)),
  };
  const living = (side: Side) =>
    actors.filter((a) => a.side === side && !killQueue[side].includes(a));

  const shots: Shot[] = [];
  const schedule = (
    rolls: DieRoll[],
    side: Side,
    start: number,
    span: number,
    isOpening: boolean,
  ) => {
    const enemy: Side = side === "att" ? "def" : "att";
    rolls.forEach((r, i) => {
      const from = byId.get(r.unitId) ?? null;
      const heavy = isOpening || HEAVY.has(r.type);
      const bomb = r.type === "bomber" || r.type === "zeppelin";
      const at = start + (rolls.length > 1 ? (i / (rolls.length - 1)) * span : 0) + rand() * 0.08;
      const travel = bomb ? 0.65 : heavy ? 0.7 : 0.28;
      if (from) {
        from.roll = { value: r.roll, hit: r.hit };
        from.fireAt = at;
      }
      let kills: Actor[] = [];
      let impact: { x: number; y: number };
      if (r.hit) {
        kills = killQueue[enemy].splice(0, r.bomberKills ?? 1);
        const target =
          kills[0] ?? living(enemy)[Math.floor(rand() * Math.max(1, living(enemy).length))];
        impact = target ? { x: target.x, y: target.y } : { x: side === "att" ? 0.8 : 0.2, y: 0.74 };
        for (const k of kills) k.deathAt = at + travel;
        if (!kills.length && target) target.jolts.push(at + travel);
      } else {
        // A miss falls short or wide of a random enemy.
        const target = living(enemy)[Math.floor(rand() * Math.max(1, living(enemy).length))];
        const tx = target ? target.x : side === "att" ? 0.8 : 0.2;
        const short = (0.06 + rand() * 0.1) * (side === "att" ? -1 : 1);
        impact = {
          x: tx + short,
          y: (target && !target.air ? target.y : 0.74) + 0.02 + rand() * 0.04,
        };
      }
      shots.push({ from, side, at, travel, heavy, bomb, impact, kills, hit: r.hit });
    });
  };

  let t = 0.6;
  if (
    opening &&
    (opening.bombardRolls.length ||
      opening.coastalRolls.length ||
      opening.aaRolls.length ||
      opening.mineRolls.length)
  ) {
    schedule(opening.bombardRolls, "att", t, 0.6, true);
    schedule(
      [...opening.coastalRolls, ...opening.aaRolls, ...opening.mineRolls],
      "def",
      t + 0.15,
      0.6,
      true,
    );
    t += 1.2;
  }
  if (round) {
    const span = Math.min(
      2.2,
      0.6 + Math.max(round.attackRolls.length, round.defenseRolls.length) * 0.22,
    );
    schedule(round.attackRolls, "att", t, span, false);
    schedule(round.defenseRolls, "def", t + 0.12, span, false);
    t += span + 0.15;
  }
  // Any remaining deaths (multi-kills, opening losses we couldn't pin on a die).
  const leftovers = [...killQueue.att, ...killQueue.def];
  const barrage = { at: t + 0.25, kills: leftovers };
  for (const k of leftovers) k.deathAt = barrage.at;
  const lastImpact = Math.max(
    barrage.kills.length ? barrage.at : 0,
    ...shots.map((s) => s.at + s.travel),
    0.8,
  );
  const summaryAt = lastImpact + 0.7;

  const defenderFaction = defendingFaction(toPrev, attackerFaction);
  const att = factionInfo(attackerFaction);
  const def = factionInfo(defenderFaction);
  let outcome: string | null = null;
  if (after.status === "attacker-won") outcome = `${att.name} takes ${toPrev.name}`;
  else if (after.status === "defender-won") outcome = `${def.name} holds ${toPrev.name}`;
  else if (after.status === "stalemate") outcome = "Both sides wiped out";

  const subtitle = round
    ? `${round.dogfight ? "Dogfight · " : ""}Round ${after.rounds.length}`
    : "Opening barrage";

  return {
    key,
    seed,
    title: toPrev.name,
    subtitle,
    sea: toPrev.isSea,
    attacker: {
      ...att,
      lost: deadAtk.size,
      hits: (round?.attackHits ?? 0) + (opening?.defenderLosses ?? 0),
      hidden: attackers.length - shownAtk.length,
    },
    defender: {
      ...def,
      lost: deadDef.size,
      hits: (round?.defenseHits ?? 0) + (opening?.attackerLosses ?? 0),
      hidden: defenders.length - shownDef.length,
    },
    actors,
    shots,
    barrage,
    summaryAt,
    duration: summaryAt + (outcome ? 2.1 : 1.6),
    outcome,
  };
}

/** A stand-alone bombardment: the guns fire from range and nobody shoots back. */
function buildBombardScene(prevGame: GameState, ev: BombardEvent): RoundScene | null {
  const from = prevGame.territories[ev.fromId];
  const target = prevGame.territories[ev.targetId];
  if (!from || !target) return null;
  const gunIds = new Set(ev.shots.map((s) => s.unitId));
  const guns = from.units.filter((u) => gunIds.has(u.id));
  const defenders = ev.targetUnits.filter((u) => u.owner !== ev.player);
  const dead = new Set(ev.shots.flatMap((s) => s.killed));
  const key = `bombard:${ev.id}`;
  const seed = hash(key);
  const rand = rng(seed);
  const shownAtk = guns.slice(0, MAX_PER_SIDE);
  const shownDef = pickShown(defenders, dead, new Set());
  const actors = [...layoutSide(shownAtk, "att", rand), ...layoutSide(shownDef, "def", rand)];
  const byId = new Map(actors.map((a) => [a.id, a]));
  const defActors = actors.filter((a) => a.side === "def");

  const shots: Shot[] = [];
  const totalDice = ev.shots.reduce((n, s) => n + s.rolls.length, 0);
  const span = Math.min(2.4, 0.5 + totalDice * 0.3);
  let k = 0;
  for (const s of ev.shots) {
    const gun = byId.get(s.unitId) ?? null;
    if (gun) {
      gun.roll = { value: s.rolls.map((r) => r.roll).join("·"), hit: s.rolls.some((r) => r.hit) };
    }
    // Hand this gun's kills to its hitting dice in order; a howitzer's single
    // hit can destroy several units at once.
    const killed = s.killed.map((id) => byId.get(id)).filter((a): a is Actor => !!a);
    const hitDice = s.rolls.filter((r) => r.hit).length;
    let hitIndex = 0;
    s.rolls.forEach((r) => {
      const at = 0.7 + (totalDice > 1 ? (k / (totalDice - 1)) * span : 0) + rand() * 0.08;
      if (gun && gun.fireAt === undefined) gun.fireAt = at;
      k++;
      const travel = 0.75;
      let kills: Actor[] = [];
      let impact: { x: number; y: number };
      if (r.hit) {
        kills =
          hitIndex === hitDice - 1 ? killed.slice(hitIndex) : killed.slice(hitIndex, hitIndex + 1);
        hitIndex++;
        for (const a of kills) a.deathAt = at + travel;
        const tgt = kills[0] ?? defActors[Math.floor(rand() * Math.max(1, defActors.length))];
        impact = tgt ? { x: tgt.x, y: tgt.y } : { x: 0.8, y: 0.74 };
        if (!kills.length && tgt) tgt.jolts.push(at + travel);
      } else {
        const tgt = defActors[Math.floor(rand() * Math.max(1, defActors.length))];
        impact = {
          x: (tgt ? tgt.x : 0.8) - (0.06 + rand() * 0.1),
          y: (tgt ? tgt.y : 0.74) + 0.02 + rand() * 0.04,
        };
      }
      shots.push({
        from: gun,
        side: "att",
        at,
        travel,
        heavy: true,
        bomb: false,
        impact,
        kills,
        hit: r.hit,
      });
    });
  }
  const leftovers = defActors.filter((a) => dead.has(a.id) && a.deathAt === undefined);
  const barrageAt = 0.7 + span + 0.4;
  for (const a of leftovers) a.deathAt = barrageAt;
  const lastImpact = Math.max(
    leftovers.length ? barrageAt : 0,
    ...shots.map((s) => s.at + s.travel),
    0.8,
  );
  const summaryAt = lastImpact + 0.7;
  const att = factionInfo(ev.player);
  const def = factionInfo(
    defendingFaction({ owner: target.owner, units: ev.targetUnits }, ev.player),
  );
  const wiped = defenders.length > 0 && defenders.every((u) => dead.has(u.id));
  return {
    key,
    seed,
    title: target.name,
    subtitle: "Bombardment",
    sea: target.isSea,
    attacker: { ...att, lost: 0, hits: dead.size, hidden: guns.length - shownAtk.length },
    defender: { ...def, lost: dead.size, hits: 0, hidden: defenders.length - shownDef.length },
    actors,
    shots,
    barrage: { at: barrageAt, kills: leftovers },
    summaryAt,
    duration: summaryAt + (wiped ? 2.1 : 1.6),
    outcome: wiped ? `${target.name} garrison destroyed` : null,
  };
}

// ---------------------------------------------------------------------------
// Component: watches for rolled rounds and plays them in order
// ---------------------------------------------------------------------------

export function BattleCutscene() {
  const [queue, setQueue] = useState<RoundScene[]>([]);

  useEffect(
    () =>
      useGame.subscribe((state, prev) => {
        const ev = state.bombardEvent;
        if (ev && ev !== prev.bombardEvent && useSettings.getState().cutscenes) {
          const target = prev.game.territories[ev.targetId];
          const owner = target ? defendingFaction(target, ev.player) : "neutral";
          if (!isAINation(ev.player) || (owner !== "neutral" && !isAINation(owner))) {
            const scene = buildBombardScene(prev.game, ev);
            if (scene) setQueue((q) => [...q, scene].slice(-5));
          }
          return;
        }
        const before = prev.pendingBattle;
        const after = state.pendingBattle;
        if (!before || !after) return;
        if (before.attackerId !== after.attackerId || before.defenderId !== after.defenderId)
          return;
        const newRound = after.rounds.length > before.rounds.length;
        // Opening fire can settle a battle before any regular round is rolled.
        const openingOnly =
          !newRound &&
          before.status === "ongoing" &&
          after.status !== "ongoing" &&
          after.status !== "retreated" &&
          !!after.opening &&
          !before.opening;
        if (!newRound && !openingOnly) return;
        if (!useSettings.getState().cutscenes) return;
        const attacker = prev.game.currentPlayer;
        const target = prev.game.territories[before.defenderId];
        const owner = target ? defendingFaction(target, attacker) : "neutral";
        const humanInvolved = !isAINation(attacker) || (owner !== "neutral" && !isAINation(owner));
        if (!humanInvolved) return;
        const scene = buildRoundScene(prev.game, state.game, before, after);
        if (scene) setQueue((q) => [...q, scene].slice(-5));
      }),
    [],
  );

  const current = queue[0];
  if (!current) return null;
  return (
    <CutscenePlayer
      key={current.key}
      scene={current}
      speed={queue.length > 1 ? 1.5 : 1}
      onDone={() => setQueue((q) => q.slice(1))}
      onSkipAll={() => setQueue([])}
    />
  );
}

// ---------------------------------------------------------------------------
// Particles
// ---------------------------------------------------------------------------

type PKind = "flash" | "spark" | "smoke" | "fire" | "dirt";
interface P {
  kind: PKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
}

function CutscenePlayer({
  scene,
  speed,
  onDone,
  onSkipAll,
}: {
  scene: RoundScene;
  speed: number;
  onDone: () => void;
  onSkipAll: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const cb = useRef({ onDone, onSkipAll });
  cb.current = { onDone, onSkipAll };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const rand = rng(scene.seed ^ 0x9e3779b9);
    duckMusic(scene.duration / speed);

    let W = 0;
    let H = 0;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const particles: P[] = [];
    let shake = 0;
    let light = 0;
    const ridge = Array.from({ length: 14 }, () => rand());
    const craters = Array.from({ length: 9 }, () => ({
      x: rand(),
      y: 0.8 + rand() * 0.12,
      r: 0.02 + rand() * 0.04,
    }));
    const fires = Array.from({ length: 4 }, () => ({ x: 0.15 + rand() * 0.7, phase: rand() * 6 }));

    const explode = (x: number, y: number, big: boolean) => {
      particles.push({
        kind: "flash",
        x,
        y,
        vx: 0,
        vy: 0,
        age: 0,
        life: big ? 0.35 : 0.22,
        size: big ? 0.12 : 0.07,
      });
      const n = reduced ? 5 : big ? 24 : 12;
      for (let i = 0; i < n; i++) {
        const a = rand() * Math.PI * 2;
        const s = (0.15 + rand() * 0.45) * (big ? 1.4 : 1);
        particles.push({
          kind: "spark",
          x,
          y,
          vx: Math.cos(a) * s * 0.5,
          vy: -Math.abs(Math.sin(a)) * s - 0.1,
          age: 0,
          life: 0.5 + rand() * 0.5,
          size: 0.004 + rand() * 0.004,
        });
      }
      for (let i = 0; i < (big ? 5 : 2); i++) {
        particles.push({
          kind: "smoke",
          x: x + (rand() - 0.5) * 0.04,
          y,
          vx: (rand() - 0.5) * 0.03,
          vy: -0.04 - rand() * 0.05,
          age: 0,
          life: 1.4 + rand(),
          size: 0.03 + rand() * 0.03,
        });
      }
      particles.push({
        kind: "fire",
        x,
        y,
        vx: 0,
        vy: 0,
        age: 0,
        life: big ? 1.1 : 0.6,
        size: big ? 0.06 : 0.035,
      });
      if (!reduced) shake = Math.min(1, shake + (big ? 0.8 : 0.35));
      light = Math.min(1, light + (big ? 0.7 : 0.35));
    };
    const dirt = (x: number, y: number) => {
      for (let i = 0; i < (reduced ? 3 : 9); i++) {
        particles.push({
          kind: "dirt",
          x,
          y,
          vx: (rand() - 0.5) * 0.25,
          vy: -0.25 - rand() * 0.35,
          age: 0,
          life: 0.6 + rand() * 0.3,
          size: 0.004 + rand() * 0.005,
        });
      }
      particles.push({ kind: "smoke", x, y, vx: 0, vy: -0.03, age: 0, life: 0.9, size: 0.02 });
    };

    // ----- Events -----
    type Ev = { t: number; run: () => void; done?: boolean };
    const events: Ev[] = [];
    const add = (t: number, run: () => void) => events.push({ t, run });
    if (scene.actors.some((a) => a.air)) add(0.2, () => sfxFlyby(0, 2.6));
    for (const s of scene.shots) {
      add(s.at, () => {
        if (s.heavy && !s.bomb) sfxShell(0);
        else if (s.bomb) sfxGunshot(0, 0.15);
        else sfxBurst(0, 3 + Math.floor(rand() * 3));
      });
      add(s.at + s.travel, () => {
        if (s.kills.length) {
          for (const k of s.kills) explode(k.x, k.air ? k.y : k.y + k.size * 0.2, true);
          if (!s.heavy || s.bomb) sfxExplosion(0, 1);
        } else if (s.hit) {
          explode(s.impact.x, s.impact.y, false);
        } else {
          dirt(s.impact.x, s.impact.y);
          if (!s.heavy) sfxGunshot(0, 0.12);
        }
      });
    }
    if (scene.barrage.kills.length) {
      add(scene.barrage.at, () => {
        for (const k of scene.barrage.kills) explode(k.x, k.y, true);
        sfxExplosion(0, 1.3);
      });
    }
    // Shot-down aircraft crash into the ground.
    for (const a of scene.actors) {
      if (a.air && a.deathAt !== undefined)
        add(a.deathAt + 0.8, () => {
          explode(a.x + (a.side === "att" ? 0.04 : -0.04), 0.76, true);
          sfxExplosion(0, 0.9);
        });
    }
    add(scene.summaryAt, () => setShowSummary(true));

    // ----- Drawing -----
    const drawScenery = (t: number) => {
      const sky = ctx.createLinearGradient(0, 0, 0, H * 0.7);
      sky.addColorStop(0, "#120e0b");
      sky.addColorStop(0.55, "#3a2316");
      sky.addColorStop(1, `rgb(${150 + light * 90}, ${70 + light * 60}, ${30 + light * 20})`);
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);
      if (scene.sea) {
        const sea = ctx.createLinearGradient(0, H * 0.6, 0, H);
        sea.addColorStop(0, "#22323d");
        sea.addColorStop(1, "#0b1218");
        ctx.fillStyle = sea;
        ctx.fillRect(0, H * 0.6, W, H * 0.4);
        ctx.strokeStyle = "rgba(170, 200, 215, 0.18)";
        ctx.lineWidth = 1.5;
        for (let row = 0; row < 9; row++) {
          const y = H * (0.63 + row * 0.042);
          ctx.beginPath();
          for (let x = 0; x <= W; x += 18) {
            const yy = y + Math.sin(x * 0.02 + t * 2.4 + row) * (2 + row * 0.6);
            if (x === 0) ctx.moveTo(x, yy);
            else ctx.lineTo(x, yy);
          }
          ctx.stroke();
        }
      } else {
        ctx.fillStyle = "#1d1611";
        ctx.beginPath();
        ctx.moveTo(0, H * 0.62);
        ridge.forEach((r, i) => ctx.lineTo((i / (ridge.length - 1)) * W, H * (0.5 + r * 0.08)));
        ctx.lineTo(W, H * 0.62);
        ctx.fill();
        for (const f of fires) {
          const fx = f.x * W;
          const fy = H * 0.6;
          const flick = 0.6 + Math.sin(t * 11 + f.phase) * 0.25 + Math.sin(t * 17 + f.phase) * 0.15;
          const g = ctx.createRadialGradient(fx, fy, 0, fx, fy, H * 0.05 * flick);
          g.addColorStop(0, "rgba(255,170,60,0.75)");
          g.addColorStop(1, "rgba(255,90,20,0)");
          ctx.fillStyle = g;
          ctx.fillRect(fx - H * 0.06, fy - H * 0.06, H * 0.12, H * 0.12);
        }
        const earth = ctx.createLinearGradient(0, H * 0.6, 0, H);
        earth.addColorStop(0, "#3b3021");
        earth.addColorStop(1, "#16110b");
        ctx.fillStyle = earth;
        ctx.fillRect(0, H * 0.6, W, H * 0.4);
        ctx.fillStyle = "rgba(0,0,0,0.28)";
        for (const c of craters) {
          ctx.beginPath();
          ctx.ellipse(c.x * W, c.y * H, c.r * W, c.r * H * 0.35, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };

    const actorPos = (a: Actor, t: number) => {
      let x = a.x;
      let y = a.y;
      if (a.air) y += Math.sin(t * 3 + a.x * 10) * 0.008;
      else if (scene.sea) y += Math.sin(t * 2.2 + a.x * 9) * 0.006;
      // Recoil when firing.
      if (a.fireAt !== undefined && t > a.fireAt && t < a.fireAt + 0.18) {
        x += (a.side === "att" ? -1 : 1) * 0.008 * (1 - (t - a.fireAt) / 0.18);
      }
      if (a.air && a.deathAt !== undefined && t > a.deathAt) {
        // Shot down: spiral into the ground.
        const k = Math.min(1, (t - a.deathAt) / 0.8);
        y = y + (0.76 - y) * k * k;
        x += (a.side === "att" ? 0.04 : -0.04) * k;
      }
      return { x, y };
    };

    const drawActor = (a: Actor, t: number) => {
      const color = a.side === "att" ? scene.attacker.color : scene.defender.color;
      const { x, y } = actorPos(a, t);
      const s = a.size * H;
      const px = x * W;
      const py = y * H;
      const dead = a.deathAt !== undefined && t >= a.deathAt;
      const k = dead ? Math.min(1, (t - a.deathAt!) / 0.55) : 0;
      if (a.air && dead && k >= 1 && t > a.deathAt! + 0.8) return; // crashed
      const jolt = a.jolts.some((j) => t > j && t < j + 0.25);
      ctx.save();
      if (!a.air) {
        const g = ctx.createRadialGradient(px, py + s * 0.38, 0, px, py + s * 0.38, s * 0.7);
        g.addColorStop(0, color + (dead ? "33" : "aa"));
        g.addColorStop(1, color + "00");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(px, py + s * 0.38, s * 0.7, s * 0.18, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.translate(px + (jolt ? (rand() - 0.5) * 7 : 0), py + (dead && !a.air ? k * s * 0.18 : 0));
      if (a.side === "def") ctx.scale(-1, 1);
      // Topple backwards when killed; aircraft spin.
      if (dead) ctx.rotate(a.air ? k * 2.4 : -k * 1.05);
      const strike = a.deathAt !== undefined && t > a.deathAt && t < a.deathAt + 0.12;
      if (a.img.complete && a.img.naturalWidth) {
        ctx.filter =
          strike || jolt
            ? "brightness(2.4) sepia(1)"
            : dead
              ? `brightness(${1 - 0.35 * k}) grayscale(${0.85 * k}) sepia(${0.25 * k})`
              : `brightness(${0.85 + light * 0.6})`;
        ctx.globalAlpha = dead ? 1 - 0.1 * k : 1;
        ctx.drawImage(a.img, -s / 2, -s / 2, s, s);
      }
      ctx.restore();

      // Wrecks keep smoking.
      if (dead && !a.air && !reduced && rand() < 0.12) {
        particles.push({
          kind: "smoke",
          x: x + (rand() - 0.5) * a.size * 0.3,
          y: y - a.size * 0.05,
          vx: (rand() - 0.5) * 0.02,
          vy: -0.05,
          age: 0,
          life: 1.3,
          size: 0.015 + rand() * 0.015,
        });
      }
    };

    const drawBadges = (a: Actor, t: number) => {
      const { x, y } = actorPos(a, t);
      const px = x * W;
      const s = a.size * H;
      const dead = a.deathAt !== undefined && t >= a.deathAt;
      // Die roll above each unit that fired.
      if (a.roll && a.fireAt !== undefined && t >= a.fireAt - 0.05 && !(a.air && dead)) {
        const k = Math.min(1, (t - a.fireAt + 0.05) / 0.15);
        const box = Math.max(20, Math.min(30, H * 0.034)) * (0.6 + 0.4 * k);
        const bx = px - box / 2;
        const by = y * H - s * 0.55 - box;
        ctx.save();
        ctx.globalAlpha = dead ? 0.55 : 1;
        ctx.fillStyle = a.roll.hit ? "#2f7d3a" : "rgba(30,26,22,0.9)";
        ctx.strokeStyle = a.roll.hit ? "#bdf0b0" : "rgba(255,255,255,0.35)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(bx, by, box, box, 5);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#fff";
        ctx.font = `700 ${Math.round(box * 0.62)}px ui-monospace, Menlo, monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(a.roll.value), px, by + box / 2 + 1);
        ctx.restore();
      }
      // The fallen are marked.
      if (dead && !a.air) {
        const k = Math.min(1, (t - a.deathAt! - 0.35) / 0.3);
        if (k > 0) {
          ctx.save();
          ctx.globalAlpha = k;
          ctx.strokeStyle = "#e0453a";
          ctx.lineWidth = 4;
          ctx.lineCap = "round";
          const r = s * 0.18;
          const cy = y * H - s * 0.05;
          ctx.beginPath();
          ctx.moveTo(px - r, cy - r);
          ctx.lineTo(px + r, cy + r);
          ctx.moveTo(px + r, cy - r);
          ctx.lineTo(px - r, cy + r);
          ctx.stroke();
          ctx.restore();
        }
      }
    };

    const drawShots = (t: number) => {
      for (const s of scene.shots) {
        const k = (t - s.at) / s.travel;
        if (k < 0 || k > 1) continue;
        const from = s.from
          ? actorPos(s.from, s.at)
          : { x: s.side === "att" ? -0.02 : 1.02, y: 0.45 };
        const fx =
          from.x + (s.side === "att" ? 1 : -1) * (s.from ? s.from.size * 0.35 * (H / W) : 0);
        const fy = from.y - (s.from ? s.from.size * 0.12 : 0);
        ctx.save();
        if (k < 0.15 && s.from) {
          // Muzzle flash.
          const r = (s.heavy ? 0.035 : 0.02) * H * (1 - k / 0.15);
          const g = ctx.createRadialGradient(fx * W, fy * H, 0, fx * W, fy * H, r * 2);
          g.addColorStop(0, "rgba(255,245,200,1)");
          g.addColorStop(1, "rgba(255,160,40,0)");
          ctx.fillStyle = g;
          ctx.fillRect(fx * W - r * 2, fy * H - r * 2, r * 4, r * 4);
        }
        if (s.bomb) {
          const x = fx + (s.impact.x - fx) * k;
          const y = fy + (s.impact.y - fy) * k * k;
          ctx.fillStyle = "#14100c";
          ctx.beginPath();
          ctx.ellipse(x * W, y * H, 3, 6, 0.3, 0, Math.PI * 2);
          ctx.fill();
        } else if (s.heavy) {
          const x = fx + (s.impact.x - fx) * k;
          const y = fy + (s.impact.y - fy) * k - Math.sin(k * Math.PI) * 0.22;
          ctx.fillStyle = "#fff3c4";
          ctx.shadowColor = "#ffcf6a";
          ctx.shadowBlur = 12;
          ctx.beginPath();
          ctx.arc(x * W, y * H, 3, 0, Math.PI * 2);
          ctx.fill();
        } else {
          const color = s.side === "att" ? "#ffe28a" : "#ffb070";
          ctx.strokeStyle = color;
          ctx.shadowColor = color;
          ctx.shadowBlur = 8;
          ctx.lineWidth = 2;
          for (let i = 0; i < 3; i++) {
            const kk = k - i * 0.12;
            if (kk < 0) continue;
            const x = fx + (s.impact.x - fx) * kk;
            const y = fy + (s.impact.y - fy) * kk;
            const bx = fx + (s.impact.x - fx) * Math.max(0, kk - 0.18);
            const by = fy + (s.impact.y - fy) * Math.max(0, kk - 0.18);
            ctx.beginPath();
            ctx.moveTo(bx * W, by * H);
            ctx.lineTo(x * W, y * H);
            ctx.stroke();
          }
        }
        ctx.restore();
      }
    };

    const drawParticles = (dt: number) => {
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.age += dt;
        const k = p.age / p.life;
        if (k >= 1) {
          particles.splice(i, 1);
          continue;
        }
        ctx.save();
        if (p.kind === "flash") {
          const r = p.size * H * (0.6 + k);
          const g = ctx.createRadialGradient(p.x * W, p.y * H, 0, p.x * W, p.y * H, r);
          g.addColorStop(0, `rgba(255,250,220,${1 - k})`);
          g.addColorStop(0.4, `rgba(255,190,80,${0.8 * (1 - k)})`);
          g.addColorStop(1, "rgba(255,120,30,0)");
          ctx.fillStyle = g;
          ctx.fillRect(p.x * W - r, p.y * H - r, r * 2, r * 2);
        } else if (p.kind === "fire") {
          const r = p.size * H * (1 - k * 0.5);
          const g = ctx.createRadialGradient(
            p.x * W,
            p.y * H - r * 0.4,
            0,
            p.x * W,
            p.y * H - r * 0.4,
            r,
          );
          g.addColorStop(0, `rgba(255,210,120,${0.9 * (1 - k)})`);
          g.addColorStop(1, "rgba(200,60,10,0)");
          ctx.fillStyle = g;
          ctx.fillRect(p.x * W - r, p.y * H - r * 1.4, r * 2, r * 2);
        } else if (p.kind === "spark" || p.kind === "dirt") {
          p.vy += dt * 0.9;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          ctx.fillStyle =
            p.kind === "spark"
              ? `rgba(255,${180 - k * 120},60,${1 - k})`
              : `rgba(70,55,38,${1 - k})`;
          ctx.fillRect(p.x * W, p.y * H, p.size * H, p.size * H);
        } else {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          const r = p.size * H * (1 + k * 2.2);
          ctx.fillStyle = `rgba(48,42,38,${0.5 * (1 - k)})`;
          ctx.beginPath();
          ctx.arc(p.x * W, p.y * H, r, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
    };

    const air = scene.actors.filter((a) => a.air);
    const ground = scene.actors.filter((a) => !a.air).sort((a, b) => a.y - b.y);

    let start = 0;
    let last = 0;
    let raf = 0;
    let finished = false;
    const finish = (all: boolean) => {
      if (finished) return;
      finished = true;
      cancelAnimationFrame(raf);
      setLeaving(true);
      window.setTimeout(() => (all ? cb.current.onSkipAll() : cb.current.onDone()), 280);
    };
    const frame = (now: number) => {
      if (!start) start = last = now;
      const t = ((now - start) / 1000) * speed;
      const dt = Math.min(0.05, (now - last) / 1000) * speed;
      last = now;
      for (const ev of events) {
        if (!ev.done && t >= ev.t) {
          ev.done = true;
          ev.run();
        }
      }
      ctx.save();
      if (shake > 0.01) ctx.translate((rand() - 0.5) * shake * 14, (rand() - 0.5) * shake * 10);
      shake *= 0.9;
      light *= 0.92;
      drawScenery(t);
      for (const a of air) drawActor(a, t);
      for (const a of ground) drawActor(a, t);
      drawShots(t);
      drawParticles(dt);
      for (const a of scene.actors) drawBadges(a, t);
      const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.95);
      v.addColorStop(0, "rgba(0,0,0,0)");
      v.addColorStop(1, "rgba(0,0,0,0.6)");
      ctx.fillStyle = v;
      ctx.fillRect(-20, -20, W + 40, H + 40);
      ctx.restore();
      if (t >= scene.duration) return finish(false);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    // Click skips this round; Escape skips every queued round.
    const onKey = (e: KeyboardEvent) => finish(e.key === "Escape");
    const onClick = () => finish(false);
    window.addEventListener("keydown", onKey);
    const host = canvas.parentElement;
    host?.addEventListener("pointerdown", onClick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", onKey);
      host?.removeEventListener("pointerdown", onClick);
    };
  }, [scene, speed]);

  const a = scene.attacker;
  const d = scene.defender;
  return (
    <div
      role="dialog"
      aria-label={
        scene.subtitle === "Bombardment"
          ? `Bombardment of ${scene.title}`
          : `Battle of ${scene.title}, ${scene.subtitle}`
      }
      className={
        "fixed inset-0 z-[58] cursor-pointer select-none overflow-hidden bg-black transition-opacity duration-300 " +
        (leaving ? "opacity-0" : "animate-[cutscene-in_0.3s_ease-out]")
      }
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <div className="absolute inset-x-0 top-0 flex h-[14%] min-h-16 animate-[bar-top_0.4s_ease-out] flex-col items-center justify-end bg-black pb-2 pt-[env(safe-area-inset-top)]">
        <div className="text-[10px] uppercase tracking-[0.5em] text-amber-200/70 sm:text-xs">
          {scene.subtitle === "Bombardment" ? "💥 Shelling" : "⚔ Battle of"}{" "}
          {scene.subtitle === "Bombardment" ? `of ${scene.title}` : scene.title}
        </div>
        <div className="animate-[title-in_0.7s_ease-out] px-4 text-center font-serif text-2xl font-bold uppercase tracking-[0.18em] text-amber-50 sm:text-4xl">
          {scene.subtitle}
        </div>
      </div>

      {a.hidden > 0 && (
        <div className="absolute left-4 top-[16%] text-xs text-white/60">
          +{a.hidden} more not shown
        </div>
      )}
      {d.hidden > 0 && (
        <div className="absolute right-4 top-[16%] text-xs text-white/60">
          +{d.hidden} more not shown
        </div>
      )}

      {showSummary && scene.outcome && (
        <div className="absolute inset-x-0 top-[34%] flex justify-center px-4">
          <div className="animate-[title-in_0.6s_ease-out] rounded border border-amber-200/40 bg-black/70 px-6 py-3 text-center font-serif text-xl font-bold uppercase tracking-[0.2em] text-amber-50 sm:text-3xl">
            {scene.outcome}
          </div>
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 flex h-[14%] min-h-16 animate-[bar-bottom_0.4s_ease-out] items-center justify-center gap-3 bg-black px-4 pb-[env(safe-area-inset-bottom)] font-serif sm:gap-8">
        <SideLabel info={a} showLoss={showSummary} />
        <span className="text-xs uppercase tracking-[0.3em] text-amber-200/60">vs</span>
        <SideLabel info={d} showLoss={showSummary} />
      </div>
      <div className="absolute bottom-[15%] right-4 text-[10px] uppercase tracking-widest text-white/50">
        Click to skip · Esc skips all
      </div>
    </div>
  );
}

function SideLabel({
  info,
  showLoss,
}: {
  info: FactionInfo & { lost: number };
  showLoss: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col items-center">
      <span
        className="truncate text-sm font-bold sm:text-xl"
        style={{ color: lighten(info.color) }}
      >
        {info.flag} {info.name}
      </span>
      <span
        className={
          "text-[11px] uppercase tracking-widest transition-opacity duration-500 sm:text-xs " +
          (showLoss ? "opacity-100" : "opacity-0") +
          (info.lost ? " text-red-300" : " text-green-300")
        }
      >
        {info.lost ? `lost ${info.lost} unit${info.lost === 1 ? "" : "s"}` : "no losses"}
      </span>
    </div>
  );
}

/** Nation colors are tuned for parchment; brighten them for black bars. */
function lighten(hex: string): string {
  return `color-mix(in oklab, ${hex} 70%, white)`;
}
