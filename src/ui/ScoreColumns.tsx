import { useState } from 'react';
import { Modal } from './Modal';

const columns = [
    { id: 'rank', label: 'Rank' },
    { id: 'username', label: 'Username' },
    { id: 'lastPlayed', label: 'Last Played' },
    { id: 'playCount', label: 'Play Count' },
    { id: 'streak', label: 'Streak' },
    { id: 'mastery', label: 'Mastery' },
    { id: 'score', label: 'Score' },
] as const;

export type ScoreColumn = (typeof columns)[number]['id'];

export type ColumnWidths = Record<ScoreColumn, number>;
export const MIN_COLUMN_WIDTH = 64;
export const MAX_COLUMN_WIDTH = 800;
const defaultWidths: ColumnWidths = {
    rank: 64, username: 180, lastPlayed: 190, playCount: 110,
    streak: 90, mastery: 130, score: 150,
};

// Only known columns and reasonable pixel widths are restored from local settings.
function readColumnWidths(key: string): ColumnWidths | null {
    const widths = { ...defaultWidths };
    let customized = false;
    try {
        const saved = JSON.parse(window.localStorage.getItem(key) || '{}');
        for (const { id } of columns) {
            const value = saved?.[id];
            if (Number.isInteger(value) && value >= MIN_COLUMN_WIDTH && value <= MAX_COLUMN_WIDTH) {
                widths[id] = value;
                customized = true;
            }
        }
    } catch {
        // Missing or damaged settings use the normal layout.
    }
    return customized ? widths : null;
}

export const tableFonts = {
    default: { label: 'Default monospace', family: '"Roboto Mono", monospace' },
    system: { label: 'System', family: 'system-ui, sans-serif' },
    arial: { label: 'Arial', family: 'Arial, Helvetica, sans-serif' },
    georgia: { label: 'Georgia', family: 'Georgia, "Times New Roman", serif' },
    courier: { label: 'Courier New', family: '"Courier New", Courier, monospace' },
};
export type TableFont = keyof typeof tableFonts;
const defaultOrder: ScoreColumn[] = columns.map(column => column.id);

// Remove unknown or duplicate IDs and append columns added since settings were saved.
function normalizeOrder(saved: unknown): ScoreColumn[] {
    const known = Array.isArray(saved) ? saved.filter((id): id is ScoreColumn => defaultOrder.includes(id)) : [];
    return [...new Set([...known, ...defaultOrder])];
}

// Restore the saved column order or use the defaults when it cannot be read.
function readOrder(key: string) {
    try {
        return normalizeOrder(JSON.parse(window.localStorage.getItem(key) || 'null'));
    } catch {
        return [...defaultOrder];
    }
}

// Accept only one of the supported table fonts from saved settings.
function readFont(key: string): TableFont {
    try {
        const saved = window.localStorage.getItem(key);
        return saved && Object.hasOwn(tableFonts, saved) ? saved as TableFont : 'default';
    } catch {
        return 'default';
    }
}

// Both game modes share column order while leaving their unused fields saved.
export function scoreColumns(mode: string, order: ScoreColumn[] = defaultOrder) {
    return normalizeOrder(order).map(id => columns.find(column => column.id === id)!)
        .filter(({ id }) => mode === 'las' ? id !== 'score' : id !== 'streak' && id !== 'mastery');
}

// Ignore outdated or invalid preferences, and always leave the username visible.
function readHiddenColumns(key: string): ScoreColumn[] {
    try {
        const saved: unknown = JSON.parse(window.localStorage.getItem(key) ?? '[]');
        if (!Array.isArray(saved)) {
            return [];
        }
        return columns
            .filter(({ id }) => id !== 'username' && saved.includes(id))
            .map(({ id }) => id);
    } catch {
        return [];
    }
}

