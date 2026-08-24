import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

test('About menu displays the v0.4.0 application version', () => {
  const source = readFileSync(new URL('../src/components/MenuBar/MenuBar.tsx', import.meta.url), 'utf8');
  assert.match(source, /Zeditor v0\.4\.0/);
  assert.doesNotMatch(source, /Zeditor v0\.3\.8/);
});
