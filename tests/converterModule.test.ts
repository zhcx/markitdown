import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = (path: string) => readFileSync(path, 'utf8')

test('desktop bundles remain converter-free on every platform', () => {
  const base = JSON.parse(read('src-tauri/tauri.conf.json'))
  const windows = JSON.parse(read('src-tauri/tauri.windows.conf.json'))

  assert.ok(!base.bundle.resources.includes('resources/document_converter.exe'))
  assert.ok(!windows.bundle.resources.includes('resources/document_converter.exe'))
  assert.ok(!base.bundle.resources.includes('resources/document_converter.py'))
  assert.ok(!windows.bundle.resources.includes('resources/document_converter.py'))
})

test('converter manager verifies metadata and hashes before activation', () => {
  const manager = read('src-tauri/src/converter.rs')

  assert.match(manager, /CONVERTER_MANIFEST_PUBLIC_KEY/)
  assert.match(manager, /sha256_file\(&staged_executable\)/)
  assert.match(manager, /enclosed_name\(\)/)
  // 上游仓库由 zhcx/markitdown 更名为 zhcx/zeditor，转换器发布 URL 同步更新
  assert.match(manager, /starts_with\("\/zhcx\/zeditor\/releases\/download\/"\)/)
  assert.match(manager, /health_check\(&staged_executable/)
  assert.match(manager, /converter_module_missing/)
  // Ed25519 签名验证可选：有公钥时验证，无公钥时跳过
  assert.match(manager, /public_key\(\)\.is_some\(\)/)
})

test('converter protocol is versioned and keeps large Markdown out of stdout', () => {
  const converter = read('converter/src/main.rs')

  assert.match(converter, /PROTOCOL_VERSION: u32 = 1/)
  assert.match(converter, /\["--version-json"\]/)
  assert.match(converter, /\.partial/)
  assert.match(converter, /fs::rename\(&temporary, output\)/)
  assert.match(converter, /engine: ENGINE/)
  for (const format of ['doc', 'docm', 'ppt', 'xlsb', 'odt', 'epub', 'pdf']) {
    assert.match(converter, new RegExp(`"${format}"`))
  }
})

test('open dialogs and converter metadata share the expanded format catalog', () => {
  const formats = read('src/utils/documentFormats.ts')
  const packager = read('scripts/prepare-converter-package.mjs')
  const store = read('src/stores/appStore.ts')

  for (const format of ['doc', 'docx', 'docm', 'ppt', 'pptx', 'xls', 'xlsb', 'odt', 'ods', 'odp', 'rtf', 'epub', 'csv', 'pdf']) {
    assert.match(formats, new RegExp(`'${format}'`))
    assert.match(packager, new RegExp(`'${format}'`))
  }
  assert.match(store, /isConvertibleDocumentName/)
  assert.match(store, /convertDocument\(path\)/)
})

test('converter workflow builds four native AnyDoc modules with Cargo', () => {
  const workflow = read('.github/workflows/converter.yml')

  for (const target of [
    'x86_64-pc-windows-msvc',
    'x86_64-apple-darwin',
    'aarch64-apple-darwin',
    'x86_64-unknown-linux-gnu',
  ]) {
    assert.match(workflow, new RegExp(target))
  }
  assert.match(workflow, /cargo build --manifest-path converter\/Cargo.toml --release --locked/)
  assert.match(workflow, /engine!=='anydoc'/)
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
