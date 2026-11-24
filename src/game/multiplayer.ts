/**
 * Online multiplayer over peer-to-peer WebRTC (PeerJS).
 *
 * The host's browser is the referee. It keeps the campaign, runs the turn
 * clock and plays every nation nobody has claimed. Whoever holds the seat of
 * the nation whose turn it is plays on their own screen; each change to the
 * game is sent to the host, checked, and relayed to everyone else. Nobody can
 * change the game out of turn, so there is only ever one writer at a time.
 */
import { create } from "zustand";
import type { DataConnection, Peer } from "peerjs";
import { useGame } from "./store";
import { AI_NATIONS, PLAYER_ORDER, TURN_SECONDS, type GameState, type Nation } from "./types";
import { setControlResolver, type ControlResolver } from "./control";
import { loadSavedCampaign, rehydrateGame, slimGame } from "./persistence";
import { createInitialState } from "./initialState";

type Mode = "local" | "host" | "guest";
type Status = "idle" | "connecting" | "connected" | "error";

export interface NetPlayer {
  id: string;
  name: string;
  online: boolean;
}

type Seats = Partial<Record<Nation, string>>;

interface NetStore {
  mode: Mode;
  status: Status;
  error: string | null;
  roomCode: string | null;
  myId: string;
  myName: string;
  players: NetPlayer[];
  seats: Seats;
  /** The host has started the match: clocks run and AI nations move. */
  started: boolean;
  panelOpen: boolean;
  setPanelOpen: (open: boolean) => void;
  setMyName: (name: string) => void;
  hostRoom: () => Promise<void>;
  joinRoom: (code: string) => Promise<void>;
  leaveRoom: (reason?: string) => void;
  claimSeat: (nation: Nation) => void;
  releaseSeat: (nation: Nation) => void;
  setStarted: (started: boolean) => void;
}

// ---------------------------------------------------------------------------
// Wire format
// ---------------------------------------------------------------------------

interface Snapshot {
  game: GameState;
  pendingBattle: unknown;
  mapAnimation: unknown;
  turnSecondsLeft: number;
  paused: boolean;
}

type Msg =
  | { t: "hello"; id: string; name: string }
  | { t: "lobby"; players: NetPlayer[]; seats: Seats; started: boolean }
  | { t: "state"; snap: Snapshot }
  | { t: "clock"; secs: number; paused: boolean }
  | { t: "claim"; nation: Nation }
  | { t: "release"; nation: Nation }
  | { t: "pause" }
  | { t: "bye"; reason: string };

const PEER_PREFIX = "aa25-campaign-";
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ID_KEY = "aa-mp-client-id";
const NAME_KEY = "aa-mp-name";

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeStorage(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage blocked — the value lasts for this visit only.
  }
}

function randomCode(len: number): string {
  let out = "";
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  for (const b of bytes) out += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return out;
}

function clientId(): string {
  if (typeof window === "undefined") return "server";
  let id = readStorage(ID_KEY);
  if (!id) {
    id = `p_${randomCode(12)}`;
    writeStorage(ID_KEY, id);
  }
  return id;
}

export function normalizeRoomCode(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/^.*[?&]JOIN=/, "")
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);
}

export function inviteLink(code: string): string {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("join", code);
  return url.toString();
}

/** Optional self-hosted PeerJS server (defaults to the free public one). */
function peerOptions() {
  const env = import.meta.env;
  const opts: Record<string, unknown> = { debug: 1 };
  if (env.VITE_PEERJS_HOST) {
    opts.host = env.VITE_PEERJS_HOST;
    opts.port = Number(env.VITE_PEERJS_PORT || 443);
    opts.path = env.VITE_PEERJS_PATH || "/";
    opts.secure = env.VITE_PEERJS_SECURE !== "false";
  }
  return opts;
}

async function createPeer(id?: string): Promise<Peer> {
  const { Peer } = await import("peerjs");
  return new Promise((resolve, reject) => {
    const peer = id ? new Peer(id, peerOptions()) : new Peer(peerOptions());
    const onError = (err: unknown) => {
      peer.off("open", onOpen);
      peer.destroy();
      reject(err);
    };
    const onOpen = () => {
      peer.off("error", onError);
      resolve(peer);
    };
    peer.once("open", onOpen);
    peer.once("error", onError);
  });
}

