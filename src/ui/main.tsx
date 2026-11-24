import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { App } from './App';
import { GameOverlay } from '../overlay/GameOverlay';

// Hash routes work in packaged Electron without a web server or document reloads.
const root = document.getElementById('desktop-root');
if (!root) throw new Error('Desktop root is missing.');

// The in-game overlay window shares this entry but must not start a session or gameplay reader.
if (window.location.hash === '#/overlay') {
    document.documentElement.classList.add('game-overlay');
    createRoot(root).render(
        <StrictMode>
            <GameOverlay />
        </StrictMode>,
    );
} else {
    createRoot(root).render(
        <StrictMode>
            <HashRouter>
                <App />
            </HashRouter>
        </StrictMode>,
    );
}
