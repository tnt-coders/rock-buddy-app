const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const yaml = require('js-yaml');
const target = process.env.ROCK_BUDDY_PACKAGE_TARGET;
assert.ok(['production', 'production-beta', 'beta'].includes(target));
const directory = path.join('release', target);
const manifestName = target === 'beta' ? 'beta.yml' : 'latest.yml';
const manifest = yaml.load(fs.readFileSync(path.join(directory, manifestName), 'utf8'));
assert.equal(manifest.version, require('../package.json').version);

// Reject missing or mismatched installers before anyone can publish their update metadata.
assert.ok(manifest.files?.length > 0);
for (const file of manifest.files) {
    assert.equal(path.basename(file.url), file.url);
    const bytes = fs.readFileSync(path.join(directory, file.url));
    assert.equal(createHash('sha512').update(bytes).digest('base64'), file.sha512);
    assert.ok(fs.existsSync(path.join(directory, file.url + '.blockmap')));
}
// GitHub asks for beta.yml on prerelease tags and latest.yml on stable tags.
if (target === 'production-beta') {
    fs.copyFileSync(path.join(directory, manifestName), path.join(directory, 'beta.yml'));
}
const assets = fs.readdirSync(directory).filter(name => /(?:-Setup\.exe|\.blockmap)$/.test(name));
assets.push(manifestName);
if (target === 'production-beta') assets.push('beta.yml');
const checksums = assets.map(name => createHash('sha256').update(fs.readFileSync(path.join(directory, name))).digest('hex') + '  ' + name);
fs.writeFileSync(path.join(directory, 'SHA256SUMS.txt'), checksums.join('\n') + '\n');
