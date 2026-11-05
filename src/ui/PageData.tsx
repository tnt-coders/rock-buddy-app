import { QueryClient, QueryClientProvider, useIsFetching } from '@tanstack/react-query';
import { useEffect, useRef, useState, type ReactNode } from 'react';

// Keep page reads in memory for this login only; rapid navigation reuses recent results.
export function PageDataProvider({ children }: { children: ReactNode }) {
    const [client] = useState(() => new QueryClient({
        defaultOptions: {
            queries: {
                staleTime: 15_000,
                gcTime: 10 * 60_000,
                retry: false,
                refetchOnWindowFocus: false,
                refetchOnReconnect: true,
                networkMode: 'always',
            },
        },
    }));
    const generation = useRef(0);

    // Electron can regain focus without changing document visibility.
    useEffect(() => {
        const refreshLive = () => {
            void client.refetchQueries({
                queryKey: ['resource'],
                type: 'active',
                predicate: query => query.meta?.live === true,
            }, { cancelRefetch: false });
        };
        window.addEventListener('focus', refreshLive);
        return () => window.removeEventListener('focus', refreshLive);
    }, [client]);

    // Discard private data on logout, without clearing it during Strict Mode's test remount.
    useEffect(() => {
        const current = ++generation.current;
        return () => {
            queueMicrotask(() => {
                if (generation.current === current) {
                    client.clear();
                }
            });
        };
    }, [client]);

    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

// A fixed indicator does not move the existing content while a page refreshes.
export function PageLoadingIndicator() {
    const fetching = useIsFetching({
        queryKey: ['resource'],
        predicate: query => query.getObserversCount() > 0,
    });
    return fetching > 0
        ? <div className="page-loading-indicator" role="status" aria-label="Loading page data" />
        : null;
}

// Account edits can change names in profiles, rankings, and score tables at the same time.
export async function invalidatePageData(client: QueryClient) {
    await client.cancelQueries({ queryKey: ['resource'] });
    await client.invalidateQueries({ queryKey: ['resource'], refetchType: 'none' });
}
