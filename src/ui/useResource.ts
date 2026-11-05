import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { errorMessage } from './api';
import type { Resource } from './pageResources';

type Options = Pick<Resource<unknown>, 'cache' | 'live'>;

// Keep cached data visible during refreshes, but never borrow data from a different key.
export function useResource<T>(resource: Resource<T>): ReturnType<typeof useResourceValue<T>>;
export function useResource<T>(key: string, read: () => Promise<T>, options?: Options): ReturnType<typeof useResourceValue<T>>;
export function useResource<T>(resource: string | Resource<T>, read?: () => Promise<T>, options?: Options) {
    return useResourceValue(typeof resource === 'string' ? { key: resource, read: read!, ...options } : resource);
}

function useResourceValue<T>({ key, read, ...options }: Resource<T>) {
    const client = useQueryClient();
    const query = useQuery({
        queryKey: ['resource', key],
        queryFn: read,
        // Prefetched scores can render immediately, but never delay a fresh read.
        ...(options.live ? {
            meta: { live: true },
            staleTime: 0,
            refetchOnMount: 'always' as const,
            refetchOnWindowFocus: 'always' as const,
            refetchInterval: 15_000,
            refetchIntervalInBackground: false,
        } : {}),
        ...(options.cache === false ? { staleTime: 0, gcTime: 0 } : {}),
    });

    // Repeated refresh clicks share an existing request instead of starting competing reads.
    const reload = useCallback(() => {
        void client.refetchQueries({ queryKey: ['resource', key], exact: true }, { cancelRefetch: false });
    }, [client, key]);

    // A successful edit replaces the cache after cancelling any older in-flight read.
    const setData = useCallback(async (data: T) => {
        await client.cancelQueries({ queryKey: ['resource', key], exact: true });
        client.setQueryData(['resource', key], data);
    }, [client, key]);

    return {
        data: query.data,
        error: query.error ? errorMessage(query.error) : undefined,
        loading: query.isPending,
        refreshing: query.isFetching && query.data !== undefined,
        hasData: query.data !== undefined,
        updatedAt: query.dataUpdatedAt,
        reload,
        setData,
    };
}
