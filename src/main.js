const { app, BrowserWindow, clipboard, dialog, ipcMain, shell, screen } = require('electron');
const Store = require('electron-store').default;
const aesjs = require('aes-js');
const http = require('http');
const path = require('path');
const openFileExplorer = require('open-file-explorer');
const fs = require('fs');
const glob = require('glob');
const semver = require('semver');
const { spawn } = require('child_process');
const { unzipSync } = require('node:zlib');
const { resolveRocksmithConfig } = require('./rocksmith-config');
const { createBackendClient, CONNECTION_MESSAGE } = require('./backend-client');
const { createDesktopUpdates, updatesEnabled } = require('./desktop-updates');
const { createSupportCheckout } = require('./support-checkout');
const { isSupportLocation } = require('./support-link');
const { restoreWindowState, trackWindowState, applyWindowSize } = require('./window-state');
const { MINIMUM_SIZE } = require('./window-size');
const { pathToFileURL } = require('node:url');
let supportCheckout = null;
let desktopUpdates = null;
let playing = false;
let lastGameplayReport = 0;

// Share status across page navigation without logging request bodies or credentials.
function broadcast(channel, state) {
    for (const window of BrowserWindow.getAllWindows()) {
        if (!window.isDestroyed()) window.webContents.send(channel, state);
    }
}

// Process input args
const { HOSTS, resolveBackend } = require('./backend-config');
const packageInfo = require('../package.json');
const backend = resolveBackend(process.argv.slice(app.isPackaged ? 1 : 2), packageInfo.rockBuddyBackend);
// Packaged assets and writable bundled helpers are relative to the install directory,
// including launches from Explorer, shortcuts, or another working directory.
if (app.isPackaged) process.chdir(path.dirname(app.getPath('exe')));
const host = backend.host;
const backendClient = createBackendClient(host, {
    onState: state => broadcast('connection-state', state),
});
const isCommunityBeta = packageInfo.rockBuddyBackend === 'beta';
const betaNotice = 'Rock Buddy Beta — Test scores and account changes stay here and will be discarded after testing.';

// Keep beta credentials and preferences separate even when launched from a shortcut.
if (isCommunityBeta) {
    const betaUserData = path.join(app.getPath('appData'), 'rock-buddy-beta');
    fs.mkdirSync(betaUserData, { recursive: true });
    app.setPath('userData', betaUserData);
    if (process.platform === 'win32') app.setAppUserModelId('com.rockbuddy.beta');
}

const currentVersion = packageInfo.version;
let onLatestVersion = false;

// Check if in dev environment
const isDev = !app.isPackaged || process.env.NODE_ENV === "development";

// Store for user config data
const store = new Store(backend.storeOptions);

// Define Rocksmith app ID
const rocksmithAppId = 221680;

// Variable to store Rocksniffer child process
let rocksnifferChildProcess = null;

// Purge log files older than 30 days
function purgeOldLogs() {
    const logRegex = /rock_buddy_log_\d{4}-\d{2}-\d{2}[.]txt$/;
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    try {
        const files = fs.readdirSync('.');
        files.forEach(file => {

            // Process all log files
            if (logRegex.test(file)) {

                // Remove logs older than 30 days
                const stats = fs.statSync(file);
                if (stats.mtime < thirtyDaysAgo) {
                    fs.unlinkSync(file);
                    console.log('Removed old log file: ' + file);
                }
            }
        })
    } catch (error) {
        console.error('Error purging old log files:', error);
    }
}

function logMessage(message) {
    let text = message;
    if (typeof message !== "string") {
        text = JSON.stringify(message);
    }

    const currentDate = new Date();
    const year = currentDate.getFullYear();
    const month = (currentDate.getMonth() + 1).toString().padStart(2, '0');
    const day = currentDate.getDate().toString().padStart(2, '0');
    const hours = currentDate.getHours().toString().padStart(2, '0');
    const minutes = currentDate.getMinutes().toString().padStart(2, '0');
    const seconds = currentDate.getSeconds().toString().padStart(2, '0');
    const formattedDate = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;

    fs.appendFileSync("rock_buddy_log_" + year + "-" + month + "-" + day + ".txt", formattedDate + ': ' + text + "\n");
}

