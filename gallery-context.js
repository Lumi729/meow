// Character list indices change when cards are added or removed, and may arrive as 0 or "0".
// Compare the stable owner (avatar / group + chat file) when both sides know it, otherwise the normalized key.
export const normalizeChatKey = value => {
    try { const parts = JSON.parse(value); return Array.isArray(parts) && parts.length === 3 ? JSON.stringify(parts.map(p => p == null ? null : String(p))) : value; }
    catch { return value; }
};
export function chatOwner(c) {
    const chat = c?.getCurrentChatId?.();
    if (!chat) return null;
    const owner = c.groupId != null ? ['group', String(c.groupId)] : c.characters?.[c.characterId]?.avatar ? ['character', c.characters[c.characterId].avatar] : null;
    return owner ? JSON.stringify([...owner, String(chat)]) : null;
}
export const sameChat = (a, b) => a?.owner && b?.owner ? a.owner === b.owner : a?.key != null && normalizeChatKey(a.key) === normalizeChatKey(b?.key);

// A reply's saved image IDs remain valid when character list indices change.
// Never rewrite images or pull unrelated gallery groups into the current chat.
export function galleryForChat(images, chat, key) {
    const ids = new Set();
    for (const message of chat || []) {
        for (const group of message.extra?.meow_inline || []) for (const variant of group.variants || []) ids.add(variant.id);
        for (const pending of message.extra?.meow_pending || []) if (pending.entryId) ids.add(pending.entryId);
    }
    const current = normalizeChatKey(key);
    return images.filter(image => ids.has(image.id) || normalizeChatKey(image.chatKey) === current);
}
