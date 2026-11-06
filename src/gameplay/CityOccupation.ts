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

/**
 * Exhaustive, deterministic explanations for each existing neighboring Hex
 * of every city that is still held at settlement. Geometry and source unit
 * identifiers are data; Gameplay never creates localized UI strings.
 */
export type NeighborClaimStatus =
  | 'claimed'
  | 'alreadyControlled'
  | 'ocean'
  | 'outsideProvince'
  | 'otherCity'
  | 'enemyGarrison'
  | 'enemyZoc'
  | 'contested';

export interface CityNeighborOutcome {
  readonly cityId: string;
  readonly hexId: string;
  readonly status: NeighborClaimStatus;
  /** For garrisons/ZOC, identifies the exact units preventing takeover. */
  readonly blockerUnitIds: readonly string[];
}

export interface CitySettlementResult {
  /** Captured cities still held at settlement time. */
  readonly settledCityIds: readonly string[];
  /** Successful claims calculated against one pre-settlement world state. */
  readonly claims: readonly AdministrativeClaim[];
  /** Multiple different nations validly claimed the same Hex. */
  readonly contestedHexIds: readonly string[];
  /** Every evaluated adjacent Hex, including exclusions and blockers. */
  readonly outcomes: readonly CityNeighborOutcome[];
}

function administrativeDenialUnitIds(
  map: MapData,
  targetHexId: string,
  captorId: string,
  units: readonly UnitState[],
): string[] {
  const target = map.hexesById.get(targetHexId);
  if (!target || target.terrain === 'ocean') return [];
  return units.filter(unit => {
    if (unit.countryId === captorId) return false;
    const source = map.hexesById.get(unit.hexId);
    if (!source || source.terrain === 'ocean') return false;
    const range = UNIT_RULES[unit.kind].administrativeDenialRange;
    return range > 0 && hexDistance(source, target) <= range;
  }).map(unit => unit.id).sort();
}

/** Artillery attacks at range, but never projects administrative denial ZOC. */
export function blocksAdministrativeTakeover(
  map: MapData,
  targetHexId: string,
  captorId: string,
  units: readonly UnitState[],
): boolean {
  const target = map.hexesById.get(targetHexId);
  return !target || target.terrain === 'ocean' ||
    administrativeDenialUnitIds(map, targetHexId, captorId, units).length > 0;
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
  const occupied = new Map(units.map(unit => [unit.hexId, unit]));
  const candidateClaims = new Map<string, Set<string>>();
  const validCities: string[] = [];
  const drafts: Array<{ cityId: string; hexId: string; status: NeighborClaimStatus | 'candidate'; blockerUnitIds: readonly string[] }> = [];

  for (const cityId of [...latestCaptors.keys()].sort()) {
    const city = map.citiesById.get(cityId);
    const captorId = latestCaptors.get(cityId)!;
    if (!city || controllerOf(city.hexId) !== captorId) continue;
    validCities.push(cityId);

    const center = map.hexesById.get(city.hexId)!;
    for (const coordinate of neighbors(center)) {
      const hex = map.hexesById.get(hexId(coordinate));
      if (!hex) continue;

      let status: NeighborClaimStatus | 'candidate';
      let blockerUnitIds: string[] = [];
      if (hex.terrain === 'ocean') {
        status = 'ocean';
      } else if (hex.provinceId !== city.provinceId) {
        status = 'outsideProvince';
      } else if (cityTiles.has(hex.id)) {
        status = 'otherCity';
      } else if (controllerOf(hex.id) === captorId) {
        status = 'alreadyControlled';
      } else {
        const garrison = occupied.get(hex.id);
        if (garrison && garrison.countryId !== captorId) {
          status = 'enemyGarrison';
          blockerUnitIds = [garrison.id];
        } else {
          blockerUnitIds = administrativeDenialUnitIds(map, hex.id, captorId, units);
          status = blockerUnitIds.length > 0 ? 'enemyZoc' : 'candidate';
        }
      }

      drafts.push({ cityId, hexId: hex.id, status, blockerUnitIds });
      if (status === 'candidate') {
        if (!candidateClaims.has(hex.id)) candidateClaims.set(hex.id, new Set());
        candidateClaims.get(hex.id)!.add(captorId);
      }
    }
  }

  const claims: AdministrativeClaim[] = [];
  const contestedHexIds: string[] = [];
  for (const id of [...candidateClaims.keys()].sort()) {
    const claimants = [...candidateClaims.get(id)!];
    if (claimants.length === 1) claims.push({ hexId: id, controllerId: claimants[0] });
    else contestedHexIds.push(id);
  }

  const contested = new Set(contestedHexIds);
  const outcomes: CityNeighborOutcome[] = drafts.map(({ cityId, hexId: id, status, blockerUnitIds }) => ({
    cityId,
    hexId: id,
    status: status === 'candidate' ? (contested.has(id) ? 'contested' : 'claimed') : status,
    blockerUnitIds,
  }));
  outcomes.sort((a, b) => a.cityId < b.cityId ? -1 : a.cityId > b.cityId ? 1 : a.hexId < b.hexId ? -1 : a.hexId > b.hexId ? 1 : 0);
  return { settledCityIds: validCities, claims, contestedHexIds, outcomes };
}
