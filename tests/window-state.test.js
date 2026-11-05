const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const test = require('node:test');
const { restoreWindowState, trackWindowState, validWindowSize, applyWindowSize } = require('../src/window-state');

// Model Electron's display coordinates in device-independent pixels, including a left monitor.
function displays() {
    const screen = new EventEmitter();
    screen.displays = [
        { workArea: { x: 0, y: 0, width: 1920, height: 1040 } },
        { workArea: { x: -1920, y: -200, width: 1920, height: 1040 } },
    ];
    screen.getAllDisplays = () => screen.displays;
    screen.getPrimaryDisplay = () => screen.displays[0];
    screen.getDisplayMatching = () => screen.displays[0];
    return screen;
}

test('restores exact negative coordinates and custom dimensions on a connected monitor', () => {
    const saved = { x: -1650, y: -150, width: 850, height: 600, maximized: false };
    assert.deepEqual(restoreWindowState(saved, displays()), saved);
});

test('grows old small windows to the minimum without losing their monitor position', () => {
    assert.deepEqual(restoreWindowState({ x: -1600, y: -100, width: 420, height: 350 }, displays()), {
        x: -1600, y: -100, width: 640, height: 480, maximized: false,
    });
    assert.equal(validWindowSize(640, 480), true);
    assert.equal(validWindowSize(639, 480), false);
    assert.equal(validWindowSize(640, 479), false);
});

test('recovers a disconnected monitor and clamps oversized windows to the available work area', () => {
    const screen = displays();
    screen.displays.pop();
    const restored = restoreWindowState({ x: -1650, y: -150, width: 2400, height: 1400 }, screen);
    assert.deepEqual(restored, { x: 0, y: 0, width: 1920, height: 1040, maximized: false });
});

test('keeps a partially offscreen window if its title bar is still reachable', () => {
    const saved = { x: -50, y: 100, width: 850, height: 600, maximized: false };
    assert.deepEqual(restoreWindowState(saved, displays()), saved);
    const hiddenTitle = restoreWindowState({ ...saved, y: -300 }, displays());
    assert.equal(hiddenTitle.y, 0);
});

test('centers legacy dimensions and safely defaults missing or invalid settings', () => {
    const screen = displays();
    assert.deepEqual(restoreWindowState({ width: 800, height: 600 }, screen), {
        x: 560, y: 220, width: 800, height: 600, maximized: false,
    });
    for (const saved of [undefined, null, {}, { width: -1, height: NaN, x: Infinity }]) {
        assert.deepEqual(restoreWindowState(saved, screen), {
            x: 448, y: 136, width: 1024, height: 768, maximized: false,
        });
    }
    assert.equal(validWindowSize('800', 600), false);
    assert.equal(validWindowSize(800.5, 600), false);
});

// Exercise persistence without a renderer, login, real monitor, or wall-clock delay.
function trackedWindow() {
    const win = new EventEmitter();
    win.bounds = { x: -1600, y: -100, width: 850, height: 600 };
    win.maximized = false;
    win.minimized = false;
    win.isDestroyed = () => false;
    win.isMinimized = () => win.minimized;
    win.isFullScreen = () => false;
    win.isMaximized = () => win.maximized;
    win.getNormalBounds = () => ({ ...win.bounds });
    win.setBounds = bounds => { win.bounds = bounds; win.emit('resize'); };
    win.maximize = () => { win.maximized = true; win.emit('maximize'); };
    win.unmaximize = () => { win.maximized = false; win.emit('unmaximize'); };
    const screen = displays();
    const writes = [];
    const pending = new Map();
    let sequence = 0;
    const timers = {
        setTimeout(callback) { pending.set(++sequence, callback); return sequence; },
        clearTimeout(id) { pending.delete(id); },
    };
    trackWindowState(win, {
        set(key, value) { assert.equal(key, 'window_state'); writes.push(value); },
    }, screen, { ...win.bounds, maximized: false }, timers);
    return { win, screen, writes, pending };
}

test('precise sizing restores a maximized window, keeps its position and persists on close', () => {
    const { win, writes } = trackedWindow();
    win.maximized = true;
    assert.deepEqual(applyWindowSize(win, 960, 540), { width: 960, height: 540 });
    assert.equal(win.maximized, false);
    assert.deepEqual(win.bounds, { x: -1600, y: -100, width: 960, height: 540 });
    win.emit('close');
    assert.deepEqual(writes.at(-1), { ...win.bounds, maximized: false });
});

test('invalid dimensions and fullscreen sizing fail without changing window state', () => {
    const { win } = trackedWindow();
    const before = { ...win.bounds };
    for (const [width, height] of [[0, 600], [800, 0], [800.5, 600], ['800', 600], [20000, 600], [NaN, 600]]) {
        assert.throws(() => applyWindowSize(win, width, height), /whole numbers/);
    }
    win.isFullScreen = () => true;
    assert.throws(() => applyWindowSize(win, 800, 600), /Exit full screen/);
    assert.deepEqual(win.bounds, before);
});

test('coalesces changes and saves the most recent bounds without any Config page', () => {
    const { win, writes, pending } = trackedWindow();
    win.emit('move');
    win.bounds.width = 900;
    win.emit('resize');
    assert.equal(writes.length, 0);
    assert.equal(pending.size, 1);
    [...pending.values()][0]();
    assert.deepEqual(writes, [{ ...win.bounds, maximized: false }]);
    assert.equal(pending.size, 0);
});

test('closing immediately flushes changes and detaches screen listeners', () => {
    const { win, screen, writes, pending } = trackedWindow();
    win.emit('resize');
    win.bounds.x = -1500;
    win.emit('close');
    assert.deepEqual(writes, [{ ...win.bounds, maximized: false }]);
    assert.equal(pending.size, 0);
    win.emit('closed');
    assert.equal(screen.listenerCount('display-removed'), 0);
    assert.equal(screen.listenerCount('display-metrics-changed'), 0);
});

test('maximized and minimized exits preserve normal bounds and maximize preference', () => {
    const { win, screen, writes } = trackedWindow();
    const normal = { ...win.bounds };
    win.maximize();
    win.minimized = true;
    win.bounds = { x: -32000, y: -32000, width: 160, height: 28 };
    win.emit('move');
    win.emit('close');
    assert.deepEqual(writes[0], { ...normal, maximized: true });
    assert.deepEqual(restoreWindowState(writes[0], screen), writes[0]);
});

test('unmaximizing retains the normal size instead of restoring maximized next launch', () => {
    const { win, writes } = trackedWindow();
    win.maximize();
    win.unmaximize();
    win.emit('close');
    assert.deepEqual(writes[0], { ...win.bounds, maximized: false });
});

test('a monitor removed while running recovers the window and preserves maximization', () => {
    const { win, screen, writes } = trackedWindow();
    win.maximize();
    screen.displays.pop();
    screen.emit('display-removed');
    win.emit('close');
    assert.deepEqual(writes[0], { x: 0, y: 0, width: 850, height: 600, maximized: true });
});

test('restoring a minimized window checks for a monitor that was disconnected while hidden', () => {
    const { win, screen, writes } = trackedWindow();
    win.minimized = true;
    screen.displays.pop();
    screen.emit('display-removed');
    assert.equal(win.bounds.x, -1600);
    win.minimized = false;
    win.emit('restore');
    win.emit('close');
    assert.equal(writes[0].x, 0);
});
