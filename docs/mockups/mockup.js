// app/hub/lubeck/items.ts
var rect = (x, y, w, h, a) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" ${a}/>`;
var poly = (points, a) => `<polygon points="${points}" ${a}/>`;
var circ = (x, y, r, a) => `<circle cx="${x}" cy="${y}" r="${r}" ${a}/>`;
var ell = (x, y, rx, ry, a) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" ${a}/>`;
var line = (d, color, width = 1.5) => `<path d="${d}" stroke="${color}" stroke-width="${width}" stroke-linecap="round" fill="none"/>`;
var F = (color) => `fill="${color}"`;
var dots = (points, r, color) => points.map(([x, y]) => circ(x, y, r, F(color))).join("");
var mug = (color) => `<path d="M16 -30c13 0 13 20 0 20" fill="none" stroke="${color}" stroke-width="4"/>` + rect(-18, -38, 36, 36, `rx="6" ${F(color)}`) + ell(0, -37, 18, 4.5, F("#5a3b2c")) + '<path class="lhw-steam" d="M-6 -44c-4-6 4-8 0-15" fill="none" stroke="#f7f4ec" stroke-width="2" stroke-linecap="round"/><path class="lhw-steam" style="animation-delay:1.3s" d="M6 -44c4-6-4-8 0-15" fill="none" stroke="#f7f4ec" stroke-width="2" stroke-linecap="round"/>';
var plate = ell(0, -2, 24, 5, F("#f4f0e6")) + ell(0, -2, 16, 3, F("#e4dfd2"));
function deskItem(month2) {
  const shadow = ell(0, 0, 24, 5, 'fill="#3a2614" opacity=".4"');
  const art = {
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
    12: rect(-22, -6, 20, 6, `rx="2" ${F("#f1e3c4")}`) + rect(-20, -9, 16, 4, `rx="1.5" ${F("#b03a3a")}`) + rect(4, -34, 12, 34, `rx="2" ${F("#b03a3a")}`) + line("M10 -34v-5", "#2b2b2e") + ell(10, -45, 4, 7, `class="lhw-flame" ${F("#f5a623")}`) + ell(2, -2, 6, 3, F("#3f6b4c")) + ell(18, -2, 6, 3, F("#3f6b4c")) + circ(10, -3, 2.4, F("#d8433a"))
  };
  return shadow + (art[month2] ?? "");
}
function shelfItem(month2) {
  const art = {
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
    12: rect(-6, -18, 12, 18, F("#b03a3a")) + rect(-8, -2, 16, 2.5, F("#2b2b2e")) + rect(-5, -27, 10, 9, F("#e9c9a8")) + rect(-6, -37, 12, 10, F("#2b2b2e")) + rect(-6, -29, 12, 2.5, F("#f1c93b")) + rect(-4, -21, 8, 4, F("#f7f4ec")) + dots([[-2, -24], [2, -24]], 0.9, "#2b2b2e") + rect(-10, -17, 4, 10, F("#2f4f8a")) + rect(6, -17, 4, 10, F("#2f4f8a"))
  };
  return art[month2] ?? "";
}

// lib/lubeck/sky.ts
var LUBECK = { lat: 53.87, lon: 10.69 };
var RAD = Math.PI / 180;
var CUMULATIVE_DAYS = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
var dayOfYear = (month2, day) => CUMULATIVE_DAYS[month2 - 1] + day;
function sunTimes(doy, offsetHours) {
  const declination = -23.44 * Math.cos(2 * Math.PI / 365 * (doy + 10));
  const b = 2 * Math.PI / 365 * (doy - 81);
  const equationOfTime = 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b);
  const noon = 12 - LUBECK.lon / 15 - equationOfTime / 60 + offsetHours;
  const cosHourAngle = (Math.sin(-0.833 * RAD) - Math.sin(LUBECK.lat * RAD) * Math.sin(declination * RAD)) / (Math.cos(LUBECK.lat * RAD) * Math.cos(declination * RAD));
  const half = Math.acos(Math.max(-1, Math.min(1, cosHourAngle))) / RAD / 15;
  return { rise: noon - half, set: noon + half, noonAltitude: 90 - LUBECK.lat + declination };
}
var channels = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
function mix(a, b, t) {
  const k = Math.max(0, Math.min(1, t)), x = channels(a), y = channels(b);
  return "#" + x.map((v, i) => Math.round(v + (y[i] - v) * k).toString(16).padStart(2, "0")).join("");
}
var circular = (a, b) => {
  const d = Math.abs(a - b) % 24;
  return Math.min(d, 24 - d);
};
function skyState(hour, sun, cloud) {
  const day = hour > sun.rise && hour < sun.set;
  const edge = day ? Math.min(hour - sun.rise, sun.set - hour) : -Math.min(circular(hour, sun.rise), circular(hour, sun.set));
  const dayColor = mix("#8fc0ea", "#b3bec6", cloud), night = mix("#141c30", "#262b38", cloud), dawn = mix("#5b6191", "#6c7080", cloud), gold = mix("#eeb07c", "#b9aca4", cloud);
  const sky = edge <= -1 ? night : edge < -0.4 ? mix(night, dawn, (edge + 1) / 0.6) : edge < 0.3 ? mix(dawn, gold, (edge + 0.4) / 0.7) : edge < 1.2 ? mix(gold, dayColor, (edge - 0.3) / 0.9) : dayColor;
  return {
    day,
    edge,
    sky,
    darkness: Math.max(0, Math.min(1, (0.3 - edge) / 1.3)),
    warmth: Math.max(0, 1 - Math.abs(edge - 0.35) / 0.9) * (1 - cloud * 0.8)
  };
}
function computedMoonPhase(year, month2, day) {
  const age = ((Date.UTC(year, month2 - 1, day) - Date.UTC(2e3, 0, 6, 18, 14)) / 864e5 % 29.53 + 29.53) % 29.53;
  return age / 29.53;
}
function moonProgress(hour, riseHour, setHour) {
  if (riseHour === null || setHour === null) return null;
  const span = (setHour - riseHour + 24) % 24 || 24, since = (hour - riseHour + 24) % 24;
  return since <= span ? since / span : null;
}

