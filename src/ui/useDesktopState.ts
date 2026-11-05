import { useEffect, useState } from 'react';

// Subscribe before requesting the snapshot so a newer event cannot be overwritten.
export function useDesktopState<State>(
    getState: () => Promise<State>,
    subscribe: (callback: (state: State) => void) => () => void,
) {
    const [state, setState] = useState<State | null>(null);

    useEffect(() => {
        let mounted = true;
        let receivedEvent = false;
        const unsubscribe = subscribe((next) => {
            receivedEvent = true;
            if (mounted) setState(next);
        });

        getState()
            .then((initial) => {
                if (mounted && !receivedEvent) setState(initial);
            })
            .catch(() => {
                console.warn('Could not read desktop status. Waiting for the next status event.');
            });

        // Navigation must not leave event listeners updating a screen that has closed.
        return () => {
            mounted = false;
            unsubscribe();
        };
    }, [getState, subscribe]);

    return state;
}
