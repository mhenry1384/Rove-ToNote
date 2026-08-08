/**
 * Fractional-index helpers for ordering siblings without renumbering the
 * whole list on every insert/reorder/reparent.
 */

const APPEND_GAP = 1024;

export function appendSortOrder(existingSiblingOrders: number[]): number {
  if (existingSiblingOrders.length === 0) return APPEND_GAP;
  return Math.max(...existingSiblingOrders) + APPEND_GAP;
}

/** Order that sits strictly between `before` and `after` (either may be absent at a list edge). */
export function betweenSortOrder(before: number | null, after: number | null): number {
  if (before === null && after === null) return APPEND_GAP;
  if (before === null) return after! / 2;
  if (after === null) return before + APPEND_GAP;
  return (before + after) / 2;
}