// SnifferView is keyed by account so a login change gets its own saved preferences.
export function useSnifferColumns(userId: number) {
    const key = `sniffer-hidden-columns:${userId}`;
    const [hidden, setHidden] = useState(() => readHiddenColumns(key));
    const widthKey = `sniffer-column-widths:${userId}`;
    const [widths, setWidths] = useState(() => readColumnWidths(widthKey));
    const orderKey = `sniffer-column-order:${userId}`;
    const fontKey = `sniffer-table-font:${userId}`;
    const [order, setOrder] = useState(() => readOrder(orderKey));
    const [font, setFont] = useState(() => readFont(fontKey));
    const [error, setError] = useState('');

    // Apply visible-column choices immediately and try to save them for next time.
    function change(next: ScoreColumn[]) {
        setHidden(next);
        setError('');
        try {
            window.localStorage.setItem(key, JSON.stringify(next));
        } catch {
            setError("Couldn't save column choices for next time.");
        }
    }

    // Dragging updates the view immediately; only the completed adjustment is saved.
    function resize(id: ScoreColumn, width: number, save: boolean, measured?: Partial<ColumnWidths>) {
        const next = { ...defaultWidths, ...measured, ...widths, [id]: width };
        setWidths(next);
        if (save) saveWidths(next);
    }

    // Persist a completed resize without undoing the visible layout if storage fails.
    function saveWidths(next: ColumnWidths) {
        setError('');
        try {
            window.localStorage.setItem(widthKey, JSON.stringify(next));
        } catch {
            setError("Couldn't save column widths for next time.");
        }
    }

    // Return to automatic sizing without changing column visibility or order.
    function resetWidths() {
        setWidths(null);
        setError('');
        try {
            window.localStorage.removeItem(widthKey);
        } catch {
            setError("Couldn't save column widths for next time.");
        }
    }

    // Save a complete, valid column order for both game modes.
    function changeOrder(next: ScoreColumn[]) {
        const normalized = normalizeOrder(next);
        setOrder(normalized);
        setError('');
        try {
            window.localStorage.setItem(orderKey, JSON.stringify(normalized));
        } catch {
            setError("Couldn't save column order for next time.");
        }
    }

    // Dropping a header inserts it immediately before the target column.
    function reorder(from: ScoreColumn, to: ScoreColumn) {
        if (from === to) return;
        const next = order.filter(id => id !== from);
        next.splice(next.indexOf(to), 0, from);
        changeOrder(next);
    }

    // Save a supported font and apply it to the current table.
    function changeFont(next: TableFont) {
        if (!Object.hasOwn(tableFonts, next)) return;
        setFont(next);
        setError('');
        try {
            window.localStorage.setItem(fontKey, next);
        } catch {
            setError("Couldn't save the font for next time.");
        }
    }

    return { hidden, change, widths, resize, resetWidths, order, changeOrder, reorder, font, changeFont, error };
}

// Edit column visibility, order and font without leaving the Sniffer page.
export function ColumnPicker({ mode, hidden, onChange, error, onResetWidths, order, onOrderChange, font, onFontChange }: {
    mode: string;
    hidden: ScoreColumn[];
    onChange: (hidden: ScoreColumn[]) => void;
    error: string;
    onResetWidths?: () => void;
    order?: ScoreColumn[];
    onOrderChange?: (order: ScoreColumn[]) => void;
    font?: TableFont;
    onFontChange?: (font: TableFont) => void;
}) {
    const [open, setOpen] = useState(false);
    const available = scoreColumns(mode, order);

    // Swap adjacent visible-mode entries without losing the other mode's columns.
    function move(index: number, direction: number) {
        const next = [...(order || defaultOrder)];
        const from = next.indexOf(available[index].id);
        const to = next.indexOf(available[index + direction].id);
        [next[from], next[to]] = [next[to], next[from]];
        onOrderChange?.(next);
    }

    return (
        <>
            <button onClick={() => setOpen(true)} aria-haspopup="dialog">Columns</button>
            {open && (
                <Modal title="Columns" className="column-picker-dialog" onClose={() => setOpen(false)}>
                    <div className="column-options">
                        {available.map(({ id, label }, index) => (
                            <div className="column-option" key={id}>
                                <label>
                                    <input
                                        type="checkbox"
                                        checked={!hidden.includes(id)}
                                        disabled={id === 'username'}
                                        onChange={(event) => onChange(event.target.checked
                                            ? hidden.filter(column => column !== id)
                                            : [...hidden, id])}
                                    />
                                    {label}
                                </label>
                                {onOrderChange && <div className="column-order-controls">
                                    <button type="button" aria-label={`Move ${label} left`} title="Move left"
                                        disabled={index === 0} onClick={() => move(index, -1)}>←</button>
                                    <button type="button" aria-label={`Move ${label} right`} title="Move right"
                                        disabled={index === available.length - 1} onClick={() => move(index, 1)}>→</button>
                                </div>}
                            </div>
                        ))}
                    </div>
                    {onFontChange && <label className="column-font-choice">
                        Font
                        <select value={font || 'default'} onChange={event => onFontChange(event.target.value as TableFont)}>
                            {Object.entries(tableFonts).map(([id, option]) => <option key={id} value={id}>{option.label}</option>)}
                        </select>
                    </label>}
                    {error && <p role="alert">{error}</p>}
                    <div className="column-picker-actions">
                        <button onClick={() => onChange([])}>Show all</button>
                        {onResetWidths && <button onClick={onResetWidths}>Reset widths</button>}
                        {onOrderChange && <button onClick={() => onOrderChange([...defaultOrder])}>Reset order</button>}
                    </div>
                </Modal>
            )}
        </>
    );
}
