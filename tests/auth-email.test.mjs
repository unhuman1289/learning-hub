import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, sendAuthEmail } from '../lib/auth/email.ts';

test('auth email requires both provider credentials and never calls fetch when absent', async () => {
  let called = false;
  await assert.rejects(
    sendAuthEmail({}, { to: 'learner@example.test', subject: 'Verify', text: 'link', html: '<p>link</p>' }, async () => {
      called = true;
      return new Response(null, { status: 200 });
    }),
    /not configured/,
  );
  assert.equal(called, false);
});

test('auth email sends the configured sender and message to the fixed provider endpoint', async () => {
  let request;
  await sendAuthEmail(
    { RESEND_API_KEY: 'test-key', EMAIL_FROM: 'Learning Hub <no-reply@example.test>' },
    { to: 'learner@example.test', subject: 'Verify', text: 'plain link', html: '<p>link</p>' },
    async (url, options) => {
      request = { url, options };
      return new Response('{}', { status: 200 });
    },
  );
  assert.equal(request.url, 'https://api.resend.com/emails');
  assert.equal(request.options.headers.Authorization, 'Bearer test-key');
  assert.deepEqual(JSON.parse(request.options.body), {
    from: 'Learning Hub <no-reply@example.test>',
    to: 'learner@example.test',
    subject: 'Verify',
    text: 'plain link',
    html: '<p>link</p>',
  });
});

test('auth email provider errors are sanitized and HTML links escape untrusted values', async () => {
  await assert.rejects(
    sendAuthEmail(
      { RESEND_API_KEY: 'test-key', EMAIL_FROM: 'no-reply@example.test' },
      { to: 'learner@example.test', subject: 'Verify', text: 'link', html: '<p>link</p>' },
      async () => new Response('private provider detail', { status: 422 }),
    ),
    (error) => error.message === 'Authentication email delivery failed (422).',
  );
  assert.equal(escapeHtml(`a&<b>"'`), 'a&amp;&lt;b&gt;&quot;&#39;');
});
