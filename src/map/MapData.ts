import { fromOffset, hexId, neighbors } from './hex.ts';
import type { CityDefinition, HexData, MapDefinition, ProvinceData, Terrain } from './MapDefinition.ts';

export interface MapData {
  readonly definition: MapDefinition;
  readonly hexes: readonly HexData[];
  readonly provinces: readonly ProvinceData[];
  readonly cities: readonly CityDefinition[];
  readonly hexesById: ReadonlyMap<string, HexData>;
  readonly provincesById: ReadonlyMap<string, ProvinceData>;
  readonly citiesById: ReadonlyMap<string, CityDefinition>;
}

function invariant(valid: unknown, message: string): asserts valid {
  if (!valid) throw new Error(`地图数据无效：${message}`);
}

const TERRAIN_TYPES: readonly Terrain[] = ['ocean', 'plains', 'forest', 'hills', 'mountains'];
const ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

/** Expands compact offline map assets into validated, indexed runtime data. */
export function createMapData(definition: MapDefinition): MapData {
  invariant(definition && ID_PATTERN.test(definition.id), '地图 ID');
  invariant(definition.version === 1, '不支持的地图版本');
  const grid = definition.grid;
  invariant(grid?.orientation === 'pointy', '只支持尖顶六边形');
  invariant(Number.isInteger(grid.cols) && grid.cols > 0, 'grid.cols');
  invariant(Number.isInteger(grid.rows) && grid.rows > 0, 'grid.rows');
  invariant([grid.radius, grid.originX, grid.originY, grid.worldWidth, grid.worldHeight].every(Number.isFinite),
    '无效的格子几何尺寸');
  invariant(grid.radius > 0 && grid.worldWidth > 0 && grid.worldHeight > 0, '地图尺寸不能为零');
  invariant(Array.isArray(definition.terrains) &&
    definition.terrains.every(t => TERRAIN_TYPES.includes(t)), '不支持的地形类型');
  invariant(Array.isArray(definition.provinces) && Array.isArray(definition.cities), '省份或城市表缺失');
  invariant(Array.isArray(definition.tiles) && definition.tiles.length === grid.cols * grid.rows,
    'tiles 数量必须等于 cols × rows');

  const provinceById = new Map<string, ProvinceData>();
  for (const province of definition.provinces) {
    invariant(province && ID_PATTERN.test(province.id) && typeof province.name === 'string',
      '省份 ID 或名称无效');
    invariant(!provinceById.has(province.id), `重复省份 ${province.id}`);
    provinceById.set(province.id, { ...province, hexIds: [] });
  }

  const hexes: HexData[] = [];
  const hexesById = new Map<string, HexData>();
  const provinceHexIds = new Map([...provinceById.keys()].map(id => [id, [] as string[]]));

  for (let index = 0; index < definition.tiles.length; index++) {
    const tile = definition.tiles[index];
    invariant(Array.isArray(tile) && tile.length === 2 &&
      Number.isInteger(tile[0]) && Number.isInteger(tile[1]), `tile[${index}] 格式错误`);
    const [provinceIndex, terrainIndex] = tile;
    invariant(terrainIndex >= 0 && terrainIndex < definition.terrains.length, `tile[${index}] 地形索引越界`);
    invariant(provinceIndex >= -1 && provinceIndex < definition.provinces.length,
      `tile[${index}] 省份索引越界`);
    const terrain = definition.terrains[terrainIndex];
    invariant((terrain === 'ocean') === (provinceIndex === -1),
      `tile[${index}] 海洋格不能属于陆地省份，陆地格必须属于省份`);
    const coord = fromOffset(index % grid.cols, Math.floor(index / grid.cols));
    const id = hexId(coord);
    const provinceId = provinceIndex === -1 ? null : definition.provinces[provinceIndex].id;
    const hex: HexData = { id, ...coord, terrain, provinceId };
    hexes.push(hex);
    hexesById.set(id, hex);
    if (provinceId) provinceHexIds.get(provinceId)!.push(id);
  }

  const provinces: ProvinceData[] = definition.provinces.map(p => ({
    ...p, hexIds: provinceHexIds.get(p.id)!,
  }));
  for (const province of provinces) {
    invariant(province.hexIds.length > 0, `省份 ${province.id} 没有陆地格`);
    // Reject accidental disconnected provinces at load time, not during gameplay.
    const all = new Set(province.hexIds);
    const visited = new Set([province.hexIds[0]]);
    const queue = [province.hexIds[0]];
    for (let head = 0; head < queue.length; head++) {
      const current = hexesById.get(queue[head])!;
      for (const next of neighbors(current)) {
        const key = hexId(next);
        if (all.has(key) && !visited.has(key)) {
          visited.add(key);
          queue.push(key);
        }
      }
    }
    invariant(visited.size === all.size, `省份 ${province.id} 的格子不连通`);
    provinceById.set(province.id, province);
  }

  const citiesById = new Map<string, CityDefinition>();
  const occupiedCityTiles = new Set<string>();
  for (const city of definition.cities) {
    invariant(city && ID_PATTERN.test(city.id) && typeof city.name === 'string',
      '城市 ID 或名称无效');
    invariant(!citiesById.has(city.id), `重复城市 ${city.id}`);
    invariant(city.kind === 'city' || city.kind === 'capital', `城市 ${city.id} 类型无效`);
    invariant(provinceById.has(city.provinceId), `城市 ${city.id} 所在省份不存在`);
    invariant(hexesById.get(city.hexId)?.provinceId === city.provinceId,
      `城市 ${city.id} 不在指定省份的陆地格`);
    invariant(!occupiedCityTiles.has(city.hexId), `城市格 ${city.hexId} 被重复使用`);
    occupiedCityTiles.add(city.hexId);
    citiesById.set(city.id, city);
  }

  return {
    definition, hexes, provinces, cities: definition.cities,
    hexesById, provincesById: provinceById, citiesById,
  };
}
