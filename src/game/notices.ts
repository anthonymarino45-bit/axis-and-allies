import { create } from "zustand";

/** Short pop-up messages for the player at this screen. */
export interface Notice {
  id: string;
  text: string;
  tone: "good" | "bad" | "info";
}

interface NoticeStore {
  notices: Notice[];
  push: (text: string, tone?: Notice["tone"], ms?: number) => void;
  dismiss: (id: string) => void;
}

export const useNotices = create<NoticeStore>((set, get) => ({
  notices: [],
  push: (text, tone = "info", ms = 6000) => {
    const id = `${Date.now()}${Math.random()}`;
    // Don't stack the same message twice.
    const rest = get().notices.filter((n) => n.text !== text);
    set({ notices: [...rest, { id, text, tone }].slice(-4) });
    window.setTimeout(() => get().dismiss(id), ms);
  },
  dismiss: (id) => set({ notices: get().notices.filter((n) => n.id !== id) }),
}));
