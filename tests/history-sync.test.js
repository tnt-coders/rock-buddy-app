const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

test('no selected local save still syncs the catalog and records a new verified run', async () => {
    const sent = [];
    const window = { sessionStorage: { getItem: () => JSON.stringify({ user_id: 101, api_key: 'test' }) },
        api: { getHost: async () => 'https://example.invalid', error: message => assert.fail(message),
            resolveRocksmithConfig: async () => null,
            getFileTimestamp: () => assert.fail('missing save must not be inspected'),
            readRocksmithData: () => assert.fail('missing save must not be read') } };
    const load = file => {
        const exports = {};
        const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
            compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
        }).outputText;
        vm.runInNewContext(source, { exports, window,
            require: () => ({ logMessage() {},
                getAvailablePaths: arrangements => arrangements.map(a => ({ hash: a.arrangementID, name: 'Lead' })),
                post: async (url, body) => { sent.push({ url, body }); return { success: true }; } }),
        });
        return exports;
    };
    const { Rocksmith } = load('src/sniffer/rocksmith.ts');
    const { Sniffer } = load('src/sniffer/sniffer.ts');
    const rocksmith = await Rocksmith.create();
    const sniffer = new Sniffer(rocksmith, {}, {}, { user_id: 101, api_key: 'test' });
    sniffer.showLeaderboard = async () => {};
    const data = { songDetails: { songID: 'song', psarcFileHash: 'file', songName: 'Song', artistName: 'Artist',
        albumName: 'Album', albumYear: 2026, toolkit: { author: 'Author', version: '1' },
        arrangements: [{ arrangementID: 'lead', noteDataHash: 'notes' }] },
        memoryReadout: { arrangementID: 'lead', noteData: { HighestHitStreak: 42, Accuracy: 90 } } };
    assert.equal(await rocksmith.newProfileDataAvailable(), false);
    await sniffer.snort(data);
    const sync = sent.find(r => r.url.endsWith('/sniffer_sync.php')).body;
    assert.equal(sync.lurk_mode, true);
    assert.deepEqual(Object.keys(sync.song_data.arrangements.lead).sort(), ['hash', 'name', 'note_data_hash']);
    await sniffer.recordVerifiedScore(data, 100);
    const verified = sent.find(r => r.url.endsWith('/record_verified_score.php')).body;
    assert.equal(verified.song_data.mastery, 0.9);
    assert.equal(verified.song_data.streak, 42);
});

test('selected local history remains available without account linking or confirmation', async () => {
    const history = { Stats: { Songs: {} }, SongsSA: {} };
    let reads = 0;
    const api = new Proxy({
        resolveRocksmithConfig: async () => ({ profilePath: 'selected_PRFLDB' }),
        getFileTimestamp: async file => { assert.equal(file, 'selected_PRFLDB'); return 123; },
        readRocksmithData: async file => { assert.equal(file, 'selected_PRFLDB'); reads++; return history; },
    }, { get(target, key) {
        assert.ok(Object.hasOwn(target, key), `Unexpected bridge call: ${String(key)}`);
        return target[key];
    } });
    const exports = {};
    const source = ts.transpileModule(fs.readFileSync('src/sniffer/rocksmith.ts', 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    vm.runInNewContext(source, { exports, window: { api } });
    const rocksmith = await exports.Rocksmith.create();
    assert.equal(rocksmith.importHistory, true);
    assert.equal(await rocksmith.newProfileDataAvailable(), true);
    assert.ok(await rocksmith.getProfileData() === history);
    assert.equal(await rocksmith.newProfileDataAvailable(), false);
    await rocksmith.getProfileData();
    assert.equal(reads, 1);
});
