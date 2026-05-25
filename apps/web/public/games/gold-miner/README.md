# Gold Miner

## Modes

- `?mode=solo` (default)
- `?mode=coop`
- `?mode=versus`

## Controls

### Solo
- `ArrowDown` or `Space`: fire
- `ArrowUp` or `D`: dynamite
- `P`: pause
- `R`: restart

### Local 2P (coop/versus)
- Player 1: `S` fire, `W` dynamite
- Player 2: `ArrowDown` fire, `ArrowUp` dynamite

## Test harness

When loaded, `window.__goldMinerTest` exposes deterministic helpers:
- `step(ticks)`
- `press(playerId, action, value)`
- `runReplay(frames, maxTicks)`
- `getState()`
- `getChecksum()`
- `setSeed(seed)`
- `reset(config)`

## Commands

- `npm run test:gold-miner`
- `npm run test:games`
- `npm run build`
