import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryDb } from './d1-adapter.mjs';
import { containsContactDetails, containsPossibleClinicalIdentifier, redactContactDetails } from '../lib/automation/privacy.ts';
import { createAutomationRun, serveAutomationContext, acceptAutomationResult } from '../lib/automation/state.ts';
import { startRunSchema, resultSchema } from '../lib/automation/schema.ts';

test('B1: dates, year ranges, ISBNs and DOIs are not phone numbers', () => {
  for (const text of [
    'Published 2026-10-09', 'Retrieved 2026-10-09T05:00:00.000Z', 'Cohort 2019-2024', 'Follow-up 2019 - 2024',
    'ISBN 978-3-16-148410-0', 'ISBN 0-306-40615-2', 'ISBN: 0306406152', 'doi:10.1038/s41586-020-2649-2',
    'Dosis 0,75 mg', 'Am 01.02.2026 gelesen', 'PMID 31234567',
  ]) {
    assert.equal(containsContactDetails(text), false, text);
    assert.equal(redactContactDetails(text), text, text);
  }
});

test('B1: real phone numbers and emails are still detected and redacted', () => {
  for (const text of ['+49 451 1234567', 'Tel. 0451/1234567', '(0451) 123 4567', '+84 912 345 678']) {
    assert.equal(containsContactDetails(text), true, text);
    assert.match(redactContactDetails(text), /\[phone redacted\]/, text);
  }
  assert.equal(redactContactDetails('mail a@b.de'), 'mail [email redacted]');
});

test('B2: ordinary and simulated clinical teaching content passes', () => {
  for (const text of [
    'In this case, tumor purity lowers the observed VAF of a heterozygous variant.',
    'Simulated case: 58-year-old woman, NSCLC, EGFR L858R; the patient was diagnosed after a hospital visit.',
    'Ca giả lập: nữ 58 tuổi, ung thư phổi, đột biến EGFR.',
    'Patient: simulated 70-year-old man with primary mitral regurgitation before surgery.',
    'Fall: Patientin mit Mammakarzinom, 45 Jahre, Erstdiagnose im Tumorboard besprochen.',
  ]) {
    assert.equal(containsPossibleClinicalIdentifier(text, 'clinical'), false, text);
    assert.equal(containsPossibleClinicalIdentifier(text, 'clinical'), false, text);
  }
});

test('B2: identifying clinical details are still blocked', () => {
  for (const text of [
    'Max Mustermann, geb. 12.03.1961, Fall-Nr. 448812',
    'Patient: Jane Doe, MRN 123456',
    'Patientennummer 77812, Aufnahme Kardiologie',
    'Bệnh nhân Nguyễn Văn A, số hồ sơ 2231',
    'DOB 1961-03-12',
  ]) assert.equal(containsPossibleClinicalIdentifier(text, 'normal'), true, text);
  for (const text of [
    'Frau Schneider wurde wegen Vorhofflimmern behandelt.',
    'The patient was admitted on 12.03.2024 with chest pain.',
    'Bệnh nhân nhập viện ngày 12/03/2024.',
  ]) {
    assert.equal(containsPossibleClinicalIdentifier(text, 'clinical'), true, text);
    assert.equal(containsPossibleClinicalIdentifier(text, 'normal'), false, text);
  }
});

const now = new Date('2026-10-09T05:00:00.000Z');
const runner = { contractVersion: '1', trigger: 'manual', runner: { name: 'test-runner', version: '0.1.0', model: 'none' } };
const mtbLesson = {
  title: 'Tumor purity and VAF', objective: 'Interpret VAF in a simulated case', minutes: 30, level: 'Grundlagen',
  sections: [
    { heading: 'Concept', text: 'Observed VAF depends on tumor purity, ploidy and clonality.' },
    { heading: 'Simulated case', text: 'Simulated case: 58-year-old patient diagnosed with NSCLC; tumor purity 40%, KRAS VAF 18%.' },
  ],
  diagram: 'purity → expected VAF', exercise: 'Estimate the cancer cell fraction.',
  questions: [{ question: 'Is the variant clonal?', answer: 'Compare VAF with purity/2.' }, { question: 'What changes at 80% purity?', answer: 'Expected VAF doubles.' }],
  deliverable: 'One-paragraph interpretation.',
  sources: [{ title: 'Review on tumor purity (2019-2024 cohorts)', url: 'https://doi.org/10.1038/s41586-020-2649-2', readScope: 'Abstract and Figure 1', retrievedAt: '2026-10-09T04:00:00.000Z', publishedAt: '2026-10-01' }],
  nextTopic: 'Copy-number and ploidy',
};