// app/hub/lubeck/svg.ts
var GROUND = 250;
var R = Math.PI / 180;
var rect2 = (x, y, w, h, a) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" ${a}/>`;
var poly2 = (points, a) => `<polygon points="${points}" ${a}/>`;
var circ2 = (x, y, r, a) => `<circle cx="${x}" cy="${y}" r="${r}" ${a}/>`;
var ell2 = (x, y, rx, ry, a) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" ${a}/>`;
var line2 = (d, color, width = 1.5) => `<path d="${d}" stroke="${color}" stroke-width="${width}" stroke-linecap="round" fill="none"/>`;
var path = (d, a) => `<path d="${d}" ${a}/>`;
var F2 = (color) => `fill="${color}"`;
var B = (c, x, y, w, h) => rect2(x, y, w, h, `data-c="${c}"`);
var P = (c, points) => poly2(points, `data-c="${c}"`);
var C = (c, x, y, r) => circ2(x, y, r, `data-c="${c}"`);
var PD = (c, d) => path(d, `data-c="${c}"`);
var BR = (c, x, y, w, h) => B(c, x, y, w, h) + rect2(x, y, w, h, 'fill="url(#lhw-brick)"');
var BP = (c, points) => P(c, points) + poly2(points, 'fill="url(#lhw-brick)"');
var BD = (c, d, a = "") => path(d, `data-c="${c}" ${a}`) + path(d, `fill="url(#lhw-brick)" ${a}`);
var RP = (c, points) => P(c, points) + poly2(points, 'fill="url(#lhw-tile)"');
var ST = (c, x, y, w, h) => B(c, x, y, w, h) + rect2(x, y, w, h, 'fill="url(#lhw-stone)"');
var SH = (x, y, w, h) => rect2(x, y, w, h, 'fill="#101820" opacity=".2"');
var D = (x, y, w, h) => rect2(x, y, w, h, 'rx="1.5" fill="#1b1620"');
var L = (x, y, w, h) => D(x, y, w, h) + rect2(x, y, w, h, 'rx="1.5" class="lit" fill="#f7c66b"');
var GL = (x, y, r, c = "#f7c66b") => circ2(x, y, r, `class="lit" fill="${c}"`);
var arch = (x, y, w, h) => {
  const shoulder = y + w * 0.62;
  return `M${x} ${y + h}V${shoulder}Q${x} ${y + w * 0.18} ${x + w / 2} ${y}Q${x + w} ${y + w * 0.18} ${x + w} ${shoulder}V${y + h}Z`;
};
var DA = (x, y, w, h) => path(arch(x, y, w, h), 'fill="#1b1620"');
var LA = (x, y, w, h) => DA(x, y, w, h) + path(arch(x, y, w, h), 'class="lit" fill="#f7c66b"');
var NICHE = (x, y, w, h) => path(arch(x, y, w, h), 'fill="#2a0f0a" opacity=".22"');
var GLAZE = (x, y, w, h) => rect2(x, y, w, h, 'fill="url(#lhw-glaze)"');
var TIE = (x, y) => `<path d="M${x - 2.2} ${y}h4.4M${x} ${y - 2.2}v4.4" stroke="#1b1620" stroke-width=".9" stroke-linecap="round" opacity=".75"/>`;
function stepped(x, w, y, steps, rise) {
  let points = `${x},${GROUND} ${x},${y}`, cx = x, cy = y;
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
function volute(x, w, y, top) {
  const m = x + w / 2, h = y - top;
  return `M${x} ${GROUND}V${y}Q${x} ${y - h * 0.32} ${x + w * 0.2} ${y - h * 0.36}Q${x + w * 0.3} ${y - h * 0.4} ${x + w * 0.3} ${y - h * 0.62}Q${x + w * 0.3} ${top} ${m} ${top}Q${x + w * 0.7} ${top} ${x + w * 0.7} ${y - h * 0.62}Q${x + w * 0.7} ${y - h * 0.4} ${x + w * 0.8} ${y - h * 0.36}Q${x + w} ${y - h * 0.32} ${x + w} ${y}V${GROUND}Z`;
}
function bell(x, w, y, top) {
  const m = x + w / 2, h = y - top;
  return `M${x} ${GROUND}V${y}C${x + w * 0.04} ${y - h * 0.45} ${x + w * 0.3} ${y - h * 0.4} ${x + w * 0.3} ${y - h * 0.7}C${x + w * 0.3} ${top - h * 0.05} ${m - w * 0.08} ${top} ${m} ${top}C${m + w * 0.08} ${top} ${x + w * 0.7} ${top - h * 0.05} ${x + w * 0.7} ${y - h * 0.7}C${x + w * 0.7} ${y - h * 0.4} ${x + w * 0.96} ${y - h * 0.45} ${x + w} ${y}V${GROUND}Z`;
}
function seeded(seed) {
  let s = seed;
  return () => (s = s * 16807 % 2147483647) / 2147483647;
}

// app/hub/lubeck/town.ts
var COPPER = "#6a9c88";
var COPPER_DARK = "#4f7f6d";
var SLATE = "#4a5661";
var BAND = "#d9b48c";
var GOLD = "#c9a24a";
function spire(c, x, w, top, apex, crown = false) {
  let o = B(c, x, top, w, GROUND - top) + P(c, `${x - 1.5},${top} ${x + w / 2},${apex} ${x + w + 1.5},${top}`);
  if (crown) o += P(c, `${x - 2},${top} ${x},${top - 9} ${x + 2},${top}`) + P(c, `${x + w - 2},${top} ${x + w},${top - 9} ${x + w + 2},${top}`);
  return o;
}
function farLayer() {
  const rnd = seeded(23);
  const c = "#7f8c9c";
  let o = `<polygon data-c="${c}" points="44,${GROUND}`;
  for (let x = 44; x <= 636; x += 10) o += ` ${x},${208 + Math.round(rnd() * 10)} ${x + 5},${196 + Math.round(rnd() * 12)}`;
  o += ` 636,${GROUND}"/>`;
  o += spire(c, 66, 9, 150, 92) + spire(c, 80, 9, 150, 92) + P(c, "60,176 77,160 96,176");
  o += spire(c, 120, 8, 170, 124);
  o += spire(c, 260, 12, 122, 64, true);
  o += spire(c, 398, 10, 142, 90, true);
  o += P(c, "620,190 626,170 632,190") + line2("M600 196V170h18", c, 1.3);
  return o;
}
function townHouse(kind, x, w, top, wall) {
  const eaves = top + 26;
  let o = kind === "stepped" ? BP(wall, stepped(x, w, eaves, 3, 8.6)) : kind === "volute" ? BD(wall, volute(x, w, eaves, top)) : BP(wall, `${x},${GROUND} ${x},${eaves} ${x + w / 2},${top} ${x + w},${eaves} ${x + w},${GROUND}`);
  o += NICHE(x + w / 2 - 2, top + 8, 4, 14) + GLAZE(x, eaves, w, 3);
  for (let r = 0; r < 4; r++) for (let k = 0; k < 2; k++) o += ((r + k + x) % 4 === 0 ? L : D)(x + 3.5 + k * (w - 11), eaves + 7 + r * 11, 4, 7);
  return o + SH(x + w - 4, eaves, 4, GROUND - eaves);
}
function midLayer() {
  let o = townHouse("stepped", 362, 19, 150, "#a85a44") + townHouse("volute", 381, 19, 146, "#d9c7a3") + townHouse("stepped", 400, 20, 156, "#9c4a3a") + townHouse("plain", 420, 20, 160, "#c9b79a");
  const wall = "#6b3d33";
  const holes = [[458, 142], [492, 142]].map(([x, y]) => `M${x - 6} ${y}a6 6 0 1 0 12 0a6 6 0 1 0 -12 0Z`).join("");
  const shield = `M442 ${GROUND}V122H510V${GROUND}Z${holes}`;
  o += BD(wall, shield, 'fill-rule="evenodd"') + path(shield, 'fill-rule="evenodd" fill="url(#lhw-glaze)" opacity=".55"');
  for (const x of [447, 459, 471, 483, 495]) o += NICHE(x, 160, 8, 34);
  for (let i = 0; i < 9; i++) o += NICHE(444 + i * 7.4, 126, 4.6, 8);
  [[442, 104, 86], [459, 108, 92], [474, 98, 78], [489, 108, 92], [506, 104, 86]].forEach(([x, top, apex]) => {
    o += B(wall, x - 2, top, 5, 122 - top) + P(COPPER, `${x - 3},${top} ${x + 0.5},${apex} ${x + 4},${top}`) + circ2(x + 0.5, apex - 2, 1.2, F2(GOLD));
  });
  o += B(COPPER, 442, 120, 68, 2.5);
  const brick = "#a65a45";
  o += BR(brick, 516, 116, 22, 134) + BR(brick, 546, 116, 22, 134) + BR(brick, 538, 150, 8, 100);
  for (const x of [516, 546]) {
    o += P(COPPER, `${x - 3},116 ${x + 11},34 ${x + 25},116`) + poly2(`${x + 11},34 ${x + 15},116 ${x + 25},116`, 'fill="#101820" opacity=".22"');
    o += line2(`M${x + 11} 34V24`, "#2b2b2e", 1.2) + circ2(x + 11, 23, 1.8, F2(GOLD));
    o += BP(brick, `${x - 1},117 ${x + 5.5},105 ${x + 12},117`) + BP(brick, `${x + 10},117 ${x + 16.5},105 ${x + 23},117`);
    o += circ2(x + 11, 132, 4, F2("#2b2b2e")) + C(GOLD, x + 11, 132, 3.2) + line2(`M${x + 11} 132v-2.4M${x + 11} 132h1.8`, "#2b2b2e", 0.7);
    for (const y of [146, 182]) o += DA(x + 4, y, 5, 22) + DA(x + 13, y, 5, 22);
    o += B(BAND, x, 172, 22, 2.5) + B(BAND, x, 140, 22, 2);
    o += SH(x + 16, 116, 6, 134);
  }
  o += BR("#9c513d", 568, 168, 68, 82) + RP(COPPER, "566,168 578,140 636,140 636,168");
  o += B(COPPER_DARK, 598, 124, 4, 16) + P(COPPER, "596,124 600,104 604,124");
  for (let i = 0; i < 5; i++) {
    const x = 572 + i * 13;
    o += DA(x + 2, 178, 6, 38) + line2(`M${x + 5} 182V216M${x + 2} 196h6`, "#3a3434", 0.6) + rect2(x, 214, 10, 36, 'fill="#101820" opacity=".12"');
    o += BR("#8f4636", x - 2.5, 172, 3.5, 78) + P("#8f4636", `${x - 3},172 ${x - 0.75},164 ${x + 1.5},172`);
  }
  return o;
}
function holstenTower(x0, k) {
  const cone = `${x0 - 5},130 ${x0 + 35},50 ${x0 + 75},130`;
  let o = BR("#9a4a38", x0, 130, 70, 120) + rect2(x0, 130, 70, 120, 'fill="url(#lhw-cyl)"');
  o += RP(SLATE, cone) + poly2(cone, 'fill="url(#lhw-cone)"');
  for (const [dx, y] of [[22, 104], [44, 104], [33, 82]]) o += P(SLATE, `${x0 + dx - 4},${y + 6} ${x0 + dx},${y - 2} ${x0 + dx + 4},${y + 6}`) + D(x0 + dx - 1.5, y + 1.5, 3, 4.5);
  o += line2(`M${x0 - 5} 130H${x0 + 75}`, "#2b2b2e", 1.2) + line2(`M${x0 + 35} 50V38`, "#2b2b2e") + circ2(x0 + 35, 36, 2.6, F2(GOLD));
  for (const y of [158, 194]) o += B(BAND, x0, y, 70, 6) + rect2(x0, y, 70, 6, 'fill="url(#lhw-frieze)"');
  for (const y of [144, 228]) o += B(BAND, x0, y, 70, 2.5);
  for (let i = 0; i < 9; i++) o += D(x0 + 3 + i * 7.4, 134, 4, 6);
  [[148, 9], [167, 22], [203, 22]].forEach(([y, h], r) => {
    for (let i = 0; i < 7; i++) o += ((i + r + k) % 5 === 0 ? LA : DA)(x0 + 5 + i * 9, y, 5, h);
  });
  for (let i = 0; i < 4; i++) o += C("#c9a982", x0 + 12 + i * 15, 236, 3.8) + circ2(x0 + 12 + i * 15, 236, 2.6, 'fill="#1b1620"');
  return o + ST("#7e3b2d", x0, 240, 70, 10);
}
function saltStores() {
  const heights = [62, 74, 58, 72, 60, 70];
  const bricks = ["#a5523f", "#8a4234", "#b0604a", "#9c4a3a", "#a85a44", "#8f4636"];
  const kinds = ["stepped", "volute", "stepped", "bell", "stepped", "volute"];
  let o = "";
  for (let i = 0; i < 6; i++) {
    const x = 378 + i * 21, w = 20, top = GROUND - heights[i], eaves = top + 18;
    o += kinds[i] === "stepped" ? BP(bricks[i], stepped(x, w, eaves, 2, 9)) : kinds[i] === "volute" ? BD(bricks[i], volute(x, w, eaves, top)) : BD(bricks[i], bell(x, w, eaves, top));
    o += GLAZE(x, eaves, w, 2.5) + NICHE(x + 8, top + 5, 4, 9);
    o += line2(`M${x + 10} ${top + 4}h5`, "#2b2b2e", 1.4) + line2(`M${x + 14.5} ${top + 4}v9`, "#3a3a3d", 0.5);
    for (let r = 0; r < 4; r++) {
      const y = eaves + 6 + r * 11;
      if (y > GROUND - 14) break;
      o += B("#3f5a48", x + 7.5, y, 5, 8) + line2(`M${x + 10} ${y}v8`, "#1b1620", 0.5);
      o += ((i * 2 + r) % 5 === 0 ? L : D)(x + 2, y + 1, 4, 6) + ((i + r) % 4 === 0 ? L : D)(x + 14, y + 1, 4, 6);
    }
    o += DA(x + 6, 236, 8, 14) + TIE(x + 4, eaves + 4) + TIE(x + 16, eaves + 4) + SH(x + 16, eaves, 4, GROUND - eaves);
  }
  return o;
}
function frontLayer() {
  let o = BP("#b0604a", stepped(52, 46, 172, 3, 9)) + GLAZE(52, 172, 46, 3);
  for (const [x, y, h] of [[60, 160, 10], [73, 150, 20], [86, 160, 10]]) o += NICHE(x, y, 5, h);
  o += circ2(75.5, 162, 2.6, 'fill="#1b1620"');
  for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) o += ((r + c) % 3 === 0 ? LA : DA)(60 + c * 12, 179 + r * 14, 6, 10);
  o += TIE(56, 176) + TIE(94, 176) + DA(69, 232, 12, 18) + SH(92, 172, 6, 78);
  const white = "#ebe2cd", trim = "#cfc1a3";
  o += PD(white, volute(100, 44, 190, 166)) + P(white, "112,168 122,154 132,168") + P(trim, "112,168 122,154 132,168 130,168 122,156.5 114,168");
  o += B(trim, 100, 188, 44, 3) + B(trim, 112, 167, 20, 2) + B(trim, 98, 248, 48, 2) + ell2(122, 178, 3.4, 4.4, 'fill="#1b1620"') + circ2(122, 152.5, 1.6, F2(GOLD));
  for (const x of [101, 141]) o += B(trim, x, 191, 2, 57);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    const x = 106 + c * 13, y = 196 + r * 15;
    o += B("#f6f1e4", x - 1, y - 1, 8, 12) + ((r * 2 + c) % 4 === 1 ? L : D)(x, y, 6, 10) + B("#b9ab8c", x - 1.5, y + 10.5, 9, 1.4);
  }
  o += B("#5f3b2a", 116, 236, 12, 14) + B("#d8cbb0", 113, 233, 18, 3) + SH(138, 190, 6, 60);
  o += holstenTower(150, 0) + holstenTower(290, 1);
  o += BP("#a5523f", stepped(220, 70, 142, 3, 13)) + GLAZE(220, 142, 70, 3);
  for (const [x, y, h] of [[230, 126, 14], [242, 112, 28], [252, 104, 36], [262, 112, 28], [274, 126, 14]]) o += NICHE(x, y, 6, h);
  o += P(SLATE, "226,129 231,114 236,129") + P(SLATE, "250,103 255,84 260,103") + P(SLATE, "274,129 279,114 284,129");
  o += B(BAND, 220, 150, 70, 3) + B(BAND, 220, 162, 70, 5) + rect2(220, 162, 70, 5, 'fill="url(#lhw-frieze)"');
  o += B("#e8d3a0", 220, 176, 70, 9) + `<text data-c="#6b4a1e" x="255" y="183" text-anchor="middle" font-family="Georgia, serif" font-size="5.2" textLength="64" lengthAdjust="spacingAndGlyphs">CONCORDIA DOMI FORIS PAX</text>`;
  for (let i = 0; i < 5; i++) o += DA(227 + i * 12, 152, 6, 9) + (i % 2 ? LA : DA)(227 + i * 12, 188, 6, 15);
  o += B(BAND, 220, 208, 70, 3) + D(250, 112, 10, 16);
  o += '<path d="M239 250V228Q239 210 255 206Q271 210 271 228V250Z" fill="#17131c"/>';
  o += '<path d="M239 228Q239 210 255 206Q271 210 271 228" fill="none" stroke="#e8d3a0" stroke-width="2.5"/>';
  o += '<path d="M243 216V250M249 210V250M255 208V250M261 210V250M267 216V250M240 224H270M239 234H271" stroke="#3a3434" stroke-width=".7" opacity=".8"/>';
  o += saltStores();
  o += '<g data-p="trees"></g>' + ST("#8d8478", 44, 243, 462, 7) + B("#6e675c", 44, 249, 462, 1.5);
  for (const x of [92, 196, 344, 470]) o += B("#2b2b2e", x, 239, 3.5, 5) + rect2(x - 0.5, 238, 4.5, 1.6, 'rx=".8" fill="#2b2b2e"');
  for (const x of [66, 366]) o += line2(`M${x} 243V214`, "#2b2b2e", 1.6) + line2(`M${x - 3} 216h6`, "#2b2b2e", 1) + circ2(x, 212, 3.4, F2("#3a3a3d")) + GL(x, 212, 3.4);
  o += ST("#8d8478", 506, 224, 130, 13);
  for (const x of [506, 566, 626]) o += ST("#7b7367", x, 237, 10, 13);
  o += '<path d="M516 250q25-20 50 0M576 250q25-20 50 0" fill="none" stroke="#6e675c" stroke-width="3.5"/>' + line2("M506 217H636", "#4a4a47");
  for (let x = 512; x < 636; x += 12) o += line2(`M${x} 224V217`, "#4a4a47", 1);
  for (const x of [536, 600]) o += line2(`M${x} 217V196`, "#2b2b2e", 1.6) + circ2(x, 194, 3.4, F2("#3a3a3d")) + GL(x, 194, 3.4);
  return o;
}
function kogge() {
  const hull = "M58 252Q60 262 70 272Q106 280 142 272Q152 264 156 248L146 252H70Z";
  let ship = PD("#5a3b2c", hull) + line2("M62 258Q106 266 152 256M66 265Q106 272 148 263", "#3b2414", 0.8);
  ship += PD("#6b4a34", "M132 238H158L156 252H134Z") + PD("#6b4a34", "M54 244H76L74 254H58Z");
  ship += line2("M132 238H158M54 244H76", "#3b2414", 1) + line2("M136 238V233M142 238V233M148 238V233M154 238V233M134 233H156M58 244V240M64 244V240M70 244V240M56 240H74", "#3b2414", 0.7);
  ship += line2("M106 254V164", "#2b2b2e", 2.2) + line2("M84 180H128", "#2b2b2e", 1.6) + PD("#e8dcc0", "M85 180H127Q126 188 106 189Q86 188 85 180Z");
  ship += line2("M106 164L56 244M106 164L158 236M106 172L76 244", "#3a3a3d", 0.45) + line2("M156 250l6 16", "#3b2414", 1.6);
  ship += B("#3b2414", 103, 158, 6, 6) + B("#f4f0e6", 106, 164.5, 12, 3.4) + B("#c8322e", 106, 167.9, 12, 3.4);
  ship += circ2(156, 234, 2, F2("#3a3a3d")) + GL(156, 234, 2);
  const mirror = `<g opacity=".26" transform="translate(0 548) scale(1 -1)">${PD("#5a3b2c", hull)}${line2("M106 254V214", "#2b2b2e", 2)}</g>`;
  return mirror + ship;
}

