import type { ConnectionState, DesktopUpdateState } from './ui/desktop-state';

const { contextBridge, ipcRenderer } = require('electron');

// Expose only state data, never the Electron event object, to renderer components.
function subscribe<State>(channel: string, callback: (state: State) => void) {
    const listener = (_event: unknown, state: State) => callback(state);
    ipcRenderer.on(channel, listener);
    return () => { ipcRenderer.removeListener(channel, listener); };
}

export const API = {
    getWindowSize: (): Promise<{ width: number; height: number }> => ipcRenderer.invoke('get-window-size'),
    setWindowSize: (size: { width: number; height: number }): Promise<{ width: number; height: number }> => ipcRenderer.invoke('set-window-size', size),
    getBetaNotice: (): Promise<string | null> => ipcRenderer.invoke('get-beta-notice'),
    getUpdateState: (): Promise<DesktopUpdateState> => ipcRenderer.invoke('get-update-state'),
    checkDesktopUpdate: (): Promise<DesktopUpdateState> => ipcRenderer.invoke('check-desktop-update'),
    onUpdateState: (callback: (state: DesktopUpdateState) => void) => subscribe('update-state', callback),
    installDesktopUpdate: (): Promise<DesktopUpdateState | undefined> => ipcRenderer.invoke('install-desktop-update'),
    getConnectionState: (): Promise<ConnectionState> => ipcRenderer.invoke('get-connection-state'),
    onConnectionState: (callback: (state: ConnectionState) => void) => subscribe('connection-state', callback),
    supportInfo: (session?: string): Promise<{ sandbox: boolean }> => ipcRenderer.invoke('support-info', session),
    startSupportCheckout: (input: { amount: string; kind: 'once' | 'monthly' }): Promise<{ opened?: boolean; error?: string }> => ipcRenderer.invoke('support-checkout', input),
    manageSupport: (): Promise<void> => ipcRenderer.invoke('support-manage'),
    requestBackend: async (url: string, data: any) => ipcRenderer.invoke('backend-post', url, data),
    setGameplayActive: (active: boolean) => ipcRenderer.send('gameplay-state', active),
    getRocksnifferPath: () => ipcRenderer.invoke('get-rocksniffer-path'),
    launchRocksniffer: () => ipcRenderer.send('launch-rocksniffer'),
    clearRocksnifferCache: () => ipcRenderer.send('clear-rocksniffer-cache'),
    onLatestBetaVersion: async () => ipcRenderer.invoke('on-latest-beta-version'),
    getSrcDir: async () => ipcRenderer.invoke('get-src-dir'),
    logMessage: async (message: string) => ipcRenderer.send('log-message', message),
    info: (message: string) => ipcRenderer.send('info', message),
    warning: (message: string) => ipcRenderer.send('warning', message),
    error: (message: string) => ipcRenderer.send('error', message),
    openExternalLink: (url: string) => ipcRenderer.send('open-external-link', url),
    getVersion: async () => ipcRenderer.invoke('get-version'),
    getHost: async () => ipcRenderer.invoke('get-host'),
    storeGet: async (key: string) => ipcRenderer.invoke('store-get', key),
    storeSet: async (key: string, value: any) => ipcRenderer.invoke('store-set', key, value),
    storeDelete: async (key: string) => ipcRenderer.invoke('store-delete', key),
    getPath: async (defaultPath: string) => ipcRenderer.invoke('get-path', defaultPath),
    getSFXFilePath: async (defaultPath: string) => ipcRenderer.invoke('get-sfx-file-path', defaultPath),
    directoryExists: async (path: string) => ipcRenderer.invoke('directory-exists', path),
    pathJoin: async (...args: string[]) => ipcRenderer.invoke('path-join', ...args),
    getFileTimestamp: async (path: string) => ipcRenderer.invoke('get-file-timestamp', path),
    readDir: async (dir: string) => ipcRenderer.invoke('read-dir', dir),
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
    resolveRocksmithConfig: async () => ipcRenderer.invoke('resolve-rocksmith-config'),
    getRocksmithProfiles: async (steamUserDataPath: string, steamProfile: string) => ipcRenderer.invoke('get-rocksmith-profiles', steamUserDataPath, steamProfile),
    openAddonsFolder: async () => ipcRenderer.send('open-addons-folder'),
    enableAddons: async (host: string, port: number) => ipcRenderer.send('enable-addons', host, port),
    disableAddons: async () => ipcRenderer.send('disable-addons'),

};

contextBridge.exposeInMainWorld('api', API);
