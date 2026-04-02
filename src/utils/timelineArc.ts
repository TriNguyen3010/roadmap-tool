export function calcArcHeight(arcWidth: number, rowHeight: number): number {
  const minHeight = 6;
  const maxHeight = Math.max(minHeight, rowHeight - 10);
  return Math.min(maxHeight, Math.max(minHeight, arcWidth * 0.18));
}

export function calcLayeredArcHeight(index: number, total: number, rowHeight: number): number {
  const maxHeight = Math.max(8, rowHeight - 8);
  const minHeight = 6;
  if (total <= 1) return maxHeight;
  const step = (maxHeight - minHeight) / Math.max(total - 1, 1);
  return Math.max(minHeight, maxHeight - index * step);
}

export function sortArcsByWidth<T extends { width: number }>(arcs: T[]): T[] {
  return [...arcs].sort((a, b) => b.width - a.width);
}
