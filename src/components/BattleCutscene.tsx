import { useEffect, useRef, useState } from "react";
import { useGame } from "@/game/store";
import { useSettings } from "@/game/settings";
import { isAINation } from "@/game/control";
import { NATIONS, UNIT_STATS, isAir, type Faction, type Unit, type UnitType } from "@/game/types";
import { UNIT_ICONS } from "@/game/unitIcons";
import {
  duckMusic,
  sfxBurst,
  sfxCharge,
  sfxExplosion,
  sfxFlyby,
  sfxGunshot,
  sfxShell,
} from "@/audio/engine";

/**
 * A short cinematic that plays when a battle begins: the two armies' own
 * miniatures face off on a battlefield (or at sea) under gunfire, shellfire
 * and explosions. Click or press any key to skip. Plays for battles that
 * involve a human player; AI-versus-AI fights stay quick.
 */

const DURATION = 4.4;
const MAX_PER_SIDE = 7;

interface SceneUnit {
  type: UnitType;
  air: boolean;
  img: HTMLImageElement;
  /** Final position as fractions of the canvas. */
  x: number;
  y: number;
  size: number;
  /** Seconds before this unit enters. */
  delay: number;
  hitAt: number;
}

interface Scene {
  key: string;
  title: string;
  sea: boolean;
  attacker: { faction: Faction; name: string; flag: string; color: string; units: SceneUnit[] };
  defender: { faction: Faction; name: string; flag: string; color: string; units: SceneUnit[] };
  seed: number;
}

// ---------------------------------------------------------------------------
// Scene setup
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

/** Pick which miniatures to show: the strongest types, more copies for bigger stacks. */
function pickUnits(units: Unit[]): UnitType[] {
  const counts = new Map<UnitType, number>();
  for (const u of units) counts.set(u.type, (counts.get(u.type) ?? 0) + 1);
  const types = [...counts.entries()].sort(
    (a, b) => b[1] * (UNIT_STATS[b[0]].attack + 1) - a[1] * (UNIT_STATS[a[0]].attack + 1),
  );
  const out: UnitType[] = [];
  for (const [type, n] of types) {
    const copies = Math.min(n, out.length === 0 ? 3 : 2);
    for (let i = 0; i < copies && out.length < MAX_PER_SIDE; i++) out.push(type);
  }
  return out;
}

function layout(types: UnitType[], side: "att" | "def", rand: () => number): SceneUnit[] {
  const ground = types.filter((t) => !isAir(t));
  const air = types.filter((t) => isAir(t));
  const units: SceneUnit[] = [];
  ground.forEach((type, i) => {
    // Two ranks: the back rank sits higher and smaller.
    const back = i % 2 === 1;
    const col = Math.floor(i / 2);
    const span = side === "att" ? 0.1 + col * 0.085 : 0.9 - col * 0.085;
    units.push({
      type,
      air: false,
      img: icon(type),
      x: span + (rand() - 0.5) * 0.03,
      y: back ? 0.64 : 0.74,
      size: back ? 0.15 : 0.19,
      delay: 0.1 + i * 0.08,
      hitAt: 0,
    });
  });
  air.forEach((type, i) => {
    units.push({
      type,
      air: true,
      img: icon(type),
      x: 0,
      y: 0.24 + i * 0.07 + rand() * 0.03,
      size: 0.12,
      delay: 0.9 + i * 0.35,
      hitAt: 0,
    });
  });
  return units;
}

/** Who is defending: the territory's owner, or for sea zones (which nobody
 * owns) the nation whose ships are there. */
function defendingFaction(to: { owner: Faction; units: Unit[] }, attacker: Faction): Faction {
  if (to.owner !== "neutral" && to.owner !== attacker) return to.owner;
  return to.units.find((u) => u.owner !== attacker && u.owner !== "neutral")?.owner ?? to.owner;
}

