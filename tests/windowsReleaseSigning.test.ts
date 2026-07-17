import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const workflow = readFileSync('.github/workflows/build.yml', 'utf8')
const tauriConfig = readFileSync('src-tauri/tauri.conf.json', 'utf8')

test('Windows releases use signing when credentials exist and allow an explicit unsigned fallback', () => {
  assert.match(workflow, /WINDOWS_CERTIFICATE_BASE64/)
  assert.match(workflow, /prepare-windows-signing\.ps1/)
  assert.match(workflow, /verify-windows-signatures\.ps1/)
  assert.match(workflow, /id: windows_signing/)
  assert.match(workflow, /steps\.windows_signing\.outputs\.config_args/)
  assert.match(workflow, /steps\.windows_signing\.outputs\.signed == 'true'/)
})

test('Windows signatures use SHA-256 and a trusted timestamp', () => {
  const config = JSON.parse(tauriConfig)

  assert.equal(config.bundle.windows.digestAlgorithm, 'sha256')
  assert.match(config.bundle.windows.timestampUrl, /^https?:\/\//)
})
