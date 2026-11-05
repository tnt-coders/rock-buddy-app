// Test installations always use the website's sandbox checkout, never real payments.
function supportUrl(host, hosts) {
    if (host === hosts.production) return 'https://rock-buddy.com/support';
    if (host === hosts.beta || host === hosts.staging) return hosts.staging + '/support';
    return hosts.local + '/support';
}

// Only the bundled Team screen with its support dialog open may use checkout IPC.
function isSupportLocation(url, appPage) {
    try {
        const sender = new URL(url);
        if (sender.href.split('#')[0] !== appPage) return false;
        const route = new URL(sender.hash.slice(1), 'https://desktop.invalid');
        return route.origin === 'https://desktop.invalid' && route.pathname === '/team'
            && route.searchParams.get('support') === '1';
    } catch {
        return false;
    }
}

module.exports = { supportUrl, isSupportLocation };
