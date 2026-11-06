/**
 * Map-only visual cues. This contract is deliberately independent of Gameplay:
 * the React composition root converts validated action results into draw data.
 */
export type ActionMapFeedback =
  | {
      readonly kind: 'combat';
      readonly attackerHexId: string;
      readonly defenderHexId: string;
      readonly damageToDefender: number;
      readonly damageToAttacker: number;
      readonly defenderDestroyed: boolean;
      readonly attackerDestroyed: boolean;
    }
  | {
      readonly kind: 'city-settlement';
      readonly hexes: readonly {
        readonly hexId: string;
        readonly status: 'claimed' | 'enemyGarrison' | 'enemyZoc' |
          'outsideProvince' | 'otherCity' | 'contested';
      }[];
    };
