import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createMapData } from '../src/map/MapData.ts';
import { GameWorld } from '../src/gameplay/GameWorld.ts';
import { buildRenderSnapshot } from '../src/gameplay/RenderSnapshotBuilder.ts';

const map = createMapData(JSON.parse(readFileSync(
  new URL('../public/maps/asteria/map.json', import.meta.url), 'utf8',
)));
const scenario = JSON.parse(readFileSync(
  new URL('../public/scenarios/asteria-1936.json', import.meta.url), 'utf8',
));

test('五国依照剧本顺序轮流行动；整轮结束才增加轮数', () => {
  const world = new GameWorld(map, scenario);
  assert.equal(world.round, 1);
  assert.equal(world.activeCountryId, scenario.countries[0].id);
  assert.equal(world.turnPosition, 1);
  assert.equal(world.revision, 0);

  let snapshot = buildRenderSnapshot(world);
  assert.ok(Object.isFrozen(snapshot.turn));
  assert.deepEqual(snapshot.turn, {
    round: 1, activeCountryId: scenario.countries[0].id,
    countryIndex: 1, countryCount: 5,
  });
  const original = snapshot;

  for (let i = 1; i < scenario.countries.length; i++) {
    world.endTurn();
    assert.equal(world.activeCountryId, scenario.countries[i].id);
    assert.equal(world.turnPosition, i + 1);
    assert.equal(world.round, 1);
    assert.equal(world.revision, i);
  }

  world.endTurn();
  assert.equal(world.activeCountryId, scenario.countries[0].id);
  assert.equal(world.turnPosition, 1);
  assert.equal(world.round, 2);
  assert.equal(world.revision, 5);
  snapshot = buildRenderSnapshot(world);
  assert.equal(snapshot.turn.round, 2);
  assert.equal(snapshot.turn.activeCountryId, scenario.countries[0].id);
  assert.equal(original.turn.round, 1, '旧的不可变快照不能随 GameWorld 转变');
});

test('移动和攻击仅允许当前国家；非法命令不能改变任何状态', () => {
  const world = new GameWorld(map, scenario);
  const nordland = world.unitById('nordland-infantry-1');
  const originalSnapshot = buildRenderSnapshot(world);
  assert.deepEqual([...world.reachableFor(nordland.id).keys()], []);
  assert.deepEqual([...world.attackableFor(nordland.id).keys()], []);
  assert.throws(() => world.moveUnit(nordland.id, '6,5'), /不能操作其他国家/);
  assert.throws(() => world.attackUnit(nordland.id, '6,5'), /不能操作其他国家/);
  assert.equal(world.revision, 0);
  assert.deepEqual(buildRenderSnapshot(world), originalSnapshot);

  world.endTurn(); // Nordland becomes active
  assert.equal(world.activeCountryId, 'nordland');
  assert.ok(world.attackableFor(nordland.id).has('6,5'));
  const combat = world.attackUnit(nordland.id, '6,5');
  assert.ok(combat.damageToDefender > 0);
  assert.equal(world.unitById(nordland.id).attacksRemaining, 0);

  const beforeNextTurn = world.revision;
  assert.throws(() => world.attackUnit('aurelia-infantry-1', '7,5'), /不能操作其他国家/);
  assert.equal(world.revision, beforeNextTurn);
});

test('行动力和攻击次数仅在该国家再次获得行动权时恢复，HP 不恢复', () => {
  const world = new GameWorld(map, scenario);
  const unitId = 'aurelia-infantry-1';
  const firstAttack = world.attackUnit(unitId, '7,5');
  assert.ok(firstAttack.damageToAttacker > 0);
  const hpAfterCombat = world.unitById(unitId).hp;
  assert.equal(world.unitById(unitId).attacksRemaining, 0);

  world.moveUnit(unitId, '5,5');
  const afterMove = world.unitById(unitId);
  assert.ok(afterMove.mpRemaining < afterMove.maxMp);
  const remainingMp = afterMove.mpRemaining;
  const priorControl = world.controllerOf('5,5');

  world.endTurn();
  assert.equal(world.activeCountryId, 'nordland');
  assert.equal(world.unitById(unitId).hp, hpAfterCombat);
  assert.equal(world.unitById(unitId).attacksRemaining, 0);
  assert.equal(world.unitById(unitId).mpRemaining, remainingMp);
  assert.equal(world.controllerOf('5,5'), priorControl);

  for (let i = 0; i < 4; i++) world.endTurn();
  const restored = world.unitById(unitId);
  assert.equal(world.round, 2);
  assert.equal(world.activeCountryId, 'aurelia');
  assert.equal(restored.mpRemaining, restored.maxMp);
  assert.equal(restored.attacksRemaining, 1);
  assert.equal(restored.hp, hpAfterCombat, '自然结束回合不应该治疗部队');
  assert.equal(restored.hexId, afterMove.hexId, '回合切换不改变单位位置');
});

test('被消灭单位不能复活，空军队也可正常轮换', () => {
  const mini = createMapData({
    id: 'minimal', name: 'two countries', version: 1,
    grid: { orientation: 'pointy', cols: 2, rows: 1, radius: 24,
      originX: 25, originY: 25, worldWidth: 130, worldHeight: 75 },
    terrains: ['plains'],
    provinces: [{ id: 'left', name: 'A' }, { id: 'right', name: 'B' }],
    tiles: [[0, 0], [1, 0]],
    cities: [],
  });
  const camp = {
    id: 'mini-start', name: 'mini', version: 1, mapId: 'minimal',
    countries: [{ id: 'a', name: 'A', color: 0x112233 }, { id: 'b', name: 'B', color: 0x334455 }],
    provinceSovereignty: { left: 'a', right: 'b' },
    initialUnits: [],
  };
  const world = new GameWorld(mini, camp);
  world.endTurn();
  assert.equal(world.activeCountryId, 'b');
  assert.equal(world.round, 1);
  world.endTurn();
  assert.equal(world.activeCountryId, 'a');
  assert.equal(world.round, 2);
  assert.equal(world.units.length, 0);
});
