import { createContext, useCallback, useContext, useEffect, type ReactNode } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useSession } from './Session';
import { pageResources } from './pageResources';
import type { AuthData } from './api';

const PrefetchContext = createContext<(path: string) => void>(() => {});

export async function prefetchPage(client: QueryClient, path: string, auth: AuthData) {
    await Promise.all(pageResources(path, auth).map(resource => client.prefetchQuery({
        queryKey: ['resource', resource.key],
        queryFn: resource.read,
        meta: { live: resource.live === true },
        // Suppress repeated hover requests; live observers still revalidate on entry.
        staleTime: 15_000,
    })));
}

export function PagePrefetchProvider({ children }: { children: ReactNode }) {
    const { state } = useSession();
    const client = useQueryClient();
    const auth = state.status === 'ready' ? state.auth : null;
    const prefetch = useCallback((path: string) => {
        if (auth) void prefetchPage(client, path, auth);
    }, [auth, client]);

    useEffect(() => {
        if (!auth) return;
        let disposed = false;
        // Let the initial screen and gameplay setup start first. Warm only a few reads.
        const timer = setTimeout(() => {
            void (async () => {
                for (const path of ['/rank', '/profile', '/account']) {
                    if (disposed) return;
                    await prefetchPage(client, path, auth);
                }
            })();
        }, 750);
        return () => { disposed = true; clearTimeout(timer); };
    }, [auth, client]);

    return <PrefetchContext value={prefetch}>{children}</PrefetchContext>;
}

export const usePagePrefetch = () => useContext(PrefetchContext);