// app/hub/lubeck/scene.ts
var WEATHER_TILE = 340;
var LANDSCAPE_TILE = 700;
var SKELETON = `
<defs>
<clipPath id="lhw-clip"><rect x="44" y="24" width="592" height="302"/></clipPath>
<clipPath id="lhw-river-clip"><rect x="44" y="250" width="592" height="76"/></clipPath>
<pattern id="lhw-brick" width="10" height="6" patternUnits="userSpaceOnUse"><path d="M0 .3H10M0 3.3H10M2 .3V3.3M7 3.3V6" stroke="#2a0f0a" stroke-opacity=".26" stroke-width=".6" fill="none"/></pattern>
<pattern id="lhw-tile" width="6" height="4" patternUnits="userSpaceOnUse"><path d="M0 4q3-4.5 6 0" stroke="#1a0c08" stroke-opacity=".34" stroke-width=".7" fill="none"/></pattern>
<pattern id="lhw-stone" width="16" height="8" patternUnits="userSpaceOnUse"><path d="M0 .3H16M0 4.3H16M5 .3V4.3M12 4.3V8" stroke="#2c2c2a" stroke-opacity=".22" stroke-width=".6" fill="none"/></pattern>
<pattern id="lhw-glaze" width="6" height="6" patternUnits="userSpaceOnUse"><path d="M3 .4L5.6 3L3 5.6L.4 3Z" fill="#1d1418" fill-opacity=".34"/></pattern>
<pattern id="lhw-frieze" width="8" height="6" patternUnits="userSpaceOnUse"><circle cx="4" cy="3" r="1.7" fill="#1d1418" fill-opacity=".42"/><path d="M0 3h1.6M6.4 3H8" stroke="#1d1418" stroke-opacity=".4" stroke-width=".8"/></pattern>
<linearGradient id="lhw-cyl"><stop offset="0" stop-color="#000" stop-opacity=".3"/><stop offset=".28" stop-color="#fff" stop-opacity=".1"/><stop offset=".5" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".42"/></linearGradient>
<linearGradient id="lhw-cone"><stop offset="0" stop-color="#000" stop-opacity=".12"/><stop offset=".38" stop-color="#fff" stop-opacity=".12"/><stop offset=".62" stop-color="#000" stop-opacity=".1"/><stop offset="1" stop-color="#000" stop-opacity=".45"/></linearGradient>
<linearGradient id="lhw-glow" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity=".3"/></linearGradient>
<linearGradient id="lhw-depth" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".3"/></linearGradient>
<pattern id="lhw-wood" width="220" height="42" patternUnits="userSpaceOnUse"><path d="M0 6c40-4 70 5 110 1s70-5 110-1M0 14c50 5 80-4 120 0s60 4 100 0M0 22c30-3 90 4 130 0s50-3 90 0M0 31c60 4 70-5 120-1s60 5 100 1M0 38c40-2 100 3 140 0s40-2 80 0" stroke="#3b2410" stroke-opacity=".32" stroke-width=".9" fill="none"/></pattern>
</defs>
<g clip-path="url(#lhw-clip)">
<rect data-p="sky" x="44" y="24" width="592" height="302" fill="#b7c3cc"/>
<rect data-p="glow" x="44" y="24" width="592" height="228" fill="url(#lhw-glow)"/>
<rect data-p="horizon" x="44" y="170" width="592" height="82" fill="#f6c68e" opacity="0"/>
<g data-p="stars"></g>
<circle data-p="sun" cx="340" cy="120" r="15" fill="#fbe7a8"/>
<g data-p="moon"><circle cx="0" cy="0" r="12" fill="#f3efd9"/><circle data-p="moon-shadow" cx="0" cy="0" r="12" fill="#141c30"/></g>
<g data-p="fireworks"></g>
<g data-p="clouds-high" class="lhw-cloud-a"></g>
<g data-p="birds" class="lhw-bird" fill="none" stroke="#3a3a3d" stroke-width="1.4" stroke-linecap="round"><path d="M0 90q5-6 9 0q5-6 9 0M34 78q4-5 8 0q4-5 8 0M22 104q4-5 7 0q4-5 7 0"/></g>
<g id="lhw-scene"><g data-p="far" data-l="0.62"></g><g data-p="clouds-low" class="lhw-cloud-b"></g><g data-p="mid" data-l="0.32"></g><g data-p="front" data-l="0"></g><g data-p="decor" data-l="0"></g></g>
<rect data-p="river" x="44" y="250" width="592" height="76" fill="#7f97a6"/>
<g opacity=".44"><use href="#lhw-scene" transform="translate(0,500) scale(1,-1)"/></g>
<rect data-p="veil" x="44" y="250" width="592" height="76" fill="#7f97a6" opacity=".3"/>
<rect x="44" y="250" width="592" height="76" fill="url(#lhw-depth)"/>
<g data-p="ripples" clip-path="url(#lhw-river-clip)"></g>
<g data-p="water"></g>
<rect data-p="fog" x="44" y="24" width="592" height="302" fill="#dfe4e6" opacity="0"/>
<g data-p="branch" class="lhw-sway"></g>
<g data-p="falling"></g>
<g data-p="rain"></g>
<g data-p="snow"></g>
</g>
<rect x="40" y="20" width="600" height="310" fill="none" stroke="#1f1f22" stroke-width="8"/>
<rect x="30" y="330" width="620" height="13" fill="#7c5c3c"/><rect x="30" y="330" width="620" height="13" fill="url(#lhw-wood)"/>
<g data-p="pot"></g>`;
function staticLayers() {
  const rnd = seeded(11);
  const repeatAcross = (markup) => `<g transform="translate(-${LANDSCAPE_TILE})">${markup}</g>${markup}`;
  let stars = "";
  for (let i = 0; i < 44; i++) stars += circ2((50 + rnd() * 580).toFixed(0), (30 + rnd() * 120).toFixed(0), (0.8 + rnd()).toFixed(1), F2("#ffffff"));
  const cloud = (list) => list.map((c) => ell2(c[0], c[1], c[2], c[3], "")).join("");
  const cloudsHigh = cloud([[110, 62, 52, 13], [156, 52, 36, 11], [84, 70, 30, 8], [360, 48, 58, 14], [412, 58, 40, 10], [560, 70, 50, 12], [606, 60, 30, 9]]);
  const cloudsLow = cloud([[230, 108, 44, 9], [270, 100, 30, 8], [470, 118, 48, 9], [150, 128, 36, 7]]);
  const far = farLayer(), mid = midLayer(), front = frontLayer();
  const rippleLayers = ["", ""];
  for (let i = 0; i < 34; i++) {
    const x = 50 + rnd() * 570, y = 256 + rnd() * 66, w = 10 + rnd() * 40;
    rippleLayers[i % 2] += `<path d="M${x.toFixed(0)} ${y.toFixed(0)}q${(w / 2).toFixed(0)} -2 ${w.toFixed(0)} 0" stroke="#ffffff" stroke-opacity="${(0.12 + rnd() * 0.19).toFixed(2)}" stroke-width="1.4" stroke-linecap="round" fill="none"/>`;
  }
  const ripples = rippleLayers.map((layer, i) => `<g class="lhw-ripple" style="--lhw-duration:${i ? 142 : 96}s;--lhw-delay:${i ? -18 : -7}s">${repeatAcross(layer)}</g>`).join("");
  const precipitation = (kind, layer, count, seconds) => {
    const id = `lhw-${kind}-${layer}`;
    let particles = "";
    for (let i = 0; i < count; i++) {
      const x = (rnd() * 760).toFixed(1);
      const y = (18 + rnd() * (WEATHER_TILE - 36)).toFixed(1);
      const opacity = (0.32 + rnd() * (layer ? 0.5 : 0.32)).toFixed(2);
      particles += kind === "rain" ? `<path d="M${x} ${y}v${(7 + rnd() * (layer ? 12 : 7)).toFixed(1)}" stroke="#e6eef3" stroke-opacity="${opacity}" stroke-width="${layer ? 1.1 : 0.8}" stroke-linecap="round"/>` : circ2(x, y, (0.65 + rnd() * (layer ? 1.85 : 0.8)).toFixed(1), `fill="#fff" opacity="${opacity}"`);
    }
    return `<defs><pattern id="${id}" width="760" height="${WEATHER_TILE}" patternUnits="userSpaceOnUse">${particles}</pattern></defs><g transform="skewX(${kind === "rain" ? -13 : layer ? 6 : 3})"><g class="lhw-${kind}" style="--lhw-duration:${seconds}s;--lhw-delay:${-seconds * (layer ? 0.61 : 0.27)}s">` + rect2(-100, -WEATHER_TILE, 880, WEATHER_TILE * 2, `fill="url(#${id})"`) + "</g></g>";
  };
  const rain = precipitation("rain", 0, 48, 5.2) + precipitation("rain", 1, 42, 3.8);
  const snow = precipitation("snow", 0, 46, 26) + precipitation("snow", 1, 34, 18);
  return { stars, "clouds-high": repeatAcross(cloudsHigh), "clouds-low": repeatAcross(cloudsLow), far, mid, front, ripples, rain, snow };
}
var swan = (x, y, k) => `<g transform="translate(${x} ${y}) scale(${k})"><g class="lhw-bob">${ell2(0, 0, 9, 3.8, 'data-c="#f7f4ec"')}${poly2("-9,-1 -14,-4 -8,2", 'data-c="#f7f4ec"')}${line2("M6 -1q5-8 1-13", "#f7f4ec", 2.4)}${line2("M7 -14l4 1.2", "#e08a3a", 1.8)}${line2("M-22 3h10M-18 6h14", "#ffffff", 1)}</g></g>`;
var duck = (x, y, k) => `<g transform="translate(${x} ${y}) scale(${-k} ${k})"><g class="lhw-bob" style="animation-delay:${x % 3 * 0.4}s">${ell2(0, 0, 6, 3, 'data-c="#8a6b4a"')}${circ2(6, -4, 2.8, 'data-c="#2f6b4f"')}${line2("M8.5 -4l3.5 .6", "#e0a03a", 1.6)}${line2("M-16 3h9", "#ffffff", 1)}</g></g>`;
var sail = (x, y, k, color = "#f1eee6") => `<g transform="translate(${x} ${y}) scale(${k})"><g class="lhw-boat"><path data-c="#5a3b2c" d="M-30 0h62l-8 12h-46z"/>${line2("M0 0V-38", "#2b2b2e", 1.6)}${P(color, "2,-36 2,-2 28,-2")}${P("#e2d8c2", "-2,-28 -2,-2 -20,-2")}</g></g>`;
function cityDecor(month2, day, night) {
  let o = "", boats = "";
  const snow = month2 === 12 || month2 <= 2;
  const flags = ["#e24b4a", "#f1c93b", "#3f8ad0", "#4fa85a", "#d86ab0"];
  if (snow) o += B("#ffffff", 44, 241, 462, 3) + B("#ffffff", 506, 222, 130, 3) + P("#ffffff", "177,66 185,50 193,66") + P("#ffffff", "317,66 325,50 333,66");
  if (month2 === 1) {
    o += C("#f7f4ec", 80, 236.5, 6.5) + C("#f7f4ec", 80, 226, 4.8) + C("#f7f4ec", 80, 218.5, 3.4);
    o += B("#2b2b2e", 76, 214.6, 8, 1.3) + B("#2b2b2e", 77.4, 208.6, 5.2, 6.2) + B("#c8322e", 76.6, 222, 6.8, 2) + B("#c8322e", 81.5, 222, 2, 6);
    o += P("#e08a2e", "80.6,218.4 85.6,219.2 80.6,220") + C("#2b2b2e", 79, 217.4, 0.5) + C("#2b2b2e", 81.6, 217.4, 0.5);
    o += line2("M75.6 226l-7-5M84.4 226l6-6", "#5a3b2c", 1);
    if (day <= 6)
      [[298, "#2f4f8a", 15], [310, "#8a3a4a", 12], [322, "#3f6b4c", 13]].forEach(([x, coat, h], i) => {
        const cx = x, top = 243 - h;
        o += B(coat, cx - 3, top + 2, 6, h - 2) + C("#e9c9a8", cx, top - 0.5, 2.5);
        o += P("#e2b13c", `${cx - 2.6},${top - 2.4} ${cx - 2.6},${top - 5.2} ${cx - 1.3},${top - 3.6} ${cx},${top - 5.6} ${cx + 1.3},${top - 3.6} ${cx + 2.6},${top - 5.2} ${cx + 2.6},${top - 2.4}`);
        if (i === 0) {
          o += line2(`M${cx + 3} ${top + 4}L${cx + 6} 202`, "#5a3b2c", 1.1);
          o += poly2(`${cx + 6},194 ${cx + 7.8},199.4 ${cx + 13.4},199.4 ${cx + 8.9},202.8 ${cx + 10.6},208.2 ${cx + 6},205 ${cx + 1.4},208.2 ${cx + 3.1},202.8 ${cx - 1.4},199.4 ${cx + 4.2},199.4`, F2("#f1c93b")) + GL(cx + 6, 201.6, 2.4, "#fff3c4");
        }
      });
  }
  if (month2 === 2) {
    for (let i = 0; i < 24; i++) {
      const x = 70 + i * 12.3, y = 216 + Math.sin(i / 23 * Math.PI) * 9;
      o += P(flags[i % 5], `${x},${y} ${x + 8},${y} ${x + 4},${y + 8}`);
    }
    o += line2("M66 214q150 22 300 0", "#3a3a3d", 0.8);
  }
  if (month2 === 3) for (let i = 0; i < 30; i++) o += C(["#8a5ad0", "#f1c93b", "#ffffff"][i % 3], 50 + i * 15 + i % 2 * 4, 241.5, 1.5);
  if (month2 === 4) {
    const eggs = ["#e24b4a", "#f1c93b", "#6aa7c9", "#d86ab0", "#7ac06a"];
    for (const x of [136, 372, 498])
      for (let i = 0; i < 7; i++) {
        const ex = x - 16 + i * 5.4, ey = 206 + i * 7 % 14;
        o += line2(`M${ex} ${ey - 5}v3`, "#3a3a3d", 0.6) + `<ellipse data-c="${eggs[i % 5]}" cx="${ex}" cy="${ey}" rx="2.2" ry="3"/>`;
      }
    for (let i = 0; i < 10; i++) o += `<ellipse data-c="${eggs[i % 5]}" cx="${514 + i * 12.5}" cy="221" rx="2" ry="2.8"/>`;
  }
  if (month2 === 5) {
    o += B("#f4f0e6", 352, 150, 3, 94);
    for (let i = 0; i < 8; i++) o += B(i % 2 ? "#3f6fc0" : "#f4f0e6", 352, 150 + i * 11.75, 3, 6);
    o += '<ellipse cx="353.5" cy="164" rx="14" ry="5" fill="none" stroke="#3f8a4f" stroke-width="3.5"/>';
    ["#e24b4a", "#f1c93b", "#3f8ad0", "#f7f4ec"].forEach((c, i) => o += line2(`M${341 + i * 8.4} 166q${i < 2 ? -4 : 4} 14 ${i < 2 ? -7 : 7} 24`, c, 1.6));
    o += P("#3f8a4f", "346,150 353.5,136 361,150");
  }
  if (month2 === 6 || month2 === 7) {
    const fleet = month2 === 7 ? [[110, 286, 0.6, 0], [300, 276, 0.5, 1], [540, 296, 0.7, 2], [250, 306, 0.8, 4]] : [[120, 284, 0.55, 3], [560, 292, 0.6, 3]];
    for (const [x, y, k, c] of fleet) boats += sail(x, y, k, ["#e24b4a", "#f1c93b", "#3f8ad0", "#f7f4ec", "#4fa85a"][c]);
    if (month2 === 7) {
      for (let i = 0; i < 11; i++) {
        const x = 508 + i * 11.6;
        o += P(flags[i % 5], `${x},205 ${x + 7},205 ${x + 3.5},212`);
      }
      o += line2("M506 204H636", "#3a3a3d", 0.8);
    }
  }
  if (month2 === 8) {
    for (const [x, roof] of [[80, "#e24b4a"], [310, "#3f8ad0"]]) {
      o += B("#e9dcc0", x, 224, 40, 19) + P(roof, `${x - 5},224 ${x + 20},208 ${x + 45},224`);
      for (let i = 0; i < 4; i++) o += P("#f7f4ec", `${x + 1 + i * 12.5},224 ${x + 20},208 ${x + 5 + i * 12.5},224`);
      o += D(x + 6, 230, 28, 9);
    }
    for (let i = 0; i < 26; i++) o += GL(70 + i * 11.6, 206 + Math.sin(i / 25 * Math.PI) * 8, 1.8, ["#f7c66b", "#f09595", "#9fe1cb"][i % 3]);
    o += line2("M66 204q150 20 300 0", "#3a3a3d", 0.7);
  }
  if (month2 === 9) {
    o += '<path d="M255 196a12 12 0 1 1 .1 0" fill="none" stroke="#d9a53a" stroke-width="5"/>';
    for (const a of [0, 60, 120, 180, 240, 300]) o += C(a % 120 ? "#c8433a" : "#e08a2e", 255 + Math.cos(a * R) * 12, 184 + Math.sin(a * R) * 12, 2.4);
    for (const [x, y] of [[90, 238], [330, 238], [344, 239]]) o += `<ellipse data-c="#d9b04a" cx="${x}" cy="${y}" rx="9" ry="6"/>` + line2(`M${x - 5} ${y - 3}q5 3 10 0`, "#8a6a2a", 0.8);
  }
  if (month2 === 10) {
    [[185, 36], [325, 36], [536, 194], [600, 194]].forEach(([x, top], i) => {
      const big = i < 2, w = big ? 16 : 10, h = big ? 3.4 : 2.2, y = top - (big ? 18 : 14);
      o += line2(`M${x} ${top}V${y}`, "#2b2b2e", 1) + B("#1f1f22", x, y, w, h) + B("#d8322e", x, y + h, w, h) + B("#f1c93b", x, y + 2 * h, w, h);
    });
    for (const [x, y] of [[84, 240], [96, 241], [350, 240]]) o += `<ellipse data-c="#e08a2e" cx="${x}" cy="${y}" rx="5.5" ry="4"/>` + B("#5f6b3a", x - 0.8, y - 6, 1.6, 3);
  }
  if (month2 === 11) {
    for (let i = 0; i < 9; i++) {
      const x = 78 + i * 30, h = i % 3 === 0 ? 15 : 10, coat = ["#2f4f8a", "#8a3a4a", "#3f6b4c", "#6b4a8a"][i % 4];
      o += B(coat, x - 2.5, 243 - h, 5, h - 3) + C("#e9c9a8", x, 241 - h - 1.5, 2.4) + line2(`M${x + 3} ${240 - h + 4}l6-7`, "#3a3a3d", 0.8);
      o += circ2(x + 9.5, 229 - h + 5, 3.4, F2(["#e89a3a", "#e2504a", "#f1c93b"][i % 3])) + GL(x + 9.5, 229 - h + 5, 3.4, "#ffe7a8");
    }
  }
  if (month2 === 12) {
    for (const [x, roof] of [[70, "#b03a3a"], [112, "#3f6b4c"], [300, "#b03a3a"], [338, "#3f6b4c"]]) {
      o += B("#7a5236", x, 226, 34, 17) + P(roof, `${x - 4},226 ${x + 17},212 ${x + 38},226`);
      o += P("#ffffff", `${x - 4},226 ${x + 17},212 ${x + 38},226 ${x + 34},224 ${x + 17},215 ${x},224`) + L(x + 5, 230, 24, 8);
      for (let i = 0; i < 5; i++) o += GL(x + 1 + i * 8, 227.5, 1.5, i % 2 ? "#f7c66b" : "#f09595");
    }
    o += P("#2f5a3c", "205,243 222,170 239,243") + P("#3f6b4c", "209,224 222,170 235,224") + P("#4f8a5c", "213,202 222,170 231,202") + B("#5a3b2c", 220, 243, 4, 4);
    for (let i = 0; i < 14; i++) o += GL(211 + i * 37 % 22, 186 + i * 4, 1.7, ["#f7c66b", "#e24b4a", "#85b7eb"][i % 3]);
    o += poly2("222,160 224,166 230,166 225,170 227,176 222,172 217,176 219,170 214,166 220,166", F2("#f1c93b"));
    for (let i = 0; i < 20; i++) o += GL(380 + i * 6.4, 238 - Math.sin(i / 19 * Math.PI) * 5, 1.6, i % 2 ? "#f7c66b" : "#9fe1cb");
  }
  let water = kogge() + boats + sail(434, 290, 1);
  water += `<g class="lhw-swim-right">${swan(0, 292, 1.1)}${swan(-26, 298, 0.8)}${swan(-44, 295, 0.5)}${swan(-56, 299, 0.5)}</g>`;
  water += `<g class="lhw-swim-left">${duck(0, 312, 1)}${duck(18, 316, 0.8)}${duck(32, 311, 0.8)}</g>`;
  let fireworks = "";
  if (night && (month2 === 12 && day === 31 || month2 === 1 && day === 1))
    for (const [x, y, color, delay] of [[150, 90, "#f7c66b", 0], [330, 70, "#e24b4a", 0.9], [470, 100, "#85b7eb", 1.7], [250, 120, "#9fe1cb", 1.2]])
      fireworks += `<g class="lhw-firework" style="animation-delay:${delay}s">${Array.from({ length: 12 }, (_, i) => line2(`M${x + Math.cos(i * 30 * R) * 8} ${y + Math.sin(i * 30 * R) * 8}L${x + Math.cos(i * 30 * R) * 26} ${y + Math.sin(i * 30 * R) * 26}`, color, 1.6)).join("")}</g>`;
  return { decor: o, water, fireworks };
}
function sillPlant(month2) {
  const x = 596, y = 304;
  let o = poly2("578,330 614,330 609,304 583,304", F2("#b5654a")) + rect2(580, 300, 32, 6, 'rx="2" ' + F2("#c97a5c"));
  const leaf = (dx, dy, rx, ry, color = "#4f8a4a", turn = 0) => ell2(x + dx, y + dy, rx, ry, `transform="rotate(${turn} ${x + dx} ${y + dy})" ${F2(color)}`);
  const stem = (dx, height, bend, color = "#4f8a4a") => line2(`M${x + dx} ${y - 2}q${bend} ${-height / 2} ${bend / 2} ${-height}`, color, 1.6);
  const daisy = (dx, dy, r, petal, heart) => [0, 60, 120, 180, 240, 300].map((a) => {
    const px = x + dx + Math.cos(a * R) * r, py = y + dy + Math.sin(a * R) * r;
    return ell2(px, py, r * 0.75, r * 0.45, `transform="rotate(${a} ${px} ${py})" ${F2(petal)}`);
  }).join("") + circ2(x + dx, y + dy, r * 0.55, F2(heart));
  const three = [[-9, -22], [1, -30], [10, -20]];
  if (month2 === 1) o += leaf(-8, -6, 9, 4, "#2f5a3c", -30) + leaf(8, -6, 9, 4, "#2f5a3c", 30) + leaf(0, -10, 8, 4, "#3f6b4c", 90) + three.map(([dx, dy]) => stem(dx, -dy, 0) + daisy(dx, dy, 5, "#fbf6ea", "#e9c04a")).join("");
  if (month2 === 2) o += [-8, -2, 5, 10].map((d, i) => line2(`M${x + d} ${y - 2}q${i % 2 ? 5 : -5} -16 ${i % 2 ? 8 : -8} -20`, "#4f8a4a", 1.4) + ell2(x + d + (i % 2 ? 8 : -8), y - 19, 2.6, 4.4, F2("#ffffff")) + leaf(d, -8, 2, 9, "#5f9a5a", i % 2 ? 12 : -12)).join("");
  if (month2 === 3) o += [[-10, "#8a5ad0"], [-3, "#f1c93b"], [4, "#8a5ad0"], [11, "#f7f4ec"]].map(([dx, color], i) => leaf(dx, -6, 1.8, 8, "#5f9a5a", i % 2 ? 10 : -10) + ell2(x + dx, y - 14, 4, 7, F2(color)) + line2(`M${x + dx} ${y - 19}v4`, "#e08a2e", 1.2)).join("");
  if (month2 === 4) o += three.map(([dx, dy]) => stem(dx, -dy, 0) + daisy(dx, dy, 5.5, "#f6d743", "#ee9a2e") + leaf(dx - 3, -8, 1.8, 10, "#5f9a5a", -8)).join("");
  if (month2 === 5) o += leaf(-7, -12, 5, 14, "#3f7a4a", -14) + leaf(7, -12, 5, 14, "#4f8a4a", 14) + line2(`M${x} ${y - 2}q2-20 14-28`, "#4f8a4a", 1.4) + [[3, -14], [6, -19], [9, -24], [13, -28]].map(([dx, dy]) => circ2(x + dx, y + dy + 3, 2.4, F2("#ffffff"))).join("");
  if (month2 === 6) o += [[-10, -20], [0, -28], [10, -22], [-3, -14]].map(([dx, dy]) => stem(dx, -dy, 0) + daisy(dx, dy, 4.6, "#ffffff", "#f1c93b")).join("") + leaf(-6, -5, 7, 3, "#4f8a4a", -20) + leaf(6, -5, 7, 3, "#4f8a4a", 20);
  if (month2 === 7) o += [-10, -5, 0, 5, 10].map((d, i) => line2(`M${x + d * 0.5} ${y - 2}L${x + d} ${y - 30 - i % 2 * 5}`, "#7a9a6a", 1.3) + [0, 1, 2, 3].map((k) => ell2(x + d, y - 30 - i % 2 * 5 + k * 4, 2.2, 2.6, F2(k % 2 ? "#8a6ad0" : "#9a7ae0"))).join("")).join("");
  if (month2 === 8)
    o += stem(0, 34, 0) + leaf(-7, -14, 8, 3.5, "#4f8a4a", -30) + leaf(7, -20, 8, 3.5, "#4f8a4a", 30) + Array.from({ length: 12 }, (_, i) => i * 30).map((a) => {
      const px = x + Math.cos(a * R) * 11, py = y - 36 + Math.sin(a * R) * 11;
      return ell2(px, py, 5, 2.4, `transform="rotate(${a} ${px} ${py})" ${F2("#f1c93b")}`);
    }).join("") + circ2(x, y - 36, 7, F2("#6b4a2e"));
  if (month2 === 9) o += Array.from({ length: 26 }, (_, i) => {
    const a = i * 47 % 180, r = 8 + i * 7 % 12;
    return circ2(x + Math.cos(a * R) * r * 1.1, y - 4 - Math.sin(a * R) * r, 2.6, F2(i % 3 ? "#c26aa8" : "#a8528e"));
  }).join("") + leaf(-12, -3, 5, 2, "#4f7a4a", -20) + leaf(12, -3, 5, 2, "#4f7a4a", 20);
  if (month2 === 10) o += leaf(-9, -5, 8, 3.5, "#3f6b4c", -25) + leaf(9, -5, 8, 3.5, "#3f6b4c", 25) + [[-9, -14], [2, -20], [11, -13], [-2, -10]].map(([dx, dy], i) => circ2(x + dx, y + dy, 7, F2(i % 2 ? "#e08a2e" : "#d86a2a")) + circ2(x + dx, y + dy, 3.4, F2("#f1b04a"))).join("");
  if (month2 === 11)
    o += [[-9, -6, -20], [0, -9, 0], [9, -6, 20], [-4, -3, -40], [5, -3, 40]].map(([dx, dy, turn]) => leaf(dx, dy, 7, 5.5, "#2f5a3c", turn)).join("") + [[-7, -22], [1, -28], [9, -21]].map(([dx, dy]) => stem(dx * 0.4, -dy - 4, dx * 0.6, "#8a4a5a") + ell2(x + dx, y + dy, 3, 5.5, `transform="rotate(-14 ${x + dx} ${y + dy})" ${F2("#d44a8a")}`) + ell2(x + dx + 3, y + dy + 1, 3, 5.5, `transform="rotate(22 ${x + dx + 3} ${y + dy + 1})" ${F2("#e06aa0")}`)).join("");
  if (month2 === 12)
    o += leaf(-10, -6, 9, 4, "#2f5a3c", -25) + leaf(10, -6, 9, 4, "#2f5a3c", 25) + [0, 45, 90, 135, 180, 225, 270, 315].map((a) => {
      const px = x + Math.cos(a * R) * 9, py = y - 18 + Math.sin(a * R) * 8;
      return ell2(px, py, 8, 3.4, `transform="rotate(${a} ${px} ${py})" ${F2(a % 90 ? "#c8322e" : "#d8433a")}`);
    }).join("") + [[-2, -19], [2, -17], [0, -21]].map(([dx, dy]) => circ2(x + dx, y + dy, 1.5, F2("#f1c93b"))).join("");
  return o;
}
var leafColor = (month2) => month2 === 3 ? "#a9cf7a" : month2 === 4 || month2 === 5 ? "#8fbf6a" : month2 >= 6 && month2 <= 8 ? "#4f8a4a" : month2 === 9 ? "#c9a23a" : month2 === 10 ? "#d0702e" : null;
var LEAF = "M0 0C5 -7 15 -8 22 0C15 8 5 7 0 0Z";
var TWIGS = [["M96 46C110 30 128 26 150 12", 3], ["M150 58C170 70 186 96 196 118", 3], ["M120 50C124 70 114 92 104 110", 2.6], ["M182 68C204 62 226 66 246 58", 2.4], ["M128 28C140 34 152 30 166 34", 1.6], ["M168 82C160 96 162 108 156 120", 1.6], ["M110 84C122 90 130 102 140 106", 1.4], ["M214 64C222 52 232 48 240 38", 1.5], ["M196 110C206 118 212 130 222 134", 1.4]];
var TIPS = [[150, 12, -40], [166, 34, 10], [136, 22, -70], [196, 118, 60], [156, 120, 100], [176, 96, 30], [104, 110, 110], [140, 106, 20], [116, 74, 150], [246, 58, -15], [240, 38, -50], [226, 66, 30], [222, 134, 40], [206, 122, -20], [112, 34, -110], [128, 46, 60], [186, 84, 140], [232, 50, 170], [118, 96, 60], [162, 70, -150], [204, 64, -90], [98, 58, 120]];
function seasonal(month2, darkness, snowy) {
  const leaf = leafColor(month2), bark = mix("#4a3626", "#17131c", darkness);
  let trees = "";
  for (const x of [136, 372, 498]) {
    trees += `<path d="M${x} 244V200M${x} 222l-12-14M${x} 214l12-15M${x} 232l-8-7" stroke="${bark}" stroke-width="2.6" fill="none"/>`;
    if (leaf && month2 !== 3) {
      const c = mix(leaf, "#1c2622", darkness), light = mix(mix(leaf, "#ffffff", 0.2), "#1c2622", darkness);
      trees += circ2(x, 194, 18, F2(c)) + circ2(x - 12, 208, 12, F2(c)) + circ2(x + 12, 206, 12, F2(c)) + circ2(x - 5, 188, 8, F2(light));
      if (month2 === 4 || month2 === 5) for (const [px, py] of [[x - 8, 186], [x + 6, 192], [x - 14, 204], [x + 13, 202], [x, 200]]) trees += circ2(px, py, 3, F2(mix("#f8dbe6", "#3a3040", darkness)));
    }
  }
  const wood = mix("#4a3322", "#120e14", darkness * 0.7), woodLight = mix("#6b4c34", "#1a141c", darkness * 0.7);
  let branch = `<path d="M44 26V50C96 56 150 52 214 80L216 76C156 42 100 40 60 26Z" fill="${wood}"/><path d="M48 32C100 40 150 42 206 72" stroke="${woodLight}" stroke-width="1.6" fill="none"/>`;
  for (const [d, width] of TWIGS) branch += line2(d, wood, width);
  if (leaf && month2 !== 3) {
    const c1 = mix(leaf, "#18201c", darkness * 0.8), c2 = mix(mix(leaf, month2 >= 9 ? "#c8433a" : "#2f5a3c", 0.35), "#18201c", darkness * 0.8), vein = mix(mix(leaf, "#000000", 0.35), "#101010", darkness * 0.6);
    TIPS.forEach(([x, y, turn], i) => {
      branch += `<g transform="translate(${x} ${y}) rotate(${turn}) scale(${0.8 + i % 3 * 0.15})"><path d="${LEAF}" fill="${i % 3 ? c1 : c2}"/><path d="M0 0H20M6 0l4-3M11 0l4-3M6 0l4 3M11 0l4 3" stroke="${vein}" stroke-width=".6" fill="none"/></g>`;
    });
    if (month2 === 4 || month2 === 5) {
      const petal = mix("#fbe3ec", "#4a3a48", darkness * 0.7);
      TIPS.filter((_, i) => i % 2 === 0).forEach(([x, y]) => {
        branch += [0, 72, 144, 216, 288].map((a) => circ2((x + Math.cos(a * R) * 4).toFixed(1), (y - 6 + Math.sin(a * R) * 4).toFixed(1), 3, F2(petal))).join("") + circ2(x, y - 6, 1.8, F2("#e9a03a"));
      });
    }
  } else if (month2 === 3) {
    for (const [x, y, turn] of TIPS) branch += ell2(x, y, 2.2, 3.6, `transform="rotate(${turn} ${x} ${y})" ${F2(mix(leaf, "#18201c", darkness * 0.8))}`);
  } else {
    TIPS.filter((_, i) => i % 4 === 0).forEach(([x, y]) => branch += ell2(x, y, 1.6, 2.4, F2(woodLight)));
    if (snowy) branch += '<path d="M50 28C100 38 150 40 210 72M100 42C112 30 128 26 146 14M152 56C170 68 184 92 194 112M184 66C204 60 224 64 242 56" stroke="#ffffff" stroke-width="3" stroke-linecap="round" fill="none"/>';
    else if (month2 === 11) for (const [x, y] of [[150, 62], [104, 112], [196, 120], [246, 60], [156, 122]]) branch += ell2(x, y + 4, 1.4, 2.2, 'fill="#dfeef5" opacity=".9"');
    branch += `<g transform="translate(178,58)">${ell2(0, 0, 8, 6.5, F2("#8a6b52"))}${ell2(2, 1.5, 5.5, 4.5, F2("#e2622e"))}${circ2(6, -4, 4.2, F2("#8a6b52"))}${circ2(7.4, -4.6, 0.9, F2("#1b1620"))}${poly2("10,-4 14,-3 10,-2.4", F2("#e0a03a"))}${poly2("-7,-1 -15,-4 -8,3", F2("#6b5240"))}${line2("M-1 6v4M3 6v4", "#3a3a3d", 1)}</g>`;
  }
  const falling = month2 === 9 || month2 === 10 ? [[120, 60, 0], [180, 90, 3], [230, 60, 6]].map(([x, y, delay]) => `<g transform="translate(${x} ${y})"><path class="lhw-fall" style="animation-delay:${delay}s" d="${LEAF}" transform="scale(.7)" fill="${mix(delay % 2 ? "#d0702e" : "#c8433a", "#18201c", darkness * 0.8)}"/></g>`).join("") : "";
  return { trees, branch, falling };
}
function mountScene(root) {
  root.style.setProperty("--lhw-weather-travel", `${WEATHER_TILE}px`);
  root.style.setProperty("--lhw-landscape-travel", `${LANDSCAPE_TILE}px`);
  root.innerHTML = SKELETON;
  const part = (name) => root.querySelector(`[data-p="${name}"]`);
  for (const [name, markup] of Object.entries(staticLayers())) part(name).innerHTML = markup;
  let monthKey = "";
  return function draw(state2) {
    const { hour, month: month2, day, weather } = state2;
    const sun = sunTimes(dayOfYear(month2, day), state2.offsetHours);
    const { day: daylight, edge, sky, darkness, warmth } = skyState(hour, sun, weather.cloud);
    const night = darkness > 0.6;
    const key = `${month2}-${day}-${night}`;
    if (key !== monthKey) {
      monthKey = key;
      const city = cityDecor(month2, day, night);
      part("decor").innerHTML = city.decor;
      part("water").innerHTML = city.water;
      part("fireworks").innerHTML = city.fireworks;
      part("pot").innerHTML = sillPlant(month2);
    }
    const season = seasonal(month2, darkness, weather.snow);
    part("trees").innerHTML = season.trees;
    part("branch").innerHTML = season.branch;
    part("falling").innerHTML = season.falling;
    part("sky").setAttribute("fill", sky);
    part("glow").setAttribute("opacity", ((1 - darkness) * (1 - weather.cloud * 0.5)).toFixed(2));
    part("horizon").setAttribute("opacity", (0.8 * warmth).toFixed(2));
    part("stars").setAttribute("opacity", (darkness > 0.7 ? (darkness - 0.7) / 0.3 * (1 - weather.cloud) : 0).toFixed(2));
    part("birds").style.display = daylight && !weather.rain && !weather.snow ? "" : "none";
    const sunDisc = part("sun");
    if (daylight) {
      const f = (hour - sun.rise) / (sun.set - sun.rise);
      sunDisc.setAttribute("cx", (60 + f * 560).toFixed(1));
      sunDisc.setAttribute("cy", (246 - Math.sin(Math.PI * f) * (sun.noonAltitude / 62 * 200)).toFixed(1));
      sunDisc.setAttribute("fill", mix("#f4a55a", "#fbe7a8", edge / 1.2));
      sunDisc.setAttribute("opacity", (1 - weather.cloud * 0.85).toFixed(2));
    } else sunDisc.setAttribute("opacity", "0");
    const phase = state2.moon?.phase ?? computedMoonPhase((/* @__PURE__ */ new Date()).getFullYear(), month2, day);
    const nightLength = 24 - (sun.set - sun.rise);
    const progress = state2.moon && state2.moon.riseHour !== null && state2.moon.setHour !== null ? moonProgress(hour, state2.moon.riseHour, state2.moon.setHour) : daylight ? null : (hour - sun.set + 24) % 24 / nightLength;
    const moon = part("moon");
    if (progress === null) moon.setAttribute("opacity", "0");
    else {
      const offset = (phase < 0.5 ? -1 : 1) * 24 * (phase < 0.5 ? phase * 2 : (1 - phase) * 2);
      moon.setAttribute("opacity", ((0.25 + darkness * 0.75) * (1 - weather.cloud * 0.7)).toFixed(2));
      moon.setAttribute("transform", `translate(${(60 + progress * 560).toFixed(1)} ${(246 - Math.sin(Math.PI * progress) * 150).toFixed(1)})`);
      const shadow = part("moon-shadow");
      shadow.setAttribute("cx", offset.toFixed(1));
      shadow.setAttribute("fill", sky);
    }
    const cloudColor = mix(mix(mix("#ffffff", "#9aa3aa", weather.cloud), "#f3c9a0", warmth * 0.5), "#2c3140", darkness);
    ["clouds-high", "clouds-low"].forEach((name, i) => {
      part(name).setAttribute("fill", cloudColor);
      part(name).setAttribute("opacity", Math.min(1, weather.cloud * (i ? 0.9 : 1.1)).toFixed(2));
    });
    root.querySelectorAll("#lhw-scene [data-c], [data-p='water'] [data-c]").forEach((shape) => {
      const haze = Number(shape.closest("[data-l]")?.dataset.l ?? 0);
      let color = mix(shape.dataset.c, "#e9a66a", warmth * 0.22 * (1 - haze));
      color = mix(color, "#8c9299", weather.fog ? 0.45 : weather.cloud * 0.14);
      color = mix(color, sky, Math.min(0.92, haze + (weather.fog && haze > 0 ? 0.25 : 0)));
      shape.setAttribute("fill", mix(color, mix("#221d2b", sky, haze * 0.7), darkness * 0.88));
    });
    root.querySelectorAll("#lhw-scene .lit, [data-p='water'] .lit").forEach((light) => light.setAttribute("opacity", darkness.toFixed(2)));
    const river = mix(mix(mix("#6fa0c4", "#7f8f99", weather.cloud), "#d9a877", warmth * 0.3), "#101626", darkness);
    part("river").setAttribute("fill", river);
    part("veil").setAttribute("fill", river);
    part("rain").style.display = weather.rain ? "" : "none";
    part("snow").style.display = weather.snow ? "" : "none";
    part("fog").setAttribute("opacity", weather.fog ? (weather.fog * (1 - darkness * 0.5)).toFixed(2) : "0");
    return darkness;
  };
}

