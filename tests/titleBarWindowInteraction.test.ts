import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('the custom title bar uses exactly one native drag and double-click path', async () => {
  const source = await readFile(
    new URL('../src/components/TitleBar/TitleBar.tsx', import.meta.url),
    'utf8',
  );

  assert.match(source, /className="titlebar-drag-spacer"\s+data-tauri-drag-region/);
  assert.doesNotMatch(source, /startDragging\s*\(/);
  assert.doesNotMatch(source, /onMouseDown=\{handleStartDragging\}/);
  assert.doesNotMatch(source, /onDoubleClick=\{handleDragDoubleClick\}/);
  assert.doesNotMatch(source, /appWindow\.center\s*\(/);
});

test('window control buttons remain outside the native drag region', async () => {
  const source = await readFile(
    new URL('../src/components/TitleBar/TitleBar.tsx', import.meta.url),
    'utf8',
  );

  assert.match(
    source,
    /className="titlebar-controls"\s+data-tauri-drag-region="false"/,
  );
  assert.match(source, /className="titlebar-btn titlebar-minimize"\s+onClick=\{handleMinimize\}/);
  assert.match(source, /className="titlebar-btn titlebar-maximize"\s+onClick=\{handleToggleMaximize\}/);
});
