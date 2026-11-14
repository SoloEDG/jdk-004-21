import { test } from "node:test";
import assert from "node:assert/strict";
import { createRun } from "../src/shared/createRun";
import { stepArsenal } from "../src/features/arsenal";
import {
  createWeapon,
  migrateWeapon,
  weaponStats,
} from "../src/features/arsenal/model/stats";
import { previewUpgrade } from "../src/features/arsenal/model/preview";
import { weaponReadout } from "../src/features/arsenal/ui/ArsenalPanel";
import { chooseUpgrade, rollChoices } from "../src/features/progression";
import { stepWaves } from "../src/features/waves";
import { stepCombat } from "../src/features/combat";
import { simulate } from "../src/app/simulate";
import { applyEvents, makeRecord } from "../src/features/results/model/ledger";
import type {
  FrameEvents,
  GameDoc,
  Weapon,
  WeaponId,
} from "../src/shared/types";
const aim = { x: 0, y: 0, aim: { x: 700, y: 325 }, firing: false };
const dummy = {
  id: 1,
  kind: "chaser" as const,
  x: 600,
  y: 325,
  hp: 1_000_000,
  maxHp: 1_000_000,
  radius: 12,
  cooldown: 0,
};
const events = (): FrameEvents => ({
  kills: [],
  damage: 0,
  taken: 0,
  shots: 0,
  collected: 0,
  weaponDamage: {},
  weaponHits: {},
});
const armed = (id: WeaponId, level = 1): GameDoc => {
  const d = createRun();
  d.phase = "playing";
  d.enemies = [{ ...dummy }];
  d.weapons = [createWeapon(id, level)];
  return d;
};
test("a fresh weapon starts with a full magazine and no heat", () => {
  const d = createRun(),
    w = d.weapons[0],
    stats = weaponStats(w, d.upgrades);
  assert.equal(w.ammo, stats.magazine);
  assert.equal(w.heat, 0);
  assert.equal(w.recovery, "none");
  assert.equal(w.pendingLevels, 0);
});
test("firing spends one round per trigger cycle and never overdraws", () => {
  const d = armed("pulse");
  let rounds = 0;
  for (let f = 0; f < 60 * 12; f++) {
    const before = d.weapons[0].ammo;
    if (stepArsenal(d, aim, 1 / 60) > 0) {
      rounds++;
      assert.ok(d.weapons[0].ammo >= 0);
      assert.equal(before - d.weapons[0].ammo, 1);
    }
    d.enemies = [{ ...dummy }];
    d.bullets = [];
  }
  assert.ok(rounds > 0);
});
test("an empty magazine starts exactly one reload and refills on completion", () => {
  const d = armed("pulse");
  d.weapons[0].ammo = 1;
  stepArsenal(d, aim, 1 / 60);
  assert.equal(d.weapons[0].ammo, 0);
  assert.equal(d.weapons[0].recovery, "reload");
  let reloadStarts = 0,
    completed = false;
  for (let f = 0; f < 120 && !completed; f++) {
    const before = d.weapons[0].recovery;
    stepArsenal(d, aim, 1 / 60);
    const after = d.weapons[0].recovery;
    if (before === "none" && after === "reload") reloadStarts++;
    if (before === "reload" && after === "none") completed = true;
    assert.notEqual(after, "vent");
  }
  assert.ok(completed, "the reload completes");
  assert.equal(reloadStarts, 0, "the same reload keeps running");
  assert.equal(
    d.weapons[0].ammo,
    weaponStats(d.weapons[0], d.upgrades).magazine,
  );
});
test("the frame that completes a recovery never also fires", () => {
  const d = armed("pulse");
  d.weapons[0].ammo = 1;
  stepArsenal(d, aim, 1 / 60);
  const w = d.weapons[0];
  let completed = false,
    shotsOnCompletion = -1;
  for (let f = 0; f < 300; f++) {
    const wasRecovering = w.recovery !== "none",
      shots = stepArsenal(d, aim, 1 / 60);
    if (wasRecovering && w.recovery === "none") {
      completed = true;
      shotsOnCompletion = shots;
      break;
    }
  }
  assert.ok(completed);
  assert.equal(shotsOnCompletion, 0);
});
test("a full heat bar forces a vent and firing resumes only afterwards", () => {
  const d = armed("orbit");
  const stats = weaponStats(d.weapons[0], d.upgrades);
  let sawVent = false;
  for (let f = 0; f < 60 * 40; f++) {
    const w = d.weapons[0];
    const recovering = w.recovery !== "none";
    const shots = stepArsenal(d, aim, 1 / 60);
    if (recovering) assert.equal(shots, 0, "recovery frames never fire");
    if (w.recovery === "vent") {
      sawVent = true;
      assert.ok(w.heat <= stats.heatMax);
    }
    d.enemies = [{ ...dummy }];
    d.bullets = [];
  }
  assert.ok(sawVent, "sustained fire should overheat within 40 seconds");
});
test("magazine and heat exhausted in one frame open a single recovery", () => {
  const d = armed("pulse");
  const w = d.weapons[0],
    stats = weaponStats(w, d.upgrades);
  // Arrange the exact boundary: this shot empties the magazine and, at the
  // same time, brings heat to the cap.
  w.ammo = 1;
  w.heat = stats.heatMax - stats.heatPerBurst;
  w.cooldown = 0;
  stepArsenal(d, aim, 1 / 60);
  assert.equal(w.ammo, 0);
  assert.equal(w.heat, stats.heatMax);
  assert.equal(w.recovery, "reload", "only the reload may start this frame");
  assert.equal(w.heat, stats.heatMax, "reload must not also vent");
  // The overflow heat is handled by a later, separate vent cycle.
  let sawVent = false;
  for (let f = 0; f < 600 && !sawVent; f++) {
    stepArsenal(d, aim, 1 / 60);
    sawVent = w.recovery === "vent";
  }
  assert.ok(sawVent, "leftover heat must still be vented afterwards");
});
test("legacy weapons migrate with a full magazine and no recovery", () => {
  const legacy = { id: "orbit", level: 2, cooldown: 0.3 } as unknown as Weapon;
  const migrated = migrateWeapon(legacy, {});
  assert.equal(migrated.ammo, weaponStats(migrated, {}).magazine);
  assert.equal(migrated.heat, 0);
  assert.equal(migrated.recovery, "none");
  assert.equal(migrated.recoveryTime, 0);
  assert.equal(migrated.pendingLevels, 0);
  assert.equal(migrated.cooldown, 0.3, "existing cooldown is preserved");
});
test("live weapon state survives migration instead of being refilled", () => {
  const live = createWeapon("nova", 1);
  live.ammo = 1;
  live.heat = 40;
  live.recovery = "vent";
  live.recoveryTime = 0.5;
  live.recoveryDuration = 2;
  const migrated = migrateWeapon(live, {});
  assert.equal(migrated.ammo, 1);
  assert.equal(migrated.heat, 40);
  assert.equal(migrated.recovery, "vent");
  assert.equal(migrated.recoveryTime, 0.5);
});
test("weapon upgrades apply at the next legal boundary, not during reload", () => {
  const d = armed("pulse");
  d.weapons[0].ammo = 1;
  stepArsenal(d, aim, 1 / 60);
  const w = d.weapons[0];
  assert.equal(w.recovery, "reload");
  const ammoBefore = w.ammo,
    heatBefore = w.heat,
    cooldownBefore = w.cooldown,
    recoveryBefore = w.recoveryTime;
  d.phase = "upgrade";
  d.pendingLevels = 1;
  d.choices = ["pulse"];
  chooseUpgrade(d, "pulse");
  assert.equal(w.level, 1, "level must not change while paused");
  assert.equal(w.pendingLevels, 1);
  assert.equal(w.ammo, ammoBefore, "upgrading never refills the magazine");
  assert.equal(w.heat, heatBefore);
  assert.equal(w.cooldown, cooldownBefore);
  assert.equal(w.recoveryTime, recoveryBefore, "reload is not reset");
  let fired = false;
  for (let f = 0; f < 300 && !fired; f++) {
    fired = stepArsenal(d, aim, 1 / 60) > 0;
    assert.ok(w.level === 1 || w.level === 2);
  }
  assert.ok(fired);
  assert.equal(w.level, 2);
  assert.equal(w.pendingLevels, 0);
});
test("queued upgrades never grant a free trigger cycle", () => {
  const d = armed("pulse");
  d.weapons[0].cooldown = 10;
  const w = d.weapons[0];
  for (let i = 0; i < 4; i++) {
    d.phase = "upgrade";
    d.pendingLevels = 1;
    d.choices = ["pulse"];
    chooseUpgrade(d, "pulse");
  }
  assert.equal(w.pendingLevels, 4);
  assert.equal(w.level, 1);
  assert.equal(stepArsenal(d, aim, 1 / 60), 0);
  assert.equal(w.level, 1, "level waits for the trigger boundary");
  let volleys = 0,
    levelAtFirstVolley = 0;
  for (let f = 0; f < 700; f++) {
    const shots = stepArsenal(d, aim, 1 / 60);
    if (shots > 0) {
      volleys++;
      if (!levelAtFirstVolley) levelAtFirstVolley = w.level;
      // The trigger is busy again immediately: no second volley this frame.
      assert.equal(stepArsenal(d, aim, 0), 0);
    }
  }
  assert.ok(volleys > 0);
  assert.equal(levelAtFirstVolley, 5, "queued levels land on the first volley");
  assert.equal(w.level, 5);
  assert.equal(w.pendingLevels, 0);
});
test("a weapon upgrade mid-reload cannot enlarge that reload's refill", () => {
  const d = armed("pulse");
  d.weapons[0].ammo = 1;
  stepArsenal(d, aim, 1 / 60);
  const w = d.weapons[0],
    frozenMagazine = weaponStats(w, d.upgrades).magazine;
  assert.equal(w.recovery, "reload");
  d.phase = "upgrade";
  d.pendingLevels = 1;
  d.choices = ["pulse"];
  chooseUpgrade(d, "pulse");
  let finished = false;
  for (let f = 0; f < 200 && !finished; f++) {
    stepArsenal(d, aim, 1 / 60);
    finished = w.recovery === "none";
  }
  assert.ok(finished);
  assert.equal(w.ammo, frozenMagazine, "the running reload keeps its size");
  // The level and its wider magazine only arrive on the next legal shot, and
  // that upgrade still never tops up the rounds already loaded.
  let fired = false;
  for (let f = 0; f < 200 && !fired; f++) fired = stepArsenal(d, aim, 1 / 60) > 0;
  assert.ok(fired);
  assert.equal(w.level, 2);
  assert.equal(
    weaponStats(w, d.upgrades).magazine,
    frozenMagazine + 4,
    "the wider magazine applies from the next reload",
  );
  assert.equal(w.ammo, frozenMagazine - 1, "the upgrade hands out no free rounds");
});
test("an unrelated upgrade during the pause does not touch the magazine", () => {
  const d = armed("nova");
  d.weapons[0].ammo = 1;
  const w = d.weapons[0];
  d.phase = "upgrade";
  d.pendingLevels = 1;
  d.choices = ["recovery"];
  chooseUpgrade(d, "recovery");
  assert.equal(w.ammo, 1);
  assert.equal(w.recovery, "none");
});
test("pause and upgrade pauses freeze reload, heat and trigger timers", () => {
  const d = armed("pulse");
  d.weapons[0].ammo = 1;
  stepArsenal(d, aim, 1 / 60);
  const w = d.weapons[0],
    snapshot = {
      ammo: w.ammo,
      heat: w.heat,
      cooldown: w.cooldown,
      recovery: w.recovery,
      recoveryTime: w.recoveryTime,
    };
  d.phase = "upgrade";
  simulate(d, aim, 1 / 60);
  d.phase = "paused";
  simulate(d, aim, 1 / 60);
  assert.deepEqual(
    {
      ammo: w.ammo,
      heat: w.heat,
      cooldown: w.cooldown,
      recovery: w.recovery,
      recoveryTime: w.recoveryTime,
    },
    snapshot,
  );
});
test("crossing into a new wave does not refill ammunition", () => {
  const d = armed("pulse");
  d.weapons[0].ammo = 4;
  d.wave = 1;
  d.waveTime = 29.99;
  stepWaves(d, 0.02);
  assert.equal(d.wave, 2);
  assert.equal(d.weapons[0].ammo, 4);
});
test("haste and reload upgrades compose independently", () => {
  const d = armed("pulse");
  const base = weaponStats(d.weapons[0], {});
  const haste = weaponStats(d.weapons[0], { haste: 2 });
  const reload = weaponStats(d.weapons[0], { reload: 2 });
  const both = weaponStats(d.weapons[0], { haste: 2, reload: 2 });
  assert.ok(haste.interval < base.interval);
  assert.equal(haste.reload, base.reload);
  assert.ok(reload.reload < base.reload);
  assert.equal(reload.interval, base.interval);
  assert.equal(both.interval, haste.interval);
  assert.equal(both.reload, reload.reload);
});
test("the panel readout is built from the same effective stats", () => {
  const d = armed("pulse", 3);
  d.weapons[0].ammo = 7;
  d.weapons[0].heat = 42;
  const readout = weaponReadout(d, d.weapons[0]);
  const stats = weaponStats(d.weapons[0], d.upgrades);
  assert.equal(readout.ammo, 7);
  assert.equal(readout.magazine, stats.magazine);
  assert.equal(readout.heatMax, stats.heatMax);
  assert.equal(readout.interval, stats.interval);
  assert.equal(readout.damage, stats.damage);
});
test("upgrade previews share the effective stats used by combat", () => {
  const d = armed("pulse");
  const preview = previewUpgrade(d, "pulse");
  assert.ok(preview);
  const next = weaponStats({ id: "pulse", level: 2 }, d.upgrades);
  const damageLine = preview.lines.find((l) => l.label === "伤害"),
    magazineLine = preview.lines.find((l) => l.label === "弹匣"),
    intervalLine = preview.lines.find((l) => l.label === "射击间隔");
  assert.equal(damageLine?.to, next.damage.toFixed(1));
  assert.equal(magazineLine?.to, `${next.magazine}`);
  assert.equal(intervalLine?.to, next.interval.toFixed(2) + "s");
  const hastePreview = previewUpgrade(d, "haste");
  assert.ok(hastePreview);
  assert.ok(hastePreview.lines.some((l) => l.label === "脉冲步枪间隔"));
  assert.ok(
    hastePreview.lines.some(
      (l) => l.label === "装填时间" && l.to === "不变",
    ),
  );
  const reloadPreview = previewUpgrade(d, "reload");
  assert.ok(reloadPreview);
  assert.ok(
    reloadPreview.lines.some(
      (l) => l.label === "射击间隔" && l.to === "不变",
    ),
  );
});
test("one trigger cycle launches exactly the previewed projectile count", () => {
  const d = armed("orbit", 3);
  const stats = weaponStats(d.weapons[0], d.upgrades);
  const shots = stepArsenal(d, aim, 1 / 60);
  assert.equal(shots, stats.count);
  assert.equal(
    d.bullets.filter((b) => b.owner === "player").length,
    stats.count,
  );
});
test("results separate launch count from impact count", () => {
  const d = armed("pulse");
  const e = events();
  e.shots = 6;
  e.weaponHits = { pulse: 2 };
  e.weaponDamage = { pulse: 12 };
  applyEvents(d, e);
  assert.equal(d.stats.shots, 6);
  assert.equal(d.stats.hits, 2);
  assert.equal(d.stats.hitsByWeapon.pulse, 2);
  const record = makeRecord(d);
  assert.equal(record.shots, 6);
  assert.equal(record.hits, 2);
});
test("one projectile that pierces twice counts one launch and two impacts", () => {
  const d = armed("pulse");
  d.enemies = [
    { ...dummy, id: 1, x: 560, hp: 10 },
    { ...dummy, id: 2, x: 600, hp: 10 },
  ];
  d.bullets = [
    {
      id: 9,
      x: 540,
      y: 325,
      vx: 1000,
      vy: 0,
      radius: 4,
      damage: 5,
      life: 1,
      owner: "player",
      weapon: "pulse",
      pierce: 1,
      hit: [],
    },
  ];
  applyEvents(d, stepCombat(d, { ...aim, x: 0, y: 0 }, 0.05));
  assert.equal(d.stats.shots, 0, "the launch was counted on its own frame");
  assert.equal(d.stats.hits, 2);
});
test("skill choices exclude maxed upgrades and keep the recovery fallback", () => {
  const d = createRun();
  d.phase = "playing";
  const maxed: Record<string, number> = {
    power: 5,
    haste: 5,
    reload: 4,
    speed: 4,
    vitality: 5,
    armor: 4,
    magnet: 4,
    pierce: 3,
    pulse: 4,
    orbit: 5,
    nova: 5,
  };
  for (const [id, value] of Object.entries(maxed)) d.upgrades[id] = value;
  rollChoices(d);
  assert.deepEqual(d.choices, ["recovery"]);
});
