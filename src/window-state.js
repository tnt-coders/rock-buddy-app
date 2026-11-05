const DEFAULT_SIZE = { width: 1024, height: 768 };
const { MINIMUM_SIZE, MAXIMUM_SIZE } = require('./window-size');

// Reject invalid settings before passing dimensions to Electron.
function validWindowSize(width, height) {
    return Number.isSafeInteger(width) && Number.isSafeInteger(height)
        && width >= MINIMUM_SIZE.width && height >= MINIMUM_SIZE.height;
}

// Resize the normal window while keeping its position and existing persistence behavior.
function applyWindowSize(win, width, height) {
    if (!validWindowSize(width, height) || width > MAXIMUM_SIZE || height > MAXIMUM_SIZE) {
        throw new Error(`Enter whole numbers: width ${MINIMUM_SIZE.width}–${MAXIMUM_SIZE} and height ${MINIMUM_SIZE.height}–${MAXIMUM_SIZE}.`);
    }
    if (!win || win.isDestroyed()) throw new Error('The window is no longer available.');
    if (win.isFullScreen()) throw new Error('Exit full screen before changing the window size.');

    const bounds = win.getNormalBounds();
    if (win.isMaximized()) win.unmaximize();
    win.setBounds({ ...bounds, width, height });

    // Report the actual dimensions in case the operating system adjusted them.
    const actual = win.getNormalBounds();
    return { width: actual.width, height: actual.height };
}

// Restore the saved rectangle, keeping its title bar reachable on an available display.
function restoreWindowState(saved, screen) {
    // Grow older small windows to the new minimum without discarding their position.
    const hasSize = Number.isSafeInteger(saved?.width) && saved.width > 0
        && Number.isSafeInteger(saved?.height) && saved.height > 0;
    const size = hasSize ? {
        width: Math.max(MINIMUM_SIZE.width, saved.width),
        height: Math.max(MINIMUM_SIZE.height, saved.height),
    } : DEFAULT_SIZE;
    const positioned = Number.isSafeInteger(saved?.x) && Number.isSafeInteger(saved?.y);
    const bounds = { width: size.width, height: size.height };

    if (positioned) {
        bounds.x = saved.x;
        bounds.y = saved.y;

        // Negative coordinates are normal for screens above or left of the primary screen.
        const reachable = screen.getAllDisplays().some(({ workArea }) => {
            const overlap = Math.min(bounds.x + bounds.width, workArea.x + workArea.width)
                - Math.max(bounds.x, workArea.x);
            return overlap >= 80 && bounds.y >= workArea.y
                && bounds.y + 32 <= workArea.y + workArea.height
                && bounds.width <= workArea.width && bounds.height <= workArea.height;
        });
        if (reachable) {
            return { ...bounds, maximized: saved?.maximized === true };
        }
    }

    // Recover from disconnected screens or reduced work areas without leaving the window hidden.
    const display = positioned ? screen.getDisplayMatching(bounds) : screen.getPrimaryDisplay();
    const area = display.workArea;
    bounds.width = Math.min(bounds.width, area.width);
    bounds.height = Math.min(bounds.height, area.height);
    bounds.x = positioned
        ? Math.max(area.x, Math.min(bounds.x, area.x + area.width - bounds.width))
        : area.x + Math.floor((area.width - bounds.width) / 2);
    bounds.y = positioned
        ? Math.max(area.y, Math.min(bounds.y, area.y + area.height - bounds.height))
        : area.y + Math.floor((area.height - bounds.height) / 2);

    return { ...bounds, maximized: saved?.maximized === true };
}

// Save window state in the main process, independently of the current page or account.
function trackWindowState(win, store, screen, initialState, timers = globalThis) {
    let state = initialState;
    let timer;

    // Keep normal bounds when maximized, and never replace them with minimized coordinates.
    function capture() {
        if (!win.isDestroyed() && !win.isMinimized() && !win.isFullScreen()) {
            state = { ...win.getNormalBounds(), maximized: win.isMaximized() };
        }
    }

    // Write the latest captured window bounds and clear the pending save timer.
    function persist() {
        timers.clearTimeout(timer);
        timer = undefined;
        try {
            store.set('window_state', state);
        } catch (error) {
            console.error('Could not save window position and size:', error);
        }
    }

    // Coalesce move and resize events into one disk write after the user stops dragging.
    function changed() {
        capture();
        timers.clearTimeout(timer);
        timer = timers.setTimeout(persist, 500);
    }

    // A close can happen before the pending debounce has had a chance to run.
    function closing() {
        capture();
        persist();
    }

    // Move the window back into reach when a monitor or its usable area changes.
    function recoverDisplay() {
        if (win.isDestroyed() || win.isMinimized() || win.isFullScreen()) {
            return;
        }
        const bounds = win.getNormalBounds();
        const restored = restoreWindowState(bounds, screen);
        const moved = ['x', 'y', 'width', 'height'].some(key => bounds[key] !== restored[key]);
        if (moved) {
            const maximized = win.isMaximized();
            if (maximized) {
                win.unmaximize();
            }
            const { x, y, width, height } = restored;
            win.setBounds({ x, y, width, height });
            if (maximized) {
                win.maximize();
            }
        }
        changed();
    }

    const events = ['move', 'resize', 'maximize', 'unmaximize'];
    for (const event of events) {
        win.on(event, changed);
    }
    win.on('restore', recoverDisplay);
    win.on('close', closing);
    screen.on('display-removed', recoverDisplay);
    screen.on('display-metrics-changed', recoverDisplay);

    // Remove shared screen listeners and pending timers when this window goes away.
    win.once('closed', () => {
        timers.clearTimeout(timer);
        for (const event of events) {
            win.removeListener(event, changed);
        }
        win.removeListener('restore', recoverDisplay);
        win.removeListener('close', closing);
        screen.removeListener('display-removed', recoverDisplay);
        screen.removeListener('display-metrics-changed', recoverDisplay);
    });
}

module.exports = { restoreWindowState, trackWindowState, validWindowSize, applyWindowSize };
