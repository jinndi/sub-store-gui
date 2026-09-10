import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { unzipSync } from 'fflate'
import { app, BrowserWindow, dialog, ipcMain } from 'electron'

interface VendorLock {
  schemaVersion: number
  backend: {
    name: string
    version: string
    url: string
    sha256: string
    output: string
    licenseUrl: string
    licenseSha256: string
  }
  frontend: {
    name: string
    version: string
    url: string
    sha256: string
    treeSha256: string
    licenseUrl: string
    licenseSha256: string
  }
}

interface UpdateState {
  lastCheckDate: string
  availableUpdate: {
    backendVersion: string
    frontendVersion: string
  } | null
}

const UPDATE_STATE_FILE = 'update-state.json'
const LATEST_RELEASE_URL = 'https://api.github.com/repos/sub-store-org/Sub-Store/releases/latest'
const LATEST_FRONTEND_RELEASE_URL = 'https://api.github.com/repos/sub-store-org/Sub-Store-Front-End/releases/latest'

let updateWindow: BrowserWindow | null = null

export function setupUpdateHandlers(): void {
  ipcMain.handle('update:start', async () => {
    const userDataDir = app.getPath('userData')
    await performUpdate(userDataDir)
  })

  ipcMain.handle('update:close', () => {
    if (updateWindow) {
      updateWindow.close()
      updateWindow = null
    }
  })

  ipcMain.handle('app:restart', () => {
    app.relaunch()
    app.quit()
  })
}

export async function checkForUpdates(userDataDir: string, silent: boolean = false): Promise<void> {
  const statePath = path.join(userDataDir, UPDATE_STATE_FILE)
  
  // В production vendor-lock.json находится в resources/source/
  const vendorLockPath = app.isPackaged
    ? path.join(process.resourcesPath, 'source', 'vendor-lock.json')
    : path.join(app.getAppPath(), 'vendor-lock.json')
  
  let currentState: UpdateState = { lastCheckDate: '', availableUpdate: null }
  try {
    const stateText = await readFile(statePath, 'utf8')
    currentState = JSON.parse(stateText)
  } catch {
    // Файл состояния не существует или повреждён — создадим новый
  }
  
  // Проверяем, прошел ли день с последней проверки
  const today = new Date().toLocaleDateString('ru-RU', { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone })
  if (currentState.lastCheckDate === today) {
    return // Уже проверяли сегодня
  }
  
  // Читаем текущие версии из vendor-lock.json
  let currentLock: VendorLock
  try {
    const lockText = await readFile(vendorLockPath, 'utf8')
    currentLock = JSON.parse(lockText)
  } catch (error) {
    console.error('Не удалось прочитать vendor-lock.json:', error)
    return
  }
  
  try {
    // Получаем последние версии
    const [backendResponse, frontendResponse] = await Promise.all([
      fetch(LATEST_RELEASE_URL, { 
        headers: { 'User-Agent': 'sub-store-desktop-update-checker' },
        signal: AbortSignal.timeout(10000)
      }),
      fetch(LATEST_FRONTEND_RELEASE_URL, { 
        headers: { 'User-Agent': 'sub-store-desktop-update-checker' },
        signal: AbortSignal.timeout(10000)
      })
    ])
    
    if (!backendResponse.ok || !frontendResponse.ok) {
      throw new Error(`GitHub API вернул статус ${backendResponse.status} или ${frontendResponse.status}`)
    }
    
    const backendData = await backendResponse.json() as { tag_name: string }
    const frontendData = await frontendResponse.json() as { tag_name: string }
    
    if (!backendData.tag_name || !frontendData.tag_name) {
      throw new Error('Не удалось получить информацию о версиях из GitHub API')
    }

    const latestBackendVersion = backendData.tag_name.replace(/^v/, '')
    const latestFrontendVersion = frontendData.tag_name.replace(/^v/, '')
    
    const currentBackendVersion = currentLock.backend.version
    const currentFrontendVersion = currentLock.frontend.version
    
    // Сохраняем дату проверки
    const todayChecked = today
    currentState.lastCheckDate = todayChecked
    currentState.availableUpdate = null
    
    // Проверяем, есть ли обновления
    const backendUpdated = compareVersions(latestBackendVersion, currentBackendVersion) > 0
    const frontendUpdated = compareVersions(latestFrontendVersion, currentFrontendVersion) > 0
    
    if (backendUpdated || frontendUpdated) {
      currentState.availableUpdate = {
        backendVersion: latestBackendVersion,
        frontendVersion: latestFrontendVersion
      }
      
      // Показываем диалог пользователю
      if (silent) {
        // В тихом режиме просто сохраняем состояние, пользователь проверит сам
        await writeFile(statePath, JSON.stringify(currentState, null, 2), { mode: 0o600 })
        return
      }
      await showUpdateDialog(currentState.availableUpdate, currentLock, userDataDir)
    }
    
    // Сохраняем состояние
    await writeFile(statePath, JSON.stringify(currentState, null, 2), { mode: 0o600 })
  } catch (error) {
    console.error('Ошибка при проверке обновлений:', error)
    // Всё равно сохраняем дату проверки, чтобы не спамить запросами
    const todayChecked = today
    currentState.lastCheckDate = todayChecked
    try {
      await writeFile(statePath, JSON.stringify(currentState, null, 2), { mode: 0o600 })
    } catch {
      // Игнорируем ошибки записи
    }
  }
}

