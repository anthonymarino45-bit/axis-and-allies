import { useGame } from "@/game/store";
import {
  NATIONS,
  PLAYER_ORDER,
  vpBreakdown,
  type Nation,
} from "@/game/types";

/** Full-screen end-of-war screen: winner, per-nation VP breakdown, campaign summary. */
export function VictoryScreen() {
  const game = useGame((s) => s.game);
  const reset = useGame((s) => s.reset);

  if (!game.gameOver || !game.winner) return null;

  const winner = game.winner;
  const standings = [...PLAYER_ORDER].sort(
    (a, b) => vpBreakdown(game, b).total - vpBreakdown(game, a).total,
  );
  const winInfo = NATIONS[winner];

  const rows = standings.map((n: Nation) => {
    const info = NATIONS[n];
    const b = vpBreakdown(game, n);
    return { nation: n, info, b, isWinner: n === winner };
  });

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-auto rounded-lg border-2 border-primary bg-background shadow-2xl">
        {/* Winner banner */}
        <div className="flex items-center gap-4 border-b border-border bg-primary/10 px-6 py-5">
          <span className="text-5xl leading-none">{winInfo.flag}</span>
          <div>
            <div className="text-xs uppercase tracking-widest text-muted-foreground">
              The war is over
            </div>
            <div className="text-2xl font-bold" style={{ color: winInfo.color }}>
              {winInfo.name} wins
            </div>
            <div className="text-sm text-muted-foreground">
              {vpBreakdown(game, winner).total} victory points · campaign day {game.day} · turn {game.turn}
            </div>
          </div>
          <span className="ml-auto text-5xl leading-none">🏆</span>
        </div>

        {/* Standings */}
        <div className="px-6 py-4">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Final standings
          </h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-1 pr-2 font-medium">Nation</th>
                <th className="py-1 px-2 text-right font-medium">Prov.</th>
                <th className="py-1 px-2 text-right font-medium">Bldgs</th>
                <th className="py-1 px-2 text-right font-medium">Earned</th>
                <th className="py-1 px-2 text-right font-medium">Capital</th>
                <th className="py-1 pl-2 text-right font-medium">Total VP</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ nation, info, b, isWinner }, i) => (
                <tr
                  key={nation}
                  className={
                    "border-t border-border/60" +
                    (isWinner ? " bg-primary/10 font-semibold" : "")
                  }
                >
                  <td className="py-1.5 pr-2">
                    <span className="mr-1.5 text-xs text-muted-foreground">{i + 1}.</span>
                    <span className="mr-1.5">{info.flag}</span>
                    <span style={{ color: info.color }}>{info.name}</span>
                  </td>
                  <td className="py-1.5 px-2 text-right tabular-nums" title="Provinces held × 1 VP">
                    {b.provinceCount} <span className="text-muted-foreground">/ {b.provinces}</span>
                  </td>
                  <td className="py-1.5 px-2 text-right tabular-nums" title="VP for held structures">
                    {b.structures}
                  </td>
                  <td className="py-1.5 px-2 text-right tabular-nums" title="VP earned in play">
                    {b.earned}
                  </td>
                  <td
                    className="py-1.5 px-2 text-right tabular-nums"
                    title="Capital capture penalties"
                  >
                    {b.capitalPenalty !== 0 ? b.capitalPenalty : "—"}
                  </td>
                  <td className="py-1.5 pl-2 text-right tabular-nums">{b.total}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-3 text-xs leading-relaxed text-muted-foreground">
            VP scoring: 1 per province held, structure VP while held, VP earned in play
            (destroyed and captured structures, minus points sold), and −10 / −20 for
            having your capital captured once / twice or more.
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between gap-3 border-t border-border px-6 py-4">
          <span className="text-xs text-muted-foreground">
            Thanks for playing — the map is yours.
          </span>
          <button
            type="button"
            onClick={reset}
            className="rounded border border-primary bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            Start a new campaign
          </button>
        </div>
      </div>
    </div>
  );
}
