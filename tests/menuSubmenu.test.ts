import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('top-level menus do not clip the shared export and theme submenus', async () => {
  const [styles, menuSource] = await Promise.all([
    readFile(new URL('../src/styles/workbench.css', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/MenuBar/MenuBar.tsx', import.meta.url), 'utf8'),
  ]);
  const topLevelMenuRule = styles.match(/\.app \.menu-dropdown\s*\{[\s\S]*?\}/)?.[0] ?? '';

  assert.match(menuSource, /label:\s*'导出',[\s\S]*?children:/);
  assert.match(menuSource, /label:\s*'主题',[\s\S]*?children:/);
  assert.match(topLevelMenuRule, /overflow:\s*visible/);
});
