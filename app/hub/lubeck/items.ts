/**
 * One small object on the desk and one on the bookcase for each month (DESIGN.md "Lübeck window").
 * Constant artwork only. Each drawing stands on y = 0 and is centred on x = 0.
 */
const rect = (x: number, y: number, w: number, h: number, a: string) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" ${a}/>`;
const poly = (points: string, a: string) => `<polygon points="${points}" ${a}/>`;
const circ = (x: number, y: number, r: number, a: string) => `<circle cx="${x}" cy="${y}" r="${r}" ${a}/>`;
const ell = (x: number, y: number, rx: number, ry: number, a: string) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" ${a}/>`;
const line = (d: string, color: string, width = 1.5) => `<path d="${d}" stroke="${color}" stroke-width="${width}" stroke-linecap="round" fill="none"/>`;
const F = (color: string) => `fill="${color}"`;
const dots = (points: number[][], r: number, color: string) => points.map(([x, y]) => circ(x, y, r, F(color))).join("");

const mug = (color: string) =>
  `<path d="M16 -30c13 0 13 20 0 20" fill="none" stroke="${color}" stroke-width="4"/>` +
  rect(-18, -38, 36, 36, `rx="6" ${F(color)}`) +
  ell(0, -37, 18, 4.5, F("#5a3b2c")) +
  '<path class="lhw-steam" d="M-6 -44c-4-6 4-8 0-15" fill="none" stroke="#f7f4ec" stroke-width="2" stroke-linecap="round"/>' +
  '<path class="lhw-steam" style="animation-delay:1.3s" d="M6 -44c4-6-4-8 0-15" fill="none" stroke="#f7f4ec" stroke-width="2" stroke-linecap="round"/>';
const plate = ell(0, -2, 24, 5, F("#f4f0e6")) + ell(0, -2, 16, 3, F("#e4dfd2"));

/** viewBox "-28 -62 56 68" */
export function deskItem(month: number) {
  const shadow = ell(0, 0, 24, 5, 'fill="#3a2614" opacity=".4"');
  const art: Record<number, string> = {
    // Hot tea for the dark months.
    1: mug("#7f97a6"),
    11: mug("#c98f76"),
    // Fasching: a Berliner.
    2: plate + ell(0, -10, 15, 8, F("#c98a4b")) + ell(0, -14, 11, 4, F("#fbf6ea")) + circ(0, -10, 2, F("#b03a3a")),
    // Pussy willow.
    3: rect(-7, -22, 14, 22, `rx="3" ${F("#8fb0b8")}`) + line("M-2 -22q-6-18-2-30M2 -22q6-16 3-26", "#6b4a2e", 1.6) + [[-6, -34], [-7, -44], [-4, -52], [6, -32], [7, -42]].map(([x, y]) => ell(x, y, 2.6, 3.6, F("#e9e4d8"))).join(""),
    // A painted Easter egg.
    4: poly("-9,-12 9,-12 5,0 -5,0", F("#f4f0e6")) + ell(0, -20, 9, 12, F("#6aa7c9")) + line("M-8 -22q8 4 16 0", "#f7c66b", 2) + line("M-7 -16q7 3 14 0", "#e24b4a", 1.6),
    // Lilac.
    5: rect(-6, -20, 12, 20, `rx="3" ${F("#9ab8a8")}`) + line("M0 -20V-34", "#4f8a4a", 1.6) + dots([[-5, -38], [5, -40], [0, -46], [-3, -52], [4, -50], [0, -56]], 4.2, "#b08ad0"),
    // Strawberry season.
    6: poly("-18,-12 18,-12 12,0 -12,0", F("#f4f0e6")) + [[-10, -15], [0, -18], [10, -15], [-4, -22], [6, -22]].map(([x, y]) => poly(`${x - 5},${y - 3} ${x + 5},${y - 3} ${x},${y + 6}`, F("#d8433a")) + circ(x, y - 4, 2, F("#4f8a4a"))).join(""),
    // Lemonade.
    7: poly("-12,-40 12,-40 9,0 -9,0", 'fill="#dfeef2" opacity=".75"') + poly("-11,-30 11,-30 9,-1 -9,-1", F("#f3df7a")) + line("M4 -8L12 -52", "#d8433a", 2) + circ(-3, -16, 4, 'fill="#ffffff" opacity=".7"') + circ(-10, -40, 6, F("#f1c93b")),
    // Watermelon.
    8: plate + '<path d="M-18 -6a18 18 0 0 1 36 0z" fill="#3f8a4f"/><path d="M-15 -6a15 15 0 0 1 30 0z" fill="#e2504a"/>' + [[-6, -10], [0, -14], [6, -10]].map(([x, y]) => ell(x, y, 1, 1.8, F("#2b2b2e"))).join(""),
    // Apples.
    9: circ(-4, -13, 13, F("#c8433a")) + circ(5, -13, 12, F("#d8544a")) + line("M0 -25q1-6 5-8", "#5a3b2c", 1.8) + ell(8, -31, 5, 2.4, `transform="rotate(-25 8 -31)" ${F("#4f8a4a")}`),
    // A pumpkin.
    10: ell(0, -13, 19, 13, F("#e08a2e")) + ell(-8, -13, 8, 12, F("#d67a22")) + ell(8, -13, 8, 12, F("#d67a22")) + ell(0, -13, 6, 13, F("#eb9a3a")) + rect(-2, -31, 4, 7, `rx="1" ${F("#5f6b3a")}`),
    // Advent: marzipan and a candle.
    12: rect(-22, -6, 20, 6, `rx="2" ${F("#f1e3c4")}`) + rect(-20, -9, 16, 4, `rx="1.5" ${F("#b03a3a")}`) + rect(4, -34, 12, 34, `rx="2" ${F("#b03a3a")}`) + line("M10 -34v-5", "#2b2b2e") + ell(10, -45, 4, 7, `class="lhw-flame" ${F("#f5a623")}`) + ell(2, -2, 6, 3, F("#3f6b4c")) + ell(18, -2, 6, 3, F("#3f6b4c")) + circ(10, -3, 2.4, F("#d8433a")),
  };
  return shadow + (art[month] ?? "");
}

