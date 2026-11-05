const semver = require('semver');

// Only installed Windows apps using their intended server may install updates.
function updatesEnabled(packaged, platform, host, packagedBackend, hosts) {
    const channel = packagedBackend || 'production';
    return packaged && platform === 'win32' && ['production', 'beta'].includes(channel) && host === hosts[channel];
}

// Download in the background, but install only after an explicit click outside gameplay.
function createDesktopUpdates(updater, { version, allowBeta, canInstall, onState, onLatest = () => {} }) {
    let state = { status: 'idle', message: '', version: null, percent: 0 };
    let checking = false;
    let checkedBetas = false;
    let installing = false;

    // Merge the update status and notify the renderer.
    function publish(patch) {
        state = { ...state, ...patch };
        onState(state);
    }

    // Keep an already downloaded update available if the restart attempt fails.
    function failed() {
        if (state.status === 'installing') {
            publish({ status: 'ready', message: 'Could not restart Rock Buddy. Please try again.' });
            return;
        }
        publish({ status: 'error', message: 'Could not update Rock Buddy. Try again later.' });
    }

    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = false;
    updater.allowDowngrade = false;
    updater.logger = null;

    updater.on('checking-for-update', () => publish({ status: 'checking', message: 'Checking for updates…' }));
    updater.on('update-not-available', () => {
        // Stable-only checks cannot confirm that no newer beta exists.
        onLatest(checkedBetas && allowBeta());
        publish({ status: 'idle', message: 'Rock Buddy is up to date.', version: null, percent: 0 });
    });

    updater.on('update-available', info => {
        // Never install a downgrade or an opted-out prerelease, even if feed metadata is wrong.
        const valid = semver.valid(info.version) && semver.gt(info.version, version);
        if (!valid || (semver.prerelease(info.version) && !allowBeta())) {
            publish({ status: 'idle', message: 'No newer update is available.' });
            return;
        }

        onLatest(false);
        publish({ status: 'downloading', message: 'Downloading update…', version: info.version, percent: 0 });
        updater.downloadUpdate().catch(failed);
    });

    updater.on('download-progress', progress => {
        publish({ status: 'downloading', percent: Math.max(0, Math.min(100, progress.percent || 0)) });
    });
    updater.on('update-downloaded', info => {
        publish({ status: 'ready', message: 'Update ready.', version: info.version, percent: 100 });
    });
    updater.on('error', failed);

    // Scheduled checks share a lock so they cannot start duplicate downloads.
    async function check() {
        if (checking || installing || ['downloading', 'ready', 'installing'].includes(state.status)) return state;
        checking = true;
        checkedBetas = allowBeta();
        updater.allowPrerelease = checkedBetas;
        updater.allowDowngrade = false;
        try { await updater.checkForUpdates(); } catch { failed(); }
        finally { checking = false; }
        return state;
    }

    // Check that gameplay and uploads are idle before handing control to the installer.
    async function install() {
        if (installing || state.status !== 'ready') return state;
        installing = true;
        try {
            if (!await canInstall()) {
                publish({ message: 'Finish playing and wait for score uploads before restarting.' });
                return state;
            }
            publish({ status: 'installing', message: 'Restarting Rock Buddy…' });
            updater.quitAndInstall(false, true);
        } catch {
            // Keep the downloaded update available after an installation failure.
            publish({ status: 'ready', message: 'Could not restart Rock Buddy. Please try again.' });
        }
        finally { installing = false; }
        return state;
    }

    return { check, install, getState: () => state };
}

module.exports = { createDesktopUpdates, updatesEnabled };
