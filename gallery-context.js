// A reply's saved image IDs remain valid when character list indices change.
// Never rewrite images or pull unrelated gallery groups into the current chat.
export function galleryForChat(images, chat, key) {
    const ids = new Set();
    for (const message of chat || []) {
        for (const group of message.extra?.meow_inline || []) for (const variant of group.variants || []) ids.add(variant.id);
        for (const pending of message.extra?.meow_pending || []) if (pending.entryId) ids.add(pending.entryId);
    }
    const normalize = value => {
        try { const parts = JSON.parse(value); return Array.isArray(parts) && parts.length === 3 ? JSON.stringify(parts.map(p => p == null ? null : String(p))) : value; }
        catch { return value; }
    };
    const current = normalize(key);
    return images.filter(image => ids.has(image.id) || normalize(image.chatKey) === current);
}
