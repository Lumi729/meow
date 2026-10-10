import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { watchChat } from '../chat-watch.js';

test('chat watcher batches changes, waits out streaming and reports only changed replies', async () => {
    const w = new Window(), d = w.document; globalThis.document = d;
    d.body.innerHTML = '<div id="chat"><div class="mes" mesid="0"><div class="mes_text">一</div></div><div class="mes" mesid="1"><div class="mes_text">二</div></div></div>';
    const handlers = {}, runs = [], frame = () => new Promise(r => setTimeout(r, 30));
    watchChat(() => ({ event_types: { GENERATION_STARTED: 's', GENERATION_ENDED: 'e' }, eventSource: { on: (n, fn) => handlers[n] = fn } }), nodes => runs.push(nodes));
    const text = d.querySelectorAll('.mes_text');
    text[1].textContent = 'a'; text[1].textContent = 'ab'; text[1].append('c'); await frame();
    assert.equal(runs.length, 1, 'many mutations, one pass');
    assert.deepEqual(runs[0].map(n => n.getAttribute('mesid')), ['1'], 'only the changed reply');
    handlers.s('normal', {}, true); text[1].append('d'); await frame();
    assert.equal(runs.length, 2, 'dry runs do not pause the watcher');
    handlers.s('normal', {}, false);
    for (let i = 0; i < 5; i++) { text[1].append(String(i)); await frame(); }
    assert.equal(runs.length, 2, 'nothing runs while the reply streams');
    handlers.e(); await frame();
    assert.equal(runs.length, 3); assert.equal(runs[2], null, 'one full pass after streaming');
    await w.happyDOM.close();
});
