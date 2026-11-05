const assert = require('node:assert/strict');
const test = require('node:test');
const { EventEmitter } = require('node:events');
const { createDesktopUpdates, updatesEnabled } = require('../src/desktop-updates');
const { HOSTS } = require('../src/backend-config');
const { supportUrl } = require('../src/support-link');

function fixture(allowBeta = false) {
    const updater = new EventEmitter();
    const calls = { checks: 0, downloads: 0, installs: 0 };
    let safe = false;
    updater.checkForUpdates = async () => { calls.checks++; };
    updater.downloadUpdate = async () => { calls.downloads++; };
    updater.quitAndInstall = (silent, restart) => { assert.equal(restart, true); calls.installs++; };
    const controller = createDesktopUpdates(updater, {
        version:'1.12.0-beta1', allowBeta:()=>allowBeta, canInstall:async()=>safe, onState:()=>{},
    });
    return {updater, calls, controller, allowInstall:()=>{safe=true;}};
}

test('downloads automatically but requires a safe, explicit install request', async () => {
    const f = fixture(true);
    assert.equal(f.updater.autoInstallOnAppQuit, false);
    f.updater.emit('update-available', {version:'1.12.0-beta2'});
    assert.equal(f.calls.downloads, 1);
    f.updater.emit('download-progress', {percent:45});
    assert.equal(f.controller.getState().percent, 45);
    f.updater.emit('update-downloaded', {version:'1.12.0-beta2'});
    await f.controller.install();
    assert.equal(f.calls.installs, 0);
    assert.equal(f.controller.getState().status, 'ready');
    f.allowInstall();
    await f.controller.install();
    assert.equal(f.calls.installs, 1);
    assert.equal(f.controller.getState().status, 'installing');
    await f.controller.install();
    assert.equal(f.calls.installs, 1);
});

test('an installation failure keeps the downloaded update available for retry', async () => {
    const f = fixture(true);
    f.updater.emit('update-downloaded', {version:'1.12.0-beta2'});
    f.allowInstall();
    f.updater.quitAndInstall = () => { throw new Error('Installer failed'); };
    await f.controller.install();
    assert.equal(f.controller.getState().status, 'ready');
    assert.match(f.controller.getState().message, /Could not restart/);
    f.updater.quitAndInstall = () => { f.calls.installs++; };
    await f.controller.install();
    assert.equal(f.calls.installs, 1);
    f.updater.emit('error', new Error('Installer could not launch'));
    assert.equal(f.controller.getState().status, 'ready');
    assert.match(f.controller.getState().message, /Could not restart/);
});

test('rejects older, invalid, and opted-out beta versions', () => {
    const f = fixture(false);
    for (const version of ['1.11.0','garbage','1.12.0-beta2']) f.updater.emit('update-available', {version});
    assert.equal(f.calls.downloads, 0);
    f.updater.emit('update-available', {version:'1.12.0'});
    assert.equal(f.calls.downloads, 1);
});

test('concurrent checks are coalesced and a failed download can be retried', async () => {
    const f = fixture(true);
    let finish;
    f.updater.checkForUpdates = () => new Promise(resolve => { f.calls.checks++; finish=resolve; });
    const first = f.controller.check();
    await f.controller.check();
    assert.equal(f.calls.checks, 1);
    finish(); await first;
    f.updater.downloadUpdate = async () => { throw new Error('interrupted'); };
    f.updater.emit('update-available', {version:'1.12.0-beta2'});
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(f.controller.getState().status, 'error');
    f.updater.checkForUpdates = async () => { f.calls.checks++; };
    await f.controller.check();
    assert.equal(f.calls.checks, 2);
});

test('source, staging, and redirected installs never enable an update feed', () => {
    assert.equal(updatesEnabled(true,'win32',HOSTS.production,undefined,HOSTS),true);
    assert.equal(updatesEnabled(true,'win32',HOSTS.beta,'beta',HOSTS),true);
    assert.equal(updatesEnabled(false,'win32',HOSTS.production,undefined,HOSTS),false);
    assert.equal(updatesEnabled(true,'linux',HOSTS.production,undefined,HOSTS),false);
    assert.equal(updatesEnabled(true,'win32',HOSTS.staging,'staging',HOSTS),false);
    assert.equal(updatesEnabled(true,'win32',HOSTS.staging,undefined,HOSTS),false);
});

test('test builds open sandbox support while normal installs reuse the live website', () => {
    assert.equal(supportUrl(HOSTS.production,HOSTS),'https://rock-buddy.com/support');
    assert.equal(supportUrl(HOSTS.beta,HOSTS),HOSTS.staging+'/support');
    assert.equal(supportUrl(HOSTS.staging,HOSTS),HOSTS.staging+'/support');
});
