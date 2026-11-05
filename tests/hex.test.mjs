import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  CITIES, COUNTRIES, COUNTRIES_BY_ID, HEXES, HEXES_BY_ID,
  PROVINCES, PROVINCES_BY_ID,
} from '../src/core/world.ts';
import {
  HEX_RADIUS, GRID_COLS, GRID_ROWS, fromOffset, hexId, hexCenter,
  hexCorners, neighbors, hexDistance,
} from '../src/map/hex.ts';

test('六边形坐标与相邻格距离正确', () => {
  const first = fromOffset(7, 6);
  assert.equal(hexDistance(first, first), 0);
  for (const adjacent of neighbors(first)) {
    assert.equal(hexDistance(first, adjacent), 1);
    assert.ok(Math.abs(Math.hypot(
      hexCenter(first).x - hexCenter(adjacent).x,
      hexCenter(first).y - hexCenter(adjacent).y,
    ) - HEX_RADIUS * Math.sqrt(3)) < 0.001);
  }
  assert.equal(hexCorners(first).length, 6);
});

test('陆地六边形具有唯一坐标且全部归属省份', () => {
  assert.ok(HEXES.length > 350);
  assert.equal(new Set(HEXES.map((hex) => hex.id)).size, HEXES.length);
  assert.ok(HEXES.every((hex) => PROVINCES_BY_ID.has(hex.provinceId)));
  assert.ok(HEXES.every((hex) => Number.isFinite(hexCenter(hex).x) && Number.isFinite(hexCenter(hex).y)));
  assert.equal(new Set(PROVINCES.map((province) => province.id)).size, PROVINCES.length);
  assert.ok(GRID_COLS > 0 && GRID_ROWS > 0);
});

test('每个省份包含多个且连通的六边形', () => {
  for (const province of PROVINCES) {
    assert.ok(province.hexIds.length > 1, province.id);
    const members = new Set(province.hexIds);
    const visited = new Set([province.hexIds[0]]);
    const queue = [province.hexIds[0]];
    for (let index = 0; index < queue.length; index++) {
      const current = HEXES_BY_ID.get(queue[index]);
      assert.ok(current);
      for (const neighbor of neighbors(current)) {
        const key = hexId(neighbor);
        if (members.has(key) && !visited.has(key)) {
          visited.add(key);
          queue.push(key);
        }
      }
    }
    assert.equal(visited.size, members.size, province.id);
    for (const key of members) {
      assert.equal(HEXES_BY_ID.get(key)?.provinceId, province.id);
    }
  }
});

test('每省恰好一座城市，城市坐落于对应省份的六边形格', () => {
  assert.equal(CITIES.length, PROVINCES.length);
  assert.equal(new Set(CITIES.map((city) => city.hexId)).size, CITIES.length);
  for (const province of PROVINCES) {
    const city = CITIES.filter((entry) => entry.provinceId === province.id);
    assert.equal(city.length, 1, province.id);
    assert.equal(city[0].id, province.cityId);
    assert.ok(province.hexIds.includes(city[0].hexId));
    assert.ok(COUNTRIES_BY_ID.has(province.ownerId));
  }
  for (const country of COUNTRIES) {
    assert.equal(CITIES.filter((city) =>
      city.kind === 'capital' && PROVINCES_BY_ID.get(city.provinceId)?.ownerId === country.id,
    ).length, 1);
  }
});

test('SVG 城市素材保留可缩放的矢量源文件', () => {
  for (const file of ['city', 'capital', 'city-marker']) {
    const svg = readFileSync(new URL(`../src/assets/${file}.svg`, import.meta.url), 'utf8');
    assert.match(svg, /<svg[^>]*viewBox="0 0 64 64"/);
    assert.match(svg, /<\/svg>/);
  }
});
