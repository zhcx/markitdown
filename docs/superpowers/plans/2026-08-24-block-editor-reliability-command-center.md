# Block Editor Reliability and Command Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore reliable block editing and editor-preview synchronization, reduce editor whitespace, soften the preview position indicator, and expose block, formatting, media, and AI actions through one searchable slash-command system.

**Architecture:** React owns a stable ProseMirror mount node while ProseMirror exclusively owns that node's contents. A dedicated document bridge keeps Markdown, block source maps, selection offsets, and scroll anchors on one version; a shared command registry powers the slash menu, block menu, and high-frequency toolbar actions. Existing Markdown persistence, source-mode fallback, AI requests, and AI diff confirmation remain authoritative.

**Tech Stack:** React 18, TypeScript 5.9, ProseMirror, Zustand, Monaco Editor, markdown-it, Node test runner, ESLint, Vite, Tauri 2.

---

## File responsibility map

- Create `src/utils/blockDocumentBridge.ts`: own the current ProseMirror document's Markdown and `BlockSourceMap` snapshot.
- Modify `src/utils/blockEditorController.ts`: read all values from the bridge and expose `syncDocument` for transactions.
- Modify `src/components/Editor/BlockEditor.tsx`: use a stable JSX mount, call the bridge per transaction, and consume shared commands.
- Create `src/components/Editor/blockKeymap.ts`: Enter, Shift+Enter, Backspace, undo, and redo behavior.
- Create `src/utils/editorCommandRegistry.ts`: command metadata, categories, aliases, surfaces, filtering, and grouping.
- Create `src/utils/aiEditorCommands.ts`: adapt current block or selection to existing AI store actions and diff proposals.
- Modify `src/utils/slashCommands.ts`: retain trigger parsing and legacy command data while extending block action types for the registry.
- Modify `src/components/Editor/SourceEditor.tsx`: consume the shared registry in source mode.
- Modify `src/components/Editor/SlashCommandMenu.tsx`: grouped menu rendering and disabled-reason presentation.
- Modify `src/components/Editor/BlockPropertyMenu.tsx`: consume block and AI commands from the shared registry.
- Modify `src/components/Toolbar/Toolbar.tsx`: route shared formatting operations through command execution.
- Modify `src/App.tsx` and `src/utils/scrollSync.ts`: refresh anchors and avoid forced scrolling for visible active blocks.
- Modify `src/components/Editor/BlockEditor.css` and `src/styles/main.css`: adaptive editor width and subtle preview position treatment.
- Modify `docs/block-editor.md`: document the repaired behavior and unified command menu.

## Design coverage matrix

| Confirmed design requirement | Implementation tasks |
| --- | --- |
| React/ProseMirror DOM ownership and persistent editing | Task 2 |
| Live Markdown, selection, block ID, and source-line snapshot | Task 1 |
| Enter, Shift+Enter, Backspace, undo, and redo | Task 2 |
| Bidirectional editor-preview synchronization and loop prevention | Task 3 |
| Adaptive 20–48px editor padding and 980px content width | Task 3 |
| Subtle 2px preview position rail with 5% tint | Task 3 |
| Unified block, format, media, and AI command registry | Tasks 4 and 6 |
| Current-block fallback and AI diff confirmation | Task 5 |
| Unsupported Markdown fallback and recoverable errors | Task 7 |
| Automated tests, lint, frontend build, desktop smoke test, and installers | Task 8 |

## Task 1: Establish a live block document bridge

**Files:**
- Create: `src/utils/blockDocumentBridge.ts`
- Modify: `src/utils/blockEditorController.ts`
- Test: `tests/blockDocumentBridge.test.ts`
- Test: `tests/blockEditorController.test.ts`

- [ ] **Step 1: Write the failing bridge tests**

Create `tests/blockDocumentBridge.test.ts` with real ProseMirror documents:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMarkdown } from '../src/utils/markdownBlockCodec.ts';
import { createBlockDocumentBridge } from '../src/utils/blockDocumentBridge.ts';

function documentFor(markdown: string) {
  const parsed = parseMarkdown(markdown);
  if (!parsed.document) throw new Error('expected block document');
  return parsed.document;
}

test('updates Markdown and source ranges as one versioned snapshot', () => {
  const bridge = createBlockDocumentBridge(documentFor('# One\n'));
  const initial = bridge.getSnapshot();
  const updated = bridge.syncDocument(documentFor('# One\n\nTwo\n'));

  assert.equal(initial.version, 0);
  assert.equal(updated.version, 1);
  assert.equal(updated.markdown, '# One\n\nTwo\n');
  assert.equal(updated.sourceMap.blocks.length, 2);
  assert.equal(updated.sourceMap.blocks[1]?.lineFrom, 3);
});

test('does not increment the version for an equivalent document', () => {
  const document = documentFor('Same\n');
  const bridge = createBlockDocumentBridge(document);
  assert.equal(bridge.syncDocument(documentFor('Same\n')).version, 0);
});
```

Append this regression to `tests/blockEditorController.test.ts`:

```ts
test('syncDocument refreshes controller values after a direct editor transaction', () => {
  const harness = createHarness('Title\n');
  const parsed = parseMarkdown('Title updated\n');
  if (!parsed.document) throw new Error('expected block document');

  harness.controller.syncDocument(parsed.document);

  assert.equal(harness.controller.getValue(), 'Title updated\n');
  assert.equal(harness.controller.line(1).text, 'Title updated');
});
```

- [ ] **Step 2: Run the tests and confirm the expected failure**

Run:

```powershell
node --test tests/blockDocumentBridge.test.ts tests/blockEditorController.test.ts
```

Expected: FAIL because `blockDocumentBridge.ts` and `controller.syncDocument` do not exist.

- [ ] **Step 3: Implement the bridge**

Create `src/utils/blockDocumentBridge.ts`:

```ts
import type { Node } from 'prosemirror-model';
import type { BlockSourceMap } from '../types/blockEditor.ts';
import { buildBlockSourceMap } from './blockSourceMap.ts';
import { serializeMarkdown } from './markdownBlockCodec.ts';

