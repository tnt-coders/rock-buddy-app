const fs = require('node:fs');
const semver = require('semver');
const version = process.env.INSTALLER_VERSION;
const target = process.env.ROCK_BUDDY_PACKAGE_TARGET;

// Rehearsal keeps its existing version format; official betas use standard update channels.
if (!['production', 'production-beta', 'beta'].includes(target)) throw new Error('Choose an installer target.');
if (!semver.valid(version) || !/^\d+\.\d+\.\d+(?:-beta\.?\d+)?$/.test(version)) throw new Error('Use X.Y.Z, X.Y.Z-betaN or X.Y.Z-beta.N.');
if (target === 'beta' && !/-beta\d+$/.test(version)) throw new Error('Rehearsal installers need a betaN version.');
if (target === 'production-beta' && !/-beta\.\d+$/.test(version)) throw new Error('Official betas need a beta.N version.');
if (target === 'production' && semver.prerelease(version)) throw new Error('Production installers need a stable version.');
const metadata = JSON.parse(fs.readFileSync('package.json', 'utf8'));
metadata.version = version;
fs.writeFileSync('package.json', JSON.stringify(metadata, null, 4) + '\n');
