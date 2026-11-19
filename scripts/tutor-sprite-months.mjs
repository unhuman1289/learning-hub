// Cuts the 12 monthly Bột outfits into the strips the tutor already requests.
// Requires ImageMagick and cwebp. Input stays outside Git; output defaults to ignored private-data/.
// The tutor shows the outfit of the current Berlin month and falls back to v2 when a strip is missing.
// Upload (bucket learning-hub-uploads-staging or -production), one object per strip:
//   for f in private-data/tutor-sprite/months/m*/*.webp; do
//     npx wrangler r2 object put "<bucket>/assets/tutor/$(basename $(dirname $f))/$(basename $f)" \
//       --file "$f" --content-type image/webp --remote; done
import { readFile, mkdir, stat, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';

const [source, output = 'private-data/tutor-sprite/months'] = process.argv.slice(2);
if (!source) throw new Error('Usage: node scripts/tutor-sprite-months.mjs <mini-bot-sprites directory> [output directory]');

// Tutor strip name -> [sheet, animation in the monthly manifest]. Every monthly row has 4 frames.
const strips = {
  idle: ['standard', 'idle'], run_right: ['standard', 'run-right'], run_left: ['standard', 'run-left'],
  wave: ['standard', 'wave'], jump: ['standard', 'jump'], rest: ['standard', 'idle'],
  talk: ['standard', 'waiting'], explain: ['standard', 'waiting'], think: ['standard', 'thinking'], tilt: ['standard', 'review'],
  cover_mouth: ['extra', 'shake-head-cover-mouth'], point_up: ['extra', 'point-up'], nod: ['extra', 'nod'],
  sleep: ['extra', 'doze'], umbrella: ['extra', 'hold-umbrella'], sit: ['extra', 'sit-swing-legs'],
};
const FRAMES = 4, WIDTH = 192, HEIGHT = 208, MAX_BYTES = 60_000;

const manifest = JSON.parse(await readFile(join(source, 'manifest.json'), 'utf8'));
if (manifest.cell?.width !== WIDTH || manifest.cell?.height !== HEIGHT) throw new Error('Unexpected cell size');
const months = Object.keys(manifest.months ?? {}).sort();
if (months.join(',') !== '01,02,03,04,05,06,07,08,09,10,11,12') throw new Error('Expected months 01–12');

const summary = {};
for (const month of months) {
  const entry = manifest.months[month];
  const folder = resolve(output, 'm' + month);
  await mkdir(folder, { recursive: true });
  summary['m' + month] = { name: String(entry.name ?? ''), strips: {} };
  for (const [name, [sheet, animation]] of Object.entries(strips)) {
    const spec = entry.sheets?.[sheet];
    const row = spec?.animations?.[animation]?.row;
    const frames = spec?.animations?.[animation]?.frames;
    if (!/^\d\d\/[a-z]+\.png$/.test(String(spec?.file)) || !Number.isInteger(row) || row < 0 || row >= spec.rows
      || frames?.join(',') !== '0,1,2,3') throw new Error(`Invalid ${month}/${sheet}/${animation}`);
    const crop = spawnSync('magick', [join(source, spec.file), '-crop', `${FRAMES * WIDTH}x${HEIGHT}+0+${row * HEIGHT}`, '+repage', 'png:-'], { maxBuffer: 30_000_000 });
    if (crop.status !== 0) throw new Error(`Crop failed: ${month}/${name}`);
    const out = join(folder, `${name}.webp`);
    let size = Infinity;
    for (const quality of [85, 75, 65, 55, 45, 35, 25]) {
      const encode = spawnSync('cwebp', ['-quiet', '-q', String(quality), '-alpha_q', '100', '-o', out, '--', '-'], { input: crop.stdout });
      if (encode.status !== 0) throw new Error(`WebP encoding failed: ${month}/${name}`);
      size = (await stat(out)).size;
      if (size <= MAX_BYTES) break;
    }
    if (size > MAX_BYTES) throw new Error(`${month}/${name} exceeds 60 KB: ${size}`);
    summary['m' + month].strips[name] = { sheet, animation, row, bytes: size };
  }
  console.log(`m${month} ${entry.name}: ${Object.keys(strips).length} strips`);
}
await writeFile(join(output, 'manifest.json'), JSON.stringify({ cell: [WIDTH, HEIGHT], frames: FRAMES, months: summary }, null, 2) + '\n');
