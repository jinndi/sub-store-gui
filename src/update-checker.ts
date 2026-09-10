import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { app, dialog } from 'electron'

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

export async function checkForUpdates(userDataDir: string): Promise<void> {
  const statePath = path.join(userDataDir, UPDATE_STATE_FILE)
  const vendorLockPath = path.join(app.getAppPath(), 'vendor-lock.json')
  
  let currentState: UpdateState = { lastCheckDate: '', availableUpdate: null }
  try {
    const stateText = await readFile(statePath, 'utf8')
    currentState = JSON.parse(stateText)
  } catch {
    // Файл состояния не существует или повреждён — создадим новый
  }
  
  // Проверяем, прошел ли день с последней проверки
  const today = new Date().toISOString().split('T')[0] ?? ''
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
    // Пользователь согласился на обновление
    await performUpdate(userDataDir)
  }
}

async function performUpdate(userDataDir: string): Promise<void> {
  try {
    // Запускаем скрипт синхронизации через spawn
    const { spawn } = await import('node:child_process')
    
    const scriptPath = path.join(app.getAppPath(), 'scripts', 'sync-sub-store.mjs')
    const nodePath = process.execPath
    
    const updateResult = await new Promise<{ success: boolean; error?: string }>((resolve) => {
      const child = spawn(nodePath, [scriptPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env }
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
      await dialog.showMessageBox({
        type: 'info',
        buttons: ['OK'],
        title: 'Обновление завершено',
        message: 'Sub-Store успешно обновлён до последних версий.\n\nПерезапустите приложение для применения изменений.',
      })
    } else {
      await dialog.showMessageBox({
        type: 'error',
        buttons: ['OK'],
        title: 'Ошибка обновления',
        message: `Не удалось выполнить обновление:\n${updateResult.error}`,
      })
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    await dialog.showMessageBox({
      type: 'error',
      buttons: ['OK'],
      title: 'Ошибка обновления',
      message: `Критическая ошибка при обновлении:\n${errorMessage}`,
    })
  }
}
