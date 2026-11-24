import { useEffect, useMemo, useRef, useState } from "react";
import { useGame, getReachable, canBombardNow, bombardTargetsFor } from "@/game/store";
import type { MapAnimationEvent } from "@/game/store";
import { MAP_VIEWBOX, UNIT_STATS, NATIONS, STRUCTURE_STATS, TERRAIN_INFO } from "@/game/types";
import type { Territory, UnitType } from "@/game/types";
import { UNIT_ICONS } from "@/game/unitIcons";


function factionFill(t: Territory) {
  if (t.isSea) return "color-mix(in oklab, var(--sea) 65%, white 12%)";
  if (t.owner === "neutral") return "var(--neutral-land)";
  return `color-mix(in oklab, ${NATIONS[t.owner].color} 60%, var(--neutral-land))`;
}

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 6;
const ZOOM_STEP = 1.2;

export function GameMap() {
  const territories = useGame((s) => s.game.territories);
  const selectedId = useGame((s) => s.selectedTerritoryId);
  const selectedUnitIds = useGame((s) => s.selectedUnitIds);
  const aiTurnInProgress = useGame((s) => s.aiTurnInProgress);
  const selectTerritory = useGame((s) => s.selectTerritory);
  const openMoveDialog = useGame((s) => s.openMoveDialog);
  const mapAnimation = useGame((s) => s.mapAnimation);
  const game = useGame((s) => s.game);
  const bombardTargeting = useGame((s) => s.bombardTargeting);
  const setBombardTargeting = useGame((s) => s.setBombardTargeting);
  const bombardTerritory = useGame((s) => s.bombardTerritory);

  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [zoom, setZoom] = useState(1);
  const [center, setCenter] = useState({
    x: MAP_VIEWBOX.x + MAP_VIEWBOX.width / 2,
    y: MAP_VIEWBOX.y + MAP_VIEWBOX.height / 2,
  });
  const [isPanning, setIsPanning] = useState(false);
  const panRef = useRef<{
    startX: number;
    startY: number;
    startCx: number;
    startCy: number;
    moved: boolean;
  } | null>(null);
  const didDragRef = useRef(false);
  // Multi-touch: active pointers + in-progress pinch gesture
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{
    startDist: number;
    startZoom: number;
    anchor: { x: number; y: number };
  } | null>(null);

  const svgPointRatio = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { px: 0.5, py: 0.5 };
    const rect = svg.getBoundingClientRect();
    return {
      px: (clientX - rect.left) / rect.width,
      py: (clientY - rect.top) / rect.height,
    };
  };
  const [visibleAnimation, setVisibleAnimation] = useState<MapAnimationEvent | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduceMotion(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!mapAnimation) return;
    setVisibleAnimation(mapAnimation);
    const timer = window.setTimeout(() => setVisibleAnimation(null), reduceMotion ? 120 : 900);
    return () => window.clearTimeout(timer);
  }, [mapAnimation, reduceMotion]);

  const vbW = MAP_VIEWBOX.width / zoom;
  const vbH = MAP_VIEWBOX.height / zoom;
  const vbX = center.x - vbW / 2;
  const vbY = center.y - vbH / 2;

  // Wheel zoom — anchored at cursor position
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      // Convert cursor to SVG (viewBox) coordinates
      const px = (e.clientX - rect.left) / rect.width;
      const py = (e.clientY - rect.top) / rect.height;
      const cursorSvgX = vbX + px * vbW;
      const cursorSvgY = vbY + py * vbH;
      const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
      const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * factor));
      if (next === zoom) return;
      // Keep the point under the cursor stationary
      const newVbW = MAP_VIEWBOX.width / next;
      const newVbH = MAP_VIEWBOX.height / next;
      const newCx = cursorSvgX - (px - 0.5) * newVbW;
      const newCy = cursorSvgY - (py - 0.5) * newVbH;
      setZoom(next);
      setCenter({ x: newCx, y: newCy });
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [zoom, vbX, vbY, vbW, vbH]);

  const zoomBy = (factor: number) => {
    setZoom((z) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z * factor)));
  };
  const resetZoom = () => {
    setZoom(1);
    setCenter({
      x: MAP_VIEWBOX.x + MAP_VIEWBOX.width / 2,
      y: MAP_VIEWBOX.y + MAP_VIEWBOX.height / 2,
    });
  };

  const reachable = useMemo(
    () => getReachable(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedId, selectedUnitIds, territories],
  );

  // Bombardment targeting mode: tiles the selected territory's batteries can shell.
  const bombardTargets = useMemo(() => {
    if (!bombardTargeting || !selectedId) return new Set<string>();
    const from = territories[selectedId];
    if (!from) return new Set<string>();
    const player = game.currentPlayer;
    const guns = from.units.filter((u) => canBombardNow(game, selectedId, u, player));
    if (guns.length === 0) return new Set<string>();
    return bombardTargetsFor(game, selectedId, guns);
  }, [bombardTargeting, selectedId, territories, game]);

  // Compute adjacency lines between centroids (for the operational overlay)
  const adjacencyLines = useMemo(() => {
    const seen = new Set<string>();
    const lines: Array<{ a: Territory; b: Territory; key: string }> = [];
    for (const id in territories) {
      const t = territories[id];
      for (const nid of t.adjacent) {
        const key = [id, nid].sort().join("|");
        if (seen.has(key)) continue;
        const n = territories[nid];
        if (!n) continue;
        seen.add(key);
        lines.push({ a: t, b: n, key });
      }
    }
    return lines;
  }, [territories]);

  const onTerritoryClick = (id: string) => {
    if (didDragRef.current) return;
    if (aiTurnInProgress) return;
    if (bombardTargeting) {
      if (bombardTargets.has(id)) bombardTerritory(id);
      else setBombardTargeting(false);
      return;
    }
    if (reachable.has(id)) openMoveDialog(id);
    else selectTerritory(id);
  };

  return (
    <div ref={wrapRef} className="relative h-full w-full">
    <svg
      ref={svgRef}
      viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
      className={`h-full w-full select-none ${isPanning ? "cursor-grabbing" : "cursor-grab"}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ touchAction: "none" }}
      onPointerDown={(e) => {
        // Only left button / primary touch initiates pan; do NOT capture the
        // pointer yet so child territory <g> elements can still receive click
        // events when the user only meant to tap (no drag).
        if (e.button !== 0) return;
        pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pointersRef.current.size === 2) {
          // Second finger down — start a pinch, cancel any pan in progress.
          panRef.current = null;
          setIsPanning(false);
          const pts = [...pointersRef.current.values()];
          const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
          const { px, py } = svgPointRatio((pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2);
          pinchRef.current = {
            startDist: dist,
            startZoom: zoom,
            anchor: { x: vbX + px * vbW, y: vbY + py * vbH },
          };
          return;
        }
        if (pointersRef.current.size > 1) return;
        panRef.current = {
          startX: e.clientX,
          startY: e.clientY,
          startCx: center.x,
          startCy: center.y,
          moved: false,
        };
      }}
      onPointerMove={(e) => {
        if (!pointersRef.current.has(e.pointerId)) return;
        pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

        const pinch = pinchRef.current;
        if (pointersRef.current.size >= 2 && pinch) {
          const pts = [...pointersRef.current.values()];
          const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
          const { px, py } = svgPointRatio((pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2);
          const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, pinch.startZoom * (dist / pinch.startDist)));
          const newVbW = MAP_VIEWBOX.width / next;
          const newVbH = MAP_VIEWBOX.height / next;
          // Keep the point under the fingers' midpoint stationary
          setZoom(next);
          setCenter({
            x: pinch.anchor.x - (px - 0.5) * newVbW,
            y: pinch.anchor.y - (py - 0.5) * newVbH,
          });
          return;
        }

        const p = panRef.current;
        if (!p) return;
        const dx = e.clientX - p.startX;
        const dy = e.clientY - p.startY;
        if (!p.moved && Math.hypot(dx, dy) < 4) return;
        if (!p.moved) {
          // First time crossing the threshold — start a real pan and capture
          // the pointer so movement outside the SVG keeps working.
          p.moved = true;
          didDragRef.current = true;
          setIsPanning(true);
          try {
            (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
          } catch {
            /* noop */
          }
        }
        const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
        const sx = (dx / rect.width) * vbW;
        const sy = (dy / rect.height) * vbH;
        setCenter({ x: p.startCx - sx, y: p.startCy - sy });
      }}
      onPointerUp={(e) => {
        const hadPinch = pointersRef.current.size >= 2;
        pointersRef.current.delete(e.pointerId);
        if (hadPinch) {
          // A pinch just ended (or still has one finger left) — suppress the
          // synthetic click so a spread gesture doesn't select a territory.
          pinchRef.current = null;
          didDragRef.current = true;
          setTimeout(() => {
            didDragRef.current = false;
          }, 0);
        }
        const p = panRef.current;
        panRef.current = null;
        if (p?.moved) {
          setIsPanning(false);
          try {
            (e.currentTarget as SVGSVGElement).releasePointerCapture(e.pointerId);
          } catch {
            /* noop */
          }
          // Clear drag flag shortly after so the click handler skips this click
          setTimeout(() => {
            didDragRef.current = false;
          }, 0);
        } else if (!p) {
          didDragRef.current = didDragRef.current && pointersRef.current.size > 0;
        }
      }}
      onPointerCancel={(e) => {
        pointersRef.current.delete(e.pointerId);
        if (pointersRef.current.size < 2) pinchRef.current = null;
        panRef.current = null;
        setIsPanning(false);
        setTimeout(() => {
          didDragRef.current = false;
        }, 0);
      }}
    >
      <defs>
        <pattern id="paperGrain" width="6" height="6" patternUnits="userSpaceOnUse">
          <rect width="6" height="6" fill="transparent" />
          <circle cx="1" cy="1" r="0.4" fill="currentColor" opacity="0.06" />
        </pattern>
        <radialGradient id="seaGrad" cx="50%" cy="50%" r="65%">
          <stop offset="0%" stopColor="color-mix(in oklab, var(--sea) 70%, white)" />
          <stop offset="100%" stopColor="var(--sea)" />
        </radialGradient>
        <filter id="landShadow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="2" stdDeviation="2" floodOpacity="0.25" />
        </filter>
      </defs>

      {/* Ocean */}
      <rect
        x={MAP_VIEWBOX.x}
        y={MAP_VIEWBOX.y}
        width={MAP_VIEWBOX.width}
        height={MAP_VIEWBOX.height}
        fill="url(#seaGrad)"
      />
      <rect
        x={MAP_VIEWBOX.x}
        y={MAP_VIEWBOX.y}
        width={MAP_VIEWBOX.width}
        height={MAP_VIEWBOX.height}
        fill="url(#paperGrain)"
      />

      {/* Adjacency lines (faint) */}
      <g opacity={0.25}>
        {adjacencyLines.map((l) => (
          <line
            key={l.key}
            x1={l.a.centroid.x}
            y1={l.a.centroid.y}
            x2={l.b.centroid.x}
            y2={l.b.centroid.y}
            stroke="var(--parchment-ink)"
            strokeWidth={1}
            strokeDasharray="4 4"
          />
        ))}
      </g>

      {/* Territories */}
      {Object.values(territories)
        .slice()
        .sort((a, b) => (a.isSea === b.isSea ? 0 : a.isSea ? -1 : 1))
        .map((t) => {
        const isSelected = selectedId === t.id;
        const isReach = reachable.has(t.id);
        const isBombardTarget = bombardTargeting && bombardTargets.has(t.id);
        return (
          <g
            key={t.id}
            onClick={() => onTerritoryClick(t.id)}
            className="cursor-pointer"
          >
            <polygon
              points={t.points}
              fill={factionFill(t)}
              stroke={
                isBombardTarget
                  ? "var(--destructive)"
                  : isSelected
                    ? "var(--ring)"
                    : isReach
                      ? "var(--accent)"
                      : "color-mix(in oklab, var(--parchment-ink) 55%, transparent)"
              }
              strokeWidth={isSelected || isReach || isBombardTarget ? 4 : 1.5}
              strokeLinejoin="round"
              filter="url(#landShadow)"
              style={{ transition: "stroke 120ms" }}
            />
            {!t.isSea && (
              <text
                x={t.centroid.x}
                y={t.centroid.y - 10}
                textAnchor="middle"
                fontSize={11}
                fill="color-mix(in oklab, var(--parchment-ink) 70%, transparent)"
                style={{ pointerEvents: "none", letterSpacing: 1 }}
              >
                NPP {t.ipc}
              </text>
            )}
            {t.isSea && t.name.includes("World Seam") && (
              <text
                x={t.centroid.x}
                y={t.centroid.y + 6}
                textAnchor="middle"
                fontSize={28}
                fill="var(--parchment-ink)"
                opacity={0.55}
                style={{ pointerEvents: "none" }}
              >
                ↔
              </text>
            )}
            {!t.isSea && t.terrain && (
              <g style={{ pointerEvents: "none" }}>
                <circle
                  cx={t.centroid.x + 42}
                  cy={t.centroid.y - 12}
                  r={9}
                  fill="var(--parchment)"
                  stroke="var(--parchment-ink)"
                  strokeWidth={1.2}
                />
                <text x={t.centroid.x + 42} y={t.centroid.y - 8} textAnchor="middle" fontSize={10}>
                  {TERRAIN_INFO[t.terrain].icon}
                </text>
              </g>
            )}
            {!t.isSea && t.canal && (
              <g style={{ pointerEvents: "none" }}>
                <circle
                  cx={t.centroid.x + 62}
                  cy={t.centroid.y - 12}
                  r={9}
                  fill="var(--parchment)"
                  stroke="var(--parchment-ink)"
                  strokeWidth={1.2}
                />
                <text x={t.centroid.x + 62} y={t.centroid.y - 8} textAnchor="middle" fontSize={10}>
                  🚢
                </text>
              </g>
            )}
            {t.isSea && (
              <text
                x={t.centroid.x}
                y={t.centroid.y - 10}
                textAnchor="middle"
                fontSize={11}
                fill="color-mix(in oklab, var(--parchment-ink) 60%, transparent)"
                style={{ pointerEvents: "none", letterSpacing: 2, fontStyle: "italic" }}
              >
                {t.name}
              </text>
            )}
            {!t.isSea && (t.structures?.length ?? 0) > 0 && (
              <g style={{ pointerEvents: "none" }}>
                {t.structures.slice(0, 6).map((st, i) => {
                  const w = 16;
                  const n = Math.min(t.structures.length, 6);
                  const x = t.centroid.x - (n * w) / 2 + i * w;
                  const y = t.centroid.y - 32;
                  return (
                    <g key={st}>
                      <rect
                        x={x}
                        y={y}
                        width={w - 2}
                        height={14}
                        rx={2}
                        fill="var(--parchment)"
                        stroke="var(--parchment-ink)"
                        strokeWidth={1.2}
                      />
                      <text
                        x={x + (w - 2) / 2}
                        y={y + 11}
                        textAnchor="middle"
                        fontSize={10}
                        fontWeight={800}
                        fill="var(--parchment-ink)"
                      >
                        {STRUCTURE_STATS[st].icon}
                      </text>
                    </g>
                  );
                })}
              </g>
            )}
          </g>
        );
      })}

      {/* Units sit in their own layer above every territory, so a coastline
          drawn later can never hide a fleet. Clicks act on their territory. */}
      <g>
        {Object.values(territories)
          .filter((t) => t.units.length > 0)
          .map((t) => (
            <g key={`units:${t.id}`} onClick={() => onTerritoryClick(t.id)} className="cursor-pointer">
              <UnitStack territory={t} />
            </g>
          ))}
      </g>
      {visibleAnimation && (
        <MapUnitAnimation event={visibleAnimation} territories={territories} reduceMotion={reduceMotion} />
      )}
    </svg>

      {/* Zoom controls */}
      <div className="absolute bottom-3 right-3 flex flex-col gap-1 rounded-md border border-border bg-card/90 p-1 shadow-md backdrop-blur">
        <button
          type="button"
          aria-label="Zoom in"
          onClick={() => zoomBy(ZOOM_STEP)}
          className="h-11 w-11 rounded text-xl font-semibold leading-none hover:bg-muted lg:h-8 lg:w-8 lg:text-lg"
        >
          +
        </button>
        <button
          type="button"
          aria-label="Reset zoom"
          onClick={resetZoom}
          className="h-7 w-11 rounded text-[10px] uppercase tracking-wider hover:bg-muted lg:h-6 lg:w-8"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          type="button"
          aria-label="Zoom out"
          onClick={() => zoomBy(1 / ZOOM_STEP)}
          className="h-11 w-11 rounded text-xl font-semibold leading-none hover:bg-muted lg:h-8 lg:w-8 lg:text-lg"
        >
          −
        </button>
      </div>
    </div>
  );
}

function MapUnitAnimation({
  event,
  territories,
  reduceMotion,
}: {
  event: MapAnimationEvent;
  territories: Record<string, Territory>;
  reduceMotion: boolean;
}) {
  const from = territories[event.fromId];
  const to = territories[event.toId];
  if (!from || !to || event.units.length === 0) return null;

  const dx = to.centroid.x - from.centroid.x;
  const dy = to.centroid.y - from.centroid.y;
  const duration = reduceMotion ? "0.01s" : event.kind === "attack" ? "0.72s" : "0.82s";
  const values = event.kind === "attack"
    ? `0 0;${dx} ${dy};${dx * 0.9} ${dy * 0.9};0 0`
    : `0 0;${dx} ${dy}`;
  const keyTimes = event.kind === "attack" ? "0;0.46;0.58;1" : "0;1";
  const label = event.kind.charAt(0).toUpperCase() + event.kind.slice(1);

  return (
    <g className="pointer-events-none" aria-label={`${label} animation`}>
      {(event.kind === "attack" || event.kind === "capture") && (
        <circle
          cx={to.centroid.x}
          cy={to.centroid.y + 14}
          r={20}
          fill="none"
          stroke={event.kind === "attack" ? "var(--destructive)" : "var(--accent)"}
          strokeWidth={4}
          className="unit-action-target"
        />
      )}
      <g>
        <animateTransform
          attributeName="transform"
          type="translate"
          values={values}
          keyTimes={keyTimes}
          dur={duration}
          fill="freeze"
          calcMode="spline"
          keySplines={event.kind === "attack" ? ".2 .8 .2 1;.2 .8 .2 1;.4 0 .2 1" : ".2 .8 .2 1"}
        />
        {event.units.slice(0, 4).map((unit, index) => {
          const box = 38;
          const x = from.centroid.x + (index - (Math.min(event.units.length, 4) - 1) / 2) * 32;
          const y = from.centroid.y + 14;
          return (
            <g key={`${unit.owner}:${unit.type}`} className={`unit-action-unit unit-action-${event.kind}`}>
              <rect
                x={x - box / 2}
                y={y - box / 2}
                width={box}
                height={box}
                rx={4}
                fill={NATIONS[unit.owner].color}
                stroke="var(--parchment)"
                strokeWidth={2}
              />
              <image
                href={UNIT_ICONS[unit.type]}
                x={x - box / 2 + 2}
                y={y - box / 2 + 2}
                width={box - 4}
                height={box - 4}
              />
              {unit.count > 1 && (
                <>
                  <circle cx={x + 12} cy={y - 12} r={8} fill="var(--parchment-ink)" />
                  <text x={x + 12} y={y - 9} textAnchor="middle" fontSize={10} fontWeight={800} fill="var(--parchment)">
                    {unit.count}
                  </text>
                </>
              )}
            </g>
          );
        })}
        <text
          x={from.centroid.x}
          y={from.centroid.y - 18}
          textAnchor="middle"
          className="unit-action-label"
          fill="var(--parchment-ink)"
        >
          {label}
        </text>
      </g>
    </g>
  );
}

function UnitStack({ territory }: { territory: Territory }) {
  const selectedUnitIds = useGame((s) => s.selectedUnitIds);
  const selectedTerritoryId = useGame((s) => s.selectedTerritoryId);
  const toggleUnit = useGame((s) => s.toggleUnit);
  const currentPlayer = useGame((s) => s.game.currentPlayer);
  const aiTurnInProgress = useGame((s) => s.aiTurnInProgress);

  const counts = territory.units.reduce<Record<string, number>>((acc, u) => {
    const k = `${u.owner}:${u.type}`;
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});
  const entries = Object.entries(counts);
  const { x: cx, y: cy } = territory.centroid;

  // Cargo aboard friendly transports — render as a second row below.
  const cargoCounts: Record<string, { ids: string[] }> = {};
  if (territory.isSea) {
    for (const u of territory.units) {
      if (u.type === "transport" && u.cargo && u.cargo.length > 0) {
        for (const c of u.cargo) {
          const k = `${c.owner}:${c.type}`;
          if (!cargoCounts[k]) cargoCounts[k] = { ids: [] };
          cargoCounts[k].ids.push(c.id);
        }
      }
    }
  }
  const cargoEntries = Object.entries(cargoCounts);

  // When a territory holds many unit types, collapse them into one stack
  // that fans out on hover so the map stays readable.
  const collapsed = entries.length > 1;
  const totalUnits = entries.reduce((s, [, n]) => s + (n as number), 0);

  return (
    <g className={collapsed ? "unit-cluster" : undefined}>
      {collapsed && (
        <g className="cluster-collapsed">
          {entries.slice(0, 3).map(([k], i) => {
            const [owner, type] = k.split(":");
            const BOX = 30;
            const ux = cx - 8 + i * 8;
            const uy = cy + 14 - i * 4;
            const fill = owner === "neutral" ? "var(--muted)" : NATIONS[owner as keyof typeof NATIONS].color;
            return (
              <g key={`stack:${k}`}>
                <rect x={ux - BOX / 2} y={uy - BOX / 2} width={BOX} height={BOX} rx={3} fill={fill} stroke="var(--parchment)" strokeWidth={1.5} />
                <image href={UNIT_ICONS[type as UnitType]} x={ux - BOX / 2 + 2} y={uy - BOX / 2 + 2} width={BOX - 4} height={BOX - 4} />
              </g>
            );
          })}
          <circle cx={cx + 16} cy={cy - 2} r={10} fill="var(--parchment-ink)" />
          <text x={cx + 16} y={cy + 2} textAnchor="middle" fontSize={12} fontWeight={800} fill="var(--parchment)">
            {totalUnits}
          </text>
        </g>
      )}
      <g className={collapsed ? "cluster-expanded" : undefined}>
      {entries.map(([k, n], i) => {
        const [owner, type] = k.split(":");
        const BOX = 34;
        const ux = cx - ((entries.length - 1) * (BOX + 2)) / 2 + i * (BOX + 2);
        const uy = cy + 14;
        const isSelectable = territory.id === selectedTerritoryId && owner === currentPlayer;
        const firstUnit = territory.units.find((u) => u.owner === owner && u.type === type);
        const isSelected = firstUnit ? selectedUnitIds.includes(firstUnit.id) : false;
        const fill = owner === "neutral" ? "var(--muted)" : NATIONS[owner as keyof typeof NATIONS].color;
        return (
          <g
            key={k}
            onClick={(e) => {
              if (aiTurnInProgress) return;
              if (!isSelectable) return;
              e.stopPropagation();
              const ids = territory.units
                .filter((u) => u.owner === owner && u.type === type && !u.movedThisTurn)
                .map((u) => u.id);
              for (const id of ids) toggleUnit(id);
            }}
            style={{ cursor: isSelectable ? "pointer" : "default" }}
          >
            <rect
              x={ux - BOX / 2}
              y={uy - BOX / 2}
              width={BOX}
              height={BOX}
              rx={3}
              fill={fill}
              stroke={isSelected ? "var(--accent)" : "var(--parchment)"}
              strokeWidth={isSelected ? 2.5 : 1.5}
            />
            <image
              href={UNIT_ICONS[type as UnitType]}
              x={ux - BOX / 2 + 2}
              y={uy - BOX / 2 + 2}
              width={BOX - 4}
              height={BOX - 4}
              style={{ pointerEvents: "none" }}
            />
            {n > 1 && (
              <g style={{ pointerEvents: "none" }}>
                <circle cx={ux + BOX / 2 - 2} cy={uy - BOX / 2 + 2} r={9} fill="var(--parchment-ink)" />
                <text
                  x={ux + BOX / 2 - 2}
                  y={uy - BOX / 2 + 6}
                  textAnchor="middle"
                  fontSize={12}
                  fontWeight={800}
                  fill="var(--parchment)"
                >
                  {n}
                </text>
              </g>
            )}
          </g>
        );
      })}
      {/* Cargo icons — smaller, with a dashed outline to show they're embarked */}
      {cargoEntries.map(([k, { ids }], i) => {
        const [owner, type] = k.split(":");
        const BOX = 26;
        const ux = cx - ((cargoEntries.length - 1) * (BOX + 2)) / 2 + i * (BOX + 2);
        const uy = cy + 36;
        const isSelectable = territory.id === selectedTerritoryId && owner === currentPlayer;
        const isSelected = selectedUnitIds.includes(ids[0]);
        return (
          <g
            key={`cargo:${k}`}
            onClick={(e) => {
              if (aiTurnInProgress) return;
              if (!isSelectable) return;
              e.stopPropagation();
              for (const id of ids) toggleUnit(id);
            }}
            style={{ cursor: isSelectable ? "pointer" : "default" }}
          >
            <rect
              x={ux - BOX / 2}
              y={uy - BOX / 2}
              width={BOX}
              height={BOX}
              rx={3}
              fill={NATIONS[owner as keyof typeof NATIONS].color}
              stroke={isSelected ? "var(--accent)" : "var(--parchment)"}
              strokeWidth={isSelected ? 2 : 1.2}
              strokeDasharray="2 2"
            />
            <image
              href={UNIT_ICONS[type as UnitType]}
              x={ux - BOX / 2 + 2}
              y={uy - BOX / 2 + 2}
              width={BOX - 4}
              height={BOX - 4}
              style={{ pointerEvents: "none" }}
            />
            {ids.length > 1 && (
              <g style={{ pointerEvents: "none" }}>
                <circle cx={ux + BOX / 2 - 1} cy={uy - BOX / 2 + 1} r={8} fill="var(--parchment-ink)" />
                <text
                  x={ux + BOX / 2 - 1}
                  y={uy - BOX / 2 + 4}
                  textAnchor="middle"
                  fontSize={11}
                  fontWeight={800}
                  fill="var(--parchment)"
                >
                  {ids.length}
                </text>
              </g>
            )}
          </g>
        );
      })}
      </g>
    </g>
  );
}
