import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const vendorRoot = path.join(projectRoot, 'resources', 'vendor')

export async function readVendorLock() {
  return JSON.parse(await readFile(path.join(projectRoot, 'vendor-lock.json'), 'utf8'))
}

export async function sha256File(filePath) {
  return createHash('sha256').update(await readFile(filePath)).digest('hex')
}

export async function sha256Tree(rootDir) {
  const files = await walk(rootDir)
  const hash = createHash('sha256')
  for (const filePath of files.sort()) {
    const relativePath = path.relative(rootDir, filePath).split(path.sep).join('/')
    hash.update(relativePath)
    hash.update('\0')
    hash.update(await readFile(filePath))
    hash.update('\0')
  }
  return hash.digest('hex')
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const output = []
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) output.push(...await walk(entryPath))
    else if (entry.isFile()) output.push(entryPath)
  }
  return output
}

export async function downloadVerified(url, expectedSha256) {
  const response = await fetch(url, {
    redirect: 'follow',
    headers: { 'User-Agent': 'sub-store-desktop-vendor-sync' },
  })
  if (!response.ok) throw new Error(`下载失败 ${response.status}: ${url}`)

  const bytes = Buffer.from(await response.arrayBuffer())
  const actualSha256 = createHash('sha256').update(bytes).digest('hex')
  if (actualSha256 !== expectedSha256) {
    throw new Error(`Несовпадение SHA-256: ${url}\nОжидаемый: ${expectedSha256}\nФактический: ${actualSha256}`)
  }
  return bytes
}
