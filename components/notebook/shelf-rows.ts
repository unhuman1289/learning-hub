/** Geometry of a bookcase shelf with notebooks standing spine-out. Sizes are CSS pixels. */
export const SPINE = { width: 36, gap: 3, height: 152, cover: 114, lift: 16, zoom: 1.12 } as const;

/** Notebooks at or above this count stand spine-out; fewer lie face-out as before. */
export const SPINE_FROM = 3;

/** How many spines fit on one shelf board of the given inner width (at least one). */
export function shelfCapacity(width: number, spine: number = SPINE.width, gap: number = SPINE.gap): number {
  if (!Number.isFinite(width) || width <= 0) return 1;
  return Math.max(1, Math.floor((width + gap) / (spine + gap)));
}

/** The first shelf fills before the next one is started. */
export function chunkRows<T>(items: readonly T[], capacity: number): T[][] {
  const size = Math.max(1, Math.floor(capacity));
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size));
  return rows;
}

/**
 * Sideways shift that keeps a pulled-out cover inside its shelf. `index` is the book's place on the
 * shelf; `overhang` is how far past the shelf ends a cover may reach.
 */
export function coverShift(index: number, rowWidth: number, overhang = 4): number {
  const { width, gap, cover, zoom } = SPINE;
  const shown = cover * zoom;
  const centre = index * (width + gap) + width / 2;
  const left = centre - shown / 2;
  const min = -overhang;
  const max = Math.max(min, rowWidth - shown + overhang);
  return Math.min(Math.max(left, min), max) - left;
}

/** A stable cloth colour for a notebook, from its id. */
export const SPINE_COLORS = ["#26262c", "#3b4a63", "#5a3b3b", "#34503f", "#59476b", "#6a5232"] as const;
export function spineColor(id: string): string {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return SPINE_COLORS[hash % SPINE_COLORS.length];
}
