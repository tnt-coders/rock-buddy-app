import './dom';
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { StrictMode, type ReactNode } from 'react';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { focusManager, timeoutManager, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { PageDataProvider, PageLoadingIndicator } from '../../src/ui/PageData';
import { useResource } from '../../src/ui/useResource';
import { AsyncState } from '../../src/ui/AsyncState';
import { SearchPage } from '../../src/search/SearchPage';
import { SessionProvider, useSession } from '../../src/ui/Session';
import { PagePrefetchProvider, prefetchPage, usePagePrefetch } from '../../src/ui/PagePrefetch';
import { rankSummary, pageResources } from '../../src/ui/pageResources';

// Cache expiry timers must not keep a completed Node test process alive.
timeoutManager.setTimeoutProvider({
    setTimeout: (callback, delay) => setTimeout(callback, delay).unref(),
    clearTimeout: handle => clearTimeout(handle),
    setInterval: (callback, delay) => setInterval(callback, delay).unref(),
    clearInterval: handle => clearInterval(handle),
});

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
    return { promise, resolve, reject };
}

afterEach(() => {
    cleanup();
    sessionStorage.clear();
    focusManager.setFocused(undefined);
});

test('prefetched rankings render immediately and revalidate on entry, focus and upload invalidation', async () => {
    const auth = { user_id: 1, api_key: 'synthetic' };
    let client!: QueryClient;
    let calls = 0;
    let response: Promise<any> = Promise.resolve({ overall: [{ username: 'Earlier leader' }] });
    window.api = {
        getHost: async () => 'https://example.invalid',
        getVersion: async () => '1.12.0-beta.9',
        requestBackend: async () => { calls++; return response; },
    } as unknown as typeof window.api;
    function Capture() { client = useQueryClient(); return null; }
    function Rankings() {
        const ranks = useResource(rankSummary(auth));
        return <><AsyncState {...ranks} /><span>{ranks.data?.overall[0]?.username}</span></>;
    }
    const tree = (visible: boolean) => <PageDataProvider><Capture /><PageLoadingIndicator />
        {visible && <Rankings />}
    </PageDataProvider>;
    const view = render(tree(false));
    const preload = deferred<any>();
    response = preload.promise;
    let warming!: Promise<void>;
    act(() => { warming = prefetchPage(client, '/rank', auth); });
    await waitFor(() => assert.equal(calls, 1));
    assert.ok(!screen.queryByRole('status', { name: 'Loading page data' }));
    await act(async () => { preload.resolve({ overall: [{ username: 'Earlier leader' }] }); await warming; });
    await prefetchPage(client, '/rank', auth);
    assert.equal(calls, 1);

    const fresh = deferred<any>();
    response = fresh.promise;
    view.rerender(tree(true));
    assert.ok(screen.getByText('Earlier leader'));
    assert.ok(!screen.queryByRole('status', { name: 'Loading' }));
    await waitFor(() => assert.equal(calls, 2));
    await act(async () => fresh.resolve({ overall: [{ username: 'Current leader' }] }));
    await screen.findByText('Current leader');

    response = Promise.resolve({ overall: [{ username: 'Focused leader' }] });
    fireEvent.focus(window);
    await screen.findByText('Focused leader');
    assert.equal(calls, 3);
    response = Promise.resolve({ overall: [{ username: 'After upload' }] });
    await act(async () => { await client.invalidateQueries({ queryKey: ['resource', 'ranks:1'] }); });
    await screen.findByText('After upload');
    assert.equal(calls, 4);
});

