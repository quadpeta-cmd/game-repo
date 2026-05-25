# Game Hub MVP

Vite + React + TypeScript hub app lives at `apps/web`.

## Local development

Install dependencies:

```bash
npm install --prefix apps/web
npm install --prefix services/signaling
```

Run web hub (terminal 1):

```bash
npm run dev:web
```

Run signaling server (terminal 2):

```bash
npm run dev:signaling
```

Ports:

- Hub (Vite dev): `http://localhost:5173`
- Signaling (WebSocket): `ws://localhost:8787`


### What you should see in dev

When you run:

```bash
npm --prefix apps/web run dev -- --host 0.0.0.0
```

Vite starts the hub app, and the default page at `http://localhost:5173/` is the **catalog** view.

To see the Pong Online screen used in validation screenshots, open:

- `http://localhost:5173/play/pong-online` (hub Play route, game rendered inside iframe)
- `http://localhost:5173/play/pong-online?debug=1` (same route, with in-game debug panel/logs enabled)

Note: opening `http://localhost:5173/games/pong-online/index.html` loads the raw game page directly (not the hub Play wrapper), so it will look different from hub screenshots.

## Build and preview

Run web game unit tests:

```bash
npm --prefix apps/web run test
```


Run full game checks (logic + runtime smoke + hub click-through smoke + built hub artifact smoke):

```bash
npm run test:games
```

Run only the hub Play click-through smoke test:

```bash
npm run test:hub:play-smoke
```

Run the post-build hub artifact smoke test (verifies built Gold Miner entry exists and includes canvas/bootstrap):

```bash
npm run build && npm run test:hub:build-smoke
```

Run the real-browser iframe regression check (requires Playwright browsers):

```bash
npm run test:hub:e2e
```

If this fails with `Executable doesn't exist` for Chromium, install the browser binary first:

```bash
cd apps/web && npx playwright install chromium
```

If your environment blocks `https://cdn.playwright.dev` (for example `403 Domain forbidden`), use one of these approaches:

- pre-bake Chromium in the CI/devcontainer image and point Playwright at it via `PLAYWRIGHT_BROWSERS_PATH`
- allowlist Playwright CDN downloads for the build environment


For locked-down environments where Playwright CDN downloads are blocked, run e2e in the pre-baked Playwright container (Chromium already installed):

```bash
npm run test:hub:e2e:docker
```

Docker prerequisites (required):
- Docker CLI installed (`docker --version`)
- Docker Compose v2 plugin available (`docker compose version`)
- Docker daemon running (`docker info`)

The script performs these checks and fails with actionable errors if any requirement is missing.

This uses `mcr.microsoft.com/playwright:v1.54.0-jammy` and sets `PLAYWRIGHT_BROWSERS_PATH=/ms-playwright` inside the container.
Build the web app:

```bash
npm run build
```

Preview production web bundle:

```bash
npm run preview
```

`npm run build` regenerates `apps/web/public/games/index.json` before bundling.

## Docker

```bash
docker compose up --build
```

Ports:

- Hub (nginx static): `http://localhost:8080`
- Signaling (WebSocket): `ws://localhost:8787`

## Codespaces / remote environments

Forward these ports:

- `5173` (web dev) or `8080` (docker web)
- `8787` (signaling)

If your forwarded URLs are HTTPS, WebSocket upgrades should use `wss://` automatically.

## Playing `pong-online`

1. Open the hub in browser/device A and launch **Pong Online** from catalog.
2. Click **Create room** and copy the room code.
3. Open the hub in browser/device B, launch **Pong Online**, enter code, click **Join room**.
4. Wait for status `connected` on both sides.
5. Controls: `W/S` or `↑/↓`.

Networking model:

- Signaling server handles only `create_room`, `join_room`, `offer`, `answer`, `ice_candidate`, `leave`.
- Gameplay packets (inputs + state snapshots) are sent only through WebRTC data channel (P2P).

## Test plan: verifying 2-player connectivity quickly

This plan is designed around the current implementation:

- Hub app hosts the game in `/play/pong-online` inside an iframe.
- Signaling uses WebSocket on `ws://localhost:8787`.
- Gameplay transport is WebRTC data channel (P2P).

### 1) Define clear pass/fail gates

Before each test run, use these exact gates:

1. **Room setup:** player A gets `room_created`; player B gets `room_joined`.
2. **Peer handshake:** player A receives `peer_joined`.
3. **Session health:** both players show status `connected`.
4. **Gameplay sync:** paddle movement from each player is reflected remotely within ~250 ms on same LAN.
5. **Disconnect behavior:** if one player closes tab, other gets `peer_left` and can recover by creating/joining a new room.

If any gate fails, log which gate failed first; do not continue to later gates.

### 2) Run a deterministic local baseline (single machine, two browser contexts)

Use this first to remove WAN/NAT variables:

1. Start hub and signaling:
   - `npm run dev:web`
   - `npm run dev:signaling`
2. Open two isolated contexts:
   - Window A: normal profile
   - Window B: incognito/private profile
3. In both windows open `http://localhost:5173/play/pong-online`.
4. Execute create/join flow and validate all five gates above.

Record:

- Browser/version for A and B
- Time-to-connected
- Any console/network errors

### 3) Add a browser matrix (same machine)

After local baseline passes, run:

- Chrome ↔ Chrome
- Chrome ↔ Firefox
- Safari ↔ Chrome (if available)
- Edge ↔ Chrome (if available)

Why this matters: SDP/data-channel behavior can vary by browser pair.

### 4) Validate real network path (two devices)

Run with two separate devices on:

1. Same LAN
2. Different networks (for example home Wi-Fi vs mobile hotspot)

For each run, capture:

- Whether `connected` was reached
- Time-to-connected
- Whether gameplay remained synchronized for 3 minutes

If cross-network fails while same-LAN passes, treat as NAT traversal/STUN/TURN gap, not gameplay logic regression.

### 5) Add lightweight observability for faster iteration

Use only temporary dev instrumentation (console logs) and keep it small:

- In signaling server: log `create_room`, `join_room`, `offer`, `answer`, `ice_candidate`, `leave`, `peer_left` with room code and role.
- In game client: log WebRTC state transitions (`iceConnectionState`, `connectionState`, data-channel open/close).

Store logs per run in a timestamped file so failed sessions can be compared.

### 6) Create a repeatable test checklist per PR

For every multiplayer-related PR:

1. Run deterministic local baseline.
2. Run at least one cross-browser pair.
3. Run one disconnect/reconnect scenario.
4. Attach outcome summary:
   - pass/fail by gate
   - browser pair(s)
   - any failed step + first error observed

### 7) Next automation step (without overbuilding)

Automate signaling protocol checks first (cheap, high value):

- script two WebSocket clients against `services/signaling/server.js`
- assert expected server behavior:
  - create/join success path
  - room full rejection
  - unknown room rejection
  - relay message forwarding (`offer/answer/ice_candidate`)
  - leave/peer_left behavior

This will not prove full WebRTC success, but it quickly catches regressions in room lifecycle and signaling flow.

## Gold Miner variants

- Solo: `/play/gold-miner`
- Local 2-player co-op: `/play/gold-miner-coop`
- Online 2-player: `/play/gold-miner-online?role=host` and `/play/gold-miner-online?role=guest&room=<ROOM_CODE>`