function buildScene(): Scene | null {
  const { game, pendingBattle } = useGame.getState();
  if (!pendingBattle) return null;
  const from = game.territories[pendingBattle.attackerId];
  const to = game.territories[pendingBattle.defenderId];
  if (!from || !to) return null;
  const attackerFaction = game.currentPlayer;
  const ids = new Set(pendingBattle.attackerUnitIds);
  const pool: Unit[] = [...from.units, ...to.units];
  for (const u of [...from.units]) if (u.cargo) pool.push(...u.cargo);
  const attackers = pool.filter((u) => ids.has(u.id));
  const defenders = to.units.filter((u) => u.owner !== attackerFaction && !ids.has(u.id));
  const defenderFaction = defendingFaction(to, attackerFaction);
  const key = `${pendingBattle.attackerId}>${pendingBattle.defenderId}:${pendingBattle.attackerUnitIds.join(",")}`;
  const seed = hash(key);
  const rand = rng(seed);
  const info = (f: Faction) =>
    f === "neutral"
      ? { faction: f, name: "Neutral forces", flag: "🏳️", color: "#9a8f7a" }
      : { faction: f, name: NATIONS[f].name, flag: NATIONS[f].flag, color: NATIONS[f].color };
  return {
    key,
    seed,
    title: to.name,
    sea: to.isSea,
    attacker: { ...info(attackerFaction), units: layout(pickUnits(attackers), "att", rand) },
    defender: { ...info(defenderFaction), units: layout(pickUnits(defenders), "def", rand) },
  };
}

// ---------------------------------------------------------------------------
// Particles
// ---------------------------------------------------------------------------

