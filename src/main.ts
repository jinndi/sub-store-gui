import path from 'node:path'
import {
  app,
  BrowserWindow,
  dialog,
  Menu,
  session,
  shell,
} from 'electron'
import type { MenuItemConstructorOptions } from 'electron'
import {
  isPermissionAllowed,
  isPermissionRequestAllowed,
} from './permissions.js'
import { createAppOrigin, createAppUrl, ensureRuntimeConfig } from './runtime-config.js'
import { SubStoreService } from './sub-store-service.js'

const SESSION_PARTITION = 'persist:substore-desktop'

let mainWindow: BrowserWindow | null = null
let service: SubStoreService | undefined
let isQuitting = false
let startedRuntime: Awaited<ReturnType<typeof ensureRuntimeConfig>> | undefined
let startedVendorRoot: string | undefined

app.enableSandbox()
app.setName('Sub-Store Desktop')
app.setAppUserModelId('io.substore.desktop')

const hasSingleInstanceLock = app.requestSingleInstanceLock()
if (!hasSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })

  app.on('before-quit', () => {
    isQuitting = true
    service?.stop()
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createMainWindow()
  })

  void app.whenReady().then(bootstrap).catch(showFatalError)
}

async function bootstrap(): Promise<void> {
  configureMenu()
  await createMainWindow()
}

async function createMainWindow(): Promise<void> {
  if (mainWindow) return

  const userDataDir = app.getPath('userData')
  const runtimeConfig = startedRuntime ?? await ensureRuntimeConfig(userDataDir)
  const vendorRoot = startedVendorRoot ?? (app.isPackaged
    ? path.join(process.resourcesPath, 'vendor')
    : path.join(app.getAppPath(), 'resources', 'vendor'))
  const expectedOrigin = createAppOrigin(runtimeConfig)
  const appSession = session.fromPartition(SESSION_PARTITION)

  configurePermissions(appSession, expectedOrigin)

  if (!service) {
    service = new SubStoreService()
    await service.start({
      config: runtimeConfig,
      dataDir: path.join(userDataDir, 'sub-store', 'data'),
      logDir: path.join(userDataDir, 'logs'),
      vendorRoot,
      onUnexpectedExit: (message) => {
        if (isQuitting) return
        dialog.showErrorBox('Sub-Store Desktop', `${message}\n\nПожалуйста, проверьте журналы в каталоге данных приложения.`)
        app.quit()
      },
    })
    startedRuntime = runtimeConfig
    startedVendorRoot = vendorRoot
  }

  const iconPath = path.join(vendorRoot, 'frontend', '512x512.png')
  const window = new BrowserWindow({
    title: 'Sub-Store Desktop',
    width: 1280,
    height: 840,
    minWidth: 880,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#f2f2f2',
    icon: iconPath,
    webPreferences: {
      contextIsolation: true,
      devTools: !app.isPackaged,
      nodeIntegration: false,
      partition: SESSION_PARTITION,
      sandbox: true,
      webSecurity: true,
      webviewTag: false,
    },
  })
  mainWindow = window

  hardenWindow(window, expectedOrigin)
  window.once('ready-to-show', () => window.show())
  window.once('closed', () => {
    mainWindow = null
  })
  await window.loadURL(createAppUrl(runtimeConfig))
}

function configurePermissions(appSession: Electron.Session, expectedOrigin: string): void {
  appSession.setPermissionCheckHandler((_webContents, permission, requestingOrigin) => {
    return isPermissionAllowed(permission, requestingOrigin, expectedOrigin)
  })
  appSession.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(
      isPermissionRequestAllowed(permission, webContents.getURL(), expectedOrigin),
    )
  })
}

function hardenWindow(window: BrowserWindow, expectedOrigin: string): void {
  window.webContents.on('will-attach-webview', (event) => event.preventDefault())

  window.webContents.on('will-navigate', (event, targetUrl) => {
    if (isSameOrigin(targetUrl, expectedOrigin)) return
    event.preventDefault()
    void openExternalUrl(targetUrl)
  })

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isSameOrigin(url, expectedOrigin)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          autoHideMenuBar: true,
          webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            webSecurity: true,
            webviewTag: false,
          },
        },
      }
    }
    void openExternalUrl(url)
    return { action: 'deny' }
  })
}

function isSameOrigin(targetUrl: string, expectedOrigin: string): boolean {
  try {
    return new URL(targetUrl).origin === expectedOrigin
  } catch {
    return false
  }
}

async function openExternalUrl(targetUrl: string): Promise<void> {
  try {
    const protocol = new URL(targetUrl).protocol
    if (protocol === 'https:' || protocol === 'http:') await shell.openExternal(targetUrl)
  } catch {
    // Invalid and non-web URLs are deliberately ignored.
  }
}

function configureMenu(): void {
  const template: MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin'
      ? [{ role: 'appMenu' as const }]
      : []),
    { role: 'fileMenu' },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        {
          label: 'Открыть каталог с исходным кодом',
          click: () => {
            const sourcePath = app.isPackaged
              ? path.join(process.resourcesPath, 'source')
              : app.getAppPath()
            void shell.openPath(sourcePath)
          },
        },
        {
          label: 'Открыть каталог с данными пользователя',
          click: () => void shell.openPath(app.getPath('userData')),
        },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function showFatalError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error)
  dialog.showErrorBox(
    'Sub-Store Desktop запуск не удался',
    `${message}\n\nПожалуйста, запустите это первым npm run vendor:sync，и проверьте журналы приложения.`,
  )
  app.quit()
}
