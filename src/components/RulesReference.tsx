import { useState } from "react";
import {
  AIR_UNITS,
  CANAL_INFO,
  CONTRACT_KINDS,
  CONTRACT_KIND_ORDER,
  GAME_DAYS,
  NAVAL_UNITS,
  SPY_ACTIONS,
  SPY_ACTION_ORDER,
  SPY_COST,
  SPY_INSERT_RANGE,
  STRUCTURE_ORDER,
  STRUCTURE_STATS,
  TERRAIN_INFO,
  UNIT_STATS,
  isAir,
  isNaval,
  type StructureCategory,
  type StructureType,
  type UnitType,
} from "@/game/types";

type Tab = "units" | "buildings" | "terrain" | "spies" | "campaign";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "units", label: "Units", icon: "🎖" },
  { id: "buildings", label: "Buildings", icon: "🏗" },
  { id: "terrain", label: "Terrain", icon: "🗺" },
  { id: "spies", label: "Spies", icon: "🕵" },
  { id: "campaign", label: "Campaign & Combat", icon: "📜" },
];

const UNIT_GROUPS: { title: string; filter: (t: UnitType) => boolean }[] = [
  { title: "Land units", filter: (t) => !isNaval(t) && !isAir(t) },
  { title: "Air units", filter: (t) => isAir(t) },
  { title: "Naval units", filter: (t) => isNaval(t) },
];

const BUILDING_GROUPS: { title: string; category: StructureCategory }[] = [
  { title: "Flag buildings", category: "flag" },
  { title: "Support buildings", category: "support" },
  { title: "Fortifications", category: "fortification" },
];

function unitNotes(t: UnitType): string[] {
  const s = UNIT_STATS[t];
  const notes: string[] = [];
  if (s.antiAir > 0) notes.push(`AA ${s.antiAir}`);
  if (s.bombard > 0) notes.push(`Bombard ${s.bombard}`);
  if (s.d4MultiKill) notes.push("D4 multi-kill");
  if (s.seats > 0) notes.push(`${s.seats} seat${s.seats > 1 ? "s" : ""}`);
  if (t === "transport") notes.push("Carries 6 units");
  if (t === "higgins") notes.push("Carries 2 units");
  if (t === "light_carrier") notes.push("2 aircraft");
  if (t === "fleet_carrier") notes.push("4 aircraft");
  if (t === "submarine") notes.push("Hidden unless a destroyer is near");
  if (t === "spy_plane") notes.push("Spy insertion");
  if (t === "dozer") notes.push("Builds fortifications");
  if (t === "cargo_truck") notes.push("Hauls supplies");
  return notes;
}

