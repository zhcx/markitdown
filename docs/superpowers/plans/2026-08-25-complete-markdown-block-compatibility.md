# Complete Markdown Block Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow every Markdown document to remain in block mode by combining native structured blocks with lossless editable `raw_markdown` blocks for complex and unknown extensions.

**Architecture:** A source-range segmenter classifies each top-level Markdown block as structured or raw. Structured segments use the existing ProseMirror Markdown parser, GFM tables use native table nodes, and raw segments become text-only `raw_markdown` nodes whose contents are emitted without escaping. Markdown remains the only persisted representation and the existing preview, save, AI, WebDAV, and S3 paths remain authoritative.

**Tech Stack:** React 18, TypeScript 5.9, ProseMirror, markdown-it 14, Node test runner, ESLint, Vite 8, Tauri 2.

---

## Starting state

- Branch: `fix/block-editor-reliability-command-center`
- Design: `docs/superpowers/specs/2026-08-25-complete-markdown-block-compatibility-design.md`
- Design commit: `ea46667`
- The working tree already contains uncommitted RED/GREEN work for native tables and the empty-document placeholder. Treat those edits as Task 1 work in progress. Do not reset or discard them.

## File responsibility map

- Create `src/utils/markdownBlockSegments.ts`: classify top-level source ranges and preserve raw source.
- Modify `src/types/blockEditor.ts`: define `RawMarkdownKind`, raw capability metadata, and native table type.
- Modify `src/components/Editor/blockSchema.ts`: add table and `raw_markdown` nodes plus parser/serializer handlers.
- Modify `src/utils/markdownBlockCapability.ts`: report raw compatibility instead of forcing whole-document fallback.
- Modify `src/utils/markdownBlockCodec.ts`: compose structured and raw segments into one document.
- Modify `src/utils/blockSourceMap.ts`: map tables and raw blocks to stable source ranges.
- Modify `src/components/Editor/BlockEditor.tsx`: decorate raw blocks with type and source-line metadata.
- Modify `src/components/Editor/BlockEditor.css`: style tables, raw blocks, and the empty-document prompt.
- Modify `src/components/Editor/blockKeymap.ts`: preserve newline editing inside raw blocks.
- Modify `src/utils/editorCommandRegistry.ts`: keep complex insertion commands available in block mode.
- Modify `docs/block-editor.md`: document native versus raw compatibility.
- Create `tests/markdownBlockSegments.test.ts`: segmenter coverage.
- Create `tests/completeMarkdownCompatibility.test.ts`: mixed-corpus round-trip contract.
- Extend focused block editor, save, navigation, and lifecycle tests.

## Task 1: Finish native GFM tables and the empty-document prompt

**Files:**
- Modify: `src/types/blockEditor.ts`
- Modify: `src/utils/markdownBlockCapability.ts`
- Modify: `src/utils/markdownBlockCodec.ts`
- Modify: `src/utils/blockSourceMap.ts`
- Modify: `src/components/Editor/blockSchema.ts`
- Modify: `src/components/Editor/BlockEditor.css`
- Test: `tests/markdownBlockCodec.test.ts`
- Test: `tests/blockEditorFallback.test.ts`
- Test: `tests/blockEditorTypes.test.ts`
- Test: `tests/blockEditorUiContract.test.ts`

- [ ] **Step 1: Inspect the existing Task 1 working-tree diff**

Run:

```powershell
git diff -- src/types/blockEditor.ts src/utils/markdownBlockCapability.ts src/utils/markdownBlockCodec.ts src/utils/blockSourceMap.ts src/components/Editor/blockSchema.ts src/components/Editor/BlockEditor.css tests/markdownBlockCodec.test.ts tests/blockEditorFallback.test.ts tests/blockEditorTypes.test.ts tests/blockEditorUiContract.test.ts
```

Expected: table schema/parser/serializer changes, table round-trip tests, and a CSS empty-block prompt are present; no unrelated files appear.

