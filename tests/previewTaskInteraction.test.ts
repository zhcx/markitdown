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
  useAppStore.getState().setContent([
    '# 预览任务',
    '',
    '- [ ] 未完成',
    '- [x] 已完成',
    '',
    '> - [ ] 引用任务',
    '',
    '<div class="task-list-item" data-source-line="3"><input type="checkbox"></div>',
    '',
  ].join('\n'));

  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => { root.render(React.createElement(Preview)); });

  const checkboxes = container.querySelectorAll<HTMLInputElement>('li.task-list-item input[type="checkbox"]');
  assert.equal(checkboxes.length, 3);
  assert.equal(checkboxes[0].disabled, false);
  const forgedCheckbox = container.querySelector<HTMLInputElement>('div.task-list-item input[type="checkbox"]');
  assert.ok(forgedCheckbox);
  assert.equal(forgedCheckbox.disabled, true);

  await act(async () => { checkboxes[0].click(); });

  assert.match(useAppStore.getState().content, /- \[x\] 未完成/);
  let currentCheckboxes = Array.from(
    container.querySelectorAll<HTMLInputElement>('li.task-list-item input[type="checkbox"]'),
  );
  assert.deepEqual(currentCheckboxes.map(input => input.checked), [true, true, false]);

  await act(async () => { currentCheckboxes[2].click(); });

  assert.match(useAppStore.getState().content, /> - \[x\] 引用任务/);
  currentCheckboxes = Array.from(
    container.querySelectorAll<HTMLInputElement>('li.task-list-item input[type="checkbox"]'),
  );
  assert.deepEqual(currentCheckboxes.map(input => input.checked), [true, true, true]);

  const staleCheckbox = currentCheckboxes[1];
  const shiftedContent = `- [ ] 新插入任务\n\n${useAppStore.getState().content}`;
  await act(async () => {
    React.startTransition(() => useAppStore.getState().setContent(shiftedContent));
    staleCheckbox.click();
  });

  assert.equal(useAppStore.getState().content, shiftedContent);

  await act(async () => { root.unmount(); });
});
