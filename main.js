const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const Store = require('electron-store');
const path = require('path');
const fs = require('fs');
const aesjs = require('aes-js');
const { unzipSync } = require('node:zlib');

// Process input args
const args = process.argv.slice(2);
const host = args[0] || 'https://rock-buddy.com';

// Store for user config data
const store = new Store();

// Initialize some app data
function init() {

  // Set Steam user data path to the system default location
  const steamUserDataPath = store.get('steam_user_data_path');
  if (steamUserDataPath === undefined) {
    if (process.platform === 'win32') {
      store.set('steam_user_data_path', 'C:\\Program Files (x86)\\Steam\\userdata\\');
    }
    else if (process.platform === 'darwin') {
      store.set('steam_user_data_path', '~/Library/Application Support/Steam/userdata/');
    }
  }
}

// Reads data from an encrypted Rocksmith data file
function readRocksmithData(dataFile) {
  // I would hide this key, but it's already been leaked to the public long ago lol
  const key = Buffer.from('\x72\x8B\x36\x9E\x24\xED\x01\x34\x76\x85\x11\x02\x18\x12\xAF\xC0\xA3\xC2\x5D\x02\x06\x5F\x16\x6B\x4B\xCC\x58\xCD\x26\x44\xF2\x9E', 'ascii');

  let saveFile = fs.readFileSync(dataFile, { encoding: null });
  saveFile = saveFile.slice(20);

  const aesEcb = new aesjs.ModeOfOperation.ecb(key);
  const decrypted = aesEcb.decrypt(saveFile);

  const unzipped = unzipSync(decrypted);
  const text = unzipped.toString('utf8').slice(0, -1);

  return JSON.parse(text);
}

// Creates the main window
function createWindow() {
  init();

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
  });

  // Get persistent data
  ipcMain.handle('store-get', (event, key) => {
    const data = store.get(key);
    if (data === undefined) {
      return null;
    }

    return data;
  });

  // Set persistent data
  ipcMain.handle('store-set', (event, key, value) => {
    store.set(key, value);
  });

  // Delete persistent data
  ipcMain.handle('store-delete', (event, key) => {
    store.delete(key);
  });

  // Get a path on the system
  ipcMain.handle('get-path', async (event, defaultPath) => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      defaultPath: defaultPath
    });
    if (result.canceled) {
      return null;
    }

    return result.filePaths[0];
  });

  // Reads an encrypted Rocksmith data file and returns the contents
  ipcMain.handle('read-rocksmith-data', (event, dataFile) => {
    return readRocksmithData(dataFile);
  });

  win.loadFile('src/index.html');
}

app.on('ready', createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
})