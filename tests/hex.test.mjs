import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createMapData } from '../src/map/MapData.ts';
import { fromOffset, hexCenter, hexCorners, hexDistance, hexId, neighbors } from '../src/map/hex.ts';
import { GameWorld } from '../src/gameplay/GameWorld.ts';
import { buildRenderSnapshot } from '../src/gameplay/RenderSnapshotBuilder.ts';
import { validateScenario } from '../src/gameplay/ScenarioDefinition.ts';

const asset = JSON.parse(readFileSync(new URL('../public/maps/asteria/map.json', import.meta.url), 'utf8'));
const scenario = JSON.parse(readFileSync(new URL('../public/scenarios/asteria-1936.json', import.meta.url), 'utf8'));
const map = createMapData(asset);

test('离线地图正常载入，海洋和陆地都有六边形', () => {
  assert.equal(map.definition.id, 'asteria');
  assert.equal(map.hexes.length, 29 * 19);
  assert.equal(map.hexes.filter(h => h.terrain === 'ocean').length, 128);
  assert.equal(map.hexes.filter(h => h.terrain !== 'ocean').length, 423);
  assert.equal(map.provinces.length, 20);
  assert.equal(map.cities.length, 20);
  assert.equal(new Set(map.hexes.map(h => h.id)).size, map.hexes.length);
  assert.ok(map.provinces.every(province => province.hexIds.length > 1));
  assert.ok(map.hexes.filter(h => h.terrain === 'ocean').every(h => h.provinceId === null));
  assert.ok(map.hexes.filter(h => h.terrain !== 'ocean').every(h => map.provincesById.has(h.provinceId)));
});

test('Hex 轴向坐标、几何和邻接随地图网格配置变化', () => {
  const first = fromOffset(7, 6);
  for (const next of neighbors(first)) {
    assert.equal(hexDistance(first, next), 1);
    assert.ok(Math.abs(Math.hypot(
      hexCenter(first, map.definition.grid).x - hexCenter(next, map.definition.grid).x,
      hexCenter(first, map.definition.grid).y - hexCenter(next, map.definition.grid).y,
    ) - map.definition.grid.radius * Math.sqrt(3)) < 1e-9);
  }
  assert.equal(hexCorners(first, map.definition.grid).length, 6);
  assert.equal(hexId(first), map.hexes[6 * 29 + 7].id);
});

test('城市在对应省份内，允许一个省份包含多座城市', () => {
  for (const city of map.cities) {
    assert.equal(map.hexesById.get(city.hexId)?.provinceId, city.provinceId);
  }
  const extra = map.hexes.find(h => h.provinceId === 'raven' && !map.cities.some(c => c.hexId === h.id));
  assert.ok(extra);
  const modified = structuredClone(asset);
  modified.cities.push({
    id: 'city-raven-secondary', name: '鸦堡外港',
    provinceId: 'raven', hexId: extra.id, kind: 'city',
  });
  const multiCity = createMapData(modified);
  assert.equal(multiCity.cities.filter(c => c.provinceId === 'raven').length, 2);
  assert.equal(multiCity.provincesById.get('raven').hexIds.length, map.provincesById.get('raven').hexIds.length);
});

test('剧本负责国家和省份初始主权，不污染静态地图资源', () => {
  validateScenario(scenario, map);
  assert.ok(!('ownerId' in map.provinces[0]));
  assert.ok(!('countries' in map.definition));
  assert.equal(Object.keys(scenario.provinceSovereignty).length, map.provinces.length);
  const world = new GameWorld(map, scenario);
  const firstLand = map.hexes.find(h => h.terrain !== 'ocean');
  assert.ok(firstLand);
  assert.equal(world.controllerOf(firstLand.id), scenario.provinceSovereignty[firstLand.provinceId]);
  assert.equal(world.controllerOf(map.hexes.find(h => h.terrain === 'ocean').id), null);
});

test('RenderSnapshot 是与 Gameplay 状态解耦的不可变副本', () => {
  const world = new GameWorld(map, scenario);
  const first = buildRenderSnapshot(world);
  const land = map.hexes.find(h => h.terrain !== 'ocean');
  const original = world.controllerOf(land.id);
  const other = scenario.countries.find(c => c.id !== original).id;
  assert.equal(first.mapId, 'asteria');
  assert.equal(first.revision, 0);
  assert.ok(Object.isFrozen(first) && Object.isFrozen(first.hexes));
  assert.ok(first.hexes.every(hex => typeof hex.hexId === 'string'));
  world.applyControlChanges([{ hexId: land.id, controllerId: other }]);
  const second = buildRenderSnapshot(world);
  assert.equal(second.revision, 1);
  assert.equal(first.hexes.find(h => h.hexId === land.id).controllerId, original);
  assert.equal(second.hexes.find(h => h.hexId === land.id).controllerId, other);
  assert.throws(() => world.applyControlChanges([{ hexId: 'no-such-hex', controllerId: other }]));
  assert.throws(() => world.applyControlChanges([{
    hexId: map.hexes.find(h => h.terrain === 'ocean').id, controllerId: other,
  }]));
});

