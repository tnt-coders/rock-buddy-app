const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const test = require('node:test');
const { HOSTS, resolveBackend } = require('../src/backend-config');

test('existing production installs keep the default store and session', () => {
    const expected = { host: HOSTS.production, storeOptions: {}, webPreferences: {} };
    assert.deepEqual(resolveBackend(), expected);
    assert.deepEqual(resolveBackend(['--backend=production']), expected);
    assert.deepEqual(resolveBackend(['https://rock-buddy.com/']), expected);
});
test('staging and local never select the production credential store or browser session', () => {
    const staging = resolveBackend(['--backend=staging']);
    const local = resolveBackend(['--backend=local']);
    assert.equal(staging.host, HOSTS.staging);
    assert.equal(staging.storeOptions.name, 'config-staging');
    assert.equal(staging.webPreferences.partition, 'persist:rock-buddy-staging');
    assert.notEqual(staging.storeOptions.name, local.storeOptions.name);
    assert.notEqual(staging.webPreferences.partition, local.webPreferences.partition);
    assert.deepEqual(resolveBackend([HOSTS.staging]), staging);
});
test('legacy development URLs remain usable with origin-specific isolated storage', () => {
    const first = resolveBackend(['http://raspberrypi:8080']);
    assert.equal(first.host, 'http://raspberrypi:8080');
    assert.ok(first.storeOptions.name.startsWith('config-'));
    assert.notEqual(first.storeOptions.name, resolveBackend(['http://127.0.0.1:8787']).storeOptions.name);
});
test('ambiguous and unsafe selectors fail before storage is opened', () => {
    for (const args of [['--backend'], ['--backend=typo'], ['--backend=staging', HOSTS.production],
        ['file:///tmp/x'], ['https://user:secret@example.invalid'], ['https://example.invalid/api'],
        ['https://example.invalid?token=secret']]) assert.throws(() => resolveBackend(args));
});
test('the renderer permits configurable HTTP readers while backend credentials use the bridge', () => {
    const html = readFileSync('src/index.html', 'utf8');
    const connect = html.match(/connect-src ([^;]+);/)[1].split(' ');
    assert.ok(connect.includes('http:'));
    assert.ok(!connect.includes('*') && !connect.includes('https:'));
    assert.ok(html.includes("script-src 'self';"));
});

test('staging installers select staging without flags and reject backend overrides', () => {
    const staging = resolveBackend([], 'staging');
    assert.equal(staging.host, HOSTS.staging);
    assert.equal(staging.storeOptions.name, 'config-staging');
    assert.equal(staging.webPreferences.partition, 'persist:rock-buddy-staging');
    assert.deepEqual(resolveBackend(['--remote-debugging-port=9333'], 'staging'), staging);
    assert.deepEqual(resolveBackend(['--backend=staging'], 'staging'), staging);
    for (const args of [['--backend=production'], [HOSTS.production], ['--backend=local'], ['https://example.invalid']]) {
        assert.throws(() => resolveBackend(args, 'staging'), /only connects to staging/);
    }
    assert.throws(() => resolveBackend([], 'unknown'), /Unknown packaged backend/);
});

test('beta installs use isolated settings and cannot select another backend', () => {
    const beta = resolveBackend([], 'beta');
    assert.equal(beta.host, HOSTS.beta);
    assert.equal(beta.storeOptions.name, 'config-beta');
    assert.equal(beta.webPreferences.partition, 'persist:rock-buddy-beta');
    assert.deepEqual(resolveBackend(['--remote-debugging-port=9333'], 'beta'), beta);
    assert.deepEqual(resolveBackend(['--backend=beta'], 'beta'), beta);
    for (const host of [HOSTS.production, HOSTS.staging, HOSTS.local, 'https://example.invalid']) {
        assert.throws(() => resolveBackend([host], 'beta'), /only connects to the beta test backend/);
    }
});
