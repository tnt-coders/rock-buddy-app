const { contextBridge, ipcRenderer } = require('electron');

export const API = {
  info: (message: string) => ipcRenderer.send('info', message),
  warning: (message: string) => ipcRenderer.send('warning', message),
  error: (message: string) => ipcRenderer.send('error', message),
  getWindowSize: async () => ipcRenderer.invoke('get-window-size'),
  setWindowSize: async (width: number, height: number) => ipcRenderer.send('set-window-size', width, height),
  openExternalLink: (url: string) => ipcRenderer.send('open-external-link', url),
  getVersion: async () => ipcRenderer.invoke('get-version'),
  getHost: async () => ipcRenderer.invoke('get-host'),
  storeGet: async (key: string) => ipcRenderer.invoke('store-get', key),
  storeSet: async (key: string, value: string) => ipcRenderer.invoke('store-set', key, value),
  storeDelete: async (key: string) => ipcRenderer.invoke('store-delete', key),
  getPath: async (defaultPath: string) => ipcRenderer.invoke('get-path', defaultPath),
  directoryExists: async (path: string) => ipcRenderer.invoke('directory-exists', path),
  pathJoin: async (...args: string[]) => ipcRenderer.invoke('path-join', ...args),
  readFile: async (file: string) => ipcRenderer.invoke('read-file', file),
  writeFile: async (file: string, contents: string) => ipcRenderer.invoke('write-file', file, contents),
  semverGte: async (version1: string, version2: string) => ipcRenderer.invoke('semver-gte', version1, version2),
  readRocksmithData: async (dataFile: string) => ipcRenderer.invoke('read-rocksmith-data', dataFile),
  getSteamProfiles: async (steamUserDataPath: string) => ipcRenderer.invoke('get-steam-profiles', steamUserDataPath),
  getRocksmithProfiles: async (steamUserDataPath: string, steamProfile: string) => ipcRenderer.invoke('get-rocksmith-profiles', steamUserDataPath, steamProfile),
  checkForNewRocksmithProfileData: async (steamUserDataPath: string, steamProfile: string, rocksmithProfile: string) => ipcRenderer.invoke('check-for-new-rocksmith-profile-data', steamUserDataPath, steamProfile, rocksmithProfile),
  getRocksmithProfileData: async (steamUserDataPath: string, steamProfile: string, rocksmithProfile: string) => ipcRenderer.invoke('get-rocksmith-profile-data', steamUserDataPath, steamProfile, rocksmithProfile)
};

contextBridge.exposeInMainWorld('api', API);