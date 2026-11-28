// Small click-through window that shows one line of gameplay status over Rocksmith.
// It only draws over Rocksmith in windowed or borderless mode; exclusive fullscreen hides it.

const CORNERS = ['top-right', 'top-left', 'bottom-right', 'bottom-left'];
const SIZES = ['small', 'medium', 'large'];
const TONES = ['verified', 'maybe-verified', 'unverified', 'ineligible', 'info'];
const MAX_TEXT_LENGTH = 200;

// How often a visible overlay re-claims the top of the window stack.
const KEEP_ON_TOP_MS = 2000;

// Wide enough for the longest live line at the large size; the transparent area is click-through.
const OVERLAY_SIZE = { width: 760, height: 44 };

// Accept only the fields the overlay renders so the renderer cannot resize or move it arbitrarily.
function sanitizeOverlayState(state) {
    if (!state || typeof state !== 'object' || typeof state.text !== 'string') return null;
    if (!TONES.includes(state.tone)) return null;

    return {
        text: state.text.slice(0, MAX_TEXT_LENGTH),
        tone: state.tone,
        corner: CORNERS.includes(state.corner) ? state.corner : 'top-right',
        size: SIZES.includes(state.size) ? state.size : 'medium',
    };
}

// Place the overlay in a corner of the primary display, covering the taskbar like a game would.
function overlayBounds(corner, displayBounds) {
    const { x, y, width, height } = displayBounds;
    return {
        x: corner.endsWith('left') ? x : x + width - OVERLAY_SIZE.width,
        y: corner.startsWith('top') ? y : y + height - OVERLAY_SIZE.height,
        width: OVERLAY_SIZE.width,
        height: OVERLAY_SIZE.height,
    };
}

// Create the window lazily and keep the latest line so a slow page load still shows it.
function createGameOverlay({ BrowserWindow, screen, preload, webPreferences, indexFile }) {
    let overlay = null;
    let latest = null;
    let placedCorner = null;
    let keepOnTopTimer = null;

    // Raise the overlay without activating it. A restarted Rocksmith opens a new game window
    // above the hidden overlay, and showing a window again does not move it back to the front.
    function raise() {
        if (!overlay || overlay.isDestroyed() || !overlay.isVisible()) return;
        overlay.setAlwaysOnTop(true, 'screen-saver');
        overlay.moveTop();
    }

    function stopKeepingOnTop() {
        clearInterval(keepOnTopTimer);
        keepOnTopTimer = null;
    }

    function open() {
        overlay = new BrowserWindow({
            ...overlayBounds('top-right', screen.getPrimaryDisplay().bounds),
            show: false,
            frame: false,
            transparent: true,
            backgroundColor: '#00000000',
            hasShadow: false,
            resizable: false,
            movable: false,
            minimizable: false,
            maximizable: false,
            fullscreenable: false,
            skipTaskbar: true,
            // Never take focus from Rocksmith: a focus change can pause the game.
            focusable: false,
            alwaysOnTop: true,
            webPreferences: { preload, backgroundThrottling: false, ...webPreferences },
        });

        // Stay above borderless games and let every click pass through to the game.
        overlay.setAlwaysOnTop(true, 'screen-saver');
        overlay.setIgnoreMouseEvents(true);
        overlay.setMenuBarVisibility(false);

        overlay.on('closed', () => {
            stopKeepingOnTop();
            overlay = null;
            placedCorner = null;
        });
        overlay.loadFile(indexFile, { hash: '/overlay' });
    }

    // Show, move, or hide the overlay for the latest gameplay line.
    function update(state) {
        latest = sanitizeOverlayState(state);

        if (!latest) {
            stopKeepingOnTop();
            if (overlay && !overlay.isDestroyed()) {
                overlay.webContents.send('game-overlay-state', null);
                overlay.hide();
            }

            // Re-measure the display next time in case its resolution or scaling changed meanwhile.
            placedCorner = null;
            return;
        }

        if (!overlay || overlay.isDestroyed()) open();

        if (placedCorner !== latest.corner) {
            overlay.setBounds(overlayBounds(latest.corner, screen.getPrimaryDisplay().bounds));
            placedCorner = latest.corner;
        }

        overlay.webContents.send('game-overlay-state', latest);
        if (!overlay.isVisible()) {
            overlay.showInactive();
            raise();
        }

        // Rocksmith can be restarted or re-focused while the overlay is up, so keep re-claiming the top.
        if (!keepOnTopTimer) {
            keepOnTopTimer = setInterval(raise, KEEP_ON_TOP_MS);
            keepOnTopTimer.unref?.();
        }
    }

    // Close the overlay with the main window so it cannot keep the app running.
    function destroy() {
        stopKeepingOnTop();
        latest = null;
        if (overlay && !overlay.isDestroyed()) overlay.destroy();
        overlay = null;
    }

    // Answer the overlay page's request for the current line once its listener is registered,
    // so a line sent before the page finished loading is not lost.
    function current(sender) {
        return overlay && !overlay.isDestroyed() && sender === overlay.webContents ? latest : null;
    }

    return { update, destroy, current };
}

module.exports = { createGameOverlay, sanitizeOverlayState, overlayBounds, OVERLAY_SIZE };
