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
