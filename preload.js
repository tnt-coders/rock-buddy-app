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
  getPath: async (defaultPath) => ipcRenderer.invoke('get-path', defaultPath),
  pathJoin: async (...args) => ipcRenderer.invoke('path-join', ...args),
  readFile: async (file) => ipcRenderer.invoke('read-file', file),
  writeFile: async (file, contents) => ipcRenderer.invoke('write-file', file, contents),
  readRocksmithData: async (dataFile) => ipcRenderer.invoke('read-rocksmith-data', dataFile),
  getSteamProfiles: async (steamUserDataPath) => ipcRenderer.invoke('get-steam-profiles', steamUserDataPath),
  getRocksmithProfiles: async (steamUserDataPath, steamProfile) => ipcRenderer.invoke('get-rocksmith-profiles', steamUserDataPath, steamProfile)
});