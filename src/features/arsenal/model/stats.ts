import type { Weapon, WeaponId } from "../../../shared/types";
import { WEAPON_CATALOG } from "./catalog";
export interface EffectiveWeaponStats {
  /** Damage dealt by each projectile. */
  damage: number;
  /** Seconds between trigger cycles after haste and weapon-level scaling. */
  interval: number;
  /** Rounds a full magazine holds. */
  magazine: number;
  /** Seconds a full reload takes after reload upgrades. */
  reload: number;
  heatMax: number;
  heatPerBurst: number;
  vent: number;
  /** Heat shed per second while recovering or idle. */
  coolRate: number;
  /** Projectiles launched by one trigger cycle. */
  count: number;
  speed: number;
  pierce: number;
}
/**
 * The single source of truth for every derived weapon number. The panel, the
 * combat loop and upgrade previews all call this so a preview can never drift
 * from what actually fires.
 */
export function weaponStats(
  weapon: Pick<Weapon, "id" | "level">,
  upgrades: Record<string, number> = {},
): EffectiveWeaponStats {
  const definition = WEAPON_CATALOG[weapon.id],
    level = Math.max(1, weapon.level || 1),
    power = 1 + (upgrades.power || 0) * 0.2,
    haste = 1 + (upgrades.haste || 0) * 0.13,
    reload = 1 + (upgrades.reload || 0) * 0.15,
    levelDamage = 1 + (level - 1) * 0.3,
    levelRate = 1 + (level - 1) * 0.12;
  const count =
    weapon.id === "pulse"
      ? level >= 4
        ? 3
        : level >= 2
          ? 2
          : 1
      : weapon.id === "orbit"
        ? 4 + level
        : 10 + level * 2;
  return {
    damage: definition.baseDamage * power * levelDamage,
    interval: Math.max(0.08, definition.interval / haste / levelRate),
    magazine: definition.magazine + (level - 1) * definition.magazinePerLevel,
    reload: Math.max(0.12, definition.reload / reload),
    heatMax: definition.heatMax,
    heatPerBurst: definition.heatPerBurst,
    vent: definition.vent,
    coolRate: definition.coolRate,
    count,
    speed: weapon.id === "pulse" ? 440 : weapon.id === "orbit" ? 150 : 240,
    pierce:
      weapon.id === "pulse"
        ? upgrades.pierce || 0
        : weapon.id === "orbit"
          ? 3
          : 1,
  };
}
/**
 * Migrates a legacy `{ id, level, cooldown }` weapon to the current shape.
 * Legacy weapons come back with a full magazine, no heat and no recovery,
 * while an already-migrated weapon keeps its live state untouched.
 */
export function migrateWeapon(
  weapon: Partial<Weapon> & Pick<Weapon, "id" | "level">,
  upgrades: Record<string, number> = {},
): Weapon {
  const stats = weaponStats(weapon, upgrades),
    finite = (value: unknown): value is number =>
      typeof value === "number" && Number.isFinite(value),
    recovery: Weapon["recovery"] =
      weapon.recovery === "reload" || weapon.recovery === "vent"
        ? weapon.recovery
        : "none";
  weapon.cooldown = finite(weapon.cooldown) ? weapon.cooldown : 0;
  // The absence of an ammo field is the migration marker: legacy weapons get
  // a full magazine, while live weapons keep whatever rounds they had.
  weapon.ammo = finite(weapon.ammo)
    ? Math.max(0, Math.min(weapon.ammo, stats.magazine))
    : stats.magazine;
  weapon.heat = finite(weapon.heat)
    ? Math.max(0, Math.min(weapon.heat, stats.heatMax))
    : 0;
  weapon.recovery = recovery;
  weapon.recoveryTime = finite(weapon.recoveryTime)
    ? Math.max(0, weapon.recoveryTime)
    : 0;
  weapon.recoveryDuration = finite(weapon.recoveryDuration)
    ? Math.max(0, weapon.recoveryDuration)
    : weapon.recoveryTime;
  if (recovery === "none") {
    weapon.recoveryTime = weapon.recoveryDuration = weapon.reloadTarget = 0;
  } else {
    if (weapon.recoveryTime > weapon.recoveryDuration)
      weapon.recoveryDuration = weapon.recoveryTime;
    weapon.reloadTarget = finite(weapon.reloadTarget)
      ? Math.max(0, Math.min(weapon.reloadTarget, stats.magazine))
      : stats.magazine;
  }
  weapon.pendingLevels = finite(weapon.pendingLevels)
    ? Math.max(0, Math.floor(weapon.pendingLevels))
    : 0;
  return weapon as Weapon;
}
/** Creates a weapon at a legal, fully supplied initial state. */
export function createWeapon(
  id: WeaponId,
  level: number,
  upgrades: Record<string, number> = {},
): Weapon {
  return migrateWeapon({ id, level, cooldown: 0 }, upgrades);
}
export function normalizeWeapons(
  weapons: Weapon[],
  upgrades: Record<string, number> = {},
): void {
  for (const weapon of weapons) migrateWeapon(weapon, upgrades);
}
export const weaponUpgradeId = (id: string): WeaponId | null =>
  id === "pulse" || id === "orbit" || id === "nova" ? id : null;