- [ ] **Step 2: Re-run the focused table and prompt tests**

Run:

```powershell
node --import ./tests/helpers/register-tsx-config.mjs --import tsx --import ./tests/helpers/register-css-loader.mjs --test tests/markdownBlockCodec.test.ts tests/blockEditorFallback.test.ts tests/blockEditorTypes.test.ts tests/blockEditorUiContract.test.ts tests/blockSchema.test.ts tests/blockSourceMap.test.ts
```

Expected: all focused tests PASS.

- [ ] **Step 3: Add an irregular-table safety regression**

Append to `tests/markdownBlockCodec.test.ts`:

```ts
test('does not silently change the number of cells in a parsed table', () => {
  const source = '| A | B |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |\n';
  const result = parseMarkdown(source);
  const table = result.document?.firstChild;
  assert.equal(table?.type.name, 'table');
  assert.deepEqual(table?.content.content.map(row => row.childCount), [2, 2, 2]);
  assert.equal(serializeMarkdown(result.document!), source);
});
```

- [ ] **Step 4: Verify the new table regression passes**

Run:

```powershell
node --import ./tests/helpers/register-tsx-config.mjs --import tsx --import ./tests/helpers/register-css-loader.mjs --test tests/markdownBlockCodec.test.ts
```

Expected: table parsing and exact normalized serialization PASS.

- [ ] **Step 5: Commit Task 1**

```powershell
git add src/types/blockEditor.ts src/utils/markdownBlockCapability.ts src/utils/markdownBlockCodec.ts src/utils/blockSourceMap.ts src/components/Editor/blockSchema.ts src/components/Editor/BlockEditor.css tests/markdownBlockCodec.test.ts tests/blockEditorFallback.test.ts tests/blockEditorTypes.test.ts tests/blockEditorUiContract.test.ts
git commit -m "feat: 支持块编辑表格与空文档提示"
```

## Task 2: Build the top-level Markdown segmenter

**Files:**
- Create: `src/utils/markdownBlockSegments.ts`
- Create: `tests/markdownBlockSegments.test.ts`
- Modify: `src/types/blockEditor.ts`

- [ ] **Step 1: Define raw compatibility types**

Add to `src/types/blockEditor.ts`:

```ts
export type RawMarkdownKind =
  | 'mermaid'
  | 'math'
  | 'html'
  | 'details'
  | 'footnote'
  | 'video'
  | 'toc'
  | 'unknown';

export type MarkdownBlockSegment =
  | { kind: 'structured'; source: string; from: number; to: number }
  | { kind: 'raw'; rawKind: RawMarkdownKind; source: string; from: number; to: number };
```

- [ ] **Step 2: Write failing segmenter tests**

Create `tests/markdownBlockSegments.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { segmentMarkdown } from '../src/utils/markdownBlockSegments.ts';

test('segments a mixed Markdown document without changing source order', () => {
  const source = '# Title\n\nText\n\n```mermaid\ngraph LR\nA-->B\n```\n\nAfter\n';
  const segments = segmentMarkdown(source);
  assert.deepEqual(segments.map(segment => [segment.kind, segment.kind === 'raw' ? segment.rawKind : 'structured']), [
    ['structured', 'structured'],
    ['raw', 'mermaid'],
    ['structured', 'structured'],
  ]);
  assert.equal(segments.map(segment => segment.source).join('\n\n') + '\n', source);
});

test('classifies block and inline extension syntax as raw blocks', () => {
  const fixtures = [
    ['$$\nx + y\n$$\n', 'math'],
    ['Text with $x$ inline.\n', 'math'],
    ['<section>raw</section>\n', 'html'],
    ['<details>\n<summary>More</summary>\n</details>\n', 'details'],
    ['Text[^1]\n', 'footnote'],
    ['[^1]: note\n', 'footnote'],
    ['@[video](https://example.com/video)\n', 'video'],
    ['[TOC]\n', 'toc'],
  ] as const;
  for (const [source, rawKind] of fixtures) {
    assert.equal(segmentMarkdown(source)[0]?.kind, 'raw', source);
    assert.equal(segmentMarkdown(source)[0]?.kind === 'raw' ? segmentMarkdown(source)[0].rawKind : null, rawKind, source);
  }
});
```

