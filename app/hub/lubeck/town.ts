import {
  B, BD, BP, BR, C, D, DA, F, GLAZE, GROUND, L, LA, NICHE, P, PD, RP, SH, ST, TIE, GL, bell, circ, ell, line, path, poly, rect, seeded, stepped, volute,
} from "./svg";

/**
 * Old Lübeck as seen across the Trave, in three depths: the seven spires on the skyline (far), the town hall's
 * shield wall and St. Mary's (mid), and the Holstentor, the salt warehouses and the merchant houses on the
 * quay (front). Coordinates are fixed: monthly decorations in scene.ts hang on these walls, lamps and towers.
 */

const COPPER = "#6a9c88";
const COPPER_DARK = "#4f7f6d";
const SLATE = "#4a5661";
const BAND = "#d9b48c";
const GOLD = "#c9a24a";

/** A spire on a square tower; `crown` adds the four small corner spirelets of St. Jakobi and St. Petri. */
function spire(c: string, x: number, w: number, top: number, apex: number, crown = false) {
  let o = B(c, x, top, w, GROUND - top) + P(c, `${x - 1.5},${top} ${x + w / 2},${apex} ${x + w + 1.5},${top}`);
  if (crown) o += P(c, `${x - 2},${top} ${x},${top - 9} ${x + 2},${top}`) + P(c, `${x + w - 2},${top} ${x + w},${top - 9} ${x + w + 2},${top}`);
  return o;
}

/** The skyline: rooftops of the old-town island and its seven spires, pale with distance. */
export function farLayer() {
  const rnd = seeded(23);
  const c = "#7f8c9c";
  let o = `<polygon data-c="${c}" points="44,${GROUND}`;
  for (let x = 44; x <= 636; x += 10) o += ` ${x},${208 + Math.round(rnd() * 10)} ${x + 5},${196 + Math.round(rnd() * 12)}`;
  o += ` 636,${GROUND}"/>`;
  // Cathedral (Dom): two slender towers far left.
  o += spire(c, 66, 9, 150, 92) + spire(c, 80, 9, 150, 92) + P(c, "60,176 77,160 96,176");
  // St. Aegidien.
  o += spire(c, 120, 8, 170, 124);
  // St. Petri, standing behind the Holstentor between its two towers.
  o += spire(c, 260, 12, 122, 64, true);
  // St. Jakobi, by the harbour.
  o += spire(c, 398, 10, 142, 90, true);
  // Smaller roofs and a crane on the harbour side.
  o += P(c, "620,190 626,170 632,190") + line("M600 196V170h18", c, 1.3);
  return o;
}

/** A Gothic merchant house of the old town behind the warehouses. */
function townHouse(kind: "stepped" | "volute" | "plain", x: number, w: number, top: number, wall: string) {
  const eaves = top + 26;
  let o = kind === "stepped" ? BP(wall, stepped(x, w, eaves, 3, 8.6))
    : kind === "volute" ? BD(wall, volute(x, w, eaves, top))
    : BP(wall, `${x},${GROUND} ${x},${eaves} ${x + w / 2},${top} ${x + w},${eaves} ${x + w},${GROUND}`);
  o += NICHE(x + w / 2 - 2, top + 8, 4, 14) + GLAZE(x, eaves, w, 3);
  for (let r = 0; r < 4; r++) for (let k = 0; k < 2; k++) o += ((r + k + x) % 4 === 0 ? L : D)(x + 3.5 + k * (w - 11), eaves + 7 + r * 11, 4, 7);
  return o + SH(x + w - 4, eaves, 4, GROUND - eaves);
}

