import { useEffect } from "react";
import { useNotices } from "@/game/notices";
import { useGame } from "@/game/store";
import { useNet } from "@/game/multiplayer";
import { AI_NATIONS, CONTRACT_KINDS, NATIONS, type Contract, type Nation } from "@/game/types";

/**
 * Diplomacy, as it happens:
 *  - an offer made to a nation played at this screen pops up with Accept /
 *    Decline (online, on the recipient's own screen, even off-turn)
 *  - whoever made an offer is told when it is signed or refused, whether the
 *    answer came from the AI or another player
 */

/** Is this nation played by the person at this screen? */
function playedHere(n: Nation): boolean {
  const net = useNet.getState();
  if (net.mode === "local") return !AI_NATIONS.includes(n);
  return net.seats[n] === net.myId;
}

function describe(c: Contract): string {
  const spec = CONTRACT_KINDS[c.kind];
  return `${spec.icon} ${spec.label} (${c.turns} turn${c.turns === 1 ? "" : "s"})`;
}

export function DiplomacyNotices() {
  const contracts = useGame((s) => s.game.contracts);
  const respond = useGame((s) => s.respondContract);
  // Re-render when seats change so off-turn offers show for the right player.
  useNet((s) => s.seats);
  useNet((s) => s.mode);
  const notices = useNotices((s) => s.notices);

  useEffect(
    () =>
      useGame.subscribe((state, prev) => {
        if (state.game.contracts === prev.game.contracts) return;
        const before = new Map(prev.game.contracts.map((c) => [c.id, c]));
        const fresh: Array<{ text: string; good: boolean }> = [];
        for (const c of state.game.contracts) {
          const old = before.get(c.id);
          const answered = c.status === "active" || c.status === "declined";
          if (!answered || (old && old.status !== "proposed")) continue;
          // The AI answers on the spot, so a new contract may arrive already decided.
          if (!playedHere(c.from)) continue;
          const to = NATIONS[c.to];
          fresh.push({
            good: c.status === "active",
            text:
              c.status === "active"
                ? `${to.flag} ${to.name} signed your ${describe(c)}.`
                : `${to.flag} ${to.name} refused your ${describe(c)}.`,
          });
        }
        for (const f of fresh) useNotices.getState().push(f.text, f.good ? "good" : "bad", 7000);
      }),
    [],
  );

  const offers = contracts.filter((c) => c.status === "proposed" && playedHere(c.to));

  if (!offers.length && !notices.length) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-14 z-[56] flex flex-col items-center gap-2 px-4">
      {offers.map((c) => {
        const from = NATIONS[c.from];
        const to = NATIONS[c.to];
        return (
          <div
            key={c.id}
            role="alertdialog"
            aria-label={`Offer from ${from.name}`}
            className="pointer-events-auto w-full max-w-md rounded-lg border-2 bg-background p-4 shadow-2xl"
            style={{ borderColor: from.color }}
          >
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Diplomatic offer for {to.flag} {to.name}
            </div>
            <div className="mt-1 font-serif text-lg font-bold">
              {from.flag} {from.name} proposes a {describe(c)}
            </div>
            <div className="text-xs text-muted-foreground">{CONTRACT_KINDS[c.kind].blurb}</div>
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => respond(c.id, false)}
                className="rounded border border-border px-3 py-1.5 text-xs font-semibold uppercase tracking-wider hover:bg-muted"
              >
                Decline
              </button>
              <button
                type="button"
                onClick={() => respond(c.id, true)}
                className="rounded bg-primary px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-primary-foreground"
              >
                Accept
              </button>
            </div>
          </div>
        );
      })}
      {notices.map((n) => (
        <div
          key={n.id}
          role="status"
          className={
            "pointer-events-auto w-full max-w-md rounded-md border px-4 py-2 text-sm font-semibold shadow-lg " +
            (n.tone === "good"
              ? "border-green-700/40 bg-green-50 text-green-900"
              : n.tone === "bad"
                ? "border-red-700/40 bg-red-50 text-red-900"
                : "border-amber-700/40 bg-amber-50 text-amber-950")
          }
        >
          {n.tone === "good" ? "🤝 " : n.tone === "bad" ? "✋ " : ""}
          {n.text}
        </div>
      ))}
    </div>
  );
}
