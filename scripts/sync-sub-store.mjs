import { mkdtemp, mkdir, cp, rename, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { unzipSync } from 'fflate'
import {
  downloadVerified,
  projectRoot,
  readVendorLock,
  sha256File,
  sha256Tree,
  vendorRoot,
} from './vendor-utils.mjs'

const lockPath = process.env.VENDOR_LOCK_PATH || path.join(projectRoot, 'vendor-lock.json')

const lock = await readVendorLock(lockPath)
const backendDir = path.join(vendorRoot, 'backend')
const backendPath = path.join(backendDir, lock.backend.output)
const frontendDir = path.join(vendorRoot, 'frontend')
const licensesDir = path.join(vendorRoot, 'licenses')
const backendLicensePath = path.join(licensesDir, 'Sub-Store-AGPL-3.0.txt')
const frontendLicensePath = path.join(licensesDir, 'Sub-Store-Front-End-GPL-3.0.txt')
const manifestPath = path.join(vendorRoot, 'manifest.json')

if (await vendorIsCurrent()) {
  console.log(`Sub-Store ${lock.backend.version} / Front-End ${lock.frontend.version} проверка пройдена, синхронизация не требуется.`)
  process.exit(0)
}

await mkdir(path.dirname(vendorRoot), { recursive: true })
const temporaryDir = await mkdtemp(path.join(os.tmpdir(), 'sub-store-desktop-vendor-'))
const stagingVendorRoot = await mkdtemp(path.join(path.dirname(vendorRoot), '.sub-store-vendor-'))
try {
  const [backendBytes, frontendBytes, backendLicense, frontendLicense] = await Promise.all([
    downloadVerified(lock.backend.url, lock.backend.sha256),
    downloadVerified(lock.frontend.url, lock.frontend.sha256),
    downloadVerified(lock.backend.licenseUrl, lock.backend.licenseSha256),
    downloadVerified(lock.frontend.licenseUrl, lock.frontend.licenseSha256),
  ])

  const extractedPath = path.join(temporaryDir, 'frontend')
  await extractZipSafely(frontendBytes, extractedPath)

  const extractedDistPath = path.join(extractedPath, 'dist')
  const treeSha256 = await sha256Tree(extractedDistPath)
  if (treeSha256 !== lock.frontend.treeSha256) {
    throw new Error(`Ошибка проверки дерева файлов на стороне клиента\nОжидалось: ${lock.frontend.treeSha256}\nдействительный: ${treeSha256}`)
  }

  const stagedBackendDir = path.join(stagingVendorRoot, 'backend')
  const stagedBackendPath = path.join(stagedBackendDir, lock.backend.output)
  const stagedFrontendDir = path.join(stagingVendorRoot, 'frontend')
  const stagedLicensesDir = path.join(stagingVendorRoot, 'licenses')
  const stagedBackendLicensePath = path.join(stagedLicensesDir, 'Sub-Store-AGPL-3.0.txt')
  const stagedFrontendLicensePath = path.join(stagedLicensesDir, 'Sub-Store-Front-End-GPL-3.0.txt')
  const stagedManifestPath = path.join(stagingVendorRoot, 'manifest.json')

  await Promise.all([
    mkdir(stagedBackendDir, { recursive: true }),
    mkdir(stagedLicensesDir, { recursive: true }),
  ])
  await Promise.all([
    writeFile(stagedBackendPath, backendBytes, { mode: 0o644 }),
    cp(extractedDistPath, stagedFrontendDir, { recursive: true }),
    writeFile(stagedBackendLicensePath, backendLicense),
    writeFile(stagedFrontendLicensePath, frontendLicense),
  ])
  await writeFile(
    stagedManifestPath,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), ...lock }, null, 2)}\n`,
  )

  await replaceVendorRoot(stagingVendorRoot)

  console.log(`Синхронизировано Sub-Store ${lock.backend.version} / Front-End ${lock.frontend.version}`)
} finally {
  await rm(temporaryDir, { recursive: true, force: true })
  await rm(stagingVendorRoot, { recursive: true, force: true })
}

async function replaceVendorRoot(stagingRoot) {
  const backupRoot = `${vendorRoot}.backup-${process.pid}-${Date.now()}`
  let movedCurrent = false

  try {
    try {
      await rename(vendorRoot, backupRoot)
      movedCurrent = true
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }

    await rename(stagingRoot, vendorRoot)
    await rm(backupRoot, { recursive: true, force: true })
  } catch (error) {
    await rm(vendorRoot, { recursive: true, force: true })
    if (movedCurrent) await rename(backupRoot, vendorRoot)
    throw error
  }
}

async function extractZipSafely(archiveBytes, destinationRoot) {
  const files = unzipSync(archiveBytes)
  const resolvedRoot = path.resolve(destinationRoot)

  for (const [archivePath, content] of Object.entries(files)) {
    const normalizedPath = path.posix.normalize(archivePath.replaceAll('\\', '/'))
    if (
      normalizedPath.startsWith('/') ||
      normalizedPath === '..' ||
      normalizedPath.startsWith('../') ||
      normalizedPath.includes('\0')
    ) {
      throw new Error(`ZIP содержит небезопасный путь: ${archivePath}`)
    }

    const outputPath = path.resolve(resolvedRoot, normalizedPath)
    if (outputPath !== resolvedRoot && !outputPath.startsWith(`${resolvedRoot}${path.sep}`)) {
      throw new Error(`ZIP за пределами допустимой области: ${archivePath}`)
    }
    if (archivePath.endsWith('/')) {
      await mkdir(outputPath, { recursive: true })
      continue
    }
    await mkdir(path.dirname(outputPath), { recursive: true })
    await writeFile(outputPath, content)
  }
}

async function vendorIsCurrent() {
  try {
    const [
      backendSha256,
      frontendTreeSha256,
      backendLicenseSha256,
      frontendLicenseSha256,
      manifestText,
    ] = await Promise.all([
      sha256File(backendPath),
      sha256Tree(frontendDir),
      sha256File(backendLicensePath),
      sha256File(frontendLicensePath),
      import('node:fs/promises').then(({ readFile }) => readFile(manifestPath, 'utf8')),
    ])
    const manifest = JSON.parse(manifestText)
    return (
      backendSha256 === lock.backend.sha256 &&
      frontendTreeSha256 === lock.frontend.treeSha256 &&
      backendLicenseSha256 === lock.backend.licenseSha256 &&
      frontendLicenseSha256 === lock.frontend.licenseSha256 &&
      manifest.backend?.version === lock.backend.version &&
      manifest.frontend?.version === lock.frontend.version
    )
  } catch {
    return false
  }
}
