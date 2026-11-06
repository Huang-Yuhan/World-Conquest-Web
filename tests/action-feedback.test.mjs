import assert from 'node:assert/strict';
import test from 'node:test';

import { createMapData } from '../src/map/MapData.ts';
import { resolveCityCaptures } from '../src/gameplay/CityOccupation.ts';

function fixture({ border = false, ocean = false, secondCity = false } = {}) {
  const terrains = ['plains', 'ocean'];
  const tiles = Array.from({ length: 15 }, (_, i) =>
    [border && i % 5 >= 3 ? 1 : 0, 0],
  );
  if (ocean) tiles[2 * 5 + 1] = [-1, 1]; // axial (0,2) = offset (1,2)
  const centerHex = border ? '2,1' : '1,1';
  const cities = [{
    id: 'center', name: '中央城', provinceId: 'west', hexId: centerHex, kind: 'city',
  }];
  if (secondCity) cities.push({
    id: 'other', name: '邻城', provinceId: 'west', hexId: '2,1', kind: 'city',
  });
  const map = createMapData({
    id: 'feedback', name: '反馈规则测试', version: 1,
    grid: { orientation: 'pointy', cols: 5, rows: 3, radius: 20,
      originX: 25, originY: 25, worldWidth: 240, worldHeight: 130 },
    terrains,
    provinces: border ? [
      { id: 'west', name: '西省' }, { id: 'east', name: '东省' },
    ] : [{ id: 'west', name: '西省' }],
    tiles, cities,
  });
  const control = id => id === centerHex || id === (border ? '2,0' : '1,0') ? 'a' : 'b';
  const unit = (id, hexId, kind = 'infantry') => ({
    id, countryId: 'b', hexId, kind, hp: 100, maxHp: 100,
    mpRemaining: 3, maxMp: 3, attacksRemaining: 1,
  });
  return { map, control, unit };
}

test('每个城市邻 Hex 都记录可解释结果，驻军优先于 ZOC，并给出阻断单位 ID', () => {
  const { map, control, unit } = fixture({ secondCity: true });
  const result = resolveCityCaptures(map, control, [unit('guard-01', '0,1')], [
    { cityId: 'center', controllerId: 'a' },
  ]);
  assert.deepEqual(result.settledCityIds, ['center']);
  assert.equal(result.outcomes.length, 6);
  assert.equal(result.claims.length, 2);
  const reason = id => result.outcomes.find(x => x.hexId === id);
  assert.equal(reason('0,1').status, 'enemyGarrison');
  assert.deepEqual(reason('0,1').blockerUnitIds, ['guard-01']);
  assert.equal(reason('0,2').status, 'enemyZoc');
  assert.deepEqual(reason('0,2').blockerUnitIds, ['guard-01']);
  assert.equal(reason('2,1').status, 'otherCity');
  assert.equal(reason('1,0').status, 'alreadyControlled');
  assert.equal(reason('2,0').status, 'claimed');
  assert.deepEqual(reason('2,0').blockerUnitIds, []);
  assert.deepEqual(result.claims.map(x => x.hexId).sort(), ['1,2', '2,0']);
});

test('海洋和省界都有明确原因，不冒充敌方 ZOC', () => {
  const ocean = fixture({ ocean: true });
  const sea = resolveCityCaptures(ocean.map, ocean.control, [], [
    { cityId: 'center', controllerId: 'a' },
  ]);
  assert.equal(sea.outcomes.find(x => x.hexId === '0,2').status, 'ocean');
  assert.equal(sea.claims.length, 4);

  const border = fixture({ border: true });
  const boundary = resolveCityCaptures(border.map, border.control, [], [
    { cityId: 'center', controllerId: 'a' },
  ]);
  assert.equal(boundary.outcomes.filter(x => x.status === 'outsideProvince').length, 3);
  assert.equal(boundary.claims.length, 2);
  assert.equal(boundary.outcomes.length, 6);
});

test('火炮没有行政阻断，敌军占驻的 Hex 仍不能自动接管', () => {
  const { map, control, unit } = fixture();
  const result = resolveCityCaptures(map, control, [unit('gun', '0,1', 'artillery')], [
    { cityId: 'center', controllerId: 'a' },
  ]);
  assert.equal(result.outcomes.find(x => x.hexId === '0,1').status, 'enemyGarrison');
  assert.equal(result.outcomes.find(x => x.hexId === '0,2').status, 'claimed');
  assert.equal(result.claims.length, 4);
});

test('多国有效申领相同 Hex 时，双方都被标记为 contested 且排序稳定', () => {
  const { map } = fixture({ secondCity: true });
  const control = id => id === '1,1' ? 'a' : id === '2,1' ? 'b' : 'c';
  const events = [
    { cityId: 'center', controllerId: 'a' },
    { cityId: 'other', controllerId: 'b' },
  ];
  // Adjacent city Hexes cannot be claimed. A third city farther away allows
  // a genuinely contested shared non-city Hex.
  const third = structuredClone(map.definition);
  third.cities[1].hexId = '3,1';
  const twoCities = createMapData(third);
  const ctrl = id => id === '1,1' ? 'a' : id === '3,1' ? 'b' : 'c';
  const secondEvents = events.map(x => ({ ...x }));
  const a = resolveCityCaptures(twoCities, ctrl, [], secondEvents);
  const b = resolveCityCaptures(twoCities, ctrl, [], [...secondEvents].reverse());
  assert.deepEqual(a, b);
  assert.ok(a.contestedHexIds.includes('2,1'));
  assert.deepEqual(
    a.outcomes.filter(x => x.hexId === '2,1').map(x => x.status),
    ['contested', 'contested'],
  );
  assert.ok(!a.claims.some(x => x.hexId === '2,1'));
  assert.ok(resolveCityCaptures(map, control, [], events).contestedHexIds.includes('2,0'));
});

test('已经失效的占城事件不会产生虚假邻格原因', () => {
  const { map } = fixture();
  const result = resolveCityCaptures(map, () => 'b', [], [
    { cityId: 'center', controllerId: 'a' },
  ]);
  assert.deepEqual(result.settledCityIds, []);
  assert.deepEqual(result.claims, []);
  assert.deepEqual(result.outcomes, []);
});
