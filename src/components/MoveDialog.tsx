import { useGame } from "@/game/store";
import { UNIT_STATS, type UnitType } from "@/game/types";

export function MoveDialog() {
  const game = useGame((s) => s.game);
  const moveDialog = useGame((s) => s.moveDialog);
  const setMoveCount = useGame((s) => s.setMoveCount);
  const confirmMove = useGame((s) => s.confirmMove);
  const cancelMove = useGame((s) => s.cancelMove);

  if (!moveDialog) return null;

  const to = game.territories[moveDialog.targetId];
  const types = Object.keys(moveDialog.idsByType) as UnitType[];
  const totalChosen = Object.values(moveDialog.chosen).reduce((a, b) => a + b, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-2xl">
        <header>
          <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            Deployment
          </div>
          <h2 className="font-serif text-2xl font-bold">
            Move to {to?.name ?? "—"}
          </h2>
        </header>

        <div className="mt-4 space-y-3">
          {types.map((type) => {
            const s = UNIT_STATS[type];
            const available = moveDialog.idsByType[type].length;
            const chosen = moveDialog.chosen[type] ?? 0;
            return (
              <div
                key={type}
                className="flex items-center justify-between rounded border border-border bg-parchment/40 px-3 py-2"
              >
                <div>
                  <div className="text-sm font-semibold">{s.label}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {s.attack}/{s.defense} · Move {s.move}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setMoveCount(type, Math.max(0, chosen - 1))}
                    disabled={chosen <= 0}
                    className="h-7 w-7 rounded border border-border bg-secondary text-sm font-bold hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    −
                  </button>
                  <span className="w-8 text-center text-sm font-bold">
                    {chosen}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setMoveCount(type, Math.min(available, chosen + 1))
                    }
                    disabled={chosen >= available}
                    className="h-7 w-7 rounded border border-border bg-secondary text-sm font-bold hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    +
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-4 text-center text-xs text-muted-foreground">
          Sending {totalChosen} unit{totalChosen !== 1 ? "s" : ""}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={cancelMove}
            className="rounded border border-border bg-secondary px-3 py-2 text-xs font-semibold uppercase tracking-wider hover:bg-accent"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirmMove}
            disabled={totalChosen === 0}
            className="rounded border border-border bg-primary px-4 py-2 text-sm font-bold uppercase tracking-widest text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Confirm Move
          </button>
        </div>
      </div>
    </div>
  );
}
