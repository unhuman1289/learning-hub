import { storage } from './storage';

export function measureStorage() {
  const started = performance.now();
  let count = 0, elapsed = 0;
  const rawStatements = new WeakMap<D1PreparedStatement, D1PreparedStatement>();
  async function measure<T>(run: () => Promise<T>) {
    const start = performance.now();
    count++;
    try { return await run(); } finally { elapsed += performance.now() - start; }
  }
  function statement(raw: D1PreparedStatement): D1PreparedStatement {
    const wrapped = new Proxy(raw, {
      get(target, key, receiver) {
        if (key === 'bind') return (...args: unknown[]) => statement(target.bind(...args));
        if (key === 'first' || key === 'all' || key === 'run' || key === 'raw')
          return (...args: unknown[]) => measure(() => Reflect.apply(target[key], target, args));
        return Reflect.get(target, key, receiver);
      },
    });
    rawStatements.set(wrapped, raw);
    return wrapped;
  }
  const binding = storage();
  const db = new Proxy(binding, {
    get(target, key, receiver) {
      if (key === 'prepare') return (sql: string) => statement(target.prepare(sql));
      if (key === 'batch') return (items: D1PreparedStatement[]) =>
        measure(() => target.batch(items.map(item => rawStatements.get(item) ?? item)));
      return Reflect.get(target, key, receiver);
    },
  });
  return { db, header: () => `app;dur=${(performance.now() - started).toFixed(1)}, d1;dur=${elapsed.toFixed(1)}, d1_calls;desc="${count}"` };
}
