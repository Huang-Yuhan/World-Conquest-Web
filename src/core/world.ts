import { GRID_COLS, GRID_ROWS, fromOffset, hexId, isLand, neighbors, type Axial } from '../map/hex.ts';

export type CountryId = 'aurelia' | 'nordland' | 'vesperia' | 'meridia' | 'solmere';

export interface Country {
  id: CountryId;
  name: string;
  color: number;
}

export interface Hex extends Axial {
  id: string;
  provinceId: string;
}

export interface Province {
  id: string;
  name: string;
  ownerId: CountryId;
  hexIds: readonly string[];
  cityId: string;
}

export interface City {
  id: string;
  name: string;
  provinceId: string;
  hexId: string;
  kind: 'capital' | 'city';
}

interface ProvinceSeed {
  id: string;
  name: string;
  ownerId: CountryId;
  col: number;
  row: number;
  capital?: true;
}

export const COUNTRIES: readonly Country[] = [
  { id: 'aurelia', name: '奥瑞利亚王国', color: 0xc67e67 },
  { id: 'nordland', name: '北境联盟', color: 0x8cb9ce },
  { id: 'vesperia', name: '维斯佩里亚领邦', color: 0xb4a1d2 },
  { id: 'meridia', name: '梅里迪亚同盟', color: 0x79b69a },
  { id: 'solmere', name: '索尔梅尔共和国', color: 0xdfb96f },
];

/** Author-defined cities and province seeds. Ownership is fixed during the map-only prototype. */
const SEEDS: readonly ProvinceSeed[] = [
  { id: 'raven', name: '鸦堡', ownerId: 'aurelia', col: 4, row: 5 },
  { id: 'arden', name: '阿尔登', ownerId: 'aurelia', col: 5, row: 9, capital: true },
  { id: 'westford', name: '西渡', ownerId: 'aurelia', col: 3, row: 12 },
  { id: 'ironwick', name: '铁港', ownerId: 'aurelia', col: 8, row: 8 },

  { id: 'northwatch', name: '北望', ownerId: 'nordland', col: 10, row: 3 },
  { id: 'frosthold', name: '霜堡', ownerId: 'nordland', col: 14, row: 3, capital: true },
  { id: 'snowreach', name: '雪境', ownerId: 'nordland', col: 18, row: 4 },
  { id: 'stormhold', name: '风暴堡', ownerId: 'nordland', col: 14, row: 7 },

  { id: 'eastmarch', name: '东境', ownerId: 'vesperia', col: 23, row: 5 },
  { id: 'silvercrest', name: '银冠', ownerId: 'vesperia', col: 25, row: 8, capital: true },
  { id: 'southport', name: '南港', ownerId: 'vesperia', col: 24, row: 12 },
  { id: 'oldhaven', name: '旧港', ownerId: 'vesperia', col: 21, row: 9 },

  { id: 'stonebridge', name: '石桥', ownerId: 'meridia', col: 18, row: 10, capital: true },
  { id: 'goldhaven', name: '金港', ownerId: 'meridia', col: 18, row: 14 },
  { id: 'redwater', name: '赤水', ownerId: 'meridia', col: 21, row: 15 },
  { id: 'greenfield', name: '翠原', ownerId: 'meridia', col: 15, row: 11 },

  { id: 'riverbend', name: '河湾', ownerId: 'solmere', col: 8, row: 12, capital: true },
  { id: 'sunreach', name: '日境', ownerId: 'solmere', col: 10, row: 15 },
  { id: 'clearwater', name: '清泉', ownerId: 'solmere', col: 12, row: 9 },
  { id: 'southcliff', name: '南崖', ownerId: 'solmere', col: 7, row: 16 },
];

const land: Axial[] = [];
for (let row = 0; row < GRID_ROWS; row++) {
  for (let col = 0; col < GRID_COLS; col++) {
    if (isLand(col, row)) land.push(fromOffset(col, row));
  }
}

/**
 * Multi-source BFS: every province grows out from its city. Unlike arbitrary
 * nearest-point sampling, this guarantees connected provinces on connected land.
 */
const landIds = new Set(land.map(hexId));
const assignments = new Map<string, string>();
const queue: { hex: Axial; provinceId: string }[] = [];

for (const seed of SEEDS) {
  const hex = fromOffset(seed.col, seed.row);
  const id = hexId(hex);
  if (!landIds.has(id) || assignments.has(id)) {
    throw new Error(`Invalid/duplicate city seed ${seed.id}: ${id}`);
  }
  assignments.set(id, seed.id);
  queue.push({ hex, provinceId: seed.id });
}

for (let head = 0; head < queue.length; head++) {
  const { hex, provinceId } = queue[head];
  for (const next of neighbors(hex)) {
    const id = hexId(next);
    if (!landIds.has(id) || assignments.has(id)) continue;
    assignments.set(id, provinceId);
    queue.push({ hex: next, provinceId });
  }
}

if (assignments.size !== land.length) {
  throw new Error('Every connected landmass requires at least one city seed');
}

export const HEXES: readonly Hex[] = land.map((hex) => ({
  ...hex,
  id: hexId(hex),
  provinceId: assignments.get(hexId(hex))!,
}));

export const PROVINCES: readonly Province[] = SEEDS.map((seed) => ({
  id: seed.id,
  name: seed.name,
  ownerId: seed.ownerId,
  hexIds: HEXES.filter((hex) => hex.provinceId === seed.id).map((hex) => hex.id),
  cityId: `city-${seed.id}`,
}));

export const CITIES: readonly City[] = SEEDS.map((seed) => ({
  id: `city-${seed.id}`,
  name: seed.name,
  provinceId: seed.id,
  hexId: hexId(fromOffset(seed.col, seed.row)),
  kind: seed.capital ? 'capital' : 'city',
}));

export const COUNTRIES_BY_ID: ReadonlyMap<CountryId, Country> =
  new Map(COUNTRIES.map((country) => [country.id, country]));

export const PROVINCES_BY_ID: ReadonlyMap<string, Province> =
  new Map(PROVINCES.map((province) => [province.id, province]));

export const HEXES_BY_ID: ReadonlyMap<string, Hex> =
  new Map(HEXES.map((hex) => [hex.id, hex]));
