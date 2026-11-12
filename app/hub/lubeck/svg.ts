/**
 * Small SVG builders for the study window. Every value here is constant artwork or a number; no learner or
 * request data is ever interpolated into the markup.
 */
export const GROUND = 250;
export const R = Math.PI / 180;
type Attr = string;

export const rect = (x: number, y: number, w: number, h: number, a: Attr) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" ${a}/>`;
export const poly = (points: string, a: Attr) => `<polygon points="${points}" ${a}/>`;
export const circ = (x: number | string, y: number | string, r: number | string, a: Attr) => `<circle cx="${x}" cy="${y}" r="${r}" ${a}/>`;
export const ell = (x: number, y: number, rx: number, ry: number, a: Attr) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" ${a}/>`;
export const line = (d: string, color: string, width = 1.5) => `<path d="${d}" stroke="${color}" stroke-width="${width}" stroke-linecap="round" fill="none"/>`;
export const path = (d: string, a: Attr) => `<path d="${d}" ${a}/>`;
export const F = (color: string) => `fill="${color}"`;

// data-c holds the daylight colour; draw() mixes it with haze, weather and night.
export const B = (c: string, x: number, y: number, w: number, h: number) => rect(x, y, w, h, `data-c="${c}"`);
export const P = (c: string, points: string) => poly(points, `data-c="${c}"`);
export const C = (c: string, x: number, y: number, r: number) => circ(x, y, r, `data-c="${c}"`);
export const PD = (c: string, d: string) => path(d, `data-c="${c}"`);
/** Brick wall: the colour, then the brick courses over it. */
export const BR = (c: string, x: number, y: number, w: number, h: number) => B(c, x, y, w, h) + rect(x, y, w, h, 'fill="url(#lhw-brick)"');
export const BP = (c: string, points: string) => P(c, points) + poly(points, 'fill="url(#lhw-brick)"');
export const BD = (c: string, d: string, a = "") => path(d, `data-c="${c}" ${a}`) + path(d, `fill="url(#lhw-brick)" ${a}`);
/** Roof tiles. */
export const RP = (c: string, points: string) => P(c, points) + poly(points, 'fill="url(#lhw-tile)"');
export const ST = (c: string, x: number, y: number, w: number, h: number) => B(c, x, y, w, h) + rect(x, y, w, h, 'fill="url(#lhw-stone)"');
/** Shade on the side of a wall away from the light. */
export const SH = (x: number, y: number, w: number, h: number) => rect(x, y, w, h, 'fill="#101820" opacity=".2"');
/** Dark window, and a window that lights up after dusk. */
export const D = (x: number, y: number, w: number, h: number) => rect(x, y, w, h, 'rx="1.5" fill="#1b1620"');
export const L = (x: number, y: number, w: number, h: number) => D(x, y, w, h) + rect(x, y, w, h, 'rx="1.5" class="lit" fill="#f7c66b"');
export const GL = (x: number, y: number, r: number, c = "#f7c66b") => circ(x, y, r, `class="lit" fill="${c}"`);

/** Gothic pointed arch from its top-left corner. */
export const arch = (x: number, y: number, w: number, h: number) => {
  const shoulder = y + w * 0.62;
  return `M${x} ${y + h}V${shoulder}Q${x} ${y + w * 0.18} ${x + w / 2} ${y}Q${x + w} ${y + w * 0.18} ${x + w} ${shoulder}V${y + h}Z`;
};
export const DA = (x: number, y: number, w: number, h: number) => path(arch(x, y, w, h), 'fill="#1b1620"');
export const LA = (x: number, y: number, w: number, h: number) => DA(x, y, w, h) + path(arch(x, y, w, h), 'class="lit" fill="#f7c66b"');
/** Blind niche (Blendnische): a shallow pointed recess in a brick gable. */
export const NICHE = (x: number, y: number, w: number, h: number) => path(arch(x, y, w, h), 'fill="#2a0f0a" opacity=".22"');
/** Band of black-glazed headers, the Lübeck brick ornament. */
export const GLAZE = (x: number, y: number, w: number, h: number) => rect(x, y, w, h, 'fill="url(#lhw-glaze)"');
/** Iron wall anchor holding the beams. */
export const TIE = (x: number, y: number) => `<path d="M${x - 2.2} ${y}h4.4M${x} ${y - 2.2}v4.4" stroke="#1b1620" stroke-width=".9" stroke-linecap="round" opacity=".75"/>`;

/** Outline of a stepped gable (Treppengiebel) standing on the ground line. */
export function stepped(x: number, w: number, y: number, steps: number, rise: number) {
  let points = `${x},${GROUND} ${x},${y}`,
    cx = x,
    cy = y;
  const tread = w / (2 * steps + 1);
  for (let i = 0; i < steps; i++) {
    cx += tread;
    points += ` ${cx},${cy}`;
    cy -= rise;
    points += ` ${cx},${cy}`;
  }
  cx += tread;
  points += ` ${cx},${cy}`;
  for (let i = 0; i < steps; i++) {
    cy += rise;
    points += ` ${cx},${cy}`;
    cx += tread;
    points += ` ${cx},${cy}`;
  }
  return `${points} ${x + w},${GROUND}`;
}

/** Renaissance gable with scrolled (volute) shoulders, as on the salt warehouses; `y` is where the gable starts. */
export function volute(x: number, w: number, y: number, top: number) {
  const m = x + w / 2,
    h = y - top;
  return `M${x} ${GROUND}V${y}Q${x} ${y - h * 0.32} ${x + w * 0.2} ${y - h * 0.36}Q${x + w * 0.3} ${y - h * 0.4} ${x + w * 0.3} ${y - h * 0.62}` +
    `Q${x + w * 0.3} ${top} ${m} ${top}Q${x + w * 0.7} ${top} ${x + w * 0.7} ${y - h * 0.62}Q${x + w * 0.7} ${y - h * 0.4} ${x + w * 0.8} ${y - h * 0.36}` +
    `Q${x + w} ${y - h * 0.32} ${x + w} ${y}V${GROUND}Z`;
}

/** Baroque bell gable, as on the white merchant house in Mengstraße. */
export function bell(x: number, w: number, y: number, top: number) {
  const m = x + w / 2,
    h = y - top;
  return `M${x} ${GROUND}V${y}C${x + w * 0.04} ${y - h * 0.45} ${x + w * 0.3} ${y - h * 0.4} ${x + w * 0.3} ${y - h * 0.7}C${x + w * 0.3} ${top - h * 0.05} ${m - w * 0.08} ${top} ${m} ${top}` +
    `C${m + w * 0.08} ${top} ${x + w * 0.7} ${top - h * 0.05} ${x + w * 0.7} ${y - h * 0.7}C${x + w * 0.7} ${y - h * 0.4} ${x + w * 0.96} ${y - h * 0.45} ${x + w} ${y}V${GROUND}Z`;
}

export function seeded(seed: number) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}
