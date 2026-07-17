import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sourceUrl = new URL('../src/components/Export/WeChatExportDialog.tsx', import.meta.url);
const stylesUrl = new URL('../src/styles/main.css', import.meta.url);

test('WeChat export uses Microsoft YaHei for every theme', async () => {
  const source = await readFile(sourceUrl, 'utf8');

  assert.doesNotMatch(source, /serif\??:/);
  assert.doesNotMatch(source, /STSong|SimSun|Georgia/);
  assert.match(source, /const WECHAT_FONT_FAMILY = ['"]['"]?Microsoft YaHei/);
});

test('WeChat rich text inlines readable font and color on emphasis nodes', async () => {
  const source = await readFile(sourceUrl, 'utf8');

  assert.match(source, /querySelectorAll<HTMLElement>\(['"][^'"]*strong[^'"]*em[^'"]*del/);
  assert.match(source, /tag === 'strong'[\s\S]*font-weight:700;[\s\S]*textStyle\(theme\)/);
  assert.match(source, /tag === 'em'[\s\S]*font-style:italic;[\s\S]*textStyle\(theme\)/);
});

test('WeChat preview isolates exported text from modal theme colors', async () => {
  const styles = await readFile(stylesUrl, 'utf8');
  const previewRule = styles.match(/\.app \.wechat-export-preview :is\(strong,em,del\)\s*\{[\s\S]*?\}/)?.[0] ?? '';

  assert.match(previewRule, /color:\s*inherit\s*!important/);
  assert.match(previewRule, /font-family:\s*"Microsoft YaHei"[^;]*!important/);
});
