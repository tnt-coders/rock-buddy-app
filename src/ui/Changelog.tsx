import { Modal } from './Modal';
import { useRef, useState } from 'react';
import { useDesktopState } from './useDesktopState';

// These notes describe the code bundled with this installer, including beta builds.
const currentChanges = [
    'Sniffing continues while browsing other pages; Config still pauses tracking.',
    'Updates download automatically, with a choice to restart now or later. Click the version number for release notes and a manual update check.',
    'Sniffer columns fit the window by default. Show, hide, resize and reorder them, choose a font, and keep your choices after restarting.',
    'Familiar Sniffer layout and compact controls, with full text available on hover for shortened Search fields.',
    'Refreshed themes, clearer score indicators and a header paintbrush for choosing or customizing colors.',
    'Window size and position are remembered. Width and Height changes in Config apply immediately, and rankings adapt to smaller windows.',
    'Faster navigation with cached results, clearer loading and connection errors, and a header and footer that stay visible.',
    'A one-time community welcome and optional one-time or monthly support through the Team page.',
    'Automatic local save discovery preserves existing score imports without a startup profile prompt.',
];

// Summaries from the official GitHub release notes; missing versions are omitted.
// https://github.com/tnt-coders/rock-buddy-app/releases
const previousReleases = [
    {
        version: '1.12.0-beta5',
        changes: [
            'Restored precise window sizing and added responsive ranking cards.',
            'Added the Sniffer status light and fixed stray zeroes beside players.',
        ],
    },
    {
        version: '1.12.0-beta4',
        changes: [
            'Refreshed themes and controls, with a readable Custom theme dialog.',
            'Kept the header and footer visible and removed the Beta badge.',
            'Stopped unrelated Config controls from flashing during saves.',
        ],
    },
    {
        version: '1.12.0-beta3',
        changes: [
            'Added a sticky header with styled update progress and restart controls.',
            'Added a changelog with a manual update check and a more compact Config layout.',
        ],
    },
    {
        version: '1.11.0',
        changes: [
            'Added Rocksmith Learn & Play Edition compatibility.',
            'Added support for the Steam “Just in case we need it” beta branch.',
            'Updated application dependencies.',
        ],
    },
    {
        version: '1.10.3',
        changes: [
            'Fixed score verification with RSMods 1.2.8.0.',
            'Updated the bundled RockSniffer and moved to .NET 8.',
            'Fixed repeated warnings for test builds of songs.',
        ],
    },
    {
        version: '1.9.0',
        changes: [
            'Added Always Sniff to return to the Sniffer page when the window loses focus.',
            'Added Discord Rich Presence for the current song and progress.',
            'Improved error messages when Cloudflare returned a bad gateway response.',
        ],
    },
];

// Local text keeps the changelog available offline without remote HTML or API calls.
export function Changelog({ version, onClose }: { version: string; onClose: () => void }) {
    const releases = [{ version, changes: currentChanges }, ...previousReleases.filter(release => release.version !== version)];
    const update = useDesktopState(window.api.getUpdateState, window.api.onUpdateState);
    const busy = useRef(false);
    const [checking, setChecking] = useState(false);
    const [error, setError] = useState('');
    const isChecking = checking || update?.status === 'checking';
    const canCheck = update && ['idle', 'error'].includes(update.status) && !checking;

    // Manual checks share the automatic updater; they never start a second download.
    async function checkForUpdates() {
        if (busy.current || !canCheck) return;
        busy.current = true;
        setChecking(true);
        setError('');

        try {
            await window.api.checkDesktopUpdate();
        } catch {
            setError('Could not check for updates. Please try again.');
        } finally {
            busy.current = false;
            setChecking(false);
        }
    }

    return (
        <Modal title="Changelog" onClose={onClose} className="changelog-dialog">
            <div className="changelog-controls">
                <button onClick={() => void checkForUpdates()} disabled={!canCheck}>
                    <span aria-hidden={isChecking}>Check for updates</span>
                    <span aria-hidden={!isChecking}>Checking…</span>
                </button>
                <span role="status">{error || update?.message}</span>
                <small className="changelog-update-hint">Rock Buddy automatically checks for updates</small>
            </div>
            <div className="changelog-content" tabIndex={0} aria-label="Release notes">
                {releases.map((release, index) => (
                    <section key={`${release.version}-${index}`}>
                        <h3>v{release.version}</h3>
                        <ul>
                            {release.changes.map((change) => <li key={change}>{change}</li>)}
                        </ul>
                    </section>
                ))}
            </div>
        </Modal>
    );
}
