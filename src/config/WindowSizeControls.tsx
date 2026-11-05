import { useEffect, useRef, useState } from 'react';
import { AsyncState } from '../ui/AsyncState';
import { errorMessage } from '../ui/api';
import { useResource } from '../ui/useResource';
import { MINIMUM_SIZE, MAXIMUM_SIZE } from '../window-size';

type WindowSize = { width: number; height: number };

// Read the real window dimensions each time Config opens.
export function WindowSizeControls() {
    const size = useResource('window-size', () => window.api.getWindowSize(), { cache: false });

    return (
        <div className="window-size-settings">
            <AsyncState {...size} retry={size.reload} />
            {size.data && <WindowSizeForm key={size.updatedAt} initial={size.data} />}
        </div>
    );
}

// Apply valid dimensions in order without replacing newer typing with an older result.
function WindowSizeForm({ initial }: { initial: WindowSize }) {
    const [draft, setDraft] = useState({ width: String(initial.width), height: String(initial.height) });
    const current = useRef(draft);
    const revision = useRef(0);
    const queue = useRef(Promise.resolve());
    const mounted = useRef(true);
    const [error, setError] = useState<string>();

    useEffect(() => {
        mounted.current = true;
        return () => { mounted.current = false; };
    }, []);

    // Keep incomplete typing in the form and resize only when both dimensions are valid.
    function change(field: keyof WindowSize, value: string) {
        const next = { ...current.current, [field]: value };
        current.current = next;
        setDraft(next);
        setError(undefined);
        const edit = ++revision.current;
        const width = Number(next.width);
        const height = Number(next.height);
        if (!Number.isInteger(width) || width < MINIMUM_SIZE.width || width > MAXIMUM_SIZE
            || !Number.isInteger(height) || height < MINIMUM_SIZE.height || height > MAXIMUM_SIZE) return;

        // Keep typing responsive and never let an older resize overwrite a newer edit.
        queue.current = queue.current.then(async () => {
            if (!mounted.current || edit !== revision.current) return;
            try {
                const actual = await window.api.setWindowSize({ width, height });
                if (!mounted.current || edit !== revision.current) return;
                current.current = { width: String(actual.width), height: String(actual.height) };
                setDraft(current.current);
            } catch (failure) {
                if (mounted.current && edit === revision.current) setError(errorMessage(failure));
            }
        });
    }

    return (
        <div>
            <div className="config-row window-size-row">
                <strong title="Outer window size in display-scaled pixels, including the window frame.">Window size:</strong>
                <label>Width <input type="number" min={MINIMUM_SIZE.width} max={MAXIMUM_SIZE} step={1} required
                    value={draft.width} onChange={event => change('width', event.target.value)} /></label>
                <label>Height <input type="number" min={MINIMUM_SIZE.height} max={MAXIMUM_SIZE} step={1} required
                    value={draft.height} onChange={event => change('height', event.target.value)} /></label>
            </div>
            <AsyncState error={error} />
        </div>
    );
}
