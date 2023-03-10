const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const isDev = require('electron-is-dev');
const Store = require('electron-store');
const http = require('http');
const path = require('path');
const fs = require('fs');
const aesjs = require('aes-js');
const { unzipSync } = require('node:zlib');

// Process input args
const args = process.argv.slice(2);
const host = args[0] || 'https://rock-buddy.com';

// Store for user config data
const store = new Store();

// Define Rocksmith app ID
const rocksmithAppId = 221680;

// Define a cache variable
let cache = {};

function cacheGet(key) {
  if (key in cache) {
    return cache[key];
  }
  return null;
}

function cacheSet(key, value) {
  cache[key] = value;
}

// Initialize some app data
function init() {

  // Set Steam user data path to the system default location
  const steamUserDataPath = store.get('default_steam_user_data_path');
  if (steamUserDataPath === undefined) {
    if (process.platform === 'win32') {
      store.set('default_steam_user_data_path', 'C:\\Program Files (x86)\\Steam\\userdata');
    }
    else if (process.platform === 'darwin') {
      store.set('default_steam_user_data_path', '~/Library/Application Support/Steam/userdata');
    }
  }
}

// Reads data from an encrypted Rocksmith data file
function readRocksmithData(dataFile) {
  // I would hide this key, but it's already been leaked to the public long ago lol
  const key = Buffer.from('\x72\x8B\x36\x9E\x24\xED\x01\x34\x76\x85\x11\x02\x18\x12\xAF\xC0\xA3\xC2\x5D\x02\x06\x5F\x16\x6B\x4B\xCC\x58\xCD\x26\x44\xF2\x9E', 'ascii');

  try {
    let saveFile = fs.readFileSync(dataFile, { encoding: null });
    saveFile = saveFile.slice(20);

    const aesEcb = new aesjs.ModeOfOperation.ecb(key);
    const decrypted = aesEcb.decrypt(saveFile);

    const unzipped = unzipSync(decrypted);
    const text = unzipped.toString('utf8').slice(0, -1);

    return JSON.parse(text);
  } catch (error) {
    console.error(error);
    return null;
  }
}

function getSteamProfiles(steamUserDataPath) {
  let profiles = {};
  try {
    const paths = fs.readdirSync(steamUserDataPath);
    paths.forEach((profileNumber) => {
      // Get the users local config file
      const localConfig = path.join(steamUserDataPath, profileNumber, 'config', 'localconfig.vdf');
      if (fs.existsSync(localConfig)) {
        // Extract the username from the local config file
        try {
          const content = fs.readFileSync(localConfig, 'utf-8');
          const regex = /"PersonaName"\s+"([^"]+)"/;
          const match = content.match(regex);
          if (match) {
            profiles[match[1]] = profileNumber;
          } else {
            throw new Error(`\nInvalid format for config file '${config_file}'\n`);
          }
        } catch (error) {
          console.error(error)
        }
      }
    });
    return profiles;
  } catch (error) {
    console.error(error);
    return {};
  }
}

function getRocksmithProfiles(steamUserDataPath, steamProfile) {
  let profiles = {};
  const rocksmithDataFolder = path.join(steamUserDataPath, steamProfile.toString(), rocksmithAppId.toString(), 'remote');
  const localProfilesFile = path.join(rocksmithDataFolder, 'LocalProfiles.json');

  // Read the localProfiles.json file to get the list of available profiles
  const localProfiles = readRocksmithData(localProfilesFile);
  localProfiles['Profiles'].forEach((profile) => {
    profiles[profile['PlayerName']] = profile['UniqueID'];
  });

  return profiles;
}

function checkForNewRocksmithProfileData(steamUserDataPath, steamProfile, rocksmithProfile) {
  const rocksmithProfilePath = path.join(steamUserDataPath, steamProfile.toString(), rocksmithAppId.toString(), 'remote', rocksmithProfile + '_PRFLDB');

  try {
    const stats = fs.statSync(rocksmithProfilePath);

    // If the file timestamp has not changed return false
    const rocksmithProfileTimestamp = cacheGet('rocksmith_profile_timestamp');
    if (rocksmithProfileTimestamp !== null) {
      if (stats.mtime.getTime() === rocksmithProfileTimestamp.getTime()) {
        return false;
      }
    }

    // Timestamps didn't match, cache the new timestamp and return true
    cacheSet('rocksmith_profile_timestamp', stats.mtime);
    return true;
  }
  catch (error) {
    console.error(error);
    return false;
  }
}

function getRocksmithProfileData(steamUserDataPath, steamProfile, rocksmithProfile) {
  const rocksmithProfilePath = path.join(steamUserDataPath, steamProfile.toString(), rocksmithAppId.toString(), 'remote', rocksmithProfile + '_PRFLDB');
  return readRocksmithData(rocksmithProfilePath);
}