function describeError(err: unknown): string {
  const type = (err as { type?: string })?.type;
  if (type === "peer-unavailable")
    return "No game found with that code. Check the code and that the host is still online.";
  if (type === "unavailable-id") return "That room code is already in use. Try hosting again.";
  if (type === "network" || type === "server-error" || type === "socket-error")
    return "Couldn't reach the matchmaking server. Check your internet connection and try again.";
  if (type === "browser-incompatible")
    return "This browser doesn't support online play. Try Chrome, Edge or Firefox.";
  return (err as Error)?.message || "Something went wrong with the connection.";
}

// ---------------------------------------------------------------------------
// Connection state (outside React)
// ---------------------------------------------------------------------------

let peer: Peer | null = null;
/** Host: one connection per guest, keyed by the guest's client id. */
const guests = new Map<string, DataConnection>();
/** Guest: the connection to the host. */
let hostConn: DataConnection | null = null;
/** Set while a snapshot from the network is being applied. */
let applyingRemote = false;

function send(conn: DataConnection | null | undefined, msg: Msg) {
  if (!conn || !conn.open) return;
  try {
    conn.send(JSON.stringify(msg));
  } catch {
    // A dropped channel is handled by its close event.
  }
}

function broadcast(msg: Msg, exceptId?: string) {
  for (const [id, conn] of guests) if (id !== exceptId) send(conn, msg);
}

function snapshot(): Snapshot {
  const s = useGame.getState();
  return {
    game: slimGame(s.game),
    pendingBattle: s.pendingBattle,
    mapAnimation: s.mapAnimation,
    turnSecondsLeft: s.turnSecondsLeft,
    paused: s.paused,
  };
}

function applySnapshot(snap: Snapshot): boolean {
  const game = rehydrateGame(snap.game);
  if (!game) return false;
  const local = useGame.getState();
  const myTurn = canAct(game.currentPlayer);
  applyingRemote = true;
  try {
    useGame.setState({
      game,
      pendingBattle: snap.pendingBattle as typeof local.pendingBattle,
      mapAnimation: snap.mapAnimation as typeof local.mapAnimation,
      turnSecondsLeft: snap.turnSecondsLeft,
      paused: snap.paused,
      // Someone else's move can invalidate what this player had selected.
      ...(myTurn ? {} : { moveDialog: null, selectedUnitIds: [], bombardTargeting: false }),
    });
  } finally {
    applyingRemote = false;
  }
  return true;
}

function lobbyMsg(): Msg {
  const { players, seats, started } = useNet.getState();
  return { t: "lobby", players, seats, started };
}

function pushLobby() {
  broadcast(lobbyMsg());
}

// ---------------------------------------------------------------------------
// Control rules
// ---------------------------------------------------------------------------

/** May this browser's human make moves for `nation` right now? */
function canAct(nation: Nation): boolean {
  const net = useNet.getState();
  if (net.mode === "local") return true;
  return net.started && net.seats[nation] === net.myId;
}