export interface BlockDocumentSnapshot {
  document: Node;
  markdown: string;
  sourceMap: BlockSourceMap;
  version: number;
}

export interface BlockDocumentBridge {
  getSnapshot: () => BlockDocumentSnapshot;
  syncDocument: (document: Node) => BlockDocumentSnapshot;
}

function createSnapshot(document: Node, version: number): BlockDocumentSnapshot {
  const markdown = serializeMarkdown(document);
  return {
    document,
    markdown,
    sourceMap: buildBlockSourceMap(markdown, document),
    version,
  };
}

export function createBlockDocumentBridge(document: Node): BlockDocumentBridge {
  let snapshot = createSnapshot(document, 0);
  return {
    getSnapshot: () => snapshot,
    syncDocument: (nextDocument) => {
      const markdown = serializeMarkdown(nextDocument);
      if (markdown === snapshot.markdown) return snapshot;
      snapshot = {
        document: nextDocument,
        markdown,
        sourceMap: buildBlockSourceMap(markdown, nextDocument),
        version: snapshot.version + 1,
      };
      return snapshot;
    },
  };
}
```

- [ ] **Step 4: Adapt the controller to the bridge**

In `src/utils/blockEditorController.ts`, export a specialized controller type and replace the captured `source`/`sourceMap` variables:

```ts
import { createBlockDocumentBridge, type BlockDocumentSnapshot } from './blockDocumentBridge.ts';

export interface BlockEditorController extends EditorController {
  syncDocument: (document: Node) => BlockDocumentSnapshot;
}
```

Inside `createBlockEditorController`, create `const bridge = createBlockDocumentBridge(view.state.doc);`. Every method must call `bridge.getSnapshot()` immediately before reading Markdown or source ranges. Add:

```ts
syncDocument: (document: Node) => bridge.syncDocument(document),
```

After `view.dispatch(transaction)` in `updateSource`, call `bridge.syncDocument(view.state.doc)` before notifying the host. Return `BlockEditorController` instead of casting to the generic controller alone.

- [ ] **Step 5: Run focused and related tests**

Run:

```powershell
node --test tests/blockDocumentBridge.test.ts tests/blockEditorController.test.ts tests/blockSourceMap.test.ts tests/markdownBlockCodec.test.ts
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/utils/blockDocumentBridge.ts src/utils/blockEditorController.ts tests/blockDocumentBridge.test.ts tests/blockEditorController.test.ts
git commit -m 'fix: 同步块文档快照与源行映射'
```

## Task 2: Stabilize the ProseMirror mount and restore keyboard editing

**Files:**
- Create: `src/components/Editor/blockKeymap.ts`
- Modify: `src/components/Editor/BlockEditor.tsx`
- Test: `tests/blockEditorUiContract.test.ts`
- Test: `tests/blockKeymap.test.ts`

- [ ] **Step 1: Write failing mount and keyboard tests**

Append to `tests/blockEditorUiContract.test.ts`:

```ts
test('React declares a stable ProseMirror mount instead of appending unmanaged children', () => {
  const source = read('src/components/Editor/BlockEditor.tsx');
  assert.match(source, /ref=\{editorHostRef\}[\s\S]*className="block-editor-content"/);
  assert.doesNotMatch(source, /document\.createElement\('div'\)/);
  assert.doesNotMatch(source, /appendChild\(editorHost\)/);
});
```

Create `tests/blockKeymap.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { EditorState, TextSelection, type Transaction } from 'prosemirror-state';
import { blockSchema } from '../src/components/Editor/blockSchema.ts';
import { createBlockKeyBindings } from '../src/components/Editor/blockKeymap.ts';

function apply(command: ReturnType<typeof createBlockKeyBindings>[string], state: EditorState) {
  let transaction: Transaction | undefined;
  assert.equal(command(state, next => { transaction = next; }), true);
  return transaction ? state.apply(transaction) : state;
}

test('Shift-Enter inserts a hard break inside the current block', () => {
  const paragraph = blockSchema.nodes.paragraph.create(null, blockSchema.text('AB'));
  const doc = blockSchema.nodes.doc.create(null, paragraph);
  const state = EditorState.create({ schema: blockSchema, doc, selection: TextSelection.create(doc, 2) });
  const next = apply(createBlockKeyBindings()['Shift-Enter'], state);
  assert.equal(next.doc.firstChild?.child(1).type.name, 'hard_break');
});

test('Backspace converts an empty heading to a paragraph', () => {
  const heading = blockSchema.nodes.heading.create({ level: 2 });
  const doc = blockSchema.nodes.doc.create(null, heading);
  const state = EditorState.create({ schema: blockSchema, doc, selection: TextSelection.create(doc, 1) });
  const next = apply(createBlockKeyBindings().Backspace, state);
  assert.equal(next.doc.firstChild?.type.name, 'paragraph');
});
```

- [ ] **Step 2: Verify both tests fail for the intended reasons**

Run:

```powershell
node --test tests/blockEditorUiContract.test.ts tests/blockKeymap.test.ts
```

Expected: FAIL because the JSX mount and `blockKeymap.ts` are absent.

- [ ] **Step 3: Implement block key bindings**

Create `src/components/Editor/blockKeymap.ts`:

```ts
import { baseKeymap, chainCommands, setBlockType, type Command } from 'prosemirror-commands';
import { keymap } from 'prosemirror-keymap';
import type { Schema } from 'prosemirror-model';
import { splitListItem } from 'prosemirror-schema-list';
import { blockSchema } from './blockSchema.ts';

