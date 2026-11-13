import assert from 'node:assert/strict';
import test from 'node:test';
import { hasVietnameseTyping } from '../app/hub/lesson-v2/keyboard.ts';

test('German answers detect Vietnamese keyboard marks without flagging ordinary German or acute accents', () => {
  for (const answer of ['Hấu', 'đas', 'Ha\u0302\u0301u']) {
    assert.equal(hasVietnameseTyping(answer), true, answer);
  }
  for (const answer of ['Haus', 'ä ö ü ß é', 'Über']) {
    assert.equal(hasVietnameseTyping(answer), false, answer);
  }
});