const onlineControl: ControlResolver = {
  isAI: (nation) => !useNet.getState().seats[nation],
  canMutate: (current) => {
    const net = useNet.getState();
    if (!net.started) return false;
    if (net.seats[current] === net.myId) return true;
    return net.mode === "host" && !net.seats[current];
  },
  canRunAI: () => {
    const net = useNet.getState();
    return net.mode === "host" && net.started;
  },
  persistLocally: () => useNet.getState().mode !== "guest",
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useNet = create<NetStore>((set, get) => ({
  mode: "local",
  status: "idle",
  error: null,
  roomCode: null,
  myId: typeof window === "undefined" ? "server" : clientId(),
  myName: (typeof window !== "undefined" && readStorage(NAME_KEY)) || "",
  players: [],
  seats: {},
  started: false,
  panelOpen: false,

  setPanelOpen: (open) => set({ panelOpen: open }),

  setMyName: (name) => {
    const clean = name.slice(0, 24);
    set({ myName: clean });
    writeStorage(NAME_KEY, clean);
  },

  hostRoom: async () => {
    if (get().mode !== "local") return;
    set({ status: "connecting", error: null });
    const name = get().myName.trim() || "Host";
    // Retry a couple of times in the unlikely case a code is taken.
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const code = randomCode(5);
      try {
        peer = await createPeer(PEER_PREFIX + code);
        set({
          mode: "host",
          status: "connected",
          roomCode: code,
          players: [{ id: get().myId, name, online: true }],
          seats: {},
          started: false,
        });
        setControlResolver(onlineControl);
        wireHostPeer(peer);
        return;
      } catch (err) {
        lastErr = err;
        if ((err as { type?: string })?.type !== "unavailable-id") break;
      }
    }
    set({ status: "error", error: describeError(lastErr) });
  },

  joinRoom: async (rawCode) => {
    if (get().mode !== "local") return;
    const code = normalizeRoomCode(rawCode);
    if (code.length < 4) {
      set({ status: "error", error: "Enter the room code your host gave you." });
      return;
    }
    set({ status: "connecting", error: null });
    try {
      peer = await createPeer();
      const conn = peer.connect(PEER_PREFIX + code, { reliable: true });
      hostConn = conn;
      peer.on("error", (err) => {
        if (get().status === "connecting") {
          get().leaveRoom();
          set({ status: "error", error: describeError(err) });
        }
      });
      const timeout = window.setTimeout(() => {
        if (get().status === "connecting") {
          get().leaveRoom();
          set({
            status: "error",
            error:
              "The host didn't answer. Check the code, and that the host still has the game open.",
          });
        }
      }, 15000);
      conn.on("open", () => {
        window.clearTimeout(timeout);
        set({ mode: "guest", roomCode: code, status: "connected" });
        setControlResolver(onlineControl);
        send(conn, { t: "hello", id: get().myId, name: get().myName.trim() || "Guest" });
      });
      conn.on("data", (raw) => onGuestData(raw));
      conn.on("close", () => {
        if (get().mode === "guest") get().leaveRoom("The host closed the game.");
      });
    } catch (err) {
      get().leaveRoom();
      set({ status: "error", error: describeError(err) });
    }
  },

  leaveRoom: (reason) => {
    const wasGuest = get().mode === "guest";
    if (get().mode === "host") broadcast({ t: "bye", reason: "The host closed the game." });
    for (const conn of guests.values()) conn.close();
    guests.clear();
    hostConn?.close();
    hostConn = null;
    peer?.destroy();
    peer = null;
    setControlResolver(null);
    set({
      mode: "local",
      status: reason ? "error" : "idle",
      error: reason ?? null,
      roomCode: null,
      players: [],
      seats: {},
      started: false,
    });
    if (wasGuest) {
      // Put this player's own campaign back on the board.
      const saved = loadSavedCampaign();
      applyingRemote = true;
      useGame.setState({
        game: saved?.game ?? createInitialState(),
        turnSecondsLeft: saved?.turnSecondsLeft ?? TURN_SECONDS,
        paused: saved?.paused ?? false,
        pendingBattle: null,
        moveDialog: null,
        mapAnimation: null,
        selectedTerritoryId: null,
        selectedUnitIds: [],
        aiTurnInProgress: false,
      });
      applyingRemote = false;
    }
  },

  claimSeat: (nation) => {
    const net = get();
    if (net.mode === "guest") return send(hostConn, { t: "claim", nation });
    if (net.mode === "host") hostClaim(net.myId, nation);
  },

  releaseSeat: (nation) => {
    const net = get();
    if (net.mode === "guest") return send(hostConn, { t: "release", nation });
    if (net.mode === "host") hostRelease(net.myId, nation, true);
  },

  setStarted: (started) => {
    if (get().mode !== "host") return;
    set({ started });
    pushLobby();
  },
}));

// ---------------------------------------------------------------------------
// Host side
// ---------------------------------------------------------------------------

function hostClaim(playerId: string, nation: Nation) {
  const net = useNet.getState();
  if (net.seats[nation]) return;
  const g = useGame.getState();
  // Don't pull a nation out from under the AI halfway through its turn.
  if (g.aiTurnInProgress && g.game.currentPlayer === nation) return;
  useNet.setState({ seats: { ...net.seats, [nation]: playerId } });
  pushLobby();
}

