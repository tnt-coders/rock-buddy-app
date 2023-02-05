const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  info: (message) => ipcRenderer.send('info', message),
  warning: (message) => ipcRenderer.send('warning', message),
  error: (message) => ipcRenderer.send('error', message),
  getHost: async () => ipcRenderer.invoke('get-host'),
  getAuthData: async () => ipcRenderer.invoke('get-auth-data'),
  setAuthData: async (authData) => ipcRenderer.invoke('set-auth-data', authData)
});

  //openInBrowser: (url) => ipcRenderer.send('open-in-browser', url)