/** Behind the quay: merchant gables, the town hall's shield wall with its wind holes, and St. Mary's. */
export function midLayer() {
  let o = townHouse("stepped", 362, 19, 150, "#a85a44") + townHouse("volute", 381, 19, 146, "#d9c7a3") +
    townHouse("stepped", 400, 20, 156, "#9c4a3a") + townHouse("plain", 420, 20, 160, "#c9b79a");

  // Rathaus: a wall of black-glazed brick standing above the roof, pierced by round wind holes, with slim copper turrets.
  const wall = "#6b3d33";
  const holes = [[458, 142], [492, 142]].map(([x, y]) => `M${x - 6} ${y}a6 6 0 1 0 12 0a6 6 0 1 0 -12 0Z`).join("");
  const shield = `M442 ${GROUND}V122H510V${GROUND}Z${holes}`;
  o += BD(wall, shield, 'fill-rule="evenodd"') + path(shield, 'fill-rule="evenodd" fill="url(#lhw-glaze)" opacity=".55"');
  for (const x of [447, 459, 471, 483, 495]) o += NICHE(x, 160, 8, 34);
  for (let i = 0; i < 9; i++) o += NICHE(444 + i * 7.4, 126, 4.6, 8);
  [[442, 104, 86], [459, 108, 92], [474, 98, 78], [489, 108, 92], [506, 104, 86]].forEach(([x, top, apex]) => {
    o += B(wall, x - 2, top, 5, 122 - top) + P(COPPER, `${x - 3},${top} ${x + 0.5},${apex} ${x + 4},${top}`) + circ(x + 0.5, apex - 2, 1.2, F(GOLD));
  });
  o += B(COPPER, 442, 120, 68, 2.5);

  // St. Mary's: twin towers crowned by gables, copper spires, clock faces, and the nave with flying buttresses.
  const brick = "#a65a45";
  o += BR(brick, 516, 116, 22, 134) + BR(brick, 546, 116, 22, 134) + BR(brick, 538, 150, 8, 100);
  for (const x of [516, 546]) {
    o += P(COPPER, `${x - 3},116 ${x + 11},34 ${x + 25},116`) + poly(`${x + 11},34 ${x + 15},116 ${x + 25},116`, 'fill="#101820" opacity=".22"');
    o += line(`M${x + 11} 34V24`, "#2b2b2e", 1.2) + circ(x + 11, 23, 1.8, F(GOLD));
    o += BP(brick, `${x - 1},117 ${x + 5.5},105 ${x + 12},117`) + BP(brick, `${x + 10},117 ${x + 16.5},105 ${x + 23},117`);
    o += circ(x + 11, 132, 4, F("#2b2b2e")) + C(GOLD, x + 11, 132, 3.2) + line(`M${x + 11} 132v-2.4M${x + 11} 132h1.8`, "#2b2b2e", 0.7);
    for (const y of [146, 182]) o += DA(x + 4, y, 5, 22) + DA(x + 13, y, 5, 22);
    o += B(BAND, x, 172, 22, 2.5) + B(BAND, x, 140, 22, 2);
    o += SH(x + 16, 116, 6, 134);
  }
  o += BR("#9c513d", 568, 168, 68, 82) + RP(COPPER, "566,168 578,140 636,140 636,168");
  o += B(COPPER_DARK, 598, 124, 4, 16) + P(COPPER, "596,124 600,104 604,124");
  for (let i = 0; i < 5; i++) {
    const x = 572 + i * 13;
    o += DA(x + 2, 178, 6, 38) + line(`M${x + 5} 182V216M${x + 2} 196h6`, "#3a3434", 0.6) + rect(x, 214, 10, 36, 'fill="#101820" opacity=".12"');
    o += BR("#8f4636", x - 2.5, 172, 3.5, 78) + P("#8f4636", `${x - 3},172 ${x - 0.75},164 ${x + 1.5},172`);
  }
  return o;
}

/** One round tower of the Holstentor, x0 = its left edge. */
function holstenTower(x0: number, k: number) {
  const cone = `${x0 - 5},130 ${x0 + 35},50 ${x0 + 75},130`;
  let o = BR("#9a4a38", x0, 130, 70, 120) + rect(x0, 130, 70, 120, 'fill="url(#lhw-cyl)"');
  o += RP(SLATE, cone) + poly(cone, 'fill="url(#lhw-cone)"');
  // Dormers on the slate cone.
  for (const [dx, y] of [[22, 104], [44, 104], [33, 82]]) o += P(SLATE, `${x0 + dx - 4},${y + 6} ${x0 + dx},${y - 2} ${x0 + dx + 4},${y + 6}`) + D(x0 + dx - 1.5, y + 1.5, 3, 4.5);
  o += line(`M${x0 - 5} 130H${x0 + 75}`, "#2b2b2e", 1.2) + line(`M${x0 + 35} 50V38`, "#2b2b2e") + circ(x0 + 35, 36, 2.6, F(GOLD));
  // Two terracotta friezes and plain string courses.
  for (const y of [158, 194]) o += B(BAND, x0, y, 70, 6) + rect(x0, y, 70, 6, 'fill="url(#lhw-frieze)"');
  for (const y of [144, 228]) o += B(BAND, x0, y, 70, 2.5);
  // Windows grow smaller towards the top; gun ports near the ground.
  for (let i = 0; i < 9; i++) o += D(x0 + 3 + i * 7.4, 134, 4, 6);
  [[148, 9], [167, 22], [203, 22]].forEach(([y, h], r) => {
    for (let i = 0; i < 7; i++) o += ((i + r + k) % 5 === 0 ? LA : DA)(x0 + 5 + i * 9, y, 5, h);
  });
  for (let i = 0; i < 4; i++) o += C("#c9a982", x0 + 12 + i * 15, 236, 3.8) + circ(x0 + 12 + i * 15, 236, 2.6, 'fill="#1b1620"');
  return o + ST("#7e3b2d", x0, 240, 70, 10);
}

