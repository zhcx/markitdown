import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = (path: string) => readFileSync(path, 'utf8')

test('Zeditor branding is used by the application shell and current documentation', () => {
  const packageJson = JSON.parse(read('package.json'))
  const tauri = JSON.parse(read('src-tauri/tauri.conf.json'))
  const windows = JSON.parse(read('src-tauri/tauri.windows.conf.json'))
  const index = read('index.html')
  const main = read('src-tauri/src/main.rs')
  const readme = read('README.md')

  assert.equal(packageJson.name, 'zeditor')
  assert.equal(tauri.productName, 'Zeditor')
  assert.equal(tauri.identifier, 'com.zeditor.desktop')
  assert.equal(tauri.app.windows[0].title, 'Zeditor')
  assert.deepEqual(windows.bundle.fileAssociations, undefined)
  assert.match(index, /<title>Zeditor<\/title>/)
  assert.match(main, /Zeditor permission bridge failed/)
  assert.doesNotMatch(main, /open_devtools/)
  assert.match(main, /cfg_attr\(windows, windows_subsystem = "windows"\)/)
  assert.match(readme, /^# .*Zeditor/m)
  assert.equal(existsSync('src-tauri/resources/document_converter.py'), false)
})

test('AnyDoc metadata and format catalog are the only current converter contract', () => {
  const formats = read('src/utils/documentFormats.ts')
  const packager = read('scripts/prepare-converter-package.mjs')
  const converter = read('converter/src/main.rs')
  const expected = ['doc', 'docx', 'docm', 'ppt', 'pps', 'pot', 'pptx', 'pptm', 'ppsx', 'ppsm', 'xls', 'xlsx', 'xlsm', 'xlsb', 'odt', 'ods', 'odp', 'rtf', 'epub', 'csv', 'pdf']

  for (const format of expected) {
    assert.match(formats, new RegExp(`'${format}'`), format)
    assert.match(packager, new RegExp(`'${format}'`), format)
    assert.match(converter, new RegExp(`"${format}"`), format)
  }
  for (const removed of ['msg', 'mp3', 'mp4', 'jpg', 'png', 'ipynb']) {
    assert.doesNotMatch(formats.split('export const DIRECTLY_EDITABLE_EXTENSIONS')[0], new RegExp(`'${removed}'`), removed)
  }
  assert.doesNotMatch(packager, /jsonl/)
  assert.doesNotMatch(converter, /jsonl/)
  assert.match(packager, /engine: 'anydoc'/)
  assert.match(converter, /engine: ENGINE/)
})