function UnitTable({ filter }: { filter: (t: UnitType) => boolean }) {
  const types = (Object.keys(UNIT_STATS) as UnitType[]).filter(filter);
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-left uppercase tracking-wide text-muted-foreground">
          <th className="py-1 pr-2 font-medium">Unit</th>
          <th className="px-1.5 text-right font-medium">Cost</th>
          <th className="px-1.5 text-right font-medium">Atk</th>
          <th className="px-1.5 text-right font-medium">Def</th>
          <th className="px-1.5 text-right font-medium">Move</th>
          <th className="px-1.5 text-right font-medium">Range</th>
          <th className="py-1 pl-2 font-medium">Notes</th>
        </tr>
      </thead>
      <tbody>
        {types.map((t) => {
          const s = UNIT_STATS[t];
          return (
            <tr key={t} className="border-t border-border/50">
              <td className="py-1 pr-2 font-medium">{s.label}</td>
              <td className="px-1.5 text-right tabular-nums">{s.cost}</td>
              <td className="px-1.5 text-right tabular-nums">{s.attack}</td>
              <td className="px-1.5 text-right tabular-nums">{s.defense}</td>
              <td className="px-1.5 text-right tabular-nums">{s.move}</td>
              <td className="px-1.5 text-right tabular-nums">{s.range || "—"}</td>
              <td className="py-1 pl-2 text-muted-foreground">
                {unitNotes(t).join(" · ") || "—"}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function BuildingTable({ category }: { category: StructureCategory }) {
  const types = STRUCTURE_ORDER.filter((s) => STRUCTURE_STATS[s].category === category);
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-left uppercase tracking-wide text-muted-foreground">
          <th className="py-1 pr-2 font-medium">Building</th>
          <th className="px-1.5 text-right font-medium">Cost</th>
          <th className="px-1.5 text-right font-medium">Income</th>
          <th className="px-1.5 text-right font-medium">Def +</th>
          <th className="px-1.5 text-right font-medium">VP held</th>
          <th className="px-1.5 text-right font-medium">VP razed</th>
          <th className="py-1 pl-2 font-medium">Effect</th>
        </tr>
      </thead>
      <tbody>
        {types.map((t: StructureType) => {
          const s = STRUCTURE_STATS[t];
          return (
            <tr key={t} className="border-t border-border/50">
              <td className="py-1 pr-2 font-medium">
                <span className="mr-1">{s.icon}</span>
                {s.label}
              </td>
              <td className="px-1.5 text-right tabular-nums">{s.cost}</td>
              <td className="px-1.5 text-right tabular-nums">{s.income || "—"}</td>
              <td className="px-1.5 text-right tabular-nums">{s.defenseBonus || "—"}</td>
              <td className="px-1.5 text-right tabular-nums">{s.vpOwned || "—"}</td>
              <td className="px-1.5 text-right tabular-nums">{s.vpDestroyed || "—"}</td>
              <td className="py-1 pl-2 text-muted-foreground">{s.blurb}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-4">
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

function RulesBody({ tab }: { tab: Tab }) {
  if (tab === "units") {
    return (
      <>
        <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
          Cost in NPP. Attack / defense are the D6 numbers each unit hits on. Range is
          bombardment / operational reach in tiles. Units fire in order of their hit
          number; casualties are removed in order of loss (cheapest and weakest first).
        </p>
        {UNIT_GROUPS.map((g) => (
          <Section key={g.title} title={g.title}>
            <UnitTable filter={g.filter} />
          </Section>
        ))}
      </>
    );
  }

  if (tab === "buildings") {
    return (
      <>
        <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
          Only the capital and oil platforms earn income each turn; the capital stops
          earning while it has fallen. Structures also carry victory points — for the
          holder while intact, and for whoever destroys or captures them.
        </p>
        {BUILDING_GROUPS.map((g) => (
          <Section key={g.category} title={g.title}>
            <BuildingTable category={g.category} />
          </Section>
        ))}
      </>
    );
  }

  if (tab === "terrain") {
    return (
      <>
        {Object.entries(TERRAIN_INFO).map(([id, info]) => (
          <Section key={id} title={`${info.icon} ${info.label}`}>
            <p className="text-xs leading-relaxed">{info.blurb}</p>
          </Section>
        ))}
        {Object.entries(CANAL_INFO).map(([id, info]) => (
          <Section key={id} title={`⚓ ${info.label}`}>
            <p className="text-xs leading-relaxed">{info.blurb}</p>
          </Section>
        ))}
      </>
    );
  }

  if (tab === "spies") {
    return (
      <>
        <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
          Train one spy per turn at an Intel Center for {SPY_COST} NPP. A spy inserts
          into an adjacent enemy province, or reaches further by riding a submarine
          ({SPY_INSERT_RANGE.submarine} tiles), zeppelin or spy plane (1 tile). The
          defender rolls counter-intelligence first: a 1–2 blocks the mission. Each
          mission then rolls the listed D6 target to succeed.
        </p>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left uppercase tracking-wide text-muted-foreground">
              <th className="py-1 pr-2 font-medium">Mission</th>
              <th className="px-1.5 text-right font-medium">Target</th>
              <th className="px-1.5 text-right font-medium">Cost</th>
              <th className="py-1 pl-2 font-medium">Effect</th>
            </tr>
          </thead>
          <tbody>
            {SPY_ACTION_ORDER.map((a) => {
              const s = SPY_ACTIONS[a];
              return (
                <tr key={a} className="border-t border-border/50">
                  <td className="py-1 pr-2 font-medium">
                    <span className="mr-1">{s.icon}</span>
                    {s.label}
                  </td>
                  <td className="px-1.5 text-right tabular-nums">{s.target}+</td>
                  <td className="px-1.5 text-right tabular-nums">{s.cost || "—"}</td>
                  <td className="py-1 pl-2 text-muted-foreground">{s.blurb}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </>
    );
  }

  // Campaign & combat
  return (
    <>
      <Section title="Campaign days">
        <p className="text-xs leading-relaxed">
          The war runs six game days. Each nation takes one turn per day with a
          25-minute clock; a unanimous pause adds five minutes, and the clock running
          out ends the turn. After day six, roll a D6: on 1–3 the war continues into
          another day, on 4–6 it ends immediately and the nation with the most victory
          points wins.
        </p>
      </Section>
      <Section title="Combat sequence">
        <ul className="list-disc space-y-1 pl-5 text-xs leading-relaxed">
          <li>Opening bombardment from artillery, howitzers, rail guns and neighboring warships (battleship D4 multi-kill).</li>
          <li>Coastal guns and sea mines strike the attacker's fleet.</li>
          <li>Dogfights — air units battle each other first.</li>
          <li>Anti-air fire from defenders.</li>
          <li>Ground / naval assault: attack and defense rolls, order-of-loss casualties; bombers and howitzers roll a D4 after a hit to kill 1–4 units (D6 only against mountains and jungle).</li>
          <li>
            Battles are fought one roll at a time. After each round the attacker may withdraw its
            surviving units, with no roll and no penalty.
          </li>
          <li>
            Joint attacks: when attacking, units in your other territories that can also reach the
            target may join the same battle. If you withdraw, each returns to where it came from.
          </li>
          <li>Islands hold at most 15 units.</li>
        </ul>
      </Section>
      <Section title="Kamikaze">
        <p className="text-xs leading-relaxed">
          Select fighters or bombers on a province you hold and choose Kamikaze.
          Fighters fly up to 4 tiles and hit on 1–3; bombers fly up to 6, roll a D4 for
          how many units they can strike, then a D6 (1–4) per strike — a single roll
          against ships or mountain/jungle targets. Defending anti-air fires first (1–2
          downs a fighter, 3–4 a bomber). Every plane sent is lost either way.
        </p>
      </Section>
      <Section title="Victory points">
        <p className="text-xs leading-relaxed">
          1 VP per province held, plus the VP value of every structure you hold. Razings
          and captures award instant VP. Lose your capital once and lose 10 VP; twice or
          more, 20 VP. You may also sell VP for emergency NPP. Highest total when the
          war ends wins.
        </p>
      </Section>
      <Section title="Diplomacy — terms of agreement">
        <ul className="list-disc space-y-1 pl-5 text-xs leading-relaxed">
          {CONTRACT_KIND_ORDER.map((k) => (
            <li key={k}>
              <span className="mr-1">{CONTRACT_KINDS[k].icon}</span>
              <span className="font-medium">{CONTRACT_KINDS[k].label}:</span>{" "}
              {CONTRACT_KINDS[k].blurb} A contract may run at most five turns.
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}

/** Floating "Rules" button plus a tabbed in-game rules reference modal. */
export function RulesReference() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("units");

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open rules reference"
        className="fixed left-3 top-3 z-40 flex items-center gap-1.5 rounded-md border border-border bg-background/90 px-3 py-2 text-xs font-semibold shadow-lg backdrop-blur hover:bg-muted"
      >
        📖 Rules
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[55] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-lg border border-border bg-background shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <span className="text-lg">📖</span>
              <h2 className="text-sm font-bold uppercase tracking-wider">
                Rules Reference
              </h2>
              <button
                type="button"
                aria-label="Close rules"
                onClick={() => setOpen(false)}
                className="ml-auto h-7 w-7 rounded text-sm font-semibold hover:bg-muted"
              >
                ✕
              </button>
            </div>

            <div className="flex flex-wrap gap-1 border-b border-border px-4 py-2">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={
                    "rounded px-2.5 py-1 text-xs font-medium " +
                    (tab === t.id
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted text-muted-foreground")
                  }
                >
                  {t.icon} {t.label}
                </button>
              ))}
            </div>

            <div className="overflow-auto px-4 py-3">
              <RulesBody tab={tab} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
