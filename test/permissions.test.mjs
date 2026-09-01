import assert from 'node:assert/strict'
import test from 'node:test'
import {
  isPermissionAllowed,
  isPermissionRequestAllowed,
} from '../app/dist/permissions.js'

const expectedOrigin = 'http://127.0.0.1:17890'

test('allows clipboard reads and sanitized writes for the app origin', () => {
  assert.equal(
    isPermissionAllowed('clipboard-read', expectedOrigin, expectedOrigin),
    true,
  )
  assert.equal(
    isPermissionAllowed('clipboard-sanitized-write', expectedOrigin, expectedOrigin),
    true,
  )
  assert.equal(
    isPermissionRequestAllowed(
      'clipboard-sanitized-write',
      `${expectedOrigin}/?magicpath=desktop-test`,
      expectedOrigin,
    ),
    true,
  )
})

test('denies clipboard access to other origins and unrelated permissions', () => {
  assert.equal(
    isPermissionAllowed('clipboard-sanitized-write', 'https://example.com', expectedOrigin),
    false,
  )
  assert.equal(
    isPermissionRequestAllowed(
      'clipboard-sanitized-write',
      'https://example.com/',
      expectedOrigin,
    ),
    false,
  )
  assert.equal(isPermissionAllowed('geolocation', expectedOrigin, expectedOrigin), false)
  assert.equal(isPermissionRequestAllowed('clipboard-read', 'not a URL', expectedOrigin), false)
})