export const insertHardBreak: Command = (state, dispatch) => {
  const hardBreak = state.schema.nodes.hard_break;
  if (!hardBreak) return false;
  if (dispatch) dispatch(state.tr.replaceSelectionWith(hardBreak.create()).scrollIntoView());
  return true;
};

export const resetEmptyTextBlock: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  if (!empty || !$from.parent.isTextblock || $from.parent.content.size > 0 || $from.parent.type === state.schema.nodes.paragraph) return false;
  return setBlockType(state.schema.nodes.paragraph)(state, dispatch);
};

export function createBlockKeyBindings(schema: Schema = blockSchema): Record<string, Command> {
  return {
    ...baseKeymap,
    Enter: chainCommands(
      splitListItem(schema.nodes.task_item),
      splitListItem(schema.nodes.list_item),
      baseKeymap.Enter,
    ),
    'Shift-Enter': insertHardBreak,
    Backspace: chainCommands(resetEmptyTextBlock, baseKeymap.Backspace),
  };
}

export function createBlockKeymap(schema: Schema = blockSchema) {
  return keymap(createBlockKeyBindings(schema));
}
```

- [ ] **Step 4: Replace the unmanaged mount in BlockEditor**

Add `editorHostRef`, render an empty JSX node inside `.block-editor-scroll`, and initialize with that node:

```tsx
const rootRef = useRef<HTMLDivElement>(null);
const editorHostRef = useRef<HTMLDivElement>(null);

<div ref={rootRef} className="block-editor-scroll" aria-label="块编辑器">
  <div ref={editorHostRef} className="block-editor-content" />
  <div className="block-editor-overlay" aria-hidden="true">
    {blockHandle && <button type="button" className="block-handle">⋮⋮</button>}
  </div>
</div>
```

The initialization effect must use `new EditorView({ mount: editorHostRef.current }, props)` and must not create, append, remove, or replace a DOM node. Replace `keymap(baseKeymap)` with `createBlockKeymap()`.

In `dispatchTransaction`, call `const snapshot = controllerRef.current?.syncDocument(nextState.doc)` immediately after `view.updateState(nextState)`, publish `snapshot.markdown` on `docChanged`, and derive active source lines from the refreshed controller.

- [ ] **Step 5: Run focused tests and build**

```powershell
node --test tests/blockEditorUiContract.test.ts tests/blockKeymap.test.ts tests/blockCommands.test.ts tests/blockEditorController.test.ts
npm run build
```

Expected: all tests PASS and Vite exits with code 0.

- [ ] **Step 6: Commit**

```powershell
git add src/components/Editor/BlockEditor.tsx src/components/Editor/blockKeymap.ts tests/blockEditorUiContract.test.ts tests/blockKeymap.test.ts
git commit -m 'fix: 稳定块编辑挂载与键盘输入'
```

## Task 3: Restore scroll synchronization and soften layout feedback

**Files:**
- Modify: `src/utils/scrollSync.ts`
- Modify: `src/App.tsx`
- Modify: `src/components/Editor/BlockEditor.css`
- Modify: `src/styles/main.css`
- Test: `tests/scrollSync.test.ts`
- Test: `tests/blockEditorNavigation.test.ts`

- [ ] **Step 1: Write failing visibility and style tests**

Append to `tests/scrollSync.test.ts`:

```ts
import { isTargetVisible } from '../src/utils/scrollSync.ts';

test('treats an active block inside the padded viewport as visible', () => {
  assert.equal(isTargetVisible({ top: 100, bottom: 700 }, { top: 140, bottom: 180 }, 24), true);
  assert.equal(isTargetVisible({ top: 100, bottom: 700 }, { top: 690, bottom: 730 }, 24), false);
});
```

Append to `tests/blockEditorNavigation.test.ts`:

```ts
test('block layout uses adaptive padding and preview highlight stays subtle', () => {
  const blockStyles = read('src/components/Editor/BlockEditor.css');
  const mainStyles = read('src/styles/main.css');
  assert.match(blockStyles, /padding:\s*32px\s+clamp\(20px,\s*4vw,\s*48px\)/);
  assert.match(blockStyles, /max-width:\s*980px/);
  assert.match(mainStyles, /is-active-source-block[\s\S]*box-shadow:\s*-2px\s+0\s+0/);
  assert.doesNotMatch(mainStyles, /is-active-source-block[\s\S]*box-shadow:\s*-4px\s+0\s+0/);
});
```

- [ ] **Step 2: Verify RED**

```powershell
node --test tests/scrollSync.test.ts tests/blockEditorNavigation.test.ts
```

Expected: FAIL because `isTargetVisible` and the selected visual values are absent.

- [ ] **Step 3: Add viewport visibility logic**

Add to `src/utils/scrollSync.ts`:

```ts
export interface ScreenRange { top: number; bottom: number }

export function isTargetVisible(container: ScreenRange, target: ScreenRange, padding = 0): boolean {
  const safePadding = Math.max(0, padding);
  return target.top >= container.top + safePadding && target.bottom <= container.bottom - safePadding;
}
```

In `App.tsx`, call this helper before cursor-driven alignment. If the target is visible, update only `activeEditorLine`; do not set either scroll viewport. Keep explicit preview clicks, outline jumps, and real scroll events unchanged. Rebuild anchors after `previewRenderVersion`, `editorView`, `previewScrollElement`, and split-ratio layout changes.

- [ ] **Step 4: Apply the confirmed visual values**

In `BlockEditor.css`, set:

```css
.block-editor-scroll {
  padding: 32px clamp(20px, 4vw, 48px) 120px;
}

