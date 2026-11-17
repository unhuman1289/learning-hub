// Requires ImageMagick and cwebp. Input stays outside Git; output defaults to ignored private-data/.
import { readFile, mkdir, stat, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
const [source, output = 'private-data/tutor-sprite/rows'] = process.argv.slice(2);
if (!source) throw new Error('Usage: node scripts/tutor-sprite.mjs <source directory> [output directory]');
const manifest = JSON.parse(await readFile(join(source, 'manifest.json'), 'utf8'));
if (manifest.cell?.join(',') !== '192,208' || manifest.rows?.length !== 17) throw new Error('Unexpected sprite manifest');
await mkdir(output, { recursive: true });
for (const {row, name, frames} of manifest.rows) {
  if (!/^[a-z_]+$/.test(name) || !Number.isInteger(row) || row < 0 || row > 16 || !Number.isInteger(frames) || frames < 1 || frames > 8) throw new Error('Invalid row');
  const out = resolve(output, `${name}.webp`);
  const crop = spawnSync('magick', [join(source, 'sheet-v2.webp'), '-crop', `${frames * 192}x208+0+${row * 208}`, '+repage', '-resize', '50%', 'png:-'], {maxBuffer: 30_000_000});
  if (crop.status !== 0) throw new Error(`Crop failed: ${name}`);
  let size = Infinity;
  for (const quality of [85, 75, 65, 55, 45, 35, 25, 15, 5]) {
    const encode = spawnSync('cwebp', ['-quiet', '-q', String(quality), '-alpha_q', '100', '-o', out, '--', '-'], {input: crop.stdout});
    if (encode.status !== 0) throw new Error(`WebP encoding failed: ${name}`);
    size = (await stat(out)).size;
    if (size <= 40_000) break;
  }
  if (size > 40_000) throw new Error(`${name} exceeds 40 KB: ${size}`);
  console.log(`${name}: ${size} bytes`);
}

await writeFile(join(output, 'manifest.json'), JSON.stringify({cell: [96, 104], rows: manifest.rows}, null, 2) + '\n');
