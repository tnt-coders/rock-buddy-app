import './dom';
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { StrictMode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import {
    act,
    cleanup,
    fireEvent,
    render,
    renderHook,
    screen,
    waitFor,
} from '@testing-library/react';
import { App } from '../../src/ui/App';
import { useResource } from '../../src/ui/useResource';
import { PageDataProvider } from '../../src/ui/PageData';
import { usernameWaitMessage } from '../../src/ui/validation';
import { rankedScores, type Score } from '../../src/ui/Leaderboard';
import { Sniffer, type SnifferState } from '../../src/sniffer/sniffer';

Object.assign(globalThis, {
    localStorage: window.localStorage,
    HTMLInputElement: window.HTMLInputElement,
    HTMLTextAreaElement: window.HTMLTextAreaElement,
});

function mockApi() {
    const stored = new Map<string, any>([['auth_data', { user_id: 1, api_key: 'synthetic' }]]);
    stored.set('support_welcome_shown', true);
    const calls: string[] = [];
    const stats = { overall: 1, lead: 1, rhythm: 0, bass: 0 };
    window.api = {
        getBetaNotice: async () => null,
        getUpdateState: async () => ({ status: 'disabled', message: '' }),
        onUpdateState: () => () => {},
        getConnectionState: async () => ({ connected: true, message: '' }),
        onConnectionState: () => () => {},
        getVersion: async () => '1.12.0-beta1',
        getWindowSize: async () => ({ width: 1024, height: 768 }),
        setWindowSize: async (size: { width: number; height: number }) => size,
        getHost: async () => 'https://example.invalid',
        storeGet: async (key: string) => stored.get(key) ?? null,
        storeSet: async (key: string, value: unknown) => {
            stored.set(key, value);
        },
        storeDelete: async (key: string) => {
            stored.delete(key);
        },
        launchRocksniffer: () => {},
        resolveRocksmithConfig: async () => {
            calls.push('prepare');
            return null;
        },
        getRocksnifferPath: async () => { throw new Error('Waiting for the test reader'); },
        logMessage: () => {},
        setGameplayActive: () => {},
        supportInfo: async () => ({ sandbox: true }),
        requestBackend: async (url: string) => {
            const endpoint = url.split('/').pop()!;
            calls.push(endpoint);
            if (endpoint === 'authenticate.php') return { success: true };
            if (endpoint === 'check_account_activation.php') return { activated: true };
            if (endpoint === 'get_account_info.php')
                return {
                    username: 'Fixture',
                    email: 'fixture@example.invalid',
                    username_change_wait_seconds: 60,
                };
            if (endpoint === 'get_user_profile_data.php')
                return { username: 'Fixture', twitch_username: null };
            if (endpoint === 'get_user_stats.php')
                return { verified_scores: stats, accuracy: stats, verified_perfect_scores: stats };
            return [];
        },
    } as unknown as typeof window.api;
    return { stored, calls };
}

afterEach(() => {
    cleanup();
    sessionStorage.clear();
    localStorage.clear();
});

test('one authenticated app survives navigation and logout without reinitializing gameplay', async () => {
    const { calls, stored } = mockApi();
    render(
        <StrictMode>
            <MemoryRouter initialEntries={['/sniffer']}>
                <App />
            </MemoryRouter>
        </StrictMode>,
    );
    await waitFor(() => assert.match(screen.getByRole('alert').textContent || '', /Waiting for the test reader/));
    assert.equal(calls.filter((call) => call === 'prepare').length, 1);
    assert.equal(calls.filter((call) => call === 'authenticate.php').length, 1);

    fireEvent.click(screen.getByRole('link', { name: 'Search' }));
    await screen.findByRole('textbox', { name: 'Search songs' });
    assert.ok(!screen.queryByRole('link', { name: 'Support' }));
    fireEvent.click(screen.getByRole('link', { name: 'Team' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Support Rock Buddy!' }));
    await screen.findByRole('button', { name: 'Continue to PayPal' });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await screen.findByRole('heading', { name: 'Team Members' });
    fireEvent.click(screen.getByRole('link', { name: 'Profile' }));
    await screen.findByRole('heading', { name: 'Verified 100% scores' });
    assert.equal(calls.filter((call) => call === 'prepare').length, 1);
    assert.equal(document.querySelectorAll('nav').length, 1);

    fireEvent.click(screen.getByRole('link', { name: 'Account' }));
    await screen.findByText('fixture@example.invalid');
    fireEvent.click(screen.getByRole('button', { name: 'Logout' }));
    await screen.findByRole('button', { name: 'Log In' });
    assert.equal(sessionStorage.getItem('auth_data'), null);
    assert.equal(stored.has('auth_data'), false);
});

test('account cooldown disables the React form while older responses remain usable', async () => {
    mockApi();
    render(
        <MemoryRouter initialEntries={['/account/username']}>
            <App />
        </MemoryRouter>,
    );
    await screen.findByText('You can change your username in 0 hours 1 minute.');
    assert.ok(
        screen.getByRole('button', { name: 'Change username' }).closest('fieldset')!.disabled,
    );
    for (const [seconds, text] of [
        [86401, '2 days'],
        [86400, '1 day'],
        [3660, '1 hour 1 minute'],
        [1, '0 hours 1 minute'],
    ] as const) {
        assert.equal(usernameWaitMessage(seconds), `You can change your username in ${text}.`);
    }
});

test('the shared reader survives tab navigation and pauses in Config', async () => {
    mockApi();
    window.api.resolveRocksmithConfig = async () => {};
    const originalCreate = Sniffer.create;
    const state = { activity: 'waiting', error: null, scoreRevision: 0 } as SnifferState;
    const listeners = new Set<() => void>();
    let starts = 0;
    let stops = 0;
    const engine = {
        getSnapshot: () => state,
        subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
        start: () => { starts++; },
        stop: () => { stops++; },
    } as unknown as Sniffer;
    Sniffer.create = async () => engine;

    try {
        render(<MemoryRouter initialEntries={['/search']}><App /></MemoryRouter>);
        await screen.findByRole('link', { name: 'Sniffer' });
        await waitFor(() => assert.equal(starts, 1));
        await waitFor(() => assert.equal(listeners.size, 1));
        fireEvent.click(screen.getByRole('link', { name: 'Profile' }));
        await screen.findByRole('heading', { name: 'Profile' });
        assert.equal(starts, 1);
        fireEvent.click(screen.getByRole('link', { name: 'Config' }));
        await screen.findByRole('heading', { name: 'Config' });
        assert.equal(stops, 1);
        fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
        await screen.findByRole('link', { name: 'Sign in' });
        assert.equal(listeners.size, 0);
    } finally {
        cleanup();
        Sniffer.create = originalCreate;
    }
});

test('config saves quick edits in order without disabling unrelated controls', async () => {
    const { stored } = mockApi();
    window.api.resolveRocksmithConfig = async () => {};
    let finishFirst!: () => void;
    const firstSave = new Promise<void>(resolve => { finishFirst = resolve; });
    const writes: [string, unknown][] = [];
    window.api.storeSet = async (key, value) => {
        writes.push([key, value]);
        if (writes.length === 1) await firstSave;
        stored.set(key, value);
    };
    render(<MemoryRouter initialEntries={['/config']}><App /></MemoryRouter>);
    const always = await screen.findByRole('checkbox', { name: 'Always Sniff' });
    const logging = screen.getByRole('checkbox', { name: 'Extra Logging' });

    fireEvent.click(always);
    await waitFor(() => assert.equal(writes.length, 1));
    assert.equal((always as HTMLInputElement).checked, true);
    assert.equal(logging.matches(':disabled'), false);
    assert.equal(screen.getByRole('button', { name: 'Advanced Config' }).matches(':disabled'), false);

    fireEvent.click(logging);
    fireEvent.click(always);
    assert.equal(writes.length, 1);
    await act(async () => { finishFirst(); await firstSave; });
    await waitFor(() => assert.equal(writes.length, 3));
    assert.deepEqual(writes, [
        ['user_data.1.always_sniff', true],
        ['user_data.1.extra_logging', true],
        ['user_data.1.always_sniff', false],
    ]);
    assert.equal((always as HTMLInputElement).checked, false);
    assert.equal((logging as HTMLInputElement).checked, true);
    assert.equal(stored.get('user_data.1.always_sniff'), false);
    assert.equal(stored.get('user_data.1.extra_logging'), true);
});

test('path rankings show crowns without rendering numeric false flags as zeroes', async () => {
    mockApi();
    const request = window.api.requestBackend;
    const ranks = [
        { user_id: 1, username: 'Crowned', king: 1, points: 42 },
        { user_id: 2, username: 'Player', king: 0, points: 12 },
    ];
    window.api.requestBackend = async (url, data) => {
        if (url.endsWith('get_ranks_top3.php')) return { overall: ranks, lead: ranks, rhythm: [], bass: [] };
        if (url.endsWith('get_ranks_lead.php')) return ranks;
        return request(url, data);
    };
    render(<MemoryRouter initialEntries={['/rank']}><App /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Show all lead rankings' }));
    await screen.findByRole('cell', { name: 'Player' });
    const dialog = screen.getByRole('dialog', { name: 'Lead rankings' });
    const cells = dialog.querySelectorAll('tbody tr td:nth-child(2)');
    assert.equal(cells[0].textContent, 'Crowned');
    assert.equal(cells[1].textContent, 'Player');
    assert.equal(dialog.querySelectorAll('img[alt="King"]').length, 1);
});

test('a failed config save restores its value and does not block the next edit', async () => {
    const { stored } = mockApi();
    window.api.resolveRocksmithConfig = async () => {};
    let attempts = 0;
    window.api.storeSet = async (key, value) => {
        if (++attempts === 1) throw new Error('Could not save setting');
        stored.set(key, value);
    };
    render(<MemoryRouter initialEntries={['/config']}><App /></MemoryRouter>);
    const logging = await screen.findByRole('checkbox', { name: 'Extra Logging' });
    fireEvent.click(logging);
    await screen.findByText('Could not save setting');
    assert.equal((logging as HTMLInputElement).checked, false);
    assert.equal(logging.matches(':disabled'), false);

    fireEvent.click(logging);
    await waitFor(() => assert.equal(stored.get('user_data.1.extra_logging'), true));
    assert.equal((logging as HTMLInputElement).checked, true);
    assert.ok(!screen.queryByText('Could not save setting'));
});

test('window dimensions apply on change, reject invalid input and recover from resize failures', async () => {
    mockApi();
    window.api.resolveRocksmithConfig = async () => {};
    const requests: { width: number; height: number }[] = [];
    window.api.setWindowSize = async size => {
        requests.push(size);
        if (requests.length === 1) throw new Error('Exit full screen before changing the window size.');
        return { width: 950, height: 540 };
    };
    render(<MemoryRouter initialEntries={['/config']}><App /></MemoryRouter>);
    const width = await screen.findByRole('spinbutton', { name: 'Width' }) as HTMLInputElement;
    const height = screen.getByRole('spinbutton', { name: 'Height' }) as HTMLInputElement;
    assert.ok(!screen.queryByRole('button', { name: 'Apply size' }));
    assert.equal(width.value, '1024');
    assert.equal(height.value, '768');

    fireEvent.change(width, { target: { value: '' } });
    fireEvent.change(width, { target: { value: '639' } });
    fireEvent.change(width, { target: { value: '960.5' } });
    fireEvent.change(width, { target: { value: '16385' } });
    await act(async () => {});
    assert.equal(requests.length, 0);
    fireEvent.change(width, { target: { value: '960' } });
    await screen.findByText('Exit full screen before changing the window size.');
    assert.deepEqual(requests, [{ width: 960, height: 768 }]);

    fireEvent.change(height, { target: { value: '540' } });
    await waitFor(() => assert.equal(width.value, '950'));
    assert.equal(height.value, '540');
    assert.deepEqual(requests[1], { width: 960, height: 540 });
    assert.ok(!screen.queryByText('Exit full screen before changing the window size.'));
});

test('rapid window edits keep the latest values and cancel queued resizes when leaving Config', async () => {
    mockApi();
    window.api.resolveRocksmithConfig = async () => {};
    type Size = { width: number; height: number };
    const requests: Size[] = [];
    const finish: ((size: Size) => void)[] = [];
    window.api.setWindowSize = size => {
        requests.push(size);
        return new Promise(resolve => { finish.push(resolve); });
    };
    const view = render(<MemoryRouter initialEntries={['/config']}><App /></MemoryRouter>);
    const width = await screen.findByRole('spinbutton', { name: 'Width' }) as HTMLInputElement;
    const height = screen.getByRole('spinbutton', { name: 'Height' }) as HTMLInputElement;
    fireEvent.change(width, { target: { value: '960' } });
    await waitFor(() => assert.equal(requests.length, 1));
    fireEvent.change(width, { target: { value: '980' } });
    fireEvent.change(height, { target: { value: '540' } });
    assert.equal(width.disabled, false);
    await act(async () => { finish[0]({ width: 950, height: 768 }); });
    assert.equal(width.value, '980');
    assert.equal(height.value, '540');
    assert.deepEqual(requests, [{ width: 960, height: 768 }, { width: 980, height: 540 }]);

    fireEvent.change(height, { target: { value: '' } });
    await act(async () => { finish[1]({ width: 980, height: 540 }); });
    assert.equal(height.value, '');
    fireEvent.change(height, { target: { value: '600' } });
    await waitFor(() => assert.equal(requests.length, 3));
    fireEvent.change(width, { target: { value: '1000' } });
    view.unmount();
    await act(async () => { finish[2]({ width: 980, height: 600 }); });
    assert.equal(requests.length, 3);
});

test('header sign out clears the session and offers sign in from Support', async () => {
    const { stored } = mockApi();
    render(
        <MemoryRouter initialEntries={['/support']}>
            <App />
        </MemoryRouter>,
    );
    const signOut = await screen.findByRole('button', { name: 'Sign out' });
    fireEvent.click(await screen.findByRole('button', { name: 'Close' }));
    assert.equal(signOut.getAttribute('title'), 'Sign out');
    assert.ok(signOut.closest('nav'));
    assert.ok(!screen.queryByRole('link', { name: 'Sign in' }));

    fireEvent.click(signOut);
    const signIn = await screen.findByRole('link', { name: 'Sign in' });
    assert.equal(stored.has('auth_data'), false);
    assert.equal(sessionStorage.getItem('auth_data'), null);
    assert.ok(!screen.queryByRole('button', { name: 'Sign out' }));
    assert.ok(screen.getByRole('heading', { name: 'Team Members' }));

    fireEvent.click(signIn);
    await screen.findByRole('button', { name: 'Log In' });
});

test('a signed-out visitor can navigate from Support back to login', async () => {
    const { stored } = mockApi();
    stored.delete('auth_data');
    render(
        <MemoryRouter initialEntries={['/support']}>
            <App />
        </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Close' }));
    fireEvent.click(await screen.findByRole('link', { name: 'Sign in' }));
    await screen.findByRole('textbox', { name: 'Username or email' });
    assert.ok(!screen.queryByRole('button', { name: 'Sign out' }));
});

test('header logout reports saved-login deletion failures after the session closes', async () => {
    mockApi();
    const errors: string[] = [];
    window.api.storeDelete = async () => { throw new Error('Storage unavailable'); };
    window.api.error = message => { errors.push(message); };
    render(
        <MemoryRouter initialEntries={['/support']}>
            <App />
        </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Close' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Sign out' }));
    await screen.findByRole('link', { name: 'Sign in' });
    await waitFor(() => assert.equal(errors.length, 1));
    assert.match(errors[0], /could not remove your saved login/);
    assert.equal(sessionStorage.getItem('auth_data'), null);
});

test('a late resource response cannot overwrite a new account or song selection', async () => {
    let finish!: (value: string) => void;
    const first = new Promise<string>((resolve) => {
        finish = resolve;
    });
    const view = renderHook(
        ({ id }) => useResource(id, () => (id === 'old' ? first : Promise.resolve('new data'))),
        { initialProps: { id: 'old' }, wrapper: PageDataProvider },
    );
    view.rerender({ id: 'new' });
    await waitFor(() => assert.equal(view.result.current.data, 'new data'));
    await act(async () => finish('stale data'));
    assert.equal(view.result.current.data, 'new data');
});

test('verified score ties preserve competition ranks and do not tie unverified history', () => {
    const rows = [
        { verified: true, mastery: 1, streak: 100 },
        { verified: true, mastery: 1, streak: 100 },
        { verified: false, mastery: 1, streak: 100 },
    ] as Score[];
    assert.deepEqual(
        rankedScores(rows, 'las').map((score) => score.rank),
        [1, 1, 3],
    );
    assert.deepEqual(
        rankedScores(
            [
                { score: 1000, badges: 5 },
                { score: 1000, badges: 5 },
                { score: 900, badges: 5 },
            ] as Score[],
            'sa',
        ).map((score) => score.rank),
        [1, 1, 3],
    );
});

test('login is an explicit single action and persists only a validated session', async () => {
    const { stored } = mockApi();
    stored.delete('auth_data');
    const original = window.api.requestBackend;
    const logins: unknown[] = [];
    window.api.requestBackend = async (url, body) => {
        if (url.endsWith('/login.php')) {
            logins.push(body);
            return { user_id: 1, api_key: 'new-synthetic-session' };
        }
        return original(url, body);
    };
    render(
        <StrictMode>
            <MemoryRouter initialEntries={['/login']}>
                <App />
            </MemoryRouter>
        </StrictMode>,
    );
    const username = await screen.findByRole('textbox', { name: 'Username or email' });
    assert.equal(logins.length, 0);
    fireEvent.change(username, { target: { value: 'Fixture' } });
    fireEvent.change(screen.getByLabelText('Password'), {
        target: { value: 'Synthetic password1!' },
    });
    const form = username.closest('form')!;
    act(() => {
        fireEvent.submit(form);
        fireEvent.submit(form);
    });
    await screen.findByRole('heading', { name: 'Leaderboard Sniffer' });
    assert.equal(logins.length, 1);
    assert.deepEqual(logins[0], {
        username_or_email: 'Fixture',
        password: 'Synthetic password1!',
        version: '1.12.0-beta1',
    });
    assert.equal(stored.get('auth_data').api_key, 'new-synthetic-session');
});

test('older statistics responses hide the new count instead of inventing a zero', async () => {
    mockApi();
    const original = window.api.requestBackend;
    window.api.requestBackend = async (url, body) => {
        const response = await original(url, body);
        if (url.endsWith('/get_user_stats.php')) delete response.verified_perfect_scores;
        return response;
    };
    render(
        <MemoryRouter initialEntries={['/profile']}>
            <App />
        </MemoryRouter>,
    );
    await screen.findByRole('heading', { name: 'Accuracy' });
    assert.ok(!screen.queryByRole('heading', { name: 'Verified 100% scores' }));
});
