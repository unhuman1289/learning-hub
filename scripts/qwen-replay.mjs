import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { itemPolicy } from '../lib/subjects/item-kinds.ts';
import { normalizeLesson } from '../integrations/home-runner/job.mjs';
import { validateLessonPackage } from '../lib/lesson-v2/validate.ts';

import { normalizeNumericKeyValue, numericKeyValuePattern, parseNumericAnswer } from '../lib/lesson-v2/numeric.ts';

const numericPattern = new RegExp(numericKeyValuePattern);
const folder = new URL('../tests/fixtures/qwen/', import.meta.url);
const fixtures = readdirSync(folder).filter(name => name.endsWith('.json')).sort();
assert(fixtures.length, 'Thiếu fixture Qwen.');
for (const name of fixtures) {
  const fixture = JSON.parse(readFileSync(new URL(name, folder), 'utf8'));
  if (fixture.numericCaptures) {
    const rawValues = fixture.numericCaptures.flatMap(capture => Object.values(capture.items));
    assert.equal(rawValues.length, 20);
    for (const raw of rawValues) {
      assert(!numericPattern.test(raw), JSON.stringify(raw));
      assert.equal(parseNumericAnswer(normalizeNumericKeyValue(raw)), null, JSON.stringify(raw));
    }
    for (const { raw, normalized, valid } of fixture.normalizationCases) {
      assert.equal(normalizeNumericKeyValue(raw), normalized);
      assert.equal(numericPattern.test(normalized), valid, normalized);
      assert.equal(Boolean(parseNumericAnswer(normalized)), valid, normalized);
    }
    console.log(name, rawValues.length, 'giá trị bị từ chối;', fixture.normalizationCases.length, 'ca chuẩn hoá đã kiểm');
    continue;
  }
  const options = { aiSizes: true, adaptive: true, frameworkKey: fixture.frameworkKey, itemKinds: itemPolicy(fixture.frameworkKey).kinds };
  const before = validateLessonPackage(fixture.lesson, { ...options, aiSizes: false });
  const after = validateLessonPackage(normalizeLesson(fixture.lesson), options);
  console.log(name, before.lesson ? 'hợp lệ' : 'bị từ chối', '→', after.lesson ? 'hợp lệ' : 'bị từ chối');
  for (const issue of after.issues.slice(0, 6)) console.log(' ', issue.path, issue.code, issue.message);
  if (fixture.expectedRubricItem) {
    const item = after.lesson?.items.find(item => item.id === fixture.expectedRubricItem);
    const original = fixture.lesson.items.find(item => item.id === fixture.expectedRubricItem);
    assert(before.issues.some(issue => issue.path.endsWith('/key/accepted')));
    assert(item?.rubric?.length >= 2 && !item.key, `${name} cần chuyển sang rubric`);
    assert.equal(item.solution, original.solution);
    assert.equal(item.input, original.input);
    assert.equal(item.prompt, original.prompt);
    assert.equal(fixture.lesson.items.filter(item => item.key).length - 1, after.lesson.items.filter(item => item.key).length);
    console.log('  rubric', item.id, 'giữ đề và lời giải mẫu');
  }
  if (fixture.expectedIssues?.length) {
    for (const path of fixture.expectedIssues)
      assert(after.issues.some(issue => issue.path === path), `${name} cần báo lỗi tại ${path}`);
  } else if (fixture.expectedIssues) {
    assert(after.lesson, `${name} cần qua kiểm tra sau khi sửa tự động`);
  }
}
