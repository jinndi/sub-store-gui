import { mkdtemp, mkdir, cp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { unzipSync } from 'fflate'
import {
  downloadVerified,
  readVendorLock,
  sha256File,
  sha256Tree,
  vendorRoot,
} from './vendor-utils.mjs'

const lock = await readVendorLock()
const backendDir = path.join(vendorRoot, 'backend')
const backendPath = path.join(backendDir, lock.backend.output)
const frontendDir = path.join(vendorRoot, 'frontend')
const licensesDir = path.join(vendorRoot, 'licenses')
const backendLicensePath = path.join(licensesDir, 'Sub-Store-AGPL-3.0.txt')
const frontendLicensePath = path.join(licensesDir, 'Sub-Store-Front-End-GPL-3.0.txt')
const manifestPath = path.join(vendorRoot, 'manifest.json')

if (await vendorIsCurrent()) {
  console.log(`Sub-Store ${lock.backend.version} / Front-End ${lock.frontend.version} 已通过校验`)
  process.exit(0)
}

const temporaryDir = await mkdtemp(path.join(os.tmpdir(), 'sub-store-desktop-vendor-'))
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
    throw new Error(`前端文件树校验失败\n期望: ${lock.frontend.treeSha256}\n实际: ${treeSha256}`)
  }

  await rm(vendorRoot, { recursive: true, force: true })
  await Promise.all([
    mkdir(backendDir, { recursive: true }),
    mkdir(licensesDir, { recursive: true }),
  ])
  await Promise.all([
    writeFile(backendPath, backendBytes, { mode: 0o644 }),
    cp(extractedDistPath, frontendDir, { recursive: true }),
    writeFile(backendLicensePath, backendLicense),
    writeFile(frontendLicensePath, frontendLicense),
  ])
  await writeFile(
    manifestPath,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), ...lock }, null, 2)}\n`,
  )

  console.log(`已同步 Sub-Store ${lock.backend.version} / Front-End ${lock.frontend.version}`)
} finally {
  await rm(temporaryDir, { recursive: true, force: true })
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
      throw new Error(`ZIP 中包含不安全路径: ${archivePath}`)
    }

    const outputPath = path.resolve(resolvedRoot, normalizedPath)
    if (outputPath !== resolvedRoot && !outputPath.startsWith(`${resolvedRoot}${path.sep}`)) {
      throw new Error(`ZIP 路径越界: ${archivePath}`)
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
