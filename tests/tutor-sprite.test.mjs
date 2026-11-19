import {test} from 'node:test';
import assert from 'node:assert/strict';
import {tutorSprite} from '../lib/tutor/sprite.ts';
const calls=[];
const bucket={get:async key=>{calls.push(key); return key.endsWith('/sit.webp') ? {httpEtag:'"abc"',body:new ReadableStream({start(c){c.enqueue(new Uint8Array([1,2]));c.close();}})} : null;}};
test('sprite reads only allowed R2 keys and handles caching',async()=>{
 const request=(path,init)=>new Request(`https://example.test/api/tutor/sprite/v2/${path}`,init);
 let r=await tutorSprite(request('sit.webp'),bucket); assert.equal(r.status,200); assert.equal(r.headers.get('etag'),'"abc"'); assert.match(r.headers.get('cache-control'),/private.*max-age=31536000/); assert.deepEqual([...new Uint8Array(await r.arrayBuffer())],[1,2]);
 r=await tutorSprite(request('sit.webp',{headers:{'If-None-Match':'W/"abc"'}}),bucket); assert.equal(r.status,304);
 r=await tutorSprite(request('other.webp'),bucket); assert.equal(r.status,404);
 r=await tutorSprite(request('sleep.webp'),bucket); assert.equal(r.status,404);
 r=await tutorSprite(request('sit.webp',{method:'POST'}),bucket); assert.equal(r.status,405);
 r=await tutorSprite(new Request('https://example.test/api/tutor/sprite/sit.webp'),bucket); assert.equal(r.status,200);
 r=await tutorSprite(new Request('https://example.test/api/tutor/sprite/m11/sit.webp'),bucket); assert.equal(r.status,200);
 for(const month of ['m00','m13','m1','x11']) { r=await tutorSprite(new Request(`https://example.test/api/tutor/sprite/${month}/sit.webp`),bucket); assert.equal(r.status,404); }
 assert.deepEqual(calls,['assets/tutor/v2/sit.webp','assets/tutor/v2/sit.webp','assets/tutor/v2/sleep.webp','assets/tutor/v1/sit.webp','assets/tutor/m11/sit.webp']);
});
