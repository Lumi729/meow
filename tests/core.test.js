import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRequest, requestImage } from '../core.js';

test('request excludes secrets and resolves random seed', () => {
    const p = buildRequest({ prompt: ' cat ', token: 'test-only', seed: -1 }, () => 42);
    assert.equal(p.seed, 42);
    assert.equal(p.prompt, 'cat');
    assert.equal(p.token, undefined);
    assert.ok(p.width * p.height <= 1048576);
});
test('rejects invalid inputs before a charged request', () => {
    for (const patch of [{prompt:''}, {width:833}, {width:2048,height:2048}, {steps:29}, {seed:-2}, {seed:4294967296}, {scale:NaN}, {steps:''}, {model:'unknown'}]) {
        assert.throws(() => buildRequest({prompt:'cat', ...patch}));
    }
    assert.equal(buildRequest({prompt:'cat',seed:0}).seed, 0);
});
test('uses only same-origin ST bridge with request headers', async () => {
    const headers = {'Content-Type':'application/json','X-CSRF-Token':'test-csrf'};
    const payload = buildRequest({prompt:'cat'});
    const result = await requestImage(payload, headers, undefined, async (url, options) => {
        assert.equal(url, '/api/novelai/generate-image');
        assert.equal(options.headers, headers);
        assert.deepEqual(JSON.parse(options.body),payload);
        return new Response('iVBORw0KGgo=');
    });
    assert.equal(result,'data:image/png;base64,iVBORw0KGgo=');
});
test('errors never retry or echo server contents', async () => {
    for (const code of [400,401,403,404,429,500]) {
        let calls = 0;
        await assert.rejects(requestImage({}, {}, undefined, async () => {
            calls++; return new Response('sensitive server contents', {status:code});
        }), error => !error.message.includes('sensitive'));
        assert.equal(calls,1);
    }
    await assert.rejects(requestImage({}, {}, undefined, async () => new Response('<html>login</html>')), /PNG/);
});
test('abort propagates without retry', async () => {
    const c = new AbortController(); c.abort();
    await assert.rejects(requestImage({}, {}, c.signal, async (_, {signal}) => {signal.throwIfAborted();}), {name:'AbortError'});
});
