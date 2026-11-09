/**
 * Records the authoritative state behind a failed browser check, so a one-off
 * failure can be diagnosed from its artifact without rerunning until it repeats.
 * Written to <artifactDir>/failures.json: match phase, combatant life state,
 * inventory, grenades, clouds, loot, recent combat events and timestamps.
 */
import { mkdirSync, writeFileSync } from "node:fs";

const capturePage = (page) =>
  page.evaluate(() => {
    const value = window.__VIBE_MILITIA_ONLINE__?.getProbe();
    const snapshot = value?.snapshot;
    if (!snapshot) return { ready: value?.ready ?? false, snapshot: false };
    return {
      roomId: value.roomId,
      sessionId: value.sessionId,
      phase: snapshot.phase,
      elapsedMs: Math.round(snapshot.elapsedMs),
      remainingMs: Math.round(snapshot.remainingMs),
      pageMs: Math.round(performance.now()),
      snapshotAgeMs: Math.round(value.net?.snapshotAgeMs ?? 0),
      combatants: snapshot.participants.map((combatant) => ({
        id: combatant.id,
        kind: combatant.kind,
        name: combatant.name,
        alive: combatant.alive,
        health: Math.round(combatant.health),
        respawnIn: combatant.respawnIn,
        x: Math.round(combatant.x),
        y: Math.round(combatant.y),
        grenades: [combatant.grenadeContact, combatant.grenadeFrag, combatant.grenadeStinking],
        medkits: combatant.medkits,
        weapons: combatant.weapons?.map((weapon) => (weapon.owned ? `${weapon.id}:${weapon.ammo}` : null)),
      })),
      grenades: (snapshot.grenades ?? []).map((grenade) => ({
        id: grenade.id,
        type: grenade.type,
        ownerId: grenade.ownerId,
        fuseRemainingMs: grenade.fuseRemainingMs,
      })),
      clouds: (snapshot.toxicClouds ?? []).map((cloud) => ({
        id: cloud.id,
        ownerId: cloud.ownerId,
        remainingMs: Math.round(cloud.remainingMs),
      })),
      loot: (snapshot.loot ?? []).length,
      feed: (snapshot.feed ?? []).slice(-5).map((entry) => entry.text),
      combatLog: (value.combatLog ?? []).slice(-12),
      hud: {
        phase: value.hud?.matchPhase,
        isDead: value.hud?.isDead,
        slots: value.hud?.weaponSlots?.map((slot) => (slot.owned ? slot.id : null)),
      },
    };
  });

export function createFailureLog(artifactDir, pages) {
  const entries = [];
  const pending = [];
  const capture = (name, detail) => {
    const wallMs = Date.now();
    const open = Object.entries(pages).filter(([, page]) => page && !page.isClosed());
    pending.push(
      Promise.all(
        open.map(async ([label, page]) => [label, await capturePage(page).catch((error) => ({ unavailable: String(error).slice(0, 120) }))]),
      ).then((states) => entries.push({ name, detail, wallMs, pages: Object.fromEntries(states) })),
    );
  };
  const flush = async () => {
    await Promise.all(pending);
    if (!artifactDir || entries.length === 0) return;
    mkdirSync(artifactDir, { recursive: true });
    writeFileSync(`${artifactDir}/failures.json`, JSON.stringify(entries, null, 2));
    console.log(`DIAGNOSTICS ${artifactDir}/failures.json (${entries.length})`);
  };
  return { capture, flush, pages };
}