.block-editor-content {
  width: min(100%, 980px);
  max-width: 980px;
}
```

In `src/styles/main.css`, set:

```css
.preview-document .is-active-source-block {
  border-radius: 4px;
  background: color-mix(in srgb, var(--accent-color) 5%, transparent) !important;
  box-shadow: -2px 0 0 color-mix(in srgb, var(--accent-color) 58%, transparent);
  transition: background-color 120ms ease, box-shadow 120ms ease;
}
```

- [ ] **Step 5: Run synchronization tests and production build**

```powershell
node --test tests/scrollSync.test.ts tests/blockEditorNavigation.test.ts tests/activeSourceLine.test.ts tests/headingAnchors.test.ts
npm run build
```

Expected: all tests PASS and build exits 0.

- [ ] **Step 6: Commit**

```powershell
git add src/utils/scrollSync.ts src/App.tsx src/components/Editor/BlockEditor.css src/styles/main.css tests/scrollSync.test.ts tests/blockEditorNavigation.test.ts
git commit -m 'fix: 恢复块编辑预览同步并优化留白'
```

## Task 4: Create the unified editor command registry

**Files:**
- Create: `src/utils/editorCommandRegistry.ts`
- Modify: `src/utils/slashCommands.ts`
- Modify: `src/components/Editor/SlashCommandMenu.tsx`
- Test: `tests/editorCommandRegistry.test.ts`
- Test: `tests/slashCommands.test.ts`

- [ ] **Step 1: Write failing registry tests**

Create `tests/editorCommandRegistry.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { EDITOR_COMMANDS, filterEditorCommands, getEditorCommandAvailability, groupEditorCommands } from '../src/utils/editorCommandRegistry.ts';

test('exposes block, format, media, and AI categories', () => {
  assert.deepEqual([...new Set(EDITOR_COMMANDS.map(command => command.category))], ['blocks', 'format', 'media', 'ai']);
});

test('searches Chinese labels, English aliases, and AI keywords', () => {
  assert.deepEqual(filterEditorCommands('翻译').map(command => command.id), ['ai-translate']);
  assert.ok(filterEditorCommands('rewrite').some(command => command.id === 'ai-rewrite'));
  assert.ok(filterEditorCommands('heading').some(command => command.id === 'heading-1'));
});

test('groups commands in the agreed menu order', () => {
  assert.deepEqual(groupEditorCommands(EDITOR_COMMANDS).map(group => group.category), ['blocks', 'format', 'media', 'ai']);
});

test('keeps unavailable AI commands visible with a configuration reason', () => {
  const command = EDITOR_COMMANDS.find(item => item.id === 'ai-rewrite');
  if (!command) throw new Error('missing AI rewrite command');
  assert.deepEqual(getEditorCommandAvailability(command, { mode: 'blocks', aiEnabled: false, aiConfigured: false }), {
    visible: true,
    enabled: false,
    reason: '请先在设置中启用并配置 AI',
  });
});
```

- [ ] **Step 2: Verify RED**

```powershell
node --test tests/editorCommandRegistry.test.ts tests/slashCommands.test.ts
```

Expected: FAIL because the registry does not exist.

- [ ] **Step 3: Implement registry types and AI command metadata**

Create `src/utils/editorCommandRegistry.ts` with these public types and category order:

```ts
import { SLASH_COMMANDS, type SlashCommandInsertion, type BlockSlashAction } from './slashCommands.ts';

export type EditorCommandCategory = 'blocks' | 'format' | 'media' | 'ai';
export type EditorCommandSurface = 'slash' | 'block-menu' | 'toolbar';
export type AIEditorCommandId = 'ai-rewrite' | 'ai-translate' | 'ai-proofread' | 'ai-summary' | 'ai-continue';

export interface EditorCommandContext {
  mode: 'blocks' | 'source';
  aiEnabled: boolean;
  aiConfigured: boolean;
}

export interface EditorCommandAvailability {
  visible: boolean;
  enabled: boolean;
  reason?: string;
}

export interface EditorCommandDefinition {
  id: string;
  category: EditorCommandCategory;
  title: string;
  description: string;
  shortcut: string;
  icon: string;
  aliases: string[];
  keywords: string[];
  surfaces: EditorCommandSurface[];
  insertion?: SlashCommandInsertion;
  blockAction?: BlockSlashAction;
  aiAction?: AIEditorCommandId;
}

export interface EditorCommandGroup {
  category: EditorCommandCategory;
  label: string;
  commands: EditorCommandDefinition[];
}

const BLOCK_COMMAND_IDS = new Set([
  'heading-1', 'heading-2', 'heading-3', 'heading-4', 'quote',
  'unordered-list', 'ordered-list', 'task-list', 'code', 'divider',
]);
const FORMAT_COMMAND_IDS = new Set(['bold', 'italic', 'strikethrough', 'highlight', 'inline-code', 'link']);

function categoryFor(commandId: string): EditorCommandCategory {
  if (BLOCK_COMMAND_IDS.has(commandId)) return 'blocks';
  if (FORMAT_COMMAND_IDS.has(commandId)) return 'format';
  return 'media';
}

function surfacesFor(category: EditorCommandCategory): EditorCommandSurface[] {
  if (category === 'blocks') return ['slash', 'block-menu', 'toolbar'];
  if (category === 'format') return ['slash', 'toolbar'];
  return ['slash'];
}

const CATEGORY_ORDER: EditorCommandCategory[] = ['blocks', 'format', 'media', 'ai'];
const CATEGORY_LABELS: Record<EditorCommandCategory, string> = {
  blocks: '基础块',
  format: '格式',
  media: '媒体',
  ai: 'AI 写作',
};

