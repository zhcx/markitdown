import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('defines backward-compatible WebDAV settings in Rust and TypeScript', () => {
  const frontend = read('src/stores/appStore.ts');
  const rust = read('src-tauri/src/commands.rs');

  assert.match(frontend, /webdav:\s*\{\s*enabled:\s*boolean;\s*server_url:\s*string;\s*username:\s*string;\s*password:\s*string;\s*remote_root:\s*string;\s*\}/);
  assert.match(frontend, /webdav:\s*\{\s*enabled:\s*false,\s*server_url:\s*'',\s*username:\s*'',\s*password:\s*'',\s*remote_root:\s*'\/Zeditor',\s*\}/);
  assert.match(frontend, /webdav:\s*\{\s*\.\.\.defaultSettings\.webdav,\s*\.\.\.saved\.webdav\s*\}/);

  assert.match(rust, /pub struct WebDavSettings\s*\{\s*#\[serde\(default\)\]\s*pub enabled:\s*bool,\s*#\[serde\(default\)\]\s*pub server_url:\s*String,\s*#\[serde\(default\)\]\s*pub username:\s*String,\s*#\[serde\(default\)\]\s*pub password:\s*String,\s*#\[serde\(default = "default_webdav_remote_root"\)\]\s*pub remote_root:\s*String,\s*\}/);
  assert.match(rust, /#\[serde\(default\)\]\s*pub webdav:\s*WebDavSettings,/);
});
