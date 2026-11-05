import type { MapData } from '../map/MapData.ts';
import type { Terrain } from '../map/MapDefinition.ts';
import { hexDistance } from '../map/hex.ts';
import { UNIT_RULES, type GroundUnitKind, type UnitState } from './Units.ts';

export interface CombatResult {
  readonly attackerId: string;
  readonly defenderId: string;
  /** Damage inflicted on the initial defender before any counterattack. */
  readonly damageToDefender: number;
  readonly damageToAttacker: number;
  readonly defenderRemainingHp: number;
  readonly attackerRemainingHp: number;
  readonly counterattacked: boolean;
  readonly defenderDestroyed: boolean;
  readonly attackerDestroyed: boolean;
}

const TERRAIN_COVER: Readonly<Record<Terrain, number>> = {
  ocean: 0, plains: 0, forest: 10, hills: 10, mountains: 20,
};

function typeMultiplier(attacker: GroundUnitKind, defender: GroundUnitKind): number {
  if (attacker === 'tank' && defender === 'infantry') return 1.2;
  if (attacker === 'infantry' && defender === 'tank') return 0.7;
  if (attacker === 'antiTank' && defender === 'tank') return 1.5;
  if (attacker === 'artillery' && defender === 'infantry') return 1.3;
  return 1;
}

/** Minimum and maximum range both count; no line-of-sight obstruction yet. */
export function isInAttackRange(attacker: UnitState, defender: UnitState): boolean {
  const [q, r] = attacker.hexId.split(',').map(Number);
  const [dq, dr] = defender.hexId.split(',').map(Number);
  const distance = hexDistance({ q, r }, { q: dq, r: dr });
  const rules = UNIT_RULES[attacker.kind];
  return distance >= rules.minRange && distance <= rules.maxRange;
}

/** Scenarios may eventually define many cities per province; cover uses the tile. */
export function coverAt(map: MapData, hexId: string): number {
  const hex = map.hexesById.get(hexId);
  if (!hex || hex.terrain === 'ocean') throw new Error('战斗目标必须位于陆地');
  const cover = TERRAIN_COVER[hex.terrain];
  const hasCity = map.cities.some(city => city.hexId === hexId);
  // Cover does not stack between a city and its terrain in the MVP.
  return Math.max(cover, hasCity ? 15 : 0);
}

/**
 * Integer-only results, no RNG. Attacker's HP is read at the moment of
 * firing; a surviving defender counters using its HP AFTER the incoming hit.
 */
export function calculateDamage(attacker: UnitState, defender: UnitState, map: MapData): number {
  const rules = UNIT_RULES[attacker.kind];
  const defense = UNIT_RULES[defender.kind].defense;
  const effectiveAttack = Math.floor(rules.attack * (0.5 + 0.5 * attacker.hp / attacker.maxHp));
  return Math.max(1, Math.floor(
    effectiveAttack * typeMultiplier(attacker.kind, defender.kind)
      * 100 / (100 + defense + coverAt(map, defender.hexId)),
  ));
}

export function previewCombat(
  map: MapData,
  attacker: UnitState,
  defender: UnitState,
): CombatResult {
  if (attacker.id === defender.id || attacker.countryId === defender.countryId) {
    throw new Error('不能攻击友军或自己');
  }
  if (attacker.hp <= 0 || defender.hp <= 0) throw new Error('死亡单位不能参与战斗');
  if (attacker.attacksRemaining <= 0) throw new Error('单位本回合主动攻击次数已耗尽');
  if (!isInAttackRange(attacker, defender)) throw new Error('敌人不在有效攻击射程内');

  const damageToDefender = calculateDamage(attacker, defender, map);
  const defenderRemainingHp = Math.max(0, defender.hp - damageToDefender);

  // First strike can prevent all retaliation. A survivor counters only if
  // the attacker is inside the defender's own attack range.
  const counterattacked = defenderRemainingHp > 0 && isInAttackRange(defender, attacker);
  const damageToAttacker = counterattacked
    ? calculateDamage({ ...defender, hp: defenderRemainingHp }, attacker, map)
    : 0;
  const attackerRemainingHp = Math.max(0, attacker.hp - damageToAttacker);

  return {
    attackerId: attacker.id,
    defenderId: defender.id,
    damageToDefender,
    damageToAttacker,
    defenderRemainingHp,
    attackerRemainingHp,
    counterattacked,
    defenderDestroyed: defenderRemainingHp === 0,
    attackerDestroyed: attackerRemainingHp === 0,
  };
}
