import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

const { ensureUserVendor } = await import('../app/dist/vendor-runtime.js')

test('ensureUserVendor initializes writable runtime files without overwriting updates', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sub-store-vendor-runtime-'))
  try {
    const bundledVendorRoot = path.join(root, 'bundled-vendor')
    const bundledLockPath = path.join(root, 'bundled-vendor-lock.json')
    const userDataDir = path.join(root, 'user-data')
    await mkdir(path.join(bundledVendorRoot, 'backend'), { recursive: true })
    await mkdir(path.join(bundledVendorRoot, 'frontend'), { recursive: true })
    await writeFile(path.join(bundledVendorRoot, 'backend', 'sub-store.bundle.cjs'), 'bundled')
    await writeFile(path.join(bundledVendorRoot, 'frontend', 'index.html'), 'bundled')
    await writeFile(bundledLockPath, '{"backend":{"version":"bundled"}}')

    const runtimePaths = await ensureUserVendor(userDataDir, bundledVendorRoot, bundledLockPath)
    assert.equal(await readFile(runtimePaths.lockPath, 'utf8'), '{"backend":{"version":"bundled"}}')
    assert.equal(
      await readFile(path.join(runtimePaths.vendorRoot, 'backend', 'sub-store.bundle.cjs'), 'utf8'),
      'bundled',
    )

    await writeFile(runtimePaths.lockPath, '{"backend":{"version":"updated"}}')
    await writeFile(path.join(runtimePaths.vendorRoot, 'backend', 'sub-store.bundle.cjs'), 'updated')
    await ensureUserVendor(userDataDir, bundledVendorRoot, bundledLockPath)
    assert.equal(await readFile(runtimePaths.lockPath, 'utf8'), '{"backend":{"version":"updated"}}')
    assert.equal(
      await readFile(path.join(runtimePaths.vendorRoot, 'backend', 'sub-store.bundle.cjs'), 'utf8'),
      'updated',
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})