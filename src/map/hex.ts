import type { GridDefinition } from './MapDefinition.ts';

export interface Axial { q: number; r: number }
export interface Point { x: number; y: number }

const ROOT3 = Math.sqrt(3);

/** Odd-row offset storage, pointy-top axial coordinate system. */
export function fromOffset(col: number, row: number): Axial {
  return { q: col - Math.floor(row / 2), r: row };
}

export function hexId({ q, r }: Axial): string {
  return `${q},${r}`;
}

export const DIRECTIONS: readonly Axial[] = [
  { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
  { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 },
];

export function neighbors({ q, r }: Axial): Axial[] {
  return DIRECTIONS.map((d) => ({ q: q + d.q, r: r + d.r }));
}

export function hexDistance(a: Axial, b: Axial): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

export function hexCenter({ q, r }: Axial, grid: GridDefinition): Point {
  return {
    x: grid.originX + ROOT3 * grid.radius * (q + r / 2),
    y: grid.originY + 1.5 * grid.radius * r,
  };
}

export function hexCorners(hex: Axial, grid: GridDefinition): Point[] {
  const { x, y } = hexCenter(hex, grid);
  return Array.from({ length: 6 }, (_, i) => {
    const angle = (-90 + 60 * i) * Math.PI / 180;
    return { x: x + grid.radius * Math.cos(angle), y: y + grid.radius * Math.sin(angle) };
  });
}

/** Inverse pointy-top transform with cube rounding for stable click picking. */
export function pixelToHex(point: Point, grid: GridDefinition): Axial {
  const x = point.x - grid.originX;
  const y = point.y - grid.originY;
  const fractionalQ = (ROOT3 / 3 * x - y / 3) / grid.radius;
  const fractionalR = (2 / 3 * y) / grid.radius;

  let cubeX = Math.round(fractionalQ);
  let cubeZ = Math.round(fractionalR);
  const cubeY = Math.round(-fractionalQ - fractionalR);
  const dx = Math.abs(cubeX - fractionalQ);
  const dy = Math.abs(cubeY + fractionalQ + fractionalR);
  const dz = Math.abs(cubeZ - fractionalR);
  if (dx > dy && dx > dz) cubeX = -cubeY - cubeZ;
  else if (dz > dy) cubeZ = -cubeX - cubeY;
  return { q: cubeX, r: cubeZ };
}
