import { randomBytes } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'

const DEFAULT_PORT = 17890
const API_PATH_PATTERN = /^\/desktop-[A-Za-z0-9_-]{32}$/

export interface RuntimeConfig {
  apiPath: string
  port: number
}

export function isValidRuntimeConfig(value: unknown): value is RuntimeConfig {
  if (!value || typeof value !== 'object') return false

  const candidate = value as Partial<RuntimeConfig>
  return (
    typeof candidate.apiPath === 'string' &&
    API_PATH_PATTERN.test(candidate.apiPath) &&
    Number.isInteger(candidate.port) &&
    Number(candidate.port) >= 1024 &&
    Number(candidate.port) <= 65535
  )
}

export function createAppUrl(config: RuntimeConfig): string {
  const magicPath = config.apiPath.slice(1)
  return `http://127.0.0.1:${config.port}/?magicpath=${encodeURIComponent(magicPath)}`
}

async function canListen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.unref()
    server.once('error', () => resolve(false))
    server.listen(port, '127.0.0.1', () => {
      server.close(() => resolve(true))
    })
  })
}

async function findAvailablePort(preferredPort: number): Promise<number> {
  if (await canListen(preferredPort)) return preferredPort

  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close()
        reject(new Error('Не удалось получить порт локальной службы.'))
        return
      }
      server.close((error) => (error ? reject(error) : resolve(address.port)))
    })
  })
}

export async function ensureRuntimeConfig(userDataDir: string): Promise<RuntimeConfig> {
  const runtimeDir = path.join(userDataDir, 'sub-store')
  const configPath = path.join(runtimeDir, 'desktop-runtime.json')
  await mkdir(runtimeDir, { recursive: true, mode: 0o700 })

  let saved: RuntimeConfig | undefined
  try {
    const parsed: unknown = JSON.parse(await readFile(configPath, 'utf8'))
    if (isValidRuntimeConfig(parsed)) saved = parsed
  } catch {
    // A missing or malformed file is replaced below.
  }

  const apiPath = saved?.apiPath ?? `/desktop-${randomBytes(24).toString('base64url')}`
  const preferredPort = saved?.port ?? DEFAULT_PORT
  const port = await findAvailablePort(preferredPort)
  const config = { apiPath, port }

  if (!saved || saved.apiPath !== apiPath || saved.port !== port) {
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    })
  }

  return config
}
