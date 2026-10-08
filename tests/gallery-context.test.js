import test from 'node:test';
import assert from 'node:assert/strict';
import { galleryForChat } from '../gallery-context.js';

test('current chat gallery finds saved images after character reorder without modifying originals', () => {
    const images = [
        {id:'inline',chatKey:'[null,0,"story"]'},
        {id:'pending',chatKey:'[null,0,"story"]'},
        {id:'current',chatKey:'[null,"7","story"]'},
        {id:'other',chatKey:'[null,0,"story"]'},
    ];
    const chat = [{extra:{meow_inline:[{variants:[{id:'inline'}]}],meow_pending:[{entryId:'pending'}]}}];
    const before = JSON.stringify(images);
    assert.deepEqual(galleryForChat(images,chat,'[null,7,"story"]').map(e=>e.id),['inline','pending','current']);
    assert.equal(JSON.stringify(images),before);
    assert.deepEqual(galleryForChat(images,[],'[null,8,"other"]'),[]);
});
