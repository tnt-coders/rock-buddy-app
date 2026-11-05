const base = require('./package.json').build;
const target = process.env.ROCK_BUDDY_PACKAGE_TARGET || 'beta';
if (!['beta', 'production-beta', 'production'].includes(target)) throw new Error('Choose beta, production-beta or production packaging.');
const beta = target === 'beta';

// Reuse the established identities so upgrades preserve installed settings and shortcuts.
module.exports = {
    ...base,
    extends: null,
    ...(beta ? {
        appId: 'com.rockbuddy.beta',
        productName: 'Rock Buddy Beta',
        win: { target: [{ target: 'nsis', arch: ['x64'] }], executableName: 'RockBuddyBeta' },
    } : {
        win: { target: [{ target: 'nsis', arch: ['x64'] }] },
    }),
    artifactName: beta ? 'Rock-Buddy-Beta-${version}-${arch}-Setup.${ext}' : 'Rock-Buddy-${version}-${arch}-Setup.${ext}',
    extraMetadata: {
        name: beta ? 'rock-buddy-beta' : 'rock-buddy',
        rockBuddyBackend: beta ? 'beta' : 'production',
    },
    directories: { output: `release/${target}` },
    files: ['src/**/*', 'dist/**/*', 'images/**/*', 'media/**/*', 'package.json'],
    extraFiles: [
        { from: '.generated/rocksniffer-release', to: 'RockSniffer' },
        ...base.extraFiles.slice(1),
    ],
    nsis: { ...base.nsis, ...(beta ? { shortcutName: 'Rock Buddy Beta' } : {}), runAfterFinish: true },
    // Test updates have a dedicated feed, separate from all official desktop releases.
    publish: beta ? {
        provider: 'generic',
        url: 'https://github.com/Jamesllllllllll/rock-buddy-app/releases/download/desktop-beta/',
        channel: 'beta',
    } : {
        provider: 'github',
        owner: 'tnt-coders',
        repo: 'rock-buddy-app',
        releaseType: target === 'production-beta' ? 'prerelease' : 'release',
    },
};
