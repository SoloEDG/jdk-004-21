import type { WeaponId } from "../../../shared/types";
export interface WeaponDefinition {
  name: string;
  description: string;
  color: string;
  /** Base seconds between trigger cycles before upgrades. */
  interval: number;
  baseDamage: number;
  /** Rounds a full magazine holds. One trigger cycle spends one round. */
  magazine: number;
  /** Extra rounds each weapon level adds to the magazine. */
  magazinePerLevel: number;
  /** Base seconds a full reload takes. */
  reload: number;
  heatMax: number;
  /** Heat added by one trigger cycle. */
  heatPerBurst: number;
  /** Seconds a forced vent cycle takes. */
  vent: number;
  /** Passive heat shed per second while the trigger is idle. */
  coolRate: number;
}
export const WEAPON_CATALOG: Record<WeaponId, WeaponDefinition> = {
  pulse: {
    name: "脉冲步枪",
    description: "自动锁定最近目标，精准连续打击",
    color: "#67e8f9",
    interval: 0.48,
    baseDamage: 16,
    magazine: 18,
    magazinePerLevel: 4,
    reload: 1.15,
    heatMax: 100,
    heatPerBurst: 8,
    vent: 1.2,
    coolRate: 1.5,
  },
  orbit: {
    name: "环轨飞刃",
    description: "向四周释放穿透飞刃",
    color: "#c084fc",
    interval: 1.7,
    baseDamage: 13,
    magazine: 5,
    magazinePerLevel: 1,
    reload: 1.6,
    heatMax: 100,
    heatPerBurst: 24,
    vent: 1.5,
    coolRate: 1.2,
  },
  nova: {
    name: "新星爆发",
    description: "周期性向周围发射能量星环",
    color: "#fbbf24",
    interval: 3.2,
    baseDamage: 12,
    magazine: 3,
    magazinePerLevel: 1,
    reload: 2.2,
    heatMax: 100,
    heatPerBurst: 40,
    vent: 2,
    coolRate: 2.0,
  },
};
