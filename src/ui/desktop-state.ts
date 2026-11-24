export interface DesktopUpdateState {
    status: 'disabled' | 'idle' | 'checking' | 'downloading' | 'ready' | 'installing' | 'error';
    message: string;
    version?: string | null;
    percent?: number;
}

export interface ConnectionState {
    connected: boolean;
    message: string;
}

// One line of text mirrored into the in-game overlay window.
export type GameOverlayTone = 'verified' | 'maybe-verified' | 'unverified' | 'ineligible' | 'info';
export type GameOverlayCorner = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
export type GameOverlaySize = 'small' | 'medium' | 'large';

export interface GameOverlayState {
    text: string;
    tone: GameOverlayTone;
    corner: GameOverlayCorner;
    size: GameOverlaySize;
}
