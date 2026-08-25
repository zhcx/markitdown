import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { blockSchema } from '../src/components/Editor/blockSchema.ts';

test('every block node and inline mark has a DOM serializer for EditorView', () => {
  for (const [name, type] of Object.entries(blockSchema.nodes)) {
    if (name === 'doc' || name === 'text') continue;
    assert.equal(typeof type.spec.toDOM, 'function', `${name} must define toDOM`);
  }
  for (const [name, type] of Object.entries(blockSchema.marks)) {
    assert.equal(typeof type.spec.toDOM, 'function', `${name} must define toDOM`);
  }
});

test('raw Markdown is a text-only top-level block with a safe DOM serializer', () => {
  const raw = blockSchema.nodes.raw_markdown;
  assert.ok(raw);
  assert.equal(raw.spec.group, 'block');
  assert.equal(raw.spec.code, true);
  assert.equal(raw.spec.marks, '');
  const node = raw.create({ kind: 'html' }, blockSchema.text('<b>safe text</b>'));
  assert.deepEqual(raw.spec.toDOM?.(node), [
    'pre',
    { class: 'raw-markdown-block', 'data-raw-markdown-kind': 'html' },
    ['code', 0],
  ]);
});

test('task-list documents can mount in EditorView without blanking the application', async (context) => {
  const dom = new JSDOM('<!doctype html><html><body><div id="editor"></div></body></html>', {
    url: 'http://localhost/',
  });
  const { window } = dom;
  Object.assign(globalThis, {
    window,
    document: window.document,
    HTMLElement: window.HTMLElement,
    Element: window.Element,
    Node: window.Node,
    Text: window.Text,
    MutationObserver: window.MutationObserver,
    getComputedStyle: window.getComputedStyle.bind(window),
  });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: window.navigator });
  context.after(() => dom.window.close());

  const { EditorState } = await import('prosemirror-state');
  const { EditorView } = await import('prosemirror-view');
  const paragraph = blockSchema.nodes.paragraph.create(null, blockSchema.text('完成验收'));
  const item = blockSchema.nodes.task_item.create({ checked: false }, paragraph);
  const list = blockSchema.nodes.task_list.create(null, item);
  const doc = blockSchema.nodes.doc.create(null, list);
  const mount = document.querySelector('#editor');
  assert.ok(mount);

  const view = new EditorView({ mount: mount as HTMLElement }, {
    state: EditorState.create({ doc }),
  });
  context.after(() => view.destroy());

  assert.equal(mount.querySelector('.task-item')?.textContent, '完成验收');
  assert.ok(mount.querySelector('.task-checkbox input[type="checkbox"]'));
});
