const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

// Exercise the actual sniffer loop with an unresolved server sync and a working local reader.
function loadSniffer(api = {}) {
    const exports = {};
    const source = ts.transpileModule(fs.readFileSync('src/sniffer/sniffer.ts','utf8'), {
        compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
    }).outputText;
    vm.runInNewContext(source, {exports,Date,clearInterval,
        window:{sessionStorage:{getItem:()=>'{"user_id":1}'},api:{setGameplayActive(){}, storeGet: async () => null, ...api}},
        require:()=>({
            approxEqual: (a, b) => Math.abs(a - b) < 0.0001,
            getAvailablePaths: arrangements => arrangements,
            logMessage(){}, showExclusive(){}, showError:error=>assert.fail(String(error)),
            Rocksmith: { create: async () => ({ newProfileDataAvailable: async () => false }) },
            Rocksniffer: { create: async () => ({}) },
            SoundEffect: { create: async () => ({ disable() {} }) },
        }),
    });
    return exports.Sniffer;
}

test('slow backend sync does not block local gameplay updates or launch overlapping syncs', async () => {
    const Sniffer=loadSniffer();
    const sniffer=new Sniffer({}, {}, {enabled:()=>false,disable(){}}, {user_id:1});
    const data={songDetails:{songID:'one'},memoryReadout:{songTimer:30}};
    let syncs=0, live=0, progress=0, finish;
    sniffer.sniff=async()=>data;
    sniffer.updatePath=()=>{};
    sniffer.updateSongInfo=()=>{};
    sniffer.updateLiveFeed=()=>{live++;};
    sniffer.monitorProgress=async()=>{progress++;};
    sniffer.checkSnort=()=>{syncs++;return new Promise(resolve=>{finish=resolve;});};
    await sniffer.refresh();
    await sniffer.refresh();
    assert.equal(syncs,1);
    assert.equal(live,2);
    assert.equal(progress,2);
    finish();
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(sniffer._syncActive,false);
});

test('unexpected sync failures wait before retrying and leave the local loop usable', async () => {
    const Sniffer=loadSniffer();
    const sniffer=new Sniffer({}, {}, {enabled:()=>false,disable(){}}, {user_id:1});
    sniffer.sniff=async()=>({songDetails:{songID:'one'},memoryReadout:{songTimer:0}});
    sniffer.updatePath=()=>{};
    sniffer.updateSongInfo=()=>{};
    sniffer.updateLiveFeed=()=>{};
    sniffer.monitorProgress=async()=>{};
    let syncs=0;
    sniffer.checkSnort=async()=>{syncs++;throw new Error('temporary failure');};
    await sniffer.refresh();
    await new Promise(resolve=>setImmediate(resolve));
    for(let i=0;i<20;i++) await sniffer.refresh();
    assert.equal(syncs,1);
    assert.ok(sniffer._retrySyncAt>Date.now());
    assert.equal(sniffer._refreshActive,false);
});

test('stopping the engine ignores a pending local read and prevents further polls', async () => {
    const Sniffer = loadSniffer();
    const sniffer = new Sniffer({}, {}, { enabled: () => false, disable() {} }, { user_id: 1 });
    let finish;
    let polls = 0;
    sniffer.sniff = () => { polls++; return new Promise(resolve => { finish = resolve; }); };
    sniffer.updatePath = () => assert.fail('A disposed engine must not process another frame');
    const pending = sniffer.refresh();
    sniffer.stop();
    finish({ songDetails: { songID: 'one' }, memoryReadout: { songTimer: 10 } });
    await pending;
    await sniffer.refresh();
    assert.equal(polls, 1);
});

test('an ended session cannot submit another score', async () => {
    const Sniffer = loadSniffer();
    const sniffer = new Sniffer({}, {}, { disable() {} }, { user_id: 1 });
    sniffer.stop();
    await assert.rejects(sniffer.send('https://example.invalid/api/data/sniffer_sync.php', {}), /session has ended/);
});

test('normal reader waiting states remain distinct from failures', async () => {
    const Sniffer = loadSniffer();
    let data = null;
    const reader = { sniff: async () => data };
    const sniffer = new Sniffer({}, reader, { enabled: () => false }, { user_id: 1 });
    for (const snapshot of [null, { RocksmithFound: false }, { RocksmithFound: true, psarcProcessingCount: 2 }, { RocksmithFound: true, success: false }]) {
        data = snapshot;
        await sniffer.refresh();
        assert.equal(sniffer.getSnapshot().activity, 'waiting');
    }
    reader.sniff = async () => { throw new Error('Reader disconnected'); };
    await sniffer.refresh();
    assert.equal(sniffer.getSnapshot().activity, 'error');
});

