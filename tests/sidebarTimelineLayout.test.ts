import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('timeline heading keeps its label on one line and truncates the file name', () => {
  const sidebar = read('src/components/Sidebar/Sidebar.tsx');
  const styles = read('src/styles/main.css');

  assert.match(sidebar, /className="timeline-section-label">时间线</);
  assert.match(styles, /\.timeline-section-label\s*{[\s\S]*flex:\s*0\s+0\s+auto[\s\S]*white-space:\s*nowrap/);
  assert.match(styles, /\.timeline-file-name\s*{[\s\S]*flex:\s*1\s+1\s+auto[\s\S]*text-overflow:\s*ellipsis/);
  assert.match(styles, /\.timeline-section\s+\.explorer-count\s*{[\s\S]*flex:\s*0\s+0\s+auto/);
});
