import assert from 'node:assert/strict';
import test from 'node:test';

import { createMapData } from '../src/map/MapData.ts';
import { GameWorld } from '../src/gameplay/GameWorld.ts';
import { blocksAdministrativeTakeover, resolveCityCaptures } from '../src/gameplay/CityOccupation.ts';
import { buildRenderSnapshot } from '../src/gameplay/RenderSnapshotBuilder.ts';

/** 5x3 test theater, deliberately with a city surrounded by six valid Hexes. */
function worldWithCity({
  extraUnits = [],
  secondCity = false,
  provinceBorder = false,
  cityHex = provinceBorder ? '2,1' : '1,1',
} = {}) {
  const tiles = Array.from({ length: 15 }, (_, index) => {
    const col = index % 5;
    return [provinceBorder && col >= 3 ? 1 : 0, 0];
  });
  const cities = [{ id: 'center', name: '中央城', provinceId: 'west',
    hexId: cityHex, kind: 'city' }];
  if (secondCity) cities.push({
    id: 'adjacent', name: '邻城', provinceId: 'west', hexId: '2,1', kind: 'city',
  });
  const map = createMapData({
    id: 'capture-map', name: '行政接管测试', version: 1,
    grid: { orientation: 'pointy', cols: 5, rows: 3, radius: 24,
      originX: 30, originY: 30, worldWidth: 280, worldHeight: 180 },
    terrains: ['plains'],
    provinces: provinceBorder
      ? [{ id: 'west', name: '西省' }, { id: 'east', name: '东省' }]
      : [{ id: 'west', name: '西省' }],
    tiles,
    cities,
  });
  const origin = provinceBorder ? '2,0' : '1,0';
  const scenario = {
    id: 'test-start', name: '测试', version: 1, mapId: 'capture-map',
    countries: [
      { id: 'a', name: 'A', color: 0xbbaa99 },
      { id: 'b', name: 'B', color: 0x445577 },
      { id: 'c', name: 'C', color: 0x778844 },
    ],
    provinceSovereignty: provinceBorder ? { west: 'b', east: 'b' } : { west: 'b' },
    initialHexControl: { [origin]: 'a' },
    initialUnits: [
      { id: 'captor', kind: 'infantry', hexId: origin, countryId: 'a' },
      ...extraUnits,
    ],
  };
  return { world: new GameWorld(map, scenario), map, origin, cityHex };
}

test('先进入城市夺取控制权，邻格只在结束回合时接管，且不重复', () => {
  const { world, cityHex, origin, map } = worldWithCity();
  const before = buildRenderSnapshot(world);
  assert.equal(world.controllerOf(cityHex), 'b');
  assert.equal(world.reachableFor('captor').get(cityHex)?.cost, 1);
  world.moveUnit('captor', cityHex);
  assert.equal(world.controllerOf(cityHex), 'a', '城市 Hex 应立即变更控制权');
  assert.equal(world.controllerOf('0,1'), 'b', '行政邻格必须等待结束回合');
  assert.equal(world.unitById('captor').hexId, cityHex);

  const settlement = world.endTurn();
  assert.deepEqual(settlement.settledCityIds, ['center']);
  assert.equal(settlement.claims.length, 5);
  assert.deepEqual(settlement.contestedHexIds, []);
  for (const claim of settlement.claims) {
    assert.equal(claim.controllerId, 'a');
    assert.equal(world.controllerOf(claim.hexId), 'a');
    assert.equal(map.hexesById.get(claim.hexId).provinceId, 'west');
  }
  assert.equal(world.unitById('captor').hexId, cityHex);
  assert.equal(world.round, 1);
  assert.equal(world.activeCountryId, 'b');
  assert.equal(before.hexes.find(x => x.hexId === cityHex).controllerId, 'b');
  assert.equal(buildRenderSnapshot(world).hexes.find(x => x.hexId === '0,1').controllerId, 'a');
  assert.equal(world.endTurn().claims.length, 0, '不得在没有新城市捕获事件时重复接管');
  assert.equal(world.endTurn().claims.length, 0);
  assert.equal(world.endTurn().claims.length, 0);
});

test('占领后若城市控制权再次变化，旧捕获者不能在结算时接管', () => {
  const { world, cityHex } = worldWithCity();
  world.moveUnit('captor', cityHex);
  // Low-level scenario/simulation mutation is used only to simulate a recapture
  // before the event is settled. The most recent city controller wins.
  world.applyControlChanges([{ hexId: cityHex, controllerId: 'b' }]);
  const settle = world.endTurn();
  assert.equal(world.controllerOf(cityHex), 'b');
  assert.equal(world.controllerOf('0,1'), 'b');
  assert.equal(settle.claims.length, 0);
  assert.ok(!settle.claims.some(x => x.controllerId === 'a'));
});