test('reader activity follows gameplay pauses and recovers after an error', async () => {
    const Sniffer = loadSniffer();
    const sniffer = new Sniffer({}, {}, { enabled: () => false }, { user_id: 1 });
    sniffer.sniff = async () => ({ memoryReadout: { songTimer: 30 } });
    sniffer.updatePath = sniffer.updateSongInfo = sniffer.updateLiveFeed = () => {};
    sniffer.monitorProgress = sniffer.checkSnort = async () => {};
    sniffer.publish({ error: 'Previous error', activity: 'error', live: { active: true } });
    await sniffer.refresh();
    assert.equal(sniffer.getSnapshot().activity, 'sniffing');
    assert.equal(sniffer.getSnapshot().error, null);
    sniffer._isPaused = true;
    await sniffer.refresh();
    assert.equal(sniffer.getSnapshot().activity, 'paused');
    sniffer._isPaused = false;
    sniffer.publish({ live: { active: false } });
    await sniffer.refresh();
    assert.equal(sniffer.getSnapshot().activity, 'waiting');
});

// Feed real updater results into the running engine without a network request.
async function betaFixture({ enabled = true, version = '1.12.0-beta.7' } = {}) {
    const { EventEmitter } = require('node:events');
    const { createDesktopUpdates } = require('../src/desktop-updates');
    const updater = new EventEmitter();
    const listeners = new Set();
    let latest = false;
    let betaTesting = enabled;
    let reads = 0;
    updater.checkForUpdates = async () => {};
    updater.downloadUpdate = async () => {};
    const controller = createDesktopUpdates(updater, {
        version,
        allowBeta: () => betaTesting,
        canInstall: async () => false,
        onLatest: value => { latest = value; },
        onState: state => listeners.forEach(listener => listener(state)),
    });
    const api = {
        onLatestBetaVersion: async () => { reads++; return betaTesting && latest; },
        onUpdateState: listener => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
    };
    await controller.check();
    return { api, updater, controller, listeners, reads: () => reads,
        setBeta: value => { betaTesting = value; } };
}

const finishEvents = () => new Promise(resolve => setImmediate(resolve));

test('a late up-to-date result enables instant snorts for beta and regular releases', async () => {
    for (const version of ['1.12.0-beta.7', '1.12.0']) {
        const f = await betaFixture({ version });
        const Sniffer = loadSniffer(f.api);
        const sniffer = await Sniffer.create({ user_id: 1 });
        assert.equal(sniffer.snortRate, 3000);

        f.updater.emit('update-not-available');
        await finishEvents();
        assert.equal(sniffer.snortRate, 0);

        // The existing engine imports the next song immediately, only once.
        let uploads = 0;
        sniffer.snort = async () => { uploads++; sniffer._snorted = true; };
        sniffer._snort = false;
        sniffer._timeSinceLastSnort = 100;
        const song = { songDetails: { songID: 'one' }, memoryReadout: { gameStage: 'MainMenu' } };
        await sniffer.checkSnort(song);
        await sniffer.checkSnort(song);
        assert.equal(uploads, 1);

        f.updater.emit('update-available', { version: '1.13.0-beta.1' });
        await finishEvents();
        assert.equal(sniffer.snortRate, 3000);
        const reads = f.reads();
        for (let percent = 1; percent <= 100; percent++) f.updater.emit('download-progress', { percent });
        f.updater.emit('update-downloaded', { version: '1.13.0-beta.1' });
        await finishEvents();
        assert.equal(sniffer.snortRate, 3000);
        assert.equal(f.reads(), reads);
        sniffer.stop();
        assert.equal(f.listeners.size, 0);
    }
});

test('Beta Testing requires a check that included betas, not just a stable-only result', async () => {
    const f = await betaFixture({ enabled: false });
    const Sniffer = loadSniffer(f.api);
    const sniffer = await Sniffer.create({ user_id: 1 });
    f.updater.emit('update-not-available');
    await finishEvents();
    assert.equal(sniffer.snortRate, 3000);

    // Enabling the preference during a stable-only check cannot grant the reward.
    f.setBeta(true);
    f.updater.emit('update-not-available');
    await sniffer.refreshSnortRate();
    assert.equal(sniffer.snortRate, 3000);

    await f.controller.check();
    f.updater.emit('checking-for-update');
    f.updater.emit('update-not-available');
    await finishEvents();
    assert.equal(sniffer.snortRate, 0);
    f.setBeta(false);
    await sniffer.refreshSnortRate();
    assert.equal(sniffer.snortRate, 3000);
    sniffer.stop();
});

