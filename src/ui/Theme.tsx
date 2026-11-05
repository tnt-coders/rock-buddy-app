import { createContext, useContext, useState, type CSSProperties, type ReactNode } from 'react';
import { Modal } from './Modal';

const themes = ['dark', 'light', 'classic', 'streamer'];
const colorFields = [
    ['background', 'Background', 'streamer-color'],
    ['text', 'Text', 'streamer-text-color'],
    ['accent', 'Accent', 'streamer-accent-color'],
    ['panel', 'Panels', 'streamer-panel-color'],
] as const;
type ColorSetting = typeof colorFields[number][0];
type CustomTheme = Record<ColorSetting, string> & { radius: number };
const defaults: CustomTheme = {
    background: '#ffffff',
    text: '#000000',
    accent: '#65349b',
    panel: '#f0edf5',
    radius: 6,
};

// Keep existing background/text preferences and ignore malformed saved colors.
function readCustomTheme(): CustomTheme {
    const custom = { ...defaults };
    for (const [field, , key] of colorFields) {
        const saved = localStorage.getItem(key);
        if (saved && /^#[0-9a-f]{6}$/i.test(saved)) custom[field] = saved;
    }
    if (!localStorage.getItem('streamer-panel-color')) custom.panel = custom.background;
    const radius = localStorage.getItem('streamer-radius');
    if (radius !== null && [0, 6, 12].includes(Number(radius))) custom.radius = Number(radius);
    return custom;
}

// Choose readable text for buttons and selected items filled with the accent color.
function accentText(color: string) {
    const channels = [1, 3, 5].map(offset => {
        const channel = parseInt(color.slice(offset, offset + 2), 16) / 255;
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    return luminance > 0.179 ? '#000000' : '#ffffff';
}

const ThemeContext = createContext<{
    theme: string;
    custom: CustomTheme;
    setTheme: (theme: string) => void;
    setCustom: (custom: CustomTheme) => void;
} | null>(null);

// Restore the saved theme and share theme changes across the app.
export function ThemeProvider({ children }: { children: ReactNode }) {
    const [theme, updateTheme] = useState(() => {
        const saved = localStorage.getItem('theme') || 'dark';
        return themes.includes(saved) ? saved : 'dark';
    });
    const [custom, updateCustom] = useState(readCustomTheme);

    // Save only supported themes before updating the visible selection.
    function setTheme(next: string) {
        if (!themes.includes(next)) return;
        localStorage.setItem('theme', next);
        updateTheme(next);
    }

    // Theme changes are local and apply immediately without a backend save.
    function setCustom(next: CustomTheme) {
        for (const [field, , key] of colorFields) localStorage.setItem(key, next[field]);
        localStorage.setItem('streamer-radius', String(next.radius));
        updateCustom(next);
    }

    // Expose custom colors as shared CSS variables so every screen uses the same palette.
    const style = theme === 'streamer' ? ({
        '--streamer-color': custom.background,
        '--streamer-text-color': custom.text,
        '--streamer-accent-color': custom.accent,
        '--streamer-accent-text': accentText(custom.accent),
        '--streamer-panel-color': custom.panel,
        '--streamer-radius': `${custom.radius}px`,
        background: custom.background,
        color: custom.text,
    } as CSSProperties) : undefined;

    return (
        <ThemeContext value={{ theme, custom, setTheme, setCustom }}>
            <link rel="stylesheet" href={`./common/${theme}-theme.css`} />
            <div className="app-shell" data-theme={theme} style={style}>
                {children}
            </div>
        </ThemeContext>
    );
}

// A native dropdown opens directly from the paintbrush and handles keyboard navigation.
export function HeaderThemeChooser() {
    const value = useContext(ThemeContext)!;
    const [editing, setEditing] = useState(false);

    // Open the custom editor only for Customize, not every time Custom is selected.
    function chooseTheme(next: string) {
        if (next === 'customize') {
            value.setTheme('streamer');
            setEditing(true);
            return;
        }

        value.setTheme(next);
    }

    return (
        <div className="header-theme-chooser">
            <label className="header-theme-trigger" title="Theme">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="m14 6 4 4M10 14l10-10a2.1 2.1 0 0 1 3 3L13 17M10 14l3 3M10 14c-3-2-6 0-6 3 0 2-1 3-2 4 5 1 10-1 11-4" transform="translate(-1 -1)" />
                </svg>
                <select aria-label="Choose theme" value={value.theme}
                    onChange={event => chooseTheme(event.target.value)}>
                    <option value="dark">Dark</option>
                    <option value="light">Light</option>
                    <option value="classic">Retro</option>
                    <option value="streamer">Custom</option>
                    <option value="customize">Customize…</option>
                </select>
            </label>
            {editing && (
                <Modal title="Custom theme" className="custom-theme-dialog" onClose={() => setEditing(false)}>
                    <div className="custom-theme-fields">
                        {colorFields.map(([field, label]) => (
                            <label key={field} className="custom-theme-color">
                                <span>{label}</span>
                                <code>{value.custom[field]}</code>
                                <input type="color" aria-label={label} value={value.custom[field]}
                                    onChange={event => value.setCustom({ ...value.custom, [field]: event.target.value })} />
                            </label>
                        ))}
                        <label className="custom-theme-corners">
                            Corners
                            <select value={value.custom.radius}
                                onChange={event => value.setCustom({ ...value.custom, radius: Number(event.target.value) })}>
                                <option value={0}>Square</option>
                                <option value={6}>Soft</option>
                                <option value={12}>Rounded</option>
                            </select>
                        </label>
                    </div>
                    <div className="custom-theme-actions">
                        <button type="button" onClick={() => value.setCustom({ ...defaults })}>Reset defaults</button>
                        <button type="button" onClick={() => setEditing(false)}>Done</button>
                    </div>
                </Modal>
            )}
        </div>
    );
}
