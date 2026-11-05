import type { MapData } from '../map/MapData.ts';
import type { Terrain } from '../map/MapDefinition.ts';
import { hexDistance, hexId, neighbors } from '../map/hex.ts';
import type { UnitState } from './Units.ts';

export interface MovementView {
  readonly map: MapData;
  readonly units: readonly UnitState[];
}

export interface MoveRoute {
  /** Includes the starting Hex and destination, in traversal order. */
  readonly hexIds: readonly string[];
  readonly cost: number;
}

const TERRAIN_MOVE_COST: Readonly<Record<Terrain, number>> = {
  ocean: Number.POSITIVE_INFINITY,
  plains: 1,
  forest: 2,
  hills: 2,
  mountains: 3,
};

/**
 * Enemy proximity is NOT hard blocking. Enemy infantry/tanks pressure
 * neighboring land, antitank guns pressure armor out to range two,
 * artillery has no movement ZOC in the MVP.
 */
export function enemyMovementZoc(targetHexId: string, mover: UnitState, units: readonly UnitState[]): boolean {
  const target = units.find(unit => unit.hexId === targetHexId);
  if (target && target.countryId !== mover.countryId) return false; // blocked by occupancy, handled separately
  const [q, r] = targetHexId.split(',').map(Number);
  return units.some(enemy => {
    if (enemy.countryId === mover.countryId) return false;
    const [eq, er] = enemy.hexId.split(',').map(Number);
    const distance = hexDistance({ q, r }, { q: eq, r: er });
    return (enemy.kind === 'infantry' || enemy.kind === 'tank') && distance === 1 ||
      enemy.kind === 'antiTank' && mover.kind === 'tank' && distance >= 1 && distance <= 2;
  });
}

/**
 * Dijkstra computes weighted paths and all legal endpoints for this unit.
 * Friendly units may be traversed, but never selected as destinations.
 * Enemy-occupied Hexes are impassable until combat destroys their unit.
 * One enemy ZOC penalty (+2 MP) applies per entered Hex; no stacking/forced stop.
 */
export function reachableMoves(view: MovementView, mover: UnitState): ReadonlyMap<string, MoveRoute> {
  const start = view.map.hexesById.get(mover.hexId);
  if (!start || start.terrain === 'ocean') throw new Error('单位必须位于陆地');
  const occupants = new Map(view.units.map(unit => [unit.hexId, unit]));
  const best = new Map<string, MoveRoute>([[start.id, { hexIds: [start.id], cost: 0 }]]);
  const frontier = new Set<string>([start.id]);

  while (frontier.size) {
    let currentId: string | undefined;
    for (const id of frontier) {
      if (currentId === undefined || best.get(id)!.cost < best.get(currentId)!.cost ||
        best.get(id)!.cost === best.get(currentId)!.cost && id < currentId) currentId = id;
    }
    if (!currentId) break;
    frontier.delete(currentId);
    const route = best.get(currentId)!;
    const current = view.map.hexesById.get(currentId)!;

    for (const direction of neighbors(current)) {
      const id = hexId(direction);
      const hex = view.map.hexesById.get(id);
      if (!hex || hex.terrain === 'ocean') continue;
      const occupant = occupants.get(id);
      if (occupant && occupant.countryId !== mover.countryId) continue;

      const penalty = enemyMovementZoc(id, mover, view.units) ? 2 : 0;
      const cost = route.cost + TERRAIN_MOVE_COST[hex.terrain] + penalty;
      if (cost > mover.mpRemaining) continue;

      const previous = best.get(id);
      if (!previous || cost < previous.cost) {
        best.set(id, { hexIds: [...route.hexIds, id], cost });
        frontier.add(id);
      }
    }
  }

  best.delete(start.id);
  // Mark occupied friendly Hexes as transit-only (paths may still include them).
  for (const unit of view.units) if (unit.id !== mover.id) best.delete(unit.hexId);
  return best;
}
