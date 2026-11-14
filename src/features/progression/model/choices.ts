import type { GameDoc, WeaponId } from "../../../shared/types";
import { random } from "../../../shared/math";
import { UPGRADE_CATALOG } from "./catalog";
import { createWeapon, migrateWeapon, weaponUpgradeId } from "../../arsenal/model/stats";
export function rollChoices(doc: GameDoc): void {
  const available = UPGRADE_CATALOG.filter(
    (u) => u.id !== "recovery" && (doc.upgrades[u.id] || 0) < u.max,
  ).map((u) => u.id);
  for (let i = available.length - 1; i > 0; i--) {
    const j = Math.floor(random(doc) * (i + 1));
    [available[i], available[j]] = [available[j], available[i]];
  }
  doc.choices = available.slice(0, 3);
  // Every finite upgrade is eventually exhausted; a recovery choice keeps queued levels spendable.
  if (!doc.choices.length) doc.choices = ["recovery"];
  doc.phase = "upgrade";
}
export function chooseUpgrade(doc: GameDoc, id: string): void {
  if (
    doc.phase !== "upgrade" ||
    !doc.choices.includes(id) ||
    doc.pendingLevels <= 0
  )
    return;
  if (id === "recovery") {
    doc.player.hp = Math.min(doc.player.maxHp, doc.player.hp + 30);
  } else {
    const definition = UPGRADE_CATALOG.find((u) => u.id === id);
    if (!definition || (doc.upgrades[id] || 0) >= definition.max) return;
    doc.upgrades[id] = (doc.upgrades[id] || 0) + 1;
    if (id === "speed") doc.player.speed += 190 * 0.12;
    if (id === "vitality") {
      doc.player.maxHp += 20;
      doc.player.hp = Math.min(doc.player.maxHp, doc.player.hp + 20);
    }
    const weaponId = weaponUpgradeId(id);
    if (weaponId) {
      const weapon = doc.weapons.find((w) => w.id === weaponId);
      if (weapon) {
        // The level only becomes effective at the next legal shooting
        // boundary. Ammo, heat and any running reload stay untouched, so a
        // chain of upgrades can never manufacture a free trigger cycle.
        migrateWeapon(weapon, doc.upgrades);
        weapon.pendingLevels++;
      } else {
        // A newly unlocked weapon starts supplied; it was not in a reload.
        doc.weapons.push(
          createWeapon(weaponId as WeaponId, 1, doc.upgrades),
        );
      }
    }
  }
  doc.pendingLevels--;
  doc.choices = [];
  if (doc.pendingLevels > 0) rollChoices(doc);
  else {
    doc.phase = "playing";
    doc.notice = "升级完成 · 继续战斗";
  }
}
