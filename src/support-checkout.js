const { supportUrl } = require('./support-link');
const { supportAmount } = require('./support-amount');

// Read only a small signed form, without loading website HTML into the renderer.
async function readForm(response) {
    if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) {
        throw new Error('Support is unavailable right now. Please try again later.');
    }

    // Limit response size before extracting the signed checkout field.
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let size = 0;
    let html = '';
    try {
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > 65536) throw new Error('Unexpected checkout response.');
            html += decoder.decode(value, { stream: true });
        }
        return html + decoder.decode();
    } finally {
        await reader.cancel();
    }
}

// Keep checkout state in the main process and reuse it when a request must be retried.
function createSupportCheckout(host, hosts, { fetchImpl = fetch, openExternal }) {
    const origin = new URL(supportUrl(host, hosts)).origin;
    const sandbox = host !== hosts.production;
    const paypal = sandbox ? 'https://www.sandbox.paypal.com' : 'https://www.paypal.com';
    let state = null;
    let busy = false;

    // Open one checkout at a time and preserve its signed state for a safe retry.
    async function start(input) {
        const amount = supportAmount(input?.amount);
        const kind = input?.kind;
        if (!amount || !['once', 'monthly'].includes(kind)) {
            return { error: 'Choose a valid amount and payment frequency.' };
        }
        if (busy) return { error: 'Checkout is already opening.' };
        busy = true;

        try {
            // The existing web form already provides signed state and PayPal idempotency.
            if (!state) {
                const response = await fetchImpl(origin + '/support', {
                    redirect: 'error', signal: AbortSignal.timeout(15000),
                });
                const html = await readForm(response);
                state = html.match(/<input\b[^>]*name="state"[^>]*value="([A-Za-z0-9_.-]+)"/i)?.[1];
                if (!state) throw new Error('Support is unavailable right now. Please try again later.');
            }

            // Request the approval redirect without following it or sending payment details to the renderer.
            const response = await fetchImpl(origin + '/support/checkout', {
                method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(30000),
                headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: origin },
                body: new URLSearchParams({ state, amount, kind }).toString(),
            });
            if (response.status !== 303) {
                await response.body?.cancel();
                const message = response.status === 400
                    ? 'This checkout expired. Reopen Support to start again.'
                    : 'PayPal is unavailable right now. Retry this checkout.';
                throw new Error(message);
            }

            // Never open an arbitrary URL returned by a failed or misconfigured backend.
            const approval = new URL(response.headers.get('location'));
            await response.body?.cancel();
            if (approval.origin !== paypal || approval.username || approval.password) {
                throw new Error('Unexpected PayPal checkout address.');
            }
            await openExternal(approval.href);
            return { opened: true };
        } catch (error) {
            // Show only our fixed messages, never provider URLs, tokens or response bodies.
            const messages = [
                'Support is unavailable right now. Please try again later.',
                'Unexpected checkout response.',
                'This checkout expired. Reopen Support to start again.',
                'PayPal is unavailable right now. Retry this checkout.',
                'Unexpected PayPal checkout address.',
            ];
            return { error: messages.includes(error.message) ? error.message : 'Could not open PayPal. Please retry this checkout.' };
        } finally {
            busy = false;
        }
    }

    return {
        start,
        info: () => ({ sandbox }),
        manage: () => openExternal(paypal + '/myaccount/autopay/'),
    };
}

module.exports = { supportAmount, createSupportCheckout };
