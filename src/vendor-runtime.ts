import { cp, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

export interface VendorRuntimePaths {
  vendorRoot: string
  lockPath: string
}

export function getUserVendorRuntimePaths(userDataDir: string): VendorRuntimePaths {
  const runtimeRoot = path.join(userDataDir, 'sub-store')
  return {
    vendorRoot: path.join(runtimeRoot, 'vendor'),
    lockPath: path.join(runtimeRoot, 'vendor-lock.json'),
  }
}

export async function ensureUserVendor(
  userDataDir: string,
  bundledVendorRoot: string,
  bundledLockPath: string,
): Promise<VendorRuntimePaths> {
  const runtimePaths = getUserVendorRuntimePaths(userDataDir)
  await mkdir(path.dirname(runtimePaths.lockPath), { recursive: true, mode: 0o700 })

  if (!(await isFile(runtimePaths.lockPath))) {
    await writeFile(runtimePaths.lockPath, await readFile(bundledLockPath), { mode: 0o600 })
  }

  const hasVendor = await Promise.all([
    isFile(path.join(runtimePaths.vendorRoot, 'backend', 'sub-store.bundle.cjs')),
    isFile(path.join(runtimePaths.vendorRoot, 'frontend', 'index.html')),
  ])
  if (!hasVendor.every(Boolean)) {
    await cp(bundledVendorRoot, runtimePaths.vendorRoot, { recursive: true, force: true })
  }

  return runtimePaths
}

async function isFile(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isFile()
  } catch {
    return false
  }
}
