import { useEffect, useRef, useState } from "react";
import { create } from "zustand";
import { useGame } from "@/game/store";
import { useNet } from "@/game/multiplayer";
import { useNotices } from "@/game/notices";
import { NATIONS, type Nation } from "@/game/types";
import {
  deleteSlot,
  exportSlot,
  importSaveFile,
  listSaveSlots,
  loadFromSlot,
  renameSlot,
  saveToSlot,
  type SaveSlotInfo,
} from "@/game/persistence";

/** Open / close the Saves window from anywhere. */
export const useSavesPanel = create<{ open: boolean; setOpen: (o: boolean) => void }>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));

function defaultName(): string {
  const g = useGame.getState().game;
  const n = NATIONS[g.currentPlayer as Nation];
  return `Day ${g.day}, turn ${g.turn} — ${n?.name ?? ""} to move`;
}

/** Save, load, rename, delete, download and import campaigns. */
export function SavesPanel() {
  const open = useSavesPanel((s) => s.open);
  const setOpen = useSavesPanel((s) => s.setOpen);
  const mode = useNet((s) => s.mode);
  const aiBusy = useGame((s) => s.aiTurnInProgress);
  const [slots, setSlots] = useState<SaveSlotInfo[]>([]);
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameText, setRenameText] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmLoad, setConfirmLoad] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const notice = useNotices((s) => s.push);
  const guest = mode === "guest";

  const refresh = () => setSlots(listSaveSlots());
  useEffect(() => {
    if (open) {
      refresh();
      setName(defaultName());
      setConfirmDelete(null);
      setConfirmLoad(null);
    }
  }, [open]);

  if (!open) return null;

  const save = (overwriteId?: string) => {
    const { game, turnSecondsLeft, paused } = useGame.getState();
    const label = overwriteId ? (slots.find((s) => s.id === overwriteId)?.name ?? name) : name;
    const r = saveToSlot(label, game, turnSecondsLeft, paused, overwriteId);
    if (r.ok) notice(`💾 Saved “${label}”.`, "good", 4000);
    else notice(r.error, "bad", 8000);
    refresh();
  };

  const load = (id: string) => {
    const data = loadFromSlot(id);
    if (!data) {
      notice("That save couldn't be read — it may be from an older map.", "bad", 8000);
      return;
    }
    useGame.getState().loadCampaign(data.game, data.turnSecondsLeft, data.paused);
    notice(`📂 Loaded “${data.name}”.`, "good", 4000);
    setOpen(false);
  };

  const download = (id: string) => {
    const file = exportSlot(id);
    if (!file) return;
    const blob = new Blob([file.text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${file.name.replace(/[^\w\- ]+/g, "").trim() || "campaign"}.aa-save.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const importFile = async (f: File) => {
    const r = importSaveFile(await f.text());
    if (r.ok) notice(`📥 Imported “${f.name}”.`, "good", 4000);
    else notice(r.error, "bad", 8000);
    refresh();
  };

  const loadBlocked = guest
    ? "Only the host can load a game into this room. Leave the room to load it yourself."
    : aiBusy
      ? "Wait for the AI to finish its turn."
      : null;

  return (
    <div
      className="fixed inset-0 z-[55] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        role="dialog"
        aria-labelledby="saves-title"
        className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-lg border border-border bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <span className="text-lg">💾</span>
          <h2 id="saves-title" className="text-sm font-bold uppercase tracking-wider">
            Saved Games
          </h2>
          <button
            type="button"
            aria-label="Close saved games"
            onClick={() => setOpen(false)}
            className="ml-auto h-7 w-7 rounded text-sm font-semibold hover:bg-muted"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-4 overflow-y-auto p-4 text-sm">
          <form
            className="rounded-md border border-border bg-card p-3"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <label htmlFor="save-name" className="text-xs font-semibold">
              Save this game as
            </label>
            <div className="mt-1 flex gap-2">
              <input
                id="save-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
                className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1.5"
              />
              <button
                type="submit"
                className="rounded bg-primary px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-primary-foreground"
              >
                Save
              </button>
            </div>
            {guest && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                Saves a copy of the host's game to this browser — load it later, or host it yourself.
              </p>
            )}
          </form>

          <div>
            <div className="mb-1 flex items-baseline justify-between">
              <span className="font-semibold">Your saves</span>
              <span className="text-[10px] text-muted-foreground">Stored in this browser</span>
            </div>
            {slots.length === 0 ? (
              <div className="rounded border border-dashed border-border p-3 text-xs text-muted-foreground">
                No saved games yet. Save the current game above, or import a save file below.
              </div>
            ) : (
              <ul className="space-y-2">
                {slots.map((s) => {
                  const n = NATIONS[s.currentPlayer as Nation];
                  return (
                    <li key={s.id} className="rounded border border-border p-2">
                      {renaming === s.id ? (
                        <form
                          className="flex gap-2"
                          onSubmit={(e) => {
                            e.preventDefault();
                            renameSlot(s.id, renameText);
                            setRenaming(null);
                            refresh();
                          }}
                        >
                          <input
                            id={`rename-${s.id}`}
                            aria-label="New name"
                            value={renameText}
                            onChange={(e) => setRenameText(e.target.value)}
                            maxLength={60}
                            autoFocus
                            className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1"
                          />
                          <button type="submit" className="rounded border border-border px-2 text-xs hover:bg-muted">
                            OK
                          </button>
                        </form>
                      ) : (
                        <div className="truncate font-semibold" title={s.name}>
                          {s.name}
                        </div>
                      )}
                      <div className="text-[11px] text-muted-foreground">
                        Day {s.day}, turn {s.turn} · {n ? `${n.flag} ${n.name} to move` : ""} ·{" "}
                        {new Date(s.savedAt).toLocaleString()}
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {confirmLoad === s.id ? (
                          <>
                            <span className="self-center text-[11px]">Replace the current game?</span>
                            <button
                              type="button"
                              onClick={() => load(s.id)}
                              className="rounded bg-primary px-2 py-1 text-[11px] font-bold text-primary-foreground"
                            >
                              Yes, load
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmLoad(null)}
                              className="rounded border border-border px-2 py-1 text-[11px] hover:bg-muted"
                            >
                              Cancel
                            </button>
                          </>
                        ) : confirmDelete === s.id ? (
                          <>
                            <span className="self-center text-[11px]">Delete this save?</span>
                            <button
                              type="button"
                              onClick={() => {
                                deleteSlot(s.id);
                                setConfirmDelete(null);
                                refresh();
                              }}
                              className="rounded bg-destructive px-2 py-1 text-[11px] font-bold text-white"
                            >
                              Delete
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDelete(null)}
                              className="rounded border border-border px-2 py-1 text-[11px] hover:bg-muted"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => setConfirmLoad(s.id)}
                              disabled={!!loadBlocked}
                              title={loadBlocked ?? "Load this game"}
                              className="rounded bg-primary px-2 py-1 text-[11px] font-bold text-primary-foreground disabled:opacity-40"
                            >
                              Load
                            </button>
                            <button
                              type="button"
                              onClick={() => save(s.id)}
                              title="Save the current game over this one"
                              className="rounded border border-border px-2 py-1 text-[11px] hover:bg-muted"
                            >
                              Save over
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setRenaming(s.id);
                                setRenameText(s.name);
                              }}
                              className="rounded border border-border px-2 py-1 text-[11px] hover:bg-muted"
                            >
                              Rename
                            </button>
                            <button
                              type="button"
                              onClick={() => download(s.id)}
                              title="Download as a file to keep or share"
                              className="rounded border border-border px-2 py-1 text-[11px] hover:bg-muted"
                            >
                              Download
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDelete(s.id)}
                              className="rounded border border-border px-2 py-1 text-[11px] text-destructive hover:bg-muted"
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="rounded-md border border-border bg-card p-3">
            <div className="text-xs font-semibold">Import a save file</div>
            <p className="text-[11px] text-muted-foreground">
              Add a game someone sent you, or one you downloaded on another computer.
            </p>
            <input
              ref={fileRef}
              id="import-save"
              type="file"
              accept=".json,application/json"
              className="mt-2 block w-full text-xs"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importFile(f);
                e.target.value = "";
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
