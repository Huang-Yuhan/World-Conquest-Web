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
}

export const UNIT_RULES: Readonly<Record<GroundUnitKind, { readonly movePoints: number; readonly label: string }>> = {
  infantry: { movePoints: 3, label: '步' },
  tank: { movePoints: 7, label: '坦' },
  antiTank: { movePoints: 3, label: '反' },
  artillery: { movePoints: 2, label: '炮' },
};

export const UNIT_KINDS = Object.freeze(Object.keys(UNIT_RULES) as GroundUnitKind[]);
