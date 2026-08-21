import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('defines backward-compatible WebDAV settings in Rust and TypeScript', () => {
  const frontend = read('src/stores/appStore.ts');
  const rust = read('src-tauri/src/commands.rs');
  const model = read('src-tauri/src/webdav/model.rs');

  assert.match(frontend, /webdav:\s*\{\s*enabled:\s*boolean;\s*server_url:\s*string;\s*username:\s*string;\s*password:\s*string;\s*remote_root:\s*string;\s*\}/);
  assert.match(frontend, /webdav:\s*\{\s*enabled:\s*false,\s*server_url:\s*'',\s*username:\s*'',\s*password:\s*'',\s*remote_root:\s*'\/Zeditor',\s*\}/);
  assert.match(frontend, /webdav:\s*\{\s*\.\.\.defaultSettings\.webdav,\s*\.\.\.saved\.webdav\s*\}/);

  assert.match(model, /pub struct WebDavSettings\s*\{\s*#\[serde\(default\)\]\s*pub enabled:\s*bool,\s*#\[serde\(default\)\]\s*pub server_url:\s*String,\s*#\[serde\(default\)\]\s*pub username:\s*String,\s*#\[serde\(default\)\]\s*pub password:\s*String,\s*#\[serde\(default = "default_webdav_remote_root"\)\]\s*pub remote_root:\s*String,\s*\}/);
  assert.match(rust, /#\[serde\(default\)\]\s*pub webdav:\s*WebDavSettings,/);
});

test('Settings exposes WebDAV configuration and global history', () => {
  const panel = read('src/components/Settings/SettingsPanel.tsx');
  const webdav = read('src/components/WebDav/WebDavSettings.tsx');
  assert.match(panel, /id:\s*['"]webdav['"]/);
  assert.match(panel, /activeTab === ['"]webdav['"]/);
  for (const label of ['服务器地址', '用户名', '密码 / 应用密码', '远端根目录', '测试连接', '浏览全部备份']) {
    assert.match(webdav, new RegExp(label));
  }
  assert.match(webdav, /webdav_test_connection/);
});

test('Settings exposes S3 sync configuration', () => {
  const panel = read('src/components/Settings/SettingsPanel.tsx');
  const frontend = read('src/stores/appStore.ts');
  const s3 = read('src/components/WebDav/S3Settings.tsx');

  assert.match(panel, /id:\s*['"]s3['"]/);
  assert.match(panel, /activeTab === ['"]s3['"]/);

  for (const label of ['服务端点（Endpoint）', '存储桶（Bucket）', '地域（Region）', '访问密钥 ID（Access Key）', '访问密钥（Secret Key）', '路径风格（Path-Style）', '远端根目录（对象前缀）', '测试连接', '浏览全部备份']) {
    assert.match(s3, new RegExp(label));
  }
  assert.match(s3, /s3_test_connection/);

  assert.match(frontend, /s3:\s*\{\s*enabled:\s*false,\s*endpoint:\s*'',\s*bucket:\s*'',\s*region:\s*'',\s*access_key:\s*'',\s*secret_key:\s*'',\s*path_style:\s*false,\s*remote_root:\s*'\/Zeditor',\s*\}/);
  assert.match(frontend, /s3:\s*\{\s*\.\.\.defaultSettings\.s3,\s*\.\.\.saved\.s3\s*\}/);
});
