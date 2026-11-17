const names = new Set(['idle','run_right','run_left','wave','jump','rest','explain','think','tilt','look','talk','cover_mouth','point_up','nod','sleep','umbrella','sit']);

/** Called only after the Worker household guard has succeeded. */
export async function tutorSprite(request: Request, bucket: R2Bucket | undefined): Promise<Response> {
  const name = new URL(request.url).pathname.match(/^\/api\/tutor\/sprite\/([a-z_]+)\.webp$/)?.[1];
  if (!name || !names.has(name)) return new Response(null, {status: 404});
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null, {status: 405, headers: {Allow: 'GET, HEAD'}});
  if (!bucket) return new Response(null, {status: 503});
  const object = await bucket.get(`assets/tutor/v1/${name}.webp`);
  if (!object) return new Response(null, {status: 404});
  const headers = new Headers({'Content-Type':'image/webp', 'Cache-Control':'private, max-age=31536000, immutable', 'ETag':object.httpEtag, 'X-Content-Type-Options':'nosniff'});
  if (request.headers.get('If-None-Match')?.split(',').some(tag => tag.trim().replace(/^W\//, '') === object.httpEtag || tag.trim() === '*')) return new Response(null, {status:304, headers});
  return new Response(request.method === 'HEAD' ? null : object.body, {headers});
}
