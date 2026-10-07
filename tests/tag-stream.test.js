import test from 'node:test';
import assert from 'node:assert/strict';
import { sceneStream, receiveTagStream } from '../tag-stream.js';
import { retryAuto } from '../auto-retry.js';

const scene = { prompt: 'cat, "curly {tags}"', source_ids: ['a'], anchor_source_id: 'a', anchor_quote: '小猫' };
const options = { count: 2, sourceIds: ['a'], withCharacters: false };
const frame = (content, finish_reason = null) => `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content }, finish_reason }] })}\r\n\r\n`;
const encoder = new TextEncoder();
function pipe() {
    let writer;
    const response = new Response(new ReadableStream({ start(c) { writer = c; } }), { headers: { 'Content-Type': 'text/event-stream' } });
    return { response, send: text => writer.enqueue(encoder.encode(text)), close: () => writer.close() };
}
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const base = { request: { model: 'test' }, headers: {}, ...options };

test('emits only closed scene objects across every character boundary and keeps nested objects intact', () => {
    const received = [], value = { ...scene, characters: [{ nested: { prompt: 'nested }' } }] };
    const parser = sceneStream({ ...options, onScene: s => received.push(s) });
    const first = JSON.stringify(value);
    for (const c of '```json\n{"metadata":"scenes", "scenes":[' + first.slice(0, -1)) parser.push(c);
    assert.equal(received.length, 0);
    parser.push('}'); assert.equal(received.length, 1);
    for (const c of ',' + first + ']}\n```') parser.push(c);
    assert.equal(parser.finish().length, 2); assert.equal(received.length, 2);
    assert.equal(received[0].prompt, scene.prompt);
});

test('stream delivers first scene before second or EOF, accepts split UTF-8 and SSE frames', async () => {
    const p = pipe(), received = [];
    const pending = receiveTagStream({ ...base, fetcher: async (url, init) => { assert.equal(JSON.parse(init.body).stream, true); return p.response; }, onScene: s => received.push(s) });
    p.send(': heartbeat\r\n\r\n');
    p.send(frame('{"scenes":[' + JSON.stringify(scene)));
    await tick(); assert.equal(received.length, 1);
    const last = frame(',' + JSON.stringify(scene) + ']}', 'stop');
    p.send(last.slice(0, 3)); p.send(last.slice(3)); p.send('data: [DONE]\r\n\r\n');
    assert.equal((await pending).length, 2); assert.equal(received.length, 2);
});

test('decoder preserves UTF-8 split into individual bytes', async () => {
    const bytes = encoder.encode(frame('{"scenes":[' + JSON.stringify(scene) + ']}', 'stop') + 'data: [DONE]\n\n');
    const response = new Response(new ReadableStream({ start(c) { for (const b of bytes) c.enqueue(Uint8Array.of(b)); c.close(); } }));
    const result = await receiveTagStream({ ...base, count: 1, fetcher: async () => response, onScene: () => {} });
    assert.equal(result[0].anchor_quote, '小猫');
});

test('truncated later scene retains first result and suppresses whole-request retry', async () => {
    let calls = 0, accepted = 0;
    await assert.rejects(retryAuto(() => receiveTagStream({ ...base, fetcher: async () => {
        calls++; const p = pipe(); p.send(frame('{"scenes":[' + JSON.stringify(scene) + ',{"prompt":"unfinished', 'length')); p.close(); return p.response;
    }, onScene: () => accepted++ }), { retries: 2, delay: 0, timeout: 0, shouldRetry: () => accepted === 0 }), /截断/);
    assert.equal(calls, 1); assert.equal(accepted, 1);
});

test('idle timeout and user abort release the reader while keeping completed scenes', async () => {
    const p = pipe(); let accepted = 0;
    p.send(frame('{"scenes":[' + JSON.stringify(scene)));
    await assert.rejects(receiveTagStream({ ...base, fetcher: async () => p.response, idleTimeout: 30, onScene: () => accepted++ }), /等待超时/);
    assert.equal(accepted, 1);
    const next = pipe(), controller = new AbortController();
    const pending = receiveTagStream({ ...base, fetcher: async () => next.response, signal: controller.signal, onScene: () => {} });
    await tick(); controller.abort(); await assert.rejects(pending, { name: 'AbortError' });
});

test('receiving new chunks extends the idle deadline past the original timeout', async () => {
    const p = pipe();
    const pending = receiveTagStream({ ...base, count: 1, fetcher: async () => p.response, idleTimeout: 500, onScene: () => {} });
    p.send(frame('{"scenes":['));
    await new Promise(resolve => setTimeout(resolve, 300));
    p.send(frame(JSON.stringify(scene)));
    await new Promise(resolve => setTimeout(resolve, 300));
    p.send(frame(']}', 'stop')); p.send('data: [DONE]\n\n');
    assert.equal((await pending).length, 1);
});

test('supports nonstream JSON fallback, exposes gateway errors and refusal', async () => {
    let raw = '', accepted = 0;
    const result = await receiveTagStream({ ...base, count: 1, fetcher: async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ scenes: [scene] }) } }] })), onScene: () => accepted++ });
    assert.equal(result.length, 1); assert.equal(accepted, 1);
    await assert.rejects(receiveTagStream({ ...base, fetcher: async () => new Response('{"error":{"message":"Gateway Timeout"}}'), onText: text => raw = text }), /Gateway Timeout/);
    assert.match(raw, /Gateway Timeout/);
    const p = pipe(); p.send('data: {"choices":[{"delta":{"refusal":"Cannot comply"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');
    await assert.rejects(receiveTagStream({ ...base, fetcher: async () => p.response, onText: text => raw = text }), /拒绝/);
    assert.equal(raw, 'Cannot comply');
});

test('invalid references and excess scenes never become paid jobs', () => {
    let accepted = 0;
    const parser = sceneStream({ ...options, count: 1, onScene: () => accepted++ });
    parser.push('{"scenes":[' + JSON.stringify(scene));
    assert.throws(() => parser.push(',' + JSON.stringify(scene)), /超过/); assert.equal(accepted, 1);
    const invalid = sceneStream({ ...options, onScene: () => accepted++ });
    assert.throws(() => invalid.push('{"scenes":[' + JSON.stringify({ ...scene, source_ids: ['unknown'] })), /引用/); assert.equal(accepted, 1);
});
