import { useEffect, useState } from "react";
import { useGame } from "@/game/store";
import { NATIONS, PLAYER_ORDER } from "@/game/types";
import { inviteLink, normalizeRoomCode, useNet } from "@/game/multiplayer";

/** Floating "Multiplayer" button plus the host / join / seats dialog. */
export function MultiplayerPanel() {
  const mode = useNet((s) => s.mode);
  const open = useNet((s) => s.panelOpen);
  const setOpen = useNet((s) => s.setPanelOpen);
  const roomCode = useNet((s) => s.roomCode);
  const [joinCode, setJoinCode] = useState("");

  // An invite link (?join=CODE) opens the dialog with the code filled in.
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("join");
    if (code) {
      setJoinCode(normalizeRoomCode(code));
      setOpen(true);
    }
  }, [setOpen]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open multiplayer"
        className="fixed left-[6.25rem] top-3 z-40 flex items-center gap-1.5 rounded-md border border-border bg-background/90 px-3 py-2 text-xs font-semibold shadow-lg backdrop-blur hover:bg-muted"
      >
        🌐 {mode === "local" ? "Multiplayer" : `Room ${roomCode}`}
        {mode !== "local" && <span className="h-2 w-2 rounded-full bg-green-600" aria-hidden />}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[55] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-labelledby="mp-title"
            className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-lg border border-border bg-background shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <span className="text-lg">🌐</span>
              <h2 id="mp-title" className="text-sm font-bold uppercase tracking-wider">
                Online Multiplayer
              </h2>
              <button
                type="button"
                aria-label="Close multiplayer"
                onClick={() => setOpen(false)}
                className="ml-auto h-7 w-7 rounded text-sm font-semibold hover:bg-muted"
              >
                ✕
              </button>
            </div>
            <div className="overflow-y-auto p-4 text-sm">
              {mode === "local" ? (
                <StartView joinCode={joinCode} setJoinCode={setJoinCode} />
              ) : (
                <RoomView />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function StartView({
  joinCode,
  setJoinCode,
}: {
  joinCode: string;
  setJoinCode: (v: string) => void;
}) {
  const myName = useNet((s) => s.myName);
  const setMyName = useNet((s) => s.setMyName);
  const status = useNet((s) => s.status);
  const error = useNet((s) => s.error);
  const hostRoom = useNet((s) => s.hostRoom);
  const joinRoom = useNet((s) => s.joinRoom);
  const busy = status === "connecting";

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground">
        Play this campaign with friends over the internet. The host's browser keeps the game;
        friends join with a room code, and each person takes one or more nations. The AI plays every
        nation nobody claims.
      </p>

      <div className="flex flex-col gap-1">
        <label htmlFor="mp-name" className="text-xs font-semibold">
          Your name
        </label>
        <input
          id="mp-name"
          value={myName}
          onChange={(e) => setMyName(e.target.value)}
          placeholder="e.g. Anthony"
          maxLength={24}
          className="rounded border border-border bg-background px-2 py-1.5"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2 rounded-md border border-border p-3">
          <div className="font-semibold">Host a game</div>
          <p className="text-xs text-muted-foreground">
            Shares your current campaign. Keep this tab open while you play.
          </p>
          <button
            type="button"
            onClick={() => hostRoom()}
            disabled={busy}
            className="mt-auto rounded bg-primary px-3 py-2 text-xs font-bold uppercase tracking-wider text-primary-foreground disabled:opacity-50"
          >
            {busy ? "Connecting…" : "Host game"}
          </button>
        </div>
        <form
          className="flex flex-col gap-2 rounded-md border border-border p-3"
          onSubmit={(e) => {
            e.preventDefault();
            joinRoom(joinCode);
          }}
        >
          <label htmlFor="mp-code" className="font-semibold">
            Join a game
          </label>
          <input
            id="mp-code"
            value={joinCode}
            onChange={(e) => setJoinCode(normalizeRoomCode(e.target.value))}
            placeholder="Room code"
            autoComplete="off"
            className="rounded border border-border bg-background px-2 py-1.5 font-mono uppercase tracking-[0.3em]"
          />
          <button
            type="submit"
            disabled={busy || joinCode.length < 4}
            className="mt-auto rounded bg-primary px-3 py-2 text-xs font-bold uppercase tracking-wider text-primary-foreground disabled:opacity-50"
          >
            {busy ? "Connecting…" : "Join game"}
          </button>
        </form>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded border border-destructive/50 bg-destructive/10 p-2 text-xs text-destructive"
        >
          {error}
        </div>
      )}
    </div>
  );
}

