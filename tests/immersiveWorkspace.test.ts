import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function loadLayoutPolicy() {
  try {
    return await import('../src/utils/immersiveWorkspace.ts');
  } catch {
    return {};
  }
}

test('immersive writing keeps the editor toolbar, outline and optional AI chat available', async () => {
  const layout = await loadLayoutPolicy();
  const policy = layout.getImmersiveWorkspacePolicy?.('zen', true);

  assert.deepEqual(policy, {
    active: true,
    kind: 'writing',
    showEditorToolbar: true,
    showOutline: true,
    showChatbox: true,
    hideWorkbenchChrome: true,
  });
});

test('immersive reading prioritizes the preview while retaining outline and optional AI chat', async () => {
  const layout = await loadLayoutPolicy();
  const policy = layout.getImmersiveWorkspacePolicy?.('immersive', true);

  assert.deepEqual(policy, {
    active: true,
    kind: 'reading',
    showEditorToolbar: false,
    showOutline: true,
    showChatbox: true,
    hideWorkbenchChrome: true,
  });
});

test('closing AI chat returns its space without leaving immersive mode', async () => {
  const layout = await loadLayoutPolicy();

  assert.equal(layout.getImmersiveWorkspacePolicy?.('zen', false)?.showChatbox, false);
  assert.equal(layout.getImmersiveWorkspacePolicy?.('immersive', false)?.showChatbox, false);
  assert.equal(layout.getImmersiveWorkspacePolicy?.('split', true)?.active, false);
});

test('immersive toolbar SVG icons use the same stroked glyph rendering as the regular toolbar', async () => {
  const styles = await readFile(new URL('../src/styles/workbench.css', import.meta.url), 'utf8');
  const iconRule = styles.match(/\.immersive-writing-toolbar \.toolbar-btn svg[\s\S]*?\}/)?.[0] ?? '';

  assert.match(iconRule, /fill:\s*none/);
  assert.match(iconRule, /stroke:\s*currentColor/);
  assert.match(iconRule, /stroke-linecap:\s*round/);
  assert.match(iconRule, /stroke-linejoin:\s*round/);
});
