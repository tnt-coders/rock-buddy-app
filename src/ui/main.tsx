import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { App } from './App';

// Hash routes work in packaged Electron without a web server or document reloads.
const root = document.getElementById('desktop-root');
if (!root) throw new Error('Desktop root is missing.');

createRoot(root).render(
    <StrictMode>
        <HashRouter>
            <App />
        </HashRouter>
    </StrictMode>,
);