// Creates the main window
function createWindow() {
  init();

  // Get screen width/height
  let screenWidth = 1024;
  let screenHeight = 768;
  let addonsEnabled = false;
  let addonsPort = 9001;

  const authData = store.get('auth_data');
  if (authData !== undefined) {
    const userId = authData['user_id'];

    const savedScreenWidth = store.get('user_data.' + userId + '.screen_width');
    const savedScreenHeight = store.get('user_data.' + userId + '.screen_height');
    if (savedScreenWidth !== undefined && savedScreenHeight !== undefined) {
      screenWidth = savedScreenWidth;
      screenHeight = savedScreenHeight;
    }

    const savedAddonsEnabled = store.get('user_data.' + userId + '.addons_enabled');
    const savedAddonsPort = store.get('user_data.' + userId + '.addons_port');
    if (savedAddonsEnabled !== undefined && savedAddonsPort !== undefined) {
      addonsEnabled = savedAddonsEnabled;
      addonsPort = savedAddonsPort;
    }
  }

  const win = new BrowserWindow({
    width: screenWidth,
    height: screenHeight,
    webPreferences: {
      preload: path.join(__dirname, '..', 'dist', 'preload.js'),
      backgroundThrottling: false
    },
    icon: path.join(__dirname, '..', 'images', 'favicon.ico')
  });

  let resizeTimer;
  win.on('resize', () => {
    const { width, height } = win.getBounds();

    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      win.webContents.send('window-resized', width, height);
    }, 500);
  });

  // Hide the menu bar
  win.setMenuBarVisibility(false);

  // Addon web server setup
  let serverResponse = null;
  let captureInterval = null;

  // Start an HTTP server within your Electron app
  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.writeHead(200, { 'Content-Type': 'text/html' });
    serverResponse = res; // store the response object for later updates
  });

  // Clear the interval when the window is closed to prevent errors
  win.on('close', () => {
    if (captureInterval !== null) {
      clearInterval(captureInterval);
    }

    server.close();
  });

  ipcMain.handle('get-src-dir', (event) => {
    return __dirname;
  });

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

  ipcMain.handle('get-window-size', (event) => {
    return win.getBounds();
  });

  ipcMain.on('set-window-size', (event, width, height) => {
    win.setBounds({
      width: parseInt(width),
      height: parseInt(height)
    });
  });

  ipcMain.on('open-external-link', (event, url) => {
    shell.openExternal(url);
  });

  ipcMain.handle('get-version', (event) => {
    return require('../package.json').version;
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

  // Check if a directory exists
  ipcMain.handle('directory-exists', async (event, path) => {
    try {
      return fs.statSync(path).isDirectory();
    } catch {
      return false;
    }
  });

  ipcMain.handle('path-join', async (event, ...args) => {
    return path.join(...args);
  });

  // Read a file and return the contents
  ipcMain.handle('read-file', (event, file) => {
    try {
      return fs.readFileSync(file, 'utf-8');
    } catch (error) {
      console.error(error);
      return null;
    }
  });

  // Write a file
  ipcMain.handle('write-file', (event, file, contents) => {
    fs.writeFileSync(file, contents);
  });

  // Semver check
  ipcMain.handle('semver-gte', (event, version1, version2) => {
    const semver = require('semver');
    return semver.gte(version1, version2);
  });

  // Reads an encrypted Rocksmith data file and returns the contents
  ipcMain.handle('read-rocksmith-data', (event, dataFile) => {
    return readRocksmithData(dataFile);
  });

  // Gets a map of Steam profiles and their corresponding folder names
  ipcMain.handle('get-steam-profiles', (event, steamUserDataPath) => {
    return getSteamProfiles(steamUserDataPath);
  });

  // Gets a map of Rocksmith profiles and their corresponding file names
  ipcMain.handle('get-rocksmith-profiles', (event, steamUserDataPath, steamProfile) => {
    return getRocksmithProfiles(steamUserDataPath, steamProfile);
  });

  // Check for new rocksmith profile data
  ipcMain.handle('check-for-new-rocksmith-profile-data', (event, steamUserDataPath, steamProfile, rocksmithProfile) => {
    return checkForNewRocksmithProfileData(steamUserDataPath, steamProfile, rocksmithProfile);
  });

  // Get Rocksmith profile data
  ipcMain.handle('get-rocksmith-profile-data', (event, steamUserDataPath, steamProfile, rocksmithProfile) => {
    return getRocksmithProfileData(steamUserDataPath, steamProfile, rocksmithProfile);
  });

  let enableAddons = (event, port) => {
    // Serve the content of your Electron window via the HTTP server
    server.listen(port, 'localhost', () => {
      console.log('Server running on http://localhost:' + port);
    });

    if (captureInterval !== null) {
      clearInterval(captureInterval);
      captureInterval = null;
    }

    // Use the webContents object to send updates from your Electron app to the web page
    captureInterval = setInterval(() => {
      win.webContents.capturePage().then((image) => {
        if (serverResponse !== null) {
          serverResponse.write(image.toDataURL());
          serverResponse.end();
        }
      }).catch((error) => {
        console.error(error);
        if (serverResponse !== null) {
          serverResponse.end();
        }
      });
    }, 100);
  };

  ipcMain.on('enable-addons', enableAddons);

  ipcMain.on('disable-addons', (event) => {
    if (captureInterval !== null) {
      clearInterval(captureInterval);
      captureInterval = null;
    }

    if (server.listening) {
      server.close();
    }
  });

  if (addonsEnabled) {
    enableAddons(null, addonsPort);
  }

  win.loadFile('src/index.html');
}

app.on('ready', createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
})