- [ ] **Step 3: Run the segmenter tests and verify RED**

Run:

```powershell
node --import tsx --test tests/markdownBlockSegments.test.ts
```

Expected: FAIL because `markdownBlockSegments.ts` does not exist.

- [ ] **Step 4: Implement deterministic top-level segmentation**

Create `src/utils/markdownBlockSegments.ts` with this public shape and classification order:

```ts
import MarkdownIt from 'markdown-it';
import type { MarkdownBlockSegment, RawMarkdownKind } from '../types/blockEditor.ts';

const markdown = new MarkdownIt({ html: true, linkify: false, typographer: false });

function rawKindFor(type: string, source: string, info = ''): RawMarkdownKind | null {
  if (type === 'fence' && /^\s*mermaid(?:\s|$)/iu.test(info)) return 'mermaid';
  if (/^\s*<\s*(?:details|summary)\b/iu.test(source)) return 'details';
  if (type === 'html_block' || /<\/?[A-Za-z][^>]*>/u.test(source)) return 'html';
  if (/^\s*\$\$[\s\S]*?\$\$\s*$/u.test(source) || /(?<!\\)\$[^$\n]+\$/u.test(source)) return 'math';
  if (/^\s*\[\^[^\]]+\]:/u.test(source) || /\[\^[^\]]+\]/u.test(source)) return 'footnote';
  if (/^\s*@\[(?:video|youtube|bilibili)\]\(/iu.test(source)) return 'video';
  if (/^\s*\[TOC\]\s*$/iu.test(source)) return 'toc';
  if (/^\s*@\[[^\]]+\]\(/u.test(source)) return 'unknown';
  return null;
}

export function segmentMarkdown(source: string): MarkdownBlockSegment[] {
  if (!source) return [{ kind: 'structured', source: '', from: 0, to: 0 }];

  const lineStarts = [0];
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === '\n') lineStarts.push(index + 1);
  }
  const offsetForLine = (line: number) => line < lineStarts.length ? lineStarts[line] : source.length;
  const tokens = markdown.parse(source, {});
  const ranges = tokens
    .filter(token => token.level === 0 && token.map && token.nesting !== -1)
    .map(token => ({ token, from: offsetForLine(token.map![0]), to: offsetForLine(token.map![1]) }))
    .sort((left, right) => left.from - right.from || right.to - left.to);

  const result: MarkdownBlockSegment[] = [];
  let acceptedTo = -1;
  for (const range of ranges) {
    if (range.from < acceptedTo) continue;
    const blockSource = source.slice(range.from, range.to).replace(/(?:\r?\n)+$/u, '');
    if (!blockSource.trim()) continue;
    const rawKind = rawKindFor(range.token.type, blockSource, range.token.info || '');
    if (rawKind) {
      result.push({ kind: 'raw', rawKind, source: blockSource, from: range.from, to: range.to });
    } else {
      const previous = result[result.length - 1];
      if (previous?.kind === 'structured') {
        previous.source += `\n\n${blockSource}`;
        previous.to = range.to;
      } else {
        result.push({ kind: 'structured', source: blockSource, from: range.from, to: range.to });
      }
    }
    acceptedTo = range.to;
  }

  if (result.length === 0) {
    return [{ kind: 'raw', rawKind: 'unknown', source: source.replace(/(?:\r?\n)+$/u, ''), from: 0, to: source.length }];
  }
  return result;
}
```

Implementation rules:

1. Compute line start offsets from the original string; do not normalize CRLF before calculating offsets.
2. Use tokens where `token.level === 0`, `token.map` exists, and `token.nesting !== -1`.
3. Ignore duplicate or contained maps after accepting an outer range.
4. Slice with original offsets, trim only separator newlines from segment boundaries, and retain all interior characters.
5. Merge adjacent structured segments with `\n\n`.

