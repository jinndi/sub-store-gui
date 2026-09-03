import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const includePackageManifests = require('../scripts/after-pack.cjs')

test('afterPack includes both package manifests in corresponding source', async () => {
  const appOutDir = await mkdtemp(path.join(os.tmpdir(), 'sub-store-after-pack-'))
  try {
    await includePackageManifests({
      appOutDir,
      packager: {
        getResourcesDir: (directory) => path.join(directory, 'resources'),
      },
    })

    const rootManifest = JSON.parse(await readFile(
      path.join(appOutDir, 'resources', 'source', 'package.json'),
      'utf8',
    ))
    const appManifest = JSON.parse(await readFile(
      path.join(appOutDir, 'resources', 'source', 'app', 'package.json'),
      'utf8',
    ))

    assert.equal(rootManifest.name, 'sub-store-desktop')
    assert.equal(appManifest.version, rootManifest.version)
    assert.equal(appManifest.main, 'dist/main.js')
  } finally {
    await rm(appOutDir, { recursive: true, force: true })
  }
})