/** viewBox "-16 -46 32 48" */
export function shelfItem(month: number) {
  const art: Record<number, string> = {
    // Snow globe.
    1: rect(-10, -6, 20, 6, `rx="2" ${F("#7c5c3c")}`) + circ(0, -17, 12, 'fill="#dcecf2" opacity=".85"') + poly("-5,-8 0,-22 5,-8", F("#3f6b4c")) + dots([[-6, -20], [6, -16], [2, -25]], 1.2, "#ffffff"),
    // Jester's cap.
    2: poly("-12,0 -8,-22 0,-8 8,-24 12,0", F("#d8433a")) + poly("-12,0 -8,-22 -2,0", F("#f1c93b")) + circ(-8, -23, 2.4, F("#3f8ad0")) + circ(8, -25, 2.4, F("#3f8a4f")),
    // Bird house.
    3: rect(-9, -18, 18, 18, F("#c9a57a")) + poly("-12,-18 0,-30 12,-18", F("#8a4234")) + circ(0, -9, 3.4, F("#2b2b2e")) + line("M-2 -4h6", "#5a3b2c", 1.6),
    // Easter hare.
    4: ell(0, -8, 8, 8, F("#b98a5e")) + circ(0, -19, 5.5, F("#b98a5e")) + ell(-3, -29, 2, 7, F("#b98a5e")) + ell(3, -29, 2, 7, F("#b98a5e")) + circ(8, -5, 3, F("#f7f4ec")) + circ(2, -20, 0.9, F("#2b2b2e")),
    // Maikäfer.
    5: ell(0, -6, 10, 6, F("#b03a3a")) + circ(8, -7, 4, F("#2b2b2e")) + line("M0 -12V0", "#2b2b2e", 1) + dots([[-4, -8], [3, -5], [-1, -4]], 1.3, "#2b2b2e"),
    // Model sailing boat.
    6: '<path d="M-13 -6h26l-4 6h-18z" fill="#3f6b8a"/>' + line("M0 -6V-32", "#2b2b2e") + poly("1,-30 1,-8 12,-8", F("#f7f4ec")) + poly("-1,-24 -1,-8 -9,-8", F("#e2504a")),
    // Starfish from the Baltic.
    7: poly("0,-19 3,-12 11,-12 5,-7 7,0 0,-4 -7,0 -5,-7 -11,-12 -3,-12", F("#e89a5a")),
    // Lighthouse.
    8: [0, 1, 2, 3].map((i) => rect(-6 + i * 0.6, -8 - i * 7, 12 - i * 1.2, 7, F(i % 2 ? "#f7f4ec" : "#d8433a"))).join("") + rect(-4, -36, 8, 7, F("#2b2b2e")) + circ(0, -33, 2.4, F("#f7c66b")) + poly("-6,-36 0,-42 6,-36", F("#d8433a")),
    // Schultüte for the first day of school.
    9: poly("-10,-30 10,-30 0,0", F("#3f8ad0")) + ell(0, -31, 11, 4, F("#f1c93b")) + dots([[-3, -22], [3, -16], [0, -10]], 1.6, "#f7f4ec"),
    // Chestnut figure.
    10: circ(0, -9, 8, F("#7a4a2a")) + circ(0, -22, 5.5, F("#8a5a34")) + line("M-7 -10l-6-5M7 -10l6-5M-3 -2v3M3 -2v3", "#3b2410", 1.4) + dots([[-2, -23], [2, -23]], 0.9, "#f7f4ec"),
    // Paper lantern for St. Martin.
    11: line("M0 -34V-28", "#2b2b2e", 1.2) + rect(-9, -28, 18, 24, `rx="5" ${F("#e89a3a")}`) + rect(-9, -28, 18, 24, 'rx="5" fill="#ffd98a" opacity=".55"') + poly("0,-22 2,-17 7,-17 3,-13 5,-8 0,-11 -5,-8 -3,-13 -7,-17 -2,-17", F("#fff3c4")) + rect(-9, -6, 18, 3, F("#5a3b2c")),
    // Nutcracker.
    12: rect(-6, -18, 12, 18, F("#b03a3a")) + rect(-8, -2, 16, 2.5, F("#2b2b2e")) + rect(-5, -27, 10, 9, F("#e9c9a8")) + rect(-6, -37, 12, 10, F("#2b2b2e")) + rect(-6, -29, 12, 2.5, F("#f1c93b")) + rect(-4, -21, 8, 4, F("#f7f4ec")) + dots([[-2, -24], [2, -24]], 0.9, "#2b2b2e") + rect(-10, -17, 4, 10, F("#2f4f8a")) + rect(6, -17, 4, 10, F("#2f4f8a")),
  };
  return art[month] ?? "";
}