/** The salt warehouses (Salzspeicher): six narrow brick gables of different centuries, hoist beams and shutters. */
function saltStores() {
  const heights = [62, 74, 58, 72, 60, 70];
  const bricks = ["#a5523f", "#8a4234", "#b0604a", "#9c4a3a", "#a85a44", "#8f4636"];
  const kinds = ["stepped", "volute", "stepped", "bell", "stepped", "volute"] as const;
  let o = "";
  for (let i = 0; i < 6; i++) {
    const x = 378 + i * 21,
      w = 20,
      top = GROUND - heights[i],
      eaves = top + 18;
    o += kinds[i] === "stepped" ? BP(bricks[i], stepped(x, w, eaves, 2, 9))
      : kinds[i] === "volute" ? BD(bricks[i], volute(x, w, eaves, top))
      : BD(bricks[i], bell(x, w, eaves, top));
    o += GLAZE(x, eaves, w, 2.5) + NICHE(x + 8, top + 5, 4, 9);
    // Hoist beam and rope over the loading doors.
    o += line(`M${x + 10} ${top + 4}h5`, "#2b2b2e", 1.4) + line(`M${x + 14.5} ${top + 4}v9`, "#3a3a3d", 0.5);
    for (let r = 0; r < 4; r++) {
      const y = eaves + 6 + r * 11;
      if (y > GROUND - 14) break;
      o += B("#3f5a48", x + 7.5, y, 5, 8) + line(`M${x + 10} ${y}v8`, "#1b1620", 0.5);
      o += ((i * 2 + r) % 5 === 0 ? L : D)(x + 2, y + 1, 4, 6) + ((i + r) % 4 === 0 ? L : D)(x + 14, y + 1, 4, 6);
    }
    o += DA(x + 6, 236, 8, 14) + TIE(x + 4, eaves + 4) + TIE(x + 16, eaves + 4) + SH(x + 16, eaves, 4, GROUND - eaves);
  }
  return o;
}

