import { parseScenes } from './context.js';

// Scan structure, not braces inside quoted tags or nested character objects.
export function sceneStream({ count, sourceIds, withCharacters, onScene, onSceneError, onText = () => {} }) {
    let raw = '', cursor = 0, quoted = false, escaped = false, stringStart = 0;
    let key = '', arrayDepth = 0, start = -1, delivered = 0;
    const stack = [];
    const accepted = [];
    return {
        push(text) {
            raw += text;
            onText(raw);
            if (raw.length > 1000000) throw new Error('tags 返回过长，已停止接收。');
            for (; cursor < raw.length; cursor++) {
                const c = raw[cursor];
                if (quoted) {
                    if (escaped) escaped = false;
                    else if (c === '\\') escaped = true;
                    else if (c === '"') {
                        quoted = false;
                        if (stack.length === 1) key = JSON.parse(raw.slice(stringStart, cursor + 1));
                    }
                    continue;
                }
                if (c === '"') { quoted = true; stringStart = cursor; continue; }
                if (c === '{' || c === '[') {
                    if (c === '[' && stack.length === 1 && key === 'scenes') arrayDepth = 2;
                    else if (c === '{' && arrayDepth && stack.length === arrayDepth) start = cursor;
                    stack.push(c);
                } else if (c === '}' || c === ']') {
                    const opening = stack.pop();
                    if (opening !== (c === '}' ? '{' : '[')) throw new Error('tags JSON 结构不完整。');
                    if (start >= 0 && stack.length === arrayDepth) {
                        if (delivered >= count) throw new Error('返回场景超过所选数量，已停止追加。');
                        const index = delivered++;
                        try {
                            const scene = JSON.parse(raw.slice(start, cursor + 1));
                            const [validated] = parseScenes(JSON.stringify({ scenes: [scene] }), sourceIds, 1, withCharacters);
                            onScene(validated, index);
                            accepted.push(validated);
                        } catch (error) {
                            if (!onSceneError || error.name === 'AbortError') throw error;
                            onSceneError(error, index);
                        }
                        start = -1;
                    }
                    if (arrayDepth && stack.length < arrayDepth) arrayDepth = 0;
                } else if (c === ',' && stack.length === 1) key = '';
            }
        },
        finish() {
            if (!onSceneError) return parseScenes(raw, sourceIds, count, withCharacters);
            // Validate the final envelope without rejecting all scenes again because
            // one complete scene was already reported and skipped.
            let result;
            try { result = JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')); }
            catch { throw new Error('副 API 未返回完整 JSON；已接收的场景会保留。'); }
            if (!Array.isArray(result?.scenes) || result.scenes.length !== count || delivered !== count) throw new Error(`副 API 应返回 ${count} 个场景；已接收的场景会保留。`);
            return accepted;
        },
    };
}

// OpenAI-compatible SSE through SillyTavern; also accept providers returning JSON.
// The timer measures inactivity, so a healthy long stream is not cut off at 120 s.
export async function receiveTagStream({ request, headers, signal, onScene, onSceneError, onText, sourceIds, count, withCharacters, idleTimeout = 120000, fetcher = fetch }) {
    const controller = new AbortController();
    let timer, timedOut = false, reader;
    const touch = () => { clearTimeout(timer); timer = setTimeout(() => { timedOut = true; controller.abort(); }, idleTimeout); };
    const abort = () => controller.abort(signal.reason);
    controller.signal.addEventListener('abort', () => { reader?.cancel().catch(() => {}); }, { once: true });
    signal?.throwIfAborted(); signal?.addEventListener('abort', abort, { once: true }); touch();
    const parser = sceneStream({ count, sourceIds, withCharacters, onScene, onSceneError, onText });
    let finishReason, refusal = '';
    const consume = data => {
        if (data?.error) { onText?.(JSON.stringify(data)); throw new Error(`副 API 错误：${data.error.message || JSON.stringify(data.error)}`); }
        if (!data || typeof data !== 'object') throw new Error('副 API 返回不是有效响应对象。');
        const choice = data.choices?.find(c => c.index === 0) ?? data.choices?.[0];
        if (!choice) return;
        finishReason = choice.finish_reason || finishReason;
        const part = choice.delta ?? choice.message;
        if (typeof part?.refusal === 'string') { refusal += part.refusal; onText?.(refusal); }
        if (typeof part?.content === 'string') parser.push(part.content);
    };
    try {
        const response = await fetcher('/api/backends/chat-completions/generate', { method: 'POST', headers, body: JSON.stringify({ ...request, stream: true }), signal: controller.signal });
        if (!response.ok) {
            const raw = await response.text(); onText?.(raw);
            throw new Error(`副 API 失败（HTTP ${response.status}），请查看自动生图原始返回。`);
        }
        if (!response.body) throw new Error('副 API 返回为空。');
        reader = response.body.getReader();
        controller.signal.throwIfAborted();
        const decoder = new TextDecoder();
        let buffer = '', mode = response.headers.get('content-type')?.includes('text/event-stream') ? 'sse' : '', done = false;
        const event = block => {
            const payload = block.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).replace(/^ /, '')).join('\n').trim();
            if (!payload) return;
            if (payload === '[DONE]') { done = true; return; }
            let data; try { data = JSON.parse(payload); } catch { onText?.(payload); throw new Error('副 API 流式数据不是有效 JSON。'); }
            consume(data);
        };
        while (!done) {
            const chunk = await reader.read();
            controller.signal.throwIfAborted();
            if (chunk.value?.length) touch();
            buffer += decoder.decode(chunk.value, { stream: !chunk.done });
            if (buffer.length > 2000000) throw new Error('副 API 返回过长。');
            if (!mode && buffer.trimStart()) {
                const first = buffer.trimStart()[0];
                if (first === '{' || first === '[') mode = 'json';
                else if (/^(?:data:|:|event:)/.test(buffer.trimStart())) mode = 'sse';
            }
            if (mode === 'sse') {
                let boundary;
                while (!done && (boundary = /\r?\n\r?\n/.exec(buffer))) {
                    const block = buffer.slice(0, boundary.index);
                    buffer = buffer.slice(boundary.index + boundary[0].length);
                    event(block);
                }
            }
            if (chunk.done) {
                if (mode === 'sse') { if (buffer.trim() && !done) event(buffer); }
                else { onText?.(buffer); let data; try { data = JSON.parse(buffer); } catch { throw new Error('副 API 返回不是 JSON 或 SSE，请查看原始返回。'); } consume(data); }
                break;
            }
        }
        if (refusal || finishReason === 'content_filter') throw new Error('副 API 拒绝了本次请求，请查看原始返回。');
        if (finishReason === 'length') throw new Error('tags 输出被截断；已接收的完整场景会保留。');
        return parser.finish();
    } catch (error) {
        signal?.throwIfAborted();
        if (timedOut) throw new Error('自动 tags 长时间没有新数据，等待超时；已接收的场景会保留。');
        throw error;
    } finally {
        clearTimeout(timer); signal?.removeEventListener('abort', abort);
        // Cancel even a still-open stream after [DONE], malformed data or refusal.
        if (reader) { try { await reader.cancel(); } catch {} reader.releaseLock(); }
        controller.abort();
    }
}
