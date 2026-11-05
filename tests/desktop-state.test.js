const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { readFileSync } = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const source = ts.transpileModule(readFileSync('src/preload.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;

// Run the real preload without a DOM: it should expose a bridge, not create UI.
function bridge() {
    const ipc = new EventEmitter();
    let api;
    vm.runInNewContext(source, {
        exports: {},
        require: () => ({
            ipcRenderer: ipc,
            contextBridge: { exposeInMainWorld: (_name, value) => { api = value; } },
        }),
    });
    return { api, ipc };
}

test('update subscriptions pass only state and remove their listener on cleanup', () => {
    const { api, ipc } = bridge();
    const received = [];
    const unsubscribe = api.onUpdateState((...args) => received.push(args));
    const state = { status: 'ready', version: '1.12.0', message: 'Update ready.' };

    ipc.emit('update-state', { sender: 'private Electron event' }, state);
    assert.deepEqual(received, [[state]]);
    assert.equal(unsubscribe(), undefined);
    assert.equal(ipc.listenerCount('update-state'), 0);

    ipc.emit('update-state', {}, state);
    assert.equal(received.length, 1);
});

test('cleaning up one status subscriber does not disconnect other components', () => {
    const { api, ipc } = bridge();
    const first = [];
    const second = [];
    const unsubscribe = api.onConnectionState(state => first.push(state));
    const unsubscribeSecond = api.onConnectionState(state => second.push(state));
    unsubscribe();

    const offline = { connected: false, message: 'Offline' };
    ipc.emit('connection-state', {}, offline);
    assert.deepEqual(first, []);
    assert.deepEqual(second, [offline]);
    unsubscribeSecond();
    assert.equal(ipc.listenerCount('connection-state'), 0);
});
