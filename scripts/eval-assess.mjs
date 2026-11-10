// Grading quality and speed of a home-runner engine on authored answers (docs/plan/LOCAL-GRADER.md L1.1, L1.5).
// node --experimental-strip-types scripts/eval-assess.mjs [--engine qwen|codex] [--model <id>] [--cases fixtures/eval/assess/deutsch.json] [--only s1]
// Runs offline against the engine only: no Hub, no learner data. Codex spends ChatGPT plan quota.
import { readFileSync } from 'node:fs';
import { assessResult } from '../lib/contracts/ai-common.ts';
import { codexEngine, qwenEngine } from '../integrations/home-runner/engines.mjs';
import { contractFor, systemPrompt, userPrompt } from '../integrations/home-runner/job.mjs';

const args = process.argv.slice(2),
  arg = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const file = arg('--cases', 'fixtures/eval/assess/deutsch.json'),
  engineName = arg('--engine', 'qwen'),
  only = arg('--only');
const cases = JSON.parse(readFileSync(file, 'utf8'));
const engine =
  engineName === 'codex'
    ? codexEngine({ model: arg('--model') })
    : qwenEngine({ baseUrl: arg('--base', 'http://127.0.0.1:1234/v1'), model: arg('--model', 'qwen/qwen3.6-35b-a3b') });
if (!(await engine.available())) throw Error(engineName + ' is not available.');

const hex = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, '0')).join('');
export function contextFor(sub) {
  const skills = [...new Set(Object.values(cases.items).flatMap((i) => i.skills))];
  return {
    contract: 'assess-context/1',
    jobId: 'job_' + hex(10),
    purpose: 'submission',
    contextHash: 'sha256:' + hex(32),
    learner: { ref: 'lrn_' + hex(6), displayName: 'Học viên thử', role: 'adult', explainLanguage: 'vi' },
    subject: {
      subjectId: 'sub_eval',
      title: 'Deutsch',
      goal: 'A2 → B2; viết email công việc, nói trong đời sống ở Lübeck',
      level: 'A2',
      sensitivity: 'normal',
    },
    lesson: { lessonId: 'les_eval', template: 'skill', ...cases.lesson },
    attempts: Object.entries(sub.answers).map(([itemId, a]) => {
      const item = cases.items[itemId];
      return {
        attemptId: 'att_' + sub.id + '_' + itemId,
        itemId,
        stage: 'independent',
        activity: 'create',
        input: 'long',
        skills: item.skills,
        prompt: item.prompt,
        rubric: item.rubric,
        solution: item.solution,
        key: null,
        answer: a.answer,
        attachments: [],
        support: 'none',
        attemptNo: 1,
        previousAttempts: [],
        autoGrade: null,
      };
    }),
    skills: skills.map((s, i) => ({
      skillId: s,
      key: s.slice(4),
      name: s.slice(4),
      pathOrder: i,
      prerequisites: [],
      status: 'active',
      mastery: 'developing',
      masteryCeiling: 'developing',
      masterySource: 'rules',
      dims: { knowledge: 1, recognition: 1, application: 1, retention: 0 },
      nextReviewDay: null,
      reviewKind: null,
      maintained: false,
    })),
    openErrorPatterns: [],
    recentEvidence: [],
    recheck: null,
    calibration: [],
    truncated: [],
  };
}

const rows = [];
let totalMs = 0,
  jsonOk = 0,
  runs = 0;
for (const sub of cases.submissions.filter((s) => !only || s.id === only)) {
  const context = contextFor(sub);
  const started = Date.now();
  let out, error;
  try {
    out = await engine.run({ system: systemPrompt('assess', 'submission'), user: userPrompt(context), schema: contractFor('assess').json });
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  const ms = Date.now() - started;
  totalMs += ms;
  runs++;
  const parsed = out ? assessResult.safeParse({ ...out.json, contextHash: context.contextHash, usage: { ...out.usage, model: 'eval' } }) : null;
  if (parsed?.success) jsonOk++;
  for (const [itemId, a] of Object.entries(sub.answers)) {
    const g = parsed?.success ? parsed.data.grades.find((x) => x.attemptId === 'att_' + sub.id + '_' + itemId) : null;
    const facets = [...new Set((g?.errors ?? []).map((e) => /^([GPN]):/.exec(e.label)?.[1]).filter(Boolean))].sort();
    const badEvidence = (g?.errors ?? []).filter((e) => !a.answer.includes(e.evidence)).length;
    rows.push({
      case: sub.id + '/' + itemId,
      expected: a.expected,
      got: g?.result ?? (error ? 'error' : parsed && !parsed.success ? 'schema' : 'missing'),
      match: g?.result === a.expected,
      facets: facets.join('') || '-',
      expectedFacets: a.facets.sort().join('') || '-',
      badEvidence,
      injection: !!a.injection,
      falseIncorrect: a.expected === 'correct' && g?.result === 'incorrect' && !(g?.errors ?? []).length,
    });
  }
  console.error(
    sub.id +
      ': ' +
      (error ?? (parsed?.success ? 'ok' : 'schema ' + parsed?.error.issues[0]?.message)) +
      ' in ' +
      (ms / 1000).toFixed(1) +
      ' s' +
      (out ? ', tokens ' + out.usage.inputTokens + '→' + out.usage.outputTokens : ''),
  );
}
console.table(rows);
const graded = rows.filter((r) => !['error', 'schema', 'missing'].includes(r.got));
const facetRows = rows.filter((r) => r.expectedFacets !== '-' || r.facets !== '-');
console.log(
  JSON.stringify(
    {
      engine: engineName,
      submissions: runs,
      meanSecondsPerSubmission: +(totalMs / runs / 1000).toFixed(1),
      validJsonFirstTry: jsonOk + '/' + runs,
      resultAgreement: rows.filter((r) => r.match).length + '/' + rows.length,
      falseIncorrectWithoutEvidence: rows.filter((r) => r.falseIncorrect).length,
      injectionShifted: rows.filter((r) => r.injection && !r.match).length + '/' + rows.filter((r) => r.injection).length,
      facetAgreement: facetRows.filter((r) => r.facets === r.expectedFacets).length + '/' + facetRows.length,
      evidenceNotVerbatim: rows.reduce((n, r) => n + r.badEvidence, 0),
      graded: graded.length + '/' + rows.length,
    },
    null,
    2,
  ),
);
