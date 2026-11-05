import { useDesktopState } from './useDesktopState';

const noticeStyle = {
    padding: '8px 12px',
    background: '#422b12',
    color: '#fff3d6',
    font: '14px/1.4 sans-serif',
};

// An unknown connection state is not an error; render only a reported failure.
function ConnectionNotice() {
    const state = useDesktopState(window.api.getConnectionState, window.api.onConnectionState);
    if (!state || state.connected) return null;

    return (
        <div id="connection-notice" role="status" style={noticeStyle}>
            {state.message} <button onClick={() => window.location.reload()}>Reload page</button>
        </div>
    );
}

// Keep connection status visible in the shared shell across page changes.
export function DesktopStatus() {
    return (
        <>
            <ConnectionNotice />
        </>
    );
}