function hostRelease(playerId: string, nation: Nation, isHost: boolean) {
  const net = useNet.getState();
  const holder = net.seats[nation];
  if (!holder) return;
  // Players free their own seats; the host can free anyone's.
  if (holder !== playerId && !isHost) return;
  const seats = { ...net.seats };
  delete seats[nation];
  useNet.setState({ seats });
  pushLobby();
}

function wireHostPeer(p: Peer) {
  p.on("connection", (conn) => {
    let guestId: string | null = null;
    conn.on("data", (raw) => {
      let msg: Msg;
      try {
        msg = JSON.parse(String(raw)) as Msg;
      } catch {
        return;
      }
      if (msg.t === "hello") {
        guestId = String(msg.id).slice(0, 40);
        const name = String(msg.name || "Guest").slice(0, 24);
        guests.get(guestId)?.close();
        guests.set(guestId, conn);
        const net = useNet.getState();
        const others = net.players.filter((x) => x.id !== guestId);
        useNet.setState({ players: [...others, { id: guestId, name, online: true }] });
        send(conn, { t: "state", snap: snapshot() });
        pushLobby();
        return;
      }
      if (!guestId) return;
      if (msg.t === "state") return hostReceiveState(guestId, conn, msg.snap);
      if (msg.t === "claim" && PLAYER_ORDER.includes(msg.nation))
        return hostClaim(guestId, msg.nation);
      if (msg.t === "release" && PLAYER_ORDER.includes(msg.nation))
        return hostRelease(guestId, msg.nation, false);
      if (msg.t === "pause") return useGame.getState().togglePause();
    });
    conn.on("close", () => {
      if (!guestId || guests.get(guestId) !== conn) return;
      guests.delete(guestId);
      const net = useNet.getState();
      useNet.setState({
        players: net.players.map((x) => (x.id === guestId ? { ...x, online: false } : x)),
      });
      pushLobby();
    });
  });
  p.on("disconnected", () => {
    // Lost the matchmaking server; existing games keep running. Reconnect so
    // new players can still find the room.
    if (useNet.getState().mode === "host" && !p.destroyed) p.reconnect();
  });
}

function hostReceiveState(guestId: string, conn: DataConnection, snap: Snapshot) {
  const net = useNet.getState();
  const current = useGame.getState().game.currentPlayer;
  // Only the player whose turn it is may change the game. Anything else is
  // stale (e.g. the clock ran out mid-move): send them the real state.
  if (!net.started || net.seats[current] !== guestId) {
    send(conn, { t: "state", snap: snapshot() });
    return;
  }
  if (!applySnapshot(snap)) return;
  broadcast({ t: "state", snap: snapshot() }, guestId);
}

// ---------------------------------------------------------------------------
// Guest side
// ---------------------------------------------------------------------------

function onGuestData(raw: unknown) {
  let msg: Msg;
  try {
    msg = JSON.parse(String(raw)) as Msg;
  } catch {
    return;
  }
  if (msg.t === "state") {
    applySnapshot(msg.snap);
  } else if (msg.t === "lobby") {
    useNet.setState({ players: msg.players, seats: msg.seats, started: msg.started });
  } else if (msg.t === "clock") {
    applyingRemote = true;
    useGame.setState({ turnSecondsLeft: msg.secs, paused: msg.paused });
    applyingRemote = false;
  } else if (msg.t === "bye") {
    useNet.getState().leaveRoom(msg.reason);
  }
}

// ---------------------------------------------------------------------------
// Outgoing sync: watch the game store and share local changes
// ---------------------------------------------------------------------------

let sendTimer: ReturnType<typeof setTimeout> | null = null;

function flushOutgoing() {
  sendTimer = null;
  const { mode } = useNet.getState();
  const msg: Msg = { t: "state", snap: snapshot() };
  if (mode === "host") broadcast(msg);
  else if (mode === "guest") send(hostConn, msg);
}