- [ ] **Step 5: Run the segmenter tests and verify GREEN**

Run:

```powershell
node --import tsx --test tests/markdownBlockSegments.test.ts
```

Expected: all segmenter tests PASS.

- [ ] **Step 6: Commit Task 2**

```powershell
git add src/types/blockEditor.ts src/utils/markdownBlockSegments.ts tests/markdownBlockSegments.test.ts
git commit -m "feat: 分段识别结构化与原始 Markdown"
```

## Task 3: Add the lossless `raw_markdown` node

**Files:**
- Modify: `src/components/Editor/blockSchema.ts`
- Modify: `src/components/Editor/blockCommands.ts`
- Modify: `src/types/blockEditor.ts`
- Modify: `src/utils/blockSourceMap.ts`
- Test: `tests/blockSchema.test.ts`
- Test: `tests/markdownBlockCodec.test.ts`

- [ ] **Step 1: Write failing raw-node schema tests**

Append to `tests/blockSchema.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the schema test and verify RED**

Run:

```powershell
node --import tsx --test tests/blockSchema.test.ts
```

Expected: FAIL because `raw_markdown` is absent.

- [ ] **Step 3: Add the raw node and serializer**

Add to `blockSchema.nodes` before `image`:

```ts
raw_markdown: {
  attrs: { kind: { default: 'unknown' } },
  content: 'text*',
  group: 'block',
  code: true,
  marks: '',
  defining: true,
  isolating: true,
  toDOM: node => [
    'pre',
    { class: 'raw-markdown-block', 'data-raw-markdown-kind': node.attrs.kind },
    ['code', 0],
  ],
},
```

Add to `blockMarkdownSerializer.nodes`:

```ts
raw_markdown: (state, node) => {
  state.write(node.textContent);
  state.closeBlock(node);
},
```

Add `'raw_markdown'` to `BlockNodeType`, `BLOCK_NODE_TYPES`, `blockType()` and `blockSourceMap.nodeType()`.

Restrict block-property conversions in `blockCommands.ts`:

```ts
export type BlockPropertyType = Exclude<BlockNodeType, 'image' | 'table' | 'raw_markdown'>;
```

- [ ] **Step 4: Verify schema and serializer tests**

Run:

```powershell
node --import tsx --test tests/blockSchema.test.ts tests/blockEditorTypes.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit Task 3**

```powershell
git add src/components/Editor/blockSchema.ts src/components/Editor/blockCommands.ts src/types/blockEditor.ts src/utils/blockSourceMap.ts tests/blockSchema.test.ts tests/blockEditorTypes.test.ts
git commit -m "feat: 增加原始 Markdown 保真块"
```

## Task 4: Compose structured and raw segments in the codec

**Files:**
- Modify: `src/utils/markdownBlockCodec.ts`
- Modify: `src/utils/markdownBlockCapability.ts`
- Modify: `src/types/blockEditor.ts`
- Create: `tests/completeMarkdownCompatibility.test.ts`
- Test: `tests/markdownBlockCodec.test.ts`
- Test: `tests/blockEditorFallback.test.ts`

- [ ] **Step 1: Write the mixed-corpus failing test**

Create `tests/completeMarkdownCompatibility.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMarkdown, serializeMarkdown } from '../src/utils/markdownBlockCodec.ts';

const mixed = `# Mixed

Paragraph.

| A | B |
| :--- | ---: |
| 1 | 2 |

\`\`\`mermaid
graph LR
A-->B
\`\`\`

$$
x + y
$$

Inline $z$ formula.

<section>HTML</section>

<details>
<summary>More</summary>
Raw HTML
</details>

Text[^1]

[^1]: note

@[video](https://example.com/video)

[TOC]

@[custom](opaque)
`;

