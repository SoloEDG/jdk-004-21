import type { GameDoc, Weapon, WeaponId } from "../../../shared/types";
import { WEAPON_CATALOG } from "../model/catalog";
import { migrateWeapon, weaponStats } from "../model/stats";
import {
  ammoLabel,
  heatLabel,
  recoveryLabel,
  recoveryStateOf,
} from "../model/readout";
import type { WeaponReadout } from "../model/readout";
const names: Record<WeaponId, [string, string, string]> = {
  pulse: ["脉冲射线", "PULSE RIFLE", "⌁"],
  orbit: ["轨道刃", "ORBITAL BLADE", "◎"],
  nova: ["新星爆发", "NOVA BURST", "✳"],
};
/**
 * Builds the panel readout from the same effective stats the firing loop uses.
 * No number here is stored separately, so the panel cannot disagree with combat.
 */
export function weaponReadout(doc: GameDoc, weapon: Weapon): WeaponReadout {
  // The panel may render a weapon that has not been through the simulation
  // (for example straight after a legacy save load), so normalise a copy.
  const live = migrateWeapon({ ...weapon }, doc.upgrades),
    stats = weaponStats(live, doc.upgrades);
  return {
    ammo: live.ammo,
    magazine: stats.magazine,
    heat: live.heat,
    heatMax: stats.heatMax,
    state: recoveryStateOf(live.recovery),
    recovery:
      live.recovery === "none" || live.recoveryDuration <= 0
        ? 0
        : Math.max(0, live.recoveryTime / live.recoveryDuration),
    cooldown: live.cooldown,
    interval: stats.interval,
    damage: stats.damage,
    reload: stats.reload,
    refill: live.recovery === "reload" ? live.reloadTarget : stats.magazine,
    queued: live.pendingLevels,
  };
}
function WeaponCard({ doc, id }: { doc: GameDoc; id: WeaponId }) {
  const weapon = doc.weapons.find((w) => w.id === id);
  if (!weapon)
    return (
      <div className="weapon locked" key={id}>
        <div className={`weapon-icon ${id}`}>{names[id][2]}</div>
        <div>
          <strong>{names[id][0]}</strong>
          <small>{names[id][1]}</small>
        </div>
        <span className="weapon-level">未装配</span>
      </div>
    );
  const readout = weaponReadout(doc, weapon),
    definition = WEAPON_CATALOG[id],
    heatRatio = readout.heatMax ? readout.heat / readout.heatMax : 0,
    ammoRatio = readout.magazine ? readout.ammo / readout.magazine : 0;
  return (
    <div className="weapon" key={id}>
      <div className={`weapon-icon ${id}`}>{names[id][2]}</div>
      <div>
        <strong>{names[id][0]}</strong>
        <small>{names[id][1]}</small>
      </div>
      <span className="weapon-level">Lv.{weapon.level}</span>
      {weapon.pendingLevels > 0 && (
        <span className="weapon-queued">+{weapon.pendingLevels} 待生效</span>
      )}
      <div className="level-pips">
        {Array.from({ length: 5 }, (_, i) => (
          <i key={i} className={i < weapon.level ? "active" : ""} />
        ))}
      </div>
      <div className="weapon-readout">
        <div className="weapon-line">
          <span>弹匣</span>
          <b className={`mono ${readout.ammo <= 0 ? "warn" : ""}`}>
            {readout.ammo} / {readout.magazine}
          </b>
        </div>
        <div className="bar ammo">
          <i
            className={ammoRatio <= 0.25 ? "low" : ""}
            style={{ width: `${Math.max(0, ammoRatio) * 100}%` }}
          />
        </div>
        <div className="weapon-line">
          <span>过热</span>
          <b className={`mono ${heatRatio >= 0.8 ? "warn" : ""}`}>
            {Math.round(readout.heat)} / {readout.heatMax}
          </b>
        </div>
        <div className="bar heat">
          <i
            className={heatRatio >= 0.8 ? "hot" : ""}
            style={{ width: `${Math.min(1, heatRatio) * 100}%` }}
          />
        </div>
        <div className="weapon-line">
          <span
            className={`weapon-state ${readout.state}`}
            style={{ color: definition.color }}
          >
            {recoveryLabel(readout.state)}
          </span>
          <b className="mono">
            {readout.state === "ready"
              ? `${Math.max(0, readout.cooldown).toFixed(2)}s`
              : `${Math.max(0, readout.recovery).toFixed(2)}s`}
          </b>
        </div>
        <div className="weapon-line tiny">
          <span>
            {ammoLabel(readout.ammo, readout.magazine)} ·{" "}
            {heatLabel(readout.heat, readout.heatMax)}
          </span>
          <span className="mono">
            {Math.round(readout.damage)} DMG · 装填 {readout.reload.toFixed(2)}s
            {readout.state === "reloading" ? ` → ${readout.refill}` : ""}
          </span>
        </div>
      </div>
    </div>
  );
}
export function ArsenalPanel({ doc }: { doc: GameDoc }) {
  return (
    <section className="panel">
      <div className="section-caption">
        <span>武器系统</span>
        <span className="mono muted">{doc.weapons.length} / 3</span>
      </div>
      <div className="weapons">
        {(["pulse", "orbit", "nova"] as WeaponId[]).map((id) => (
          <WeaponCard doc={doc} id={id} key={id} />
        ))}
      </div>
      <div className="hint">
        ↗ 自动锁定最近目标
        <br />
        <span>
          弹匣打空自动装填，热量满格强制排放；射速与装填分开强化。
        </span>
      </div>
    </section>
  );
}
