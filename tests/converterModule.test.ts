import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = (path: string) => readFileSync(path, 'utf8')

test('desktop bundles remain converter-free on every platform', () => {
  const base = JSON.parse(read('src-tauri/tauri.conf.json'))
  const windows = JSON.parse(read('src-tauri/tauri.windows.conf.json'))

  assert.ok(!base.bundle.resources.includes('resources/document_converter.exe'))
  assert.ok(!windows.bundle.resources.includes('resources/document_converter.exe'))
  assert.ok(base.bundle.resources.includes('resources/document_converter.py'))
  assert.ok(windows.bundle.resources.includes('resources/document_converter.py'))
})

test('converter manager verifies metadata and hashes before activation', () => {
  const manager = read('src-tauri/src/converter.rs')

  assert.match(manager, /CONVERTER_MANIFEST_PUBLIC_KEY/)
  assert.match(manager, /sha256_file\(&staged_executable\)/)
  assert.match(manager, /enclosed_name\(\)/)
  assert.match(manager, /starts_with\("\/zhcx\/markitdown\/releases\/download\/"\)/)
  assert.match(manager, /health_check\(&staged_executable/)
  assert.match(manager, /converter_module_missing/)
  // Ed25519 签名验证可选：有公钥时验证，无公钥时跳过
  assert.match(manager, /public_key\(\)\.is_some\(\)/)
})

test('converter protocol is versioned and keeps large Markdown out of stdout', () => {
  const converter = read('src-tauri/resources/document_converter.py')

  assert.match(converter, /PROTOCOL_VERSION = 1/)
  assert.match(converter, /"--version-json"/)
  assert.match(converter, /os\.replace\(temporary_output, output\)/)
  assert.match(converter, /ensure_ascii=True/)
  assert.match(converter, /image_fallback/)
  for (const format of ['xls', 'msg', 'mp4', 'jsonl', 'epub', 'ipynb']) {
    assert.match(converter, new RegExp(`"${format}"`))
  }
})

test('open dialogs and converter metadata share the expanded format catalog', () => {
  const formats = read('src/utils/documentFormats.ts')
  const packager = read('scripts/prepare-converter-package.mjs')
  const store = read('src/stores/appStore.ts')

  for (const format of ['pdf', 'docx', 'pptx', 'xlsx', 'xls', 'html', 'jsonl', 'zip', 'epub', 'jpg', 'wav', 'mp4', 'msg', 'ipynb']) {
    assert.match(formats, new RegExp(`'${format}'`))
    assert.match(packager, new RegExp(`'${format}'`))
  }
  assert.match(store, /isConvertibleDocumentName/)
  assert.match(store, /convertDocument\(path\)/)
})

test('converter workflow builds four unsigned native modules from the frozen uv lock', () => {
  const workflow = read('.github/workflows/converter.yml')

  for (const target of [
    'x86_64-pc-windows-msvc',
    'x86_64-apple-darwin',
    'aarch64-apple-darwin',
    'x86_64-unknown-linux-gnu',
  ]) {
    assert.match(workflow, new RegExp(target))
  }
  assert.match(workflow, /uv sync --project converter --frozen/)
  assert.doesNotMatch(workflow, /signpath/i)
})

test('first conversion requests consent before installing the optional module', () => {
  const store = read('src/stores/appStore.ts')

  assert.match(store, /get_converter_module_status/)
  assert.match(store, /showConverterDialog/)
  assert.match(store, /install_converter_module/)
  assert.match(store, /converter-install-progress/)
  assert.match(store, /ConverterDialogAction/)
})