test('a realistic MTB lesson with dates and a simulated case is accepted', async () => {
  const db = memoryDb({ through: "0025" });
  db.sqlite.prepare('INSERT INTO "user" (id,name,email,email_verified,created_at,updated_at,role,status) VALUES(?,?,?,?,?,?,?,?)').run('admin', 'Private Name', 'owner@example.test', 1, 1, 1, 'admin', 'active');
  const run = await createAutomationRun(db, 'test-runner', startRunSchema.parse(runner), null, now);
  const context = await serveAutomationContext(db, run.runId, 'test-runner', now);
  const target = context.targets.find((item) => item.track === 'MTB');
  const result = resultSchema.parse({ contractVersion: '1', contextHash: context.contextHash, summary: 'One MTB lesson.', items: [{ targetId: target.targetId, action: 'assign', expectedCurrentLessonId: null, lesson: mtbLesson }] });
  const saved = await acceptAutomationResult(db, run.runId, 'test-runner', result, now);
  assert.equal(saved.items.find((item) => item.targetId === target.targetId).outcome, 'assigned');
  db.sqlite.close();
});

test('H1.7: the notebook sensitivity, not the track name, picks the filter', async () => {
  for (const sensitivity of ['clinical', 'child_dev']) assert.equal(containsPossibleClinicalIdentifier('Frau Schneider kam heute.', sensitivity), true, sensitivity);
  assert.equal(containsPossibleClinicalIdentifier('Frau Schneider kam heute.', 'normal'), false);

  const db = memoryDb({ through: "0025" });
  db.sqlite.prepare('INSERT INTO "user" (id,name,email,email_verified,created_at,updated_at,role,status) VALUES(?,?,?,?,?,?,?,?)').run('admin', 'Private Name', 'owner@example.test', 1, 1, 1, 'admin', 'active');
  const notebook = db.sqlite.prepare("INSERT INTO subjects(id,learner_id,title,template,sensitivity,legacy_track,status,created_by,created_at,updated_at) VALUES(?, 'admin', ?, 'reading', ?, ?, 'active', 'test', 't', 't')");
  notebook.run('sub_00000000000000000001', 'Deutsch', 'clinical', 'Deutsch');
  notebook.run('sub_00000000000000000002', 'MTB', 'normal', 'MTB');
  const named = { ...mtbLesson, sections: [mtbLesson.sections[0], { heading: 'Dialog', text: 'Frau Schneider fragt nach dem Weg.' }] };
  const run = await createAutomationRun(db, 'test-runner', startRunSchema.parse(runner), null, now);
  const context = await serveAutomationContext(db, run.runId, 'test-runner', now);
  const target = (track) => context.targets.find((item) => item.track === track);
  const assign = (track) => resultSchema.parse({ contractVersion: '1', contextHash: context.contextHash, summary: 'x', items: [{ targetId: target(track).targetId, action: 'assign', expectedCurrentLessonId: null, lesson: named }] });
  await assert.rejects(acceptAutomationResult(db, run.runId, 'test-runner', assign('Deutsch'), now), (error) => error.status === 400, 'Deutsch notebook marked clinical blocks a titled name');
  const saved = await acceptAutomationResult(db, run.runId, 'test-runner', assign('MTB'), now);
  assert.equal(saved.items.find((item) => item.targetId === target('MTB').targetId).outcome, 'assigned', 'MTB notebook marked normal allows it');
  db.sqlite.close();
});
