const assert = require('node:assert/strict');
const test = require('node:test');
const semver = require('semver');
const { GitHubProvider } = require('electron-updater/out/providers/GitHubProvider');

// Exercise the installed updater's release selection without contacting GitHub.
function provider(tags, allowPrerelease) {
    const requested = [];
    const updater = { currentVersion: new semver.SemVer('1.12.0-beta.7'), allowPrerelease };
    const executor = { request: async options => {
        requested.push(options.path);
        const version = options.path.includes('beta.8') ? '1.12.0-beta.8' : '1.12.0';
        return `version: ${version}\nfiles:\n  - url: Rock-Buddy-Setup.exe\n    sha512: test\n`;
    } };
    const client = new GitHubProvider({ provider: 'github', owner: 'tnt-coders', repo: 'rock-buddy-app' }, updater,
        { executor, platform: 'win32', isUseMultipleRangeRequest: false });
    client.httpRequest = async url => url.pathname.endsWith('.atom')
        ? `<feed>${tags.map(tag => `<entry><link href="https://github.com/tnt-coders/rock-buddy-app/releases/tag/v${tag}"/><title>Rock Buddy</title></entry>`).join('')}</feed>`
        : JSON.stringify({ tag_name: 'v1.12.0' });
    return { client, requested };
}

test('official beta follows the next numeric beta and later graduates to stable', async () => {
    const beta = provider(['1.12.0-beta.8', '1.11.0'], true);
    assert.equal((await beta.client.getLatestVersion()).version, '1.12.0-beta.8');
    assert.match(beta.requested[0], /tnt-coders\/rock-buddy-app\/releases\/download\/v1.12.0-beta\.8\/beta.yml$/);
    assert.ok(semver.gt('1.12.0-beta.10', '1.12.0-beta.9'));

    const stable = provider(['1.12.0', '1.12.0-beta.8'], true);
    assert.equal((await stable.client.getLatestVersion()).version, '1.12.0');
    assert.match(stable.requested[0], /v1.12.0\/latest.yml$/);
});

test('turning off Beta Testing selects the stable release instead of a newer prerelease', async () => {
    const stable = provider(['1.12.0-beta.8', '1.12.0'], false);
    assert.equal((await stable.client.getLatestVersion()).version, '1.12.0');
    assert.match(stable.requested[0], /v1.12.0\/latest.yml$/);
});
