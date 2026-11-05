import type { RenderSnapshot } from '../contracts/RenderSnapshot.ts';
import type { GameWorld } from './GameWorld.ts';

/** Snapshot is copied/frozen at submission time; subsequent GameWorld updates cannot mutate it. */
export function buildRenderSnapshot(world: GameWorld): RenderSnapshot {
  const snapshot: RenderSnapshot = {
    mapId: world.map.definition.id,
    revision: world.revision,
    countries: Object.freeze(world.scenario.countries.map(country => Object.freeze({
      id: country.id, name: country.name, color: country.color,
    }))),
    hexes: Object.freeze(world.map.hexes.map(hex => Object.freeze({
      hexId: hex.id, controllerId: world.controllerOf(hex.id),
    }))),
    cities: Object.freeze(world.map.cities.map(city => Object.freeze({
      cityId: city.id, controllerId: world.controllerOf(city.hexId),
    }))),
  };
  return Object.freeze(snapshot);
}