const TEXT_COMMAND: EditorCommandDefinition = {
  id: 'paragraph',
  category: 'blocks',
  title: '正文',
  description: '转换为普通文本块',
  shortcut: '/text',
  icon: 'T',
  aliases: ['text', 'paragraph'],
  keywords: ['正文', '文本'],
  surfaces: ['slash', 'block-menu'],
  blockAction: { kind: 'turn-into', type: 'paragraph' },
};

export function filterEditorCommands(query: string, commands: EditorCommandDefinition[] = EDITOR_COMMANDS) {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return commands;
  return commands.filter((command) => [command.title, command.description, command.shortcut, ...command.aliases, ...command.keywords]
    .join(' ').toLocaleLowerCase().includes(normalized));
}

export function groupEditorCommands(commands: EditorCommandDefinition[]): EditorCommandGroup[] {
  return CATEGORY_ORDER.map(category => ({
    category,
    label: CATEGORY_LABELS[category],
    commands: commands.filter(command => command.category === category),
  })).filter(group => group.commands.length > 0);
}

export function getEditorCommandAvailability(
  command: EditorCommandDefinition,
  context: EditorCommandContext,
): EditorCommandAvailability {
  if (command.category === 'ai' && (!context.aiEnabled || !context.aiConfigured)) {
    return { visible: true, enabled: false, reason: '请先在设置中启用并配置 AI' };
  }
  if (context.mode === 'blocks' && !command.blockAction && !command.insertion && !command.aiAction) {
    return { visible: false, enabled: false };
  }
  return { visible: true, enabled: true };
}
```

Extend `BlockSlashAction` in `src/utils/slashCommands.ts` with `{ kind: 'turn-into'; type: 'paragraph' }`. Build `EDITOR_COMMANDS` by enriching every existing command and appending the text and AI definitions:

```ts
const AI_COMMANDS: EditorCommandDefinition[] = [
  { id: 'ai-rewrite', category: 'ai', title: '改写当前块', description: '优化表达并确认差异', shortcut: '/rewrite', icon: 'AI', aliases: ['rewrite', 'polish', '润色'], keywords: ['改写', '优化', '表达'], surfaces: ['slash', 'block-menu'], aiAction: 'ai-rewrite' },
  { id: 'ai-translate', category: 'ai', title: '翻译', description: '翻译当前块或选区', shortcut: '/translate', icon: '译', aliases: ['translate'], keywords: ['翻译', '语言'], surfaces: ['slash', 'block-menu'], aiAction: 'ai-translate' },
  { id: 'ai-proofread', category: 'ai', title: '校对', description: '检查当前块或选区', shortcut: '/proofread', icon: '校', aliases: ['proofread', 'check'], keywords: ['校对', '错别字', '语法'], surfaces: ['slash', 'block-menu'], aiAction: 'ai-proofread' },
  { id: 'ai-summary', category: 'ai', title: '生成摘要', description: '在当前块下方插入摘要', shortcut: '/summary', icon: '摘', aliases: ['summary'], keywords: ['摘要', '总结'], surfaces: ['slash'], aiAction: 'ai-summary' },
  { id: 'ai-continue', category: 'ai', title: '续写', description: '基于当前块继续写作', shortcut: '/continue', icon: '续', aliases: ['continue', 'complete'], keywords: ['续写', '伴写'], surfaces: ['slash', 'block-menu'], aiAction: 'ai-continue' },
];

export const EDITOR_COMMANDS: EditorCommandDefinition[] = [
  TEXT_COMMAND,
  ...SLASH_COMMANDS.map((command) => {
    const category = categoryFor(command.id);
    return {
      ...command,
      category,
      aliases: command.keywords.split(/\s+/u).filter(Boolean),
      keywords: command.keywords.split(/\s+/u).filter(Boolean),
      surfaces: surfacesFor(category),
    };
  }),
  ...AI_COMMANDS,
];
```

- [ ] **Step 4: Keep slash trigger compatibility and group the UI**

`src/utils/slashCommands.ts` must continue exporting `findSlashCommandTrigger`, `SLASH_COMMANDS`, and `filterSlashCommands` for compatibility. It must not import the registry, which avoids a circular dependency. `SourceEditor` and `BlockEditor` migrate to `EDITOR_COMMANDS` and `filterEditorCommands` in Task 6.

In `SlashCommandMenu.tsx`, call `groupEditorCommands(commands)` and `getEditorCommandAvailability` for every entry. Render a header for every group, keep unavailable AI commands visible with their reason, and block their pointer/Enter execution. Preserve the existing viewport clamping, `role="option"`, selected index, pointer behavior, and keyboard hints.

- [ ] **Step 5: Run registry and menu tests**

```powershell
node --test tests/editorCommandRegistry.test.ts tests/slashCommands.test.ts tests/blockEditorIntegrations.test.ts
npm run build
```

Expected: all tests PASS and build exits 0.

- [ ] **Step 6: Commit**

```powershell
git add src/utils/editorCommandRegistry.ts src/utils/slashCommands.ts src/components/Editor/SlashCommandMenu.tsx tests/editorCommandRegistry.test.ts tests/slashCommands.test.ts
git commit -m 'feat: 建立统一编辑命令注册表'
```

## Task 5: Adapt AI commands to current block or selection

**Files:**
- Create: `src/utils/aiEditorCommands.ts`
- Modify: `src/stores/aiStore.ts`
- Test: `tests/aiEditorCommands.test.ts`

- [ ] **Step 1: Write failing AI adapter tests**

Create `tests/aiEditorCommands.test.ts` using a fake `EditorController` and injected services. Verify these behaviors:

```ts
test('rewrite proposes a diff for the current block when selection is empty', async () => {
  const proposals: unknown[] = [];
  const controller = controllerFor('First\n\nSecond block\n', 8, 8);
  await executeAIEditorCommand('ai-rewrite', controller, services({
    rewriteSelection: async () => 'Second improved',
    proposeEdit: proposal => proposals.push(proposal),
  }));
  assert.deepEqual(proposals, [{
    kind: 'polish',
    reason: 'AI 改写：优化当前块表达，结果需确认后应用。',
    before: 'Second block',
    after: 'Second improved',
    from: 7,
    to: 19,
  }]);
});

