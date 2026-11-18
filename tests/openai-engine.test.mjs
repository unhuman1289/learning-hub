import assert from 'node:assert/strict';
import test from 'node:test';
import { openAiEngine } from '../integrations/home-runner/openai.mjs';

const input = {
  system: 'Return a synthetic grade.',
  user: 'Demo answer.',
  schema: { type: 'object', properties: { score: { type: 'number' }, comment: { type: 'string' } }, required: ['score'] },
};

test('OpenAI uses Responses, a strict schema, and the intended model for each job', async () => {
  for (const [kind, purpose, model] of [
    ['assess', 'submission', 'gpt-6-luna'],
    ['assess', 'recheck', 'gpt-6.1-terra'],
    ['plan', 'daily', 'gpt-6.1-terra'],
  ]) {
    const engine = openAiEngine({ apiKey: 'test-key', kind, purpose, fetcher: async (url, request) => {
      assert.equal(url, 'https://api.openai.com/v1/responses');
      const body = JSON.parse(request.body);
      assert.equal(body.model, model);
      assert.equal(body.store, false);
      if (kind === 'plan') {
        assert.equal(body.text.format.type, 'json_object');
        assert.match(body.input, /"required":\["score"\]/);
      } else {
        assert.equal(body.text.format.strict, true);
        assert.deepEqual(body.text.format.schema.required, ['score', 'comment']);
      }
      assert.equal(request.redirect, 'manual');
      return Response.json({
        status: 'completed',
        output: [
          { type: 'reasoning' },
          { type: 'message', content: [{ type: 'output_text', text: '{"score":1,"comment":null}' }] },
        ],
        usage: { input_tokens: 31, output_tokens: 20 },
      });
    } });
    const result = await engine.run(input);
    assert.deepEqual(result.json, { score: 1 });
    assert.equal(result.usage.inputTokens, 31);
    assert.equal(result.usage.outputTokens, 20);
  }
});

test('OpenAI rejects images before fetch and treats exhausted credit as non-retryable', async () => {
  let calls = 0;
  const engine = openAiEngine({ apiKey: 'test-key', kind: 'assess', fetcher: async () => {
    calls++;
    return Response.json({ error: { code: 'credit_balance_exhausted', message: 'private value' } }, { status: 429 });
  } });
  await assert.rejects(engine.run({ ...input, images: [{}] }), /only supports text/);
  assert.equal(calls, 0);
  await assert.rejects(engine.run(input), error => error.retryable === false && !error.message.includes('private value'));
});

test('OpenAI runner is scoped to explicit demo notebooks on staging', async () => {
  const { buildFromConfig, leaseRequest } = await import('../integrations/home-runner/runner.mjs');
  const config = {
    RUNNER_ENGINE: 'openai',
    OPENAI_API_KEY: 'test-key',
    HUB_BASE_URL: 'https://learning-hub-staging.tranvu-812.workers.dev',
    RUNNER_SUBJECT_IDS: 'sub_0123456789abcdef0123',
    HUB_BEARER: 'lhk_test_' + 'x'.repeat(40),
    HUB_ACCESS_CLIENT_ID: 'demo',
    HUB_ACCESS_CLIENT_SECRET: 'demo',
  };
  const runner = buildFromConfig(config);
  assert.deepEqual(leaseRequest(runner.qwen).subjectIds, [config.RUNNER_SUBJECT_IDS]);
  assert.equal(leaseRequest(runner.qwen).capabilities.includes('vision'), false);
  assert.equal(runner.daily, false);
  assert.throws(() => buildFromConfig({ ...config, RUNNER_SUBJECT_IDS: '' }), /demo subject IDs/);
  assert.throws(() => buildFromConfig({ ...config, HUB_BASE_URL: 'https://learn.unhuman.cc' }), /local or staging/);
});

test('OpenAI runner returns a child job before calling the model', async () => {
  const { processJob } = await import('../integrations/home-runner/job.mjs');
  let returned = false;
  const hub = {
    context: async () => ({ learner: { role: 'child' }, subject: { sensitivity: 'normal' } }),
    fail: async (_, __, retryable) => { returned = retryable; },
  };
  const output = await processJob(hub, { jobId: 'demo', kind: 'assess' }, {
    name: 'openai',
    run: async () => assert.fail('Child data may not reach the pilot model'),
  });
  assert.equal(output.status, 'returned');
  assert.equal(returned, true);
});


test('OpenAI refuses redirects without forwarding credentials', async () => {
  let requests = 0;
  const engine = openAiEngine({ apiKey: 'test-key', kind: 'assess', fetcher: async (_, request) => {
    requests++;
    assert.equal(request.redirect, 'manual');
    return new Response(null, { status: 302, headers: { Location: 'https://example.invalid/' } });
  } });
  await assert.rejects(engine.run(input), /OpenAI HTTP 302/);
  assert.equal(requests, 1);
});


test('Queue keeps the adult-only plan and normal-sensitivity assessment gates', async () => {
  const { processJob } = await import('../integrations/home-runner/job.mjs');
  for (const [kind, context] of [
    ['plan', { learner: { role: 'child' }, subjects: [{ sensitivity: 'normal' }] }],
    ['assess', { learner: { role: 'adult' }, subject: { sensitivity: 'clinical' }, attempts: [] }],
    ['assess', { learner: { role: 'child' }, subject: { sensitivity: 'child_dev' }, attempts: [{ attachments: [{}] }] }],
  ]) {
    let failures = 0;
    const result = await processJob({
      context: async () => context,
      fail: async (_lease, _reason, retryable) => { failures++; assert.equal(retryable, true); },
      attachment: async () => assert.fail('Blocked jobs must not read attachments'),
    }, { jobId: 'blocked', kind }, {
      name: 'openai', queueVision: true, vision: true,
      run: async () => assert.fail('Blocked jobs must not call the model'),
    });
    assert.equal(result.status, 'returned');
    assert.equal(failures, 1);
  }
});

test('incomplete response preserves its safe status and token-limit reason',async()=>{
 const engine=openAiEngine({apiKey:'fake',kind:'assess',purpose:'submission',fetcher:async()=>Response.json({status:'incomplete',incomplete_details:{reason:'max_output_tokens'},usage:{input_tokens:12,output_tokens:6000}})});
 await assert.rejects(engine.run(input),error=>error.invalidCode==='response_status_incomplete_max_output_tokens' && error.usage.outputTokens===6000);
});
