import type { GameState, Territory } from "./types";
import { TURN_SECONDS } from "./types";
import { createInitialState } from "./initialState";

/**
 * Campaign persistence: the live game is mirrored into localStorage so a
 * refresh (or closing the tab) never loses the war. Static map geometry
 * (polygon points, centroids, adjacency) is stripped on save and re-merged
 * from a fresh initial state on load, keeping the payload small and letting
 * map updates self-heal.
 */

const SAVE_KEY = "aa-campaign-save-v1";
const SAVE_VERSION = 1;

/** Minimum number of territories for a save to be considered valid. */
const MIN_TERRITORIES = 20;

export interface SavedSnapshot {
  turnSecondsLeft: number;
  paused: boolean;
  savedAt: number;
}

export function slimGame(g: GameState): GameState {
  const territories: Record<string, Territory> = {};
  for (const [id, t] of Object.entries(g.territories)) {
    // Drop the heavy static geometry; ids are the join key on load.
    territories[id] = { ...t, points: "", centroid: { x: 0, y: 0 } };
  }
  return { ...g, territories };
}

/**
 * Re-attach static map geometry to a slimmed game (from a save or from a
 * multiplayer snapshot) and heal any per-nation records added since.
 */
let freshCache: GameState | null = null;

export function rehydrateGame(slim: GameState): GameState | null {
  // Geometry is static, so one fresh map serves every rehydration.
  const fresh = (freshCache ??= createInitialState());
  const territories: Record<string, Territory> = {};
  for (const [id, t] of Object.entries(slim.territories as Record<string, Territory>)) {
    const base = fresh.territories[id];
    if (!base) continue;
    territories[id] = {
      ...t,
      points: base.points,
      centroid: base.centroid,
      adjacent: base.adjacent,
      terrain: base.terrain,
      canal: base.canal,
      // Sea tiles are procedural — keep their generated labels current.
      name: base.isSea ? base.name : t.name,
    };
  }
  // Map expansions keep old ids, so existing campaigns gain newly subdivided
  // regions as neutral empty territories without losing their saved armies.
  for (const [id, base] of Object.entries(fresh.territories)) {
    if (!territories[id]) territories[id] = structuredClone(base);
  }
  if (Object.keys(territories).length < MIN_TERRITORIES) return null;
  const game: GameState = { ...slim, territories };
  // Heal per-nation counters added after a save was written.
  const NATION_RECORDS = [
    "treasury",
    "vp",
    "infirmaryPool",
    "capitalLosses",
    "spies",
    "blackout",
    "blueprints",
    "abombs",
    "ceasefire",
  ] as const;
  const freshGame = fresh as unknown as Record<string, unknown>;
  const liveGame = game as unknown as Record<string, unknown>;
  for (const key of NATION_RECORDS) {
    const base = freshGame[key] as Record<string, number> | undefined;
    if (!base) continue;
    const saved = liveGame[key] as Record<string, number> | undefined;
    liveGame[key] = { ...base, ...(saved ?? {}) };
  }
  return game;
}

/** Write the campaign to localStorage. Never throws. */
export function saveCampaign(game: GameState, turnSecondsLeft: number, paused: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({
        version: SAVE_VERSION,
        savedAt: Date.now(),
        turnSecondsLeft,
        paused,
        game: slimGame(game),
      }),
    );
  } catch {
    // Storage full or blocked — the game keeps running without a save.
  }
}

export function clearSavedCampaign(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Restore a saved campaign, re-attaching map geometry from the current
 * initial state. Returns null when there is no save or it no longer fits
 * the map (e.g. territories were redrawn since).
 */
export function loadSavedCampaign(): (SavedSnapshot & { game: GameState }) | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data?.version !== SAVE_VERSION || !data.game?.territories || !data.game.currentPlayer) {
      return null;
    }
    const game = rehydrateGame(data.game as GameState);
    if (!game) return null;
    return {
      game,
      turnSecondsLeft:
        typeof data.turnSecondsLeft === "number" && data.turnSecondsLeft > 0
          ? data.turnSecondsLeft
          : TURN_SECONDS,
      paused: !!data.paused,
      savedAt: typeof data.savedAt === "number" ? data.savedAt : 0,
    };
  } catch {
    return null;
  }
}
