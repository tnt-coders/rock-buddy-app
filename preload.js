const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  projectRoot: () => { return __dirname; },
  info: (message) => ipcRenderer.send('info', message),
  warning: (message) => ipcRenderer.send('warning', message),
  error: (message) => ipcRenderer.send('error', message),
  getHost: async () => ipcRenderer.invoke('get-host'),
  storeGet: async (key) => ipcRenderer.invoke('store-get', key),
  storeSet: async (key, value) => ipcRenderer.invoke('store-set', key, value),
  storeDelete: async (key) => ipcRenderer.invoke('delete-auth-data', key),
  getPath: async(defaultPath) => ipcRenderer.invoke('get-path', defaultPath),
  readRocksmithData: async(dataFile) => ipcRenderer.incoke('read-rocksmith-data', dataFile)
});