// Keep updates on the installer-provided feed; source and custom-backend launches cannot update.
function checkForUpdates(win) {
    if (!updatesEnabled(app.isPackaged, process.platform, host, packageInfo.rockBuddyBackend, HOSTS)) return;
    const { autoUpdater } = require('electron-updater');
    desktopUpdates = createDesktopUpdates(autoUpdater, {
        version: currentVersion,
        allowBeta: () => {
            if (isCommunityBeta) return true;
            const id = store.get('auth_data')?.user_id;
            return id !== undefined && store.get(`user_data.${id}.beta_testing`) === true;
        },
        canInstall: async () => {
            if (backendClient.isBusy()) return false;
            // Recheck gameplay immediately before installing, including when Sniffer is not the open page.
            try {
                const configFile = path.join(process.cwd(), 'RockSniffer', 'config', 'addons.json');
                const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
                const response = await fetch(`http://127.0.0.1:${config.port || 9002}`, { signal: AbortSignal.timeout(1500) });
                const snapshot = await response.json();
                if (!response.ok || typeof snapshot.RocksmithFound !== 'boolean') return false;
                if (snapshot.RocksmithFound) {
                    if (!Number.isFinite(snapshot.memoryReadout?.songTimer)) return false;
                    if (snapshot.memoryReadout.songTimer > 0) return false;
                }
            } catch {
                // If the helper is running but unreadable, wait instead of risking a song interruption.
                if (playing || (rocksnifferChildProcess && rocksnifferChildProcess.exitCode === null)) return false;
            }
            return !(playing && Date.now() - lastGameplayReport < 2000) && !backendClient.isBusy();
        },
        onState: state => {
            if (state.status === 'error') logMessage(state.message);
            broadcast('update-state', state);
        },
        onLatest: latest => { onLatestVersion = latest; },
    });

    void desktopUpdates.check();
    const timer = setInterval(() => void desktopUpdates.check(), 4 * 60 * 60 * 1000);
    timer.unref();
    win.on('closed', () => clearInterval(timer));
}

// Initialize some app data
function init() {

    // purge old logs on startup
    purgeOldLogs();

    logMessage("");
    logMessage("Rock Buddy v" + currentVersion + " starting");
    logMessage("");

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
    if (!steamUserDataPath || !steamProfile) return profiles;
    const rocksmithDataFolder = path.join(steamUserDataPath, steamProfile.toString(), rocksmithAppId.toString(), 'remote');
    const localProfilesFile = path.join(rocksmithDataFolder, 'LocalProfiles.json');
    if (!fs.existsSync(localProfilesFile)) return profiles;

    // Read the localProfiles.json file to get the list of available profiles
    const localProfiles = readRocksmithData(localProfilesFile);
    if (!Array.isArray(localProfiles?.Profiles)) return profiles;
    localProfiles['Profiles'].forEach((profile) => {
        profiles[profile['PlayerName']] = profile['UniqueID'];
    });

    return profiles;
}

function getRocksnifferPath() {
    let rocksnifferPath = 'RockSniffer';
    if (isDev) {
        rocksnifferPath = 'RockSniffer/RockSniffer/bin/x64/Release/net8.0';
    }

    return rocksnifferPath;
}

