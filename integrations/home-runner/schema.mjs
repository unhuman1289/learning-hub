// JSON Schema helpers for engines. The Hub validates every result in full (zod), so the schema handed to a model only
// has to steer the shape: strict structured-output engines need every property required and no string constraints.
const dropped = new Set([
  '$schema',
  'minLength',
  'maxLength',
  'pattern',
  'format',
  'default',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
]);

/** Every property required; optional ones become nullable, and nulls are removed again by stripOptionalNulls. */
export function strictSchema(schema) {
  if (Array.isArray(schema)) return schema.map(strictSchema);
  if (!schema || typeof schema !== 'object') return schema;
  const out = {};
  // Strict structured output accepts anyOf but not oneOf.
  for (const [key, value] of Object.entries(schema)) if (!dropped.has(key)) out[key === 'oneOf' ? 'anyOf' : key] = strictSchema(value);
  if (out.type === 'object' && out.properties) {
    const required = new Set(schema.required ?? []);
    for (const [key, value] of Object.entries(out.properties))
      if (!required.has(key))
        out.properties[key] = value.anyOf ? { anyOf: [...value.anyOf, { type: 'null' }] } : { anyOf: [value, { type: 'null' }] };
    out.required = Object.keys(out.properties);
    out.additionalProperties = false;
  }
  return out;
}

function accepts(schema, value) {
  if (!schema || typeof schema !== 'object') return true;
  const union = schema.anyOf ?? schema.oneOf;
  if (union) return union.some((s) => accepts(s, value));
  if ('const' in schema) return schema.const === value;
  if (schema.enum) return schema.enum.includes(value);
  const t = value === null ? 'null' : Array.isArray(value) ? 'array' : Number.isInteger(value) ? 'integer' : typeof value;
  const types = [schema.type].flat().filter(Boolean);
  if (!types.length) return true;
  if (!(types.includes(t) || (t === 'integer' && types.includes('number')))) return false;
  if (t === 'object' && schema.properties)
    return Object.entries(schema.properties).every(
      ([k, s]) => !(k in value) || accepts(s, value[k]) || (value[k] === null && !(schema.required ?? []).includes(k)),
    );
  return true;
}

/** Removes nulls the strict schema introduced, using the original (non-strict) schema as the guide. */
export function stripOptionalNulls(schema, value) {
  if (value === null || typeof value !== 'object' || !schema || typeof schema !== 'object') return value;
  const union = schema.anyOf ?? schema.oneOf;
  if (union) {
    const branch = union.find((s) => s.type !== 'null' && accepts(s, value)) ?? union.find((s) => s.type !== 'null');
    return stripOptionalNulls(branch, value);
  }
  if (Array.isArray(value)) return value.map((v) => stripOptionalNulls(schema.items, v));
  const out = {};
  const required = new Set(schema.required ?? []);
  for (const [key, v] of Object.entries(value)) {
    if (v === null && !required.has(key)) continue;
    out[key] = stripOptionalNulls(schema.properties?.[key], v);
  }
  return out;
}

/** Pulls the first JSON object out of a reply, ignoring reasoning blocks or code fences around it. */
export function parseJsonReply(text) {
  const clean = String(text ?? '')
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .trim();
  try {
    return JSON.parse(clean);
  } catch {
    const start = clean.indexOf('{'),
      end = clean.lastIndexOf('}');
    if (start < 0 || end <= start) throw Error('Engine reply has no JSON object.');
    return JSON.parse(clean.slice(start, end + 1));
  }
}
