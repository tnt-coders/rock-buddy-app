import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../ui/Session';
import { useResource } from '../ui/useResource';
import { useAction } from '../ui/useAction';
import { AsyncState } from '../ui/AsyncState';
import { Modal } from '../ui/Modal';
import { useQueryClient } from '@tanstack/react-query';
import { errorMessage } from '../ui/api';
import { WindowSizeControls } from './WindowSizeControls';

const defaults = {
    always_sniff: false,
    lurk_mode: false,
    discord_rich_presence: false,
    use_external_rocksniffer: false,
    rocksniffer_host: '127.0.0.1',
    rocksniffer_port: 9002,
    addons_enabled: false,
    addons_host: 'localhost',
    addons_port: 9001,
    extra_logging: false,
    beta_testing: false,
    preferred_path: 'lead',
    preferred_path_locked: false,
    miss_sfx: 'none',
    custom_miss_sfx_path: '',
    custom_miss_sfx_multi_path: '',
    steam_user_data_path: '',
    steam_profile: '',
    rocksmith_profile: '',
};
type Settings = typeof defaults;
type BooleanSetting = {
    [K in keyof Settings]: Settings[K] extends boolean ? K : never;
}[keyof Settings];
interface ConfigData {
    settings: Settings;
    steam: Record<string, string>;
    rocksmith: Record<string, string>;
}

// Read after discovery so the automatically selected profile appears immediately.
async function readConfig(userId: number): Promise<ConfigData> {
    await window.api.resolveRocksmithConfig();
    const entries = await Promise.all(
        Object.entries(defaults).map(async ([key, fallback]) => [
            key,
            (await window.api.storeGet(`user_data.${userId}.${key}`)) ?? fallback,
        ]),
    );
    const settings = Object.fromEntries(entries) as Settings;

    // Build each profile list from the saved parent folder and Steam account.
    const steam = settings.steam_user_data_path
        ? await window.api.getSteamProfiles(settings.steam_user_data_path)
        : {};
    const rocksmith = settings.steam_profile
        ? await window.api.getRocksmithProfiles(
              settings.steam_user_data_path,
              settings.steam_profile,
          )
        : {};
    return { settings, steam, rocksmith };
}

