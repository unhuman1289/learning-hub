// One-way copy of each listed profile's history into a Google Drive for desktop folder (L5.6). Drive syncs the files;
// nothing on Drive flows back to the Hub. Runs once per Berlin day, after 03:00.
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const berlin = (now) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  })
    .formatToParts(now)
    .reduce((o, p) => ({ ...o, [p.type]: p.value }), {});

export function mirrorDue(lastDay, now = new Date()) {
  const p = berlin(now),
    today = `${p.year}-${p.month}-${p.day}`;
  return Number(p.hour) >= 3 && lastDay !== today ? today : null;
}

export async function mirrorHistory(hub, { dir, learnerIds }, log = () => {}) {
  if (!dir || !learnerIds.length) return 0;
  await mkdir(dir, { recursive: true });
  let written = 0;
  for (const id of learnerIds) {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) continue;
    try {
      const markdown = await hub.history(id);
      const file = join(dir, `lich-su-${id}.md`),
        tmp = file + '.tmp';
      await writeFile(tmp, markdown, { mode: 0o600 });
      await rename(tmp, file);
      written++;
    } catch (error) {
      log({ event: 'mirror_error', learner: id, message: error instanceof Error ? error.message : String(error) });
    }
  }
  log({ event: 'mirror', written });
  return written;
}