test('translate uses the selected range and never writes directly', async () => {
  const proposals: unknown[] = [];
  const controller = controllerFor('Hello world\n', 0, 5);
  await executeAIEditorCommand('ai-translate', controller, services({
    translateText: async () => 'Hello|||你好',
    proposeEdit: proposal => proposals.push(proposal),
  }));
  assert.equal(controller.getValue(), 'Hello world\n');
  assert.equal((proposals[0] as { after: string }).after, '你好');
});
```

Use these complete deterministic helpers in the same test file:

```ts
import type { EditorController } from '../src/types/editor.ts';
import type { AIEditorCommandServices } from '../src/utils/aiEditorCommands.ts';

function controllerFor(initial: string, from: number, to: number): EditorController {
  let value = initial;
  let selection = { from, to, empty: from === to };
  const lineAt = (offset: number) => {
    const safe = Math.max(0, Math.min(value.length, offset));
    const lineFrom = value.lastIndexOf('\n', Math.max(0, safe - 1)) + 1;
    const nextBreak = value.indexOf('\n', safe);
    const lineTo = nextBreak < 0 ? value.length : nextBreak;
    return { from: lineFrom, to: lineTo, number: value.slice(0, lineFrom).split('\n').length, text: value.slice(lineFrom, lineTo) };
  };
  const controller = {
    kind: 'blocks' as const,
    scrollDOM: {} as HTMLElement,
    getScrollTop: () => 0,
    getScrollHeight: () => 0,
    getClientHeight: () => 0,
    getTopForLineNumber: () => 0,
    setScrollTop: () => undefined,
    onScroll: () => () => undefined,
    getValue: () => value,
    getSelection: () => selection,
    getText: (start: number, end: number) => value.slice(start, end),
    replaceRange: (start: number, end: number, text: string) => { value = value.slice(0, start) + text + value.slice(end); },
    setSelection: (start: number, end = start) => { selection = { from: start, to: end, empty: start === end }; },
    lineAt,
    line: (number: number) => lineAt(value.split('\n').slice(0, Math.max(0, number - 1)).join('\n').length + (number > 1 ? 1 : 0)),
    coordsAtPos: () => ({ left: 10, bottom: 30, x: 10, y: 30 }),
    focus: () => undefined,
    undo: () => undefined,
    redo: () => undefined,
    revealOffset: () => undefined,
    dispatch: () => undefined,
    state: {
      selection: { main: selection },
      sliceDoc: (start: number, end: number) => value.slice(start, end),
      doc: { length: value.length, lines: value.split('\n').length, lineAt, line: (number: number) => controller.line(number) },
      update: spec => spec,
    },
  } satisfies EditorController;
  return controller;
}

function services(overrides: Partial<AIEditorCommandServices> = {}): AIEditorCommandServices {
  return {
    rewriteSelection: async text => text,
    translateText: async text => `${text}|||${text}`,
    summarizeText: async text => text,
    checkProofread: async () => undefined,
    getCompanionSuggestion: async () => undefined,
    proposeEdit: () => undefined,
    showCompanion: () => undefined,
    ...overrides,
  };
}
```

- [ ] **Step 2: Verify RED**

```powershell
node --test tests/aiEditorCommands.test.ts
```

Expected: FAIL because `aiEditorCommands.ts` does not exist.

- [ ] **Step 3: Implement target resolution and injected AI execution**

Create `src/utils/aiEditorCommands.ts` with:

```ts
import type { EditorController } from '../types/editor.ts';
import type { AIEditProposal } from '../stores/aiStore.ts';
import type { AIEditorCommandId } from './editorCommandRegistry.ts';

export interface AIEditorCommandServices {
  rewriteSelection: (text: string) => Promise<string>;
  translateText: (text: string) => Promise<string>;
  summarizeText: (text: string) => Promise<string>;
  checkProofread: (text: string, baseOffset: number) => Promise<void>;
  getCompanionSuggestion: (text: string, context?: string) => Promise<void>;
  proposeEdit: (proposal: Omit<AIEditProposal, 'id' | 'createdAt'>) => void;
  showCompanion: (position: { x: number; y: number } | null) => void;
}