test('地图读取与索引不依赖特定大陆尺寸或固定城市数量', () => {
  const mini = {
    id: 'tiny', name: '微型测试地图', version: 1,
    grid: { orientation: 'pointy', cols: 3, rows: 2, radius: 24,
      originX: 25, originY: 30, worldWidth: 200, worldHeight: 150 },
    terrains: ['ocean', 'plains'],
    provinces: [{ id: 'tiny-province', name: '测试省' }],
    tiles: [[0, 1], [0, 1], [-1, 0], [0, 1], [0, 1], [-1, 0]],
    cities: [
      { id: 'c1', name: '一号城', provinceId: 'tiny-province',
        hexId: hexId(fromOffset(0, 0)), kind: 'capital' },
      { id: 'c2', name: '二号城', provinceId: 'tiny-province',
        hexId: hexId(fromOffset(1, 1)), kind: 'city' },
    ],
  };
  const tinyMap = createMapData(mini);
  assert.equal(tinyMap.hexes.length, 6);
  assert.equal(tinyMap.cities.length, 2);
  const tinyScenario = {
    id: 'tiny-start', name: '开始', version: 1, mapId: 'tiny',
    countries: [{ id: 'test', name: '测试国家', color: 0xabcdef }],
    provinceSovereignty: { 'tiny-province': 'test' },
  };
  const tinySnapshot = buildRenderSnapshot(new GameWorld(tinyMap, tinyScenario));
  assert.equal(tinySnapshot.cities.length, 2);
  assert.equal(tinySnapshot.hexes.filter(h => h.controllerId === null).length, 2);
});

test('地图加载器拒绝无效离线数据', () => {
  const corrupt = structuredClone(asset);
  corrupt.tiles[0] = [500, 1];
  assert.throws(() => createMapData(corrupt), /索引越界/);

  const wrongCity = structuredClone(asset);
  wrongCity.cities[0].hexId = '999,999';
  assert.throws(() => createMapData(wrongCity), /城市/);

  const missingOwner = structuredClone(scenario);
  delete missingOwner.provinceSovereignty.raven;
  assert.throws(() => validateScenario(missingOwner, map), /主权/);
});

test('城市图标 SVG 源文件仍然保留', () => {
  for (const file of ['city', 'capital', 'city-marker']) {
    const svg = readFileSync(new URL(`../src/assets/${file}.svg`, import.meta.url), 'utf8');
    assert.match(svg, /<svg[^>]*viewBox="0 0 64 64"/);
    assert.match(svg, /<\/svg>/);
  }
});

test('初始剧本地面单位有效，单位进入不可变 RenderSnapshot', () => {
  const world = new GameWorld(map, scenario);
  assert.equal(world.units.length, 15);
  assert.equal(new Set(world.units.map(unit => unit.hexId)).size, world.units.length);
  assert.ok(world.units.every(unit => unit.hp === 100 && unit.maxHp === 100 && unit.mpRemaining === unit.maxMp));
  const snapshot = buildRenderSnapshot(world);
  assert.equal(snapshot.units.length, 15);
  assert.ok(Object.isFrozen(snapshot.units) && snapshot.units.every(Object.isFrozen));
  assert.equal(snapshot.units[0].hexId, world.units[0].hexId);
  const changed = world.units[0];
  assert.equal(world.unitById(changed.id)?.hexId, changed.hexId);

  const invalid = structuredClone(scenario);
  invalid.initialUnits[1].hexId = invalid.initialUnits[0].hexId;
  assert.throws(() => new GameWorld(map, invalid), /占据/);
});

function corridorScenario(units) {
  const narrowMap = createMapData({
    id: 'corridor', name: '走廊', version: 1,
    grid: { orientation: 'pointy', cols: 5, rows: 1, radius: 20,
      originX: 25, originY: 25, worldWidth: 250, worldHeight: 80 },
    terrains: ['ocean', 'plains', 'forest'],
    provinces: [{ id: 'left', name: '左' }, { id: 'right', name: '右' }],
    tiles: [[0,1],[0,1],[0,1],[1,1],[1,1]],
    cities: [],
  });
  const scenario = {
    id: 'corridor-start', name: '走廊测试', version: 1, mapId: 'corridor',
    countries: [{ id: 'a', name: 'A', color: 0xabcdef }, { id: 'b', name: 'B', color: 0xfedcba }],
    provinceSovereignty: { left: 'a', right: 'b' },
    initialUnits: units,
  };
  return new GameWorld(narrowMap, scenario);
}

