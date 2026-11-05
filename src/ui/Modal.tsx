import { useEffect, useRef, type ReactNode } from 'react';

// Native dialogs provide focus trapping and Escape handling without extra roots.
export function Modal({
    title,
    onClose,
    children,
    className = '',
    dismissOnBackdrop = false,
}: {
    title: string;
    onClose: () => void;
    children: ReactNode;
    className?: string;
    dismissOnBackdrop?: boolean;
}) {
    const dialog = useRef<HTMLDialogElement>(null);
    const startedOutside = useRef(false);
    function outside(element: HTMLDialogElement, x: number, y: number) {
        const bounds = element.getBoundingClientRect();
        return x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom;
    }
    useEffect(() => {
        const element = dialog.current!;
        const previousFocus = document.activeElement;
        const previousOverflow = document.documentElement.style.overflow;
        document.documentElement.style.overflow = 'hidden';
        element.showModal();
        return () => {
            element.close();
            document.documentElement.style.overflow = previousOverflow;
            if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
        };
    }, []);

    return (
        <dialog ref={dialog} aria-label={title} onCancel={onClose} className={`app-dialog ${className}`}
            onPointerDown={event => {
                startedOutside.current = event.target === event.currentTarget && outside(event.currentTarget, event.clientX, event.clientY);
            }}
            onClick={event => {
                if (dismissOnBackdrop && startedOutside.current && event.target === event.currentTarget
                    && outside(event.currentTarget, event.clientX, event.clientY)) onClose();
                startedOutside.current = false;
            }}>
            <button className="close" aria-label="Close" onClick={onClose}>
                ×
            </button>
            <h2 title={title}>{title}</h2>
            {children}
        </dialog>
    );
}
