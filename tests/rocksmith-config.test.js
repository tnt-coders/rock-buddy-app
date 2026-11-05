const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { resolveRocksmithConfig } = require('../src/rocksmith-config');

function fixture(t, layout = { '100': ['one'] }) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rock-buddy-profiles-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    for (const [steam, profiles] of Object.entries(layout)) for (const profile of profiles) {
        const file = path.join(root, steam, '221680', 'remote', profile + '_PRFLDB');
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, 'test');
    }
    const values = { default_steam_user_data_path: root };
    const writes = [];
    const store = { get: key => values[key], set: (key, value) => { values[key] = value; writes.push(key); } };
    const resolve = user => resolveRocksmithConfig(store, user,
        () => Object.fromEntries(Object.keys(layout).map(id => [id, id])),
        (_, steam) => Object.fromEntries((layout[steam] || []).map(id => [id, id])));
    return { root, values, writes, resolve };
}

test('fresh accounts discover one local profile without visiting Config', t => {
    const f = fixture(t);
    for (const id of [101, 102, 103]) {
        assert.equal(f.resolve(id).rocksmithProfile, 'one');
        assert.equal(f.values[`user_data.${id}.steam_user_data_path`], f.root);
        assert.equal(f.values[`user_data.${id}.steam_profile`], '100');
    }
    assert.ok(f.writes.every(key => /^user_data\.(101|102|103)\./.test(key)));
});

test('preserves each account explicit profile even when other profiles exist', t => {
    const f = fixture(t, { '100': ['one', 'two'] });
    f.values['user_data.101.steam_profile'] = '100';
    f.values['user_data.101.rocksmith_profile'] = 'two';
    assert.equal(f.resolve(101).rocksmithProfile, 'two');
    assert.equal(f.resolve(102), null);
    assert.equal(f.values['user_data.101.rocksmith_profile'], 'two');
    assert.equal(f.values['user_data.102.rocksmith_profile'], undefined);
});

test('multiple eligible Steam users require selection; a saved user resolves ambiguity', t => {
    const f = fixture(t, { '100': ['one'], '200': ['two'] });
    assert.equal(f.resolve(101), null);
    assert.deepEqual(f.writes, []);
    f.values['user_data.101.steam_profile'] = '200';
    assert.equal(f.resolve(101).rocksmithProfile, 'two');
});

test('ignores Steam users without Rocksmith saves', t => {
    const f = fixture(t, { '100': [], '200': ['two'] });
    assert.equal(f.resolve(101).steamProfile, '200');
});

test('does not silently replace stale explicitly selected paths or profiles', t => {
    const f = fixture(t);
    f.values['user_data.101.steam_user_data_path'] = path.join(f.root, 'missing');
    f.values['user_data.102.rocksmith_profile'] = 'missing';
    f.values['user_data.103.steam_profile'] = '999';
    for (const user of [101, 102, 103]) assert.equal(f.resolve(user), null);
    assert.deepEqual(f.writes, []);
});

test('can discover a previously browsed Steam folder without inheriting account choices', t => {
    const f = fixture(t, { '100': ['one', 'two'] });
    f.values.default_steam_user_data_path = path.join(f.root, 'missing');
    f.values.user_data = { 101: { steam_user_data_path: f.root, steam_profile: '100', rocksmith_profile: 'two' } };
    assert.equal(f.resolve(102), null);
    fs.rmSync(path.join(f.root, '100', '221680', 'remote', 'two_PRFLDB'));
    assert.equal(f.resolve(102).rocksmithProfile, 'one');
    assert.equal(f.values.user_data[101].rocksmith_profile, 'two');
});

test('missing saves or an unauthenticated account do not write settings', t => {
    const f = fixture(t, {});
    assert.equal(f.resolve(101), null);
    for (const user of [undefined, null, 0, -1, '101']) assert.equal(f.resolve(user), null);
    assert.deepEqual(f.writes, []);
});

test('discovers another account after numeric settings keys serialize as an array with null gaps', t => {
    const f = fixture(t);
    // electron-store's dot-path handling can represent numeric user IDs as array indexes.
    const users = [];
    users[101] = { steam_user_data_path: f.root };
    f.values.user_data = JSON.parse(JSON.stringify(users));
    assert.equal(f.resolve(102).steamUserDataPath, f.root);
});