test('友军占据的 Hex 可作为中转但不可停留，敌军所在格不可穿越', () => {
  const world = corridorScenario([
    { id: 'actor', countryId: 'a', kind: 'infantry', hexId: '0,0' },
    { id: 'friend', countryId: 'a', kind: 'infantry', hexId: '1,0' },
    { id: 'enemy', countryId: 'b', kind: 'infantry', hexId: '4,0' },
  ]);
  const possible = world.reachableFor('actor');
  assert.equal(possible.has('1,0'), false);
  assert.equal(possible.get('2,0')?.cost, 2);
  assert.deepEqual(possible.get('2,0')?.hexIds, ['0,0', '1,0', '2,0']);
  assert.equal(possible.has('4,0'), false);
  assert.equal(possible.has('3,0'), false); // enemy ZOC +2 exceeds remaining infantry MP
  const prevRevision = world.revision;
  assert.throws(() => world.moveUnit('actor', '4,0'), /无法移动/);
  assert.equal(world.revision, prevRevision);
  assert.equal(world.unitById('actor').mpRemaining, 3);
  world.moveUnit('actor', '2,0');
  assert.equal(world.unitById('actor').hexId, '2,0');
  assert.equal(world.unitById('actor').mpRemaining, 1);
  assert.equal(world.revision, prevRevision + 1);
});

test('坦克可以支付 ZOC 移动惩罚后深入敌境，沿途无人守军 Hex 被占领', () => {
  const world = corridorScenario([
    { id: 'tank', countryId: 'a', kind: 'tank', hexId: '2,0' },
    { id: 'defender', countryId: 'b', kind: 'infantry', hexId: '4,0' },
  ]);
  const initial = buildRenderSnapshot(world);
  assert.equal(world.reachableFor('tank').get('3,0')?.cost, 3); // plain 1 + ZOC 2
  assert.equal(world.reachableFor('tank').has('4,0'), false);
  const route = world.moveUnit('tank', '3,0');
  assert.deepEqual(route.hexIds, ['2,0', '3,0']);
  assert.equal(world.unitById('tank').mpRemaining, 4);
  assert.equal(world.controllerOf('3,0'), 'a');
  assert.equal(world.controllerOf('4,0'), 'b');
  assert.equal(world.unitById('defender').hexId, '4,0');
  assert.equal(initial.hexes.find(x => x.hexId === '3,0').controllerId, 'b');
  assert.equal(buildRenderSnapshot(world).hexes.find(x => x.hexId === '3,0').controllerId, 'a');
  assert.throws(() => world.moveUnit('tank', '4,0'), /无法移动/);
});

test('反坦克炮只压制坦克移动，火炮没有移动 ZOC', () => {
  for (const kind of ['antiTank', 'artillery']) {
    for (const mover of ['tank', 'infantry']) {
      const world = corridorScenario([
        { id: 'mover', countryId: 'a', kind: mover, hexId: '1,0' },
        { id: 'enemy', countryId: 'b', kind, hexId: '4,0' },
      ]);
      const cost = world.reachableFor('mover').get('2,0')?.cost;
      assert.equal(cost, kind === 'antiTank' && mover === 'tank' ? 3 : 1,
        `${kind} vs ${mover}`);
    }
  }
});

test('地形消耗正确，海水禁止陆军通行', () => {
  const modified = structuredClone({
    id: 'terrain', name: '地形测试', version: 1,
    grid: { orientation: 'pointy', cols: 4, rows: 1, radius: 20,
      originX: 25, originY: 25, worldWidth: 240, worldHeight: 80 },
    terrains: ['ocean', 'plains', 'forest', 'hills'],
    provinces: [{ id: 'p', name: '省份' }],
    tiles: [[0,1],[0,2],[-1,0],[0,3]],
    cities: [],
  });
  // Two land islands would invalidate disconnected provinces, so use
  // a separate province for the isolated hill.
  modified.provinces.push({ id: 'island', name: '岛' });
  modified.tiles[3] = [1,3];
  const islandMap = createMapData(modified);
  const camp = {
    id: 'terrain-start',name:'start',version:1,mapId:'terrain',
    countries:[{id:'a',name:'A',color:0xabcdef}],
    provinceSovereignty:{p:'a',island:'a'},
    initialUnits:[{id:'foot',countryId:'a',kind:'infantry',hexId:'0,0'}],
  };
  const world = new GameWorld(islandMap, camp);
  assert.equal(world.reachableFor('foot').get('1,0')?.cost, 2);
  assert.equal(world.reachableFor('foot').has('2,0'), false);
  assert.equal(world.reachableFor('foot').has('3,0'), false);
});