// docs/mockups/mockup.mjs
var tabs = [
  { name: "B\xE0n h\u1ECDc", states: ["S\xE1ng s\u1EDBm \xB7 1 s\u1ED5", "Bu\u1ED5i chi\u1EC1u \xB7 2 s\u1ED5", "Bu\u1ED5i t\u1ED1i \xB7 4 s\u1ED5", "B\xE0n tr\u1ED1ng", "\u0110ang so\u1EA1n b\xE0i", "M\xE1y ch\u1EA5m t\u1EAFt", "M\u1EA5t m\u1EA1ng"] },
  { name: "B\xE0i h\u1ECDc", states: ["Ch\u1ECDn \u0111\xE1p \xE1n", "\u0110i\u1EC1n ti\u1EBFng \u0110\u1EE9c", "Vi\u1EBFt", "Nghe \xB7 ch\u01B0a nghe", "Nghe \xB7 \u0111ang ph\xE1t", "Nghe \xB7 h\u1EBFt l\u01B0\u1EE3t", "Nghe \xB7 l\u1EDDi tho\u1EA1i", "\u0110\xFAng ngay", "Sai l\u1EA7n m\u1ED9t", "\u0110ang ch\u1EA5m", "Gia s\u01B0 m\u1EDF", "B\xE0n ph\xEDm \u0111ang m\u1EDF", "T\u1ED5ng k\u1EBFt"] },
  { name: "S\u1ED5", states: ["L\u1ED9 tr\xECnh", "\u0110\xE3 l\xE0m \u0111\u01B0\u1EE3c", "B\xE0i t\u1EDBi kh\xF3 h\u01A1n", "L\u1ECBch s\u1EED", "C\xE0i \u0111\u1EB7t"] },
  { name: "Qu\u1EA3n tr\u1ECB", states: ["C\u1EA7n xem", "Knowledge", "H\u1EC7 th\u1ED1ng"] }
];
var sample = document.querySelector("#sample");
var screens = document.querySelector("#screens");
var state = document.querySelector("#state");
var active = 0;
var month = 11;
var button = (label, style = "") => `<button type="button" class="${style}">${label}</button>`;
var heading = (name, content, paper = "") => `<div class="sheet ${paper}"><h1>${name}</h1>${content}</div>`;
var note = (message, tone = "") => `<p class="note ${tone}">${message}</p>`;
var keys = '<div class="lineup" aria-label="K\xFD t\u1EF1 ti\u1EBFng \u0110\u1EE9c">' + ["\xE4", "\xF6", "\xFC", "\xDF"].map((letter) => button(letter)).join("") + "</div>";
function desk(index) {
  const hours = [7.8, 15, 21, 15, 15, 21, 15];
  const counts = [1, 2, 4, 0, 1, 2, 1];
  const messages = ["", "", "", "Ch\u01B0a c\xF3 s\u1ED5 n\xE0o. M\u1EDF s\u1ED5 \u0111\u1EA7u ti\xEAn \u0111\u1EC3 b\u1EAFt \u0111\u1EA7u.", "Qwen \u0111ang so\u1EA1n b\xE0i Deutsch.", "M\xE1y ch\u1EA5m \u0111ang t\u1EAFt. B\xE0i \u0111\xE3 n\u1ED9p s\u1EBD ch\u1EDD ch\u1EA5m.", "M\u1EA5t m\u1EA1ng. K\u1EBFt n\u1ED1i l\u1EA1i \u0111\u1EC3 \u0111\u1ED3ng b\u1ED9 b\xE0i l\xE0m."];
  const seasonalWeather = { cloud: 0.28, rain: false, snow: month === 12 || month === 1, fog: 0 };
  const deskDecoration = `<svg class="season-desk" aria-hidden="true" viewBox="-28 -62 56 68">${deskItem(month)}</svg>`;
  const shelfDecoration = `<svg class="season-shelf" aria-hidden="true" viewBox="-16 -46 32 48">${shelfItem(month)}</svg>`;
  const when = hours[index] >= 18 ? "Bu\u1ED5i t\u1ED1i" : index === 0 ? "S\xE1ng s\u1EDBm" : "Bu\u1ED5i chi\u1EC1u";
  const memo = index < 3 ? "<p>Deutsch</p><p>Vi\u1EBFt email \u0111\u1ED5i l\u1ECBch</p>" + button("H\u1ECDc ti\u1EBFp", "primary") : "<p>" + messages[index] + "</p>";
  const books = ["Deutsch", "To\xE1n 7", "Ti\u1EBFng Anh", "Python"].slice(0, counts[index]);
  sample.innerHTML = `<div class="room" data-night="${hours[index] >= 18}">
    <div class="window"><svg aria-label="C\u1EEDa s\u1ED5 nh\xECn ra L\xFCbeck" role="img" viewBox="26 12 628 336"></svg>
      <div class="scene-label">L\xFCbeck \xB7 ${when}</div>
    </div>
    <section class="desk" aria-label="B\xE0n h\u1ECDc">
      <div class="desktop"><div class="postit">${memo}</div>${deskDecoration}</div>
      <div class="desk-front" aria-hidden="true"></div>
    </section>
    <section class="bookcase" aria-label="K\u1EC7 s\xE1ch">
      <h2>K\u1EC7 s\xE1ch</h2>
      <div class="shelf">${books.map((name) => button(name, "spine")).join("")}${shelfDecoration}</div>
      <div class="shelf lower-shelf">${books.length ? "" : button("M\u1EDF s\u1ED5", "primary")}</div>
    </section>
  </div>`;
  mountScene(sample.querySelector("svg"))({ hour: hours[index], month, day: 13, offsetHours: month >= 4 && month <= 10 ? 2 : 1, weather: seasonalWeather, moon: null });
}
function lesson(index) {
  const listen = index >= 3 && index <= 6;
  const choice = [0, 7, 8].includes(index);
  const titles = ["Ch\u1ECDn c\xE2u \u0111\xFAng sau weil", "\u0110i\u1EC1n t\u1EEB c\xF2n thi\u1EBFu", "Vi\u1EBFt email xin \u0111\u1ED5i l\u1ECBch", "Nghe l\u1ECBch h\u1EB9n", "Nghe l\u1ECBch h\u1EB9n", "Nghe l\u1ECBch h\u1EB9n", "Nghe l\u1ECBch h\u1EB9n", "Ch\u1ECDn c\xE2u \u0111\xFAng sau weil", "Ch\u1ECDn c\xE2u \u0111\xFAng sau weil", "Vi\u1EBFt email xin \u0111\u1ED5i l\u1ECBch", "\u0110i\u1EC1n t\u1EEB c\xF2n thi\u1EBFu", "\u0110i\u1EC1n t\u1EEB c\xF2n thi\u1EBFu"];
  if (index === 12) return heading("T\u1ED5ng k\u1EBFt", '<p><strong>8/10 c\xE2u \u0111\xFAng ngay</strong></p><p class="muted">42 ph\xFAt h\u1ECDc \xB7 1 c\xE2u c\u1EA7n luy\u1EC7n th\xEAm</p>' + note("B\u1EA1n \u0111\xE3 \u0111\u1EB7t \u0111\u1ED9ng t\u1EEB \u0111\xFAng sau weil. L\u1EA7n sau th\u1EED v\u1EADn d\u1EE5ng khi \u0111\u1ED5i l\u1ECBch.") + button("\u0110\xF3ng s\u1ED5"), "ruled book-ending");
  let input = choice ? '<div class="choices"><label><input type="radio" name="answer"> weil ich heute arbeiten muss</label><label><input type="radio" name="answer"> weil ich muss heute arbeiten</label></div>' : listen ? '<label>Ng\u01B0\u1EDDi n\xF3i h\u1EB9n l\xFAc m\u1EA5y gi\u1EDD?<input placeholder="Nh\u1EADp gi\u1EDD h\u1EB9n"></label>' : [2, 9].includes(index) ? '<label>Vi\u1EBFt 50\u201370 t\u1EEB, n\xEAu l\xFD do v\xE0 \u0111\u1EC1 xu\u1EA5t gi\u1EDD kh\xE1c.<textarea rows="5" placeholder="Guten Tag \u2026"></textarea></label>' : '<label>Der Termin ist ___ Montag.<input lang="de" spellcheck="false" autocorrect="off" autocapitalize="none" placeholder="Nh\u1EADp c\xE2u tr\u1EA3 l\u1EDDi"></label>' + keys + note("N\u1EBFu Telex \u0111\u1ED5i ch\u1EEF b\u1EA1n v\u1EEBa g\xF5, h\xE3y chuy\u1EC3n sang b\xE0n ph\xEDm ti\u1EBFng \u0110\u1EE9c.");
  if (listen) input = `<div class="lineup">${index < 5 ? button(index === 4 ? "T\u1EA1m d\u1EEBng" : "Ph\xE1t \xE2m thanh", "primary") : ""}${index !== 4 ? button("Xem l\u1EDDi tho\u1EA1i") : ""}</div><p class="muted">${["C\xF2n 2 l\u01B0\u1EE3t nghe", "\u0110ang ph\xE1t \xB7 0:08 / 0:19", "\u0110\xE3 h\u1EBFt l\u01B0\u1EE3t nghe", "L\u1EDDi tho\u1EA1i"][index - 3]}</p>${index === 6 ? note("K\xF6nnen wir uns am Montag um zehn Uhr treffen?") : ""}` + input;
  const feedback = { 7: note("\u0110\xFAng ngay. Sau weil, \u0111\u1ED9ng t\u1EEB \u0111\xE3 chia \u0111\u1EE9ng cu\u1ED1i c\xE2u.", "good"), 8: note("Th\u1EED l\u1EA1i. Xem v\u1ECB tr\xED c\u1EE7a muss.", "caution"), 9: note("\u0110\xE3 n\u1ED9p \xB7 \u0111ang ch\u1EDD l\u1EDDi ph\xEA."), 10: note("Gia s\u01B0 \xB7 am d\xF9ng v\u1EDBi ng\xE0y trong tu\u1EA7n. V\xED d\u1EE5: am Dienstag.") }[index] ?? "";
  return `<div class="split book-spread"><section class="sheet ruled"><p class="muted">Deutsch \xB7 C\xE2u 3/10</p><h1>${titles[index]}</h1>${input}${feedback}<div class="sticky">${button("Ki\u1EC3m tra", "primary")}</div>${index === 11 ? '<div class="keyboard" aria-label="M\xF4 ph\u1ECFng b\xE0n ph\xEDm \u0111ang m\u1EDF">Q W E R T Z U I O P<br>A S D F G H J K L<br>Y X C V B N M</div>' : ""}</section><aside class="sheet ruled book-companion"><h2>Ghi nh\u1EDB</h2><p class="muted">am Montag \xB7 um zehn Uhr</p></aside></div>`;
}
function notebook(index) {
  const parts = [
    '<ol class="road"><li>\u0110\u1ECDc l\u1ECBch h\u1EB9n<small>\u0110\xE3 qua</small></li><li>\u0110\u1ED5i l\u1ECBch h\u1EB9n<small>\u0110ang luy\u1EC7n</small></li><li>Vi\u1EBFt email x\xE1c nh\u1EADn<small>S\u1EAFp t\u1EDBi</small></li><li>Trao \u0111\u1ED5i qua \u0111i\u1EC7n tho\u1EA1i<small>Ch\u01B0a c\xF3 ngu\u1ED3n nghe</small></li></ol>',
    '<p class="good">\u0110\xE3 d\xF9ng \u0111\xFAng am v\xE0 um trong hai bu\u1ED5i.</p><p>\u0110\xE3 \u0111\u1EB7t \u0111\u1ED9ng t\u1EEB cu\u1ED1i c\xE2u sau weil.</p>',
    note("B\u1EA1n \u0111\xE3 \u0111\u1ED5i l\u1ECBch trong m\u1ED9t h\u1ED9i tho\u1EA1i ng\u1EAFn. B\xE0i t\u1EDBi th\xEAm y\xEAu c\u1EA7u tr\u1EA3 l\u1EDDi b\u1EB1ng email."),
    "<details><summary>B\xE0i \u0111\xE3 h\u1ECDc \xB7 3 b\xE0i</summary><ul><li>\u0110\u1ECDc l\u1ECBch h\u1EB9n</li><li>Ch\u1ECDn gi\u1EDBi t\u1EEB ch\u1EC9 th\u1EDDi gian</li><li>X\xE1c nh\u1EADn gi\u1EDD h\u1ECDp</li></ul></details>",
    '<form><label>M\u1EE5c ti\xEAu<input value="Trao \u0111\u1ED5i \u1EDF n\u01A1i l\xE0m vi\u1EC7c"></label><label>Th\u1EDDi l\u01B0\u1EE3ng<select><option>45 ph\xFAt</option><option>20 ph\xFAt</option></select></label>' + button("L\u01B0u", "primary") + "</form>"
  ];
  const chapters = `<div class="lineup">${button("B\xE0i m\u1EDBi", "primary")}${button("T\u1EF1 ch\u1ECDn")}</div>`;
  return `<div class="split book-spread">
    <section class="sheet ruled"><h1>Deutsch</h1><h2>${tabs[2].states[index]}</h2>${parts[index]}${index === 0 ? chapters : ""}</section>
    <aside class="sheet ruled book-companion"><h2>H\xF4m nay</h2><p>Vi\u1EBFt email \u0111\u1ED5i l\u1ECBch</p>
      <p class="muted">\u0110\u1EC1 xu\u1EA5t gi\u1EDD m\u1EDBi v\xE0 x\xE1c nh\u1EADn l\u1ECBch v\u1EDBi \u0111\u1ED3ng nghi\u1EC7p.</p>
      ${button("H\u1ECDc ti\u1EBFp", "primary")}
    </aside>
  </div>`;
}
function admin(index) {
  const panels = [
    "<h2>C\u1EA7n xem</h2>" + note("Deutsch \xB7 1 c\xE2u ch\u1EDD ch\u1EA5m. M\xE1y ch\u1EA5m ch\u01B0a k\u1EBFt n\u1ED1i.") + note("To\xE1n 7 \xB7 1 b\xE0i c\u1EA7n xem l\u1EA1i."),
    "<h2>Knowledge</h2><p>Deutsch \xB7 L\u1ECBch h\u1EB9n v\xE0 email c\xF4ng vi\u1EC7c</p><details><summary>Ngu\u1ED3n \u0111ang d\xF9ng</summary><p>V\xED d\u1EE5 email c\xF4ng vi\u1EC7c \xB7 B\u1EA3n 2</p></details>" + note("Thi\u1EBFu ngu\u1ED3n nghe cho b\u01B0\u1EDBc Trao \u0111\u1ED5i qua \u0111i\u1EC7n tho\u1EA1i."),
    "<h2>Th\u1EDDi gian m\u1EDF c\xE2u \u0111\u1EA7u ti\xEAn \xB7 p75</h2>" + [["Vi\u1EC7t Nam", 4.3], ["\u0110\u1EE9c", 1.6]].map(([country, sec]) => `<div class="metric">${country} \xB7 ${String(sec).replace(".", ",")} gi\xE2y<div class="bar" style="width:${sec * 20}%"></div></div>`).join("") + '<p class="muted">S\u1ED1 li\u1EC7u minh h\u1ECDa \xB7 m\u1ED1c 5 gi\xE2y</p>'
  ];
  return heading("Qu\u1EA3n tr\u1ECB", panels[index]);
}
function render() {
  const index = Number(state.value);
  if (active === 0) desk(index);
  if (active === 1) sample.innerHTML = lesson(index);
  if (active === 2) sample.innerHTML = notebook(index);
  if (active === 3) sample.innerHTML = admin(index);
  const book = sample.querySelector(".book-spread, .book-ending");
  if (book) {
    for (const direction of [-1, 1]) {
      if (!state.options[index + direction]) continue;
      const corner = document.createElement("button");
      corner.type = "button";
      corner.className = "mock-corner";
      corner.dataset.turn = direction;
      corner.setAttribute("aria-label", direction < 0 ? "Trang tr\u01B0\u1EDBc" : "Trang sau");
      book.append(corner);
    }
  }
}
function turnPage(direction) {
  if (sample.querySelector(".mock-turning")) return;
  const next = Number(state.value) + direction;
  if (!state.options[next]) return;
  const oldBook = sample.querySelector(".book-spread, .book-ending");
  const oldPage = oldBook.querySelector(direction > 0 && innerWidth >= 1024 ? ".book-companion" : "section") ?? oldBook;
  const bounds = oldPage.getBoundingClientRect();
  const frame = sample.getBoundingClientRect();
  const front = oldPage.cloneNode(true);
  state.value = String(next);
  render();
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const leaf = document.createElement("div");
  leaf.className = "mock-turning";
  leaf.dataset.direction = direction;
  leaf.inert = true;
  leaf.setAttribute("aria-hidden", "true");
  Object.assign(leaf.style, {
    left: bounds.left - frame.left + "px",
    top: bounds.top - frame.top + "px",
    width: bounds.width + "px",
    height: bounds.height + "px"
  });
  leaf.append(front);
  sample.append(leaf);
  leaf.addEventListener("animationend", () => leaf.remove(), { once: true });
}
function selectTab(index) {
  active = index;
  document.querySelector("#season-control").hidden = index !== 0;
  [...screens.children].forEach((element, i) => element.setAttribute("aria-current", i === index ? "true" : "false"));
  state.replaceChildren(...tabs[index].states.map((name, i) => new Option(name, i)));
  render();
}
for (const [index, tab] of tabs.entries()) {
  const element = document.createElement("button");
  element.textContent = tab.name;
  element.onclick = () => selectTab(index);
  screens.append(element);
}
state.onchange = render;
document.querySelector("#season").onchange = (event) => {
  month = Number(event.target.value);
  render();
};
document.querySelector("#theme").onchange = (event) => {
  document.documentElement.dataset.theme = event.target.value;
};
sample.addEventListener("click", (event) => {
  const target = event.target.closest("button");
  if (!target) return;
  if (target.dataset.turn) {
    turnPage(Number(target.dataset.turn));
    return;
  }
  const key = target.textContent;
  if (["\xE4", "\xF6", "\xFC", "\xDF"].includes(key)) {
    const field = sample.querySelector("input[lang=de]");
    const position = field.selectionStart;
    field.setRangeText(key, position, field.selectionEnd, "end");
    field.focus();
  }
  const listening = { "Ph\xE1t \xE2m thanh": 4, "T\u1EA1m d\u1EEBng": 3, "Xem l\u1EDDi tho\u1EA1i": 6 };
  if (active === 1 && Object.hasOwn(listening, key)) {
    state.value = String(listening[key]);
    render();
  }
  if (target.classList.contains("spine")) selectTab(2);
  if (key === "H\u1ECDc ti\u1EBFp") selectTab(1);
});
selectTab(0);
