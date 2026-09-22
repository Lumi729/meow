/** One persistent dialog shared by all entry points; generation survives closing. */
export function mountPanel(markup) {
    const dialog = document.createElement('dialog');
    dialog.id = 'meow-dialog';
    dialog.setAttribute('aria-label', 'Meow · 猫猫星绘');
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'meow-close';
    close.textContent = '✕ 关闭';
    close.setAttribute('aria-label', '关闭猫猫星绘');
    dialog.append(close);
    dialog.insertAdjacentHTML('beforeend', markup);
    document.body.append(dialog);
    let opener;
    const open = event => {
        if (dialog.open) return;
        opener = event.currentTarget;
        dialog.showModal();
        close.focus();
    };
    close.addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => {
        dialog.querySelector('#meow-token').value = '';
        opener?.focus();
    });
    dialog.addEventListener('click', event => {
        if (event.target !== dialog) return;
        const r = dialog.getBoundingClientRect();
        if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close();
    });
    const makeButton = (id, text) => {
        const button = document.createElement('button');
        button.id = id;
        button.type = 'button';
        button.textContent = text;
        button.setAttribute('aria-label', '打开 Meow 猫猫星绘');
        button.setAttribute('aria-haspopup', 'dialog');
        button.addEventListener('click', open);
        return button;
    };
    const menu = document.querySelector('#extensionsMenu');
    if (menu) {
        const item = document.createElement('div');
        item.id = 'meow-wand-entry';
        const button = makeButton('meow-wand-button', '✦ Meow · 猫猫星绘');
        button.removeEventListener('click', open);
        item.addEventListener('click', open);
        item.append(button);
        menu.append(item);
    }
    const settings = document.querySelector('#extensions_settings2') || document.querySelector('#extensions_settings');
    settings?.append(makeButton('meow-open-settings', 'ฅ 打开猫猫星绘 ✦'));
    const floating = makeButton('meow-floating', 'ฅ');
    floating.title = '猫猫星绘 · 点击打开，拖动移动';
    document.body.append(floating);
    const ctx = () => SillyTavern.getContext();
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.id = 'meow-reset-floating';
    reset.textContent = 'ฅ 找回猫猫悬浮按钮';
    reset.addEventListener('click', () => {
        floating.style.left = floating.style.top = 'auto';
        floating.style.right = '18px';
        floating.style.bottom = '110px';
        delete ctx().extensionSettings.meow_launcher;
        ctx().saveSettingsDebounced();
    });
    settings?.append(reset);
    const clamp = (v, max) => Math.min(Math.max(8, v), Math.max(8, max));
    const place = (x, y) => {
        floating.style.left = `${clamp(x, innerWidth - floating.offsetWidth - 8)}px`;
        floating.style.top = `${clamp(y, innerHeight - floating.offsetHeight - 8)}px`;
        floating.style.right = 'auto';
        floating.style.bottom = 'auto';
    };
    const saved = ctx().extensionSettings.meow_launcher;
    if (Number.isFinite(saved?.x) && Number.isFinite(saved?.y)) place(saved.x, saved.y);
    let drag, suppressClick = false;
    floating.addEventListener('click', event => {
        if (suppressClick) {
            event.stopImmediatePropagation();
            event.preventDefault();
            suppressClick = false;
        }
    }, true);
    floating.addEventListener('pointerdown', event => {
        if (event.button !== 0) return;
        suppressClick = false;
        const rect = floating.getBoundingClientRect();
        drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: rect.left, top: rect.top, moved: false };
        floating.setPointerCapture(event.pointerId);
    });
    floating.addEventListener('pointermove', event => {
        if (!drag || drag.id !== event.pointerId) return;
        const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
        if (Math.hypot(dx, dy) > 6) drag.moved = true;
        if (drag.moved) place(drag.left + dx, drag.top + dy);
    });
    const finish = event => {
        if (!drag || drag.id !== event.pointerId) return;
        suppressClick = drag.moved;
        if (drag.moved) {
            const r = floating.getBoundingClientRect();
            ctx().extensionSettings.meow_launcher = { x: r.left, y: r.top };
            ctx().saveSettingsDebounced();
        }
        drag = null;
    };
    floating.addEventListener('pointerup', finish);
    floating.addEventListener('pointercancel', finish);
    window.addEventListener('resize', () => {
        const r = floating.getBoundingClientRect();
        place(r.left, r.top);
    });
}
