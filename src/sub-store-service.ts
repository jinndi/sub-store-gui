import { appendFile, mkdir, rename, rm, stat } from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { utilityProcess } from 'electron'
import type { RuntimeConfig } from './runtime-config.js'

type SubStoreProcess = ReturnType<typeof utilityProcess.fork>

interface SubStoreServiceOptions {
  config: RuntimeConfig
  dataDir: string
  logDir: string
  onUnexpectedExit: (message: string) => void
  vendorRoot: string
}

const START_TIMEOUT_MS = 15_000
const LOG_LIMIT_BYTES = 5 * 1024 * 1024

export class SubStoreService {
  private child: SubStoreProcess | undefined
  private stopping = false

  async start(options: SubStoreServiceOptions): Promise<void> {
    if (this.child) return

    const backendPath = path.join(options.vendorRoot, 'backend', 'sub-store.bundle.cjs')
    const frontendPath = path.join(options.vendorRoot, 'frontend')
    const logPath = path.join(options.logDir, 'sub-store.log')
    const origin = `http://127.0.0.1:${options.config.port}`

    await Promise.all([
      stat(backendPath),
      stat(path.join(frontendPath, 'index.html')),
      mkdir(options.dataDir, { recursive: true, mode: 0o700 }),
      mkdir(options.logDir, { recursive: true, mode: 0o700 }),
    ])
    await rotateLog(logPath)

    const env: Record<string, string> = {}
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined && !key.startsWith('SUB_STORE_')) env[key] = value
    }
    Object.assign(env, {
      SUB_STORE_BACKEND_API_HOST: '127.0.0.1',
      SUB_STORE_BACKEND_API_PORT: String(options.config.port),
      SUB_STORE_BACKEND_MERGE: '1',
      SUB_STORE_CORS_ALLOWED_ORIGINS: origin,
      SUB_STORE_DATA_BASE_PATH: options.dataDir,
      SUB_STORE_FRONTEND_BACKEND_PATH: options.config.apiPath,
      SUB_STORE_FRONTEND_PATH: frontendPath,
      SUB_STORE_X_POWERED_BY: 'Sub-Store Desktop',
    })

    this.stopping = false
    const child = utilityProcess.fork(backendPath, [], {
      cwd: options.dataDir,
      env,
      serviceName: 'Sub-Store Backend',
      stdio: 'pipe',
    })
    this.child = child

    const writeLog = (chunk: unknown): void => {
      const redacted = String(chunk).replaceAll(options.config.apiPath, '/[redacted]')
      void appendFile(logPath, redacted, { encoding: 'utf8', mode: 0o600 })
    }
    child.stdout?.on('data', writeLog)
    child.stderr?.on('data', writeLog)

    let startupFailure: ((error: Error) => void) | undefined
    const exitedDuringStartup = new Promise<never>((_resolve, reject) => {
      startupFailure = reject
    })

    child.once('exit', (code) => {
      this.child = undefined
      const message = `Sub-Store 后端已退出（代码 ${code}）`
      if (startupFailure) {
        startupFailure(new Error(message))
        return
      }
      if (!this.stopping) options.onUnexpectedExit(message)
    })

    try {
      await Promise.race([
        waitForBackend(options.config, START_TIMEOUT_MS),
        exitedDuringStartup,
      ])
      startupFailure = undefined
    } catch (error) {
      this.stop()
      throw error
    }
  }

  stop(): void {
    this.stopping = true
    this.child?.kill()
    this.child = undefined
  }
}

async function rotateLog(logPath: string): Promise<void> {
  try {
    const info = await stat(logPath)
    if (info.size <= LOG_LIMIT_BYTES) return
    const previousPath = `${logPath}.1`
    await rm(previousPath, { force: true })
    await rename(logPath, previousPath)
  } catch {
    // A missing or locked log file should not prevent the app from starting.
  }
}

async function waitForBackend(config: RuntimeConfig, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  const origin = `http://127.0.0.1:${config.port}`

  while (Date.now() < deadline) {
    if (await probe(config, origin)) return
    await new Promise((resolve) => setTimeout(resolve, 150))
  }

  throw new Error(`Sub-Store 后端在 ${timeoutMs / 1000} 秒内未就绪`)
}

async function probe(config: RuntimeConfig, origin: string): Promise<boolean> {
  return new Promise((resolve) => {
    const request = http.get(
      {
        host: '127.0.0.1',
        port: config.port,
        path: `${config.apiPath}/api/utils/env`,
        headers: { Origin: origin },
        timeout: 800,
      },
      (response) => {
        response.resume()
        resolve(response.statusCode === 200)
      },
    )
    request.once('timeout', () => {
      request.destroy()
      resolve(false)
    })
    request.once('error', () => resolve(false))
  })
}
