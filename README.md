# A&A 2025 Campaign

A world strategy game: eight nations, 23 unit types, structures, economy, espionage and
diplomacy on a detailed world map. Play solo against the AI, or online with friends.

**Play:** https://anthonymarino45-bit.github.io/axis-and-allies/

## Playing online with friends

1. Click **🌐 Multiplayer**, enter your name and click **Host game**.
2. Click **Copy invite link** and send it to your friends (Discord, text, anything).
3. Everyone clicks **Claim** on the nations they want. The AI plays every unclaimed nation.
4. The host clicks **Start the match**. Your controls appear on your nation's turn.

The host's browser runs the game (save, turn clock and AI), so the host keeps the tab open.
Players connect peer-to-peer through the free public PeerJS service — no accounts needed.
To use your own PeerJS server instead, set `VITE_PEERJS_HOST`, `VITE_PEERJS_PORT`,
`VITE_PEERJS_PATH` and `VITE_PEERJS_SECURE` at build time.

## Development

```bash
npm install
npm run dev      # http://localhost:8080
npm run build    # type-check and build to dist/
```

- `src/game/` — rules, map, game state (`store.ts`), save/load, multiplayer
- `src/components/` — map, War Room panel, dialogs, multiplayer panel
- `scripts/build-map.ts` — regenerates territory outlines from Natural Earth data
- `roadmap.md` — which rulebook features are implemented

Music and sound: the game plays its own synthesized WW2-era soundtrack — a brass-band march,
big-band swing and a fife-and-drum march (`src/audio/songs.ts`) — through a 78 rpm record filter
with crackle (`src/audio/engine.ts`), plus battle sound effects. To use a real recording instead, add it as `public/audio/march.mp3`.
Each dice roll in a battle involving a human player plays as a cut scene: every unit's die is
shown as it fires, hits strike the units that really died, and the fallen are marked (toggle
cut scenes with the 🎬 button).

## Deploying

Every push to `main` builds the game and publishes it to GitHub Pages
(`.github/workflows/deploy.yml`). One-time setup: repository **Settings → Pages →
Build and deployment → Source: GitHub Actions**.
