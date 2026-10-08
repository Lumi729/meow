// Filter only the applied copy; saved/exported themes remain intact.
const STORY = '.meow-inline-card,.meow-inline-card *,.meow-message-generate,.meow-message-generate *';
const guard = `:not(:where(${STORY}))`;
function selectors(text) {
    const parts = []; let start = 0, depth = 0, quote = '';
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (c === '\\') { i++; continue; }
        if (quote) { if (c === quote) quote = ''; continue; }
        if (c === '"' || c === "'") { quote = c; continue; }
        if (c === '(' || c === '[') depth++;
        if (c === ')' || c === ']') depth--;
        if (c === ',' && !depth) { parts.push(text.slice(start, i)); start = i + 1; }
    }
    parts.push(text.slice(start)); return parts;
}
export function panelThemeCSS(doc, css) {
    const sheet = new doc.defaultView.CSSStyleSheet(); sheet.replaceSync(css || '');
    const render = rules => [...rules].map(rule => {
        if (rule.type === 1) {
            const selector = selectors(rule.selectorText).map(s => {
                const match = s.match(/::[\w-]+(?:\([^)]*\))?\s*$|:(?:before|after|first-line|first-letter)\s*$/i);
                const at = match ? match.index : s.length;
                return s.slice(0, at).trimEnd() + guard + s.slice(at);
            }).join(',');
            return `${selector}{${rule.style.cssText}}`;
        }
        if (rule.cssRules && rule.type !== 7) return `${rule.cssText.slice(0, rule.cssText.indexOf('{'))}{${render(rule.cssRules)}}`;
        return rule.cssText;
    }).join('\n');
    return render(sheet.cssRules);
}
