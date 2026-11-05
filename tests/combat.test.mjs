import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { createMapData } from '../src/map/MapData.ts';
import { GameWorld } from '../src/gameplay/GameWorld.ts';
import { buildRenderSnapshot } from '../src/gameplay/RenderSnapshotBuilder.ts';
import { calculateDamage, coverAt, isInAttackRange, previewCombat } from '../src/gameplay/Combat.ts';

const mapAsset = JSON.parse(readFileSync(new URL('../public/maps/asteria/map.json', import.meta.url), 'utf8'));
const scenario = JSON.parse(readFileSync(new URL('../public/scenarios/asteria-1936.json', import.meta.url), 'utf8'));
const map = createMapData(mapAsset);

function makeLineWorld() {
  const line = createMapData({
    id: 'combat-line', name: '战斗测试走廊', version: 1,
    grid: { orientation: 'pointy', cols: 5, rows: 1, radius: 24,
      originX: 25, originY: 25, worldWidth: 260, worldHeight: 80 },
    terrains: ['plains'],
    provinces: [{ id: 'a-land', name: '甲省' }, { id: 'b-land', name: '乙省' }],
    tiles: [[0, 0], [0, 0], [0, 0], [1, 0], [1, 0]],
    cities: [],
  });
  const camp = {
    id: 'combat-line-start', name: '测试剧本', version: 1, mapId: 'combat-line',
    countries: [
      { id: 'a', name: '甲', color: 0xaabbcc },
      { id: 'b', name: '乙', color: 0x445566 },
    ],
    provinceSovereignty: { 'a-land': 'a', 'b-land': 'b' },
    initialUnits: [
      { id: 'gun-0', countryId: 'a', kind: 'artillery', hexId: '0,0' },
      { id: 'gun-1', countryId: 'a', kind: 'artillery', hexId: '1,0' },
      { id: 'gun-2', countryId: 'a', kind: 'artillery', hexId: '2,0' },
      { id: 'defender', countryId: 'b', kind: 'infantry', hexId: '3,0' },
    ],
  };
  return new GameWorld(line, camp);
}

test('战斗确定性、先攻击后反击，反击使用受击后的 HP', () => {
  const world = new GameWorld(map, scenario);
  const before = buildRenderSnapshot(world);
  const targets = world.attackableFor('aurelia-infantry-1');
  const preview = targets.get('7,5');
  assert.ok(preview, '相邻的北境步兵应在攻击射程内');
  assert.equal(preview.damageToDefender, 25);
  assert.equal(preview.defenderRemainingHp, 75);
  assert.equal(preview.counterattacked, true);
  assert.equal(preview.damageToAttacker, 21);
  assert.equal(preview.attackerRemainingHp, 79);
  assert.deepEqual(world.attackableFor('aurelia-infantry-1').get('7,5'), preview);

  const result = world.attackUnit('aurelia-infantry-1', '7,5');
  assert.deepEqual(result, preview);
  const actor = world.unitById('aurelia-infantry-1');
  const defender = world.unitById('nordland-infantry-1');
  assert.equal(actor.hp, 79);
  assert.equal(defender.hp, 75);
  assert.equal(actor.attacksRemaining, 0);
  assert.equal(defender.attacksRemaining, 1, '反击不能消耗防守方主动攻击次数');
  assert.equal(actor.mpRemaining, actor.maxMp, '主动攻击不扣 MP');
  assert.equal(defender.mpRemaining, defender.maxMp, '反击不扣 MP');
  assert.equal(actor.hexId, '6,5');
  assert.equal(defender.hexId, '7,5');
  assert.equal(world.revision, 1);
  assert.equal(world.attackableFor(actor.id).size, 0);
  assert.equal(before.units.find(unit => unit.id === actor.id).hp, 100, '旧快照不应被修改');
  assert.equal(buildRenderSnapshot(world).units.find(unit => unit.id === actor.id).hp, 79);

  assert.throws(() => world.attackUnit(actor.id, '7,5'), /攻击次数/);
  assert.equal(world.revision, 1, '非法攻击不得修改 GameWorld');
  assert.equal(world.unitById(actor.id).hp, 79);

  // A unit can still move after expending its active attack opportunity.
  const movable = world.reachableFor(actor.id);
  assert.ok(movable.has('5,5'));
  world.moveUnit(actor.id, '5,5');
  assert.equal(world.unitById(actor.id).attacksRemaining, 0);
});

