export type WeaponRecoveryState = "ready" | "reloading" | "venting";
export interface WeaponReadout {
  ammo: number;
  magazine: number;
  heat: number;
  heatMax: number;
  state: WeaponRecoveryState;
  /** Fraction of the active recovery left, `0..1`. */
  recovery: number;
  /** Seconds until the next trigger cycle. */
  cooldown: number;
  interval: number;
  damage: number;
  reload: number;
  /** Rounds restored by a completed reload, frozen when the reload began. */
  refill: number;
  /** Levels bought during the pause, applied at the next legal trigger. */
  queued: number;
}
export const recoveryLabel = (state: WeaponRecoveryState): string =>
  state === "reloading" ? "装填中" : state === "venting" ? "过热排放" : "待发";
export const recoveryStateOf = (
  recovery: "none" | "reload" | "vent",
): WeaponRecoveryState =>
  recovery === "reload"
    ? "reloading"
    : recovery === "vent"
      ? "venting"
      : "ready";
export const heatLabel = (heat: number, max: number): string =>
  heat >= max * 0.8 ? "临界" : heat >= max * 0.5 ? "升温" : "稳定";
export const ammoLabel = (ammo: number, magazine: number): string =>
  ammo <= 0 ? "空仓" : ammo <= Math.max(1, magazine * 0.25) ? "余弹不足" : "弹药充足";
