(() => {
  // apps/web/public/games/gold-miner/core/constants.mjs
  var WORLD = {
    width: 800,
    height: 500,
    hudHeight: 64,
    mineTop: 72,
    mineBottom: 492,
    clawOrigin1P: { x: 400, y: 76 },
    clawOriginP1: { x: 315, y: 76 },
    clawOriginP2: { x: 485, y: 76 }
  };
  var TIMING = {
    fixedDtMs: 1e3 / 60,
    levelSecondsBase: 60,
    timerWarningSeconds: 10
  };
  var CLAW = {
    minAngleRad: -1.15,
    maxAngleRad: 1.15,
    swingSpeedRadPerSec: 1.65,
    extendSpeedPxPerSec: 520,
    emptyRetractSpeedPxPerSec: 650,
    maxLengthPx: 455,
    hitRadiusPx: 16
  };
  var LEVEL_TARGETS = [650, 1e3, 1500, 2200, 3100, 4300, 5600, 7200, 9e3, 11e3];
  var OBJECT_TYPES = {
    gold_tiny: { value: 50, weight: 0.55, radius: 14 },
    gold_small: { value: 100, weight: 0.8, radius: 18 },
    gold_medium: { value: 250, weight: 1.75, radius: 28 },
    gold_large: { value: 500, weight: 3.3, radius: 42 },
    gold_huge: { value: 800, weight: 5, radius: 52 },
    rock_small: { value: 11, weight: 1.2, radius: 18 },
    rock_medium: { value: 20, weight: 2.2, radius: 28 },
    rock_large: { value: 40, weight: 3.7, radius: 40 },
    diamond_blue: { value: 600, weight: 0.5, radius: 16 },
    mystery_bag: { value: 0, weight: 0.95, radius: 20 },
    bone: { value: 7, weight: 0.8, radius: 22 },
    skull: { value: 10, weight: 1.4, radius: 24 },
    mouse_diamond: { value: 700, weight: 0.85, radius: 18, moving: true },
    dynamite: { value: 0, weight: 0.7, radius: 16, grantsDynamite: 1 }
  };
  var GAME_STATES = Object.freeze({
    BOOT: "BOOT",
    MENU: "MENU",
    LEVEL_INTRO: "LEVEL_INTRO",
    PLAYING: "PLAYING",
    LEVEL_SUCCESS: "LEVEL_SUCCESS",
    LEVEL_FAIL: "LEVEL_FAIL",
    SHOP: "SHOP",
    GAME_OVER: "GAME_OVER",
    PAUSED: "PAUSED",
    ONLINE_WAITING: "ONLINE_WAITING",
    ONLINE_DISCONNECTED: "ONLINE_DISCONNECTED"
  });
  var CLAW_STATES = Object.freeze({
    AIMING: "AIMING",
    EXTENDING: "EXTENDING",
    EMPTY_RETRACTING: "EMPTY_RETRACTING",
    GRABBED_RETRACTING: "GRABBED_RETRACTING",
    DYNAMITE_EXPLODING: "DYNAMITE_EXPLODING",
    DISABLED: "DISABLED"
  });

  // apps/web/public/games/gold-miner/core/rng.mjs
  function createRng(seed = 1) {
    let s = seed >>> 0 || 1;
    return { seed: () => s, next() {
      s = s * 1664525 + 1013904223 >>> 0;
      return s / 4294967296;
    }, int(min, max) {
      return Math.floor(this.next() * (max - min + 1)) + min;
    }, pick(arr) {
      return arr[this.int(0, arr.length - 1)];
    } };
  }

  // apps/web/public/games/gold-miner/core/level-generator.mjs
  var TYPES = Object.keys(OBJECT_TYPES);
  function levelTarget(level) {
    return level <= 10 ? LEVEL_TARGETS[level - 1] : Math.round(LEVEL_TARGETS[9] * Math.pow(1.18, level - 10));
  }
  function generateLevel(seed, level = 1) {
    const rng = createRng(seed + level * 1009);
    const count = Math.min(70, level === 1 ? rng.int(22, 28) : level < 5 ? rng.int(30, 42) : rng.int(42, 65));
    const objects = [];
    let guard = 0;
    while (objects.length < count && guard++ < 4e3) {
      const t = TYPES[rng.int(0, TYPES.length - 1)];
      if (level < 2 && ["mouse_diamond", "skull"].includes(t)) continue;
      const r = OBJECT_TYPES[t].radius;
      const x = rng.int(r + 10, WORLD.width - r - 10), y = rng.int(WORLD.mineTop + r + 16, WORLD.mineBottom - r);
      if (objects.some((o) => (o.x - x) ** 2 + (o.y - y) ** 2 < (o.radius + r + 8) ** 2)) continue;
      objects.push({ id: `o${objects.length + 1}`, type: t, x, y, radius: r, claimedBy: null });
    }
    if (!objects.some((o) => o.type.startsWith("gold_"))) objects[0].type = "gold_small";
    return { seed, level, target: levelTarget(level), objects };
  }

  // apps/web/public/games/gold-miner/core/collision.mjs
  function segmentCircleHit(ax, ay, bx, by, cx, cy, r) {
    const abx = bx - ax, aby = by - ay, acx = cx - ax, acy = cy - ay;
    const ab2 = abx * abx + aby * aby;
    let t = ab2 === 0 ? 0 : (acx * abx + acy * aby) / ab2;
    t = Math.max(0, Math.min(1, t));
    const px = ax + abx * t, py = ay + aby * t;
    const dx = cx - px, dy = cy - py;
    const hit = dx * dx + dy * dy <= r * r;
    return hit ? { hit: true, t, distance: Math.sqrt((px - ax) ** 2 + (py - ay) ** 2) } : { hit: false };
  }
  function findClosestHit(origin, tip, objects, clawRadius, playerId) {
    let best = null;
    for (const obj of objects) {
      if (obj.claimedBy && obj.claimedBy !== playerId) continue;
      const r = (obj.radius || 0) + clawRadius;
      const hit = segmentCircleHit(origin.x, origin.y, tip.x, tip.y, obj.x, obj.y, r);
      if (!hit.hit) continue;
      if (!best || hit.distance < best.distance || hit.distance === best.distance && playerId < best.playerId) best = { objectId: obj.id, distance: hit.distance, playerId };
    }
    return best;
  }

  // apps/web/public/games/gold-miner/core/scoring.mjs
  function reelSpeedPxPerSec(objectWeight, effects = {}) {
    const base = 410;
    const m = effects.strengthDrink ? 1.45 : 1;
    return Math.max(75, base / (1 + objectWeight) * m);
  }
  function objectValue(type, effects = {}, rng = null) {
    if (type === "mystery_bag") {
      const values = effects.luckyClover ? [80, 120, 200, 350, 600] : [5, 20, 50, 100, 300];
      return values[Math.floor((rng?.next?.() ?? Math.random()) * values.length)];
    }
    const base = OBJECT_TYPES[type]?.value ?? 0;
    if (type === "diamond_blue" && effects.diamondPolish) return Math.round(base * 1.5);
    if (type.startsWith("rock_") && effects.rockBook) return base * 3;
    return base;
  }

  // apps/web/public/games/gold-miner/core/claw-system.mjs
  function createPlayer(id = 1) {
    return { id, clawState: CLAW_STATES.AIMING, angle: 0, dir: 1, length: 0, dynamite: 0, effects: {}, carryingId: null };
  }
  function clawTip(player, origin) {
    return { x: origin.x + Math.sin(player.angle) * player.length, y: origin.y + Math.cos(player.angle) * player.length };
  }
  function stepClaw(player, origin, objects, dtSec) {
    if (player.clawState === CLAW_STATES.AIMING) {
      player.angle += player.dir * CLAW.swingSpeedRadPerSec * dtSec;
      if (player.angle < CLAW.minAngleRad || player.angle > CLAW.maxAngleRad) {
        player.dir *= -1;
        player.angle = Math.max(CLAW.minAngleRad, Math.min(CLAW.maxAngleRad, player.angle));
      }
      return null;
    }
    if (player.clawState === CLAW_STATES.EXTENDING) {
      player.length += CLAW.extendSpeedPxPerSec * dtSec;
      const hit = findClosestHit(origin, clawTip(player, origin), objects, CLAW.hitRadiusPx, player.id);
      if (hit) {
        player.carryingId = hit.objectId;
        const obj = objects.find((o) => o.id === hit.objectId);
        if (obj) obj.claimedBy = player.id;
        player.clawState = CLAW_STATES.GRABBED_RETRACTING;
        return { type: "hit", objectId: hit.objectId };
      }
      if (player.length >= CLAW.maxLengthPx) player.clawState = CLAW_STATES.EMPTY_RETRACTING;
      return null;
    }
    if (player.clawState === CLAW_STATES.EMPTY_RETRACTING) {
      player.length = Math.max(0, player.length - CLAW.emptyRetractSpeedPxPerSec * dtSec);
      if (player.length === 0) player.clawState = CLAW_STATES.AIMING;
      return null;
    }
    if (player.clawState === CLAW_STATES.GRABBED_RETRACTING) {
      const obj = objects.find((o) => o.id === player.carryingId);
      const speed = reelSpeedPxPerSec(obj ? OBJECT_TYPES[obj.type].weight : 1, player.effects);
      player.length = Math.max(0, player.length - speed * dtSec);
      if (player.length === 0) {
        player.clawState = CLAW_STATES.AIMING;
        const objectId = player.carryingId;
        player.carryingId = null;
        return { type: "returned", objectId };
      }
    }
    return null;
  }
  function getOriginForPlayer(index, playerCount) {
    if (playerCount === 1) return WORLD.clawOrigin1P;
    return index === 0 ? WORLD.clawOriginP1 : WORLD.clawOriginP2;
  }

  // apps/web/public/games/gold-miner/core/checksum.mjs
  function fnv1a(str) {
    let hash = 2166136261;
    for (let i = 0; i < str.length; i += 1) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 16777619) >>> 0;
    }
    return hash;
  }
  function checksumState(state2) {
    const compact = {
      mode: state2.mode,
      variant: state2.variant,
      tick: state2.tick,
      gameState: state2.gameState,
      timeLeftMs: state2.timeLeftMs,
      score: state2.score,
      target: state2.target,
      seed: state2.seed,
      players: state2.players,
      objects: state2.objects.map(({ id, type, x, y, claimedBy }) => ({ id, type, x, y, claimedBy }))
    };
    const json = JSON.stringify(compact);
    return fnv1a(json).toString(16).padStart(8, "0");
  }

  // apps/web/public/games/gold-miner/core/shop.mjs
  var SHOP_ITEMS = {
    dynamite: { label: "Dynamite", basePrice: 100, duration: "inventory" },
    strength_drink: { label: "Strength Drink", basePrice: 250, duration: "next-level" },
    lucky_clover: { label: "Lucky Clover", basePrice: 200, duration: "next-level" },
    diamond_polish: { label: "Diamond Polish", basePrice: 300, duration: "next-level" },
    rock_book: { label: "Rock Collector's Book", basePrice: 150, duration: "next-level" },
    magic_clock: { label: "Magic Clock", basePrice: 350, duration: "next-level" }
  };
  function generateShopPrices(seed, level) {
    const rng = createRng(seed ^ level * 7919);
    const prices = {};
    for (const [id, item] of Object.entries(SHOP_ITEMS)) {
      const variance = 0.65 + rng.next() * 0.7;
      prices[id] = Math.max(1, Math.round(item.basePrice * variance));
    }
    return prices;
  }

  // apps/web/public/games/gold-miner/core/simulation.mjs
  function createPlayers(count) {
    return Array.from({ length: count }, (_, i) => createPlayer(i + 1));
  }
  function createGame(config = {}) {
    const seed = config.seed ?? 123456;
    const level = config.level ?? 1;
    const playerCount = config.playerCount ?? (config.mode === "one-player" ? 1 : 2);
    const generated = generateLevel(seed, level);
    return {
      mode: config.mode ?? "one-player",
      variant: config.variant ?? "solo",
      playerCount,
      seed,
      level,
      tick: 0,
      gameState: GAME_STATES.PLAYING,
      timeLeftMs: TIMING.levelSecondsBase * 1e3,
      target: levelTarget(level),
      objects: generated.objects,
      score: 0,
      scores: playerCount === 2 ? { 1: 0, 2: 0 } : null,
      rngState: seed,
      players: createPlayers(playerCount),
      shop: { prices: null, bought: [] },
      events: []
    };
  }
  function nextRand(state2) {
    const rng = createRng(state2.rngState);
    const v = rng.next();
    state2.rngState = rng.seed();
    return v;
  }
  function applyPlayerEffect(player, itemId) {
    if (itemId === "dynamite") player.dynamite += 1;
    if (itemId === "strength_drink") player.effects.strengthDrink = true;
    if (itemId === "lucky_clover") player.effects.luckyClover = true;
    if (itemId === "diamond_polish") player.effects.diamondPolish = true;
    if (itemId === "rock_book") player.effects.rockBook = true;
    if (itemId === "magic_clock") player.effects.magicClock = true;
  }
  function buyShopItem(state2, itemId, playerId = 1) {
    if (state2.gameState !== GAME_STATES.SHOP) return false;
    const price = state2.shop.prices?.[itemId];
    if (!price || state2.score < price) return false;
    state2.score -= price;
    state2.shop.bought.push(itemId);
    applyPlayerEffect(state2.players[playerId - 1], itemId);
    return true;
  }
  function startNextLevel(state2) {
    if (![GAME_STATES.LEVEL_SUCCESS, GAME_STATES.SHOP].includes(state2.gameState)) return false;
    state2.level += 1;
    state2.target = levelTarget(state2.level);
    state2.objects = generateLevel(state2.seed, state2.level).objects;
    state2.timeLeftMs = TIMING.levelSecondsBase * 1e3 + (state2.players[0].effects.magicClock ? 1e4 : 0);
    state2.players.forEach((p) => {
      p.effects = {};
      p.length = 0;
      p.carryingId = null;
      p.clawState = "AIMING";
    });
    state2.shop = { prices: null, bought: [] };
    state2.gameState = GAME_STATES.PLAYING;
    return true;
  }
  function resolveLevelEnd(state2) {
    const resolved = state2.variant === "versus" && state2.scores ? Math.max(state2.scores[1], state2.scores[2]) : state2.score;
    state2.gameState = resolved >= state2.target ? GAME_STATES.LEVEL_SUCCESS : GAME_STATES.LEVEL_FAIL;
    if (state2.gameState === GAME_STATES.LEVEL_SUCCESS) {
      state2.shop.prices = generateShopPrices(state2.seed, state2.level);
      state2.gameState = GAME_STATES.SHOP;
    }
  }
  function applyInput(state2, input) {
    const player = state2.players[input.playerId - 1];
    if (!player) return;
    if (input.action === "fire" && player.clawState === "AIMING" && state2.gameState === GAME_STATES.PLAYING) player.clawState = "EXTENDING";
    if (input.action === "dynamite" && player.clawState === "GRABBED_RETRACTING" && player.carryingId) {
      state2.objects = state2.objects.filter((o) => o.id !== player.carryingId);
      player.carryingId = null;
      player.clawState = "EMPTY_RETRACTING";
    }
    if (input.action === "select" && state2.gameState === GAME_STATES.SHOP) startNextLevel(state2);
    if (input.action === "shop_buy" && state2.gameState === GAME_STATES.SHOP && input.value) buyShopItem(state2, input.value, input.playerId);
  }
  function applyScore(state2, playerId, objType, rand) {
    const effects = state2.players[playerId - 1].effects;
    const value = objectValue(objType, effects, { next: () => rand });
    if (state2.variant === "versus" && state2.scores) state2.scores[playerId] += value;
    else state2.score += value;
  }
  function stepGame(state2, inputFrame = [], fixedDtMs = TIMING.fixedDtMs) {
    for (const input of inputFrame) applyInput(state2, input);
    if (state2.gameState !== GAME_STATES.PLAYING) return state2;
    state2.tick += 1;
    const dt = fixedDtMs / 1e3;
    for (let i = 0; i < state2.players.length; i += 1) {
      const p = state2.players[i];
      const result = stepClaw(p, getOriginForPlayer(i, state2.playerCount), state2.objects, dt);
      if (result?.type === "returned" && result.objectId) {
        const obj = state2.objects.find((o) => o.id === result.objectId);
        if (obj) {
          applyScore(state2, p.id, obj.type, nextRand(state2));
          state2.objects = state2.objects.filter((o) => o.id !== obj.id);
        }
      }
    }
    state2.timeLeftMs = Math.max(0, state2.timeLeftMs - fixedDtMs);
    if (state2.timeLeftMs === 0) resolveLevelEnd(state2);
    return state2;
  }
  var serializeState = (state2) => JSON.stringify(state2);
  var deserializeState = (snapshot) => JSON.parse(snapshot);
  function getRenderableFrame(state2) {
    return { tick: state2.tick, players: state2.players, objects: state2.objects, score: state2.score, scores: state2.scores, gameState: state2.gameState, shop: state2.shop, level: state2.level, target: state2.target, timeLeftMs: state2.timeLeftMs };
  }

  // apps/web/public/games/gold-miner/core/replay.mjs
  function runReplay({ seed, mode = "one-player", variant = "solo", frames = [], maxTicks = 3600 }) {
    const state2 = createGame({ seed, mode, variant, playerCount: mode === "one-player" ? 1 : 2 });
    const byTick = /* @__PURE__ */ new Map();
    for (const frame2 of frames) {
      if (!byTick.has(frame2.tick)) byTick.set(frame2.tick, []);
      byTick.get(frame2.tick).push(frame2);
    }
    while (state2.tick < maxTicks && state2.gameState === "PLAYING") {
      stepGame(state2, byTick.get(state2.tick + 1) ?? []);
    }
    return { state: state2, checksum: checksumState(state2) };
  }

  // apps/web/public/games/gold-miner/core/net-protocol.mjs
  var PROTOCOL_VERSION = 1;
  var REQUIRED = {
    gm_hello: ["type", "version"],
    gm_ready: ["type", "playerId"],
    gm_level_start: ["type", "seed", "level", "variant"],
    gm_input: ["type", "tick", "playerId", "action"],
    gm_snapshot: ["type", "tick", "checksum", "compactState"],
    gm_desync: ["type", "localChecksum", "remoteChecksum", "tick"],
    gm_pause: ["type", "reason"]
  };
  function encodeMessage(message) {
    return JSON.stringify(message);
  }
  function decodeMessage(raw) {
    return JSON.parse(raw);
  }
  function validateMessage(message) {
    if (!message || typeof message !== "object" || typeof message.type !== "string") return { ok: false, error: "invalid_message" };
    const req = REQUIRED[message.type];
    if (!req) return { ok: false, error: "unknown_type" };
    for (const key of req) if (!(key in message)) return { ok: false, error: `missing_${key}` };
    if (message.type === "gm_hello" && message.version !== PROTOCOL_VERSION) return { ok: false, error: "unsupported_version" };
    return { ok: true };
  }
  function makeSnapshot(state2) {
    return {
      type: "gm_snapshot",
      tick: state2.tick,
      checksum: checksumState(state2),
      compactState: serializeState(state2)
    };
  }
  function applySnapshot(localState, snapshot) {
    if (!snapshot?.compactState) return { applied: false, reason: "missing_state" };
    const restored = deserializeState(snapshot.compactState);
    return { applied: true, state: restored };
  }
  function compareChecksums(localState, remoteChecksum) {
    const localChecksum = checksumState(localState);
    return { ok: localChecksum === remoteChecksum, localChecksum, remoteChecksum };
  }

  // apps/web/public/games/gold-miner/core/online-sync.mjs
  function createOnlineSession({ role, seed = 123456, level = 1, variant = "coop" }) {
    return {
      role,
      status: "waiting",
      peerReady: false,
      localReady: false,
      seed,
      level,
      variant,
      game: null,
      pendingInputs: [],
      outgoingInputBuffer: [],
      sentMessages: []
    };
  }
  function onReceiveMessage(session, message) {
    const valid = validateMessage(message);
    if (!valid.ok) return { ok: false, error: valid.error };
    if (message.type === "gm_ready") {
      session.peerReady = true;
      return { ok: true };
    }
    if (message.type === "gm_level_start") {
      session.seed = message.seed;
      session.level = message.level;
      session.variant = message.variant;
      session.game = createGame({ mode: "online-two-player", variant: session.variant, seed: session.seed, level: session.level, playerCount: 2 });
      session.status = "playing";
      return { ok: true };
    }
    if (message.type === "gm_input") {
      session.pendingInputs.push(message);
      return { ok: true };
    }
    if (message.type === "gm_pause") {
      session.status = message.reason === "peer_left" ? "disconnected" : "paused";
      return { ok: true };
    }
    if (message.type === "gm_snapshot" && session.game) {
      const cmp = compareChecksums(session.game, message.checksum);
      if (!cmp.ok) {
        session.status = "desynced";
        return { ok: false, error: "desync", localChecksum: cmp.localChecksum, remoteChecksum: cmp.remoteChecksum };
      }
      return { ok: true };
    }
    return { ok: true };
  }
  function startLevelAsHost(session) {
    const msg = { type: "gm_level_start", seed: session.seed, level: session.level, variant: session.variant };
    session.game = createGame({ mode: "online-two-player", variant: session.variant, seed: session.seed, level: session.level, playerCount: 2 });
    session.status = "playing";
    session.sentMessages.push(msg);
    return msg;
  }
  function stepOnlineSession(session, fixedDtMs) {
    if (!session.game || session.status !== "playing") return;
    const inputs = session.pendingInputs.splice(0, session.pendingInputs.length);
    stepGame(session.game, inputs, fixedDtMs);
  }
  function enqueueLocalInput(session, input) {
    session.outgoingInputBuffer.push({ type: "gm_input", ...input });
  }
  function flushOutgoingInputs(session) {
    if (session.outgoingInputBuffer.length === 0) return [];
    const batch = session.outgoingInputBuffer.splice(0, session.outgoingInputBuffer.length);
    session.sentMessages.push(...batch);
    return batch;
  }

  // apps/web/public/games/gold-miner/core/runtime-online.mjs
  var ONLINE_UI_STATES = {
    ONLINE_WAITING: "ONLINE_WAITING",
    PLAYING: "PLAYING",
    ONLINE_DISCONNECTED: "ONLINE_DISCONNECTED"
  };
  function safeDecodeGameplayPacket(raw) {
    try {
      const decoded = decodeMessage(raw);
      const validation = validateMessage(decoded);
      if (!validation.ok) return { ok: false, error: validation.error };
      return { ok: true, message: decoded };
    } catch {
      return { ok: false, error: "decode_failed" };
    }
  }
  function createRuntimeOnlineController({ role, seed = 123456, snapshotEveryTicks = 30 }) {
    const session = createOnlineSession({ role, seed, variant: "coop" });
    return {
      role,
      session,
      snapshotEveryTicks,
      uiState: ONLINE_UI_STATES.ONLINE_WAITING,
      lastError: null
    };
  }
  function hostStart(controller) {
    const msg = startLevelAsHost(controller.session);
    controller.uiState = ONLINE_UI_STATES.PLAYING;
    return encodeMessage(msg);
  }
  function enqueueLocalGameplayInput(controller, input) {
    enqueueLocalInput(controller.session, input);
    return flushOutgoingInputs(controller.session).map((m) => encodeMessage(m));
  }
  function handleIncomingGameplayPacket(controller, raw) {
    const parsed = safeDecodeGameplayPacket(raw);
    if (!parsed.ok) return { ok: false, ignored: true, reason: parsed.error };
    const out = onReceiveMessage(controller.session, parsed.message);
    if (!out.ok && out.error === "desync" && parsed.message.type === "gm_snapshot") {
      const corrected = applySnapshot(controller.session.game, parsed.message);
      if (corrected.applied) {
        controller.session.game = corrected.state;
        controller.session.status = "playing";
        controller.uiState = ONLINE_UI_STATES.PLAYING;
        return { ok: true, corrected: true };
      }
      controller.uiState = ONLINE_UI_STATES.ONLINE_DISCONNECTED;
      return { ok: false, desynced: true };
    }
    if (parsed.message.type === "gm_level_start") controller.uiState = ONLINE_UI_STATES.PLAYING;
    if (parsed.message.type === "gm_pause" && parsed.message.reason === "peer_left") controller.uiState = ONLINE_UI_STATES.ONLINE_DISCONNECTED;
    return { ok: out.ok, ignored: false, out };
  }
  function tickRuntimeOnline(controller, fixedDtMs) {
    stepOnlineSession(controller.session, fixedDtMs);
    const outbound = flushOutgoingInputs(controller.session).map((m) => encodeMessage(m));
    const extras = [];
    if (controller.role === "host" && controller.session.game && controller.session.game.tick > 0 && controller.session.game.tick % controller.snapshotEveryTicks === 0) {
      extras.push(encodeMessage(makeSnapshot(controller.session.game)));
    }
    return [...outbound, ...extras];
  }

  // apps/web/public/games/gold-miner/main.js
  var canvas = document.getElementById("game");
  var ctx = canvas.getContext("2d");
  var params = new URLSearchParams(window.location.search);
  var debug = params.get("debug") === "1";
  var modeParam = params.get("mode") || "solo";
  var isOnlineMode = modeParam === "online";
  function baseConfig(seed = 123456) {
    if (modeParam === "coop") return { mode: "local-two-player", variant: "coop", seed, level: 1, playerCount: 2 };
    if (modeParam === "versus") return { mode: "local-two-player", variant: "versus", seed, level: 1, playerCount: 2 };
    if (modeParam === "online") return { mode: "online-two-player", variant: "coop", seed, level: 1, playerCount: 2 };
    return { mode: "one-player", variant: "solo", seed, level: 1, playerCount: 1 };
  }
  var state = createGame(baseConfig());
  var paused = false;
  var queued = [];
  var accumulator = 0;
  var last = performance.now();
  var FIXED_DT_MS = 1e3 / 60;
  var onlineController = null;
  var onlineRole = null;
  var onlineSocket = null;
  var onlinePc = null;
  var onlineDc = null;
  var onlineRoomCode = null;
  var onlinePendingCandidates = [];
  var onlineRemoteDescriptionSet = false;
  var onlineHeartbeat = null;
  var ONLINE_SIGNALING_URL = `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.hostname}:8787`;
  var ONLINE_ICE = [{ urls: "stun:stun.l.google.com:19302" }];
  function onlineSend(payload) {
    if (onlineDc && onlineDc.readyState === "open") onlineDc.send(payload);
  }
  function setOnlineDisconnected() {
    paused = true;
    if (state.gameState === GAME_STATES.PLAYING) state.gameState = GAME_STATES.ONLINE_DISCONNECTED;
  }
  function onlineOverlayText() {
    if (!isOnlineMode) return null;
    if (!onlineController) return "ONLINE_WAITING";
    return onlineController.uiState;
  }
  function queue(playerId, action, value) {
    queued.push({ tick: state.tick + 1, playerId, action, value });
  }
  function drawShop() {
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.fillRect(0, 0, WORLD.width, WORLD.height);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 34px system-ui";
    ctx.fillText("Shop", 350, 90);
    ctx.font = "18px system-ui";
    const items = Object.entries(state.shop.prices ?? {});
    items.forEach(([id, price], i) => {
      ctx.fillText(`${i + 1}. ${id} - $${price}`, 190, 150 + i * 34);
    });
    ctx.fillText("Press 1-6 to buy \xB7 Enter to continue", 210, 420);
  }
  function draw(frame2) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#f59e0b";
    ctx.fillRect(0, 0, WORLD.width, WORLD.hudHeight);
    ctx.fillStyle = "#1f2937";
    ctx.fillRect(0, WORLD.mineTop, WORLD.width, WORLD.height - WORLD.mineTop);
    ctx.fillStyle = "#111827";
    ctx.font = "bold 20px system-ui";
    const scoreText = frame2.scores ? `P1 $${frame2.scores[1]} P2 $${frame2.scores[2]}` : `$${state.score}`;
    ctx.fillText(scoreText, 16, 38);
    ctx.fillText(`Goal $${state.target}`, 260, 38);
    ctx.fillText(`Time ${Math.ceil(state.timeLeftMs / 1e3)}`, 460, 38);
    ctx.fillText(`Lv ${state.level}`, 620, 38);
    for (const o of frame2.objects) {
      ctx.fillStyle = o.type.startsWith("gold_") ? "#facc15" : "#9ca3af";
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    frame2.players.forEach((p, idx) => {
      const origin = state.playerCount === 1 ? WORLD.clawOrigin1P : idx === 0 ? WORLD.clawOriginP1 : WORLD.clawOriginP2;
      const tipX = origin.x + Math.sin(p.angle) * p.length;
      const tipY = origin.y + Math.cos(p.angle) * p.length;
      ctx.strokeStyle = idx === 0 ? "#e5e7eb" : "#93c5fd";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(origin.x, origin.y);
      ctx.lineTo(tipX, tipY);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(tipX, tipY, 8, 0, Math.PI * 2);
      ctx.fillStyle = "#f3f4f6";
      ctx.fill();
    });
    if (state.gameState === GAME_STATES.LEVEL_FAIL) {
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(0, 0, WORLD.width, WORLD.height);
      ctx.fillStyle = "#fff";
      ctx.font = "bold 40px system-ui";
      ctx.fillText("Level Failed", 280, 250);
    }
    if (isOnlineMode) {
      const txt = onlineOverlayText();
      if (txt) {
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.fillRect(520, 8, 270, 26);
        ctx.fillStyle = "#fff";
        ctx.font = "14px monospace";
        ctx.fillText(txt, 528, 26);
      }
    }
    if (isOnlineMode && state.gameState === GAME_STATES.ONLINE_DISCONNECTED) {
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(0, 0, WORLD.width, WORLD.height);
      ctx.fillStyle = "#fff";
      ctx.font = "bold 32px system-ui";
      ctx.fillText("ONLINE DISCONNECTED", 220, 250);
    }
    if (state.gameState === GAME_STATES.SHOP) drawShop();
    if (debug) {
      ctx.fillStyle = "#22c55e";
      ctx.font = "14px monospace";
      ctx.fillText(`tick:${state.tick} objs:${frame2.objects.length} state:${state.gameState} mode:${state.variant}`, 10, WORLD.height - 12);
    }
  }
  function frame(now) {
    const elapsed = Math.min(100, now - last);
    last = now;
    if (!paused && state.gameState === GAME_STATES.PLAYING) {
      accumulator += elapsed;
      while (accumulator >= FIXED_DT_MS) {
        if (isOnlineMode && onlineController) {
          for (const q of queued) enqueueLocalGameplayInput(onlineController, q).forEach(onlineSend);
          const packets = tickRuntimeOnline(onlineController, FIXED_DT_MS);
          packets.forEach(onlineSend);
          if (onlineController.session.game) state = onlineController.session.game;
        } else {
          stepGame(state, queued, FIXED_DT_MS);
        }
        queued = [];
        accumulator -= FIXED_DT_MS;
      }
    } else if (queued.length) {
      stepGame(state, queued, FIXED_DT_MS);
      queued = [];
    }
    draw(getRenderableFrame(state));
    requestAnimationFrame(frame);
  }
  window.addEventListener("keydown", (e) => {
    if (state.playerCount === 1) {
      if (e.key === "ArrowDown" || e.key === " ") queue(1, "fire");
      if (e.key === "ArrowUp" || e.key === "d" || e.key === "D") queue(1, "dynamite");
    } else {
      if (e.key === "s" || e.key === "S") queue(1, "fire");
      if (e.key === "w" || e.key === "W") queue(1, "dynamite");
      if (e.key === "ArrowDown") queue(2, "fire");
      if (e.key === "ArrowUp") queue(2, "dynamite");
    }
    if (e.key === "p" || e.key === "P") paused = !paused;
    if (e.key === "r" || e.key === "R") {
      state = createGame(baseConfig(state.seed));
      if (isOnlineMode) window.location.reload();
    }
    if (state.gameState === GAME_STATES.SHOP && e.key === "Enter") startNextLevel(state);
    if (state.gameState === GAME_STATES.SHOP && /^[1-6]$/.test(e.key)) {
      const ids = Object.keys(state.shop.prices ?? {});
      buyShopItem(state, ids[Number(e.key) - 1], 1);
    }
  });
  window.__goldMinerTest = {
    step(ticks = 1) {
      for (let i = 0; i < ticks; i++) stepGame(state, [], FIXED_DT_MS);
    },
    press(playerId, action, value) {
      applyInput(state, { playerId, action, value });
    },
    runReplay(frames = [], maxTicks = 3600) {
      return runReplay({ seed: state.seed, mode: state.mode, variant: state.variant, frames, maxTicks });
    },
    getState() {
      return JSON.parse(JSON.stringify(state));
    },
    getChecksum() {
      return checksumState(state);
    },
    setSeed(seed) {
      state = createGame(baseConfig(seed));
    },
    reset(config = {}) {
      state = createGame({ ...baseConfig(config.seed ?? state.seed), ...config });
    }
  };
  async function initOnlineMode() {
    if (!isOnlineMode) return;
    onlineRole = params.get("role") === "guest" ? "guest" : "host";
    onlineController = createRuntimeOnlineController({ role: onlineRole, seed: state.seed });
    const room = params.get("room") || "";
    onlineRoomCode = room;
    onlineSocket = new WebSocket(ONLINE_SIGNALING_URL);
    onlineSocket.addEventListener("open", async () => {
      onlineHeartbeat = setInterval(() => onlineSocket?.send(JSON.stringify({ type: "heartbeat" })), 15e3);
      if (onlineRole === "host") onlineSocket.send(JSON.stringify({ type: "create_room", roomCode: room || `GM${Math.floor(Math.random() * 1e4)}` }));
      else onlineSocket.send(JSON.stringify({ type: "join_room", roomCode: room }));
    });
    onlineSocket.addEventListener("message", async (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === "room_created") {
        onlineRoomCode = msg.roomCode;
      }
      if (msg.type === "room_joined") {
        onlineRoomCode = msg.roomCode;
      }
      if (msg.type === "peer_joined" && onlineRole === "host") {
        onlinePc = new RTCPeerConnection({ iceServers: ONLINE_ICE });
        onlineDc = onlinePc.createDataChannel("gold-miner");
        setupChannel();
        setupPc();
        const offer = await onlinePc.createOffer();
        await onlinePc.setLocalDescription(offer);
        onlineSocket.send(JSON.stringify({ type: "offer", roomCode: onlineRoomCode, offer }));
      }
      if (msg.type === "offer" && onlineRole === "guest") {
        onlinePc = new RTCPeerConnection({ iceServers: ONLINE_ICE });
        setupPc();
        onlinePc.ondatachannel = (e) => {
          onlineDc = e.channel;
          setupChannel();
        };
        await onlinePc.setRemoteDescription(new RTCSessionDescription(msg.offer));
        onlineRemoteDescriptionSet = true;
        while (onlinePendingCandidates.length) await onlinePc.addIceCandidate(new RTCIceCandidate(onlinePendingCandidates.shift()));
        const answer = await onlinePc.createAnswer();
        await onlinePc.setLocalDescription(answer);
        onlineSocket.send(JSON.stringify({ type: "answer", roomCode: onlineRoomCode, answer }));
      }
      if (msg.type === "answer" && onlinePc) {
        await onlinePc.setRemoteDescription(new RTCSessionDescription(msg.answer));
        onlineRemoteDescriptionSet = true;
      }
      if (msg.type === "ice_candidate" && onlinePc) {
        if (!onlineRemoteDescriptionSet) onlinePendingCandidates.push(msg.candidate);
        else await onlinePc.addIceCandidate(new RTCIceCandidate(msg.candidate));
      }
      if (msg.type === "peer_left") {
        handleIncomingGameplayPacket(onlineController, JSON.stringify({ type: "gm_pause", reason: "peer_left" }));
        setOnlineDisconnected();
      }
    });
  }
  function setupPc() {
    onlinePc.onicecandidate = (event) => {
      if (event.candidate) onlineSocket.send(JSON.stringify({ type: "ice_candidate", roomCode: onlineRoomCode, candidate: event.candidate }));
    };
    onlinePc.onconnectionstatechange = () => {
      if (["failed", "disconnected", "closed"].includes(onlinePc.connectionState)) setOnlineDisconnected();
    };
  }
  function setupChannel() {
    onlineDc.onopen = () => {
      if (onlineRole === "host") onlineSend(hostStart(onlineController));
    };
    onlineDc.onmessage = (event) => {
      const probe = safeDecodeGameplayPacket(event.data);
      if (!probe.ok) return;
      handleIncomingGameplayPacket(onlineController, event.data);
      if (onlineController.session.game) state = onlineController.session.game;
    };
    onlineDc.onclose = () => setOnlineDisconnected();
  }
  initOnlineMode();
  requestAnimationFrame(frame);
})();