test('反击不消耗次数，即使防守方主动攻击机会已经使用', () => {
  const world = new GameWorld(map, scenario);
  const enemy = world.unitById('nordland-infantry-1');
  const actor = world.unitById('aurelia-infantry-1');
  const result = previewCombat(map, actor, { ...enemy, attacksRemaining: 0 });
  assert.equal(result.counterattacked, true);
  assert.equal(result.damageToAttacker, 21);
});

test('远程攻击超出防守方射程时无法反击', () => {
  const world = makeLineWorld();
  const preview = world.attackableFor('gun-0').get('3,0');
  assert.ok(preview);
  assert.equal(preview.damageToDefender, 45); // artillery vs infantry multiplier 1.3
  assert.equal(preview.damageToAttacker, 0);
  assert.equal(preview.counterattacked, false);
  assert.ok(isInAttackRange(world.unitById('gun-0'), world.unitById('defender')));
  assert.equal(isInAttackRange(world.unitById('defender'), world.unitById('gun-0')), false);
  assert.equal(world.attackableFor('defender').has('0,0'), false);
});

test('被消灭的防守方不能反击、不会自动推进或改变 Hex 控制权', () => {
  const world = makeLineWorld();
  const oldControl = world.controllerOf('3,0');
  const first = world.attackUnit('gun-0', '3,0');
  assert.equal(first.defenderRemainingHp, 55);
  assert.equal(first.counterattacked, false);

  const second = world.attackUnit('gun-1', '3,0');
  assert.equal(second.damageToDefender, 45);
  assert.equal(second.defenderRemainingHp, 10);
  assert.equal(second.counterattacked, false);

  const third = world.attackUnit('gun-2', '3,0');
  assert.equal(third.defenderDestroyed, true);
  assert.equal(third.counterattacked, false);
  assert.equal(third.damageToAttacker, 0);
  assert.equal(world.unitAt('3,0'), undefined);
  assert.equal(world.unitById('gun-2').hexId, '2,0', '不能自动推进');
  assert.equal(world.controllerOf('3,0'), oldControl, '不能通过攻击直接占领');
  assert.equal(world.attackableFor('gun-2').size, 0);
  assert.equal(world.unitById('gun-2').mpRemaining, 2);
  assert.equal(buildRenderSnapshot(world).units.length, 3);
  assert.equal(world.reachableFor('gun-2').get('3,0').cost, 1,
    '被消灭的步兵不再施加 ZOC');
  world.moveUnit('gun-2', '3,0');
  assert.equal(world.controllerOf('3,0'), 'a', '通过移动进入时才改变控制权');
});

test('HP 影响攻击力，低 HP 伤害仍有 50% 基础攻击保障', () => {
  const world = new GameWorld(map, scenario);
  const attacker = world.unitById('aurelia-infantry-1');
  const defender = world.unitById('nordland-tank-1');
  assert.equal(calculateDamage(attacker, defender, map), 16);
  assert.equal(calculateDamage({ ...attacker, hp: 20 }, defender, map), 9);
  assert.equal(calculateDamage({ ...attacker, hp: 1 }, defender, map), 8);
});

test('城市与地形防御不叠加，最高掩护值优先', () => {
  const villageMap = createMapData({
    id: 'cover', name: '防御地形测试', version: 1,
    grid: { orientation: 'pointy', cols: 2, rows: 1, radius: 24,
      originX: 25, originY: 25, worldWidth: 180, worldHeight: 80 },
    terrains: ['plains', 'mountains'],
    provinces: [{ id: 'mountain-province', name: '山省' }],
    tiles: [[0, 0], [0, 1]],
    cities: [{ id: 'mountain-city', name: '山城', provinceId: 'mountain-province',
      hexId: '1,0', kind: 'city' }],
  });
  assert.equal(coverAt(villageMap, '0,0'), 0);
  assert.equal(coverAt(villageMap, '1,0'), 20);
  assert.equal(coverAt(map, '2,5'), 15);
});

test('攻击不可越射程、不能攻击友军、目标空格或已耗尽主动攻击机会', () => {
  const world = new GameWorld(map, scenario);
  const originalRevision = world.revision;
  assert.throws(() => world.attackUnit('aurelia-infantry-1', '6,5'), /友军或自己/);
  assert.throws(() => world.attackUnit('aurelia-infantry-1', '4,10'), /友军或自己/);
  assert.throws(() => world.attackUnit('aurelia-infantry-1', '10,8'), /射程/);
  assert.throws(() => world.attackUnit('aurelia-infantry-1', '0,0'), /没有可攻击/);
  assert.equal(world.revision, originalRevision);
  assert.equal(world.unitById('aurelia-infantry-1').attacksRemaining, 1);
});
