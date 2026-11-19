import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reflectionSaveButton } from '../lib/lesson-v2/reflection-form.ts';

test('Save becomes disabled Saved only when the confirmed reflection matches the form', () => {
  const saved = { difficulty: 'fit', usefulness: 'useful', note: 'Thêm ví dụ.' };
  assert.deepEqual(reflectionSaveButton(saved, null, false, false), {label:'Lưu',disabled:true});
  assert.deepEqual(reflectionSaveButton(saved, null, true, false), {label:'Lưu',disabled:false});
  assert.deepEqual(reflectionSaveButton(saved, null, true, true), {label:'Đang lưu…',disabled:true});
  assert.deepEqual(reflectionSaveButton({...saved}, saved, true, false), {label:'Đã lưu',disabled:true});
  for (const edited of [{ difficulty:'easy' }, { usefulness:'mixed' }, { note:'Thêm hình.' }]) {
    assert.deepEqual(reflectionSaveButton({...saved,...edited}, saved, true, false), {label:'Lưu',disabled:false});
  }
});
