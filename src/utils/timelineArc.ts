export function calcArcHeight(_arcWidth: number, rowHeight: number): number {
  return Math.max(6, rowHeight * 0.55);
}

export function calcLayeredArcHeight(_index: number, _total: number, rowHeight: number): number {
  return Math.max(6, rowHeight * 0.55);
}

export function sortArcsByWidth<T extends { width: number }>(arcs: T[]): T[] {
  return [...arcs].sort((a, b) => b.width - a.width);
}