type PKind = "flash" | "spark" | "smoke" | "fire" | "tracer" | "shell" | "bomb";
interface P {
  kind: PKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  /** Tracers and shells: where they land. */
  tx?: number;
  ty?: number;
  sx?: number;
  sy?: number;
  color?: string;
  big?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BattleCutscene() {
  const pendingBattle = useGame((s) => s.pendingBattle);
  const [scene, setScene] = useState<Scene | null>(null);
  const lastKey = useRef<string | null>(null);

  useEffect(() => {
    if (!pendingBattle) {
      lastKey.current = null;
      return;
    }
    const key = `${pendingBattle.attackerId}>${pendingBattle.defenderId}:${pendingBattle.attackerUnitIds.join(",")}`;
    if (key === lastKey.current) return;
    lastKey.current = key;
    // Joining a battle already under way (e.g. a late network update): no film.
    if (pendingBattle.rounds.length > 0) return;
    if (!useSettings.getState().cutscenes) return;
    const { game } = useGame.getState();
    const attacker = game.currentPlayer;
    const target = game.territories[pendingBattle.defenderId];
    const owner = target ? defendingFaction(target, attacker) : "neutral";
    const humanInvolved = !isAINation(attacker) || (owner !== "neutral" && !isAINation(owner));
    if (!humanInvolved) return;
    const next = buildScene();
    if (next) setScene(next);
  }, [pendingBattle]);

  if (!scene) return null;
  return <CutscenePlayer key={scene.key} scene={scene} onDone={() => setScene(null)} />;
}

function CutscenePlayer({ scene, onDone }: { scene: Scene; onDone: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [leaving, setLeaving] = useState(false);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const rand = rng(scene.seed ^ 0x9e3779b9);
    duckMusic(DURATION);

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

    const att = scene.attacker.units;
    const def = scene.defender.units;
    const particles: P[] = [];
    let shake = 0;
    let light = 0;

    // Fixed scenery: distant ridgeline and craters.
    const ridge = Array.from({ length: 14 }, () => rand());
    const craters = Array.from({ length: 9 }, () => ({
      x: rand(),
      y: 0.78 + rand() * 0.14,
      r: 0.02 + rand() * 0.04,
    }));
    const fires = Array.from({ length: 4 }, () => ({ x: 0.15 + rand() * 0.7, phase: rand() * 6 }));

    // ----- Event script -----
    type Ev = { t: number; run: () => void; done?: boolean };
    const events: Ev[] = [];
    const add = (t: number, run: () => void) => events.push({ t, run });

    const unitPos = (u: SceneUnit, side: "att" | "def", t: number) => {
      if (u.air) {
        // Aircraft sweep across the sky.
        const k = Math.max(0, Math.min(1, (t - u.delay) / 2.6));
        const x = side === "att" ? -0.15 + k * 1.3 : 1.15 - k * 1.3;
        return { x, y: u.y + Math.sin(t * 3 + u.delay) * 0.01 };
      }
      const k = Math.max(0, Math.min(1, (t - u.delay) / (side === "att" ? 1.4 : 0.8)));
      const ease = 1 - Math.pow(1 - k, 3);
      const startX = side === "att" ? -0.25 : 1.25;
      const bob = scene.sea
        ? Math.sin(t * 2.2 + u.x * 9) * 0.008
        : k < 1
          ? Math.abs(Math.sin(t * 9 + u.x * 7)) * -0.006
          : 0;
      return { x: startX + (u.x - startX) * ease, y: u.y + bob };
    };

    const muzzle = (u: SceneUnit, side: "att" | "def", t: number) => {
      const p = unitPos(u, side, t);
      const dir = side === "att" ? 1 : -1;
      return { x: p.x + dir * u.size * 0.42 * (H / W), y: p.y - u.size * 0.12 };
    };

    const explode = (x: number, y: number, big: boolean) => {
      const n = reduced ? 6 : big ? 26 : 14;
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
      for (let i = 0; i < (big ? 6 : 3); i++) {
        particles.push({
          kind: "smoke",
          x: x + (rand() - 0.5) * 0.04,
          y,
          vx: (rand() - 0.5) * 0.03,
          vy: -0.04 - rand() * 0.05,
          age: 0,
          life: 1.6 + rand() * 1.2,
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
        life: big ? 1.2 : 0.7,
        size: big ? 0.06 : 0.035,
      });
      if (!reduced) shake = Math.min(1, shake + (big ? 0.9 : 0.45));
      light = Math.min(1, light + (big ? 0.8 : 0.4));
    };

    const fire = (shooter: SceneUnit, side: "att" | "def", targets: SceneUnit[], at: number) => {
      const target = targets.length ? targets[Math.floor(rand() * targets.length)] : null;
      const heavy = [
        "artillery",
        "howitzer",
        "railgun",
        "battleship",
        "cruiser",
        "heavy_tank",
        "tank",
        "amph_tank",
        "destroyer",
        "aa_gun",
      ].includes(shooter.type);
      add(at, () => {
        const m = muzzle(shooter, side, at);
        particles.push({
          kind: "flash",
          x: m.x,
          y: m.y,
          vx: 0,
          vy: 0,
          age: 0,
          life: 0.12,
          size: heavy ? 0.04 : 0.02,
        });
        const tp = target
          ? unitPos(target, side === "att" ? "def" : "att", at + 0.4)
          : { x: side === "att" ? 0.8 : 0.2, y: 0.72 };
        if (heavy) {
          particles.push({
            kind: "shell",
            x: m.x,
            y: m.y,
            sx: m.x,
            sy: m.y,
            tx: tp.x + (rand() - 0.5) * 0.05,
            ty: tp.y + 0.02,
            vx: 0,
            vy: 0,
            age: 0,
            life: 0.7,
            size: 0.006,
            big: shooter.type === "railgun" || shooter.type === "battleship",
          });
          sfxShell(0);
        } else {
          for (let i = 0; i < 3; i++) {
            particles.push({
              kind: "tracer",
              x: m.x,
              y: m.y,
              sx: m.x,
              sy: m.y,
              tx: tp.x + (rand() - 0.5) * 0.06,
              ty: tp.y - rand() * 0.05,
              vx: 0,
              vy: 0,
              age: -i * 0.07,
              life: 0.28,
              size: 0.003,
              color: side === "att" ? "#ffe28a" : "#ffb070",
            });
          }
          sfxBurst(0, 3 + Math.floor(rand() * 3));
        }
        if (target) target.hitAt = at + (heavy ? 0.7 : 0.3);
      });
    };

    add(0.35, () => sfxCharge(0));
    const ground = (us: SceneUnit[]) => us.filter((u) => !u.air);
    const volleys = reduced ? 4 : 14;
    for (let i = 0; i < volleys; i++) {
      const t = 1.0 + (i / volleys) * 2.4 + rand() * 0.12;
      const shooters = ground(att);
      if (shooters.length)
        fire(shooters[Math.floor(rand() * shooters.length)], "att", ground(def), t);
      const backs = ground(def);
      if (backs.length && rand() < 0.75)
        fire(
          backs[Math.floor(rand() * backs.length)],
          "def",
          ground(att),
          t + 0.12 + rand() * 0.15,
        );
      else if (!backs.length && rand() < 0.4) add(t + 0.1, () => sfxGunshot(0, 0.2));
    }
    // Bombing runs by attacking aircraft.
    att
      .filter((u) => u.air)
      .forEach((plane, i) => {
        add(plane.delay, () => sfxFlyby(0, 2.4));
        for (let b = 0; b < 3; b++) {
          const t = plane.delay + 0.9 + b * 0.22 + i * 0.05;
          add(t, () => {
            const p = unitPos(plane, "att", t);
            particles.push({
              kind: "bomb",
              x: p.x,
              y: p.y + 0.03,
              vx: 0.08,
              vy: 0.05,
              age: 0,
              life: 2,
              size: 0.006,
            });
          });
        }
      });
    def.filter((u) => u.air).forEach((plane) => add(plane.delay, () => sfxFlyby(0, 2.4)));
    // The decisive barrage.
    add(DURATION - 0.95, () => {
      explode(0.72, 0.72, true);
      sfxExplosion(0, 1.3);
    });
    add(DURATION - 0.75, () => {
      explode(0.3, 0.74, true);
      sfxExplosion(0, 1.1);
    });

    // ----- Drawing -----
    const drawUnit = (u: SceneUnit, side: "att" | "def", t: number, color: string) => {
      if (t < u.delay) return;
      const p = unitPos(u, side, t);
      const s = u.size * H;
      const px = p.x * W;
      const py = p.y * H;
      const hit = u.hitAt && t > u.hitAt && t < u.hitAt + 0.25;
      ctx.save();
      // Nation-colored glow beneath the miniature.
      if (!u.air) {
        const g = ctx.createRadialGradient(px, py + s * 0.38, 0, px, py + s * 0.38, s * 0.7);
        g.addColorStop(0, color + "aa");
        g.addColorStop(1, color + "00");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(px, py + s * 0.38, s * 0.7, s * 0.18, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.translate(px + (hit ? (rand() - 0.5) * 6 : 0), py);
      if (side === "def") ctx.scale(-1, 1);
      if (u.air) ctx.rotate(side === "att" ? -0.08 : -0.08);
      if (u.img.complete && u.img.naturalWidth) {
        ctx.filter = hit ? "brightness(2.2) sepia(1)" : `brightness(${0.85 + light * 0.6})`;
        ctx.drawImage(u.img, -s / 2, -s / 2, s, s);
      }
      ctx.restore();
    };

    const drawScenery = (t: number) => {
      // Sky: smoky dusk lit by the fighting.
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
        // Distant ridge.
        ctx.fillStyle = "#1d1611";
        ctx.beginPath();
        ctx.moveTo(0, H * 0.62);
        ridge.forEach((r, i) => ctx.lineTo((i / (ridge.length - 1)) * W, H * (0.5 + r * 0.08)));
        ctx.lineTo(W, H * 0.62);
        ctx.fill();
        // Burning ruins on the ridge.
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

    const drawParticles = (dt: number) => {
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.age += dt;
        if (p.age < 0) continue;
        const k = p.age / p.life;
        if (k >= 1) {
          if (p.kind === "shell" || p.kind === "tracer") {
            if (p.kind === "shell") explode(p.tx!, p.ty!, !!p.big);
            else if (rand() < 0.3) explode(p.tx!, p.ty!, false);
          }
          particles.splice(i, 1);
          continue;
        }
        ctx.save();
        if (p.kind === "tracer") {
          const x = p.sx! + (p.tx! - p.sx!) * k;
          const y = p.sy! + (p.ty! - p.sy!) * k;
          const bx = p.sx! + (p.tx! - p.sx!) * Math.max(0, k - 0.18);
          const by = p.sy! + (p.ty! - p.sy!) * Math.max(0, k - 0.18);
          ctx.strokeStyle = p.color!;
          ctx.lineWidth = 2;
          ctx.shadowColor = p.color!;
          ctx.shadowBlur = 8;
          ctx.beginPath();
          ctx.moveTo(bx * W, by * H);
          ctx.lineTo(x * W, y * H);
          ctx.stroke();
        } else if (p.kind === "shell") {
          const x = p.sx! + (p.tx! - p.sx!) * k;
          const arc = Math.sin(k * Math.PI) * 0.28;
          const y = p.sy! + (p.ty! - p.sy!) * k - arc;
          ctx.fillStyle = "#fff3c4";
          ctx.shadowColor = "#ffcf6a";
          ctx.shadowBlur = 12;
          ctx.beginPath();
          ctx.arc(x * W, y * H, 3, 0, Math.PI * 2);
          ctx.fill();
        } else if (p.kind === "bomb") {
          p.vy += dt * 0.9;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          ctx.fillStyle = "#14100c";
          ctx.beginPath();
          ctx.ellipse(p.x * W, p.y * H, 3, 6, 0.3, 0, Math.PI * 2);
          ctx.fill();
          if (p.y > 0.7 + (p.x % 0.05)) {
            explode(p.x, p.y, true);
            sfxExplosion(0, 1);
            particles.splice(i, 1);
          }
        } else if (p.kind === "flash") {
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
        } else if (p.kind === "spark") {
          p.vy += dt * 0.9;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          ctx.fillStyle = `rgba(255,${180 - k * 120},60,${1 - k})`;
          ctx.fillRect(p.x * W, p.y * H, p.size * H, p.size * H);
        } else if (p.kind === "smoke") {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          const r = p.size * H * (1 + k * 2.2);
          ctx.fillStyle = `rgba(48,42,38,${0.55 * (1 - k)})`;
          ctx.beginPath();
          ctx.arc(p.x * W, p.y * H, r, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
    };

    let start = 0;
    let last = 0;
    let raf = 0;
    const frame = (now: number) => {
      if (!start) start = last = now;
      const t = (now - start) / 1000;
      const dt = Math.min(0.05, (now - last) / 1000);
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
      // Back-to-front: aircraft, back ranks, front ranks.
      for (const u of [...att, ...def].filter((u) => u.air))
        drawUnit(
          u,
          att.includes(u) ? "att" : "def",
          t,
          att.includes(u) ? scene.attacker.color : scene.defender.color,
        );
      const groundUnits = [
        ...att.map((u) => [u, "att"] as const),
        ...def.map((u) => [u, "def"] as const),
      ]
        .filter(([u]) => !u.air)
        .sort((a, b) => a[0].y - b[0].y);
      for (const [u, side] of groundUnits)
        drawUnit(u, side, t, side === "att" ? scene.attacker.color : scene.defender.color);
      drawParticles(dt);
      // Vignette.
      const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.95);
      v.addColorStop(0, "rgba(0,0,0,0)");
      v.addColorStop(1, "rgba(0,0,0,0.6)");
      ctx.fillStyle = v;
      ctx.fillRect(-20, -20, W + 40, H + 40);
      ctx.restore();
      // Closing white-out.
      const flashT = t - (DURATION - 0.45);
      if (flashT > 0) {
        ctx.fillStyle = `rgba(255,244,225,${Math.min(1, flashT / 0.25) * 0.85})`;
        ctx.fillRect(0, 0, W, H);
      }
      if (t >= DURATION) {
        setLeaving(true);
        window.setTimeout(() => doneRef.current(), 350);
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const skip = () => {
      cancelAnimationFrame(raf);
      setLeaving(true);
      window.setTimeout(() => doneRef.current(), 250);
    };
    window.addEventListener("keydown", skip);
    canvas.parentElement?.addEventListener("pointerdown", skip);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", skip);
      canvas.parentElement?.removeEventListener("pointerdown", skip);
    };
  }, [scene]);

  const a = scene.attacker;
  const d = scene.defender;
  return (
    <div
      role="dialog"
      aria-label={`Battle of ${scene.title}`}
      className={
        "fixed inset-0 z-[58] cursor-pointer select-none overflow-hidden bg-black transition-opacity duration-300 " +
        (leaving ? "opacity-0" : "animate-[cutscene-in_0.35s_ease-out]")
      }
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      {/* Letterbox bars with the battle's title card. */}
      <div className="absolute inset-x-0 top-0 flex h-[14%] min-h-16 animate-[bar-top_0.45s_ease-out] flex-col items-center justify-end bg-black pb-2 pt-[env(safe-area-inset-top)]">
        <div className="text-[10px] uppercase tracking-[0.5em] text-amber-200/70 sm:text-xs">
          ⚔ Battle of
        </div>
        <div className="animate-[title-in_0.9s_ease-out] px-4 text-center font-serif text-2xl font-bold uppercase tracking-[0.18em] text-amber-50 sm:text-4xl">
          {scene.title}
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-0 flex h-[14%] min-h-16 animate-[bar-bottom_0.45s_ease-out] items-center justify-center gap-3 bg-black px-4 pb-[env(safe-area-inset-bottom)] font-serif text-sm sm:gap-6 sm:text-xl">
        <span className="truncate font-bold" style={{ color: lighten(a.color) }}>
          {a.flag} {a.name}
        </span>
        <span className="text-xs uppercase tracking-[0.3em] text-amber-200/60">vs</span>
        <span className="truncate font-bold" style={{ color: lighten(d.color) }}>
          {d.name} {d.flag}
        </span>
      </div>
      <div className="absolute bottom-[15%] right-4 text-[10px] uppercase tracking-widest text-white/50">
        Click to skip
      </div>
    </div>
  );
}

/** Nation colors are tuned for parchment; brighten them for black bars. */
function lighten(hex: string): string {
  return `color-mix(in oklab, ${hex} 70%, white)`;
}
