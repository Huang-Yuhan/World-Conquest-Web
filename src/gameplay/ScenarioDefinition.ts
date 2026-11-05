import type { MapData } from '../map/MapData.ts';

export interface CountryDefinition {
  id: string;
  name: string;
  color: number;
}

/** Scenario supplies the initial political state; map assets do not encode sovereignty. */
export interface ScenarioDefinition {
  id: string;
  name: string;
  version: 1;
  mapId: string;
  countries: readonly CountryDefinition[];
  provinceSovereignty: Readonly<Record<string, string>>;
  /** Optional initially occupied hexes; leaves static province boundaries untouched. */
  initialHexControl?: Readonly<Record<string, string>>;
}

export function validateScenario(scenario: ScenarioDefinition, map: MapData): void {
  if (!scenario || scenario.version !== 1 || scenario.mapId !== map.definition.id) {
    throw new Error('剧本版本或地图 ID 不匹配');
  }
  if (!Array.isArray(scenario.countries) || scenario.countries.length === 0) {
    throw new Error('剧本缺少国家');
  }
  const countries = new Set<string>();
  for (const country of scenario.countries) {
    if (!country || typeof country.id !== 'string' || !country.id ||
      typeof country.name !== 'string' || !Number.isInteger(country.color) ||
      country.color < 0 || country.color > 0xffffff || countries.has(country.id)) {
      throw new Error('国家 ID、名称或颜色无效');
    }
    countries.add(country.id);
  }
  if (!scenario.provinceSovereignty || typeof scenario.provinceSovereignty !== 'object' ||
    Object.keys(scenario.provinceSovereignty).length !== map.provinces.length) {
    throw new Error('剧本必须声明全部省份的初始主权');
  }
  for (const province of map.provinces) {
    if (!countries.has(scenario.provinceSovereignty[province.id])) {
      throw new Error(`省份 ${province.id} 的主权国家无效`);
    }
  }
  for (const [id, countryId] of Object.entries(scenario.initialHexControl ?? {})) {
    if (!map.hexesById.has(id) || map.hexesById.get(id)!.terrain === 'ocean' ||
      !countries.has(countryId)) {
      throw new Error(`无效的初始 Hex 控制权：${id}`);
    }
  }
}
