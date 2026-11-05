import { useEffect, useRef, useState } from 'react';
import { errorMessage } from './api';

// Lock immediately, and ignore UI updates after leaving the screen.
export function useAction() {
    const locked = useRef(false);
    const mounted = useRef(true);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string>();
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);

    // Run one user action at a time and report its result only while the screen is mounted.
    async function run(action: () => Promise<void>) {
        if (locked.current) return;
        locked.current = true;
        setPending(true);
        setError(undefined);
        try {
            await action();
        } catch (failure) {
            if (mounted.current) setError(errorMessage(failure));
        } finally {
            locked.current = false;
            if (mounted.current) setPending(false);
        }
    }

    return { pending, error, run };
}
