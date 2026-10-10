// Cheap #chat watcher: one run per animation frame, nothing while a reply is streaming,
// and only the .mes blocks that actually changed (or null after streaming = check everything once).
export function watchChat(context, run) {
    const chat = document.querySelector('#chat');
    if (!chat) return;
    const view = document.defaultView, frame = view.requestAnimationFrame?.bind(view) || (fn => view.setTimeout(fn, 16));
    const changed = new Set();
    let queued = false, all = false, streaming = 0;
    const generating = () => streaming && Date.now() - streaming < 120000; // A missed end event never blocks forever.
    const flush = () => {
        queued = false;
        if (generating()) return;
        const nodes = all ? null : [...changed].filter(node => node.isConnected); changed.clear(); all = false;
        if (nodes && !nodes.length) return;
        run(nodes);
    };
    const schedule = () => { if (!queued && !generating()) { queued = true; frame(flush); } };
    const events = context().event_types || {}, on = (name, fn) => events[name] && context().eventSource?.on(events[name], fn);
    on('GENERATION_STARTED', (_type, _options, dryRun) => { if (!dryRun) streaming = Date.now(); });
    for (const name of ['GENERATION_ENDED', 'GENERATION_STOPPED']) on(name, () => { if (!streaming) return; streaming = 0; all = true; schedule(); });
    new view.MutationObserver(list => {
        for (const m of list) {
            const target = m.target.nodeType === 1 ? m.target : m.target.parentElement;
            const mes = target?.closest?.('.mes');
            if (m.target === chat) all = true; // Chat reloaded, cleared or a reply deleted.
            else if (mes) changed.add(mes);
            else for (const node of m.addedNodes) if (node.nodeType === 1) (node.matches('.mes') ? [node] : node.querySelectorAll('.mes')).forEach(x => changed.add(x));
        }
        schedule();
    }).observe(chat, { childList: true, subtree: true });
}
