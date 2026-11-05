const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const yaml = require('js-yaml');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

test('push CI cannot package, upload, or publish a release', () => {
    const workflow = yaml.load(fs.readFileSync('.github/workflows/build.yml','utf8'));
    assert.deepEqual(workflow.on.push, { branches: ['main', 'develop'] });
    assert.ok(Object.hasOwn(workflow.on, 'pull_request'));
    assert.deepEqual(workflow.permissions, {contents:'read'});
    assert.equal(workflow.on.workflow_dispatch.inputs.installer.default,'none');
    assert.equal(workflow.concurrency['cancel-in-progress'], "${{ github.event_name != 'workflow_dispatch' }}");
    for (const job of Object.values(workflow.jobs)) {
        for (const step of job.steps) {
            if (/package:|electron-builder|upload-artifact|dotnet publish|prepare-installer|check-installer|smoke-staging-installer/.test(step.run || step.uses || '')) {
                assert.match(step.if, /github.event_name == 'workflow_dispatch'/);
            }
            assert.doesNotMatch(step.run || '', /gh release create|--publish always/);
        }
    }
    const upload = workflow.jobs.build_on_win.steps.find(step=>step.uses?.includes('upload-artifact'));
    assert.equal(upload.with['retention-days'],7);
});

test('test and production installers have separate feeds and keep their established identities', () => {
    const config = target => JSON.parse(execFileSync(process.execPath,['-e',"console.log(JSON.stringify(require('./electron-builder.release.cjs')))"], {
        env:{...process.env,ROCK_BUDDY_PACKAGE_TARGET:target}, encoding:'utf8',
    }));
    const beta=config('beta');
    const production=config('production');
    const officialBeta=config('production-beta');
    assert.equal(beta.appId,'com.rockbuddy.beta');
    assert.equal(beta.extraMetadata.name,'rock-buddy-beta');
    assert.equal(beta.publish.channel,'beta');
    assert.match(beta.publish.url,/Jamesllllllllll\/rock-buddy-app\/releases\/download\/desktop-beta/);
    assert.equal(production.extraMetadata.name,'rock-buddy');
    assert.equal(production.extraMetadata.rockBuddyBackend,'production');
    assert.equal(production.publish.owner,'tnt-coders');
    assert.equal(production.appId,require('../package.json').build.appId);
    assert.equal(officialBeta.appId, production.appId);
    assert.deepEqual(officialBeta.win, production.win);
    assert.deepEqual(officialBeta.extraMetadata, production.extraMetadata);
    assert.equal(officialBeta.publish.owner, 'tnt-coders');
    assert.equal(officialBeta.publish.repo, 'rock-buddy-app');
    assert.equal(officialBeta.publish.releaseType, 'prerelease');
    assert.equal(officialBeta.publish.channel, undefined);
    assert.equal(officialBeta.directories.output, 'release/production-beta');
});

// Check version stamping in a temporary project, leaving the real package untouched.
test('installer targets reject ambiguous release versions before modifying package metadata', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rock-buddy-version-'));
    const script = path.resolve('tooling/prepare-installer.cjs');
    try {
        for (const [target, version, valid] of [
            ['beta', '1.12.0-beta7', true],
            ['production-beta', '1.12.0-beta.7', true],
            ['production', '1.12.0', true],
            ['beta', '1.12.0-beta.7', false],
            ['production-beta', '1.12.0-beta7', false],
            ['production-beta', '1.12.0', false],
            ['production', '1.12.0-beta.7', false],
            ['unknown', '1.12.0', false],
        ]) {
            const file = path.join(directory, 'package.json');
            fs.writeFileSync(file, JSON.stringify({ version: '1.11.0' }));
            const run = () => execFileSync(process.execPath, [script], {
                cwd: directory, stdio: 'pipe',
                env: { ...process.env, ROCK_BUDDY_PACKAGE_TARGET: target, INSTALLER_VERSION: version },
            });
            if (valid) run();
            else assert.throws(run);
            assert.equal(JSON.parse(fs.readFileSync(file)).version, valid ? version : '1.11.0');
        }
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});