// Creates the main window
function createWindow() {
    init();

    // Get screen width/height
    let screenWidth = 1024;
    let screenHeight = 768;
    let addonsEnabled = false;
    let addonsHost = 'localhost';
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
        if (savedAddonsEnabled !== undefined) {
            addonsEnabled = savedAddonsEnabled;
        }

        const savedAddonsHost = store.get('user_data.' + userId + '.addons_host');
        if (savedAddonsHost !== undefined) {
            addonsHost = savedAddonsHost;
        }

        const savedAddonsPort = store.get('user_data.' + userId + '.addons_port');
        if (savedAddonsPort !== undefined) {
            addonsPort = savedAddonsPort;
        }
    }

    // Use the old account dimensions once if this installation has no saved window state yet.
    const windowState = restoreWindowState(
        store.get('window_state') ?? { width: screenWidth, height: screenHeight },
        screen,
    );
    const { x, y, width, height } = windowState;
    const win = new BrowserWindow({
        x, y, width, height,
        minWidth: MINIMUM_SIZE.width,
        minHeight: MINIMUM_SIZE.height,
        show: false,
        webPreferences: {
            preload: path.join(__dirname, '..', 'dist', 'preload.js'),
            backgroundThrottling: false,
            ...backend.webPreferences
        },
        icon: path.join(__dirname, '..', 'images', 'favicon.ico')
    });

    trackWindowState(win, store, screen, windowState);
    win.once('ready-to-show', () => {
        if (windowState.maximized) {
            win.maximize();
        }
        win.show();
    });

    // Keep every page visibly labeled, including login and account screens.
    if (isCommunityBeta) {
        const title = `Rock Buddy Beta v${currentVersion}`;
        win.setTitle(title);
        win.on('page-title-updated', event => {
            event.preventDefault();
            win.setTitle(title);
        });
    }

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

    ipcMain.on('clear-rocksniffer-cache', (event) => {
        const rocksnifferPath = getRocksnifferPath();

        const pattern = rocksnifferPath + '/cache.sqlite*';

        try {
            const files = glob.sync(pattern, {});
            files.forEach((file) => {
                fs.unlinkSync(file);
            });
        }
        catch (error) {
            console.error('Failed to clear RockSniffer cache: ', error);
        }
    });

    ipcMain.handle('get-rocksniffer-path', (event) => {
        return getRocksnifferPath();
    });

    ipcMain.on('launch-rocksniffer', (event) => {
        const rocksnifferPath = getRocksnifferPath();

        // If Rocksniffer is already running leave it running
        if (rocksnifferChildProcess !== null) {
            return;
        }

        // Rebuild the rocksniffer addons config file
        let rocksnifferAddonConfig = {
            _NOTE: "Enabling addons will enable a local web server",
            enableAddons: true,
            ipAddress: "127.0.0.1",
            port: 9002,
            _NOTE2: "Serving addons through the local web server might be unsafe!",
            serveAddons: false
        };

        // Rebuild the rocksniffer rpc config file
        let rocksnifferRpcConfig = {
            "enabled": false,
            "updatePeriodMs": 1000,
            "client_id": "573253140682375193",
            "enableCoverArt": true
        };

        let useExternalRocksniffer = false;

        // Get saved user data
        const authData = store.get('auth_data');
        if (authData !== undefined) {
            const userId = authData['user_id'];

            // Addon settings
            const savedRocksnifferHost = store.get('user_data.' + userId + '.rocksniffer_host');
            if (savedRocksnifferHost !== undefined) {
                rocksnifferAddonConfig.ipAddress = savedRocksnifferHost;
            }

            const savedRocksnifferPort = store.get('user_data.' + userId + '.rocksniffer_port');
            if (savedRocksnifferPort !== undefined) {
                rocksnifferAddonConfig.port = savedRocksnifferPort;
            }

            // Discord rich presence
            const savedDiscordRichPresence = store.get('user_data.' + userId + '.discord_rich_presence');
            if (savedDiscordRichPresence !== undefined) {
                rocksnifferRpcConfig.enabled = savedDiscordRichPresence;
            }

            // Use external Rocksniffer
            const savedUseExternalRocksniffer = store.get('user_data.' + userId + '.use_external_rocksniffer');
            if (savedUseExternalRocksniffer !== undefined) {
                useExternalRocksniffer = savedUseExternalRocksniffer;
            }
        }

        const configPath = path.join(rocksnifferPath, 'config');

        // Update addon config
        const rocksnifferAddonConfigJSON = JSON.stringify(rocksnifferAddonConfig, null, 2);
        try {
            if (!fs.existsSync(configPath)) {
                fs.mkdirSync(configPath, { recursive: true });
            }
            fs.writeFileSync(path.join(configPath, 'addons.json'), rocksnifferAddonConfigJSON);
        }
        catch (error) {
            console.error('Failed to write rocksniffer addons config: ', error.message);
        }

        // Update rpc config
        const rocksnifferRpcConfigJSON = JSON.stringify(rocksnifferRpcConfig, null, 2);
        try {
            if (!fs.existsSync(configPath)) {
                fs.mkdirSync(configPath, { recursive: true });
            }
            fs.writeFileSync(path.join(configPath, 'rpc.json'), rocksnifferRpcConfigJSON);
        }
        catch (error) {
            console.error('Failed to write rocksniffer rpc config: ', error.message);
        }

        if (!useExternalRocksniffer) {
            console.log("Starting rocksniffer on " + rocksnifferAddonConfig.ipAddress + ":" + rocksnifferAddonConfig.port)
            rocksnifferChildProcess = spawn('RockSniffer.exe', [], { cwd: rocksnifferPath }, (error) => {
                if (error) {
                    console.error('Failed to start RockSniffer: ', error);
                }
            });

            // DO NOT REMOVE THESE LINES
            // Ignore stdout/stderr (the info is logged)
            // For some reason RockSniffer enumeration will hang without these lines
            // I suspect that the process may be filling its STDOUT buffer and these lines allow it to clear the buffer?
            rocksnifferChildProcess.stdout.on('data', (data) => { });
            rocksnifferChildProcess.stderr.on('data', (data) => { });
        }
    });

    ipcMain.handle('on-latest-beta-version', (event) => {
        const authData = store.get('auth_data');
        let betaTesting = false;
        if (authData !== undefined) {
            const userId = authData['user_id'];
            betaTesting = store.get('user_data.' + userId + '.beta_testing');
        }

        if (betaTesting) {
            return onLatestVersion;
        }
        else {
            return false;
        }
    })

    ipcMain.handle('get-src-dir', (event) => {
        return __dirname;
    });

    ipcMain.on('log-message', (event, message) => {
        logMessage(message);
    })

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
        if (message === CONNECTION_MESSAGE) return;
        dialog.showMessageBox({
            type: 'error',
            message: message,
            buttons: ['OK']
        });
    });

    ipcMain.on('open-external-link', async (event, url) => {
        try {
            await shell.openExternal(url);
        } catch {
            // Let users copy the contact address when their email app cannot open.
            const email = typeof url === 'string' && url.startsWith('mailto:')
                ? url.slice('mailto:'.length).split('?')[0]
                : null;
            const { response } = await dialog.showMessageBox({
                type: 'error',
                message: email ? 'Could not open your email app.' : 'Could not open this link.',
                detail: email || 'Please try again.',
                buttons: email ? ['Copy email address', 'Close'] : ['OK'],
                cancelId: email ? 1 : 0,
            });

            if (email && response === 0) clipboard.writeText(email);
        }
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

    // Get a path on the system
    ipcMain.handle('get-sfx-file-path', async (event, defaultPath) => {
        const result = await dialog.showOpenDialog({
            properties: ['openFile'],
            filters: [
                { name: 'Audio Files', extensions: ['mp3', 'wav'] }
            ],
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

    // Get the timestamp of a file
    ipcMain.handle('get-file-timestamp', (event, path) => {
        try {
            const stats = fs.statSync(path);
            return stats.mtime.getTime();
        }
        catch (error) {
            console.error(error);
            return null;
        }
    });

    // Read a directory and return the contents
    ipcMain.handle('read-dir', (event, dir) => {
        try {
            return fs.readdirSync(dir);
        } catch (error) {
            console.error(error);
            return null;
        }
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

    // Append to a file
    ipcMain.handle('append-file', (event, file, contents) => {
        fs.appendFileSync(file, contents);
    });

    // Check if a file exists
    ipcMain.handle('file-exists', (event, file) => {
        return fs.existsSync(file);
    })

    // Wait for a file to exist (return false on timeout)
    ipcMain.handle('wait-for-file', (event, file, timeout) => {
        const startTime = Date.now();
        let fileExists = fs.existsSync(file);

        while (!fileExists && Date.now() - startTime < timeout) {
            fileExists = fs.existsSync(file);
        }

        return fileExists;
    });

    // Semver validation
    ipcMain.handle('semver-valid', (event, version) => {
        return semver.valid(version);
    });

    // Semver check
    ipcMain.handle('semver-gte', (event, version1, version2) => {
        return semver.gte(version1, version2);
    });

    // Get max semver in range
    ipcMain.handle('semver-max-satisfying', (event, versions, range) => {
        return semver.maxSatisfying(versions, range);
    });

    // Reads an encrypted Rocksmith data file and returns the contents
    ipcMain.handle('read-rocksmith-data', (event, dataFile) => {
        return readRocksmithData(dataFile);
    });

    // Gets a map of Steam profiles and their corresponding folder names
    ipcMain.handle('resolve-rocksmith-config', () => {
        return resolveRocksmithConfig(store, store.get('auth_data')?.user_id, getSteamProfiles, getRocksmithProfiles);
    });

    ipcMain.handle('get-steam-profiles', (event, steamUserDataPath) => {
        return getSteamProfiles(steamUserDataPath);
    });

    // Gets a map of Rocksmith profiles and their corresponding file names
    ipcMain.handle('get-rocksmith-profiles', (event, steamUserDataPath, steamProfile) => {
        return getRocksmithProfiles(steamUserDataPath, steamProfile);
    });

    let enableAddons = (event, host, port) => {
        server.on('error', (error) => {
            console.log("Server error: " + error);
        });

        // Serve the content of your Electron window via the HTTP server
        server.listen(port, host, () => {
            console.log('Server running on ' + host + ':' + port);
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
    }

    ipcMain.on('open-addons-folder', (event) => {
        if (isDev) {
            dialog.showMessageBox({
                type: 'warning',
                message: "Addons folder doesn't exist until Rock Buddy installer is run.",
                buttons: ['OK']
            });
            return;
        }

        openFileExplorer('addons');
    });

    ipcMain.on('enable-addons', enableAddons);

    ipcMain.on('disable-addons', (event) => {
        if (captureInterval !== null) {
            clearInterval(captureInterval);
            captureInterval = null;
        }

        if (server.listening) {
            console.log("Addons server stopped.");
            server.close();
        }
    });

    if (addonsEnabled) {
        enableAddons(null, addonsHost, addonsPort);
    }

    win.loadFile('src/index.html');

    checkForUpdates(win);
}

ipcMain.handle('backend-post', (_event, url, data) => backendClient.post(url, data));
ipcMain.handle('get-connection-state', () => backendClient.getState());

// Window controls operate on the requesting window, not account-specific settings.
ipcMain.handle('get-window-size', event => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) throw new Error('The window is no longer available.');
    const { width, height } = win.getNormalBounds();
    return { width, height };
});
ipcMain.handle('set-window-size', (event, size) =>
    applyWindowSize(BrowserWindow.fromWebContents(event.sender), size?.width, size?.height));
ipcMain.handle('get-update-state', () => desktopUpdates?.getState() || { status: 'disabled', message: 'Updates are available in installed Windows builds.' });
// The changelog uses the same guarded check as the automatic schedule.
ipcMain.handle('check-desktop-update', () => desktopUpdates?.check() || { status: 'disabled', message: 'Updates are available in installed Windows builds.' });
ipcMain.handle('install-desktop-update', () => desktopUpdates?.install());
// Checkout is available only while the bundled app's support dialog is open.
const appPage = pathToFileURL(path.join(__dirname, 'index.html')).href;
let supportSession = null;
function supportClient(event, session) {
    if (!isSupportLocation(event.senderFrame?.url || 'about:blank', appPage)) {
        throw new Error('Open Support Rock Buddy first.');
    }
    if (session && session !== supportSession) {
        supportSession = session;
        supportCheckout = null;
    }
    supportCheckout ??= createSupportCheckout(host, HOSTS, { openExternal: url => shell.openExternal(url) });
    return supportCheckout;
}
ipcMain.handle('support-info', (event, session) => supportClient(event, session).info());
ipcMain.handle('support-checkout', (event, input) => supportClient(event).start(input));
ipcMain.handle('support-manage', event => supportClient(event).manage());
ipcMain.on('gameplay-state', (_event, active) => {
    playing = active === true;
    lastGameplayReport = Date.now();
});

ipcMain.handle('get-beta-notice', () => isCommunityBeta ? betaNotice : null);

app.on('ready', createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
