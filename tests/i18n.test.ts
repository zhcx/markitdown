import assert from 'node:assert/strict';
import test from 'node:test';
import { detectSystemLanguage, normalizeLanguage, translateUiText } from '../src/i18n/index.ts';

test('detects the three supported system language families', () => {
  assert.equal(detectSystemLanguage(['zh-CN']), 'zh-CN');
  assert.equal(detectSystemLanguage(['zh-SG']), 'zh-CN');
  assert.equal(detectSystemLanguage(['zh-Hant-TW']), 'zh-TW');
  assert.equal(detectSystemLanguage(['zh-HK']), 'zh-TW');
  assert.equal(detectSystemLanguage(['en-US']), 'en');
  assert.equal(detectSystemLanguage(['fr-FR']), 'zh-CN');
});

test('normalizes saved language values safely', () => {
  assert.equal(normalizeLanguage('zh-TW'), 'zh-TW');
  assert.equal(normalizeLanguage('unsupported', 'en'), 'en');
});

test('localizes editor context-menu actions and legacy English labels', () => {
  assert.equal(translateUiText('复制', 'zh-TW'), '複製');
  assert.equal(translateUiText('复制', 'en'), 'Copy');
  assert.equal(translateUiText('Basic', 'zh-CN'), '基础');
  assert.equal(translateUiText('VS Code Dark Theme', 'zh-CN'), 'VS Code 深色主题');
});
