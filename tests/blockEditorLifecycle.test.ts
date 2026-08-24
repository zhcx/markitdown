import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

function installDom() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
  const { window } = dom;
  const rect = { bottom: 0, height: 0, left: 0, right: 0, top: 0, width: 0, x: 0, y: 0, toJSON() { return this; } };
  window.Range.prototype.getClientRects = () => [rect] as never;
  window.Range.prototype.getBoundingClientRect = () => rect as never;
  Object.assign(globalThis, {
    window,
    document: window.document,
    HTMLElement: window.HTMLElement,
    Element: window.Element,
    Node: window.Node,
    Text: window.Text,
    MutationObserver: window.MutationObserver,
    getComputedStyle: window.getComputedStyle.bind(window),
    requestAnimationFrame: (callback: FrameRequestCallback) => setTimeout(() => callback(Date.now()), 0),
    cancelAnimationFrame: (id: number) => clearTimeout(id),
  });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: window.navigator });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  return dom;
}

test('BlockEditor preserves its live controller across callback rerenders and cleans up on unmount', async (context) => {
  const dom = installDom();
  context.after(() => dom.window.close());

  const { EditorView } = await import('prosemirror-view');
  const destroy = EditorView.prototype.destroy;
  let destroyCalls = 0;
  EditorView.prototype.destroy = function destroyView() {
    destroyCalls += 1;
    return destroy.call(this);
  };
  context.after(() => { EditorView.prototype.destroy = destroy; });

  const { BlockEditor } = await import('../src/components/Editor/BlockEditor.tsx');
  const { useAppStore } = await import('../src/stores/appStore.ts');
  useAppStore.getState().setEditorView(null);

  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  let markdown = 'AB\n';
  const render = (suffix: string) => root.render(React.createElement(BlockEditor, {
    markdown,
    onMarkdownChange: value => { markdown = value; },
    onUnsupportedMarkdown: () => {},
    onActiveLineChange: () => {},
    onActiveLineReveal: () => {},
    className: `callback-${suffix}`,
  }));

  await act(async () => { render('initial'); });
  const controller = useAppStore.getState().editorView;
  assert.ok(controller);
  assert.equal(controller.getValue(), 'AB\n');

  await act(async () => { controller.replaceRange(1, 1, 'C'); });
  controller.setSelection(2);
  const selection = controller.getSelection();
  assert.equal(controller.getValue(), 'ACB\n');

  await act(async () => { render('changed'); });
  assert.equal(useAppStore.getState().editorView, controller);
  assert.equal(controller.getValue(), 'ACB\n');
  assert.deepEqual(controller.getSelection(), selection);

  await act(async () => { controller.undo(); });
  assert.equal(controller.getValue(), 'AB\n');
  await act(async () => { controller.redo(); });
  assert.equal(controller.getValue(), 'ACB\n');

  markdown = '# External\n';
  await act(async () => { render('external'); });
  assert.equal(useAppStore.getState().editorView, controller);
  assert.equal(controller.getValue(), '# External\n');
  assert.equal(controller.line(1).text, '# External');

  await act(async () => { root.unmount(); });
  assert.equal(useAppStore.getState().editorView, null);
  assert.equal(destroyCalls, 1);
  assert.equal(container.innerHTML, '');
});