function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split('.').map(Number)
  const parts2 = v2.split('.').map(Number)
  
  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const a = parts1[i] ?? 0
    const b = parts2[i] ?? 0
    if (a !== b) return a - b
  }
  return 0
}

async function showUpdateDialog(
  availableUpdate: { backendVersion: string; frontendVersion: string },
  currentLock: VendorLock,
  userDataDir: string
): Promise<void> {
  const backendMsg = availableUpdate.backendVersion !== currentLock.backend.version
    ? `\nBackend: ${currentLock.backend.version} → ${availableUpdate.backendVersion}`
    : ''
  const frontendMsg = availableUpdate.frontendVersion !== currentLock.frontend.version
    ? `\nFrontend: ${currentLock.frontend.version} → ${availableUpdate.frontendVersion}`
    : ''
  
  const { response } = await dialog.showMessageBox({
    type: 'question',
    buttons: ['Обновить', 'Отмена'],
    defaultId: 0,
    cancelId: 1,
    title: 'Доступно обновление Sub-Store',
    message: 'Найдены новые версии компонентов Sub-Store',
    detail: `Текущие версии:${backendMsg}${frontendMsg}\n\nХотите загрузить и установить обновления?`,
  })
  
  if (response === 0) {
    // Пользователь согласился на обновление - показываем окно прогресса
    showUpdateProgressWindow(userDataDir)
  }
}

