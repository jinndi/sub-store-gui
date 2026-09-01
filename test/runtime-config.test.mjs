import assert from 'node:assert/strict'
import test from 'node:test'
import { createAppUrl, isValidRuntimeConfig } from '../app/dist/runtime-config.js'

const validConfig = {
  apiPath: '/desktop-0123456789abcdefghijklmnopqrstuv',
  port: 17890,
}

test('accepts a valid persisted runtime config', () => {
  assert.equal(isValidRuntimeConfig(validConfig), true)
})

test('rejects unsafe API paths and ports', () => {
  assert.equal(isValidRuntimeConfig({ ...validConfig, apiPath: '/short' }), false)
  assert.equal(isValidRuntimeConfig({ ...validConfig, port: 80 }), false)
  assert.equal(isValidRuntimeConfig({ ...validConfig, port: 70000 }), false)
})

test('creates a loopback-only application URL', () => {
  assert.equal(
    createAppUrl(validConfig),
    'http://127.0.0.1:17890/?magicpath=desktop-0123456789abcdefghijklmnopqrstuv',
  )
})
