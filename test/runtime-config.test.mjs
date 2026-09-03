import assert from 'node:assert/strict'
import test from 'node:test'
import { createAppUrl, getListenHost, isValidRuntimeConfig } from '../app/dist/runtime-config.js'

const validConfig = {
  apiPath: '/desktop-0123456789abcdefghijklmnopqrstuv',
  host: '192.168.1.20',
  port: 17890,
}

test('accepts a valid persisted runtime config', () => {
  assert.equal(isValidRuntimeConfig(validConfig), true)
})

test('rejects unsafe API paths and ports', () => {
  assert.equal(isValidRuntimeConfig({ ...validConfig, apiPath: '/short' }), false)
  assert.equal(isValidRuntimeConfig({ ...validConfig, host: '8.8.8.8' }), false)
  assert.equal(isValidRuntimeConfig({ ...validConfig, port: 80 }), false)
  assert.equal(isValidRuntimeConfig({ ...validConfig, port: 70000 }), false)
})

test('creates an application URL for the selected network host', () => {
  assert.equal(
    createAppUrl(validConfig),
    'http://192.168.1.20:17890/?magicpath=desktop-0123456789abcdefghijklmnopqrstuv',
  )
})

test('selects a private network host or loopback', () => {
  assert.match(getListenHost(), /^(127\.0\.0\.1|10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.)/)
})
