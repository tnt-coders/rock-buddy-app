const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  info: (message) => ipcRenderer.send('info', message),
  warning: (message) => ipcRenderer.send('warning', message),
  error: (message) => ipcRenderer.send('error', message),
  getVersion: async () => ipcRenderer.invoke('get-version'),
  getHost: async () => ipcRenderer.invoke('get-host'),
  storeGet: async (key) => ipcRenderer.invoke('store-get', key),
  storeSet: async (key, value) => ipcRenderer.invoke('store-set', key, value),
  storeDelete: async (key) => ipcRenderer.invoke('store-delete', key),
  getPath: async (defaultPath) => ipcRenderer.invoke('get-path', defaultPath),
  directoryExists: async(path) => ipcRenderer.invoke('directory-exists', path),
  pathJoin: async (...args) => ipcRenderer.invoke('path-join', ...args),
  readFile: async (file) => ipcRenderer.invoke('read-file', file),
  writeFile: async (file, contents) => ipcRenderer.invoke('write-file', file, contents),
  semverGte: async (version1, version2) => ipcRenderer.invoke('semver-gte', version1, version2),
  readRocksmithData: async (dataFile) => ipcRenderer.invoke('read-rocksmith-data', dataFile),
  getSteamProfiles: async (steamUserDataPath) => ipcRenderer.invoke('get-steam-profiles', steamUserDataPath),
  getRocksmithProfiles: async (steamUserDataPath, steamProfile) => ipcRenderer.invoke('get-rocksmith-profiles', steamUserDataPath, steamProfile),
  checkForNewRocksmithProfileData: async (steamUserDataPath, steamProfile, rocksmithProfile) => ipcRenderer.invoke('check-for-new-rocksmith-profile-data', steamUserDataPath, steamProfile, rocksmithProfile),
  getRocksmithProfileData: async (steamUserDataPath, steamProfile, rocksmithProfile) => ipcRenderer.invoke('get-rocksmith-profile-data', steamUserDataPath, steamProfile, rocksmithProfile)
});