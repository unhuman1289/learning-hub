import assert from 'node:assert/strict';
import test from 'node:test';
import { openAiEngine } from '../lib/ai/openai.mjs';

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
        assert.ok(body.input.indexOf('schema') < body.input.indexOf(input.user));
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
        usage: { input_tokens: 31, output_tokens: 20, input_tokens_details: { cached_tokens: 12 } },
      });
    } });
    const result = await engine.run(input);
    assert.deepEqual(result.json, { score: 1 });
    assert.equal(result.usage.inputTokens, 31);
    assert.equal(result.usage.outputTokens, 20);
    assert.equal(result.usage.cachedInputTokens, 12);
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

test('OpenAI runner returns a child job before calling the model', async () => {
  const { processJob } = await import('../lib/ai/job.mjs');
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


test('Queue still blocks photos of sensitive notebooks before calling the model', async () => {
  const { processJob } = await import('../lib/ai/job.mjs');
  for (const [kind, context] of [
    ['assess', { learner: { role: 'child' }, subject: { sensitivity: 'child_dev' }, attempts: [{ attachments: [{}] }] }],
    ['assess', { learner: { role: 'adult' }, subject: { sensitivity: 'clinical' }, attempts: [{ attachments: [{}] }] }],
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

test('Queue serves child profiles and sensitive text notebooks (decision 11.3), scrubbing the display name', async () => {
  const { processJob } = await import('../lib/ai/job.mjs');
  for (const [kind, context] of [
    ['plan', { learner: { role: 'child', displayName: 'Ếch', ref: 'lrn_x' }, subjects: [{ sensitivity: 'normal', title: 'Ếch học toán' }] }],
    ['plan', { learner: { role: 'adult', displayName: 'Vu', ref: 'lrn_y' }, subjects: [{ sensitivity: 'clinical' }] }],
    ['assess', { learner: { role: 'adult', displayName: 'Vu', ref: 'lrn_y' }, subject: { sensitivity: 'child_dev' }, attempts: [] }],
  ]) {
    const reasons = [];
    await processJob({
      context: async () => context,
      fail: async (_lease, reason) => { reasons.push(reason); return {}; },
      heartbeat: async () => ({}),
    }, { jobId: 'open', kind }, {
      name: 'openai', queueVision: true, vision: true,
      run: async input => { assert.ok(!JSON.stringify(input).includes('Ếch')); throw Object.assign(new Error('stop'), { retryable: false }); },
    }).catch(() => {});
    assert.ok(!reasons.some(reason => /Đợt thử OpenAI/.test(String(reason))), kind + ' must pass the profile and sensitivity gate');
  }
});

test('incomplete response preserves its safe status and token-limit reason',async()=>{
 const engine=openAiEngine({apiKey:'fake',kind:'assess',purpose:'submission',fetcher:async()=>Response.json({status:'incomplete',incomplete_details:{reason:'max_output_tokens'},usage:{input_tokens:12,output_tokens:6000}})});
 await assert.rejects(engine.run(input),error=>error.invalidCode==='response_status_incomplete_max_output_tokens' && error.usage.outputTokens===6000);
});

test('cached input is optional and is priced as part of input, not in addition', async () => {
  const { estimateCost } = await import('../lib/ai-jobs/cost.ts');
  const prices = JSON.stringify({ demo: { input: 2, output: 4, cacheRead: 0.5 } });
  assert.equal(estimateCost({ model: 'demo', inputTokens: 100, outputTokens: 10, cachedInputTokens: 40 }, prices), 0.00018);
  assert.equal(estimateCost({ model: 'demo', inputTokens: 100, outputTokens: 10 }, prices), 0.00024);
});
