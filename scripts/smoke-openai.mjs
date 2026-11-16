import { openAiEngine, OPENAI_MODELS } from '../integrations/home-runner/openai.mjs';

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey?.trim()) {
  console.error('Cần OPENAI_API_KEY của project staging.');
  process.exitCode = 1;
} else {
  for (const kind of ['assess', 'plan']) {
    try {
      const engine = openAiEngine({ apiKey, kind });
      const { json, usage } = await engine.run({
        system: 'Return an object with ok set to true.',
        user: 'Synthetic connectivity check. No learner data.',
        schema: {
          type: 'object',
          properties: { ok: { type: 'boolean' } },
          required: ['ok'],
        },
      });
      if (json.ok !== true) throw new Error('Unexpected test result.');
      console.log(JSON.stringify({ kind, ...usage }));
    } catch (error) {
      console.error(OPENAI_MODELS[kind] + ': ' + error.message);
      process.exitCode = 1;
    }
  }
}
