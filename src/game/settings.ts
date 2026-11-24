import { create } from "zustand";

/** Per-player preferences, remembered in this browser. */
interface Settings {
  /** Play a cinematic when a battle starts. */
  cutscenes: boolean;
  /** Master volume, 0–100 (music and battle sounds). */
  volume: number;
  setCutscenes: (on: boolean) => void;
  setVolume: (v: number) => void;
}

const KEY = "aa-settings-v1";

function load(): Partial<Settings> {
  try {
    return JSON.parse(window.localStorage.getItem(KEY) ?? "{}");
  } catch {
    return {};
  }
}

function save(s: Pick<Settings, "cutscenes" | "volume">) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Storage blocked: settings last for this visit only.
  }
}

const initial = typeof window === "undefined" ? {} : load();

export const useSettings = create<Settings>((set, get) => ({
  cutscenes: initial.cutscenes ?? true,
  volume: typeof initial.volume === "number" ? initial.volume : 40,
  setCutscenes: (on) => {
    set({ cutscenes: on });
    save({ cutscenes: on, volume: get().volume });
  },
  setVolume: (v) => {
    set({ volume: v });
    save({ cutscenes: get().cutscenes, volume: v });
  },
}));