test('a delayed initial read cannot overwrite a newer update result', async () => {
    const f = await betaFixture();
    let finishInitial;
    let reads = 0;
    const Sniffer = loadSniffer({
        ...f.api,
        onLatestBetaVersion: () => ++reads === 1
            ? new Promise(resolve => { finishInitial = resolve; })
            : Promise.resolve(true),
    });
    const creating = Sniffer.create({ user_id: 1 });
    await finishEvents();
    f.updater.emit('update-not-available');
    await finishEvents();
    finishInitial(false);
    const sniffer = await creating;
    assert.equal(sniffer.snortRate, 0);
    sniffer.stop();
});

test('stopping an engine removes its listener and ignores pending eligibility reads', async () => {
    const f = await betaFixture();
    let finishRead;
    let reads = 0;
    const Sniffer = loadSniffer({
        ...f.api,
        onLatestBetaVersion: () => ++reads === 2
            ? new Promise(resolve => { finishRead = resolve; })
            : Promise.resolve(false),
    });
    const first = await Sniffer.create({ user_id: 1 });
    f.updater.emit('update-not-available');
    first.stop();
    const second = await Sniffer.create({ user_id: 2 });
    finishRead(true);
    await finishEvents();
    assert.equal(first.snortRate, 3000);
    assert.equal(second.snortRate, 3000);
    assert.equal(f.listeners.size, 1);
    second.stop();
    assert.equal(f.listeners.size, 0);
});

// A display preference must not change which arrangement receives a verified score.
test('locked paths survive song changes and gameplay without requesting missing leaderboards', async () => {
    const Sniffer = loadSniffer({ getHost: async () => 'https://example.invalid' });
    const sniffer = new Sniffer({}, {}, { disable() {} }, { user_id: 1 });
    sniffer._preferredPath = 'rhythm';
    sniffer._pathLocked = true;
    sniffer._snorted = true;
    const data = {
        songDetails: { songID: 'one', psarcFileHash: 'file', toolkit: { version: '1' },
            arrangements: [{ name: 'Lead', hash: 'lead-id' }] },
        memoryReadout: { songTimer: 30, arrangementID: 'lead-id', noteData: { HighestHitStreak: 42, Accuracy: 90 } },
    };
    sniffer.updatePath(data);
    assert.equal(sniffer.getSnapshot().path, 'rhythm');
    sniffer.select('path', 'lead');
    assert.equal(sniffer.getSnapshot().path, 'rhythm');

    const sent = [];
    sniffer.send = async (url, body) => { sent.push({ url, body }); return []; };
    await sniffer.showLeaderboard(data);
    assert.equal(sent.length, 0);
    assert.equal(sniffer.getSnapshot().leaderboard.message, 'No Rhythm arrangement available.');
    await sniffer.recordVerifiedScore(data, 100);
    assert.equal(sent.length, 1);
    assert.ok(sent[0].url.endsWith('/record_verified_score.php'));
    assert.equal(sent[0].body.song_data.arrangement_hash, 'lead-id');

    // A later chart with Rhythm loads its scores normally, including Score Attack.
    data.songDetails.songID = 'two';
    data.songDetails.arrangements.push({ name: 'Rhythm', hash: 'rhythm-id' });
    sniffer.updatePath(data);
    sniffer.select('mode', 'sa');
    sniffer._snorted = true;
    await sniffer.showLeaderboard(data);
    assert.equal(sent[1].body.arrangement, 'rhythm');
    assert.ok(sent[1].url.endsWith('/get_scores_sa.php'));

    // Unlocking restores the existing live arrangement detection and missing-path fallback.
    sniffer._pathLocked = false;
    sniffer.updatePath(data);
    assert.equal(sniffer.getSnapshot().path, 'lead');
    data.memoryReadout.songTimer = 0;
    data.songDetails.arrangements = [{ name: 'Lead', hash: 'lead-id' }];
    sniffer.updatePath(data);
    assert.equal(sniffer.getSnapshot().path, 'lead');
});

// Each new engine restores only the settings belonging to its signed-in account.
test('engine startup restores the saved path lock for the current account', async () => {
    const stored = new Map([
        ['user_data.1.preferred_path', 'rhythm'],
        ['user_data.1.preferred_path_locked', true],
    ]);
    const Sniffer = loadSniffer({
        storeGet: async key => stored.get(key),
        onUpdateState: () => () => {},
        onLatestBetaVersion: async () => false,
    });
    const first = await Sniffer.create({ user_id: 1 });
    assert.equal(first.getSnapshot().pathLocked, true);
    first.stop();
    const second = await Sniffer.create({ user_id: 2 });
    assert.equal(second.getSnapshot().pathLocked, false);
    second.stop();
});
