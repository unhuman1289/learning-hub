import test from 'node:test';
import assert from 'node:assert/strict';
import { inlineEmphasis } from '../lib/inline-emphasis.ts';
test('parses only paired bold and italic markers, keeping HTML as text', () => {
 assert.deepEqual(inlineEmphasis('A **wichtig** và *bitte* <img src=x>'), [
  {kind:'text',text:'A '},{kind:'strong',text:'wichtig'},{kind:'text',text:' và '},{kind:'em',text:'bitte'},{kind:'text',text:' <img src=x>'}]);
 assert.deepEqual(inlineEmphasis('dang dở **vẫn nguyên'),[{kind:'text',text:'dang dở **vẫn nguyên'}]);
});
