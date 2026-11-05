const { createHash } = require('node:crypto');

const HOSTS = Object.freeze({
    production: 'https://rock-buddy.com',
    staging: 'https://rock-buddy-site-staging.tntmusicstudios-c64.workers.dev',
    beta: 'https://rock-buddy-site-rehearsal.tntmusicstudios-c64.workers.dev',
    local: 'http://localhost:8787',
});

// Choose the backend and keep non-production settings separate from the regular app.
function resolveBackend(args = [], packagedBackend = "production") {
    if (!["production", "staging", "beta"].includes(packagedBackend)) throw new Error("Unknown packaged backend.");
    const selectors = args.filter(arg => arg.startsWith('--backend=') || !arg.startsWith('-'));
    if (args.includes('--backend') || selectors.length > 1) {
        throw new Error('Use one --backend=production|staging|beta|local selector or one backend URL.');
    }

    // Resolve a named environment or explicit origin after rejecting conflicting selectors.
    const selected = selectors[0] || `--backend=${packagedBackend}`;
    const name = selected.startsWith('--backend=') ? selected.slice(10) : null;
    if (name !== null && !Object.hasOwn(HOSTS, name)) {
        throw new Error('Unknown Rock Buddy backend.');
    }
    const url = new URL(name === null ? selected : HOSTS[name]);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password ||
        url.pathname !== '/' || url.search || url.hash) {
        throw new Error('The backend must be an HTTP(S) origin without credentials, path, or query.');
    }
    const host = url.origin;

    // Keep rehearsal and staging installers locked to their intended backend.
    if (packagedBackend === "staging" && host !== HOSTS.staging) {
        throw new Error("Rock Buddy Staging only connects to staging.");
    }
    if (packagedBackend === "beta" && host !== HOSTS.beta) {
        throw new Error("Rock Buddy Beta only connects to the beta test backend.");
    }

    // Preserve the regular app store and isolate every other origin in its own store.
    if (host === HOSTS.production) return { host, storeOptions: {}, webPreferences: {} };
    const suffix = host === HOSTS.beta ? 'beta' :
        host === HOSTS.staging ? 'staging' :
        host === HOSTS.local ? 'local' : createHash('sha256').update(host).digest('hex').slice(0, 16);
    return {
        host,
        storeOptions: { name: `config-${suffix}` },
        webPreferences: { partition: `persist:rock-buddy-${suffix}` },
    };
}

module.exports = { HOSTS, resolveBackend };
