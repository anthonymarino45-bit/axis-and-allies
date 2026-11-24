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

// ---------------------------------------------------------------------------
// Named save slots — any number of campaigns, kept in this browser, plus
// export/import as a file to move a save between computers or players.
// ---------------------------------------------------------------------------

const SLOTS_INDEX_KEY = "aa-save-slots-v1";
const slotKey = (id: string) => `aa-save-slot-${id}`;

export interface SaveSlotInfo {
  id: string;
  name: string;
  savedAt: number;
  turn: number;
  day: number;
  currentPlayer: string;
}

interface SlotFile {
  format: "aa-campaign-save";
  version: number;
  name: string;
  savedAt: number;
  turnSecondsLeft: number;
  paused: boolean;
  game: GameState;
}

function readIndex(): SaveSlotInfo[] {
  try {
    const list = JSON.parse(window.localStorage.getItem(SLOTS_INDEX_KEY) ?? "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeIndex(list: SaveSlotInfo[]): void {
  window.localStorage.setItem(SLOTS_INDEX_KEY, JSON.stringify(list));
}

export function listSaveSlots(): SaveSlotInfo[] {
  if (typeof window === "undefined") return [];
  return readIndex().sort((a, b) => b.savedAt - a.savedAt);
}

/**
 * Save the game to a slot (a new one, or over `overwriteId`). Returns an
 * error message when the browser refuses (usually storage full).
 */
export function saveToSlot(
  name: string,
  game: GameState,
  turnSecondsLeft: number,
  paused: boolean,
  overwriteId?: string,
): { ok: true; id: string } | { ok: false; error: string } {
  const id = overwriteId ?? `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const savedAt = Date.now();
  const file: SlotFile = {
    format: "aa-campaign-save",
    version: SAVE_VERSION,
    name: name.trim() || "Untitled campaign",
    savedAt,
    turnSecondsLeft,
    paused,
    game: slimGame(game),
  };
  try {
    window.localStorage.setItem(slotKey(id), JSON.stringify(file));
    const info: SaveSlotInfo = {
      id,
      name: file.name,
      savedAt,
      turn: game.turn,
      day: game.day,
      currentPlayer: game.currentPlayer,
    };
    writeIndex([...readIndex().filter((s) => s.id !== id), info]);
    return { ok: true, id };
  } catch {
    return {
      ok: false,
      error: "This browser's storage is full. Delete or download an old save, then try again.",
    };
  }
}

function parseSlotFile(text: string): SlotFile | null {
  try {
    const data = JSON.parse(text);
    if (data?.format !== "aa-campaign-save" || !data.game?.territories) return null;
    return data as SlotFile;
  } catch {
    return null;
  }
}

export function loadFromSlot(
  id: string,
): { game: GameState; turnSecondsLeft: number; paused: boolean; name: string } | null {
  try {
    const file = parseSlotFile(window.localStorage.getItem(slotKey(id)) ?? "");
    if (!file) return null;
    const game = rehydrateGame(file.game);
    if (!game) return null;
    return {
      game,
      turnSecondsLeft: file.turnSecondsLeft > 0 ? file.turnSecondsLeft : TURN_SECONDS,
      paused: !!file.paused,
      name: file.name,
    };
  } catch {
    return null;
  }
}

export function deleteSlot(id: string): void {
  try {
    window.localStorage.removeItem(slotKey(id));
    writeIndex(readIndex().filter((s) => s.id !== id));
  } catch {
    // ignore
  }
}

export function renameSlot(id: string, name: string): void {
  try {
    const file = parseSlotFile(window.localStorage.getItem(slotKey(id)) ?? "");
    if (!file) return;
    file.name = name.trim() || file.name;
    window.localStorage.setItem(slotKey(id), JSON.stringify(file));
    writeIndex(readIndex().map((s) => (s.id === id ? { ...s, name: file.name } : s)));
  } catch {
    // ignore
  }
}

/** The save as a JSON file's text, for downloading. */
export function exportSlot(id: string): { name: string; text: string } | null {
  try {
    const text = window.localStorage.getItem(slotKey(id));
    const file = text ? parseSlotFile(text) : null;
    return file && text ? { name: file.name, text } : null;
  } catch {
    return null;
  }
}

/** Add a downloaded save file as a new slot. */
export function importSaveFile(text: string): { ok: true; id: string } | { ok: false; error: string } {
  const file = parseSlotFile(text);
  if (!file) return { ok: false, error: "That file isn't an A&A campaign save." };
  const game = rehydrateGame(file.game);
  if (!game) return { ok: false, error: "That save doesn't fit this version of the map." };
  return saveToSlot(file.name, game, file.turnSecondsLeft, file.paused);
}
