import { useRef } from 'react';
import { MIN_COLUMN_WIDTH, MAX_COLUMN_WIDTH } from './ScoreColumns';

// Pointer capture keeps a drag attached to its divider even outside the header.
export function ColumnResizeHandle({ label, width, minimum = MIN_COLUMN_WIDTH, onResize }: {
    label: string;
    width: number;
    minimum?: number;
    onResize: (width: number, save: boolean) => void;
}) {
    const drag = useRef<{ pointer: number; x: number; width: number } | null>(null);
    const clamp = (value: number) => Math.round(Math.max(minimum, Math.min(MAX_COLUMN_WIDTH, value)));

    return (
        <span className="column-resize-handle" role="separator" tabIndex={0}
            aria-label={`Resize ${label}`} aria-orientation="vertical"
            aria-valuemin={minimum} aria-valuemax={MAX_COLUMN_WIDTH} aria-valuenow={width}
            title={`Drag to resize ${label}, or use the left and right arrow keys`}
            onPointerDown={event => {
                if (event.button !== 0 || drag.current) return;
                event.preventDefault();
                event.currentTarget.focus();
                event.currentTarget.setPointerCapture(event.pointerId);
                drag.current = { pointer: event.pointerId, x: event.clientX, width };
            }}
            onPointerMove={event => {
                // Preview the drag without writing settings on every pointer movement.
                const start = drag.current;
                if (!start || start.pointer !== event.pointerId) return;
                onResize(clamp(start.width + event.clientX - start.x), false);
            }}
            onPointerUp={event => {
                const start = drag.current;
                if (!start || start.pointer !== event.pointerId) return;

                // Save the completed drag once and release pointer capture.
                drag.current = null;
                onResize(clamp(start.width + event.clientX - start.x), true);
                event.currentTarget.releasePointerCapture(event.pointerId);
            }}
            onLostPointerCapture={() => {
                const start = drag.current;
                drag.current = null;

                // Cancel an interrupted drag by restoring its starting width.
                if (start) onResize(start.width, false);
            }}
            onKeyDown={event => {
                if (drag.current || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                event.preventDefault();
                const next = event.key === 'Home' ? minimum : event.key === 'End' ? MAX_COLUMN_WIDTH
                    : width + (event.key === 'ArrowRight' ? 10 : -10);
                onResize(clamp(next), true);
            }} />
    );
}
