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

## Online mode (WebRTC)

Gold Miner supports `?mode=online` using existing signaling message flow (`create_room`, `join_room`, `offer`, `answer`, `ice_candidate`, `heartbeat`, `leave`, `peer_left`) and gameplay packets over RTC data channel (`gm_*`).

Example host: `/games/gold-miner/?mode=online&role=host`
Example guest: `/games/gold-miner/?mode=online&role=guest&room=<ROOM_CODE>`

Runtime lifecycle overlays:
- `ONLINE_WAITING`
- `PLAYING`
- `ONLINE_DISCONNECTED`

## Visuals and audio

The runtime now uses image-driven art in `assets/`:
- `bg-midwest.svg` midwestern background scene
- `miner.svg` miner character sprite
- `claw.svg` claw sprite
- `tex-ground.svg`, `tex-rock.svg`, `tex-gold.svg` repeating texture maps

Audio now includes richer synthesized SFX for fire/dynamite plus level success/failure/shop transitions.