test('驻军与行政阻断 ZOC 分离：步兵、坦克、反坦克阻断相邻格，火炮只阻挡驻扎格', () => {
  for (const [kind, expectedClaims] of [
    ['infantry', 3], ['tank', 3], ['antiTank', 3], ['artillery', 4],
  ]) {
    const { world, map, cityHex } = worldWithCity({ extraUnits: [
      { id: 'guard', countryId: 'b', kind, hexId: '0,1' },
    ] });
    const guard = world.unitById('guard');
    assert.equal(blocksAdministrativeTakeover(map, '0,2', 'a', [guard]),
      kind !== 'artillery', kind);
    world.moveUnit('captor', cityHex);
    const result = world.endTurn();
    assert.equal(result.claims.length, expectedClaims, kind);
    assert.equal(world.controllerOf('0,1'), 'b', '敌方驻军所在格不得被接管');
    assert.equal(world.controllerOf('0,2'), kind === 'artillery' ? 'a' : 'b',
      `行政阻断验证：${kind}`);
  }
});

test('越过省界、另一座城市、海洋的 Hex 均不可行政接管', () => {
  const withBorder = worldWithCity({ provinceBorder: true });
  withBorder.world.moveUnit('captor', withBorder.cityHex);
  const borderResult = withBorder.world.endTurn();
  assert.equal(borderResult.claims.length, 2);
  for (const id of ['3,1', '3,0', '2,2']) {
    assert.equal(withBorder.world.controllerOf(id), 'b', `不得跨省自动接管 ${id}`);
  }

  const withOtherCity = worldWithCity({ secondCity: true });
  withOtherCity.world.moveUnit('captor', withOtherCity.cityHex);
  const otherCityResult = withOtherCity.world.endTurn();
  assert.equal(otherCityResult.claims.length, 4);
  assert.equal(withOtherCity.world.controllerOf('2,1'), 'b');
  assert.deepEqual(withOtherCity.world.endTurn().settledCityIds, [],
    '自动接管不得触发邻近城市的连锁事件');

  const { world, map } = worldWithCity();
  const originalMap = structuredClone(map.definition);
  // This is outside a city but within radius 1; ocean has no province.
  const oceanIndex = 2 * originalMap.grid.cols + (0 + 1); // q=0,r=2 -> offset col=1
  originalMap.tiles[oceanIndex] = [-1, 1];
  originalMap.terrains.push('ocean');
  const seaMap = createMapData(originalMap);
  const controllers = id => id === '1,1' ? 'a' : 'b';
  const result = resolveCityCaptures(seaMap, controllers, [], [{ cityId: 'center', controllerId: 'a' }]);
  assert.equal(result.claims.length, 5, '水域不能作为可接管的邻格');
  assert.ok(!result.claims.some(c => c.hexId === '0,2'));
});

test('两国同时申领同一 Hex 时保持原控制权，事件顺序不影响结果', () => {
  const { map } = worldWithCity();
  const both = structuredClone(map.definition);
  both.cities.push({ id: 'second', name: '第二城', provinceId: 'west',
    hexId: '3,1', kind: 'city' });
  const multi = createMapData(both);
  const current = id => id === '1,1' ? 'a' : id === '3,1' ? 'b' : 'c';
  const events = [{ cityId: 'second', controllerId: 'b' }, { cityId: 'center', controllerId: 'a' }];
  const first = resolveCityCaptures(multi, current, [], events);
  const reversed = resolveCityCaptures(multi, current, [], [...events].reverse());
  assert.deepEqual(first, reversed);
  assert.deepEqual(first.settledCityIds, ['center', 'second']);
  assert.ok(first.contestedHexIds.includes('2,1'));
  assert.ok(!first.claims.some(claim => claim.hexId === '2,1'));
  assert.ok(!first.claims.some(claim => claim.hexId === '1,1' || claim.hexId === '3,1'));
});

test('初始剧本城市不是新增占领事件；失效事件也不生效', () => {
  const { world, map } = worldWithCity();
  const firstTurn = world.endTurn();
  assert.deepEqual(firstTurn.settledCityIds, []);
  assert.deepEqual(firstTurn.claims, []);
  const stale = resolveCityCaptures(map, () => 'b', [], [{ cityId: 'center', controllerId: 'a' }]);
  assert.deepEqual(stale.settledCityIds, []);
  assert.deepEqual(stale.claims, []);
});
