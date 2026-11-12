import { computedMoonPhase, dayOfYear, mix, moonProgress, skyState, sunTimes, type Moon, type Weather } from "../../../lib/lubeck/sky";
import { B, C, D, F, GL, L, P, R, circ, ell, line, poly, rect, seeded } from "./svg";
import { farLayer, frontLayer, kogge, midLayer } from "./town";

/**
 * The view from the study window: old Lübeck in layers (far skyline, old town, Holstentor and the salt
 * warehouses on the Trave), drawn as SVG markup and recoloured for the hour, the weather and the month.
 * Everything here is constant artwork; no learner or request data is ever interpolated into the markup.
 */
export type SceneState = { hour: number; month: number; day: number; offsetHours: number; weather: Weather; moon: Moon | null };

const WEATHER_TILE = 340;
const LANDSCAPE_TILE = 700;

const SKELETON = `
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
  const repeatAcross = (markup: string) => `<g transform="translate(-${LANDSCAPE_TILE})">${markup}</g>${markup}`;
  let stars = "";
  for (let i = 0; i < 44; i++) stars += circ((50 + rnd() * 580).toFixed(0), (30 + rnd() * 120).toFixed(0), (0.8 + rnd()).toFixed(1), F("#ffffff"));
  const cloud = (list: number[][]) => list.map((c) => ell(c[0], c[1], c[2], c[3], "")).join("");
  const cloudsHigh = cloud([[110, 62, 52, 13], [156, 52, 36, 11], [84, 70, 30, 8], [360, 48, 58, 14], [412, 58, 40, 10], [560, 70, 50, 12], [606, 60, 30, 9]]);
  const cloudsLow = cloud([[230, 108, 44, 9], [270, 100, 30, 8], [470, 118, 48, 9], [150, 128, 36, 7]]);

  const far = farLayer(), mid = midLayer(), front = frontLayer();

  const rippleLayers = ["", ""];
  for (let i = 0; i < 34; i++) {
    const x = 50 + rnd() * 570,
      y = 256 + rnd() * 66,
      w = 10 + rnd() * 40;
    rippleLayers[i % 2] += `<path d="M${x.toFixed(0)} ${y.toFixed(0)}q${(w / 2).toFixed(0)} -2 ${w.toFixed(0)} 0" stroke="#ffffff" stroke-opacity="${(0.12 + rnd() * 0.19).toFixed(2)}" stroke-width="1.4" stroke-linecap="round" fill="none"/>`;
  }
  const ripples = rippleLayers.map((layer, i) =>
    `<g class="lhw-ripple" style="--lhw-duration:${i ? 142 : 96}s;--lhw-delay:${i ? -18 : -7}s">${repeatAcross(layer)}</g>`).join("");

  // Each sheet moves by exactly one tile. The next sheet occupies the same pixels at the wrap.
  const precipitation = (kind: "rain" | "snow", layer: number, count: number, seconds: number) => {
    const id = `lhw-${kind}-${layer}`;
    let particles = "";
    for (let i = 0; i < count; i++) {
      const x = (rnd() * 760).toFixed(1);
      const y = (18 + rnd() * (WEATHER_TILE - 36)).toFixed(1);
      const opacity = (0.32 + rnd() * (layer ? 0.5 : 0.32)).toFixed(2);
      particles += kind === "rain"
        ? `<path d="M${x} ${y}v${(7 + rnd() * (layer ? 12 : 7)).toFixed(1)}" stroke="#e6eef3" stroke-opacity="${opacity}" stroke-width="${layer ? 1.1 : 0.8}" stroke-linecap="round"/>`
        : circ(x, y, (0.65 + rnd() * (layer ? 1.85 : 0.8)).toFixed(1), `fill="#fff" opacity="${opacity}"`);
    }
    return `<defs><pattern id="${id}" width="760" height="${WEATHER_TILE}" patternUnits="userSpaceOnUse">${particles}</pattern></defs>` +
      `<g transform="skewX(${kind === "rain" ? -13 : layer ? 6 : 3})"><g class="lhw-${kind}" style="--lhw-duration:${seconds}s;--lhw-delay:${-seconds * (layer ? 0.61 : 0.27)}s">` +
      rect(-100, -WEATHER_TILE, 880, WEATHER_TILE * 2, `fill="url(#${id})"`) + "</g></g>";
  };
  const rain = precipitation("rain", 0, 48, 5.2) + precipitation("rain", 1, 42, 3.8);
  const snow = precipitation("snow", 0, 46, 26) + precipitation("snow", 1, 34, 18);
  return { stars, "clouds-high": repeatAcross(cloudsHigh), "clouds-low": repeatAcross(cloudsLow), far, mid, front, ripples, rain, snow };
}

const swan = (x: number, y: number, k: number) =>
  `<g transform="translate(${x} ${y}) scale(${k})"><g class="lhw-bob">${ell(0, 0, 9, 3.8, 'data-c="#f7f4ec"')}${poly("-9,-1 -14,-4 -8,2", 'data-c="#f7f4ec"')}${line("M6 -1q5-8 1-13", "#f7f4ec", 2.4)}${line("M7 -14l4 1.2", "#e08a3a", 1.8)}${line("M-22 3h10M-18 6h14", "#ffffff", 1)}</g></g>`;
const duck = (x: number, y: number, k: number) =>
  `<g transform="translate(${x} ${y}) scale(${-k} ${k})"><g class="lhw-bob" style="animation-delay:${(x % 3) * 0.4}s">${ell(0, 0, 6, 3, 'data-c="#8a6b4a"')}${circ(6, -4, 2.8, 'data-c="#2f6b4f"')}${line("M8.5 -4l3.5 .6", "#e0a03a", 1.6)}${line("M-16 3h9", "#ffffff", 1)}</g></g>`;
const sail = (x: number, y: number, k: number, color = "#f1eee6") =>
  `<g transform="translate(${x} ${y}) scale(${k})"><g class="lhw-boat"><path data-c="#5a3b2c" d="M-30 0h62l-8 12h-46z"/>${line("M0 0V-38", "#2b2b2e", 1.6)}${P(color, "2,-36 2,-2 28,-2")}${P("#e2d8c2", "-2,-28 -2,-2 -20,-2")}</g></g>`;

/** What the town puts out each month: season, holidays and Lübeck's own events. */
function cityDecor(month: number, day: number, night: boolean) {
  let o = "",
    boats = "";
  const snow = month === 12 || month <= 2;
  const flags = ["#e24b4a", "#f1c93b", "#3f8ad0", "#4fa85a", "#d86ab0"];
  if (snow) o += B("#ffffff", 44, 241, 462, 3) + B("#ffffff", 506, 222, 130, 3) + P("#ffffff", "177,66 185,50 193,66") + P("#ffffff", "317,66 325,50 333,66");
  if (month === 1) {
    // A snowman on the quay; in the first week the Sternsinger go from door to door behind their star.
    o += C("#f7f4ec", 80, 236.5, 6.5) + C("#f7f4ec", 80, 226, 4.8) + C("#f7f4ec", 80, 218.5, 3.4);
    o += B("#2b2b2e", 76, 214.6, 8, 1.3) + B("#2b2b2e", 77.4, 208.6, 5.2, 6.2) + B("#c8322e", 76.6, 222, 6.8, 2) + B("#c8322e", 81.5, 222, 2, 6);
    o += P("#e08a2e", "80.6,218.4 85.6,219.2 80.6,220") + C("#2b2b2e", 79, 217.4, 0.5) + C("#2b2b2e", 81.6, 217.4, 0.5);
    o += line("M75.6 226l-7-5M84.4 226l6-6", "#5a3b2c", 1);
    if (day <= 6)
      [[298, "#2f4f8a", 15], [310, "#8a3a4a", 12], [322, "#3f6b4c", 13]].forEach(([x, coat, h], i) => {
        const cx = x as number, top = 243 - (h as number);
        o += B(coat as string, cx - 3, top + 2, 6, (h as number) - 2) + C("#e9c9a8", cx, top - 0.5, 2.5);
        o += P("#e2b13c", `${cx - 2.6},${top - 2.4} ${cx - 2.6},${top - 5.2} ${cx - 1.3},${top - 3.6} ${cx},${top - 5.6} ${cx + 1.3},${top - 3.6} ${cx + 2.6},${top - 5.2} ${cx + 2.6},${top - 2.4}`);
        if (i === 0) {
          o += line(`M${cx + 3} ${top + 4}L${cx + 6} 202`, "#5a3b2c", 1.1);
          o += poly(`${cx + 6},194 ${cx + 7.8},199.4 ${cx + 13.4},199.4 ${cx + 8.9},202.8 ${cx + 10.6},208.2 ${cx + 6},205 ${cx + 1.4},208.2 ${cx + 3.1},202.8 ${cx - 1.4},199.4 ${cx + 4.2},199.4`, F("#f1c93b")) + GL(cx + 6, 201.6, 2.4, "#fff3c4");
        }
      });
  }
  if (month === 2) {
    // Fasching bunting along the quay.
    for (let i = 0; i < 24; i++) {
      const x = 70 + i * 12.3,
        y = 216 + Math.sin((i / 23) * Math.PI) * 9;
      o += P(flags[i % 5], `${x},${y} ${x + 8},${y} ${x + 4},${y + 8}`);
    }
    o += line("M66 214q150 22 300 0", "#3a3a3d", 0.8);
  }
  if (month === 3) for (let i = 0; i < 30; i++) o += C(["#8a5ad0", "#f1c93b", "#ffffff"][i % 3], 50 + i * 15 + (i % 2) * 4, 241.5, 1.5);
  if (month === 4) {
    // Easter: painted eggs in the trees and along the bridge railing.
    const eggs = ["#e24b4a", "#f1c93b", "#6aa7c9", "#d86ab0", "#7ac06a"];
    for (const x of [136, 372, 498])
      for (let i = 0; i < 7; i++) {
        const ex = x - 16 + i * 5.4,
          ey = 206 + ((i * 7) % 14);
        o += line(`M${ex} ${ey - 5}v3`, "#3a3a3d", 0.6) + `<ellipse data-c="${eggs[i % 5]}" cx="${ex}" cy="${ey}" rx="2.2" ry="3"/>`;
      }
    for (let i = 0; i < 10; i++) o += `<ellipse data-c="${eggs[i % 5]}" cx="${514 + i * 12.5}" cy="221" rx="2" ry="2.8"/>`;
  }
  if (month === 5) {
    // Maibaum on the quay.
    o += B("#f4f0e6", 352, 150, 3, 94);
    for (let i = 0; i < 8; i++) o += B(i % 2 ? "#3f6fc0" : "#f4f0e6", 352, 150 + i * 11.75, 3, 6);
    o += '<ellipse cx="353.5" cy="164" rx="14" ry="5" fill="none" stroke="#3f8a4f" stroke-width="3.5"/>';
    ["#e24b4a", "#f1c93b", "#3f8ad0", "#f7f4ec"].forEach((c, i) => (o += line(`M${341 + i * 8.4} 166q${i < 2 ? -4 : 4} 14 ${i < 2 ? -7 : 7} 24`, c, 1.6)));
    o += P("#3f8a4f", "346,150 353.5,136 361,150");
  }
  if (month === 6 || month === 7) {
    // Sailing season; in July the Travemünder Woche regatta.
    const fleet = month === 7 ? [[110, 286, 0.6, 0], [300, 276, 0.5, 1], [540, 296, 0.7, 2], [250, 306, 0.8, 4]] : [[120, 284, 0.55, 3], [560, 292, 0.6, 3]];
    for (const [x, y, k, c] of fleet) boats += sail(x, y, k, ["#e24b4a", "#f1c93b", "#3f8ad0", "#f7f4ec", "#4fa85a"][c]);
    if (month === 7) {
      for (let i = 0; i < 11; i++) {
        const x = 508 + i * 11.6;
        o += P(flags[i % 5], `${x},205 ${x + 7},205 ${x + 3.5},212`);
      }
      o += line("M506 204H636", "#3a3a3d", 0.8);
    }
  }
  if (month === 8) {
    // Summer festival on the river: stalls and a string of lights.
    for (const [x, roof] of [[80, "#e24b4a"], [310, "#3f8ad0"]] as [number, string][]) {
      o += B("#e9dcc0", x, 224, 40, 19) + P(roof, `${x - 5},224 ${x + 20},208 ${x + 45},224`);
      for (let i = 0; i < 4; i++) o += P("#f7f4ec", `${x + 1 + i * 12.5},224 ${x + 20},208 ${x + 5 + i * 12.5},224`);
      o += D(x + 6, 230, 28, 9);
    }
    for (let i = 0; i < 26; i++) o += GL(70 + i * 11.6, 206 + Math.sin((i / 25) * Math.PI) * 8, 1.8, ["#f7c66b", "#f09595", "#9fe1cb"][i % 3]);
    o += line("M66 204q150 20 300 0", "#3a3a3d", 0.7);
  }
  if (month === 9) {
    // Erntedank: harvest wreath over the gate, straw bales on the quay.
    o += '<path d="M255 196a12 12 0 1 1 .1 0" fill="none" stroke="#d9a53a" stroke-width="5"/>';
    for (const a of [0, 60, 120, 180, 240, 300]) o += C(a % 120 ? "#c8433a" : "#e08a2e", 255 + Math.cos(a * R) * 12, 184 + Math.sin(a * R) * 12, 2.4);
    for (const [x, y] of [[90, 238], [330, 238], [344, 239]]) o += `<ellipse data-c="#d9b04a" cx="${x}" cy="${y}" rx="9" ry="6"/>` + line(`M${x - 5} ${y - 3}q5 3 10 0`, "#8a6a2a", 0.8);
  }
  if (month === 10) {
    // 3 October, Tag der Deutschen Einheit; pumpkins on the quay.
    [[185, 36], [325, 36], [536, 194], [600, 194]].forEach(([x, top], i) => {
      const big = i < 2,
        w = big ? 16 : 10,
        h = big ? 3.4 : 2.2,
        y = top - (big ? 18 : 14);
      o += line(`M${x} ${top}V${y}`, "#2b2b2e", 1) + B("#1f1f22", x, y, w, h) + B("#d8322e", x, y + h, w, h) + B("#f1c93b", x, y + 2 * h, w, h);
    });
    for (const [x, y] of [[84, 240], [96, 241], [350, 240]]) o += `<ellipse data-c="#e08a2e" cx="${x}" cy="${y}" rx="5.5" ry="4"/>` + B("#5f6b3a", x - 0.8, y - 6, 1.6, 3);
  }
  if (month === 11) {
    // St. Martin, 11 November: children with paper lanterns along the quay.
    for (let i = 0; i < 9; i++) {
      const x = 78 + i * 30,
        h = i % 3 === 0 ? 15 : 10,
        coat = ["#2f4f8a", "#8a3a4a", "#3f6b4c", "#6b4a8a"][i % 4];
      o += B(coat, x - 2.5, 243 - h, 5, h - 3) + C("#e9c9a8", x, 241 - h - 1.5, 2.4) + line(`M${x + 3} ${240 - h + 4}l6-7`, "#3a3a3d", 0.8);
      o += circ(x + 9.5, 229 - h + 5, 3.4, F(["#e89a3a", "#e2504a", "#f1c93b"][i % 3])) + GL(x + 9.5, 229 - h + 5, 3.4, "#ffe7a8");
    }
  }
  if (month === 12) {
    // Weihnachtsmarkt: stalls, the big tree and lights on the salt warehouses.
    for (const [x, roof] of [[70, "#b03a3a"], [112, "#3f6b4c"], [300, "#b03a3a"], [338, "#3f6b4c"]] as [number, string][]) {
      o += B("#7a5236", x, 226, 34, 17) + P(roof, `${x - 4},226 ${x + 17},212 ${x + 38},226`);
      o += P("#ffffff", `${x - 4},226 ${x + 17},212 ${x + 38},226 ${x + 34},224 ${x + 17},215 ${x},224`) + L(x + 5, 230, 24, 8);
      for (let i = 0; i < 5; i++) o += GL(x + 1 + i * 8, 227.5, 1.5, i % 2 ? "#f7c66b" : "#f09595");
    }
    o += P("#2f5a3c", "205,243 222,170 239,243") + P("#3f6b4c", "209,224 222,170 235,224") + P("#4f8a5c", "213,202 222,170 231,202") + B("#5a3b2c", 220, 243, 4, 4);
    for (let i = 0; i < 14; i++) o += GL(211 + ((i * 37) % 22), 186 + i * 4, 1.7, ["#f7c66b", "#e24b4a", "#85b7eb"][i % 3]);
    o += poly("222,160 224,166 230,166 225,170 227,176 222,172 217,176 219,170 214,166 220,166", F("#f1c93b"));
    for (let i = 0; i < 20; i++) o += GL(380 + i * 6.4, 238 - Math.sin((i / 19) * Math.PI) * 5, 1.6, i % 2 ? "#f7c66b" : "#9fe1cb");
  }
  let water = kogge() + boats + sail(434, 290, 1);
  water += `<g class="lhw-swim-right">${swan(0, 292, 1.1)}${swan(-26, 298, 0.8)}${swan(-44, 295, 0.5)}${swan(-56, 299, 0.5)}</g>`;
  water += `<g class="lhw-swim-left">${duck(0, 312, 1)}${duck(18, 316, 0.8)}${duck(32, 311, 0.8)}</g>`;
  let fireworks = "";
  if (night && ((month === 12 && day === 31) || (month === 1 && day === 1)))
    for (const [x, y, color, delay] of [[150, 90, "#f7c66b", 0], [330, 70, "#e24b4a", 0.9], [470, 100, "#85b7eb", 1.7], [250, 120, "#9fe1cb", 1.2]] as [number, number, string, number][])
      fireworks += `<g class="lhw-firework" style="animation-delay:${delay}s">${Array.from({ length: 12 }, (_, i) => line(`M${x + Math.cos(i * 30 * R) * 8} ${y + Math.sin(i * 30 * R) * 8}L${x + Math.cos(i * 30 * R) * 26} ${y + Math.sin(i * 30 * R) * 26}`, color, 1.6)).join("")}</g>`;
  return { decor: o, water, fireworks };
}

/** The month's plant on the window sill. */
function sillPlant(month: number) {
  const x = 596,
    y = 304;
  let o = poly("578,330 614,330 609,304 583,304", F("#b5654a")) + rect(580, 300, 32, 6, 'rx="2" ' + F("#c97a5c"));
  const leaf = (dx: number, dy: number, rx: number, ry: number, color = "#4f8a4a", turn = 0) => ell(x + dx, y + dy, rx, ry, `transform="rotate(${turn} ${x + dx} ${y + dy})" ${F(color)}`);
  const stem = (dx: number, height: number, bend: number, color = "#4f8a4a") => line(`M${x + dx} ${y - 2}q${bend} ${-height / 2} ${bend / 2} ${-height}`, color, 1.6);
  const daisy = (dx: number, dy: number, r: number, petal: string, heart: string) =>
    [0, 60, 120, 180, 240, 300]
      .map((a) => {
        const px = x + dx + Math.cos(a * R) * r,
          py = y + dy + Math.sin(a * R) * r;
        return ell(px, py, r * 0.75, r * 0.45, `transform="rotate(${a} ${px} ${py})" ${F(petal)}`);
      })
      .join("") + circ(x + dx, y + dy, r * 0.55, F(heart));
  const three = [[-9, -22], [1, -30], [10, -20]];
  // 1 Christrose, 2 Schneeglöckchen, 3 Krokus, 4 Narzisse, 5 Maiglöckchen, 6 Margerite, 7 Lavendel,
  // 8 Sonnenblume, 9 Heidekraut, 10 Chrysantheme, 11 Alpenveilchen, 12 Weihnachtsstern.
  if (month === 1) o += leaf(-8, -6, 9, 4, "#2f5a3c", -30) + leaf(8, -6, 9, 4, "#2f5a3c", 30) + leaf(0, -10, 8, 4, "#3f6b4c", 90) + three.map(([dx, dy]) => stem(dx, -dy, 0) + daisy(dx, dy, 5, "#fbf6ea", "#e9c04a")).join("");
  if (month === 2) o += [-8, -2, 5, 10].map((d, i) => line(`M${x + d} ${y - 2}q${i % 2 ? 5 : -5} -16 ${i % 2 ? 8 : -8} -20`, "#4f8a4a", 1.4) + ell(x + d + (i % 2 ? 8 : -8), y - 19, 2.6, 4.4, F("#ffffff")) + leaf(d, -8, 2, 9, "#5f9a5a", i % 2 ? 12 : -12)).join("");
  if (month === 3) o += ([[-10, "#8a5ad0"], [-3, "#f1c93b"], [4, "#8a5ad0"], [11, "#f7f4ec"]] as [number, string][]).map(([dx, color], i) => leaf(dx, -6, 1.8, 8, "#5f9a5a", i % 2 ? 10 : -10) + ell(x + dx, y - 14, 4, 7, F(color)) + line(`M${x + dx} ${y - 19}v4`, "#e08a2e", 1.2)).join("");
  if (month === 4) o += three.map(([dx, dy]) => stem(dx, -dy, 0) + daisy(dx, dy, 5.5, "#f6d743", "#ee9a2e") + leaf(dx - 3, -8, 1.8, 10, "#5f9a5a", -8)).join("");
  if (month === 5) o += leaf(-7, -12, 5, 14, "#3f7a4a", -14) + leaf(7, -12, 5, 14, "#4f8a4a", 14) + line(`M${x} ${y - 2}q2-20 14-28`, "#4f8a4a", 1.4) + [[3, -14], [6, -19], [9, -24], [13, -28]].map(([dx, dy]) => circ(x + dx, y + dy + 3, 2.4, F("#ffffff"))).join("");
  if (month === 6) o += [[-10, -20], [0, -28], [10, -22], [-3, -14]].map(([dx, dy]) => stem(dx, -dy, 0) + daisy(dx, dy, 4.6, "#ffffff", "#f1c93b")).join("") + leaf(-6, -5, 7, 3, "#4f8a4a", -20) + leaf(6, -5, 7, 3, "#4f8a4a", 20);
  if (month === 7) o += [-10, -5, 0, 5, 10].map((d, i) => line(`M${x + d * 0.5} ${y - 2}L${x + d} ${y - 30 - (i % 2) * 5}`, "#7a9a6a", 1.3) + [0, 1, 2, 3].map((k) => ell(x + d, y - 30 - (i % 2) * 5 + k * 4, 2.2, 2.6, F(k % 2 ? "#8a6ad0" : "#9a7ae0"))).join("")).join("");
  if (month === 8)
    o += stem(0, 34, 0) + leaf(-7, -14, 8, 3.5, "#4f8a4a", -30) + leaf(7, -20, 8, 3.5, "#4f8a4a", 30) +
      Array.from({ length: 12 }, (_, i) => i * 30).map((a) => { const px = x + Math.cos(a * R) * 11, py = y - 36 + Math.sin(a * R) * 11; return ell(px, py, 5, 2.4, `transform="rotate(${a} ${px} ${py})" ${F("#f1c93b")}`); }).join("") + circ(x, y - 36, 7, F("#6b4a2e"));
  if (month === 9) o += Array.from({ length: 26 }, (_, i) => { const a = (i * 47) % 180, r = 8 + ((i * 7) % 12); return circ(x + Math.cos(a * R) * r * 1.1, y - 4 - Math.sin(a * R) * r, 2.6, F(i % 3 ? "#c26aa8" : "#a8528e")); }).join("") + leaf(-12, -3, 5, 2, "#4f7a4a", -20) + leaf(12, -3, 5, 2, "#4f7a4a", 20);
  if (month === 10) o += leaf(-9, -5, 8, 3.5, "#3f6b4c", -25) + leaf(9, -5, 8, 3.5, "#3f6b4c", 25) + [[-9, -14], [2, -20], [11, -13], [-2, -10]].map(([dx, dy], i) => circ(x + dx, y + dy, 7, F(i % 2 ? "#e08a2e" : "#d86a2a")) + circ(x + dx, y + dy, 3.4, F("#f1b04a"))).join("");
  if (month === 11)
    o += [[-9, -6, -20], [0, -9, 0], [9, -6, 20], [-4, -3, -40], [5, -3, 40]].map(([dx, dy, turn]) => leaf(dx, dy, 7, 5.5, "#2f5a3c", turn)).join("") +
      [[-7, -22], [1, -28], [9, -21]].map(([dx, dy]) => stem(dx * 0.4, -dy - 4, dx * 0.6, "#8a4a5a") + ell(x + dx, y + dy, 3, 5.5, `transform="rotate(-14 ${x + dx} ${y + dy})" ${F("#d44a8a")}`) + ell(x + dx + 3, y + dy + 1, 3, 5.5, `transform="rotate(22 ${x + dx + 3} ${y + dy + 1})" ${F("#e06aa0")}`)).join("");
  if (month === 12)
    o += leaf(-10, -6, 9, 4, "#2f5a3c", -25) + leaf(10, -6, 9, 4, "#2f5a3c", 25) +
      [0, 45, 90, 135, 180, 225, 270, 315].map((a) => { const px = x + Math.cos(a * R) * 9, py = y - 18 + Math.sin(a * R) * 8; return ell(px, py, 8, 3.4, `transform="rotate(${a} ${px} ${py})" ${F(a % 90 ? "#c8322e" : "#d8433a")}`); }).join("") +
      [[-2, -19], [2, -17], [0, -21]].map(([dx, dy]) => circ(x + dx, y + dy, 1.5, F("#f1c93b"))).join("");
  return o;
}

const leafColor = (month: number) => (month === 3 ? "#a9cf7a" : month === 4 || month === 5 ? "#8fbf6a" : month >= 6 && month <= 8 ? "#4f8a4a" : month === 9 ? "#c9a23a" : month === 10 ? "#d0702e" : null);
const LEAF = "M0 0C5 -7 15 -8 22 0C15 8 5 7 0 0Z";
const TWIGS: [string, number][] = [["M96 46C110 30 128 26 150 12", 3], ["M150 58C170 70 186 96 196 118", 3], ["M120 50C124 70 114 92 104 110", 2.6], ["M182 68C204 62 226 66 246 58", 2.4], ["M128 28C140 34 152 30 166 34", 1.6], ["M168 82C160 96 162 108 156 120", 1.6], ["M110 84C122 90 130 102 140 106", 1.4], ["M214 64C222 52 232 48 240 38", 1.5], ["M196 110C206 118 212 130 222 134", 1.4]];
const TIPS = [[150, 12, -40], [166, 34, 10], [136, 22, -70], [196, 118, 60], [156, 120, 100], [176, 96, 30], [104, 110, 110], [140, 106, 20], [116, 74, 150], [246, 58, -15], [240, 38, -50], [226, 66, 30], [222, 134, 40], [206, 122, -20], [112, 34, -110], [128, 46, 60], [186, 84, 140], [232, 50, 170], [118, 96, 60], [162, 70, -150], [204, 64, -90], [98, 58, 120]];

/** Riverside trees and the bough across the window corner: buds, blossom, leaves, autumn colour, bare with a robin. */
function seasonal(month: number, darkness: number, snowy: boolean) {
  const leaf = leafColor(month),
    bark = mix("#4a3626", "#17131c", darkness);
  let trees = "";
  for (const x of [136, 372, 498]) {
    trees += `<path d="M${x} 244V200M${x} 222l-12-14M${x} 214l12-15M${x} 232l-8-7" stroke="${bark}" stroke-width="2.6" fill="none"/>`;
    if (leaf && month !== 3) {
      const c = mix(leaf, "#1c2622", darkness),
        light = mix(mix(leaf, "#ffffff", 0.2), "#1c2622", darkness);
      trees += circ(x, 194, 18, F(c)) + circ(x - 12, 208, 12, F(c)) + circ(x + 12, 206, 12, F(c)) + circ(x - 5, 188, 8, F(light));
      if (month === 4 || month === 5) for (const [px, py] of [[x - 8, 186], [x + 6, 192], [x - 14, 204], [x + 13, 202], [x, 200]]) trees += circ(px, py, 3, F(mix("#f8dbe6", "#3a3040", darkness)));
    }
  }
  const wood = mix("#4a3322", "#120e14", darkness * 0.7),
    woodLight = mix("#6b4c34", "#1a141c", darkness * 0.7);
  let branch = `<path d="M44 26V50C96 56 150 52 214 80L216 76C156 42 100 40 60 26Z" fill="${wood}"/><path d="M48 32C100 40 150 42 206 72" stroke="${woodLight}" stroke-width="1.6" fill="none"/>`;
  for (const [d, width] of TWIGS) branch += line(d, wood, width);
  if (leaf && month !== 3) {
    const c1 = mix(leaf, "#18201c", darkness * 0.8),
      c2 = mix(mix(leaf, month >= 9 ? "#c8433a" : "#2f5a3c", 0.35), "#18201c", darkness * 0.8),
      vein = mix(mix(leaf, "#000000", 0.35), "#101010", darkness * 0.6);
    TIPS.forEach(([x, y, turn], i) => {
      branch += `<g transform="translate(${x} ${y}) rotate(${turn}) scale(${0.8 + (i % 3) * 0.15})"><path d="${LEAF}" fill="${i % 3 ? c1 : c2}"/><path d="M0 0H20M6 0l4-3M11 0l4-3M6 0l4 3M11 0l4 3" stroke="${vein}" stroke-width=".6" fill="none"/></g>`;
    });
    if (month === 4 || month === 5) {
      const petal = mix("#fbe3ec", "#4a3a48", darkness * 0.7);
      TIPS.filter((_, i) => i % 2 === 0).forEach(([x, y]) => {
        branch += [0, 72, 144, 216, 288].map((a) => circ((x + Math.cos(a * R) * 4).toFixed(1), (y - 6 + Math.sin(a * R) * 4).toFixed(1), 3, F(petal))).join("") + circ(x, y - 6, 1.8, F("#e9a03a"));
      });
    }
  } else if (month === 3) {
    for (const [x, y, turn] of TIPS) branch += ell(x, y, 2.2, 3.6, `transform="rotate(${turn} ${x} ${y})" ${F(mix(leaf!, "#18201c", darkness * 0.8))}`);
  } else {
    TIPS.filter((_, i) => i % 4 === 0).forEach(([x, y]) => (branch += ell(x, y, 1.6, 2.4, F(woodLight))));
    if (snowy) branch += '<path d="M50 28C100 38 150 40 210 72M100 42C112 30 128 26 146 14M152 56C170 68 184 92 194 112M184 66C204 60 224 64 242 56" stroke="#ffffff" stroke-width="3" stroke-linecap="round" fill="none"/>';
    else if (month === 11) for (const [x, y] of [[150, 62], [104, 112], [196, 120], [246, 60], [156, 122]]) branch += ell(x, y + 4, 1.4, 2.2, 'fill="#dfeef5" opacity=".9"');
    // A robin keeps the bare bough company through the cold months.
    branch += `<g transform="translate(178,58)">${ell(0, 0, 8, 6.5, F("#8a6b52"))}${ell(2, 1.5, 5.5, 4.5, F("#e2622e"))}${circ(6, -4, 4.2, F("#8a6b52"))}${circ(7.4, -4.6, 0.9, F("#1b1620"))}${poly("10,-4 14,-3 10,-2.4", F("#e0a03a"))}${poly("-7,-1 -15,-4 -8,3", F("#6b5240"))}${line("M-1 6v4M3 6v4", "#3a3a3d", 1)}</g>`;
  }
  const falling =
    month === 9 || month === 10
      ? [[120, 60, 0], [180, 90, 3], [230, 60, 6]].map(([x, y, delay]) => `<g transform="translate(${x} ${y})"><path class="lhw-fall" style="animation-delay:${delay}s" d="${LEAF}" transform="scale(.7)" fill="${mix(delay % 2 ? "#d0702e" : "#c8433a", "#18201c", darkness * 0.8)}"/></g>`).join("")
      : "";
  return { trees, branch, falling };
}

