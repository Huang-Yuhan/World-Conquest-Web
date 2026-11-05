/**
 * A renderer-facing, detached view of dynamic gameplay state.
 * No MapData geometry, gameplay objects or PixiJS types are included.
 */
export interface HexRenderState {
  readonly hexId: string;
  readonly controllerId: string | null;
}

export interface CityRenderState {
  readonly cityId: string;
  readonly controllerId: string | null;
}

export interface CountryRenderState {
  readonly id: string;
  readonly name: string;
  readonly color: number;
}

export interface RenderSnapshot {
  readonly mapId: string;
  readonly revision: number;
  readonly countries: readonly CountryRenderState[];
  readonly hexes: readonly HexRenderState[];
  readonly cities: readonly CityRenderState[];
}
