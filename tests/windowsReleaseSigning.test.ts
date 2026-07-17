import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const workflow = readFileSync('.github/workflows/build.yml', 'utf8')
const tauriConfig = readFileSync('src-tauri/tauri.conf.json', 'utf8')

test('Windows releases must be signed and verified before publication', () => {
  assert.match(workflow, /WINDOWS_CERTIFICATE_BASE64/)
  assert.match(workflow, /prepare-windows-signing\.ps1/)
  assert.match(workflow, /verify-windows-signatures\.ps1/)
  assert.match(workflow, /tauri\.windows-signing\.conf\.json/)
})

test('Windows signatures use SHA-256 and a trusted timestamp', () => {
  const config = JSON.parse(tauriConfig)

  assert.equal(config.bundle.windows.digestAlgorithm, 'sha256')
  assert.match(config.bundle.windows.timestampUrl, /^https?:\/\//)
})
