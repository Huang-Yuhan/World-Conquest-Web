import type { MapData } from '../map/MapData.ts';
import { validateScenario, type ScenarioDefinition } from './ScenarioDefinition.ts';
import { reachableMoves, type MoveRoute } from './Movement.ts';
import { UNIT_RULES, type UnitState } from './Units.ts';
import { isInAttackRange, previewCombat, type CombatResult } from './Combat.ts';

/** Authoritative mutable state. No rendering imports or PixiJS types. */
export class GameWorld {
  readonly map: MapData;
  readonly scenario: ScenarioDefinition;
  private readonly hexControl = new Map<string, string | null>();
  private readonly unitStates = new Map<string, UnitState>();
  private _revision = 0;
  private _round = 1;
  private _activeCountryIndex = 0;

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
      this.unitStates.set(unit.id, { ...unit, hp: 100, maxHp: 100, maxMp, mpRemaining: maxMp, attacksRemaining: 1 });
    }
  }

  get revision(): number {
    return this._revision;
  }

  /** Round 1 begins with the first country in the scenario. */
  get round(): number {
    return this._round;
  }

  /** Active country is authoritative Gameplay state, never a Renderer decision. */
  get activeCountryId(): string {
    return this.scenario.countries[this._activeCountryIndex].id;
  }

  get turnPosition(): number {
    return this._activeCountryIndex + 1;
  }

  /** Pass to the next country in scenario order. Reset ONLY its living units. */
  endTurn(): void {
    this._activeCountryIndex++;
    if (this._activeCountryIndex >= this.scenario.countries.length) {
      this._activeCountryIndex = 0;
      this._round++;
    }
    for (const [id, unit] of this.unitStates) {
      if (unit.countryId !== this.activeCountryId) continue;
      this.unitStates.set(id, { ...unit, mpRemaining: unit.maxMp, attacksRemaining: 1 });
    }
    // Turn transitions are observable even if the incoming country has no units.
    this._revision++;
  }

  private assertActive(unit: UnitState): void {
    if (unit.countryId !== this.activeCountryId) {
      throw new Error(`目前轮到 ${this.activeCountryId}，不能操作其他国家的部队`);
    }
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
    if (mover.countryId !== this.activeCountryId) return new Map();
    return reachableMoves({ map: this.map, units: this.units }, mover);
  }

  /** Atomic validated movement. Enemy empty Hexes on the actual path are captured. */
  moveUnit(unitId: string, destinationId: string): MoveRoute {
    const unit = this.unitStates.get(unitId);
    if (!unit) throw new Error(`未知单位：${unitId}`);
    this.assertActive(unit);
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

  /** Returns an attack preview for each enemy Hex this unit may attack. */
  attackableFor(unitId: string): ReadonlyMap<string, CombatResult> {
    const attacker = this.unitStates.get(unitId);
    if (!attacker) throw new Error(`未知单位：${unitId}`);
    const targets = new Map<string, CombatResult>();
    if (attacker.countryId !== this.activeCountryId) return targets;
    if (attacker.attacksRemaining <= 0) return targets;
    for (const defender of this.unitStates.values()) {
      if (defender.countryId !== attacker.countryId && isInAttackRange(attacker, defender)) {
        targets.set(defender.hexId, previewCombat(this.map, attacker, defender));
      }
    }
    return targets;
  }

  /**
   * Attack is atomic: validate/compute before touching GameWorld.
   * It consumes one attack opportunity but never consumes MP or moves the attacker.
   * Defender damage happens first; surviving defenders may counter with reduced HP.
   */
  attackUnit(attackerId: string, defenderHexId: string): CombatResult {
    const attacker = this.unitStates.get(attackerId);
    if (!attacker) throw new Error(`未知攻击单位：${attackerId}`);
    this.assertActive(attacker);
    const defender = [...this.unitStates.values()].find(u => u.hexId === defenderHexId);
    if (!defender) throw new Error('目标 Hex 没有可攻击的单位');
    const result = previewCombat(this.map, attacker, defender);

    if (result.defenderDestroyed) this.unitStates.delete(defender.id);
    else this.unitStates.set(defender.id, { ...defender, hp: result.defenderRemainingHp });

    if (result.attackerDestroyed) this.unitStates.delete(attacker.id);
    else this.unitStates.set(attacker.id, {
      ...attacker, hp: result.attackerRemainingHp, attacksRemaining: attacker.attacksRemaining - 1,
    });

    // No territory flips and no auto-advance; destroyed units cease projecting ZOC.
    this._revision++;
    return result;
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
