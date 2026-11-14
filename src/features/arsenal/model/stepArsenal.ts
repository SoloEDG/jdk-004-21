import type { GameDoc, Input, Weapon } from "../../../shared/types";
import { clamp } from "../../../shared/math";
import { fire, nearestTarget } from "../lib/projectiles";
import { weaponStats, normalizeWeapons } from "./stats";
import type { EffectiveWeaponStats } from "./stats";
/** Starts the only recovery process a weapon may have at a time. */
export function beginRecovery(
  weapon: Weapon,
  kind: "reload" | "vent",
  stats: EffectiveWeaponStats,
): void {
  // A weapon can never run a reload and a vent at once. When the magazine and
  // the heat cap are both exhausted in the same frame, reload wins; the heat
  // is still high afterwards, so the next ready frame opens a vent instead of
  // opening a second recovery object now.
  if (weapon.recovery !== "none") return;
  weapon.recovery = kind;
  weapon.recoveryTime = kind === "reload" ? stats.reload : stats.vent;
  // Freeze the magazine size for this reload. A weapon level chosen mid-reload
  // widens future magazines only, so the pause cannot refill extra rounds.
  weapon.reloadTarget = kind === "reload" ? stats.magazine : 0;
  // Snapshot the duration: an upgrade chosen while paused must not shorten or
  // restart the cycle already running.
  weapon.recoveryDuration = weapon.recoveryTime;
}
function stepRecovery(
  weapon: Weapon,
  stats: EffectiveWeaponStats,
  dt: number,
): void {
  weapon.recoveryTime -= dt;
  if (weapon.recovery === "reload") {
    // Reloading restocks rounds; heat keeps shedding at the passive rate so a
    // simultaneous overheat still needs its own vent cycle.
    weapon.heat = Math.max(0, weapon.heat - stats.coolRate * dt);
  } else {
    const rate = stats.heatMax / Math.max(0.001, weapon.recoveryDuration);
    weapon.heat = Math.max(0, weapon.heat - rate * dt);
  }
  if (weapon.recoveryTime > 0) return;
  if (weapon.recovery === "reload") weapon.ammo = weapon.reloadTarget;
  else weapon.heat = 0;
  weapon.recovery = "none";
  weapon.recoveryTime = 0;
  weapon.recoveryDuration = 0;
  weapon.reloadTarget = 0;
}
function stepWeapon(
  doc: GameDoc,
  weapon: Weapon,
  angle: number,
  dt: number,
): number {
  const stats = weaponStats(weapon, doc.upgrades);
  weapon.cooldown = Math.max(0, weapon.cooldown - dt);
  // Never grant rounds from an upgrade: a bigger magazine only matters at the
  // next reload, and the amount held is always the smaller of the two.
  weapon.ammo = Math.min(weapon.ammo, stats.magazine);
  weapon.heat = clamp(weapon.heat, 0, stats.heatMax);
  if (weapon.recovery !== "none") {
    stepRecovery(weapon, stats, dt);
    // The frame that completes a reload / vent never also fires, so a finished
    // recovery cannot be spent on an extra trigger cycle.
    return 0;
  }
  if (weapon.cooldown > 0) {
    weapon.heat = Math.max(0, weapon.heat - stats.coolRate * dt);
    // At an empty magazine with cold heat, begin the reload as soon as the
    // trigger cycle ends instead of waiting for a frame that would fire.
    if (weapon.ammo <= 0) beginRecovery(weapon, "reload", stats);
    return 0;
  }
  if (weapon.ammo <= 0) {
    beginRecovery(weapon, "reload", stats);
    return 0;
  }
  if (weapon.heat + stats.heatPerBurst > stats.heatMax) {
    beginRecovery(weapon, "vent", stats);
    return 0;
  }
  // Legal shooting boundary: weapon levels bought during the upgrade pause are
  // applied here, right before the trigger pulls. Ammo, heat and cooldown all
  // kept advancing as before, so chaining upgrades yields no free shot.
  if (weapon.pendingLevels > 0) {
    weapon.level += weapon.pendingLevels;
    weapon.pendingLevels = 0;
  }
  const live = weaponStats(weapon, doc.upgrades);
  weapon.ammo -= 1;
  weapon.heat = Math.min(live.heatMax, weapon.heat + live.heatPerBurst);
  weapon.cooldown = live.interval;
  for (let i = 0; i < live.count; i++) {
    const shotAngle =
      weapon.id === "pulse"
        ? angle + (i - (live.count - 1) / 2) * 0.12
        : doc.time * 0.8 + (i * Math.PI * 2) / live.count;
    fire(doc, weapon.id, shotAngle, live.damage, live.speed, live.pierce);
  }
  if (weapon.ammo <= 0) beginRecovery(weapon, "reload", live);
  else if (weapon.heat + live.heatPerBurst > live.heatMax)
    beginRecovery(weapon, "vent", live);
  return live.count;
}
export function stepArsenal(doc: GameDoc, input: Input, dt: number): number {
  // Legacy saves only carried { id, level, cooldown }; give them a full
  // magazine before anything reads or advances their state.
  normalizeWeapons(doc.weapons, doc.upgrades);
  let shots = 0;
  const target = nearestTarget(doc),
    aim = input.firing ? input.aim : target || input.aim;
  const angle = Math.atan2(aim.y - doc.player.y, aim.x - doc.player.x);
  for (const weapon of doc.weapons)
    shots += stepWeapon(doc, weapon, angle, dt);
  return shots;
}