export function resolveAICommandTarget(controller: EditorController) {
  const selection = controller.getSelection();
  if (!selection.empty) return { from: selection.from, to: selection.to, text: controller.getText(selection.from, selection.to) };
  const line = controller.lineAt(selection.from);
  return { from: line.from, to: line.to, text: line.text };
}
```

Implement the executor exactly as follows:

```ts
export async function executeAIEditorCommand(
  id: AIEditorCommandId,
  controller: EditorController,
  services: AIEditorCommandServices,
) {
  const target = resolveAICommandTarget(controller);
  if (!target.text.trim()) return;

  if (id === 'ai-rewrite') {
    const after = await services.rewriteSelection(target.text);
    if (after && after !== target.text) services.proposeEdit({ kind: 'polish', reason: 'AI 改写：优化当前块表达，结果需确认后应用。', before: target.text, after, from: target.from, to: target.to });
    return;
  }
  if (id === 'ai-translate') {
    const result = await services.translateText(target.text);
    const separator = result.indexOf('|||');
    const after = separator >= 0 ? result.slice(separator + 3) : '';
    if (after && after !== target.text) services.proposeEdit({ kind: 'translation', reason: 'AI 翻译：译文需确认后应用。', before: target.text, after, from: target.from, to: target.to });
    return;
  }
  if (id === 'ai-proofread') {
    await services.checkProofread(target.text, target.from);
    return;
  }
  if (id === 'ai-summary') {
    const summary = await services.summarizeText(target.text);
    if (summary) services.proposeEdit({ kind: 'structure', reason: 'AI 摘要：根据当前块提炼，结果需确认后插入。', before: '', after: `\n\n## 摘要\n\n${summary}`, from: target.to, to: target.to });
    return;
  }
  controller.setSelection(target.to);
  services.showCompanion(controller.coordsAtPos(target.to));
  await services.getCompanionSuggestion(target.text);
}
```

- [ ] **Step 4: Add the production service adapter**

Export `runAIEditorCommand(id, controller)` with this production adapter:

```ts
export function runAIEditorCommand(id: AIEditorCommandId, controller: EditorController) {
  const ai = useAIStore.getState();
  return executeAIEditorCommand(id, controller, {
    rewriteSelection: ai.rewriteSelection,
    translateText: ai.translateText,
    summarizeText: ai.summarizeText,
    checkProofread: ai.checkProofread,
    getCompanionSuggestion: ai.getCompanionSuggestion,
    proposeEdit: ai.proposeEdit,
    showCompanion: position => ai.setCompanionVisible(true, position || undefined),
  });
}
```

- [ ] **Step 5: Run AI and edit-safety tests**

```powershell
node --test tests/aiEditorCommands.test.ts tests/agentSupport.test.ts tests/blockEditorSaveIntegration.test.ts
npm run build
```

Expected: all tests PASS and build exits 0.

- [ ] **Step 6: Commit**

```powershell
git add src/utils/aiEditorCommands.ts src/stores/aiStore.ts tests/aiEditorCommands.test.ts
git commit -m 'feat: 接入块级 AI 差异确认命令'
```

## Task 6: Use the registry in block editor, block menu, and toolbar

**Files:**
- Modify: `src/components/Editor/BlockEditor.tsx`
- Modify: `src/components/Editor/SourceEditor.tsx`
- Modify: `src/components/Editor/BlockPropertyMenu.tsx`
- Modify: `src/components/Toolbar/Toolbar.tsx`
- Modify: `src/components/Editor/BlockEditor.css`
- Test: `tests/blockEditorIntegrations.test.ts`
- Test: `tests/blockEditorProperties.test.ts`

- [ ] **Step 1: Write failing surface-integration tests**

Append these source-contract regressions:

```ts
test('BlockEditor routes slash and AI actions through the shared registry', () => {
  const editor = read('src/components/Editor/BlockEditor.tsx');
  assert.match(editor, /runAIEditorCommand/);
  assert.match(editor, /surfaces\.includes\('slash'\)/);
  assert.match(editor, /replaceRange\(menu\.from,\s*menu\.to,\s*''/);
  assert.match(editor, /finally[\s\S]*controller\.focus\(\)/);
});

test('BlockPropertyMenu consumes registry definitions', () => {
  const menu = read('src/components/Editor/BlockPropertyMenu.tsx');
  assert.match(menu, /commands:\s*EditorCommandDefinition\[\]/);
  assert.doesNotMatch(menu, /const options:/);
});
```

- [ ] **Step 2: Verify RED**

```powershell
node --test tests/blockEditorIntegrations.test.ts tests/blockEditorProperties.test.ts
```

Expected: FAIL because the three surfaces still use separate command logic.

- [ ] **Step 3: Integrate slash execution in BlockEditor**

In both `BlockEditor.tsx` and `SourceEditor.tsx`, compute visible commands with:

```ts
const slashCommands = useMemo(
  () => filterEditorCommands(slashMenu?.query || '', EDITOR_COMMANDS.filter(command => command.surfaces.includes('slash'))),
  [slashMenu?.query],
);
```

On selection:

1. Remove `menu.from..menu.to` through `controller.replaceRange`.
2. Execute `blockAction` against the refreshed view, `insertion` through the controller, or `aiAction` through `runAIEditorCommand`.
3. Await asynchronous actions, then focus the controller.
4. Keep the current Markdown unchanged when an action throws; set the existing AI status message for AI failures.

- [ ] **Step 4: Reuse registry commands in the block menu**

Change `BlockPropertyMenu` to accept `commands` and `onSelect(command)`. Supply commands whose surfaces include `block-menu`, grouped into “转换为” and “AI 写作”. Existing block transformations still call `changeBlockTypeAtIndex`; AI commands first select the handled block's source range, then run the AI adapter.

- [ ] **Step 5: Route high-frequency toolbar formatting through registered commands**

In `Toolbar.tsx`, replace hard-coded wrappers for bold, italic, strike, inline code, link, quote, lists, code block, and divider with a small `executeToolbarCommand(commandId)` adapter that reads the command definition and applies its `insertion` through the current `EditorController`. Keep image modal ownership in the toolbar, but resolve the image command metadata from the registry.

- [ ] **Step 6: Style grouped command surfaces**

Add category headers, disabled-reason text, AI accent icons, menu scrolling, and a focus-visible ring to `BlockEditor.css`. Keep semantic theme variables only; do not add fixed light/dark color values.

- [ ] **Step 7: Run integration tests, lint, and build**

```powershell
node --test tests/blockEditorIntegrations.test.ts tests/blockEditorProperties.test.ts tests/slashCommands.test.ts tests/aiEditorCommands.test.ts
npm run lint
npm run build
```

Expected: tests PASS, ESLint exits 0, and build exits 0.

- [ ] **Step 8: Commit**

```powershell
git add src/components/Editor/BlockEditor.tsx src/components/Editor/SourceEditor.tsx src/components/Editor/BlockPropertyMenu.tsx src/components/Toolbar/Toolbar.tsx src/components/Editor/BlockEditor.css tests/blockEditorIntegrations.test.ts tests/blockEditorProperties.test.ts
git commit -m 'feat: 统一块编辑命令入口'
```

## Task 7: Harden fallback, focus, and documentation

**Files:**
- Modify: `src/components/Editor/Editor.tsx`
- Modify: `src/components/Editor/EditorUnsupportedNotice.tsx`
- Modify: `src/components/Editor/BlockEditor.tsx`
- Modify: `docs/block-editor.md`
- Test: `tests/blockEditorFallback.test.ts`
- Test: `tests/blockEditorSaveIntegration.test.ts`

- [ ] **Step 1: Add failing fallback tests**

Append these exact regressions:

```ts
test('unsupported Markdown is stored before the tab is forced to source mode', () => {
  const editor = read('src/components/Editor/Editor.tsx');
  const handler = editor.match(/handleUnsupported[\s\S]*?useCallback[\s\S]*?\);/)?.[0] || '';
  assert.match(handler, /\(markdown:\s*string\)/);
  assert.ok(handler.indexOf('setContent(markdown)') < handler.indexOf('setForcedSourceTabId'));
});

