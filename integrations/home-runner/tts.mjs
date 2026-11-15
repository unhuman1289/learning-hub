import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { audioVariant } from '../../lib/audio/hash.mjs';

const exec = promisify(execFile);
const regions = new Set(['de-DE', 'zh-CN', 'en-US', 'vi-VN']);
const sampleRate = 22050;
const silence = Buffer.alloc(sampleRate * 0.4 * 2);

export async function probeTts(config, { run = exec } = {}) {
  if (!config?.trim()) return {};
  let stdout;
  try {
    ({ stdout } = await run('say', ['-v', '?'], { timeout: 10000 }));
  } catch {
    return {};
  }
  const available = new Set(stdout.split('\n').map(line => {
    const match = /^(.*?)\s+([a-z]{2}_[A-Z]{2})\s+#/.exec(line);
    return match ? match[2].replace('_', '-') + ':' + match[1].trim() : '';
  }));
  const voices = {};
  for (const entry of config.split(';')) {
    const match = /^\s*([a-z]{2}-[A-Z]{2}):\s*f=([^,;]+),\s*m=([^,;]+)\s*$/.exec(entry);
    if (!match || !regions.has(match[1])) continue;
    const [, lang, female, male] = match;
    const f = female.trim(), m = male.trim();
    if (f !== m && [f, m].every(name => name.length <= 100 && available.has(lang + ':' + name))) voices[lang] = { f, m };
  }
  return voices;
}

function pcmFromAiff(bytes) {
  if (bytes.toString('ascii', 0, 4) !== 'FORM') throw Error('say did not return AIFF.');
  for (let i = 12; i + 8 <= bytes.length;) {
    const length = bytes.readUInt32BE(i + 4);
    const end = i + 8 + length;
    if (end > bytes.length) break;
    if (bytes.toString('ascii', i, i + 4) === 'SSND' && length >= 8) {
      const start = i + 16 + bytes.readUInt32BE(i + 8);
      if (start < end && (end - start) % 2 === 0) return bytes.subarray(start, end);
      break;
    }
    i = end + length % 2;
  }
  throw Error('say returned an empty or invalid AIFF.');
}

function joinedAiff(turns) {
  const samples = Buffer.concat(turns.flatMap((turn, index) => index ? [silence, turn] : [turn]));
  const header = Buffer.alloc(54);
  header.write('FORM', 0);
  header.writeUInt32BE(samples.length + 46, 4);
  header.write('AIFFCOMM', 8);
  header.writeUInt32BE(18, 16);
  header.writeUInt16BE(1, 20);
  header.writeUInt32BE(samples.length / 2, 22);
  header.writeUInt16BE(16, 26);
  // 22050 Hz in the AIFF 80-bit extended format.
  Buffer.from('400dac44000000000000', 'hex').copy(header, 28);
  header.write('SSND', 38);
  header.writeUInt32BE(samples.length + 8, 42);
  return Buffer.concat([header, samples]);
}

export async function synthesize(audio, voices, { run = exec } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'hub-tts-'));
  try {
    const turns = [];
    for (const [index, line] of audio.lines.entries()) {
      const source = join(dir, index + '.txt');
      const aiff = join(dir, index + '.aiff');
      // The speech engine interprets [[...]] as embedded commands.
      await writeFile(source, line.text.replaceAll('[[', '[ ['));
      await run('say', ['-v', voices[line.speaker === 'a' ? 0 : 1], '-r', String(Math.round(175 * audio.rate)),
        '--data-format=BEI16@22050', '-o', aiff, '-f', source], { timeout: 30000 });
      turns.push(pcmFromAiff(await readFile(aiff)));
    }
    const joined = join(dir, 'joined.aiff');
    const output = join(dir, 'audio.m4a');
    await writeFile(joined, joinedAiff(turns));
    await run('afconvert', ['-f', 'm4af', '-d', 'aac', '-b', '64000', joined, output], { timeout: 30000 });
    return await readFile(output);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function uploadPlanAudio(hub, lease, context, result, render = synthesize, uploaded = new Set()) {
  const packages = result.subjects.flatMap(subject => [subject.primaryLesson, subject.reviewSet])
    .concat(result.explorations.map(exploration => exploration.lesson)).filter(Boolean);
  for (const lesson of packages) {
    for (const { audio } of lesson.items) {
      const pair = audio && context.tts?.voices[audio.lang];
      if (!pair) continue;
      for (const variant of ['f', 'm']) {
        const { hash, voices } = await audioVariant(audio, pair, variant);
        if (uploaded.has(hash)) continue;
        const bytes = await render(audio, voices);
        const spec = Buffer.from(JSON.stringify({ audio, variant }), 'utf8').toString('base64');
        await hub.putBinary(lease, hash, bytes, spec);
        uploaded.add(hash);
      }
    }
  }
}
