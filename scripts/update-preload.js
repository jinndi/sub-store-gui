const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('updateAPI', {
  onProgress: (callback) => {
    const listener = (_event, data) => callback(data)
    ipcRenderer.on('update:progress', listener)
    return () => ipcRenderer.removeListener('update:progress', listener)
  },
  restart: () => ipcRenderer.invoke('app:restart'),
  close: () => ipcRenderer.invoke('update:close'),
})
