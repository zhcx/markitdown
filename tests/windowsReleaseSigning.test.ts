import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const workflow = readFileSync('.github/workflows/build.yml', 'utf8')
const tauriConfig = readFileSync('src-tauri/tauri.conf.json', 'utf8')

test('Windows releases use SignPath when configured and allow an explicit unsigned fallback', () => {
  assert.match(workflow, /SIGNPATH_API_TOKEN/)
  assert.match(workflow, /signpath\/github-action-submit-signing-request@v2/)
  assert.match(workflow, /verify-windows-signatures\.ps1/)
  assert.match(workflow, /SIGNPATH_ENABLED/)
  assert.match(workflow, /unsigned/i)
})

test('Windows signatures use SHA-256 and a trusted timestamp', () => {
  const config = JSON.parse(tauriConfig)

  assert.equal(config.bundle.windows.digestAlgorithm, 'sha256')
  assert.match(config.bundle.windows.timestampUrl, /^https?:\/\//)
})
