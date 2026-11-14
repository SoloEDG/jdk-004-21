import type { GameDoc } from "../../../shared/types";
import { WEAPON_CATALOG } from "./catalog";
import { weaponStats, weaponUpgradeId } from "./stats";
export interface StatDelta {
  label: string;
  from: string;
  to: string;
}
export interface UpgradePreview {
  lines: StatDelta[];
  note: string;
}
const seconds = (value: number) => `${value.toFixed(2)}s`;
const damage = (value: number) => value.toFixed(1);
/**
 * Builds the numeric preview shown on an upgrade card. Every number comes from
 * `weaponStats`, the same function the panel and the firing loop use, so the
 * card cannot promise values combat will not deliver.
 */
export function previewUpgrade(
  doc: GameDoc,
  upgradeId: string,
): UpgradePreview | null {
  const weaponId = weaponUpgradeId(upgradeId);
  if (weaponId) {
    const weapon = doc.weapons.find((w) => w.id === weaponId),
      current = weaponStats(weapon || { id: weaponId, level: 1 }, doc.upgrades),
      nextLevel = (weapon ? weapon.level + weapon.pendingLevels : 0) + 1,
      next = weaponStats({ id: weaponId, level: nextLevel }, doc.upgrades),
      name = WEAPON_CATALOG[weaponId].name;
    return {
      lines: [
        { label: "伤害", from: damage(current.damage), to: damage(next.damage) },
        {
          label: "弹匣",
          from: `${current.magazine}`,
          to: `${next.magazine}`,
        },
        {
          label: "射击间隔",
          from: seconds(current.interval),
          to: seconds(next.interval),
        },
      ],
      note: !weapon
        ? `新武器 · ${name} 以满弹匣接入`
        : weapon.recovery === "none"
          ? "下一发合法射击起生效 · 弹匣不补满"
          : "当前恢复结束后、下一发合法射击起生效",
    };
  }
  if (upgradeId === "haste" || upgradeId === "reload" || upgradeId === "power") {
    const nextUpgrades = {
        ...doc.upgrades,
        [upgradeId]: (doc.upgrades[upgradeId] || 0) + 1,
      },
      lines: StatDelta[] = [];
    for (const weapon of doc.weapons) {
      const before = weaponStats(weapon, doc.upgrades),
        after = weaponStats(weapon, nextUpgrades),
        name = WEAPON_CATALOG[weapon.id].name;
      if (upgradeId === "haste")
        lines.push({
          label: `${name}间隔`,
          from: seconds(before.interval),
          to: seconds(after.interval),
        });
      else if (upgradeId === "reload")
        lines.push({
          label: `${name}装填`,
          from: seconds(before.reload),
          to: seconds(after.reload),
        });
      else
        lines.push({
          label: `${name}伤害`,
          from: damage(before.damage),
          to: damage(after.damage),
        });
    }
    if (upgradeId === "haste")
      lines.push({
        label: "装填时间",
        from: "不变",
        to: "不变",
      });
    if (upgradeId === "reload")
      lines.push({ label: "射击间隔", from: "不变", to: "不变" });
    return {
      lines,
      note:
        upgradeId === "reload"
          ? "仅缩短装填，不改变射速；与超频回路独立叠加"
          : upgradeId === "haste"
            ? "仅缩短射击间隔，不改变装填；与快速装填独立叠加"
            : "伤害对本轮已有武器同时生效",
    };
  }
  return null;
}
