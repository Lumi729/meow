// A scoped override: only Meow surfaces receive the chosen corner radius.
const SURFACES = '#meow-dialog,#meow-panel,#meow-viewer,#meow-inline-viewer,#meow-tag-editor,#meow-selection-dialog,#meow-mask-editor,#meow-gallery-picker,#meow-open-settings,#meow-floating,#meow-top-button,#meow-wand-entry,#meow-wand-button,.meow-gift,.meow-be-btn';
export function mountCorners(doc, ext, save) {
    const el = id => doc.getElementById(`meow-corners-${id}`);
    const stored = ext.meow_corners || {}, value = Number(stored.radius ?? 12);
    const settings = ext.meow_corners = { enabled: stored.enabled === true, radius: Number.isFinite(value) ? Math.min(32, Math.max(0, Math.round(value))) : 12 };
    const style = doc.getElementById('meow-corner-style') || Object.assign(doc.createElement('style'), { id: 'meow-corner-style' }); doc.head.append(style);
    const apply = () => {
        style.textContent = settings.enabled ? `:root :is(${SURFACES}), :root :is(${SURFACES}) * { border-radius:${settings.radius}px !important; }` : '';
        el('enabled').checked = settings.enabled; el('radius').value = String(settings.radius); el('value').textContent = `${settings.radius} px${settings.radius === 0 ? ' · 方角' : ''}`;
        el('state').textContent = settings.enabled ? '已统一猫猫圆角，修改立即保存。' : '当前保留各处原有美化，拖动滑块可统一调整。';
    };
    const set = radius => { settings.radius = Math.min(32, Math.max(0, Math.round(Number(radius) || 0))); settings.enabled = true; apply(); save(); };
    el('enabled').addEventListener('change', () => { settings.enabled = el('enabled').checked; apply(); save(); });
    el('radius').addEventListener('input', () => set(el('radius').value));
    el('square').addEventListener('click', () => set(0));
    el('round').addEventListener('click', () => set(12));
    el('reset').addEventListener('click', () => { settings.enabled = false; apply(); save(); });
    apply();
}
