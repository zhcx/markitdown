import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

function installDom() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
  const { window } = dom;
  Object.assign(globalThis, {
    window,
    document: window.document,
    HTMLElement: window.HTMLElement,
    HTMLInputElement: window.HTMLInputElement,
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

test('clicking a preview task checkbox updates the source Markdown', async (context) => {
  const dom = installDom();
  context.after(() => dom.window.close());

  const { Preview } = await import('../src/components/Preview/Preview.tsx');
  const { useAppStore } = await import('../src/stores/appStore.ts');
  useAppStore.getState().setContent('# 预览任务\n\n- [ ] 未完成\n- [x] 已完成\n');

  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => { root.render(React.createElement(Preview)); });

  const checkboxes = container.querySelectorAll<HTMLInputElement>('.task-list-item input[type="checkbox"]');
  assert.equal(checkboxes.length, 2);
  assert.equal(checkboxes[0].disabled, false);

  await act(async () => { checkboxes[0].click(); });

  assert.match(useAppStore.getState().content, /- \[x\] 未完成/);
  assert.deepEqual(
    Array.from(container.querySelectorAll<HTMLInputElement>('.task-list-item input[type="checkbox"]')).map(input => input.checked),
    [true, true],
  );

  await act(async () => { root.unmount(); });
});