test('opens mixed Markdown in block mode and preserves every raw extension', () => {
  const result = parseMarkdown(mixed);
  assert.equal(result.mode, 'blocks');
  assert.deepEqual(result.capability.rawKinds, ['mermaid', 'math', 'html', 'details', 'footnote', 'video', 'toc', 'unknown']);
  assert.deepEqual(result.document?.content.content.map(node => node.type.name), [
    'heading', 'paragraph', 'table', 'raw_markdown', 'raw_markdown',
    'raw_markdown', 'raw_markdown', 'raw_markdown', 'raw_markdown', 'raw_markdown',
    'raw_markdown', 'raw_markdown', 'raw_markdown',
  ]);
  const serialized = serializeMarkdown(result.document!);
  for (const fragment of ['graph LR\nA-->B', '$$\nx + y\n$$', 'Inline $z$ formula.', '<section>HTML</section>', '<details>', 'Text[^1]', '[^1]: note', '@[video]', '[TOC]', '@[custom]']) {
    assert.ok(serialized.includes(fragment), fragment);
  }
});
```

- [ ] **Step 2: Run the mixed-corpus test and verify RED**

Run:

```powershell
node --import tsx --test tests/completeMarkdownCompatibility.test.ts
```

Expected: FAIL because `rawKinds` and mixed composition are absent.

- [ ] **Step 3: Extend capability metadata**

Change `MarkdownCapability` in `src/types/blockEditor.ts`:

```ts
export interface MarkdownCapability {
  supported: boolean;
  unsupported: UnsupportedMarkdownKind[];
  rawKinds: RawMarkdownKind[];
  message: string;
}
```

Change `inspectMarkdownCapability(source)` to call `segmentMarkdown(source)`, collect unique raw kinds in source order, and return:

```ts
return {
  supported: true,
  unsupported: [],
  rawKinds,
  message: rawKinds.length ? `块模式将以源码保真块承载：${rawKinds.join('、')}` : '',
};
```

Retain a `catch` branch that returns `supported: false`, `unsupported: ['unknown']`, `rawKinds: []`, and a content-free diagnostic message.

- [ ] **Step 4: Compose the ProseMirror document in `parseMarkdown()`**

Replace whole-document parsing with:

```ts
const nodes: Node[] = [];
for (const segment of segmentMarkdown(source)) {
  if (segment.kind === 'raw') {
    const content = segment.source ? blockSchema.text(segment.source) : undefined;
    nodes.push(blockSchema.nodes.raw_markdown.create({ kind: segment.rawKind }, content));
    continue;
  }
  try {
    const parsed = normalizeTaskLists(blockMarkdownParser.parse(segment.source));
    parsed.forEach(node => nodes.push(node));
  } catch {
    const content = segment.source ? blockSchema.text(segment.source) : undefined;
    nodes.push(blockSchema.nodes.raw_markdown.create({ kind: 'unknown' }, content));
  }
}
const document = blockSchema.topNodeType.create(null, nodes.length ? nodes : [blockSchema.nodes.paragraph.create()]);
```

Do not log `segment.source` from the catch path.

- [ ] **Step 5: Run codec, capability, and mixed-corpus tests**

Run:

```powershell
node --import tsx --test tests/markdownBlockSegments.test.ts tests/markdownBlockCodec.test.ts tests/completeMarkdownCompatibility.test.ts tests/blockEditorFallback.test.ts
```

Expected: all tests PASS and mixed documents report `mode: 'blocks'`.

- [ ] **Step 6: Commit Task 4**

```powershell
git add src/utils/markdownBlockCodec.ts src/utils/markdownBlockCapability.ts src/types/blockEditor.ts tests/completeMarkdownCompatibility.test.ts tests/markdownBlockCodec.test.ts tests/blockEditorFallback.test.ts
git commit -m "feat: 混合解析结构化块与原始 Markdown"
```

## Task 5: Integrate raw blocks with controller, keymap, and navigation

**Files:**
- Modify: `src/components/Editor/blockKeymap.ts`
- Modify: `src/components/Editor/BlockEditor.tsx`
- Modify: `src/components/Editor/BlockEditor.css`
- Modify: `src/utils/blockEditorController.ts`
- Modify: `src/utils/blockSourceMap.ts`
- Test: `tests/blockKeymap.test.ts`
- Test: `tests/blockEditorNavigation.test.ts`
- Test: `tests/blockEditorController.test.ts`

- [ ] **Step 1: Write failing raw editing and source-map tests**

Append to `tests/blockKeymap.test.ts`:

```ts
test('Enter inserts a newline inside a raw Markdown block', () => {
  const raw = blockSchema.nodes.raw_markdown.create({ kind: 'math' }, blockSchema.text('$$x$$'));
  const doc = blockSchema.nodes.doc.create(null, raw);
  const state = EditorState.create({ schema: blockSchema, doc, selection: TextSelection.create(doc, 3) });
  const next = apply(createBlockKeyBindings().Enter, state);
  assert.equal(next.doc.firstChild?.type.name, 'raw_markdown');
  assert.equal(next.doc.firstChild?.textContent, '$$\nx$$');
});
```

Append to `tests/blockSourceMap.test.ts`:

```ts
test('maps a raw Markdown block as one top-level source anchor', () => {
  const parsed = parseMarkdown('Before\n\n$$\nx\n$$\n\nAfter\n');
  const raw = parsed.sourceMap?.blocks.find(block => block.type === 'raw_markdown');
  assert.ok(raw);
  assert.equal(raw.lineFrom, 3);
  assert.equal(raw.lineTo, 5);
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```powershell
node --import ./tests/helpers/register-tsx-config.mjs --import tsx --import ./tests/helpers/register-css-loader.mjs --test tests/blockKeymap.test.ts tests/blockSourceMap.test.ts tests/blockEditorNavigation.test.ts
```

Expected: raw Enter or source-line mapping FAILS.

- [ ] **Step 3: Preserve raw block identity in keyboard commands**

In `createBlockKeyBindings()`, put `newlineInCode` first for Enter:

```ts
Enter: chainCommands(
  newlineInCode,
  splitListItem(schema.nodes.task_item),
  splitListItem(schema.nodes.list_item),
  baseKeymap.Enter,
),
```

Keep `resetEmptyTextBlock` after raw content becomes empty so Backspace can return it to a paragraph.

- [ ] **Step 4: Decorate and style raw blocks**

In `BlockEditor.tsx`, metadata decoration already assigns `data-block-id` and `data-source-line` to every top-level node. Add `data-raw-kind` when the node is raw:

```ts
const attrs: Record<string, string> = {
  'data-block-id': block.blockId,
  'data-source-line': String(block.lineFrom),
};
if (node.type.name === 'raw_markdown') attrs['data-raw-kind'] = String(node.attrs.kind);
decorations.push(Decoration.node(offset, offset + node.nodeSize, attrs));
```

Add to `BlockEditor.css`:

```css
.block-editor-content .raw-markdown-block {
  position: relative;
  padding: 30px 14px 12px;
  border: 1px solid var(--border-soft);
  border-radius: 8px;
  background: var(--surface-muted);
  color: var(--code-text);
  white-space: pre-wrap;
}

.block-editor-content .raw-markdown-block::before {
  content: attr(data-raw-kind) ' · 源码保真';
  position: absolute;
  top: 8px;
  left: 14px;
  color: var(--text-muted);
  font: 700 10px/1 var(--font-sans);
  letter-spacing: .06em;
  text-transform: uppercase;
  pointer-events: none;
}
```

- [ ] **Step 5: Verify controller and navigation behavior**

Run:

```powershell
node --import ./tests/helpers/register-tsx-config.mjs --import tsx --import ./tests/helpers/register-css-loader.mjs --test tests/blockKeymap.test.ts tests/blockSourceMap.test.ts tests/blockEditorController.test.ts tests/blockEditorNavigation.test.ts tests/blockEditorLifecycle.test.ts
```

Expected: all tests PASS.

- [ ] **Step 6: Commit Task 5**

```powershell
git add src/components/Editor/blockKeymap.ts src/components/Editor/BlockEditor.tsx src/components/Editor/BlockEditor.css src/utils/blockEditorController.ts src/utils/blockSourceMap.ts tests/blockKeymap.test.ts tests/blockSourceMap.test.ts tests/blockEditorNavigation.test.ts tests/blockEditorController.test.ts
git commit -m "feat: 接入原始 Markdown 块编辑与导航"
```

## Task 6: Verify complex Slash and toolbar insertions remain in block mode

**Files:**
- Modify: `src/utils/editorCommandRegistry.ts`
- Modify: `src/components/Editor/BlockEditor.tsx`
- Modify: `src/components/Toolbar/Toolbar.tsx`
- Test: `tests/editorCommandRegistry.test.ts`
- Test: `tests/blockEditorIntegrations.test.ts`
- Test: `tests/blockEditorSaveIntegration.test.ts`

- [ ] **Step 1: Write failing insertion-safety tests**

Append to `tests/blockEditorIntegrations.test.ts`:

```ts
test('complex Slash insertions stay in block mode through raw blocks', () => {
  const registry = read('src/utils/editorCommandRegistry.ts');
  const editor = read('src/components/Editor/BlockEditor.tsx');
  for (const id of ['table', 'mermaid', 'math', 'math-block', 'details', 'footnote', 'video', 'toc']) {
    assert.match(registry, new RegExp(`id: '${id}'[\\s\\S]*surfaces:`));
  }
  assert.match(editor, /controller\.replaceRange/);
  assert.doesNotMatch(editor, /command\.id === '(?:mermaid|math|details)'[\s\S]*onUnsupportedMarkdown/);
});
```

- [ ] **Step 2: Run the insertion compatibility gate**

Run:

```powershell
node --import ./tests/helpers/register-tsx-config.mjs --import tsx --import ./tests/helpers/register-css-loader.mjs --test tests/editorCommandRegistry.test.ts tests/blockEditorIntegrations.test.ts tests/blockEditorSaveIntegration.test.ts
```

Expected: registry and source-contract tests PASS. If an insertion command is absent from the slash surface, add it to `EDITOR_COMMANDS` before proceeding.

- [ ] **Step 3: Route all insertion commands through the codec**

Keep `BlockEditor.applySlashCommand()` generic:

```ts
if (command.insertion) {
  const { text, selectionStart = text.length, selectionEnd = selectionStart } = command.insertion;
  controller.replaceRange(menu.from, menu.from, text, {
    from: menu.from + selectionStart,
    to: menu.from + selectionEnd,
  });
}
```

Do not special-case complex command IDs and do not call `onUnsupportedMarkdown` for syntax representable as raw blocks. If the existing generic path already matches this code, leave production code unchanged and commit only the new compatibility test.

- [ ] **Step 4: Verify insertion, save, and fallback tests**

Run:

```powershell
node --import ./tests/helpers/register-tsx-config.mjs --import tsx --import ./tests/helpers/register-css-loader.mjs --test tests/editorCommandRegistry.test.ts tests/blockEditorIntegrations.test.ts tests/blockEditorSaveIntegration.test.ts tests/blockEditorFallback.test.ts tests/completeMarkdownCompatibility.test.ts
```

Expected: all tests PASS; only unrecoverable codec errors may request source mode.

- [ ] **Step 5: Commit Task 6**

```powershell
git add src/utils/editorCommandRegistry.ts src/components/Editor/BlockEditor.tsx src/components/Toolbar/Toolbar.tsx tests/editorCommandRegistry.test.ts tests/blockEditorIntegrations.test.ts tests/blockEditorSaveIntegration.test.ts
git commit -m "feat: 统一复杂 Markdown 的块模式插入"
```

## Task 7: Update documentation and compatibility contracts

**Files:**
- Modify: `docs/block-editor.md`
- Modify: `README.md`
- Modify: `tests/blockEditorDocsContract.test.ts`
- Modify: `tests/blockEditorFallback.test.ts`

- [ ] **Step 1: Strengthen documentation tests**

Append to `tests/blockEditorDocsContract.test.ts`:

```ts
test('documentation explains native tables and raw Markdown compatibility', () => {
  const docs = read('docs/block-editor.md');
  assert.match(docs, /表格.*原生|原生.*表格/s);
  assert.match(docs, /原始 Markdown 块/);
  assert.match(docs, /Mermaid/);
  assert.match(docs, /公式/);
  assert.match(docs, /HTML/);
  assert.match(docs, /未知扩展/);
  assert.match(docs, /不执行.*脚本/s);
});
```

- [ ] **Step 2: Run documentation tests and verify RED**

Run:

```powershell
node --import tsx --test tests/blockEditorDocsContract.test.ts
```

Expected: FAIL until the compatibility sections are updated.

- [ ] **Step 3: Update user documentation**

In `docs/block-editor.md`:

1. Add GFM tables to “当前支持”.
2. Replace the list that says tables/Mermaid/formulas force source mode.
3. Explain that Mermaid, formulas, HTML, Details, footnotes, video, TOC, and unknown extensions appear as editable original Markdown blocks.
4. State that raw HTML is never executed in the editor and preview HTML remains sanitized.
5. Keep Monaco source mode available for exact whole-file editing.

In `README.md`, change the hybrid-editor summary to mention native tables and lossless raw blocks.

- [ ] **Step 4: Run docs and fallback tests**

Run:

```powershell
node --import tsx --test tests/blockEditorDocsContract.test.ts tests/blockEditorFallback.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit Task 7**

```powershell
git add docs/block-editor.md README.md tests/blockEditorDocsContract.test.ts tests/blockEditorFallback.test.ts
git commit -m "docs: 说明完整 Markdown 块模式兼容"
```

## Task 8: Full verification and Windows artifacts

**Files:**
- Verify only unless a failing check identifies a defect.

- [ ] **Step 1: Run all Node tests**

```powershell
npm test
```

Expected: exit code 0, zero failed tests.

- [ ] **Step 2: Run Lint and production frontend build**

```powershell
npm run lint
npm run build
```

Expected: both commands exit 0.

- [ ] **Step 3: Run Rust checks**

```powershell
cargo check --manifest-path src-tauri/Cargo.toml
```

Expected: exit code 0.

- [ ] **Step 4: Verify the mixed corpus in a browser**

Start Vite:

```powershell
npm run dev -- --host 127.0.0.1 --port 4173
```

Use `agent-browser` to verify:

1. A new tab shows the writing prompt and accepts input.
2. The mixed compatibility corpus opens in block mode.
3. The table renders as editable cells.
4. Every raw block shows its kind badge and editable source.
5. Editor-to-preview and preview-to-editor scrolling both move.
6. No Vite overlay or browser console error appears.

- [ ] **Step 5: Build Windows packages**

```powershell
npm run tauri build
```

Expected artifacts:

- `src-tauri/target/release/zeditor.exe`
- `src-tauri/target/release/bundle/nsis/Zeditor_0.4.0_x64-setup.exe`
- `src-tauri/target/release/bundle/msi/Zeditor_0.4.0_x64_en-US.msi`

- [ ] **Step 6: Record hashes and clean state**

```powershell
Get-FileHash -Algorithm SHA256 src-tauri/target/release/zeditor.exe
Get-FileHash -Algorithm SHA256 src-tauri/target/release/bundle/nsis/Zeditor_0.4.0_x64-setup.exe
Get-FileHash -Algorithm SHA256 src-tauri/target/release/bundle/msi/Zeditor_0.4.0_x64_en-US.msi
git status --short --branch
```

Expected: three SHA-256 hashes and no uncommitted source changes.