function showUpdateProgressWindow(userDataDir: string): void {
  if (updateWindow) {
    updateWindow.focus()
    return
  }

  const parentWindow = BrowserWindow.getFocusedWindow() ?? undefined
  const preloadPath = app.isPackaged
    ? path.join(process.resourcesPath, 'source', 'scripts', 'update-preload.js')
    : path.join(app.getAppPath(), 'scripts', 'update-preload.js')
  const options: Electron.BrowserWindowConstructorOptions = {
    width: 500,
    height: 300,
    resizable: false,
    closable: false,
    modal: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: preloadPath,
    },
  }

  if (parentWindow) {
    options.parent = parentWindow
  }

  updateWindow = new BrowserWindow(options)

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f0f0f0;
      margin: 0;
      padding: 20px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100vh;
      box-sizing: border-box;
    }
    .container {
      text-align: center;
      width: 100%;
    }
    h2 {
      margin: 0 0 20px 0;
      color: #333;
      font-size: 18px;
    }
    .progress-bar {
      width: 100%;
      height: 20px;
      background: #e0e0e0;
      border-radius: 10px;
      overflow: hidden;
      margin-bottom: 15px;
    }
    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, #4CAF50, #45a049);
      width: 0%;
      transition: width 0.3s ease;
    }
    .status {
      color: #666;
      font-size: 14px;
      margin-bottom: 10px;
    }
    .spinner {
      border: 3px solid #f3f3f3;
      border-top: 3px solid #4CAF50;
      border-radius: 50%;
      width: 40px;
      height: 40px;
      animation: spin 1s linear infinite;
      margin: 0 auto 20px;
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    .error {
      color: #d32f2f;
      background: #ffebee;
      padding: 15px;
      border-radius: 8px;
      margin-bottom: 15px;
    }
    .success {
      color: #388e3c;
      background: #e8f5e9;
      padding: 15px;
      border-radius: 8px;
      margin-bottom: 15px;
    }
    button {
      background: #4CAF50;
      color: white;
      border: none;
      padding: 10px 30px;
      border-radius: 5px;
      cursor: pointer;
      font-size: 14px;
    }
    button:hover {
      background: #45a049;
    }
    button.restart {
      background: #2196F3;
    }
    button.restart:hover {
      background: #1976D2;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="spinner" id="spinner"></div>
    <h2 id="title">Обновление Sub-Store</h2>
    <div class="progress-bar">
      <div class="progress-fill" id="progressFill"></div>
    </div>
    <div class="status" id="status">Подготовка...</div>
    <div id="message"></div>
    <button id="actionBtn" style="display:none;">OK</button>
  </div>
  <script>
    const stages = {
      'checking': { progress: 10, message: 'Проверка обновлений...' },
      'downloading': { progress: 40, message: 'Загрузка компонентов...' },
      'extracting': { progress: 70, message: 'Распаковка файлов...' },
      'installing': { progress: 90, message: 'Установка обновлений...' },
      'complete': { progress: 100, message: 'Обновление завершено!' },
      'error': { progress: 0, message: 'Ошибка обновления' }
    };

    function updateStage(stage, customMessage) {
      const stageData = stages[stage] || { progress: 0, message: stage };
      document.getElementById('progressFill').style.width = stageData.progress + '%';
      document.getElementById('status').textContent = customMessage || stageData.message;

      if (stage === 'complete') {
        document.getElementById('spinner').style.display = 'none';
        document.getElementById('title').textContent = 'Готово!';
        const msgDiv = document.getElementById('message');
        msgDiv.innerHTML = '<div class="success">Sub-Store успешно обновлён до последних версий.</div>';
        const btn = document.getElementById('actionBtn');
        btn.textContent = 'Перезапустить приложение';
        btn.className = 'restart';
        btn.style.display = 'inline-block';
        btn.onclick = () => {
          window.updateAPI.restart();
        };
      } else if (stage === 'error') {
        document.getElementById('spinner').style.display = 'none';
        document.getElementById('title').textContent = 'Ошибка';
        const msgDiv = document.getElementById('message');
        msgDiv.innerHTML = '<div class="error">' + (customMessage || 'Не удалось выполнить обновление') + '</div>';
        const btn = document.getElementById('actionBtn');
        btn.textContent = 'Закрыть';
        btn.style.display = 'inline-block';
        btn.onclick = () => {
          window.updateAPI.close();
        };
      }
    }

    window.updateAPI.onProgress((data) => {
      updateStage(data.stage, data.message);
    });
  </script>
</body>
</html>
  `

  updateWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(htmlContent))

  updateWindow.webContents.once('did-finish-load', () => {
    performUpdateWithProgress(userDataDir)
  })
}

async function performUpdateWithProgress(userDataDir: string): Promise<void> {
  try {
    const vendorRoot = app.isPackaged
      ? path.join(process.resourcesPath, 'vendor')
      : path.join(app.getAppPath(), 'resources', 'vendor')
    const vendorLockPath = app.isPackaged
      ? path.join(process.resourcesPath, 'source', 'vendor-lock.json')
      : path.join(app.getAppPath(), 'vendor-lock.json')

    const statePath = path.join(userDataDir, UPDATE_STATE_FILE)
    let currentState: UpdateState = { lastCheckDate: '', availableUpdate: null }
    try {
      const stateText = await readFile(statePath, 'utf8')
      currentState = JSON.parse(stateText)
    } catch {
      // ignore
    }

    if (!currentState.availableUpdate) {
      throw new Error('Информация об обновлении не найдена')
    }

    const backendVersion = currentState.availableUpdate.backendVersion
    const frontendVersion = currentState.availableUpdate.frontendVersion

    const backendUrl = `https://github.com/sub-store-org/Sub-Store/releases/download/${backendVersion}/sub-store.bundle.js`
    const frontendUrl = `https://github.com/sub-store-org/Sub-Store-Front-End/releases/download/${frontendVersion}/dist.zip`
    const backendLicenseUrl = `https://raw.githubusercontent.com/sub-store-org/Sub-Store/${backendVersion}/LICENSE`
    const frontendLicenseUrl = `https://raw.githubusercontent.com/sub-store-org/Sub-Store-Front-End/${frontendVersion}/LICENSE`

    if (updateWindow) {
      updateWindow.webContents.send('update:progress', { stage: 'downloading', message: 'Загрузка компонентов...' })
    }

    const [backendBytes, frontendBytes, backendLicense, frontendLicense] = await Promise.all([
      downloadVerified(backendUrl),
      downloadVerified(frontendUrl),
      downloadVerified(backendLicenseUrl),
      downloadVerified(frontendLicenseUrl),
    ])

    if (updateWindow) {
      updateWindow.webContents.send('update:progress', { stage: 'extracting', message: 'Проверка файлов...' })
    }

    const backendSha256 = createHash('sha256').update(backendBytes).digest('hex')
    const frontendSha256 = createHash('sha256').update(frontendBytes).digest('hex')
    const backendLicenseSha256 = createHash('sha256').update(backendLicense).digest('hex')
    const frontendLicenseSha256 = createHash('sha256').update(frontendLicense).digest('hex')

    const extractedPath = path.join(os.tmpdir(), `sub-store-desktop-frontend-${Date.now()}`)
    let frontendTreeSha256 = ''
    try {
      await extractZipSafely(frontendBytes, extractedPath)
      const extractedDistPath = path.join(extractedPath, 'dist')
      frontendTreeSha256 = await sha256Tree(extractedDistPath)
    } finally {
      await rm(extractedPath, { recursive: true, force: true })
    }

    const currentLock = JSON.parse(await readFile(vendorLockPath, 'utf8'))
    const newLock = {
      schemaVersion: currentLock.schemaVersion,
      backend: {
        name: currentLock.backend.name,
        version: backendVersion,
        url: backendUrl,
        sha256: backendSha256,
        output: currentLock.backend.output,
        licenseUrl: backendLicenseUrl,
        licenseSha256: backendLicenseSha256,
      },
      frontend: {
        name: currentLock.frontend.name,
        version: frontendVersion,
        url: frontendUrl,
        sha256: frontendSha256,
        treeSha256: frontendTreeSha256,
        licenseUrl: frontendLicenseUrl,
        licenseSha256: frontendLicenseSha256,
      },
    }

    const tempLockPath = path.join(userDataDir, 'vendor-lock.json.tmp')
    await writeFile(tempLockPath, JSON.stringify(newLock, null, 2), { mode: 0o600 })

    if (updateWindow) {
      updateWindow.webContents.send('update:progress', { stage: 'installing', message: 'Установка обновлений...' })
    }

    const { spawn } = await import('node:child_process')
    const scriptPath = app.isPackaged
      ? path.join(process.resourcesPath, 'source', 'scripts', 'sync-sub-store.mjs')
      : path.join(app.getAppPath(), 'scripts', 'sync-sub-store.mjs')
    const nodePath = process.execPath

    const updateResult = await new Promise<{ success: boolean; error?: string }>((resolve) => {
      const child = spawn(nodePath, [scriptPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, VENDOR_LOCK_PATH: tempLockPath }
      })

      let stdout = ''
      let stderr = ''

      child.stdout?.on('data', (data) => {
        stdout += data.toString()
      })

      child.stderr?.on('data', (data) => {
        stderr += data.toString()
      })

      child.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true })
        } else {
          resolve({ success: false, error: stderr || `Код выхода: ${code}` })
        }
      })

      child.on('error', (err) => {
        resolve({ success: false, error: err.message })
      })
    })

    if (updateResult.success) {
      await writeFile(vendorLockPath, await readFile(tempLockPath), { mode: 0o600 })
      await rm(tempLockPath, { force: true })

      if (updateWindow) {
        updateWindow.webContents.send('update:progress', {
          stage: 'complete',
          message: 'Обновление завершено!'
        })
      }
    } else {
      await rm(tempLockPath, { force: true })
      if (updateWindow) {
        updateWindow.webContents.send('update:progress', {
          stage: 'error',
          message: updateResult.error
        })
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    if (updateWindow) {
      updateWindow.webContents.send('update:progress', {
        stage: 'error',
        message: errorMessage
      })
    }
  }
}

async function performUpdate(userDataDir: string): Promise<void> {
  showUpdateProgressWindow(userDataDir)
}

async function downloadVerified(url: string): Promise<Buffer> {
  const response = await fetch(url, {
    redirect: 'follow',
    headers: { 'User-Agent': 'sub-store-desktop-update-checker' },
    signal: AbortSignal.timeout(30000),
  })
  if (!response.ok) {
    throw new Error(`Не удалось скачать ${url}: ${response.status}`)
  }
  return Buffer.from(await response.arrayBuffer())
}

async function extractZipSafely(archiveBytes: Buffer, destinationRoot: string): Promise<void> {
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

async function sha256Tree(rootDir: string): Promise<string> {
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

async function walk(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const output: string[] = []
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) output.push(...(await walk(entryPath)))
    else if (entry.isFile()) output.push(entryPath)
  }
  return output
}