// Edit this account's local settings while keeping rapid saves in order.
function ConfigForm({ initial, reload }: { initial: ConfigData; reload: () => void }) {
    const auth = useAuth();
    const client = useQueryClient();
    const action = useAction();
    const [settings, setSettings] = useState(initial.settings);
    const currentSettings = useRef(initial.settings);
    const saveQueue = useRef(Promise.resolve());
    const mounted = useRef(true);
    const [saveError, setSaveError] = useState<string>();
    const [pendingSaves, setPendingSaves] = useState(0);
    const [popup, setPopup] = useState<'reader' | 'advanced'>();
    const prefix = `user_data.${auth.user_id}.`;
    const pathLockLabel = `Always show ${settings.preferred_path[0].toUpperCase() + settings.preferred_path.slice(1)}`;

    useEffect(() => {
        mounted.current = true;
        return () => { mounted.current = false; };
    }, []);

    // Keep the next queued save in sync with the values currently shown in the form.
    function showSettings(next: Settings) {
        currentSettings.current = next;
        if (mounted.current) setSettings(next);
    }

    // Save one setting and apply any related changes to readers or cached pages.
    async function save<K extends keyof Settings>(key: K, value: Settings[K]) {
        const previous = currentSettings.current;
        let next = { ...previous, [key]: value };

        // Show the edit immediately without dimming every other control.
        showSettings(next);
        try {
            await window.api.storeSet(prefix + key, value);
        } catch (failure) {
            showSettings(previous);
            throw failure;
        }

        // External readers cannot verify this app's full run, so force read-only Lurk Mode.
        if (key === 'use_external_rocksniffer' && value) {
            await window.api.storeSet(prefix + 'lurk_mode', true);
            next = { ...next, lurk_mode: true };
            showSettings(next);
        }

        // Cached chart filters include the preferred path as well as available arrangements.
        if (key === 'preferred_path' || key === 'preferred_path_locked') {
            await client.invalidateQueries({
                queryKey: ['resource'],
                predicate: query => String(query.queryKey[1]).startsWith('paths:'),
                refetchType: 'none',
            });
        }

        // Restart only the addon server when its address changes.
        if (key.startsWith('addons_')) {
            await window.api.disableAddons();
            if (next.addons_enabled)
                await window.api.enableAddons(next.addons_host, Number(next.addons_port));
        }
    }

    // Queue setting changes and report a failed save without disabling the whole form.
    function change<K extends keyof Settings>(key: K, value: Settings[K]) {
        setPendingSaves(count => count + 1);

        // Apply quick edits in order so one save cannot overwrite a newer setting.
        saveQueue.current = saveQueue.current.then(async () => {
            if (!mounted.current) return;
            setSaveError(undefined);

            try {
                await save(key, value);
            } catch (failure) {
                if (mounted.current) setSaveError(errorMessage(failure));
            } finally {
                if (mounted.current) setPendingSaves(count => count - 1);
            }
        });
    }

    // Connect a boolean setting to the shared save queue.
    function checkbox(key: BooleanSetting, label: string, disabled = false) {
        return (
            <label className="checkbox-row">
                <input
                    type="checkbox"
                    checked={!!settings[key]}
                    disabled={disabled}
                    onChange={(event) => change(key, event.target.checked)}
                />
                {label}
            </label>
        );
    }

    // Save host and port edits when focus leaves the field, after checking the port.
    function address(kind: 'addons' | 'rocksniffer') {
        return (
            <div className="config-row config-address">
                <label>
                    Host:{' '}
                    <input
                        type="text"
                        className="config-host"
                        defaultValue={settings[`${kind}_host`]}
                        onBlur={(event) => {
                            if (event.target.value !== settings[`${kind}_host`])
                                change(`${kind}_host`, event.target.value);
                        }}
                    />
                </label>
                <label>
                    Port:{' '}
                    <input
                        type="number"
                        className="config-port"
                        min={1}
                        max={65535}
                        defaultValue={settings[`${kind}_port`]}
                        onBlur={(event) => {
                            const port = Number(event.target.value);
                            if (
                                Number.isInteger(port) &&
                                port > 0 &&
                                port <= 65535 &&
                                port !== Number(settings[`${kind}_port`])
                            )
                                change(`${kind}_port`, port);
                        }}
                    />
                </label>
            </div>
        );
    }

    // Finish pending saves before choosing a file or changing the Steam data folder.
    function browse(
        key: 'steam_user_data_path' | 'custom_miss_sfx_path' | 'custom_miss_sfx_multi_path',
    ) {
        void action.run(async () => {
            await saveQueue.current;
            if (!mounted.current) return;
            const path =
                key === 'custom_miss_sfx_path'
                    ? await window.api.getSFXFilePath(settings[key])
                    : await window.api.getPath(settings[key]);
            if (path === null) return;
            await save(key, path);

            // A different Steam folder invalidates both saved profile choices.
            if (key === 'steam_user_data_path') {
                await window.api.storeDelete(prefix + 'steam_profile');
                await window.api.storeDelete(prefix + 'rocksmith_profile');
                reload();
            }
        });
    }

    // Save the chosen profile and reload the choices that depend on it.
    function chooseProfile(key: 'steam_profile' | 'rocksmith_profile', value: string) {
        if (!value) return;
        void action.run(async () => {
            await saveQueue.current;
            if (!mounted.current) return;
            await save(key, value);
            if (key === 'steam_profile') await window.api.storeDelete(prefix + 'rocksmith_profile');
            reload();
        });
    }

    return (
        <>
            <AsyncState error={action.error || saveError} />
            <fieldset disabled={action.pending} aria-busy={pendingSaves > 0}>
                <div className="config-row">
                    <strong>Steam User Data Path:</strong>
                    <span className="config-path" title={settings.steam_user_data_path}>
                        {settings.steam_user_data_path || '[none selected]'}
                    </span>
                    <button className="btn-primary config-action" onClick={() => browse('steam_user_data_path')}>
                        Browse
                    </button>
                </div>
                <label className="config-row">
                    <strong>Steam Profile:</strong>
                    <select
                        value={settings.steam_profile}
                        onChange={(event) => chooseProfile('steam_profile', event.target.value)}
                    >
                        <option value="">Select Steam profile</option>
                        {Object.entries(initial.steam).map(([name, id]) => (
                            <option key={id} value={id}>
                                {name}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="config-row">
                    <strong>Rocksmith Profile:</strong>
                    <select
                        value={settings.rocksmith_profile}
                        onChange={(event) => chooseProfile('rocksmith_profile', event.target.value)}
                    >
                        <option value="">Select Rocksmith profile</option>
                        {Object.entries(initial.rocksmith).map(([name, id]) => (
                            <option key={id} value={id}>
                                {name}
                            </option>
                        ))}
                    </select>
                </label>
                <WindowSizeControls />
                <hr />
                <div className="config-row config-section-heading">
                    <h2>Sniffer</h2>
                    {checkbox('always_sniff', 'Always Sniff')}
                    {checkbox('lurk_mode', 'Lurk Mode', settings.use_external_rocksniffer)}
                    <button className="btn-primary config-action" onClick={() => setPopup('reader')}>
                        RockSniffer Config
                    </button>
                </div>
                <div className="config-row">
                    <label htmlFor="preferred-path"><strong>Preferred Path:</strong></label>
                    <select
                        id="preferred-path"
                        className="config-choice"
                        value={settings.preferred_path}
                        onChange={(event) => change('preferred_path', event.target.value)}
                    >
                        {['lead', 'rhythm', 'bass'].map((path) => (
                            <option key={path} value={path}>
                                {path[0].toUpperCase() + path.slice(1)}
                            </option>
                        ))}
                    </select>
                    <button
                        type="button"
                        className="path-lock"
                        aria-label={pathLockLabel}
                        title={pathLockLabel}
                        aria-pressed={settings.preferred_path_locked}
                        onClick={() => change('preferred_path_locked', !settings.preferred_path_locked)}
                    >
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
                            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <rect x="5" y="10" width="14" height="11" rx="2" />
                            <path d={settings.preferred_path_locked ? 'M8 10V6a4 4 0 0 1 8 0v4' : 'M8 10V6a4 4 0 0 1 8 0'} />
                            <path d="M12 14v3" />
                        </svg>
                    </button>
                </div>
                <div className="config-row config-sound">
                    <label className="config-sound-choice">
                        <strong>Miss SFX:</strong>
                        <select
                            className="config-choice"
                            value={settings.miss_sfx}
                            onChange={(event) => change('miss_sfx', event.target.value)}
                        >
                            {Object.entries({
                                none: 'None',
                                guitar_hero: 'Guitar Hero',
                                doh: 'D’oh!',
                                oof: 'Oof',
                                oof2: 'Oof 2',
                                custom: 'Custom',
                                custom_multi: 'Custom (multi)',
                            }).map(([key, name]) => (
                                <option key={key} value={key}>{name}</option>
                            ))}
                        </select>
                    </label>
                    {settings.miss_sfx.startsWith('custom') && (
                        <div className="config-custom-sound">
                            <span className="config-path">
                                {settings[
                                    settings.miss_sfx === 'custom'
                                        ? 'custom_miss_sfx_path'
                                        : 'custom_miss_sfx_multi_path'
                                ] || '[none selected]'}
                            </span>
                            <button className="btn-primary config-action"
                                onClick={() => browse(
                                    settings.miss_sfx === 'custom'
                                        ? 'custom_miss_sfx_path'
                                        : 'custom_miss_sfx_multi_path',
                                )}
                            >
                                Browse
                            </button>
                        </div>
                    )}
                </div>
                <hr />
                <div className="config-row config-section-heading">
                    <h2>Addons</h2>
                    <button className="btn-primary config-action" onClick={() => window.api.openAddonsFolder()}>
                        Open Addons Folder
                    </button>
                </div>
                {checkbox('addons_enabled', 'Enabled (starts a local web server)')}
                {address('addons')}
                <hr />
                <div className="config-row config-section-heading">
                    <h2>Other</h2>
                    <button className="btn-primary config-action" onClick={() => setPopup('advanced')}>
                        Advanced Config
                    </button>
                </div>
                {checkbox('extra_logging', 'Extra Logging')}
            </fieldset>
            {popup && (
                <Modal
                    title={popup === 'reader' ? 'RockSniffer Config' : 'Advanced Config'}
                    onClose={() => setPopup(undefined)}
                >
                    <fieldset disabled={action.pending} aria-busy={pendingSaves > 0}>
                        {popup === 'reader' ? (
                            <>
                                <p>Restart Rock Buddy for reader settings to take effect.</p>
                                {checkbox('discord_rich_presence', 'Discord Rich Presence')}
                                <h3>Advanced Settings</h3>
                                {checkbox(
                                    'use_external_rocksniffer',
                                    'Use External RockSniffer (turns on Lurk Mode)',
                                )}
                                {address('rocksniffer')}
                            </>
                        ) : (
                            checkbox('beta_testing', 'Beta Testing')
                        )}
                        <AsyncState error={action.error || saveError} />
                    </fieldset>
                </Modal>
            )}
        </>
    );
}

// Reload local settings whenever Config opens instead of reusing stale discovery results.
export function ConfigPage() {
    const auth = useAuth();
    // Profile discovery and editable local settings must be reread on each visit.
    const config = useResource(`config:${auth.user_id}`, () => readConfig(auth.user_id), { cache: false });
    return (
        <main className="config-page">
            <div className="page-heading">
                <h1>Config</h1>
            </div>
            <AsyncState {...config} retry={config.reload} />
            {config.data && (
                <fieldset disabled={config.refreshing || !!config.error}>
                    <ConfigForm key={config.updatedAt} initial={config.data} reload={config.reload} />
                </fieldset>
            )}
        </main>
    );
}
