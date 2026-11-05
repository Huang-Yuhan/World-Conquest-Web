import type { MapData } from '../map/MapData.ts';
import { validateScenario, type ScenarioDefinition } from './ScenarioDefinition.ts';

/** Authoritative mutable state. No rendering imports or PixiJS types. */
export class GameWorld {
  readonly map: MapData;
  readonly scenario: ScenarioDefinition;
  private readonly hexControl = new Map<string, string | null>();
  private _revision = 0;

  constructor(map: MapData, scenario: ScenarioDefinition) {
    validateScenario(scenario, map);
    this.map = map;
    this.scenario = scenario;

    for (const hex of map.hexes) {
      const controllerId = hex.provinceId
        ? scenario.initialHexControl?.[hex.id] ?? scenario.provinceSovereignty[hex.provinceId]
        : null;
      this.hexControl.set(hex.id, controllerId);
    }
  }

  get revision(): number {
    return this._revision;
  }

  controllerOf(hexId: string): string | null {
    if (!this.hexControl.has(hexId)) throw new Error(`未知 Hex: ${hexId}`);
    return this.hexControl.get(hexId)!;
  }

  /**
   * Low-level state mutation for the future simulation system.
   * Callers must validate gameplay rules (movement, combat, occupation) first.
   */
  applyControlChanges(changes: readonly { hexId: string; controllerId: string }[]): void {
    const knownCountries = new Set(this.scenario.countries.map(country => country.id));
    for (const change of changes) {
      const hex = this.map.hexesById.get(change.hexId);
      if (!hex || hex.terrain === 'ocean' || !knownCountries.has(change.controllerId)) {
        throw new Error(`非法控制权变更：${change.hexId}`);
      }
    }
    let changed = false;
    for (const { hexId, controllerId } of changes) {
      if (this.hexControl.get(hexId) !== controllerId) {
        this.hexControl.set(hexId, controllerId);
        changed = true;
      }
    }
    if (changed) this._revision++;
  }
}
