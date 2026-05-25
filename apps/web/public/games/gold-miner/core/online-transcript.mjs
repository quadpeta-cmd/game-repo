import { createOnlineSession, onReceiveMessage, startLevelAsHost, stepOnlineSession, makePeriodicSnapshot, enqueueLocalInput, flushOutgoingInputs } from './online-sync.mjs';
import { TIMING } from './constants.mjs';

export function runTwoClientTranscript({ seed = 123456, hostFrames = [], guestFrames = [], ticks = 120, snapshotEveryTicks = 30 }) {
  const host = createOnlineSession({ role: 'host', seed, variant: 'coop' });
  const guest = createOnlineSession({ role: 'guest' });

  const start = startLevelAsHost(host);
  onReceiveMessage(guest, start);

  for (let t = 1; t <= ticks; t++) {
    for (const f of hostFrames) if (f.tick === t) enqueueLocalInput(host, { tick: t, playerId: 1, action: f.action });
    for (const f of guestFrames) if (f.tick === t) enqueueLocalInput(guest, { tick: t, playerId: 2, action: f.action });

    for (const m of flushOutgoingInputs(host)) onReceiveMessage(guest, m);
    for (const m of flushOutgoingInputs(guest)) onReceiveMessage(host, m);

    stepOnlineSession(host, TIMING.fixedDtMs);
    stepOnlineSession(guest, TIMING.fixedDtMs);

    if (snapshotEveryTicks > 0 && t % snapshotEveryTicks === 0) {
      const snap = makePeriodicSnapshot(host);
      onReceiveMessage(guest, snap);
    }
  }

  return { host, guest };
}
