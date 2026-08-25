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
  for (const fragment of [
    'graph LR\nA-->B',
    '$$\nx + y\n$$',
    'Inline $z$ formula.',
    '<section>HTML</section>',
    '<details>',
    'Text[^1]',
    '[^1]: note',
    '@[video]',
    '[TOC]',
    '@[custom]',
  ]) {
    assert.ok(serialized.includes(fragment), fragment);
  }
});
