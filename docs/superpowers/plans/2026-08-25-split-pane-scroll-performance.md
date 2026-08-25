# Split Pane Alignment and Scroll Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the first preview block with the first editor block and make bidirectional scrolling plus live pane resizing remain responsive on long Markdown documents.

**Architecture:** Introduce small scheduling primitives for latest-frame work and suspendable geometry invalidation, then integrate them into the existing `App.tsx` pane coordinator. Keep Markdown rendering and the current anchor interpolation algorithm intact; the optimization comes from one update per frame, zero anchor scans during drag, and one post-drag refresh.

**Tech Stack:** React 18, TypeScript, Zustand, Monaco Editor, ProseMirror, DOM `requestAnimationFrame`, `ResizeObserver`, Node test runner, Vite, Tauri 2.

---

## File Structure

- Create `src/utils/paneInteraction.ts`: browser-independent latest-frame queue, pixel-delta predicate, and suspendable invalidation controller.
- Create `tests/paneInteraction.test.ts`: deterministic fake frame/timer drivers for scheduling behavior.
- Create `tests/splitPanePerformanceContract.test.ts`: source/CSS integration contracts for aligned pane geometry and App wiring.
- Modify `src/App.tsx`: preview mode-row spacer, latest-frame drag queue, latest-frame scroll queue, and suspend/resume geometry lifecycle.
- Modify `src/components/Editor/Editor.tsx`: wrap the mode toggle in a fixed-height row.
- Modify `src/components/Editor/BlockEditor.css`: use the shared content-top variable and style the fixed mode row.
- Modify `src/styles/main.css`: define shared split-pane dimensions, preview spacer, aligned preview padding, and resizing containment.
- Modify `docs/performance.md`: document the pane performance contract and verification method.

### Task 1: Align the Editor and Preview Content Baselines

**Files:**
- Create: `tests/splitPanePerformanceContract.test.ts`
- Modify: `src/App.tsx:816-852`
- Modify: `src/components/Editor/Editor.tsx:37-43`
- Modify: `src/components/Editor/BlockEditor.css:26-35,272-299`
- Modify: `src/styles/main.css:7408-7568`

