import { strictSchema, stripOptionalNulls } from './schema.mjs';

export const OPENAI_MODELS = Object.freeze({
  assess: 'gpt-6-luna',
  plan: 'gpt-6.1-terra',
  recheck: 'gpt-6.1-terra',
});

// OpenAI's structured output subset has no prefixItems. The Hub still checks
// ordering, item IDs and positional content against the original validator.
function responsesSchema(schema) {
  if (!schema || typeof schema !== 'object') return schema;
  if (Array.isArray(schema)) return schema.map(responsesSchema);
  const { prefixItems, items, ...rest } = schema;
  const result = Object.fromEntries(Object.entries(rest).map(([key, value]) => [key, responsesSchema(value)]));
  if (prefixItems?.length) result.items = { anyOf: prefixItems.map(responsesSchema) };
  else if (items && typeof items === 'object') result.items = responsesSchema(items);
  else if (result.type === 'array') result.items = { type: 'null' };
  return result;
}

export function openAiEngine({ apiKey, kind, purpose, fetcher = fetch, beforeFetch = async () => {} }) {
  const model = OPENAI_MODELS[purpose === 'recheck' ? 'recheck' : kind];
  if (!model) throw new Error('Unsupported OpenAI job kind.');
  if (!apiKey?.trim()) throw new Error('Missing OpenAI project API key.');

  return {
    name: 'openai',
    vision: false,
    async run({ system, user, schema, images = [] }) {
      if (images.length) throw new Error('OpenAI pilot only supports text.');
      const started = Date.now();
      let requestSchema;
      try {
        if (kind !== 'plan') requestSchema = responsesSchema(strictSchema(schema));
      } catch {
        throw new Error('OpenAI schema preparation failed.');
      }
      await beforeFetch();
      const response = await fetcher('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          instructions: system,
          input: kind === 'plan' ? user + '\nReturn one JSON object. Follow this schema and omit unused optional fields:\n' + JSON.stringify(schema) : user,
          store: false,
          service_tier: 'default',
          reasoning: { effort: kind === 'plan' || purpose === 'recheck' ? 'low' : 'none' },
          max_output_tokens: kind === 'plan' ? 12000 : 6000,
          text: { format: kind === 'plan' ? { type: 'json_object' }
            : { name: 'learning_hub_result', type: 'json_schema', strict: true, schema: requestSchema } },
        }),
        signal: AbortSignal.timeout(90000),
        redirect: 'manual',
      }).catch(error => {
        if (error?.name === 'TimeoutError' || error?.name === 'AbortError')
          throw new Error('OpenAI request timed out.');
        throw new Error('OpenAI request transport failed.');
      });

      const body = await response.json().catch(() => null);
      if (!response.ok) {
        const code = body?.error?.code;
        const knownCode = ['credit_balance_exhausted', 'project_spend_limit_exceeded', 'organization_spend_limit_exceeded', 'rate_limit_exceeded',
          'invalid_json_schema', 'invalid_api_key', 'model_not_found', 'insufficient_permissions', 'unsupported_value', 'invalid_request_error'].includes(code);
        const error = new Error('OpenAI HTTP ' + response.status + (knownCode ? ' (' + code + ')' : ''));
        error.retryable = response.status >= 500 || (response.status === 429 && code === 'rate_limit_exceeded');
        throw error;
      }
      if (body?.status !== 'completed') {
        const status = ['failed', 'incomplete', 'cancelled', 'queued', 'in_progress'].includes(body?.status) ? body.status : 'unknown';
        const reason = ['max_output_tokens', 'content_filter'].includes(body?.incomplete_details?.reason) ? body.incomplete_details.reason : null;
        throw new Error('OpenAI response status: ' + status + (reason ? ' (' + reason + ')' : ''));
      }

      const content = (body.output ?? []).filter(item => item.type === 'message').flatMap(item => item.content ?? []);
      if (content.some(item => item.type === 'refusal')) throw new Error('OpenAI declined this response.');
      const output = content.filter(item => item.type === 'output_text').map(item => item.text).join('');
      let json;
      try {
        json = JSON.parse(output);
      } catch {
        throw new Error('OpenAI response was not valid JSON.');
      }

      return {
        json: stripOptionalNulls(schema, json),
        usage: {
          model: body.model || model,
          inputTokens: body.usage?.input_tokens ?? 0,
          outputTokens: body.usage?.output_tokens ?? 0,
          ms: Date.now() - started,
        },
      };
    },
  };
}
