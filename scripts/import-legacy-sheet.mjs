// One-time import of the Deutsch Google Sheet (Project v6.1: TAGS, ITEMS, ATTEMPTS) into a notebook (docs/plan/LOCAL-GRADER.md L4).
// node scripts/import-legacy-sheet.mjs --dir private-data/legacy-sheets/<day> --learner <id> --subject <sub_…> [--today YYYY-MM-DD] [--out file.sql]
// Writes SQL only; apply it with `wrangler d1 execute … --file` (local first, then staging, then production after a backup).
// The learner model recomputes mastery from Hub evidence, so legacy mastery, errors and due items go into the notebook prompt
// (subjects.instructions) where the lesson writer reads them and the learner can edit them. Skills are created from TAGS.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const MARKER = '[Từ Google Sheets';

/** RFC 4180 CSV: quoted fields, doubled quotes, commas and newlines inside quotes. */
export function parseCsv(text) {
  const rows = [];
  let row = [],
    field = '',
    quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') (field += '"'), i++;
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') row.push(field), (field = '');
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field), rows.push(row), (row = []), (field = '');
    } else field += c;
  }
  if (field || row.length) row.push(field), rows.push(row);
  const [header = [], ...body] = rows.filter((r) => r.some((x) => x.trim()));
  const keys = header.map((h) => h.trim().toLowerCase());
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').trim()])));
}

const facetOf = (kind) => ({ G: 'g', P: 'p', N: 'n' })[String(kind).trim().toUpperCase()] ?? 'g';
const slug = (s) =>
  String(s)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70) || 'tag';
const id = (prefix, value) =>
  prefix +
  createHash('sha256')
    .update('legacy:' + value)
    .digest('hex')
    .slice(0, 20);
