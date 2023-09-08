const { contextBridge, ipcRenderer } = require('electron');

declare type windowResizeCallback = (width: number, height: number) => void;

export const API = {
    getRocksnifferPath: () => ipcRenderer.invoke('get-rocksniffer-path'),
    launchRocksniffer: () => ipcRenderer.send('launch-rocksniffer'),
    clearRocksnifferCache: () => ipcRenderer.send('clear-rocksniffer-cache'),
    getSrcDir: async () => ipcRenderer.invoke('get-src-dir'),
    info: (message: string) => ipcRenderer.send('info', message),
    warning: (message: string) => ipcRenderer.send('warning', message),
    error: (message: string) => ipcRenderer.send('error', message),
    getWindowSize: async () => ipcRenderer.invoke('get-window-size'),
    setWindowSize: async (width: number, height: number) => ipcRenderer.send('set-window-size', width, height),
    loadURL: async(url: string) => ipcRenderer.send('load-url', url),
    openExternalLink: (url: string) => ipcRenderer.send('open-external-link', url),
    getVersion: async () => ipcRenderer.invoke('get-version'),
    getHost: async () => ipcRenderer.invoke('get-host'),
    storeGet: async (key: string) => ipcRenderer.invoke('store-get', key),
    storeSet: async (key: string, value: string) => ipcRenderer.invoke('store-set', key, value),
    storeDelete: async (key: string) => ipcRenderer.invoke('store-delete', key),
    getPath: async (defaultPath: string) => ipcRenderer.invoke('get-path', defaultPath),
    directoryExists: async (path: string) => ipcRenderer.invoke('directory-exists', path),
    pathJoin: async (...args: string[]) => ipcRenderer.invoke('path-join', ...args),
    getFileTimestamp: async (path: string) => ipcRenderer.invoke('get-file-timestamp', path),
    readFile: async (file: string) => ipcRenderer.invoke('read-file', file),
    writeFile: async (file: string, contents: string) => ipcRenderer.invoke('write-file', file, contents),
    appendFile: async (file: string, contents: string) => ipcRenderer.invoke('append-file', file, contents),
    fileExists: async(file: string) => ipcRenderer.invoke('file-exists', file),
    waitForFile: async (file: string, timeout: number) => ipcRenderer.invoke('wait-for-file', file, timeout),
    semverValid: async (version: string) => ipcRenderer.invoke('semver-valid', version),
    semverGte: async (version1: string, version2: string) => ipcRenderer.invoke('semver-gte', version1, version2),
    semverMaxSatisfying: async (versions: string[], range: string) => ipcRenderer.invoke('semver-max-satisfying', versions, range),
    readRocksmithData: async (dataFile: string) => ipcRenderer.invoke('read-rocksmith-data', dataFile),
    getSteamProfiles: async (steamUserDataPath: string) => ipcRenderer.invoke('get-steam-profiles', steamUserDataPath),
    getRocksmithProfiles: async (steamUserDataPath: string, steamProfile: string) => ipcRenderer.invoke('get-rocksmith-profiles', steamUserDataPath, steamProfile),
    enableAddons: async (host: string, port: number) => ipcRenderer.send('enable-addons', host, port),
    disableAddons: async () => ipcRenderer.send('disable-addons'),
    windowResized: (callback: windowResizeCallback) => ipcRenderer.on('window-resized', (callback))
};

contextBridge.exposeInMainWorld('api', API);