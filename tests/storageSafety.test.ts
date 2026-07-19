import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseStoredStringArray } from '../src/utils/storage.ts'

test('stored string arrays tolerate malformed or unexpected JSON', () => {
  assert.deepEqual(parseStoredStringArray(null), [])
  assert.deepEqual(parseStoredStringArray('{broken'), [])
  assert.deepEqual(parseStoredStringArray('{"not":"an array"}'), [])
  assert.deepEqual(parseStoredStringArray('["one", 2, null, "two"]'), ['one', 'two'])
})