const sql = (v) => (v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : "'" + String(v).replaceAll("'", "''") + "'");
const day = (s) => (/^\d{4}-\d{2}-\d{2}/.test(s ?? '') ? s.slice(0, 10) : /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s ?? '') ? isoFromDmy(s) : null);
function isoFromDmy(s) {
  const [d, m, y] = s.split('/').map(Number);
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
const addDays = (iso, n) => new Date(Date.parse(iso + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const truthy = (v) => /^(1|true|yes|ja|x|✓|mastered|graduated)$/i.test(String(v ?? '').trim());

/** Builds the skills, the legacy summary for the notebook prompt, the SQL and a report. Pure: no I/O. */
export function buildImport({ tags, items, attempts, learnerId, subjectId, today, now = new Date().toISOString() }) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(learnerId ?? '') || !/^sub_[a-z0-9]{20}$/.test(subjectId ?? ''))
    throw Error('learner and subject ids are required.');
  const active = tags.filter((t) => t.tag_id && !/^(archived|retired|merged)$/i.test(t.status ?? ''));
  const masteredKey = Object.keys(tags[0] ?? {}).find((k) => /master/.test(k));
  const skills = active.map((t, i) => {
    const facet = facetOf(t.kind);
    return {
      id: id('sk_', subjectId + ':' + t.tag_id),
      key: (facet + '-' + slug(t.tag_id)).slice(0, 80),
      name: (t.label || t.tag_id).slice(0, 120),
      description: (t.description ?? '').slice(0, 500),
      order: i,
      tag: t.tag_id,
      facet: facet.toUpperCase(),
      mastered: masteredKey ? truthy(t[masteredKey]) : false,
    };
  });
  const byTag = new Map(skills.map((s) => [s.tag, s]));
  const live = items.filter((it) => !/^graduated$/i.test(it.status ?? ''));
  const recurring = live
    .filter((it) => Number(it.misses) > 0)
    .sort((a, b) => Number(b.misses) - Number(a.misses))
    .slice(0, 12);
  const soon = live
    .filter((it) => day(it.next_due) && day(it.next_due) <= addDays(today, 14))
    .sort((a, b) => day(a.next_due).localeCompare(day(b.next_due)))
    .slice(0, 15);
  const from30 = addDays(today, -30);
  const recent = attempts.filter((a) => day(a.date) && day(a.date) >= from30 && a.first_ok !== '' && a.evidence === 'free');
  const rate = (rows) => {
    const independent = rows.filter((a) => a.first_ok === '1' && (a.hints === '0' || a.hints === '')).length;
    return rows.length ? `${independent}/${rows.length}` : '–';
  };
  const facetRate = ['G', 'P', 'N'].map((f) => `${f} ${rate(recent.filter((a) => (a.kind || byTag.get(a.tag)?.facet) === f))}`).join(', ');
  const lines = [
    `${MARKER} đến ${today}; bản gốc giữ chỉ đọc]`,
    `Thành công độc lập 30 ngày (lần đầu, không gợi ý): ${facetRate}.`,
    skills.some((s) => s.mastered)
      ? `Đã thành thạo theo Sheet: ${skills
          .filter((s) => s.mastered)
          .map((s) => s.name)
          .join('; ')}.`
      : null,
    recurring.length
      ? 'Lỗi hay lặp lại (số lần sai): ' +
        recurring.map((it) => `${it.target || it.item_id} [${byTag.get(it.tag)?.facet ?? '?'}] (${it.misses})`).join('; ') +
        '.'
      : null,
    soon.length ? 'Mục đến hạn ôn trong 14 ngày: ' + soon.map((it) => `${it.target || it.item_id} (${day(it.next_due)})`).join('; ') + '.' : null,
    'Dùng phần này để chọn bài ôn và bài mới; mức thành thạo trong Hub được tính lại từ bài làm mới.',
  ].filter(Boolean);
  let summary = lines.join('\n');
  if (summary.length > 2500) summary = summary.slice(0, 2490) + ' …';
  const statements = [
    ...skills.map(
      (s) =>
        `INSERT OR IGNORE INTO skills(id,subject_id,learner_id,key,name,description,path_order,prerequisites,status,origin,created_at,updated_at) VALUES(${[s.id, subjectId, learnerId, s.key, s.name, s.description, s.order, '[]', 'active', 'migration', now, now].map(sql).join(',')});`,
    ),
    // Appended once (the marker makes a re-run a no-op) and kept within the 4000-character notebook prompt.
    `UPDATE subjects SET instructions=substr(CASE WHEN instructions='' THEN ${sql(summary)} ELSE instructions||char(10)||char(10)||${sql(summary)} END,1,4000),revision=revision+1,updated_at=${sql(now)} WHERE id=${sql(subjectId)} AND learner_id=${sql(learnerId)} AND instr(instructions,${sql(MARKER)})=0;`,
  ];
  return {
    skills,
    summary,
    sql: statements.join('\n') + '\n',
    report: {
      tags: tags.length,
      skills: skills.length,
      byFacet: Object.fromEntries(['G', 'P', 'N'].map((f) => [f, skills.filter((s) => s.facet === f).length])),
      mastered: skills.filter((s) => s.mastered).length,
      masteredColumn: masteredKey ?? null,
      items: items.length,
      recurring: recurring.length,
      dueIn14Days: soon.length,
      attemptsLast30Days: recent.length,
      unknownTagsInItems: [...new Set(items.map((it) => it.tag).filter((t) => t && !byTag.has(t)))].slice(0, 10),
      summaryChars: summary.length,
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2),
    arg = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
  const dir = arg('--dir');
  if (!dir || !arg('--learner') || !arg('--subject'))
    throw Error('Usage: --dir <csv folder> --learner <id> --subject <sub_…> [--today YYYY-MM-DD] [--out file.sql]');
  const read = (name) => parseCsv(readFileSync(join(dir, name), 'utf8'));
  const result = buildImport({
    tags: read('TAGS.csv'),
    items: read('ITEMS.csv'),
    attempts: read('ATTEMPTS.csv'),
    learnerId: arg('--learner'),
    subjectId: arg('--subject'),
    today: arg('--today') ?? new Date().toISOString().slice(0, 10),
  });
  console.log(JSON.stringify(result.report, null, 2));
  console.log('\n--- Notebook prompt addition ---\n' + result.summary);
  if (arg('--out')) {
    writeFileSync(arg('--out'), result.sql, { mode: 0o600 });
    console.log('\nSQL written to ' + arg('--out') + ' (dry run until applied with wrangler d1 execute --file).');
  }
}