function RoomView() {
  const mode = useNet((s) => s.mode);
  const roomCode = useNet((s) => s.roomCode) ?? "";
  const players = useNet((s) => s.players);
  const seats = useNet((s) => s.seats);
  const myId = useNet((s) => s.myId);
  const started = useNet((s) => s.started);
  const claimSeat = useNet((s) => s.claimSeat);
  const releaseSeat = useNet((s) => s.releaseSeat);
  const setStarted = useNet((s) => s.setStarted);
  const leaveRoom = useNet((s) => s.leaveRoom);
  const currentPlayer = useGame((s) => s.game.currentPlayer);
  const isHost = mode === "host";
  const [copied, setCopied] = useState<"" | "code" | "link">("");

  const copy = async (text: string, what: "code" | "link") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      window.setTimeout(() => setCopied(""), 1500);
    } catch {
      window.prompt("Copy this:", text);
    }
  };

  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? "Player";
  const isOnline = (id: string) => players.find((p) => p.id === id)?.online ?? false;
  const mySeats = PLAYER_ORDER.filter((n) => seats[n] === myId);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-md border border-border bg-card p-3">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Room code</div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-2xl font-bold tracking-[0.3em]">{roomCode}</span>
          <button
            type="button"
            onClick={() => copy(roomCode, "code")}
            className="rounded border border-border px-2 py-1 text-xs hover:bg-muted"
          >
            {copied === "code" ? "Copied" : "Copy code"}
          </button>
          <button
            type="button"
            onClick={() => copy(inviteLink(roomCode), "link")}
            className="rounded border border-border px-2 py-1 text-xs hover:bg-muted"
          >
            {copied === "link" ? "Copied" : "Copy invite link"}
          </button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {isHost
            ? "Send the invite link to your friends on Discord. Keep this tab open — the game runs in your browser."
            : "You're connected to the host's game."}
        </p>
      </div>

      <div>
        <div className="mb-1 flex items-baseline justify-between">
          <div className="font-semibold">Nations</div>
          <div className="text-[10px] text-muted-foreground">
            Unclaimed nations are played by the AI
          </div>
        </div>
        <ul className="grid gap-1.5">
          {PLAYER_ORDER.map((n) => {
            const info = NATIONS[n];
            const holder = seats[n];
            const mine = holder === myId;
            const aiBusy = n === currentPlayer && !holder && useGame.getState().aiTurnInProgress;
            return (
              <li
                key={n}
                className="flex items-center gap-2 rounded border border-border px-2 py-1.5"
                style={
                  mine
                    ? {
                        borderColor: info.color,
                        background: `color-mix(in oklab, ${info.color} 12%, transparent)`,
                      }
                    : undefined
                }
              >
                <span
                  className="w-32 shrink-0 truncate font-semibold"
                  style={{ color: info.color }}
                >
                  {info.flag} {info.name}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs">
                  {holder ? (
                    <>
                      <span
                        className={
                          "mr-1 inline-block h-2 w-2 rounded-full " +
                          (isOnline(holder) ? "bg-green-600" : "bg-muted-foreground/50")
                        }
                        title={isOnline(holder) ? "Online" : "Offline"}
                      />
                      {nameOf(holder)}
                      {mine && " (you)"}
                    </>
                  ) : (
                    <span className="text-muted-foreground">🤖 AI</span>
                  )}
                </span>
                {!holder && (
                  <button
                    type="button"
                    onClick={() => claimSeat(n)}
                    disabled={aiBusy}
                    className="rounded border border-border px-2 py-0.5 text-xs hover:bg-muted disabled:opacity-40"
                  >
                    Claim
                  </button>
                )}
                {holder && (mine || isHost) && (
                  <button
                    type="button"
                    onClick={() => releaseSeat(n)}
                    className="rounded border border-border px-2 py-0.5 text-xs hover:bg-muted"
                  >
                    {mine ? "Release" : "Give to AI"}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="text-xs">
        <span className="font-semibold">Players: </span>
        {players.map((p, i) => (
          <span key={p.id} className={p.online ? "" : "text-muted-foreground"}>
            {i > 0 && ", "}
            {p.name}
            {p.id === myId ? " (you)" : ""}
            {!p.online ? " (offline)" : ""}
          </span>
        ))}
      </div>

      {isHost ? (
        <button
          type="button"
          onClick={() => setStarted(!started)}
          className="rounded bg-primary px-3 py-2 text-xs font-bold uppercase tracking-wider text-primary-foreground"
        >
          {started ? "⏸ Hold the match (stops clocks and AI)" : "▶ Start the match"}
        </button>
      ) : (
        <div className="rounded border border-border bg-muted/40 p-2 text-center text-xs">
          {started
            ? mySeats.length
              ? "The match is on. Your controls appear on your nation's turn."
              : "The match is on. Claim a free nation to join in, or watch."
            : "Claim a nation, then wait for the host to start the match."}
        </div>
      )}

      <button
        type="button"
        onClick={() => leaveRoom()}
        className="rounded border border-border px-3 py-1.5 text-xs hover:bg-muted"
      >
        {isHost ? "Close room" : "Leave room"}
      </button>
    </div>
  );
}

/** Short status line in the War Room showing whose turn it is online. */
export function OnlineTurnBanner() {
  const mode = useNet((s) => s.mode);
  const seats = useNet((s) => s.seats);
  const players = useNet((s) => s.players);
  const myId = useNet((s) => s.myId);
  const started = useNet((s) => s.started);
  const roomCode = useNet((s) => s.roomCode);
  const setOpen = useNet((s) => s.setPanelOpen);
  const current = useGame((s) => s.game.currentPlayer);
  if (mode === "local") return null;

  const holder = seats[current];
  const info = NATIONS[current];
  let text: string;
  if (!started)
    text = mode === "host" ? "Waiting for you to start the match" : "Waiting for the host to start";
  else if (holder === myId) text = `Your turn — ${info.flag} ${info.name}`;
  else if (holder)
    text = `${players.find((p) => p.id === holder)?.name ?? "Player"} is playing ${info.flag} ${info.name}`;
  else text = `🤖 AI is playing ${info.flag} ${info.name}`;

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className={
        "rounded-md border p-2 text-left text-xs " +
        (started && holder === myId
          ? "border-primary bg-primary/10 font-semibold"
          : "border-border bg-card")
      }
    >
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
        Online · Room {roomCode}
      </div>
      {text}
    </button>
  );
}
