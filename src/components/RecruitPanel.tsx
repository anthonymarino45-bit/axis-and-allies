import { useEffect, useState } from "react";
import { useGame } from "@/game/store";
import { UNIT_STATS, type Territory, type UnitType } from "@/game/types";

const LAND: UnitType[] = [
  "infantry", "halftrack", "artillery", "howitzer", "tank", "amph_tank",
  "heavy_tank", "cargo_truck", "dozer", "aa_gun", "railgun",
];
const AIR: UnitType[] = ["fighter", "bomber", "zeppelin", "spy_plane"];
const NAVAL: UnitType[] = [
  "transport", "higgins", "submarine", "destroyer", "cruiser",
  "light_carrier", "battleship", "fleet_carrier",
];

type Order = Partial<Record<UnitType, number>>;

/**
 * Recruitment as an order sheet: click units to add them (any mix of land,
 * air and sea), adjust the counts, then recruit the whole order at once.
 */
export function RecruitPanel({
  territory: t,
  treasury,
  hasAirfield,
  hasHarbor,
  hasAdjacentSea,
}: {
  territory: Territory;
  treasury: number;
  hasAirfield: boolean;
  hasHarbor: boolean;
  hasAdjacentSea: boolean;
}) {
  const buyUnits = useGame((s) => s.buyUnits);
  const [order, setOrder] = useState<Order>({});
  const [result, setResult] = useState<string | null>(null);

  // A new territory starts a fresh order.
  useEffect(() => {
    setOrder({});
    setResult(null);
  }, [t.id]);

  const total = (Object.entries(order) as Array<[UnitType, number]>).reduce(
    (sum, [type, n]) => sum + UNIT_STATS[type].cost * n,
    0,
  );
  const count = Object.values(order).reduce((a, b) => a + (b ?? 0), 0);
  const left = treasury - total;

  /** Why a unit can't be ordered here, or null if it can. */
  const blocked = (type: UnitType): string | null => {
    if (AIR.includes(type)) {
      if (!t.hasFactory) return "Requires a Factory";
      if (!hasAirfield) return "Requires an Airfield";
    } else if (NAVAL.includes(type)) {
      if (!t.hasFactory) return "Requires a Factory";
      if (!hasAdjacentSea || !hasHarbor) return "Needs a Harbor on a coastal territory";
    } else if (!t.hasFactory) {
      if (type !== "infantry") return "Requires a Factory";
      if (t.builtInfantryThisTurn) return "Already conscripted this turn";
      if ((order.infantry ?? 0) >= 1) return "Only one Infantry per turn without a factory";
    }
    return null;
  };

  const change = (type: UnitType, delta: number) => {
    setResult(null);
    setOrder((o) => {
      const n = Math.max(0, (o[type] ?? 0) + delta);
      const next = { ...o, [type]: n };
      if (n === 0) delete next[type];
      return next;
    });
  };

  const add = (type: UnitType) => {
    if (blocked(type) || UNIT_STATS[type].cost > left) return;
    change(type, 1);
  };

  const recruit = () => {
    const wanted = count;
    const got = buyUnits(order);
    setOrder({});
    setResult(
      got === wanted
        ? `Recruited ${got} unit${got === 1 ? "" : "s"}.`
        : `Recruited ${got} of ${wanted} — some units can't be built here (terrain or limits).`,
    );
  };

  const tile = (type: UnitType) => {
    const s = UNIT_STATS[type];
    const why = blocked(type);
    const n = order[type] ?? 0;
    const cantAfford = s.cost > left;
    return (
      <button
        key={type}
        type="button"
        onClick={() => add(type)}
        disabled={!!why || cantAfford}
        title={why ?? (cantAfford ? "Not enough NPP left for this order" : `Add a ${s.label} to the order`)}
        className={
          "relative rounded border px-1 py-1.5 text-[10px] font-semibold uppercase tracking-wide hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40 " +
          (n ? "border-primary bg-primary/15" : "border-border bg-parchment")
        }
      >
        {s.label}
        <div className="text-[9px] font-normal text-muted-foreground">{s.cost} NPP</div>
        {n > 0 && (
          <span className="absolute -right-1 -top-1 rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
            {n}
          </span>
        )}
      </button>
    );
  };

  const lines = Object.entries(order) as Array<[UnitType, number]>;

  return (
    <div>
      <div className="mt-2 grid grid-cols-3 gap-1">{LAND.map(tile)}</div>
      {t.hasFactory && (
        <>
          <div className="mt-3 text-[10px] uppercase tracking-widest text-muted-foreground">Air Wing</div>
          <div className="mt-1 grid grid-cols-4 gap-1">{AIR.map(tile)}</div>
          <div className="mt-3 text-[10px] uppercase tracking-widest text-muted-foreground">Naval Shipyard</div>
          <div className="mt-1 grid grid-cols-4 gap-1">{NAVAL.map(tile)}</div>
          {(!hasAdjacentSea || !hasHarbor) && (
            <div className="mt-1 text-[10px] italic text-muted-foreground">
              Ships launch only from a Harbor on a coastal territory.
            </div>
          )}
        </>
      )}

      <div className="mt-3 rounded border border-border bg-card p-2">
        <div className="flex items-baseline justify-between text-[10px] uppercase tracking-widest text-muted-foreground">
          <span>Order</span>
          <span className="tabular-nums">
            {total} / {treasury} NPP
          </span>
        </div>
        {lines.length === 0 ? (
          <div className="py-1 text-xs text-muted-foreground">Click units above to add them to the order.</div>
        ) : (
          <ul className="mt-1 space-y-1">
            {lines.map(([type, n]) => {
              const s = UNIT_STATS[type];
              const canAdd = !blocked(type) && s.cost <= left;
              return (
                <li key={type} className="flex items-center gap-2 text-xs">
                  <span className="min-w-0 flex-1 truncate font-semibold">{s.label}</span>
                  <button
                    type="button"
                    onClick={() => change(type, -1)}
                    aria-label={`One fewer ${s.label}`}
                    className="h-6 w-6 rounded border border-border bg-secondary font-bold hover:bg-accent"
                  >
                    −
                  </button>
                  <span className="w-5 text-center font-bold tabular-nums">{n}</span>
                  <button
                    type="button"
                    onClick={() => add(type)}
                    disabled={!canAdd}
                    aria-label={`One more ${s.label}`}
                    className="h-6 w-6 rounded border border-border bg-secondary font-bold hover:bg-accent disabled:opacity-40"
                  >
                    +
                  </button>
                  <span className="w-12 text-right tabular-nums text-muted-foreground">{s.cost * n} NPP</span>
                </li>
              );
            })}
          </ul>
        )}
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={() => {
              setOrder({});
              setResult(null);
            }}
            disabled={!count}
            className="rounded border border-border bg-secondary px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider hover:bg-accent disabled:opacity-40"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={recruit}
            disabled={!count}
            className="flex-1 rounded bg-primary px-2 py-1.5 text-xs font-bold uppercase tracking-wider text-primary-foreground disabled:opacity-40"
          >
            {count ? `Recruit ${count} unit${count === 1 ? "" : "s"} · ${total} NPP` : "Recruit"}
          </button>
        </div>
        {result && <div className="mt-1 text-[11px] text-muted-foreground">{result}</div>}
      </div>
    </div>
  );
}
