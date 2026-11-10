import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {formatChemicalText,isChemistryNotebook} from '../lib/chemistry.ts';
import {validateLessonPackage} from '../lib/lesson-v2/validate.ts';
test('formula display preserves case, coefficients and charge ambiguity',()=>{
 assert.equal(formatChemicalText('2H2O + CO2; Co khác CO; Ca(OH)2'),'2H₂O + CO₂; Co khác CO; Ca(OH)₂');
 assert.equal(formatChemicalText('Ca2+'),'Ca2+');assert.equal(isChemistryNotebook('Hóa 7'),true);assert.equal(isChemistryNotebook('Deutsch A2'),false);
});
test('formula answer keys must be case sensitive in a chemistry notebook',()=>{
 const p=JSON.parse(readFileSync(new URL('../fixtures/lessons/deutsch-modalverb.json',import.meta.url),'utf8'));
 p.items[1].key={type:'text',accepted:['Co'],caseSensitive:false};
 assert(validateLessonPackage(p,{subjectTitle:'Hóa 7'}).issues.some(i=>i.code==='chemistry_case'));
 p.items[1].key.caseSensitive=true;assert.equal(validateLessonPackage(p,{subjectTitle:'Hóa 7'}).issues.length,0);
});

import {autoGrade} from '../lib/evidence/autograde.ts';
test('formula grading accepts displayed subscripts while preserving element letter case',()=>{
 assert.equal(autoGrade({type:'text',accepted:['H2O'],caseSensitive:true},'H₂O').result,'correct');
 assert.equal(autoGrade({type:'text',accepted:['CO'],caseSensitive:true},'Co').result,'incorrect');
});
