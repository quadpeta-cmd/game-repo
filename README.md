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

Note: opening `http://localhost:5173/games/pong-online/index.html` loads the raw game page directly (not the hub Play wrapper), so it will look different from hub screenshots.

## Build and preview

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
