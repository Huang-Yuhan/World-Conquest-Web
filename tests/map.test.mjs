import assert from 'node:assert/strict';
import test from 'node:test';
import { COUNTRIES, PROVINCES } from '../src/core/world.ts';
import { MAP_WIDTH, MAP_HEIGHT, polygon, center } from '../src/map/geometry.ts';

test('国家、省份均有有效中文名称和唯一 ID', () => {
  assert.equal(new Set(COUNTRIES.map((country) => country.id)).size, COUNTRIES.length);
  assert.equal(new Set(PROVINCES.map((province) => province.id)).size, PROVINCES.length);
  for (const country of COUNTRIES) assert.match(country.name, /\p{Script=Han}/u);
  for (const province of PROVINCES) assert.match(province.name, /\p{Script=Han}/u);
});

test('所有省份都属于已定义的国家', () => {
  const ids = new Set(COUNTRIES.map((country) => country.id));
  for (const province of PROVINCES) assert.ok(ids.has(province.ownerId));
  for (const country of COUNTRIES) assert.ok(PROVINCES.some((province) => province.ownerId === country.id));
});

test('省份多边形和中心点坐标有效', () => {
  assert.ok(MAP_WIDTH > 0 && MAP_HEIGHT > 0);
  for (const province of PROVINCES) {
    const points = polygon(province);
    assert.equal(points.length, 8);
    for (const point of [...points, center(province)]) {
      assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
    }
  }
});
