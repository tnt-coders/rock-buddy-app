// Runs on a disposable Windows CI runner, against the actual NSIS installation.
const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createCipheriv } = require('node:crypto');
const { deflateSync } = require('node:zlib');
const { extractFile, listPackage } = require('@electron/asar');
const { HOSTS } = require('../src/backend-config');
const yaml = require('js-yaml');
const target = process.env.ROCK_BUDDY_PACKAGE_TARGET || (process.argv.includes('--beta') ? 'beta' : 'staging');
assert.ok(['beta', 'staging', 'production-beta', 'production'].includes(target));
const beta = target === 'beta';
const production = target.startsWith('production');
const channel = production ? 'production' : target;
const product = beta ? 'Beta' : 'Staging';

(async () => {
    assert.equal(process.platform, 'win32');
    const out = path.resolve(`release/${target}`);
    const installers = fs.readdirSync(out).filter(name => name.endsWith('-Setup.exe'));
    assert.equal(installers.length, 1, 'Exactly one installer expected');
    const install = path.join(os.tmpdir(), `rock-buddy-${channel}-smoke`);
    const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
        '$p = Start-Process -FilePath $env:SMOKE_INSTALLER -ArgumentList @("/S", "/D=$env:SMOKE_INSTALL_DIR") -Wait -PassThru; exit $p.ExitCode',
    ], { timeout: 120000, stdio: 'inherit', env: { ...process.env, SMOKE_INSTALLER: path.join(out, installers[0]), SMOKE_INSTALL_DIR: install } });
    if (result.status !== 0) {
        spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
            'Get-WinEvent -FilterHashtable @{LogName="Application"; StartTime=(Get-Date).AddMinutes(-3)} -ErrorAction SilentlyContinue | Where-Object {$_.Message -like "*Rock-Buddy-Staging*"} | Select-Object -First 3 -ExpandProperty Message',
        ], { stdio: 'inherit', timeout: 15000 });
    }
    assert.equal(result.status, 0, 'NSIS install must succeed');
    const asar = path.join(install, 'resources/app.asar');
    const metadata = JSON.parse(extractFile(asar, 'package.json'));
    assert.equal(metadata.name, production ? 'rock-buddy' : `rock-buddy-${channel}`);
    assert.equal(metadata.rockBuddyBackend, channel);
    assert.ok(!listPackage(asar).some(file => /(?:\.private|\.env|rock_buddy_log|node_modules\/\.cache)/.test(file)));

    const updateFeed = yaml.load(fs.readFileSync(path.join(install, 'resources/app-update.yml'), 'utf8'));
    if (production) {
        assert.equal(updateFeed.provider, 'github');
        assert.equal(updateFeed.owner, 'tnt-coders');
        assert.equal(updateFeed.repo, 'rock-buddy-app');
    } else if (beta) {
        assert.equal(updateFeed.provider, 'generic');
        assert.equal(updateFeed.url, 'https://github.com/Jamesllllllllll/rock-buddy-app/releases/download/desktop-beta/');
    }

    // The Linux song preview must never replace real gameplay in an installer.
    assert.equal(metadata.main, './src/main.js');
    assert.ok(!listPackage(asar).some(file => /(?:song-preview|[/\\]\.generated[/\\])/.test(file)));
    const renderer = extractFile(asar, path.join('dist', 'ui', 'bundle.js')).toString('utf8');
    for (const marker of ['PreviewLead', 'PreviewPlayer', 'PreviewRhythm', 'song-preview']) {
        assert.ok(!renderer.includes(marker), `Preview code must not ship: ${marker}`);
    }

    for (const file of ['RockSniffer.exe', 'coreclr.dll', 'hostfxr.dll']) {
        assert.ok(fs.existsSync(path.join(install, 'RockSniffer', file)), `Bundled runtime: ${file}`);
    }
    const productionConfig = path.join(process.env.APPDATA, 'rock-buddy/config.json');
    fs.mkdirSync(path.dirname(productionConfig), { recursive: true });
    const sentinel = JSON.stringify({ stagingSmokeSentinel: true });
    fs.writeFileSync(productionConfig, sentinel);
    // Synthetic Steam/Rocksmith files exercise discovery through the installed preload/main IPC.
    const steamRoot = path.join(os.tmpdir(), 'rock-buddy-smoke-steam');
    const remote = path.join(steamRoot, '100', '221680', 'remote');
    fs.mkdirSync(remote, { recursive: true });
    fs.mkdirSync(path.join(steamRoot, '100', 'config'), { recursive: true });
    fs.writeFileSync(path.join(steamRoot, '100', 'config', 'localconfig.vdf'), '"PersonaName" "CI Player"');
    const compressed = deflateSync(JSON.stringify({ Profiles: [{ PlayerName: 'CI Profile', UniqueID: 'ci-profile' }] }) + '\0');
    const padded = Buffer.alloc(Math.ceil(compressed.length / 16) * 16);
    compressed.copy(padded);
    // Public Rocksmith save-format key, already used by the original desktop reader.
    const cipher = createCipheriv('aes-256-ecb', Buffer.from('728b369e24ed0134768511021812afc0a3c25d02065f166b4bcc58cd2644f29e', 'hex'), null);
    cipher.setAutoPadding(false);
    fs.writeFileSync(path.join(remote, 'LocalProfiles.json'), Buffer.concat([Buffer.alloc(20), cipher.update(padded), cipher.final()]));
    fs.writeFileSync(path.join(remote, 'ci-profile_PRFLDB'), 'synthetic profile placeholder');
    const executable = production ? 'rock-buddy.exe' : `RockBuddy${product}.exe`;
    const child = spawn(path.join(install, executable), ['--remote-debugging-port=9333'], {
        cwd: os.tmpdir(), stdio: 'ignore',
    });
    let socket;
    try {
        let target;
        for (let i = 0; i < 60; i++) {
            if (child.exitCode !== null) throw new Error(`Installed app exited: ${child.exitCode}`);
            try {
                const targets = await (await fetch('http://127.0.0.1:9333/json/list', { signal: AbortSignal.timeout(1000) })).json();
                // Wait for startup's auth redirect before changing synthetic local settings.
                target = targets.find(page => page.type === 'page' && page.url.startsWith('file:') && page.url.endsWith('/index.html#/login'));
                if (target) break;
            } catch {}
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        assert.ok(target, 'Installed app must reach its login page');
        socket = new WebSocket(target.webSocketDebuggerUrl);
        await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
        const response = await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('Renderer check timed out')), 15000);
            socket.addEventListener('message', event => {
                const data = JSON.parse(event.data);
                if (data.id === 1) { clearTimeout(timer); resolve(data); }
            });
            socket.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: {
                expression: `(async () => {
                    await window.api.storeSet('default_steam_user_data_path', ${JSON.stringify(steamRoot)});
                    const detected = [];
                    for (const user_id of [9001, 9002]) {
                        await window.api.storeSet('auth_data', { user_id });
                        detected.push(await window.api.resolveRocksmithConfig());
                    }
                    await window.api.storeDelete('auth_data');
                    const host = await window.api.getHost();
                    const version = await window.api.getVersion();
                    const bridgeProbe = ${production} ? null : await window.api.requestBackend(host + '/api/auth/login.php', {version});
                    return {bridgeProbe, hasLogin: !!document.querySelector('input[autocomplete="username"]'), host, notice: document.getElementById('beta-notice')?.textContent, version: await window.api.getVersion(),
                        sentinel: await window.api.storeGet('stagingSmokeSentinel'), detected};
                })()`,
                awaitPromise: true, returnByValue: true,
            } }));
        });
        assert.ok(!response.error && !response.result?.exceptionDetails,
            'Preload/renderer check failed: ' + JSON.stringify(response.error || response.result?.exceptionDetails));
        assert.equal(response.result.result.value.host, HOSTS[channel]);
        assert.equal(response.result.result.value.version, metadata.version);
        assert.equal(response.result.result.value.hasLogin, true);
        if (!production) assert.ok(response.result.result.value.bridgeProbe.error);
        if (beta) {
            assert.equal(response.result.result.value.notice, undefined, 'The header no longer shows a Beta badge');
            const windowTitle = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
                `(Get-Process -Id ${child.pid}).MainWindowTitle`], { encoding: 'utf8' });
            assert.match(windowTitle.stdout, /Rock Buddy Beta v\d+\.\d+\.\d+-beta\d+/);
        }
        assert.equal(response.result.result.value.sentinel, production ? true : null);
        for (const config of response.result.result.value.detected) {
            assert.equal(config?.profilePath, path.join(remote, 'ci-profile_PRFLDB'), 'Fresh accounts discover the profile without Config');
        }
        // The bridge performs backend requests; the renderer cannot fetch credentials externally.
        if (!production) {
            const error = response.result.result.value.bridgeProbe.error;
            assert.ok(['Invalid JSON data.', 'Rock Buddy is undergoing maintenance. Please try again later.'].includes(error));
        }
        if (beta) {
            const screenshot = await new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error('Screenshot timed out')), 10000);
                socket.addEventListener('message', event => {
                    const data = JSON.parse(event.data);
                    if (data.id === 2) { clearTimeout(timer); resolve(data); }
                });
                socket.send(JSON.stringify({id: 2, method: 'Page.captureScreenshot', params: {format: 'png'}}));
            });
            assert.ok(screenshot.result?.data, 'Capture installed beta login screen');
            fs.writeFileSync(path.join(out, 'beta-login.png'), Buffer.from(screenshot.result.data, 'base64'));
        }
        if (production) {
            assert.equal(JSON.parse(fs.readFileSync(productionConfig, 'utf8')).stagingSmokeSentinel, true);
        } else {
            assert.equal(fs.readFileSync(productionConfig, 'utf8'), sentinel);
            assert.ok(fs.existsSync(path.join(process.env.APPDATA, `rock-buddy-${channel}/config-${channel}.json`)));
        }
        console.log('NSIS install, packaged startup, backend routing, runtime bundling, settings preservation/isolation, update feed, mockup exclusion, and fresh-account profile discovery passed.');
    } finally {
        socket?.close();
        if (child.pid) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
