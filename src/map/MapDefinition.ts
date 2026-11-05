/** Static, versioned map asset. Contains no country or gameplay state. */
export type Terrain = 'ocean' | 'plains' | 'forest' | 'hills' | 'mountains';

export interface GridDefinition {
  orientation: 'pointy';
  cols: number;
  rows: number;
  radius: number;
  originX: number;
  originY: number;
  worldWidth: number;
  worldHeight: number;
}

export interface ProvinceDefinition {
  id: string;
  name: string;
}

export interface CityDefinition {
  id: string;
  name: string;
  provinceId: string;
  hexId: string;
  kind: 'city' | 'capital';
}

/**
 * Tiles are row-major [provinceIndex, terrainIndex] pairs.
 * provinceIndex -1 means no administrative province (e.g. open ocean).
 * Coordinates and hex IDs are derived from grid dimensions, not duplicated in JSON.
 */
export interface MapDefinition {
  id: string;
  name: string;
  version: 1;
  grid: GridDefinition;
  terrains: readonly Terrain[];
  provinces: readonly ProvinceDefinition[];
  cities: readonly CityDefinition[];
  tiles: readonly (readonly [number, number])[];
}

export interface HexData {
  id: string;
  q: number;
  r: number;
  terrain: Terrain;
  provinceId: string | null;
}

export interface ProvinceData extends ProvinceDefinition {
  readonly hexIds: readonly string[];
}
