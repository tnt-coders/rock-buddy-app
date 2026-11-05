import { useEffect, useRef, useState } from 'react';
import { useDesktopState } from './useDesktopState';
import type { DesktopUpdateState } from './desktop-state';
import { Changelog } from './Changelog';

// Keep the action icons small and let the adjacent text name each control.
function UpdateIcon({ kind }: { kind: 'download' | 'restart' | 'later' }) {
    const paths = {
        download: 'M12 3v12m-5-5 5 5 5-5M5 16v5h14v-5',
        restart: 'M20 7v5h-5M20 12a8 8 0 1 0-2 5',
        later: 'M12 8v4l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
    };

    return (
        <svg className="update-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d={paths[kind]} />
        </svg>
    );
}

// A browser dialog traps focus without blocking timers, gameplay or uploads.
function UpdateDialog({ state, onLater }: { state: DesktopUpdateState; onLater: () => void }) {
    const dialog = useRef<HTMLDialogElement>(null);
    const laterButton = useRef<HTMLButtonElement>(null);
    const busy = useRef(false);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState('');
    const installing = pending || state.status === 'installing';

    useEffect(() => {
        const element = dialog.current!;
        element.showModal();
        laterButton.current?.focus();
        return () => element.close();
    }, []);

    // The main process checks gameplay and uploads again before closing the app.
    async function restart() {
        if (busy.current) return;
        busy.current = true;
        setPending(true);
        setError('');

        try {
            const result = await window.api.installDesktopUpdate();
            if (!result) setError('Could not restart Rock Buddy. Please try again.');
        } catch {
            setError('Could not restart Rock Buddy. Please try again.');
        } finally {
            busy.current = false;
            setPending(false);
        }
    }

    const message = error || (state.message === 'Update ready.' ? '' : state.message);

    return (
        <dialog
            ref={dialog}
            className="app-dialog update-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="update-title"
            aria-describedby="update-description"
            onCancel={(event) => event.preventDefault()}
            onKeyDown={(event) => {
                if (event.key === 'Escape') event.preventDefault();
            }}
        >
            <h2 id="update-title">Rock Buddy {state.version} is ready</h2>
            <p id="update-description">
                Restart to install the update. Rock Buddy may take a few seconds to reopen after installation.
            </p>
            {message && <p role="status">{message}</p>}
            <div className="update-actions">
                <button onClick={() => void restart()} disabled={installing}>
                    <UpdateIcon kind="restart" />Restart now
                </button>
                <button ref={laterButton} onClick={onLater} disabled={installing}>
                    <UpdateIcon kind="later" />Restart later
                </button>
            </div>
        </dialog>
    );
}

// Keep the installed version in the footer, separate from header update actions.
export function DesktopVersion() {
    const [version, setVersion] = useState('');
    const [showChangelog, setShowChangelog] = useState(false);

    useEffect(() => {
        let mounted = true;
        window.api.getVersion()
            .then((value) => { if (mounted) setVersion(value); })
            .catch(() => console.warn('Could not read the app version.'));
        return () => { mounted = false; };
    }, []);

    if (!version) return null;

    return (
        <>
            <button className="desktop-version text-button" onClick={() => setShowChangelog(true)}
                aria-label={`Changelog for Rock Buddy ${version}`} aria-haspopup="dialog" title="Changelog">
                v{version}
            </button>
            {showChangelog && <Changelog version={version} onClose={() => setShowChangelog(false)} />}
        </>
    );
}

// Checks stay quiet; downloads and deferred updates appear inside the header.
export function DesktopUpdates() {
    const state = useDesktopState(window.api.getUpdateState, window.api.onUpdateState);
    const [deferredVersion, setDeferredVersion] = useState(() => sessionStorage.getItem('deferred-update'));
    const ready = state?.status === 'ready';
    const showDialog = state?.status === 'installing' || (ready && state.version !== deferredVersion);
    const downloading = state?.status === 'downloading';
    const progress = state?.percent;
    const percent = typeof progress === 'number' && Number.isFinite(progress)
        ? Math.min(100, Math.max(0, Math.round(progress)))
        : null;

    function later() {
        if (!state?.version) return;
        sessionStorage.setItem('deferred-update', state.version);
        setDeferredVersion(state.version);
    }

    function reopen() {
        sessionStorage.removeItem('deferred-update');
        setDeferredVersion(null);
    }

    return (
        <>
            {downloading && (
                <span className="header-update update-download" role="status">
                    <UpdateIcon kind="download" />
                    Downloading{percent !== null ? ` ${percent}%` : '…'}
                </span>
            )}
            {ready && !showDialog && (
                <button className="header-update update-ready" onClick={reopen}
                    title={`Rock Buddy ${state.version} is ready to install`} aria-haspopup="dialog">
                    <UpdateIcon kind="restart" />Update ready
                </button>
            )}
            {showDialog && state && <UpdateDialog key={state.version} state={state} onLater={later} />}
        </>
    );
}
