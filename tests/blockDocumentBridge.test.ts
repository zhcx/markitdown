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
