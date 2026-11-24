import { useGame, type DieRoll } from "@/game/store";
import { UNIT_STATS, NATIONS, factionName } from "@/game/types";
import { useCanAct, useNet } from "@/game/multiplayer";

const DIE_FACES = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

function DieView({ roll }: { roll: DieRoll }) {
  const face = DIE_FACES[roll.roll - 1] ?? roll.roll;
  return (
    <div
      className="flex flex-col items-center gap-0.5 rounded border px-2 py-1.5"
      style={{
        borderColor: roll.hit ? "var(--accent)" : "var(--border)",
        background: roll.casualty
          ? "color-mix(in oklab, var(--destructive) 25%, transparent)"
          : roll.hit
            ? "color-mix(in oklab, var(--accent) 18%, transparent)"
            : "var(--parchment)",
        opacity: roll.casualty ? 0.85 : 1,
      }}
      title={`${roll.label ?? UNIT_STATS[roll.type].label} — needs ${roll.target} or less, rolled ${roll.roll}`}
    >
      <div className="text-2xl leading-none">{face}</div>
      <div className="text-[9px] font-bold uppercase tracking-wider">
        {roll.label ?? UNIT_STATS[roll.type].short}
        <span className="ml-1 font-normal opacity-70">≤{roll.target}</span>
      </div>
      <div className="text-[9px] font-semibold">
        {roll.casualty
          ? "KIA"
          : roll.hit
            ? roll.bomberKills
              ? `HIT ×${roll.bomberKills}`
              : "HIT"
            : "miss"}
      </div>
    </div>
  );
}

function rosterCounts(unitIds: string[], units: { id: string; type: string }[]) {
  const ids = new Set(unitIds);
  const counts: Record<string, number> = {};
  for (const u of units) if (ids.has(u.id)) counts[u.type] = (counts[u.type] ?? 0) + 1;
  return counts;
}

function RosterLine({ counts }: { counts: Record<string, number> }) {
  const entries = Object.entries(counts);
  if (entries.length === 0) {
    return <span className="text-xs italic text-muted-foreground">— eliminated —</span>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {entries.map(([type, n]) => {
        const s = UNIT_STATS[type as keyof typeof UNIT_STATS];
        return (
          <span
            key={type}
            className="rounded border border-border bg-parchment/60 px-1.5 py-0.5 text-[11px] font-semibold"
            title={`${s.label} — ${s.attack}/${s.defense}`}
          >
            {s.short}×{n}
            <span className="ml-1 font-normal text-muted-foreground">
              {s.attack}/{s.defense}
            </span>
          </span>
        );
      })}
    </div>
  );
}

