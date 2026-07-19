import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = (path: string) => readFileSync(path, 'utf8')

test('Windows bundles register Markdown files with a dedicated document icon', () => {
  const config = JSON.parse(read('src-tauri/tauri.conf.json'))
  const windowsConfig = JSON.parse(read('src-tauri/tauri.windows.conf.json'))
  const association = config.bundle.fileAssociations?.find(
    (item: { ext?: string[] }) => item.ext?.includes('md'),
  )

  assert.deepEqual(association?.ext, ['md', 'markdown'])
  assert.equal(association?.name, 'MarkitDown.Markdown')
  assert.equal(association?.description, 'Markdown Document')
  assert.ok(existsSync('src-tauri/icons/markdown-file.ico'))
  assert.ok(windowsConfig.bundle.resources.includes('icons/markdown-file.ico'))
  assert.match(windowsConfig.bundle.windows.nsis.installerHooks, /markdown-file-association\.nsh$/)
  assert.match(windowsConfig.bundle.windows.wix.fragmentPaths[0], /markdown-file-association\.wxs$/)
  assert.ok(windowsConfig.bundle.windows.wix.componentRefs.includes('MarkdownFileAssociationIcon'))

  const hooks = read('src-tauri/windows/markdown-file-association.nsh')
  assert.match(hooks, /MarkitDown\.Markdown\\DefaultIcon/)
  assert.match(hooks, /markdown-file\.ico/)
  assert.match(hooks, /UPDATEFILEASSOC/)

  const wix = read('src-tauri/windows/markdown-file-association.wxs')
  assert.match(wix, /MarkitDown\.Markdown\\DefaultIcon/)
  assert.match(wix, /markdown-file\.ico,0/)
})

test('desktop startup and later launches forward Markdown paths to the editor', () => {
  const cargo = read('src-tauri/Cargo.toml')
  const main = read('src-tauri/src/main.rs')
  const app = read('src/App.tsx')

  assert.match(cargo, /tauri-plugin-single-instance/)
  assert.match(main, /take_pending_open_files/)
  assert.match(main, /enqueue_open_files/)
  assert.match(main, /tauri_plugin_single_instance::init/)
  assert.match(main, /open-files/)
  assert.match(app, /take_pending_open_files/)
  assert.match(app, /listen<string\[\]>\('open-files'/)
})
