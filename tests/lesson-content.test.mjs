import test from 'node:test';
import assert from 'node:assert/strict';

const { lessonDetails } = await import('../app/lesson-content.ts');

test('prepared lessons include objectives, usable practice, answer rubrics and source scope', () => {
  assert.ok(Object.keys(lessonDetails).length >= 5);
  for (const [id, lesson] of Object.entries(lessonDetails)) {
    assert.ok(lesson.objective.length > 30, `${id}: objective`);
    assert.ok(lesson.sections.length >= 2, `${id}: concept sections`);
    assert.ok(lesson.exercise.length > 30, `${id}: practical exercise`);
    assert.ok(lesson.deliverable.length > 10, `${id}: concrete output`);
    assert.ok(lesson.questions.length >= 2 && lesson.questions.length <= 8, `${id}: question count`);
    assert.ok(lesson.questions.every((item) => item.rubric.length > 10), `${id}: answer rubric`);
    assert.ok(lesson.nextTopic.length > 10, `${id}: next topic`);
    assert.ok(lesson.sources.length > 0, `${id}: sources`);
    for (const source of lesson.sources) {
      assert.ok(source.url.startsWith('https://'), `${id}: secure source URL`);
      assert.ok(source.readScope.length > 20, `${id}: read scope`);
      assert.ok(Number.isFinite(Date.parse(source.retrievedAt)), `${id}: retrieval time`);
    }
  }
});

test('SWARM and mitral lessons keep research and clinical boundaries explicit', () => {
  assert.match(lessonDetails.swarm.note, /không phải khuyến nghị điều trị/i);
  assert.match(lessonDetails.swarm.note, /không tải dữ liệu bệnh nhân/i);
  assert.match(lessonDetails.mitral.note, /Chưa xác minh tính mới/i);
  assert.match(lessonDetails.mitral.sections[2].text, /Cardioband/);
  assert.match(lessonDetails.mitral.sections[4].text, /STROBE giúp báo cáo/i);
});