export function BattleDialog() {
  const pendingBattle = useGame((s) => s.pendingBattle);
  const game = useGame((s) => s.game);
  const rollBattleRound = useGame((s) => s.rollBattleRound);
  const retreatBattle = useGame((s) => s.retreatBattle);
  const closeBattle = useGame((s) => s.closeBattle);
  const online = useNet((s) => s.mode !== "local");
  const canAct = useCanAct();
  // In an online room, everyone else watches the battle play out.
  const watching = online && !canAct;

  if (!pendingBattle) return null;

  const from = game.territories[pendingBattle.attackerId];
  const to = game.territories[pendingBattle.defenderId];
  const lastRound = pendingBattle.rounds[pendingBattle.rounds.length - 1];

  const attackerCounts = rosterCounts(pendingBattle.attackerUnitIds, from.units);
  const defenderCounts = rosterCounts(
    to.units.map((u) => u.id),
    to.units,
  );

  const ongoing = pendingBattle.status === "ongoing";
  const retreatTried = pendingBattle.retreatTriedAfterRound === pendingBattle.rounds.length;
  const statusLabel =
    pendingBattle.status === "attacker-won"
      ? `Victory — ${to.name} captured`
      : pendingBattle.status === "defender-won"
        ? `Defeat — attack repulsed`
        : pendingBattle.status === "stalemate"
          ? `Stalemate — both sides destroyed`
          : pendingBattle.status === "retreated"
            ? `Retreat declared`
            : `Round ${pendingBattle.rounds.length} of ${pendingBattle.rounds.length + 1}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-2xl rounded-lg border border-border bg-card p-5 shadow-2xl">
        <header className="flex items-baseline justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Combat Phase
            </div>
            <h2 className="font-serif text-2xl font-bold">Battle of {to.name}</h2>
          </div>
          <div className="text-right text-xs">
            <div className="text-muted-foreground">Round</div>
            <div className="text-lg font-bold">{pendingBattle.rounds.length}</div>
          </div>
        </header>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded border border-border bg-parchment/40 p-3">
            <div
              className="text-[10px] font-bold uppercase tracking-widest"
              style={{ color: NATIONS[game.currentPlayer].color }}
            >
              Attackers · {NATIONS[game.currentPlayer].name} · {from.name}
            </div>
            <div className="mt-2">
              <RosterLine counts={attackerCounts} />
            </div>
          </div>
          <div className="rounded border border-border bg-parchment/40 p-3">
            <div
              className="text-[10px] font-bold uppercase tracking-widest"
              style={{
                color: to.owner === "neutral" ? "var(--muted-foreground)" : NATIONS[to.owner].color,
              }}
            >
              Defenders · {factionName(to.owner)} · {to.name}
            </div>
            <div className="mt-2">
              <RosterLine counts={defenderCounts} />
            </div>
          </div>
        </div>

        {pendingBattle.opening &&
          pendingBattle.opening.bombardRolls.length +
            pendingBattle.opening.coastalRolls.length +
            pendingBattle.opening.aaRolls.length +
            pendingBattle.opening.mineRolls.length >
            0 && (
            <div className="mt-4 rounded border border-border bg-card p-3">
              <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-widest text-muted-foreground">
                <span>Opening Fire</span>
                <span>
                  Defenders lost {pendingBattle.opening.defenderLosses} · Attackers lost{" "}
                  {pendingBattle.opening.attackerLosses}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[
                  ...pendingBattle.opening.bombardRolls,
                  ...pendingBattle.opening.coastalRolls,
                  ...pendingBattle.opening.aaRolls,
                  ...pendingBattle.opening.mineRolls,
                ].map((r, i) => (
                  <DieView key={i} roll={r} />
                ))}
              </div>
            </div>
          )}

        {pendingBattle.retreatRoll &&
          !pendingBattle.retreatRoll.success &&
          pendingBattle.retreatTriedAfterRound === pendingBattle.rounds.length && (
            <div className="mt-3 rounded border border-destructive/50 bg-destructive/15 p-2 text-center text-xs font-semibold uppercase tracking-widest">
              Withdrawal roll {pendingBattle.retreatRoll.roll} — failed (needs 1-3). Your troops
              must fight the next round.
            </div>
          )}

        {lastRound && (
          <div className="mt-4 rounded border border-border bg-card p-3">
            <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-widest text-muted-foreground">
              <span>
                {lastRound.dogfight ? "Dogfight" : "Latest Volley"} — Round{" "}
                {pendingBattle.rounds.length}
              </span>
              <span>
                Attackers {lastRound.attackHits} hit · Defenders {lastRound.defenseHits} hit
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="mb-1 text-[10px] font-bold uppercase text-muted-foreground">
                  Attacker rolls
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {lastRound.attackRolls.length === 0 ? (
                    <span className="text-xs italic text-muted-foreground">no dice</span>
                  ) : (
                    lastRound.attackRolls.map((r, i) => <DieView key={i} roll={r} />)
                  )}
                </div>
              </div>
              <div>
                <div className="mb-1 text-[10px] font-bold uppercase text-muted-foreground">
                  Defender rolls
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {lastRound.defenseRolls.length === 0 ? (
                    <span className="text-xs italic text-muted-foreground">no dice</span>
                  ) : (
                    lastRound.defenseRolls.map((r, i) => <DieView key={i} roll={r} />)
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {ongoing && !watching && pendingBattle.rounds.length > 0 && (
          <div className="mt-4 rounded border border-primary/50 bg-primary/10 p-3 text-center">
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
              Round {pendingBattle.rounds.length} complete
            </div>
            <div className="mt-1 text-sm">
              <b>{pendingBattle.attackerUnitIds.length}</b> attacking unit
              {pendingBattle.attackerUnitIds.length === 1 ? "" : "s"} vs <b>{to.units.length}</b>{" "}
              defending unit{to.units.length === 1 ? "" : "s"} remain. Press the attack, or try to
              withdraw (needs 1-3 on a die).
            </div>
          </div>
        )}

        {!ongoing && (
          <div className="mt-4 rounded border border-accent bg-accent/20 p-3 text-center text-sm font-bold uppercase tracking-widest">
            {statusLabel}
          </div>
        )}

        <div className="mt-5 flex items-center justify-between gap-2">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
            {ongoing && pendingBattle.rounds.length === 0
              ? "You can try to withdraw after the first roll"
              : "Casualties taken cheapest-first"}
          </div>
          <div className="flex gap-2">
            {watching ? (
              <span className="px-3 py-2 text-xs italic text-muted-foreground">
                Watching — {NATIONS[game.currentPlayer].name} is rolling
              </span>
            ) : ongoing ? (
              <>
                {pendingBattle.rounds.length > 0 && (
                  <button
                    onClick={retreatBattle}
                    disabled={retreatTried}
                    title={
                      retreatTried
                        ? "You already tried to withdraw this round — fight the next round first"
                        : "Roll a die: 1-3 and your attackers pull back"
                    }
                    className="rounded border border-border bg-secondary px-3 py-2 text-xs font-semibold uppercase tracking-wider hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {retreatTried ? "Withdrawal failed" : "Withdraw"}
                  </button>
                )}
                <button
                  onClick={rollBattleRound}
                  className="rounded border border-border bg-primary px-4 py-2 text-sm font-bold uppercase tracking-widest text-primary-foreground hover:opacity-90"
                >
                  🎲{" "}
                  {pendingBattle.rounds.length === 0
                    ? "Roll Dice"
                    : `Roll Round ${pendingBattle.rounds.length + 1}`}
                </button>
              </>
            ) : (
              <button
                onClick={closeBattle}
                className="rounded border border-border bg-primary px-4 py-2 text-sm font-bold uppercase tracking-widest text-primary-foreground hover:opacity-90"
              >
                Resolve Battle
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