if (typeof window !== "undefined") {
  useGame.subscribe((state, prev) => {
    const { mode } = useNet.getState();
    if (mode === "local" || applyingRemote) return;
    const gameChanged =
      state.game !== prev.game ||
      state.pendingBattle !== prev.pendingBattle ||
      state.mapAnimation !== prev.mapAnimation;
    if (gameChanged) {
      // Coalesce bursts (AI turns, battle rounds) into one message.
      if (!sendTimer) sendTimer = setTimeout(flushOutgoing, 120);
      return;
    }
    if (
      mode === "host" &&
      (state.turnSecondsLeft !== prev.turnSecondsLeft || state.paused !== prev.paused)
    ) {
      broadcast({ t: "clock", secs: state.turnSecondsLeft, paused: state.paused });
    }
  });

  window.addEventListener("beforeunload", () => {
    if (useNet.getState().mode === "host")
      broadcast({ t: "bye", reason: "The host closed the game." });
  });
}

// ---------------------------------------------------------------------------
// Action guards: in an online room, game actions only run for the player
// whose turn it is (or for the host, on behalf of AI nations).
// ---------------------------------------------------------------------------

const TURN_ACTIONS = [
  "setGameDay",
  "proposeContract",
  "respondContract",
  "cancelContract",
  "openMoveDialog",
  "confirmMove",
  "buyUnit",
  "buyFactory",
  "buildStructure",
  "upgradeStructure",
  "dismantleHedgehogs",
  "rollBattleRound",
  "retreatBattle",
  "closeBattle",
  "endTurn",
  "sellVictoryPoint",
  "rollStockMarket",
  "sellBonds",
  "dayTrade",
  "scrapUnit",
  "claimInfirmaryInfantry",
  "drawWarehouseCard",
  "armAbomb",
  "abombStrike",
  "bombardTerritory",
  "trainSpy",
  "runSpyMission",
  "loadCargo",
  "unloadCargo",
  "airdropCargo",
  "piracyRaid",
  "kamikazeStrike",
  "bombingRun",
] as const;

type AnyFn = (...args: unknown[]) => unknown;

function installGuards() {
  const state = useGame.getState() as unknown as Record<string, AnyFn>;
  const patch: Record<string, AnyFn> = {};
  for (const name of TURN_ACTIONS) {
    const original = state[name];
    if (typeof original !== "function") continue;
    patch[name] = (...args) => {
      if (useNet.getState().mode !== "local") {
        const current = useGame.getState().game.currentPlayer;
        if (!onlineControl.canMutate(current)) return undefined;
      }
      return original(...args);
    };
  }
  const tick = state.tickTimer;
  patch.tickTimer = () => {
    const net = useNet.getState();
    if (net.mode === "guest") return undefined;
    if (net.mode === "host" && !net.started) return undefined;
    return tick();
  };
  const runAI = state.runAITurn;
  patch.runAITurn = () => {
    const net = useNet.getState();
    if (net.mode !== "local") {
      const current = useGame.getState().game.currentPlayer;
      if (!(net.mode === "host" && net.started && !net.seats[current])) return Promise.resolve();
    }
    return runAI();
  };
  const pause = state.togglePause;
  patch.togglePause = () => {
    if (useNet.getState().mode === "guest") return send(hostConn, { t: "pause" });
    return pause();
  };
  const reset = state.reset;
  patch.reset = () => {
    if (useNet.getState().mode === "guest") return undefined;
    return reset();
  };
  useGame.setState(patch as never);
}

if (typeof window !== "undefined") installGuards();

// ---------------------------------------------------------------------------
// React helpers
// ---------------------------------------------------------------------------

/** True when the person at this screen can take actions this turn. */
export function useCanAct(): boolean {
  const current = useGame((s) => s.game.currentPlayer);
  const mode = useNet((s) => s.mode);
  const seats = useNet((s) => s.seats);
  const myId = useNet((s) => s.myId);
  const started = useNet((s) => s.started);
  if (mode === "local") return !AI_NATIONS.includes(current);
  return started && seats[current] === myId;
}

/** Name of whoever holds a nation's seat, or null if the AI plays it. */
export function seatHolderName(nation: Nation): string | null {
  const { seats, players } = useNet.getState();
  const id = seats[nation];
  if (!id) return null;
  return players.find((p) => p.id === id)?.name ?? "Player";
}
