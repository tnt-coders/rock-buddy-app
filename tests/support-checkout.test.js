const assert = require('node:assert/strict');
const test = require('node:test');
const { createSupportCheckout, supportAmount } = require('../src/support-checkout');
const { HOSTS } = require('../src/backend-config');
const { isSupportLocation } = require('../src/support-link');

test('checkout accepts only the bundled Team support dialog, not another page or remote document', () => {
    const appPage = 'file:///C:/RockBuddy/src/index.html';
    assert.equal(isSupportLocation(appPage + '#/team?support=1', appPage), true);
    for (const url of [appPage + '#/team', appPage + '#/team?support=0', appPage + '#/support',
        appPage + '#/account?support=1', appPage + '#https://elsewhere.invalid/team?support=1',
        'https://elsewhere.invalid/index.html#/team?support=1', 'file:///C:/other/index.html#/team?support=1', 'invalid']) {
        assert.equal(isSupportLocation(url, appPage), false, url);
    }
});

const form = () => new Response('<input type="hidden" name="state" value="signed.form-state">', {
    headers: { 'Content-Type': 'text/html' },
});
const approval = (url = 'https://www.sandbox.paypal.com/checkoutnow?token=EXAMPLE') =>
    new Response(null, { status: 303, headers: { Location: url } });

// Capture only synthetic requests and browser launches; these tests never contact PayPal.
function fixture(responses, host = HOSTS.beta) {
    const requests = [];
    const opened = [];
    const client = createSupportCheckout(host, HOSTS, {
        fetchImpl: async (url, options) => {
            requests.push({ url, ...options });
            const response = responses.shift();
            if (response instanceof Error) throw response;
            return response;
        },
        openExternal: async url => { opened.push(url); },
    });
    return { client, requests, opened };
}

test('accepts USD cents and rejects low, malformed or excessive amounts', () => {
    for (const amount of ['0', '4.99', '-5', '5.001', '1e2', '1000000', '', null]) {
        assert.equal(supportAmount(amount), null);
    }
    assert.equal(supportAmount('5'), '5.00');
    assert.equal(supportAmount('12.34'), '12.34');
});

test('uses the current signed form flow and opens only sandbox approval for beta', async () => {
    const f = fixture([form(), approval()]);
    assert.deepEqual(await f.client.start({ amount: '5', kind: 'once' }), { opened: true });
    assert.equal(f.requests[0].url, HOSTS.staging + '/support');
    assert.equal(f.requests[1].url, HOSTS.staging + '/support/checkout');
    assert.equal(f.requests[1].headers.Origin, HOSTS.staging);
    assert.equal(f.requests[1].redirect, 'manual');
    assert.equal(new URLSearchParams(f.requests[1].body).get('state'), 'signed.form-state');
    assert.equal(new URLSearchParams(f.requests[1].body).get('amount'), '5.00');
    assert.equal(f.opened.length, 1);
    assert.deepEqual(f.client.info(), { sandbox: true });
});

test('monthly payments and management use the correct production PayPal host', async () => {
    const f = fixture([form(), approval('https://www.paypal.com/webapps/billing/subscriptions?ba_token=EXAMPLE')], HOSTS.production);
    await f.client.start({ amount: '10', kind: 'monthly' });
    assert.equal(f.requests[0].url, HOSTS.production + '/support');
    assert.equal(new URLSearchParams(f.requests[1].body).get('kind'), 'monthly');
    await f.client.manage();
    assert.equal(f.opened[1], 'https://www.paypal.com/myaccount/autopay/');
    assert.deepEqual(f.client.info(), { sandbox: false });
});

test('retries reuse checkout state after an ambiguous network failure', async () => {
    const f = fixture([form(), new Error('private provider URL'), approval()]);
    const input = { amount: '5', kind: 'once' };
    const failed = await f.client.start(input);
    assert.equal(failed.error, 'Could not open PayPal. Please retry this checkout.');
    assert.deepEqual(await f.client.start(input), { opened: true });
    assert.equal(f.requests.length, 3);
    assert.equal(f.requests[1].body, f.requests[2].body);
});

test('refuses arbitrary URLs and live approvals from a test backend', async () => {
    for (const url of ['https://evil.example/', 'javascript:alert(1)', 'https://www.paypal.com/checkoutnow', 'https://x:y@www.sandbox.paypal.com/checkoutnow']) {
        const f = fixture([form(), approval(url)]);
        assert.ok((await f.client.start({ amount: '5', kind: 'once' })).error);
        assert.equal(f.opened.length, 0);
    }
});

test('invalid inputs, unavailable support, oversized forms and missing state fail closed', async () => {
    const invalid = fixture([]);
    assert.ok((await invalid.client.start({ amount: '4', kind: 'once' })).error);
    assert.equal(invalid.requests.length, 0);
    for (const response of [
        new Response('', { status: 503 }),
        new Response('x'.repeat(65537), { headers: { 'Content-Type': 'text/html' } }),
        new Response('<form></form>', { headers: { 'Content-Type': 'text/html' } }),
    ]) {
        const f = fixture([response]);
        assert.ok((await f.client.start({ amount: '5', kind: 'once' })).error);
        assert.equal(f.requests.length, 1);
        assert.equal(f.opened.length, 0);
    }
});

test('prevents concurrent checkout submissions and never retries automatically', async () => {
    let resolve;
    let calls = 0;
    const client = createSupportCheckout(HOSTS.beta, HOSTS, {
        fetchImpl: () => { calls++; return new Promise(done => { resolve = done; }); },
        openExternal: async () => {},
    });
    const first = client.start({ amount: '5', kind: 'once' });
    assert.deepEqual(await client.start({ amount: '5', kind: 'once' }), { error: 'Checkout is already opening.' });
    resolve(new Response('', { status: 503 }));
    await first;
    assert.equal(calls, 1);
});

test('rejected checkout responses never open a browser or report payment success', async () => {
    for (const code of [400, 403, 429, 502, 503]) {
        const f = fixture([form(), new Response('private provider data', { status: code })]);
        const result = await f.client.start({ amount: '5', kind: 'once' });
        assert.ok(result.error);
        assert.equal(result.opened, undefined);
        assert.equal(f.opened.length, 0);
        assert.ok(!result.error.includes('private'));
    }
});
