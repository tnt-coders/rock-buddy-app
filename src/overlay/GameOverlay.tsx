import { useEffect, useState } from 'react';
import type { GameOverlayState } from '../ui/desktop-state';

// Render the single line that the main window's gameplay engine mirrors into this window.
// This view has no session or reader of its own; it only displays what the main process sends.
export function GameOverlay() {
    const [state, setState] = useState<GameOverlayState | null>(null);

    useEffect(() => window.api.onGameOverlayState(setState), []);

    if (!state) return null;

    return (
        <div className={`game-overlay-frame ${state.corner}`}>
            <span className={`game-overlay-text ${state.tone} ${state.size}`}>{state.text}</span>
        </div>
    );
}
