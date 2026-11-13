import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { itemPolicy } from '../lib/subjects/item-kinds.ts';
import { normalizeLesson } from '../integrations/home-runner/job.mjs';
import { validateLessonPackage } from '../lib/lesson-v2/validate.ts';

const folder = new URL('../tests/fixtures/qwen/', import.meta.url);
const fixtures = readdirSync(folder).filter(name => name.endsWith('.json')).sort();
assert(fixtures.length, 'Thiếu fixture Qwen.');
for (const name of fixtures) {
  const fixture = JSON.parse(readFileSync(new URL(name, folder), 'utf8'));
  const options = { aiSizes: true, adaptive: true, frameworkKey: fixture.frameworkKey, itemKinds: itemPolicy(fixture.frameworkKey).kinds };
  const before = validateLessonPackage(fixture.lesson, options);
  const after = validateLessonPackage(normalizeLesson(fixture.lesson), options);
  console.log(name, before.lesson ? 'hợp lệ' : 'bị từ chối', '→', after.lesson ? 'hợp lệ' : 'bị từ chối');
  for (const issue of after.issues.slice(0, 6)) console.log(' ', issue.path, issue.code, issue.message);
  if (fixture.expectedIssues?.length) {
    for (const path of fixture.expectedIssues)
      assert(after.issues.some(issue => issue.path === path), `${name} cần báo lỗi tại ${path}`);
  } else if (fixture.expectedIssues) {
    assert(after.lesson, `${name} cần qua kiểm tra sau khi sửa tự động`);
  }
}
