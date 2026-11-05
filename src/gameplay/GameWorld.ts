import type { MapData } from '../map/MapData.ts';
import { validateScenario, type ScenarioDefinition } from './ScenarioDefinition.ts';
import { reachableMoves, type MoveRoute } from './Movement.ts';
import { UNIT_RULES, type UnitState } from './Units.ts';

/** Authoritative mutable state. No rendering imports or PixiJS types. */
export class GameWorld {
  readonly map: MapData;
  readonly scenario: ScenarioDefinition;
  private readonly hexControl = new Map<string, string | null>();
  private readonly unitStates = new Map<string, UnitState>();
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
    for (const unit of scenario.initialUnits ?? []) {
      const maxMp = UNIT_RULES[unit.kind].movePoints;
      this.unitStates.set(unit.id, { ...unit, hp: 100, maxHp: 100, maxMp, mpRemaining: maxMp });
    }
  }

  get revision(): number {
    return this._revision;
  }

  controllerOf(hexId: string): string | null {
    if (!this.hexControl.has(hexId)) throw new Error(`未知 Hex: ${hexId}`);
    return this.hexControl.get(hexId)!;
  }


  /** Copy unit data so consumers cannot mutate authoritative World state. */
  get units(): readonly UnitState[] {
    return [...this.unitStates.values()].map(unit => ({ ...unit }));
  }

  unitById(id: string): UnitState | undefined {
    const unit = this.unitStates.get(id);
    return unit ? { ...unit } : undefined;
  }

  unitAt(hexId: string): UnitState | undefined {
    const unit = [...this.unitStates.values()].find(item => item.hexId === hexId);
    return unit ? { ...unit } : undefined;
  }

  reachableFor(unitId: string): ReadonlyMap<string, MoveRoute> {
    const mover = this.unitStates.get(unitId);
    if (!mover) throw new Error(`未知单位：${unitId}`);
    return reachableMoves({ map: this.map, units: this.units }, mover);
  }

  /** Atomic validated movement. Enemy empty Hexes on the actual path are captured. */
  moveUnit(unitId: string, destinationId: string): MoveRoute {
    const unit = this.unitStates.get(unitId);
    if (!unit) throw new Error(`未知单位：${unitId}`);
    const route = this.reachableFor(unitId).get(destinationId);
    if (!route) throw new Error(`单位 ${unitId} 无法移动到 ${destinationId}`);
    // Paths are validated before any mutation, so an invalid move never
    // consumes MP or partially changes territorial control.
    for (const hexId of route.hexIds.slice(1)) {
      if (this.hexControl.get(hexId) !== unit.countryId) {
        this.hexControl.set(hexId, unit.countryId);
      }
    }
    this.unitStates.set(unitId, {
      ...unit,
      hexId: destinationId,
      mpRemaining: unit.mpRemaining - route.cost,
    });
    this._revision++;
    return route;
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
