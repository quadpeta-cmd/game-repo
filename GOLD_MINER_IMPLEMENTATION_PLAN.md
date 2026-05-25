# Gold Miner implementation plan for Codex Cloud

This file is intended to be pasted directly into the project repo, for example as:

```txt
GOLD_MINER_IMPLEMENTATION_PLAN.md
```

Primary instruction to Codex: **implement a close Gold Miner-style browser game as a deterministic, heavily tested canvas arcade engine. Do not rebuild the GameHub. Add one new game using the existing hub, iframe, signaling, and test style.**

---

## 0. Existing repo context Codex must respect

The project already has a working GameHub structure.

Known current scripts from the root `package.json`:

```json
{
  "dev:web": "npm --prefix apps/web run dev",
  "dev:signaling": "npm --prefix services/signaling run dev",
  "build": "npm --prefix apps/web run build",
  "preview": "npm --prefix apps/web run preview",
  "test:pong-solo": "node --test apps/web/public/games/pong-solo/game-logic.test.mjs",
  "test:pong-online": "node --test apps/web/public/games/pong-online/game-logic.test.mjs",
  "test:dodger": "node --test apps/web/public/games/dodger/game-logic.test.mjs",
  "test:games:runtime": "node scripts/game-runtime-smoke.mjs",
  "test:games": "npm run test:pong-solo && npm run test:pong-online && npm run test:dodger && npm run test:games:runtime"
}
```

Known current games list:

```json
[
  "dodger",
  "pong",
  "pong-online",
  "pong-solo"
]
```

The hub has a `/play/:gameId` route and loads games in an iframe. The existing iframe sandbox is:

```tsx
sandbox="allow-scripts allow-pointer-lock"
referrerPolicy="no-referrer"
```

Keep this isolation model. Do not add `allow-same-origin` for Gold Miner.

The existing online game model uses:

- web app on port `5173`
- signaling server on port `8787`
- WebSocket signaling for room setup
- WebRTC data channels for actual gameplay packets

Do not create a second signaling server for Gold Miner.

---

## 13. Immediate next Codex task to run

```txt
Read GOLD_MINER_IMPLEMENTATION_PLAN.md and implement PR 1 only.

Implement the Gold Miner shared core engine under apps/web/public/games/gold-miner/core.
Do not build the full browser UI yet.

Requirements:
- deterministic seeded RNG
- level generator
- object definitions with values, weights, radii
- player/claw state machine
- collision using segment-circle tests
- scoring and timer
- item effects calculations
- replay runner
- checksum function
- at least 30 node:test tests
- add npm script test:gold-miner
- update npm run test:games

Do not duplicate online signaling.
Do not add React code.
Do not add Playwright in this PR.
Do not implement final assets yet.

Run:
- npm run test:gold-miner
- npm run test:games

Open a small PR with a clear test plan.
```
