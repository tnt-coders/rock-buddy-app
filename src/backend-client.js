const CONNECTION_MESSAGE = 'Rock Buddy cannot reach the server. Check your connection and try again.';

// Keep network failures consistent across pages without retrying account or score writes.
function createBackendClient(host, { fetchImpl = fetch, now = Date.now, onState = () => {} } = {}) {
    let retryAt = 0;
    let state = { connected: true, message: '' };
    let pending = 0;

    // Share connection status with every page that uses this backend client.
    function setConnected(connected) {
        state = { connected, message: connected ? '' : CONNECTION_MESSAGE };
        onState(state);
    }

    // Return the remaining cooldown so callers can avoid immediate repeat requests.
    function unavailable() {
        return { error: CONNECTION_MESSAGE, connectionError: true, retryAfterMs: Math.max(0, retryAt - now()) };
    }

    // Only the selected backend can receive desktop credentials.
    async function post(url, data) {
        const destination = new URL(url);
        if (destination.origin !== host || !destination.pathname.startsWith('/api/') || destination.username || destination.password) {
            return { error: 'This request does not belong to the selected Rock Buddy server.' };
        }

        // Pause requests during the shared cooldown without queuing writes for later.
        if (now() < retryAt) return unavailable();
        pending++;

        try {
            // The legacy API expects beta7 while GitHub updates require beta.7.
            const version = typeof data?.version === 'string'
                ? data.version.replace(/^(\d+\.\d+\.\d+-beta)\.(\d+)$/, '$1$2')
                : data?.version;
            const payload = version !== data?.version ? { ...data, version } : data;
            const response = await fetchImpl(destination.href, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: AbortSignal.timeout(5000),
                redirect: 'error',
            });

            // HTML gateway errors and empty bodies must never reach JSON parsing in the UI.
            const text = await response.text();
            if (response.status >= 500 || response.status === 429) throw new Error('Server unavailable');
            let result;
            try { result = JSON.parse(text); } catch { throw new Error('Invalid server response'); }
            if (!result || typeof result !== 'object') throw new Error('Invalid server response');

            // A valid API response restores connectivity even when it reports a rejected request.
            retryAt = 0;
            setConnected(true);
            if (!response.ok && !result.error) return { error: `The server rejected this request (${response.status}).` };
            return result;
        } catch {
            // A shared cooldown prevents the sniffer's 100 ms loop from flooding the server.
            retryAt = now() + 30000;
            setConnected(false);
            return unavailable();
        } finally {
            pending--;
        }
    }

    return { post, getState: () => state, isBusy: () => pending > 0 };
}

module.exports = { createBackendClient, CONNECTION_MESSAGE };
