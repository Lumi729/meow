// Shared by every Meow story card, including same-origin HTML-renderer frames.
const CSS = `
.meow-inline-card { display:block; box-sizing:border-box; max-width:100%; margin:12px auto; padding:10px; clear:both; color:var(--SmartThemeBodyColor,inherit); background:var(--SmartThemeChatTintColor,transparent); border:1px solid var(--SmartThemeBorderColor,currentColor); border-radius:12px; text-align:center; }
.meow-inline-card { font-family:inherit; font-size:inherit; }
.meow-inline-card .meow-inline-heading { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px; margin-bottom:8px; }
.meow-inline-card .meow-inline-title { flex:1; min-width:0; overflow-wrap:anywhere; text-align:start; }
:where(.meow-inline-card button) { padding:7px 12px; border:1px solid var(--SmartThemeBorderColor,currentColor); border-radius:8px; background:var(--SmartThemeBlurTintColor,transparent); color:var(--SmartThemeBodyColor,inherit); font:inherit; cursor:pointer; }
/* Compact story controls: same outline as the reference, live tavern colors. */
.meow-inline-card button.meow-story-button { display:inline-flex; align-items:center; justify-content:center; box-sizing:border-box; margin:0; padding:7px 12px; border:1px solid var(--SmartThemeBorderColor,currentColor); border-radius:8px; background:transparent; color:var(--SmartThemeBodyColor,inherit); font:inherit; line-height:1.4; letter-spacing:normal; text-shadow:none; box-shadow:none; appearance:none; cursor:pointer; }
/* Keep the label horizontal even with narrow global button rules. */
.meow-inline-card button { writing-mode:horizontal-tb !important; text-orientation:mixed !important; white-space:nowrap !important; word-break:normal !important; overflow-wrap:normal !important; flex:0 0 auto !important; width:auto !important; min-width:max-content !important; max-width:none !important; height:auto !important; }
.meow-inline-card button:disabled { opacity:.6; cursor:wait; }
.meow-inline-card .meow-inline-photo { display:block; max-width:100%; max-height:65vh; object-fit:contain; margin:0 auto; cursor:zoom-in; touch-action:pan-y pinch-zoom; }
.meow-inline-card [hidden] { display:none !important; }
.meow-inline-card>[role=status] { font-size:.85em; }
.meow-inline-pending { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px; }
.meow-inline-pending>[role=status] { flex:1; text-align:start; font-size:1em; overflow-wrap:anywhere; }
`;
export function inlineTheme(doc, parent = doc) {
    if (!doc.getElementById('meow-inline-theme')) { const style = doc.createElement('style'); style.id = 'meow-inline-theme'; style.textContent = CSS; doc.head.append(style); }
    if (doc === parent) return;
    doc.getElementById('meow-inline-font-faces')?.remove();
    doc.getElementById('meow-inline-corners')?.remove();
    const values = parent.defaultView.getComputedStyle(parent.documentElement);
    for (const card of doc.querySelectorAll('.meow-inline-card')) for (const key of ['--SmartThemeBodyColor', '--SmartThemeChatTintColor', '--SmartThemeBlurTintColor', '--SmartThemeBorderColor']) {
        const value = values.getPropertyValue(key); if (card.style.getPropertyValue(key) !== value) card.style.setProperty(key, value);
    }
}
