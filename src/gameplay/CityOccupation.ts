import type { MapData } from '../map/MapData.ts';
import { hexDistance, hexId, neighbors } from '../map/hex.ts';
import { UNIT_RULES, type UnitState } from './Units.ts';

/** Recorded only when a city's containing Hex changes military controller. */
export interface CityCaptureEvent {
  readonly cityId: string;
  readonly controllerId: string;
}
export interface AdministrativeClaim {
  readonly hexId: string;
  readonly controllerId: string;
}
export interface CitySettlementResult {
  /** Captured cities still held at settlement time. */
  readonly settledCityIds: readonly string[];
  /** Successful claims calculated against one pre-settlement world state. */
  readonly claims: readonly AdministrativeClaim[];
  /** Multiple different nations validly claimed the same Hex. */
  readonly contestedHexIds: readonly string[];
}

/** Artillery attacks at range, but never projects administrative denial ZOC. */
export function blocksAdministrativeTakeover(
  map: MapData,
  targetHexId: string,
  captorId: string,
  units: readonly UnitState[],
): boolean {
  const target = map.hexesById.get(targetHexId);
  if (!target || target.terrain === 'ocean') return true;
  return units.some(unit => {
    if (unit.countryId === captorId) return false;
    const source = map.hexesById.get(unit.hexId);
    if (!source || source.terrain === 'ocean') return false;
    const range = UNIT_RULES[unit.kind].administrativeDenialRange;
    return range > 0 && hexDistance(source, target) <= range;
  });
}

/**
 * One-shot simultaneous city administration pass at the end of a turn:
 * - Only logged city control changes trigger it, rechecked at settlement time.
 * - Only radius-1 land in the SAME province is eligible (provisional policy).
 * - Enemy garrisons and administrative ZOC block; all other city sites are safe.
 * - Every claim reads the same pre-settlement state; no chain capture.
 * - Conflicting claims from different countries leave the Hex unchanged.
 *
 * Fortifications are not yet a separate map object; add an exclusion when
 * their static definition is introduced.
 */
export function resolveCityCaptures(
  map: MapData,
  controllerOf: (hexId: string) => string | null,
  units: readonly UnitState[],
  events: readonly CityCaptureEvent[],
): CitySettlementResult {
  const latestCaptors = new Map(events.map(event => [event.cityId, event.controllerId]));
  const cityTiles = new Set(map.cities.map(city => city.hexId));
  const occupied = new Map(units.map(unit => [unit.hexId, unit.countryId]));
  const candidateClaims = new Map<string, Set<string>>();
  const validCities: string[] = [];

  for (const cityId of [...latestCaptors.keys()].sort()) {
    const city = map.citiesById.get(cityId);
    const captorId = latestCaptors.get(cityId)!;
    if (!city || controllerOf(city.hexId) !== captorId) continue;
    validCities.push(cityId);

    const center = map.hexesById.get(city.hexId)!;
    for (const coordinate of neighbors(center)) {
      const hex = map.hexesById.get(hexId(coordinate));
      if (!hex || hex.terrain === 'ocean' || hex.provinceId !== city.provinceId) continue;
      if (cityTiles.has(hex.id) || controllerOf(hex.id) === captorId) continue;
      if (occupied.has(hex.id) && occupied.get(hex.id) !== captorId) continue;
      if (blocksAdministrativeTakeover(map, hex.id, captorId, units)) continue;

      if (!candidateClaims.has(hex.id)) candidateClaims.set(hex.id, new Set());
      candidateClaims.get(hex.id)!.add(captorId);
    }
  }

  const claims: AdministrativeClaim[] = [];
  const contestedHexIds: string[] = [];
  for (const hexId of [...candidateClaims.keys()].sort()) {
    const claimants = [...candidateClaims.get(hexId)!];
    if (claimants.length === 1) claims.push({ hexId, controllerId: claimants[0] });
    else contestedHexIds.push(hexId);
  }
  return { settledCityIds: validCities, claims, contestedHexIds };
}
