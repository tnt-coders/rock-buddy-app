import { useEffect, useState } from 'react';
import type { GameOverlayState } from '../ui/desktop-state';

// Render the single line that the main window's gameplay engine mirrors into this window.
// This view has no session or reader of its own; it only displays what the main process sends.
export function GameOverlay() {
    const [state, setState] = useState<GameOverlayState | null>(null);

    useEffect(() => {
        let pushed = false;
        let active = true;
        const unsubscribe = window.api.onGameOverlayState((next) => {
            pushed = true;
            setState(next);
        });

        // Ask for the current line after subscribing; a pushed update is newer, so it wins.
        void window.api.getGameOverlayState().then((latest) => {
            if (active && !pushed) setState(latest);
        });
        return () => {
            active = false;
            unsubscribe();
        };
    }, []);

    if (!state) return null;

    return (
        <div className={`game-overlay-frame ${state.corner}`}>
            <span className={`game-overlay-text ${state.tone} ${state.size}`}>{state.text}</span>
        </div>
    );
}
