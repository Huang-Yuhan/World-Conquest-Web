/** Pointy-top axial hex coordinates. All geometric values are world-space pixels. */
export interface Axial { q: number; r: number }
export interface Point { x: number; y: number }

export const HEX_RADIUS = 29;
export const GRID_COLS = 29;
export const GRID_ROWS = 19;
export const MAP_WIDTH = 1570;
export const MAP_HEIGHT = 960;
const ORIGIN_X = 70;
const ORIGIN_Y = 75;
const ROOT3 = Math.sqrt(3);

/** Convert the convenient odd-row offset grid into true axial coordinates. */
export function fromOffset(col: number, row: number): Axial {
  return { q: col - Math.floor(row / 2), r: row };
}

export function hexId({ q, r }: Axial): string {
  return `${q},${r}`;
}

export const DIRECTIONS: readonly Axial[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export function neighbors({ q, r }: Axial): Axial[] {
  return DIRECTIONS.map((d) => ({ q: q + d.q, r: r + d.r }));
}

export function hexDistance(a: Axial, b: Axial): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

export function hexCenter({ q, r }: Axial): Point {
  return {
    x: ORIGIN_X + ROOT3 * HEX_RADIUS * (q + r / 2),
    y: ORIGIN_Y + 1.5 * HEX_RADIUS * r,
  };
}

export function hexCorners(hex: Axial): Point[] {
  const { x, y } = hexCenter(hex);
  return Array.from({ length: 6 }, (_, i) => {
    const angle = (-90 + 60 * i) * Math.PI / 180;
    return { x: x + HEX_RADIUS * Math.cos(angle), y: y + HEX_RADIUS * Math.sin(angle) };
  });
}

/** Deterministic coastline mask for the fictional continent. */
export function isLand(col: number, row: number): boolean {
  const x = (col - (GRID_COLS - 1) / 2) / ((GRID_COLS - 1) / 2);
  const y = (row - (GRID_ROWS - 1) / 2) / ((GRID_ROWS - 1) / 2);
  const coast = (x / 1.06) ** 2 + (y / 0.98) ** 2;
  const irregularity = 0.12 * Math.sin(col * 0.46 + row * 0.36)
    + 0.09 * Math.cos(col * 0.35 - row * 0.61)
    + 0.05 * Math.sin(col * 0.9);
  return coast < 1.04 + irregularity;
}
