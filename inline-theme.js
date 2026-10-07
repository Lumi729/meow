// Shared by every Meow story card, including same-origin HTML-renderer frames.
const CSS = `
.meow-inline-card { display:block; box-sizing:border-box; max-width:100%; margin:12px auto; padding:10px; clear:both; color:var(--SmartThemeBodyColor,inherit); background:var(--SmartThemeChatTintColor,transparent); border:1px solid var(--SmartThemeBorderColor,currentColor); border-radius:12px; text-align:center; }
.meow-inline-card,.meow-inline-card * { font-family:var(--meow-font-family,inherit) !important; }
.meow-inline-card { font-size:var(--meow-font-size,1em); }
.meow-inline-card .meow-inline-heading { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px; margin-bottom:8px; }
.meow-inline-card .meow-inline-title { flex:1; min-width:0; overflow-wrap:anywhere; text-align:start; }
.meow-inline-card button,.meow-message-generate { padding:7px 12px; border:1px solid var(--SmartThemeBorderColor,currentColor); border-radius:8px; background:var(--SmartThemeBlurTintColor,transparent); color:var(--SmartThemeBodyColor,inherit); font:inherit; text-shadow:none; cursor:pointer; }
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
    const fontCSS = parent.getElementById('meow-font-faces')?.textContent || '';
    let fontStyle = doc.getElementById('meow-inline-font-faces');
    if (fontCSS && !fontStyle) { fontStyle = doc.createElement('style'); fontStyle.id = 'meow-inline-font-faces'; doc.head.append(fontStyle); }
    if (fontStyle && fontStyle.textContent !== fontCSS) fontStyle.textContent = fontCSS;
    const values = parent.defaultView.getComputedStyle(parent.documentElement);
    for (const card of doc.querySelectorAll('.meow-inline-card')) for (const key of ['--SmartThemeBodyColor', '--SmartThemeChatTintColor', '--SmartThemeBlurTintColor', '--SmartThemeBorderColor', '--meow-font-family', '--meow-font-size']) {
        const value = values.getPropertyValue(key); if (card.style.getPropertyValue(key) !== value) card.style.setProperty(key, value);
    }
}
