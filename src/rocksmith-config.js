const path = require('node:path');
const fs = require('node:fs');

// Discover local profiles; never copy another Rock Buddy account's selected profile.
function resolveRocksmithConfig(store, userId, getSteamProfiles, getRocksmithProfiles) {
    if (!Number.isSafeInteger(userId) || userId <= 0) return null;
    const prefix = `user_data.${userId}.`;
    const savedRoot = store.get(prefix + 'steam_user_data_path');
    const savedSteam = store.get(prefix + 'steam_profile');
    const savedRocksmith = store.get(prefix + 'rocksmith_profile');

    // Reuse known Steam folders for discovery, but keep this account's profile selection.
    const roots = savedRoot ? [savedRoot] : [
        store.get('default_steam_user_data_path'),
        ...Object.values(store.get('user_data') || {}).map(user => user?.steam_user_data_path),
    ];

    // Look for existing save files that match any choices already made in Config.
    const candidates = [];
    for (const root of new Set(roots.filter(value => typeof value === 'string' && value))) {
        if (!fs.existsSync(root)) continue;
        const steamProfiles = getSteamProfiles(root);
        const steamIds = savedSteam ? [String(savedSteam)] : [...new Set(Object.values(steamProfiles))];
        for (const steam of steamIds) {
            const profiles = getRocksmithProfiles(root, steam);
            const ids = savedRocksmith ? [String(savedRocksmith)] : [...new Set(Object.values(profiles))];
            for (const profile of ids) {
                const profilePath = path.join(root, steam, '221680', 'remote', profile + '_PRFLDB');
                if (fs.existsSync(profilePath)) candidates.push({
                    steamUserDataPath: root, steamProfile: steam, rocksmithProfile: profile, profilePath,
                    profileName: Object.keys(profiles).find(name => profiles[name] === profile) || profile,
                });
            }
        }
    }
    // Ambiguous or missing profiles need an explicit choice in Config.
    if (candidates.length !== 1) return null;

    // Remember a unique match so Config and later reads use the same file.
    const result = candidates[0];
    store.set(prefix + 'steam_user_data_path', result.steamUserDataPath);
    store.set(prefix + 'steam_profile', result.steamProfile);
    store.set(prefix + 'rocksmith_profile', result.rocksmithProfile);
    return result;
}

module.exports = { resolveRocksmithConfig };