test('navigation intent warms only safe reads and shares requests; session disposal discards late prefetch', async () => {
    const auth = { user_id: 1, api_key: 'synthetic' };
    const pending = deferred<any>();
    let reads = 0;
    const clients: QueryClient[] = [];
    window.api = {
        getHost: async () => 'https://example.invalid',
        getVersion: async () => '1.12.0-beta.9',
        requestBackend: async () => { reads++; return pending.promise; },
    } as unknown as typeof window.api;
    function Capture() { const client = useQueryClient(); if (!clients.includes(client)) clients.push(client); return null; }
    const tree = (session: string) => <PageDataProvider key={session}><Capture /></PageDataProvider>;
    const view = render(tree('first'));
    let preloads!: Promise<void[]>;
    act(() => { preloads = Promise.all([
        prefetchPage(clients[0], '/account', auth), prefetchPage(clients[0], '/account', auth),
    ]); });
    await waitFor(() => assert.equal(reads, 1));
    for (const path of ['/config', '/sniffer', '/support', '/account/password', '/search']) {
        assert.equal(pageResources(path, auth).length, 0);
    }
    view.rerender(tree('other'));
    await act(async () => { pending.resolve({ username: 'Private account' }); await preloads; });
    assert.equal(clients[0].getQueryCache().getAll().length, 0);
    assert.equal(clients[1].getQueryCache().getAll().length, 0);
});

test('signed-in startup warms page reads once and hover/focus reuse them', async () => {
    const calls: string[] = [];
    window.api = {
        storeGet: async () => ({ user_id: 1, api_key: 'synthetic' }),
        getHost: async () => 'https://example.invalid',
        getVersion: async () => '1.12.0-beta.9',
        requestBackend: async (url: string) => {
            if (url.endsWith('authenticate.php')) return { success: true };
            if (url.endsWith('check_account_activation.php')) return { activated: true };
            calls.push(url.split('/').pop()!);
            return {};
        },
    } as unknown as typeof window.api;
    function Navigation() {
        const prefetch = usePagePrefetch();
        return <button onMouseEnter={() => prefetch('/account')} onFocus={() => prefetch('/account')}>Account preview</button>;
    }
    render(<StrictMode><SessionProvider><PagePrefetchProvider><Navigation /></PagePrefetchProvider></SessionProvider></StrictMode>);
    await waitFor(() => assert.equal(calls.length, 4), { timeout: 2000 });
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Account preview' }));
    fireEvent.focus(screen.getByRole('button', { name: 'Account preview' }));
    await act(async () => {});
    assert.equal(calls.filter(call => call === 'get_account_info.php').length, 1);
    assert.deepEqual([...calls].sort(), ['get_account_info.php', 'get_ranks_top3.php', 'get_user_profile_data.php', 'get_user_stats.php'].sort());
});

function Resource({ read }: { read: () => Promise<string> }) {
    const result = useResource('profile:1', read);
    return <>
        <AsyncState {...result} retry={result.reload} />
        <div>{result.data}</div>
        <button onClick={result.reload}>Refresh</button>
    </>;
}

test('initial loading has a placeholder, and refresh failures keep previously loaded content', async () => {
    const first = deferred<string>();
    let response = first.promise;
    render(<PageDataProvider><Resource read={() => response} /></PageDataProvider>);
    assert.ok(screen.getByRole('status', { name: 'Loading' }));
    await act(async () => first.resolve('Saved profile'));
    await screen.findByText('Saved profile');

    const refresh = deferred<string>();
    response = refresh.promise;
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    assert.ok(screen.getByText('Saved profile'));
    assert.ok(!screen.queryByRole('status', { name: 'Loading' }));
    await act(async () => refresh.reject(new Error('Offline')));
    await screen.findByText('Showing previous data. Offline');
    assert.ok(screen.getByText('Saved profile'));

    response = Promise.resolve('New profile');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByText('New profile');
    assert.ok(!screen.queryByRole('alert'));
});

test('quick navigation reuses an in-flight read and then returns cached data immediately', async () => {
    const first = deferred<string>();
    let calls = 0;
    const read = () => { calls++; return first.promise; };
    const tree = (visible: boolean) => <StrictMode><PageDataProvider>
        {visible && <Resource read={read} />}
    </PageDataProvider></StrictMode>;
    const view = render(tree(true));
    await waitFor(() => assert.equal(calls, 1));
    view.rerender(tree(false));
    view.rerender(tree(true));
    assert.equal(calls, 1);
    await act(async () => first.resolve('Cached profile'));
    await screen.findByText('Cached profile');
    view.rerender(tree(false));
    view.rerender(tree(true));
    assert.ok(screen.getByText('Cached profile'));
    assert.ok(!screen.queryByRole('status', { name: 'Loading' }));
    assert.equal(calls, 1);
});