/** Riverside: two merchant houses, the Holstentor, the salt warehouses, the quay, lamps and the stone bridge. */
export function frontLayer() {
  // A Gothic stepped gable with blind niches, and the white Baroque house beside it.
  let o = BP("#b0604a", stepped(52, 46, 172, 3, 9)) + GLAZE(52, 172, 46, 3);
  for (const [x, y, h] of [[60, 160, 10], [73, 150, 20], [86, 160, 10]]) o += NICHE(x, y, 5, h);
  o += circ(75.5, 162, 2.6, 'fill="#1b1620"');
  for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) o += ((r + c) % 3 === 0 ? LA : DA)(60 + c * 12, 179 + r * 14, 6, 10);
  o += TIE(56, 176) + TIE(94, 176) + DA(69, 232, 12, 18) + SH(92, 172, 6, 78);
  const white = "#ebe2cd",
    trim = "#cfc1a3";
  o += PD(white, volute(100, 44, 190, 166)) + P(white, "112,168 122,154 132,168") + P(trim, "112,168 122,154 132,168 130,168 122,156.5 114,168");
  o += B(trim, 100, 188, 44, 3) + B(trim, 112, 167, 20, 2) + B(trim, 98, 248, 48, 2) + ell(122, 178, 3.4, 4.4, 'fill="#1b1620"') + circ(122, 152.5, 1.6, F(GOLD));
  for (const x of [101, 141]) o += B(trim, x, 191, 2, 57);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    const x = 106 + c * 13,
      y = 196 + r * 15;
    o += B("#f6f1e4", x - 1, y - 1, 8, 12) + ((r * 2 + c) % 4 === 1 ? L : D)(x, y, 6, 10) + B("#b9ab8c", x - 1.5, y + 10.5, 9, 1.4);
  }
  o += B("#5f3b2a", 116, 236, 12, 14) + B("#d8cbb0", 113, 233, 18, 3) + SH(138, 190, 6, 60);

  // Holstentor: two round towers and the central block with its stepped gable and inscription.
  o += holstenTower(150, 0) + holstenTower(290, 1);
  o += BP("#a5523f", stepped(220, 70, 142, 3, 13)) + GLAZE(220, 142, 70, 3);
  for (const [x, y, h] of [[230, 126, 14], [242, 112, 28], [252, 104, 36], [262, 112, 28], [274, 126, 14]]) o += NICHE(x, y, 6, h);
  o += P(SLATE, "226,129 231,114 236,129") + P(SLATE, "250,103 255,84 260,103") + P(SLATE, "274,129 279,114 284,129");
  o += B(BAND, 220, 150, 70, 3) + B(BAND, 220, 162, 70, 5) + rect(220, 162, 70, 5, 'fill="url(#lhw-frieze)"');
  o += B("#e8d3a0", 220, 176, 70, 9) + `<text data-c="#6b4a1e" x="255" y="183" text-anchor="middle" font-family="Georgia, serif" font-size="5.2" textLength="64" lengthAdjust="spacingAndGlyphs">CONCORDIA DOMI FORIS PAX</text>`;
  for (let i = 0; i < 5; i++) o += DA(227 + i * 12, 152, 6, 9) + (i % 2 ? LA : DA)(227 + i * 12, 188, 6, 15);
  o += B(BAND, 220, 208, 70, 3) + D(250, 112, 10, 16);
  o += '<path d="M239 250V228Q239 210 255 206Q271 210 271 228V250Z" fill="#17131c"/>';
  o += '<path d="M239 228Q239 210 255 206Q271 210 271 228" fill="none" stroke="#e8d3a0" stroke-width="2.5"/>';
  o += '<path d="M243 216V250M249 210V250M255 208V250M261 210V250M267 216V250M240 224H270M239 234H271" stroke="#3a3434" stroke-width=".7" opacity=".8"/>';

  o += saltStores();

  // Quay with bollards, the riverside trees (drawn by season), lamps, and the stone bridge.
  o += '<g data-p="trees"></g>' + ST("#8d8478", 44, 243, 462, 7) + B("#6e675c", 44, 249, 462, 1.5);
  for (const x of [92, 196, 344, 470]) o += B("#2b2b2e", x, 239, 3.5, 5) + rect(x - 0.5, 238, 4.5, 1.6, 'rx=".8" fill="#2b2b2e"');
  for (const x of [66, 366]) o += line(`M${x} 243V214`, "#2b2b2e", 1.6) + line(`M${x - 3} 216h6`, "#2b2b2e", 1) + circ(x, 212, 3.4, F("#3a3a3d")) + GL(x, 212, 3.4);
  o += ST("#8d8478", 506, 224, 130, 13);
  for (const x of [506, 566, 626]) o += ST("#7b7367", x, 237, 10, 13);
  o += '<path d="M516 250q25-20 50 0M576 250q25-20 50 0" fill="none" stroke="#6e675c" stroke-width="3.5"/>' + line("M506 217H636", "#4a4a47");
  for (let x = 512; x < 636; x += 12) o += line(`M${x} 224V217`, "#4a4a47", 1);
  for (const x of [536, 600]) o += line(`M${x} 217V196`, "#2b2b2e", 1.6) + circ(x, 194, 3.4, F("#3a3a3d")) + GL(x, 194, 3.4);
  return o;
}

/** A Hanseatic cog moored at the quay, flying Lübeck's white-over-red flag, with its reflection. */
export function kogge() {
  const hull = "M58 252Q60 262 70 272Q106 280 142 272Q152 264 156 248L146 252H70Z";
  let ship = PD("#5a3b2c", hull) + line("M62 258Q106 266 152 256M66 265Q106 272 148 263", "#3b2414", 0.8);
  // Castles fore and aft, with railings.
  ship += PD("#6b4a34", "M132 238H158L156 252H134Z") + PD("#6b4a34", "M54 244H76L74 254H58Z");
  ship += line("M132 238H158M54 244H76", "#3b2414", 1) + line("M136 238V233M142 238V233M148 238V233M154 238V233M134 233H156M58 244V240M64 244V240M70 244V240M56 240H74", "#3b2414", 0.7);
  // Mast, yard with the furled square sail, stays and the steering oar.
  ship += line("M106 254V164", "#2b2b2e", 2.2) + line("M84 180H128", "#2b2b2e", 1.6) + PD("#e8dcc0", "M85 180H127Q126 188 106 189Q86 188 85 180Z");
  ship += line("M106 164L56 244M106 164L158 236M106 172L76 244", "#3a3a3d", 0.45) + line("M156 250l6 16", "#3b2414", 1.6);
  ship += B("#3b2414", 103, 158, 6, 6) + B("#f4f0e6", 106, 164.5, 12, 3.4) + B("#c8322e", 106, 167.9, 12, 3.4);
  ship += circ(156, 234, 2, F("#3a3a3d")) + GL(156, 234, 2);
  const mirror = `<g opacity=".26" transform="translate(0 548) scale(1 -1)">${PD("#5a3b2c", hull)}${line("M106 254V214", "#2b2b2e", 2)}</g>`;
  return mirror + ship;
}