test('equivalent external Markdown does not recreate ProseMirror state', () => {
  const blockEditor = read('src/components/Editor/BlockEditor.tsx');
  const effect = blockEditor.match(/useEffect\(\(\) => \{[\s\S]*?parsedExternal[\s\S]*?\}, \[markdown\]\);/)?.[0] || '';
  assert.match(effect, /controller\.getValue\(\)\s*===\s*markdown/);
  assert.ok(effect.indexOf('controller.getValue()') < effect.indexOf('EditorState.create'));
});
```

- [ ] **Step 2: Verify RED**

```powershell
node --test tests/blockEditorFallback.test.ts tests/blockEditorSaveIntegration.test.ts
```

Expected: both new assertions FAIL because the handler does not accept Markdown and the effect compares serialized documents instead of the live controller value.

- [ ] **Step 3: Implement safe fallback ordering**

In `Editor.tsx`, ensure `setContent(markdown)` completes synchronously before setting `forcedSourceTabId`. In `BlockEditor.tsx`, compare external Markdown with `controller.getValue()` before parsing and rebuilding state. Preserve selection around supported replacements by mapping source offsets through the refreshed bridge.

- [ ] **Step 4: Add recoverable notices**

`EditorUnsupportedNotice` must state why block mode is unavailable and provide one source-mode button. Initialization errors must render the same recoverable notice with the original Markdown still in Store.

- [ ] **Step 5: Update user documentation**

Document in `docs/block-editor.md`:

- stable block input and keyboard behavior;
- adaptive editor width and subtle preview indicator;
- four slash-command categories and keyboard navigation;
- current-block fallback when no text is selected;
- AI diff confirmation and one-step undo;
- source-mode fallback for tables, formulas, Mermaid, HTML, details, footnotes, video, and TOC.

- [ ] **Step 6: Run fallback tests and full Node suite**

```powershell
node --test tests/blockEditorFallback.test.ts tests/blockEditorSaveIntegration.test.ts
npm test
```

Expected: all tests PASS.

- [ ] **Step 7: Commit**

```powershell
git add src/components/Editor/Editor.tsx src/components/Editor/EditorUnsupportedNotice.tsx src/components/Editor/BlockEditor.tsx docs/block-editor.md tests/blockEditorFallback.test.ts tests/blockEditorSaveIntegration.test.ts
git commit -m 'fix: 完善块编辑回退与错误恢复'
```

## Task 8: Full verification and Windows test package

**Files:**
- Verify only; do not change source unless a failing check identifies a defect.

- [ ] **Step 1: Run the complete automated test suite**

```powershell
npm test
```

Expected: exit code 0 and zero failed tests.

- [ ] **Step 2: Run lint and production frontend build**

```powershell
npm run lint
npm run build
```

Expected: both commands exit 0.

- [ ] **Step 3: Run focused Rust checks**

```powershell
cargo check --manifest-path src-tauri/Cargo.toml
```

Expected: exit code 0.

- [ ] **Step 4: Perform desktop interaction smoke testing**

Close any running `src-tauri/target/release/zeditor.exe`, then run:

```powershell
npm run tauri dev
```

Verify in both dark and light themes:

1. Type Chinese and English text in block mode.
2. Exercise Enter, Shift+Enter, Backspace, undo, and redo.
3. Open/close the block handle and slash menu without losing the editor.
4. Search and execute one command from each category.
5. Trigger AI rewrite and reject the diff; trigger again and accept it.
6. Scroll both panes and click a preview source block.
7. Resize the split pane and confirm adaptive horizontal padding.
8. Open a document containing a table and confirm lossless source fallback.

Expected: every item behaves as specified and no console error appears.

- [ ] **Step 5: Build Windows test installers**

After closing the development app, run:

```powershell
npm run tauri build
```

Expected artifacts:

- `src-tauri/target/release/bundle/nsis/Zeditor_0.4.0_x64-setup.exe`
- `src-tauri/target/release/bundle/msi/Zeditor_0.4.0_x64_en-US.msi`

- [ ] **Step 6: Record hashes and verify a clean worktree**

```powershell
Get-FileHash -Algorithm SHA256 src-tauri/target/release/bundle/nsis/Zeditor_0.4.0_x64-setup.exe
Get-FileHash -Algorithm SHA256 src-tauri/target/release/bundle/msi/Zeditor_0.4.0_x64_en-US.msi
git status --short --branch
```

Expected: two SHA-256 hashes and no uncommitted source changes.
