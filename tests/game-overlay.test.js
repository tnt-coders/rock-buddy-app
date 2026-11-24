const assert = require('node:assert/strict');
const test = require('node:test');
const { createGameOverlay, sanitizeOverlayState, overlayBounds, OVERLAY_SIZE } = require('../src/game-overlay');

const display = { x: 0, y: 0, width: 2560, height: 1440 };

// Record what the overlay asks Electron to do without opening a real window.
function fakeElectron() {
    const windows = [];
    class BrowserWindow {
        constructor(options) {
            this.options = options;
            this.visible = false;
            this.destroyed = false;
            this.sent = [];
            this.handlers = {};
            this.webContents = {
                send: (channel, state) => this.sent.push([channel, state]),
                on: () => {},
            };
            windows.push(this);
        }
        setAlwaysOnTop(flag, level) { this.topLevel = level; }
        setIgnoreMouseEvents(flag) { this.clickThrough = flag; }
        setMenuBarVisibility() {}
        on(event, handler) { this.handlers[event] = handler; }
        loadFile(file, options) { this.loaded = [file, options]; }
        setBounds(bounds) { this.bounds = bounds; }
        isDestroyed() { return this.destroyed; }
        isVisible() { return this.visible; }
        showInactive() { this.visible = true; this.shownInactive = true; }
        show() { this.visible = true; }
        hide() { this.visible = false; }
        destroy() { this.destroyed = true; }
    }
    const screen = { getPrimaryDisplay: () => ({ bounds: display }) };
    return { BrowserWindow, screen, windows };
}

function overlay(electron) {
    return createGameOverlay({
        ...electron, preload: 'preload.js', webPreferences: {}, indexFile: 'src/index.html',
    });
}

test('overlay state keeps only the rendered fields and rejects unknown tones', () => {
    assert.equal(sanitizeOverlayState(null), null);
    assert.equal(sanitizeOverlayState({ text: 'x', tone: 'rainbow' }), null);
    assert.deepEqual(
        sanitizeOverlayState({ text: 'a'.repeat(500), tone: 'verified', corner: 'middle', size: 'huge', x: 5 }),
        { text: 'a'.repeat(200), tone: 'verified', corner: 'top-right', size: 'medium' },
    );
});

test('overlay bounds sit flush against the chosen corner of the display', () => {
    assert.deepEqual(overlayBounds('top-right', display), { x: 2560 - OVERLAY_SIZE.width, y: 0, ...OVERLAY_SIZE });
    assert.deepEqual(overlayBounds('bottom-left', display), { x: 0, y: 1440 - OVERLAY_SIZE.height, ...OVERLAY_SIZE });
});

test('the overlay window opens lazily, never takes focus, and ignores the mouse', () => {
    const electron = fakeElectron();
    const gameOverlay = overlay(electron);
    gameOverlay.update(null);
    assert.equal(electron.windows.length, 0);

    gameOverlay.update({ text: '10/10 (100.00%)', tone: 'verified', corner: 'bottom-right', size: 'small' });
    const [win] = electron.windows;
    assert.equal(win.options.focusable, false);
    assert.equal(win.options.transparent, true);
    assert.equal(win.clickThrough, true);
    assert.equal(win.topLevel, 'screen-saver');
    assert.equal(win.shownInactive, true);
    assert.deepEqual(win.loaded, ['src/index.html', { hash: '/overlay' }]);
    assert.deepEqual(win.bounds, overlayBounds('bottom-right', display));
    assert.deepEqual(win.sent.at(-1), ['game-overlay-state',
        { text: '10/10 (100.00%)', tone: 'verified', corner: 'bottom-right', size: 'small' }]);
});

test('hiding keeps the window for reuse and destroying closes it', () => {
    const electron = fakeElectron();
    const gameOverlay = overlay(electron);
    gameOverlay.update({ text: 'Lead · 3 verified · You: #1', tone: 'info', corner: 'top-right', size: 'medium' });
    gameOverlay.update(null);
    const [win] = electron.windows;
    assert.equal(win.visible, false);

    gameOverlay.update({ text: 'Lead · 3 verified · You: #1', tone: 'info', corner: 'top-right', size: 'medium' });
    assert.equal(electron.windows.length, 1);
    assert.equal(win.visible, true);

    gameOverlay.destroy();
    assert.equal(win.destroyed, true);
});
