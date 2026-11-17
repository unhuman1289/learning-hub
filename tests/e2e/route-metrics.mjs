import { gzipSync } from 'node:zlib';
import { expect } from '@playwright/test';

export function routeMetrics(page) {
  const origin = new URL(page.url()).origin;
  const api = [], files = new Set();
  const collect = request => {
    const url = new URL(request.url());
    if (url.origin !== origin || request.method() !== 'GET') return;
    if (url.pathname.startsWith('/api/')) api.push(url.pathname);
    if (url.pathname.endsWith('.js')) files.add(url.href);
  };
  page.on('request', collect);
  return async () => {
    page.off('request', collect);
    const sizes = await Promise.all([...files].map(async url => {
      const response = await fetch(url);
      expect(response.ok).toBe(true);
      return gzipSync(Buffer.from(await response.arrayBuffer())).length;
    }));
    return { api, gzip: sizes.reduce((sum, bytes) => sum + bytes, 0), chunks: [...files].map((url, i) => [new URL(url).pathname.split("/").at(-1), sizes[i]]) };
  };
}