- [ ] **Step 1: Write the failing layout contract test**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('split editor and preview reserve the same mode row and content top inset', () => {
  const app = read('src/App.tsx');
  const editor = read('src/components/Editor/Editor.tsx');
  const blockStyles = read('src/components/Editor/BlockEditor.css');
  const mainStyles = read('src/styles/main.css');

  assert.match(editor, /className="editor-mode-row"[\s\S]*<EditorModeToggle/);
  assert.match(app, /className="preview-mode-row-spacer"/);
  assert.match(mainStyles, /--editor-mode-row-height:\s*31px/);
  assert.match(mainStyles, /--document-content-top-padding:\s*32px/);
  assert.match(mainStyles, /\.preview-mode-row-spacer[\s\S]*var\(--editor-mode-row-height\)/);
  assert.match(mainStyles, /\.preview-workspace-pane \.preview-document[\s\S]*var\(--document-content-top-padding\)/);
  assert.match(blockStyles, /\.block-editor-scroll[\s\S]*var\(--document-content-top-padding/);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
node --import ./tests/helpers/register-tsx-config.mjs --import tsx --import ./tests/helpers/register-css-loader.mjs --test tests/splitPanePerformanceContract.test.ts
```

Expected: FAIL because `editor-mode-row`, `preview-mode-row-spacer`, and the shared CSS variables do not exist.

- [ ] **Step 3: Add symmetric mode rows and shared top padding**

Wrap the toggle in `src/components/Editor/Editor.tsx`:

```tsx
<div className="editor-mode-row">
  <EditorModeToggle mode={effectiveMode} onChange={handleModeChange} />
</div>
```

Add the preview spacer in `src/App.tsx` immediately before `.preview-with-panel`:

```tsx
{settings.editor.pin_toolbar && <div className="preview-toolbar-offset" aria-hidden="true" />}
<div className="preview-mode-row-spacer" aria-hidden="true" />
<div className="preview-with-panel">
```

Define split dimensions and preview alignment in `src/styles/main.css`:

```css
.main-content.split {
  --editor-mode-row-height: 31px;
  --document-content-top-padding: 32px;
  gap: 0;
}

.preview-mode-row-spacer {
  flex: 0 0 var(--editor-mode-row-height);
  height: var(--editor-mode-row-height);
  background: var(--bg-document);
}

.preview-workspace-pane .preview-document {
  padding-top: var(--document-content-top-padding);
}
```

Replace the toggle positioning and block top padding in `src/components/Editor/BlockEditor.css`:

```css
.block-editor-scroll {
  padding: var(--document-content-top-padding, 32px) clamp(20px, 4vw, 48px) 120px;
}

.editor-mode-row {
  display: flex;
  flex: 0 0 var(--editor-mode-row-height, 31px);
  height: var(--editor-mode-row-height, 31px);
  align-items: flex-start;
  justify-content: flex-end;
  padding: 6px 10px 0;
  box-sizing: border-box;
}

.editor-mode-toggle {
  position: static;
  z-index: auto;
  display: inline-flex;
  gap: 2px;
  margin: 0;
  padding: 2px;
}
```

- [ ] **Step 4: Run focused layout tests and verify GREEN**

Run:

```powershell
node --import ./tests/helpers/register-tsx-config.mjs --import tsx --import ./tests/helpers/register-css-loader.mjs --test tests/splitPanePerformanceContract.test.ts tests/blockEditorNavigation.test.ts tests/blockEditorUiContract.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the alignment change**

```powershell
git add tests/splitPanePerformanceContract.test.ts src/App.tsx src/components/Editor/Editor.tsx src/components/Editor/BlockEditor.css src/styles/main.css
git commit -m "fix: 对齐编辑区与预览区内容基线"
```

### Task 2: Add Deterministic Latest-Frame Scheduling

**Files:**
- Create: `src/utils/paneInteraction.ts`
- Create: `tests/paneInteraction.test.ts`

- [ ] **Step 1: Write failing scheduler tests**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createLatestFrameTask,
  hasMeaningfulPixelDelta,
  type FrameDriver,
} from '../src/utils/paneInteraction.ts';

function fakeFrames() {
  let nextId = 1;
  const callbacks = new Map<number, () => void>();
  const driver: FrameDriver = {
    request: callback => {
      const id = nextId++;
      callbacks.set(id, callback);
      return id;
    },
    cancel: id => { callbacks.delete(id); },
  };
  return {
    driver,
    flush: () => {
      const queued = [...callbacks.values()];
      callbacks.clear();
      queued.forEach(callback => callback());
    },
    get size() { return callbacks.size; },
  };
}

test('latest frame task executes only the newest value in one frame', () => {
  const frames = fakeFrames();
  const values: number[] = [];
  const task = createLatestFrameTask<number>(frames.driver, value => values.push(value));

  task.schedule(1);
  task.schedule(2);
  task.schedule(3);

  assert.equal(frames.size, 1);
  frames.flush();
  assert.deepEqual(values, [3]);
});

test('flush applies the last pending value synchronously', () => {
  const frames = fakeFrames();
  const values: number[] = [];
  const task = createLatestFrameTask<number>(frames.driver, value => values.push(value));
  task.schedule(9);
  task.flush();
  frames.flush();
  assert.deepEqual(values, [9]);
});

test('cancel prevents queued work and pixel threshold ignores subpixel noise', () => {
  const frames = fakeFrames();
  const values: number[] = [];
  const task = createLatestFrameTask<number>(frames.driver, value => values.push(value));
  task.schedule(4);
  task.cancel();
  frames.flush();
  assert.deepEqual(values, []);
  assert.equal(hasMeaningfulPixelDelta(100, 100.75), false);
  assert.equal(hasMeaningfulPixelDelta(100, 101), true);
});
```

- [ ] **Step 2: Run scheduler tests and verify RED**

Run:

```powershell
node --import ./tests/helpers/register-tsx-config.mjs --import tsx --test tests/paneInteraction.test.ts
```

Expected: FAIL because `src/utils/paneInteraction.ts` does not exist.

- [ ] **Step 3: Implement the latest-frame task**

Create `src/utils/paneInteraction.ts`:

```ts
export interface FrameDriver {
  request: (callback: () => void) => number;
  cancel: (handle: number) => void;
}

export interface LatestFrameTask<T> {
  schedule: (value: T) => void;
  flush: () => void;
  cancel: () => void;
}

export const browserFrameDriver: FrameDriver = {
  request: callback => window.requestAnimationFrame(callback),
  cancel: handle => window.cancelAnimationFrame(handle),
};

export function createLatestFrameTask<T>(
  driver: FrameDriver,
  execute: (value: T) => void,
): LatestFrameTask<T> {
  let frame: number | null = null;
  let pending: T | undefined;
  let hasPending = false;

  const run = () => {
    frame = null;
    if (!hasPending) return;
    const value = pending as T;
    pending = undefined;
    hasPending = false;
    execute(value);
  };

  return {
    schedule(value) {
      pending = value;
      hasPending = true;
      if (frame === null) frame = driver.request(run);
    },
    flush() {
      if (frame !== null) driver.cancel(frame);
      frame = null;
      run();
    },
    cancel() {
      if (frame !== null) driver.cancel(frame);
      frame = null;
      pending = undefined;
      hasPending = false;
    },
  };
}

export function hasMeaningfulPixelDelta(previous: number, next: number, minimum = 1) {
  return Math.abs(next - previous) >= minimum;
}
```

- [ ] **Step 4: Run the scheduler tests and verify GREEN**

Run the Task 2 test command again. Expected: 3 tests PASS.

- [ ] **Step 5: Commit the scheduler**

```powershell
git add src/utils/paneInteraction.ts tests/paneInteraction.test.ts
git commit -m "perf: 增加最新动画帧调度器"
```

### Task 3: Route Live Pane Dragging Through the Frame Scheduler

**Files:**
- Modify: `src/App.tsx:112-126,182-245,388-553`
- Modify: `src/styles/main.css:379-401`
- Modify: `tests/splitPanePerformanceContract.test.ts`

- [ ] **Step 1: Add failing App integration contracts**

Append:

```ts
test('pane dragging uses latest-frame scheduling and flushes the final pointer', () => {
  const app = read('src/App.tsx');
  const styles = read('src/styles/main.css');
  assert.match(app, /createLatestFrameTask<PendingPanelDrag>/);
  assert.match(app, /dragFrameTask\.schedule\(\{ type, clientX \}\)/);
  assert.match(app, /dragFrameTask\.flush\(\)/);
  assert.match(app, /hasMeaningfulPixelDelta/);
  assert.match(app, /window\.addEventListener\('blur', handleMouseUp\)/);
  assert.doesNotMatch(app, /setSplitRatio\([^)]*\)[\s\S]{0,200}mousemove/iu);
  assert.match(styles, /html\.panel-resizing \.document-pane[\s\S]*contain:\s*layout paint/);
});
```

- [ ] **Step 2: Run the contract test and verify RED**

Run the Task 1 focused command. Expected: FAIL because App still manages `pendingDrag` and `dragFrame` refs directly.

- [ ] **Step 3: Replace drag refs with `createLatestFrameTask`**

In `src/App.tsx`, define:

```ts
type PendingPanelDrag = {
  type: 'split' | 'sidebar' | 'proofread' | 'chatbot';
  clientX: number;
};
```

Import the scheduler:

```ts
import {
  browserFrameDriver,
  createLatestFrameTask,
  hasMeaningfulPixelDelta,
} from './utils/paneInteraction';
```

Extract the existing frame body into `applyPanelDrag` and skip subpixel writes:

```ts
const applyPanelDrag = useCallback((drag: PendingPanelDrag) => {
  const bounds = dragBounds.current;
  if (!bounds) return;

  if (drag.type === 'split') {
    const sidebarOffset = sidebarVisible ? sidebarWidth : 0;
    const availableWidth = Math.max(1, bounds.width - sidebarOffset);
    const ratio = Math.max(0.1, Math.min(0.9,
      (drag.clientX - bounds.left - sidebarOffset) / availableWidth,
    ));
    if (!hasMeaningfulPixelDelta(
      dragValues.current.splitRatio * availableWidth,
      ratio * availableWidth,
    )) return;
    const divider = dividerRef.current;
    const editor = divider?.previousElementSibling as HTMLElement | null;
    const preview = divider?.nextElementSibling as HTMLElement | null;
    if (editor) editor.style.flex = String(ratio);
    if (preview) preview.style.flex = String(1 - ratio);
    dragValues.current.splitRatio = ratio;
    return;
  }

  if (drag.type === 'sidebar') {
    const width = Math.max(150, Math.min(400, drag.clientX - bounds.left));
    if (!hasMeaningfulPixelDelta(dragValues.current.sidebarWidth, width)) return;
    const sidebar = sidebarDividerRef.current?.previousElementSibling as HTMLElement | null;
    if (sidebar) sidebar.style.width = `${width}px`;
    dragValues.current.sidebarWidth = width;
    return;
  }

  const width = Math.max(200, Math.min(500, bounds.right - drag.clientX));
  if (drag.type === 'proofread') {
    if (!hasMeaningfulPixelDelta(dragValues.current.proofreadPanelWidth, width)) return;
    const panel = proofreadDividerRef.current?.nextElementSibling as HTMLElement | null;
    if (panel) panel.style.width = `${width}px`;
    dragValues.current.proofreadPanelWidth = width;
    balanceDocumentPanes(width, dragValues.current.chatbotPanelWidth);
    return;
  }

  if (!hasMeaningfulPixelDelta(dragValues.current.chatbotPanelWidth, width)) return;
  const panel = chatbotDividerRef.current?.nextElementSibling as HTMLElement | null;
  if (panel) panel.style.width = `${width}px`;
  dragValues.current.chatbotPanelWidth = width;
  balanceDocumentPanes(dragValues.current.proofreadPanelWidth, width);
}, [balanceDocumentPanes, sidebarVisible, sidebarWidth]);

const dragFrameTask = useMemo(
  () => createLatestFrameTask<PendingPanelDrag>(browserFrameDriver, applyPanelDrag),
  [applyPanelDrag],
);

useEffect(() => () => dragFrameTask.cancel(), [dragFrameTask]);

const scheduleDragFrame = useCallback((type: PendingPanelDrag['type'], clientX: number) => {
  dragFrameTask.schedule({ type, clientX });
}, [dragFrameTask]);
```

At the start of `handleMouseUp`, call:

```ts
dragFrameTask.flush();
```

Remove the old `pendingDrag` and `dragFrame` refs and their cleanup.

Register the same finalizer for window focus loss so a mouse release outside the WebView cannot leave resize mode active:

```ts
document.addEventListener('mouseup', handleMouseUp);
window.addEventListener('blur', handleMouseUp);

return () => {
  document.removeEventListener('mouseup', handleMouseUp);
  window.removeEventListener('blur', handleMouseUp);
};
```

Extend resizing containment:

```css
html.panel-resizing .document-pane,
html.panel-resizing .editor-pane,
html.panel-resizing .preview-pane,
html.panel-resizing .proofread-side-panel,
html.panel-resizing .chatbot-side-panel {
  pointer-events: none;
  contain: layout paint;
}
```

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```powershell
node --import ./tests/helpers/register-tsx-config.mjs --import tsx --import ./tests/helpers/register-css-loader.mjs --test tests/paneInteraction.test.ts tests/splitPanePerformanceContract.test.ts tests/blockEditorUiContract.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit drag scheduling**

```powershell
git add src/App.tsx src/styles/main.css tests/splitPanePerformanceContract.test.ts
git commit -m "perf: 合并分栏拖动帧更新"
```

### Task 4: Add Suspendable Geometry Invalidation

**Files:**
- Modify: `src/utils/paneInteraction.ts`
- Modify: `tests/paneInteraction.test.ts`

- [ ] **Step 1: Write failing invalidation tests**

Append:

```ts
import {
  createSuspendableInvalidation,
  type DelayDriver,
} from '../src/utils/paneInteraction.ts';

function fakeDelays() {
  let nextId = 1;
  const callbacks = new Map<number, () => void>();
  const driver: DelayDriver = {
    schedule: callback => {
      const id = nextId++;
      callbacks.set(id, callback);
      return id;
    },
    cancel: id => { callbacks.delete(id); },
  };
  return {
    driver,
    flush: () => {
      const queued = [...callbacks.values()];
      callbacks.clear();
      queued.forEach(callback => callback());
    },
    get size() { return callbacks.size; },
  };
}

test('suspended invalidation defers all work and resumes once', () => {
  const delays = fakeDelays();
  let refreshes = 0;
  const invalidation = createSuspendableInvalidation(delays.driver, () => { refreshes += 1; }, 80);
  invalidation.suspend();
  invalidation.invalidate();
  invalidation.invalidate();
  delays.flush();
  assert.equal(refreshes, 0);
  invalidation.resume();
  assert.equal(delays.size, 1);
  delays.flush();
  assert.equal(refreshes, 1);
});

test('dispose cancels a pending geometry refresh', () => {
  const delays = fakeDelays();
  let refreshes = 0;
  const invalidation = createSuspendableInvalidation(delays.driver, () => { refreshes += 1; }, 80);
  invalidation.invalidate();
  invalidation.dispose();
  delays.flush();
  assert.equal(refreshes, 0);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run the Task 2 test command. Expected: FAIL because the invalidation API is missing.

- [ ] **Step 3: Implement suspendable invalidation**

Append to `src/utils/paneInteraction.ts`:

```ts
export interface DelayDriver {
  schedule: (callback: () => void, delayMs: number) => number;
  cancel: (handle: number) => void;
}

export const browserDelayDriver: DelayDriver = {
  schedule: (callback, delayMs) => window.setTimeout(callback, delayMs),
  cancel: handle => window.clearTimeout(handle),
};

export function createSuspendableInvalidation(
  driver: DelayDriver,
  refresh: () => void,
  delayMs: number,
) {
  let suspended = false;
  let dirty = false;
  let handle: number | null = null;

  const run = () => {
    handle = null;
    if (suspended || !dirty) return;
    dirty = false;
    refresh();
  };
  const schedule = () => {
    if (suspended || handle !== null || !dirty) return;
    handle = driver.schedule(run, delayMs);
  };

  return {
    invalidate() {
      dirty = true;
      schedule();
    },
    suspend() {
      suspended = true;
      if (handle !== null) driver.cancel(handle);
      handle = null;
    },
    resume() {
      suspended = false;
      schedule();
    },
    dispose() {
      if (handle !== null) driver.cancel(handle);
      handle = null;
      dirty = false;
      suspended = true;
    },
  };
}
```

- [ ] **Step 4: Run scheduler tests and verify GREEN**

Run the Task 2 test command. Expected: all scheduler and invalidation tests PASS.

- [ ] **Step 5: Commit invalidation control**

```powershell
git add src/utils/paneInteraction.ts tests/paneInteraction.test.ts
git commit -m "perf: 增加可暂停几何刷新控制器"
```

### Task 5: Isolate Scroll Sync From Resize Geometry Work

**Files:**
- Modify: `src/App.tsx:109-122,590-783`
- Modify: `tests/splitPanePerformanceContract.test.ts`
- Test: `tests/scrollSync.test.ts`

- [ ] **Step 1: Add failing scroll integration contracts**

Append:

```ts
test('scroll sync uses one latest-frame task and suspends geometry during panel resize', () => {
  const app = read('src/App.tsx');
  assert.match(app, /createLatestFrameTask<ScrollSyncRequest>/);
  assert.match(app, /createSuspendableInvalidation/);
  assert.match(app, /scrollGeometryControlRef\.current\.suspend\(\)/);
  assert.match(app, /scrollGeometryControlRef\.current\.invalidate\(\)/);
  assert.match(app, /scrollGeometryControlRef\.current\.resume\(\)/);
  assert.match(app, /typeof ResizeObserver === 'undefined'/);
  assert.doesNotMatch(app, /useEffect\([\s\S]*\}, \[mode, editorView, previewScrollElement, previewRenderVersion, splitRatio\]\)/);
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```powershell
node --import ./tests/helpers/register-tsx-config.mjs --import tsx --import ./tests/helpers/register-css-loader.mjs --test tests/splitPanePerformanceContract.test.ts tests/scrollSync.test.ts
```

Expected: FAIL because App still owns raw scroll frame refs and its geometry timer cannot be suspended.

- [ ] **Step 3: Integrate latest-frame scroll sync**

Import `browserDelayDriver` and `createSuspendableInvalidation`. Define:

```ts
interface ScrollGeometryControl {
  suspend: () => void;
  invalidate: () => void;
  resume: () => void;
}

const scrollGeometryControlRef = useRef<ScrollGeometryControl>({
  suspend: () => undefined,
  invalidate: () => undefined,
  resume: () => undefined,
});
```

Inside the scroll-sync effect, replace `pendingScrollSync` and `scrollSyncFrame` with:

```ts
type ScrollSyncRequest = {
  source: ObservableScrollViewport;
  target: ObservableScrollViewport;
  anchors: ScrollAnchor[];
  range: ScrollRange;
};

const scrollFrameTask = createLatestFrameTask<ScrollSyncRequest>(browserFrameDriver, request => {
  const nextTop = getSyncedScrollTop(request.source, request.target, request.anchors, request.range);
  if (Math.abs(request.target.getScrollTop() - nextTop) < 0.5) return;
  programmaticScrollTargets.set(request.target, nextTop);
  request.target.setScrollTop(nextTop);
});

const syncScroll = (
  source: ObservableScrollViewport,
  target: ObservableScrollViewport,
  anchors: ScrollAnchor[],
  range: ScrollRange,
) => {
  const ignoredTop = programmaticScrollTargets.get(source);
  if (ignoredTop !== undefined) {
    programmaticScrollTargets.delete(source);
    if (Math.abs(source.getScrollTop() - ignoredTop) < 0.5) return;
  }
  scrollFrameTask.schedule({ source, target, anchors, range });
};
```

Replace the timer and observer callback with:

```ts
const geometryInvalidation = createSuspendableInvalidation(
  browserDelayDriver,
  () => {
    rebuildScrollAnchors();
    syncEditorToPreview();
  },
  80,
);
scrollGeometryControlRef.current = {
  suspend: geometryInvalidation.suspend,
  invalidate: geometryInvalidation.invalidate,
  resume: geometryInvalidation.resume,
};

const geometryObserver = typeof ResizeObserver === 'undefined'
  ? null
  : new ResizeObserver(geometryInvalidation.invalidate);
geometryObserver?.observe(previewScrollElement);
if (previewDocument) geometryObserver?.observe(previewDocument);
geometryObserver?.observe(editorContent || editorView.scrollDOM);
window.addEventListener('resize', geometryInvalidation.invalidate);
```

Cleanup must call:

```ts
scrollFrameTask.cancel();
geometryInvalidation.dispose();
geometryObserver?.disconnect();
window.removeEventListener('resize', geometryInvalidation.invalidate);
scrollGeometryControlRef.current = {
  suspend: () => undefined,
  invalidate: () => undefined,
  resume: () => undefined,
};
```

Remove `splitRatio` from the effect dependency list:

```ts
}, [mode, editorView, previewScrollElement, previewRenderVersion]);
```

- [ ] **Step 4: Suspend and resume geometry around every panel drag**

At the end of each panel `mousedown` initializer, add:

```ts
scrollGeometryControlRef.current.suspend();
scrollGeometryControlRef.current.invalidate();
```

At the end of `handleMouseUp`, after removing `panel-resizing`, add:

```ts
scrollGeometryControlRef.current.resume();
```

Calling `invalidate()` while suspended guarantees that `resume()` schedules exactly one post-drag refresh, even if a platform coalesces all `ResizeObserver` notifications.

- [ ] **Step 5: Run scroll and integration tests and verify GREEN**

Run the Task 5 focused command. Expected: PASS with the existing seven scroll tests plus the new contracts.

- [ ] **Step 6: Commit scroll isolation**

```powershell
git add src/App.tsx tests/splitPanePerformanceContract.test.ts
git commit -m "perf: 隔离滚动同步与分栏几何刷新"
```

### Task 6: Document and Browser-Verify the Performance Contract

**Files:**
- Modify: `docs/performance.md`
- Modify: `tests/blockEditorDocsContract.test.ts`

- [ ] **Step 1: Add a failing documentation contract**

Append to `tests/blockEditorDocsContract.test.ts`:

```ts
test('performance guide documents latest-frame sync and drag-time geometry suspension', () => {
  const performance = read('docs/performance.md');
  assert.match(performance, /latest[- ]frame|最新.*帧/iu);
  assert.match(performance, /拖动期间.*锚点/iu);
  assert.match(performance, /松手.*一次/iu);
});
```

- [ ] **Step 2: Run the docs test and verify RED**

Run:

```powershell
node --import ./tests/helpers/register-tsx-config.mjs --import tsx --import ./tests/helpers/register-css-loader.mjs --test tests/blockEditorDocsContract.test.ts
```

Expected: FAIL because the performance guide does not describe the new contract.

- [ ] **Step 3: Update `docs/performance.md`**

Add:

```md
## 分栏与滚动热路径

- 双向滚动采用 latest-frame 策略：同一动画帧中的旧请求由最新请求覆盖。
- 滚动帧只使用缓存范围和源码锚点，不读取 DOM 几何。
- 分栏拖动实时更新面板宽度，但拖动期间暂停源码锚点重建。
- 松手后提交最后指针位置，并只执行一次几何重建与滚动校准。
- 编辑区与预览区通过共享模式行高度和正文顶部内边距保持首块同高。
```

- [ ] **Step 4: Run focused docs and performance tests**

Run:

```powershell
node --import ./tests/helpers/register-tsx-config.mjs --import tsx --import ./tests/helpers/register-css-loader.mjs --test tests/blockEditorDocsContract.test.ts tests/paneInteraction.test.ts tests/splitPanePerformanceContract.test.ts tests/scrollSync.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run browser acceptance**

Start the development server:

```powershell
npm run dev -- --host 127.0.0.1 --port 4173
```

With `agent-browser`, load a long mixed Markdown document and verify:

```text
1. First editor and preview block top coordinates differ by <= 1px.
2. Editor-to-preview and preview-to-editor scrolling update within one animation frame.
3. A burst of mousemove events leaves the divider at the last clientX.
4. Temporarily wrap `Element.prototype.getBoundingClientRect` and count calls where `this.matches('[data-source-line]')`; the count remains 0 between `mousedown` and `mouseup`, then increases during the single post-drag refresh.
5. No page errors or Vite overlay appear.
```

- [ ] **Step 6: Commit documentation**

```powershell
git add docs/performance.md tests/blockEditorDocsContract.test.ts
git commit -m "docs: 说明分栏与滚动性能契约"
```

### Task 7: Final Verification and Desktop Packaging

**Files:**
- Verify only; modify files only if a failing check exposes a defect.

- [ ] **Step 1: Run the complete frontend quality gate**

```powershell
npm test
npm run lint
npm run build
```

Expected: all tests PASS, ESLint exits 0, and Vite production build exits 0.

- [ ] **Step 2: Run the Rust check**

```powershell
cargo check --manifest-path src-tauri/Cargo.toml
```

Expected: exit 0.

- [ ] **Step 3: Request code review**

Review from the commit before Task 1 through current HEAD. Fix every Critical or Important finding with a failing regression test, then rerun Steps 1-2.

- [ ] **Step 4: Build installers in an isolated target directory**

```powershell
$env:CARGO_TARGET_DIR = 'D:\Documents\code\zeditor\src-tauri\target-performance-final'
npm run tauri build
```

If a user-launched process locks that binary, copy the completed `zeditor.exe` into a new explicit target directory and run:

```powershell
$packageTarget = 'D:\Documents\code\zeditor\src-tauri\target-performance-package'
$packageRelease = Join-Path $packageTarget 'release'
New-Item -ItemType Directory -Path $packageRelease -Force | Out-Null
Copy-Item -LiteralPath 'D:\Documents\code\zeditor\src-tauri\target-performance-final\release\zeditor.exe' -Destination (Join-Path $packageRelease 'zeditor.exe') -Force
$env:CARGO_TARGET_DIR = $packageTarget
npx tauri bundle --bundles msi nsis
```

Expected: MSI and NSIS bundles both finish with exit 0.

- [ ] **Step 5: Record artifacts and clean state**

```powershell
Get-FileHash -Algorithm SHA256 -LiteralPath @(
  'src-tauri\target-performance-final\release\bundle\msi\Zeditor_0.4.0_x64_en-US.msi',
  'src-tauri\target-performance-final\release\bundle\nsis\Zeditor_0.4.0_x64-setup.exe'
)
git status --short
```

Expected: both hashes are printed and Git status is clean.

---

## Completion Criteria

- First content blocks align within 1px in split mode.
- Scrolling and resizing stay latest-frame and do not accumulate stale work.
- Anchor geometry performs no full rebuild during drag and one rebuild after drag.
- Long mixed Markdown remains editable and previewable without regressions.
- Full test, lint, build, Rust, browser, review, and packaging gates pass.
