import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
// Deterministic test runner only. Its server client MUST be restricted with learnerIds to QA accounts.
export function fakeResult(context, fixture) {
  const usage = { model: 'none', inputTokens: 0, outputTokens: 0, ms: 0 };
  if (context.contract === 'assess-context/1')
    return {
      contract: 'assess-result/1',
      contextHash: context.contextHash,
      summary: 'Kiểm thử bằng runner giả; không phải đánh giá sư phạm.',
      grades: context.attempts
        .filter((a) => !a.autoGrade)
        .map((a) => {
          const readable = !a.attachments.some((img) => !img.expired),
            correct = readable && a.answer.trim().normalize('NFC') === a.solution.trim().normalize('NFC');
          return {
            attemptId: a.attemptId,
            result: !readable ? 'ungradable' : correct ? 'correct' : 'incorrect',
            score: correct ? 1 : 0,
            rubricScores: !readable ? [] : (a.rubric ?? []).map((r) => ({ criterion: r.criterion, points: correct ? r.points : 0, max: r.points })),
            feedback: !readable ? 'Runner giả không đọc ảnh.' : 'Kết quả kỹ thuật của dữ liệu thử, không dùng để đánh giá người học.',
            correction: a.solution,
            errors: [],
            checkItem: null,
          };
        }),
      diagnosis: [],
      masteryProposals: [],
      errorPatternUpdates: [],
      reviewProposals: [],
      recheckDecision: null,
      usage,
    };
  if (context.contract !== 'plan-context/1') throw Error('Unknown context contract.');
  const lessonFixture = { knowledge: [], ...fixture, contract: 'lesson-package/3' };
  const requests = context.purpose === 'request' ? context.explorations : [];
  return {
    contract: 'plan-result/1',
    contextHash: context.contextHash,
    summary: 'Kiểm thử giao bài qua API v2.',
    subjects: context.subjects.map((s) => {
      const lesson = structuredClone(lessonFixture),
        assign = context.purpose !== 'request' && s.slot.eligibleForPrimary;
      lesson.title = 'QA · ' + fixture.title;
      lesson.items = lesson.items.map((i) => ({ ...i, prompt: i.prompt + ' [bài thử ' + context.jobId + ']' }));
      const existing = new Set(s.skills.map((sk) => sk.key)),
        keys = [
          ...new Set([...lesson.targetSkills, ...lesson.items.flatMap((i) => i.skills)].filter((r) => r.startsWith('key:')).map((r) => r.slice(4))),
        ];
      const skillChanges = assign
        ? keys
            .filter((k) => !existing.has(k))
            .map((key, index) => ({ op: 'add', key, name: 'QA ' + key, description: 'Kỹ năng dữ liệu thử', pathOrder: index, prerequisites: [] }))
        : [];
      if (context.purpose === 'initial' && assign) {
        lesson.kind = 'diagnostic';
        while (skillChanges.length < 8) {
          const key = 'qa-foundation-' + skillChanges.length;
          skillChanges.push({ op: 'add', key, name: 'QA ' + key, description: 'Dữ liệu thử', pathOrder: skillChanges.length, prerequisites: [] });
        }
      }
      return {
        subjectId: s.subjectId,
        expectedRevision: s.revision,
        expectedOpenPrimaryLessonId: s.slot.openPrimaryLessonId,
        action: assign ? 'assign' : 'no_action',
        reason: assign ? 'Bài kỹ thuật cho tài khoản QA' : 'Giữ bài chưa xong hoặc chưa qua mốc 03:00',
        skillChanges,
        primaryLesson: assign ? lesson : null,
        reviewSet: null,
        masteryProposals: [],
        progressSummary: 'Chạy thử kỹ thuật, không suy luận năng lực.',
        requestsHandled: [],
      };
    }),
    explorations: requests.map(request => ({
      requestId: request.requestId,
      action: 'assign',
      subjectId: request.subjectId,
      lesson: {
        ...structuredClone(lessonFixture),
        kind: context.adaptive?.mode === 'practice' ? 'remediation' : lessonFixture.kind,
        estMinutes: context.adaptive?.minutes ?? lessonFixture.estMinutes,
        items: lessonFixture.items.map(item => ({ ...item, prompt: item.prompt + ' [bài thử ' + context.jobId + ']' })),
      },
      reason: 'Bài mẫu để thử luồng xin bài.',
    })),
    usage,
  };
}
export async function runFake({ baseUrl, credentials, fixture, max = 5, fetcher = fetch }) {
  const url = new URL(baseUrl);
  if (!((url.protocol === 'http:' && url.hostname === 'localhost') || url.origin === 'https://learning-hub-staging.tranvu-812.workers.dev'))
    throw Error('Fake runner refuses production or unknown hosts.');
  if (!/^lrn_[a-f0-9]{12}$/.test(credentials.expectedLearnerRef ?? '')) throw Error('QA learner ref is mandatory.');
  const headers = {
    'Content-Type': 'application/json',
    Authorization: credentials.bearer,
    ...(credentials.accessClientId
      ? { 'CF-Access-Client-Id': credentials.accessClientId, 'CF-Access-Client-Secret': credentials.accessClientSecret }
      : {}),
  };
  const call = async (path, method = 'GET', body, leaseToken) => {
    const response = await fetcher(url.origin + '/api/automation/v2' + path, {
        method,
        headers: { ...headers, ...(leaseToken ? { 'X-Lease-Token': leaseToken } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      value = await response.json().catch(() => null);
    if (!response.ok) throw Error('Runner API ' + response.status + ' (' + (value?.errors?.map((e) => e.code).join(',') ?? 'request rejected') + ')');
    return value;
  };
  const reports = [];
  for (let n = 0; n < max; n++) {
    const leased = await call('/jobs/lease', 'POST', {
        kinds: ['assess', 'plan'],
        max: 1,
        ...(url.hostname === 'localhost' ? { capabilities: ['lesson-v3', 'adaptive-plan', 'local-grading'] } : {}),
        runner: { name: 'h5-fake-runner', version: '1', model: 'none' },
      }),
      job = leased.jobs[0];
    if (!job) break;
    const context = await call('/jobs/' + job.jobId + '/context', 'GET', undefined, job.leaseToken);
    if (context.learner.ref !== credentials.expectedLearnerRef) {
      await call('/jobs/' + job.jobId + '/fail', 'POST', { error: 'QA scope mismatch', retryable: true }, job.leaseToken);
      throw Error('Fake runner refuses non-QA learner.');
    }
    const result = fakeResult(context, fixture);
    await call('/jobs/' + job.jobId + '/result?dryRun=1', 'POST', result, job.leaseToken);
    try {
      await call('/jobs/' + job.jobId + '/result', 'POST', result, job.leaseToken);
    } catch (error) {
      const state = await call('/jobs/' + job.jobId);
      if (state.status !== 'succeeded') throw error;
    }
    const verified = await call('/jobs/' + job.jobId);
    if (verified.status !== 'succeeded') throw Error('Job did not save a confirmed outcome.');
    reports.push({ jobId: job.jobId, status: verified.status, outcome: verified.outcome });
  }
  return reports;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2),
    arg = (k) => args[args.indexOf(k) + 1];
  if (!args.includes('--credentials'))
    throw Error('Usage: --origin <localhost|staging> --credentials <private JSON> [--fixture <authored lesson>]');
  const credentials = JSON.parse(readFileSync(arg('--credentials'), 'utf8')),
    fixture = JSON.parse(readFileSync(args.includes('--fixture') ? arg('--fixture') : 'fixtures/lessons/deutsch-modalverb.json', 'utf8'));
  const baseUrl = args.includes('--origin') ? arg('--origin') : `http://localhost:${process.env.LEARNING_HUB_DEMO_PORT ?? '5174'}`;
  console.log(JSON.stringify(await runFake({ baseUrl, credentials, fixture }), null, 2));
}