/** Fills the window once and returns `draw`, which repaints it for a moment and reports how dark it is outside. */
export function mountScene(root: SVGSVGElement) {
  root.style.setProperty("--lhw-weather-travel", `${WEATHER_TILE}px`);
  root.style.setProperty("--lhw-landscape-travel", `${LANDSCAPE_TILE}px`);
  root.innerHTML = SKELETON;
  const part = (name: string) => root.querySelector<SVGElement>(`[data-p="${name}"]`)!;
  for (const [name, markup] of Object.entries(staticLayers())) part(name).innerHTML = markup;
  let monthKey = "";

  return function draw(state: SceneState) {
    const { hour, month, day, weather } = state;
    const sun = sunTimes(dayOfYear(month, day), state.offsetHours);
    const { day: daylight, edge, sky, darkness, warmth } = skyState(hour, sun, weather.cloud);
    const night = darkness > 0.6;

    const key = `${month}-${day}-${night}`;
    if (key !== monthKey) {
      monthKey = key;
      const city = cityDecor(month, day, night);
      part("decor").innerHTML = city.decor;
      part("water").innerHTML = city.water;
      part("fireworks").innerHTML = city.fireworks;
      part("pot").innerHTML = sillPlant(month);
    }
    const season = seasonal(month, darkness, weather.snow);
    part("trees").innerHTML = season.trees;
    part("branch").innerHTML = season.branch;
    part("falling").innerHTML = season.falling;

    part("sky").setAttribute("fill", sky);
    part("glow").setAttribute("opacity", ((1 - darkness) * (1 - weather.cloud * 0.5)).toFixed(2));
    part("horizon").setAttribute("opacity", (0.8 * warmth).toFixed(2));
    part("stars").setAttribute("opacity", (darkness > 0.7 ? ((darkness - 0.7) / 0.3) * (1 - weather.cloud) : 0).toFixed(2));
    part("birds").style.display = daylight && !weather.rain && !weather.snow ? "" : "none";

    const sunDisc = part("sun");
    if (daylight) {
      const f = (hour - sun.rise) / (sun.set - sun.rise);
      sunDisc.setAttribute("cx", (60 + f * 560).toFixed(1));
      sunDisc.setAttribute("cy", (246 - Math.sin(Math.PI * f) * ((sun.noonAltitude / 62) * 200)).toFixed(1));
      sunDisc.setAttribute("fill", mix("#f4a55a", "#fbe7a8", edge / 1.2));
      sunDisc.setAttribute("opacity", (1 - weather.cloud * 0.85).toFixed(2));
    } else sunDisc.setAttribute("opacity", "0");

    // The moon follows the day's real rise and set when the service answered; otherwise it crosses the night sky.
    const phase = state.moon?.phase ?? computedMoonPhase(new Date().getFullYear(), month, day);
    const nightLength = 24 - (sun.set - sun.rise);
    const progress = state.moon && state.moon.riseHour !== null && state.moon.setHour !== null ? moonProgress(hour, state.moon.riseHour, state.moon.setHour) : daylight ? null : ((hour - sun.set + 24) % 24) / nightLength;
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

    // Atmospheric perspective: each layer leans toward the sky by its distance (data-l), then toward night.
    root.querySelectorAll<SVGElement>("#lhw-scene [data-c], [data-p='water'] [data-c]").forEach((shape) => {
      const haze = Number(shape.closest<SVGElement>("[data-l]")?.dataset.l ?? 0);
      let color = mix(shape.dataset.c!, "#e9a66a", warmth * 0.22 * (1 - haze));
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
