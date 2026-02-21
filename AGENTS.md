## Sandbox rules (enforced)

The Play page must load games in an iframe with:

- `sandbox="allow-scripts allow-pointer-lock"` (MVP)
- Do **not** use `allow-same-origin` in MVP.
- Do **not** allow popups, top navigation, forms, or downloads unless explicitly added later.

Also:

- Set `referrerPolicy="no-referrer"` on the iframe.
- Do not expose hub secrets/cookies to games.

## SDK / Bridge (Phase 2+ direction)

Do not overbuild SDK in MVP, but design MVP so this can be added cleanly.

Planned approach:

- A `postMessage` bridge where:
  - Game -> Host: `GameHub.request({ type, payload, requestId })`
  - Host -> Game: `GameHub.response({ requestId, ok, result | error })`
- Host enforces permissions from `manifest.json`.

Initial SDK capabilities (Phase 2):

- storage (namespaced per game id)
- audio wrapper
- basic telemetry hooks

Networking/multiplayer permissions come later.

## Tech choices (default)

- Web hub: **Vite + React + TypeScript**
- Routing: `react-router-dom`
- Docker: multi-stage build + nginx static serving
- Target: modern evergreen browsers (Chrome, Edge, Safari, Firefox)

## Local development & testing requirements

Must support:

- `npm install && npm run dev`
- `npm run build` and `npm run preview`
- `docker compose up --build` serving at `http://localhost:8080`

Keep scripts simple and documented in `README.md`.

## Code quality expectations

- Keep PRs small and reviewable; prefer multiple PRs over one huge PR.
- Avoid heavy dependencies unless necessary.
- No inline secrets; use env vars where needed.
- Prefer strict TypeScript for platform code.

## Codex workflow

For each task:

1. Explain what files will change.
2. Implement changes.
3. Ensure `npm run build` succeeds.
4. Update `README.md` if workflows change.
5. Open a PR with a concise description.

## Roadmap (do not implement unless requested)

- Phase 2: `postMessage` SDK bridge + permissions
- Phase 2: offline “download for offline” via service worker caching
- Phase 3: signaling service (websocket) for WebRTC P2P
- Phase 3: one online 2-player demo game
- Phase 4: validation + template-based AI game generation pipeline
- Phase 5: MMO-like tier (authoritative servers), optional