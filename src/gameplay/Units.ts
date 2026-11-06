/** Data-only ground unit definitions. Numbers are provisional MVP balance values. */
export type GroundUnitKind = 'infantry' | 'tank' | 'antiTank' | 'artillery';

export interface InitialUnitDefinition {
  readonly id: string;
  readonly countryId: string;
  readonly kind: GroundUnitKind;
  readonly hexId: string;
}

export interface UnitState extends InitialUnitDefinition {
  readonly maxHp: number;
  readonly hp: number;
  readonly maxMp: number;
  readonly mpRemaining: number;
  readonly attacksRemaining: number;
}

export interface UnitRules {
  readonly movePoints: number;
  readonly label: string;
  readonly attack: number;
  readonly defense: number;
  readonly minRange: number;
  readonly maxRange: number;
  readonly administrativeDenialRange: number;
}

export const UNIT_RULES: Readonly<Record<GroundUnitKind, UnitRules>> = {
  infantry: { movePoints: 3, label: '步', attack: 30, defense: 20, minRange: 1, maxRange: 1, administrativeDenialRange: 1 },
  tank: { movePoints: 7, label: '坦', attack: 40, defense: 30, minRange: 1, maxRange: 1, administrativeDenialRange: 1 },
  antiTank: { movePoints: 3, label: '反', attack: 36, defense: 15, minRange: 1, maxRange: 2, administrativeDenialRange: 1 },
  artillery: { movePoints: 2, label: '炮', attack: 42, defense: 10, minRange: 1, maxRange: 3, administrativeDenialRange: 0 },
};

export const UNIT_KINDS = Object.freeze(Object.keys(UNIT_RULES) as GroundUnitKind[]);