test('stale data remains visible when navigation starts a background refresh', async () => {
    let client!: QueryClient;
    function Capture({ children }: { children: ReactNode }) {
        client = useQueryClient();
        return children;
    }
    const next = deferred<string>();
    let response = Promise.resolve('Old data');
    const tree = (visible: boolean) => <PageDataProvider><Capture>
        {visible && <Resource read={() => response} />}
    </Capture></PageDataProvider>;
    const view = render(tree(true));
    await screen.findByText('Old data');
    view.rerender(tree(false));
    response = next.promise;
    await act(async () => { await client.invalidateQueries({ refetchType: 'none' }); });
    view.rerender(tree(true));
    assert.ok(screen.getByText('Old data'));
    assert.ok(!screen.queryByRole('status', { name: 'Loading' }));
    await act(async () => next.resolve('Current data'));
    await screen.findByText('Current data');
});

test('changing login discards private cache and late responses cannot repopulate it', async () => {
    const clients: QueryClient[] = [];
    function Capture() {
        const client = useQueryClient();
        if (!clients.includes(client)) clients.push(client);
        return null;
    }
    const pending = deferred<string>();
    const tree = (session: string, read: () => Promise<string>) => (
        <PageDataProvider key={session}><Capture /><Resource read={read} /></PageDataProvider>
    );
    const view = render(tree('first-login', () => Promise.resolve('Private data')));
    await screen.findByText('Private data');
    view.rerender(tree('first-login', () => pending.promise));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    view.rerender(tree('next-login', () => Promise.resolve('Other account')));
    assert.ok(!screen.queryByText('Private data'));
    await screen.findByText('Other account');
    await act(async () => pending.resolve('Late private data'));
    assert.equal(clients[0].getQueryCache().getAll().length, 0);
    assert.ok(!screen.queryByText('Late private data'));
});

test('saving an edit cancels stale reads before replacing cached data', async () => {
    const pending = deferred<string>();
    let response = Promise.resolve('Old name');
    const view = renderHook(() => useResource('profile:1', () => response), { wrapper: PageDataProvider });
    await waitFor(() => assert.equal(view.result.current.data, 'Old name'));
    response = pending.promise;
    act(() => view.result.current.reload());
    await act(async () => { await view.result.current.setData('Saved name'); });
    await act(async () => pending.resolve('Old name from slow request'));
    await waitFor(() => assert.equal(view.result.current.data, 'Saved name'));
});

test('search text and results survive navigation without rerunning the same search', async () => {
    let searches = 0;
    window.api = {
        storeGet: async () => ({ user_id: 1, api_key: 'synthetic' }),
        getHost: async () => 'https://example.invalid',
        getVersion: async () => '1.12.0-beta1',
        requestBackend: async (url: string) => {
            if (url.endsWith('authenticate.php')) return { success: true };
            if (url.endsWith('check_account_activation.php')) return { activated: true };
            searches++;
            return [{ artist: 'Rush', title: 'YYZ', album: 'Moving Pictures', year: 1981 }];
        },
    } as unknown as typeof window.api;
    function SignedIn({ visible }: { visible: boolean }) {
        const { state } = useSession();
        return state.auth && visible ? <SearchPage /> : null;
    }
    const tree = (visible: boolean) => <SessionProvider><SignedIn visible={visible} /></SessionProvider>;
    const view = render(tree(true));
    const input = await screen.findByRole('textbox', { name: 'Search songs' });
    fireEvent.change(input, { target: { value: 'YYZ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await screen.findByRole('button', { name: 'YYZ' });
    view.rerender(tree(false));
    view.rerender(tree(true));
    assert.equal((screen.getByRole('textbox', { name: 'Search songs' }) as HTMLInputElement).value, 'YYZ');
    assert.ok(screen.getByRole('button', { name: 'YYZ' }));
    assert.equal(searches, 1);
});
