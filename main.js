const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const Store = require('electron-store');
const path = require('path');
const fs = require('fs');

// Process input args
const args = process.argv.slice(2);
const host = args[0] || 'https://rock-buddy.com';

// Store for user config data
const store = new Store();

// Creates the main window
function createWindow() {
  const win = new BrowserWindow({
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
    icon: path.join(__dirname, 'images/favicon.ico')
  });

  // Hide the menu bar
  win.setMenuBarVisibility(false);

  ipcMain.on('info', (event, message) => {
    dialog.showMessageBox({
      type: 'info',
      message: message,
      buttons: ['OK']
    });
  });

  ipcMain.on('warning', (event, message) => {
    dialog.showMessageBox({
      type: 'warning',
      message: message,
      buttons: ['OK']
    });
  });

  ipcMain.on('error', (event, message) => {
    dialog.showMessageBox({
      type: 'error',
      message: message,
      buttons: ['OK']
    });
  });

  ipcMain.handle('get-host', (event) => {
    return host;
  })

  // Get user authentication data
  ipcMain.handle('get-auth-data', (event) => {
    const authData = store.get('auth');
    if (authData === undefined) {
      return null;
    }

    return authData;
  });

  // Set user authentication data
  ipcMain.handle('set-auth-data', (event, authData) => {
    store.set('auth', authData);
  });

  // Open a webpage in the browser
  ipcMain.handle('delete-auth-data', (event) => {
    store.delete('auth');
  })

  win.loadFile('src/index.html');
}

app.on('ready', createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
})