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
    within,
} from '@testing-library/react';
import { ThemeProvider } from '../../src/ui/Theme';
import { AppHeader } from '../../src/ui/AppHeader';
import { DesktopStatus } from '../../src/ui/DesktopStatus';
import { DesktopUpdates, DesktopVersion } from '../../src/ui/DesktopUpdates';
import { SupportForm, SupportOverlay } from '../../src/support/SupportDialog';
import { TeamPage } from '../../src/team/TeamPage';
import { Footer } from '../../src/ui/Footer';
import { useDesktopState } from '../../src/ui/useDesktopState';

Object.assign(globalThis, { localStorage: window.localStorage });

// Hold a response until the test chooses to resolve or reject it.
function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<T>((done, fail) => {
        resolve = done;
        reject = fail;
    });
    return { promise, resolve, reject };
}

// Model main-process events separately from the initial snapshot.
function stateSource<T>(initial: T | Promise<T>) {
    const listeners = new Set<(value: T) => void>();
    return {
        get: () => Promise.resolve(initial),
        subscribe: (listener: (value: T) => void) => {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        emit: (state: T) =>
            act(() => {
                listeners.forEach((listener) => listener(state));
            }),
        listeners,
    };
}

function setApi(api: Record<string, unknown>) {
    window.api = api as typeof window.api;
}

afterEach(() => {
    cleanup();
    sessionStorage.clear();
});

test('Strict Mode keeps one subscription and ignores late snapshots and unmounted work', async () => {
    const initial = deferred<string>();
    const source = stateSource(initial.promise);
    const view = renderHook(() => useDesktopState(source.get, source.subscribe), {
        wrapper: StrictMode,
    });
    assert.equal(view.result.current, null);
    assert.equal(source.listeners.size, 1);

    source.emit('new event');
    await act(async () => initial.resolve('old snapshot'));
    assert.equal(view.result.current, 'new event');

    view.unmount();
    assert.equal(source.listeners.size, 0);
    source.emit('after unmount');
});

test('ready updates require a choice, Later can reopen, and late snapshots cannot hide them', async () => {
    const initial = deferred<any>();
    const updates = stateSource(initial.promise);
    const connection = stateSource({ connected: true, message: '' });
    setApi({
        getVersion: async () => '1.12.0-beta1',
        getUpdateState: updates.get,
        onUpdateState: updates.subscribe,
        getConnectionState: connection.get,
        onConnectionState: connection.subscribe,
    });
    render(<StrictMode><DesktopStatus /><DesktopVersion /><DesktopUpdates /></StrictMode>);
    await waitFor(() => assert.ok(screen.getByText('v1.12.0-beta1')));
    assert.ok(!screen.queryByRole('button', { name: 'Check for updates' }));

    connection.emit({ connected: false, message: 'Connection lost' });
    assert.ok(screen.getByRole('button', { name: 'Reload page' }));
    updates.emit({ status: 'ready', version: '1.12.0-beta2', message: 'Update ready.' });
    const dialog = screen.getByRole('alertdialog') as HTMLDialogElement;
    assert.equal(dialog.open, true);
    assert.ok(document.activeElement === screen.getByRole('button', { name: 'Restart later' }));
    assert.equal(fireEvent.keyDown(document.activeElement!, { key: 'Escape' }), false);
    assert.equal(fireEvent(dialog, new window.Event('cancel', { cancelable: true })), false);
    fireEvent.click(dialog);
    assert.equal(dialog.open, true);
    assert.ok(!screen.queryByRole('button', { name: 'Close' }));
    await act(async () => initial.resolve({ status: 'disabled', message: '' }));
    assert.ok(screen.getByRole('button', { name: 'Restart now' }));

    fireEvent.click(screen.getByRole('button', { name: 'Restart later' }));
    assert.equal(sessionStorage.getItem('deferred-update'), '1.12.0-beta2');
    assert.ok(!screen.queryByRole('alertdialog'));
    fireEvent.click(screen.getByRole('button', { name: 'Update ready' }));
    assert.ok(screen.getByRole('alertdialog'));
    fireEvent.click(screen.getByRole('button', { name: 'Restart later' }));

    // The same ready event stays dismissed; a different version asks again.
    updates.emit({ status: 'ready', version: '1.12.0-beta2', message: 'Update ready.' });
    assert.ok(!screen.queryByRole('alertdialog'));
    updates.emit({ status: 'ready', version: '1.12.0-beta5', message: 'Update ready.' });
    assert.ok(screen.getByRole('alertdialog'));
});

test('header shows download progress and deferred updates while automatic checks stay quiet', async () => {
    const updates = stateSource<any>({ status: 'idle', message: 'Up to date.' });
    setApi({
        getVersion: async () => '1.12.0-beta2',
        getBetaNotice: async () => null,
        getUpdateState: updates.get,
        onUpdateState: updates.subscribe,
    });
    render(
        <MemoryRouter>
            <ThemeProvider><AppHeader><DesktopUpdates /></AppHeader></ThemeProvider>
            <Footer><DesktopVersion /></Footer>
        </MemoryRouter>,
    );
    await waitFor(() => assert.ok(screen.getByText('v1.12.0-beta2').closest('footer')));

    for (const status of ['checking', 'error', 'idle', 'disabled']) {
        updates.emit({ status, message: 'Background updater status' });
        assert.ok(!within(screen.getByRole('navigation')).queryByRole('button', { name: /Check for updates|Update ready/ }));
        assert.ok(!screen.queryByRole('alertdialog'));
        assert.ok(!screen.queryByText('Background updater status'));
    }

    // Show progress inside navigation without prompting or exposing a manual check.
    updates.emit({ status: 'downloading', percent: 49.7 });
    assert.ok(screen.getByRole('status').closest('nav'));
    assert.equal(screen.getByRole('status').textContent, 'Downloading 50%');
    assert.ok(!within(screen.getByRole('navigation')).queryByRole('button', { name: /Check for updates|Update ready/ }));
    assert.ok(!screen.queryByRole('alertdialog'));

    updates.emit({ status: 'downloading' });
    assert.equal(screen.getByRole('status').textContent, 'Downloading…');

    updates.emit({ status: 'ready', version: '1.12.0-beta5', message: 'Update ready.' });
    fireEvent.click(screen.getByRole('button', { name: 'Restart later' }));
    const ready = screen.getByRole('button', { name: 'Update ready' });
    assert.ok(ready.closest('nav'));
    assert.ok(!screen.queryByRole('status'));
    fireEvent.click(ready);
    assert.ok(screen.getByRole('alertdialog'));
});

test('header navigates inside React and updates the active link', async () => {
    setApi({ getBetaNotice: async () => 'Rock Buddy Beta: test changes will be discarded.' });
    render(
        <MemoryRouter initialEntries={['/search']}>
            <ThemeProvider><AppHeader /></ThemeProvider>
        </MemoryRouter>,
    );
    assert.ok(!screen.queryByText('Beta'));
    assert.equal(screen.getByRole('link', { name: 'Search' }).getAttribute('aria-current'), 'page');
    assert.ok(!screen.queryByRole('link', { name: 'Support' }));
    fireEvent.click(screen.getByRole('link', { name: 'Rank' }));
    await waitFor(() =>
        assert.equal(
            screen.getByRole('link', { name: 'Rank' }).getAttribute('aria-current'),
            'page',
        ),
    );
    assert.equal(screen.getByRole('link', { name: 'Search' }).getAttribute('aria-current'), null);
    const brand = screen.getByRole('link', { name: 'Rock Buddy' });
    assert.equal(brand.getAttribute('href'), '/sniffer');
    fireEvent.click(brand.querySelector('img')!);
    await waitFor(() => assert.equal(screen.getByRole('link', { name: 'Sniffer' }).getAttribute('aria-current'), 'page'));
});

test('Team opens support in a dialog, preserves the page and restores focus on close', async () => {
    let checkouts = 0;
    setApi({ supportInfo: async () => ({ sandbox: true }), startSupportCheckout: async () => { checkouts++; } });
    render(<MemoryRouter initialEntries={['/team']}><TeamPage /><SupportOverlay /></MemoryRouter>);
    const trigger = screen.getByRole('button', { name: 'Support Rock Buddy!' });
    const team = screen.getByRole('heading', { name: 'Team Members' });
    assert.ok(!screen.queryByText(/Community support makes/));
    trigger.focus();
    fireEvent.click(trigger);
    let dialog = screen.getByRole('dialog', { name: 'Support Rock Buddy' });
    await waitFor(() => assert.equal((within(dialog).getByRole('button', { name: 'Continue to PayPal' }) as HTMLButtonElement).disabled, false));
    assert.ok(within(dialog).getByText(/one-time or monthly donation/));
    assert.ok(team.isConnected);
    assert.equal(checkouts, 0);

    // Dialog padding and drags from inside to outside must not dismiss it.
    dialog.getBoundingClientRect = () => ({ left: 100, top: 100, right: 500, bottom: 600 } as DOMRect);
    const pointer = (x: number, y: number) => fireEvent(dialog, new window.MouseEvent('pointerdown', { bubbles: true, clientX: x, clientY: y }));
    pointer(120, 120);
    fireEvent.click(dialog, { clientX: 120, clientY: 120 });
    assert.ok(dialog.isConnected);
    pointer(120, 120);
    fireEvent.click(dialog, { clientX: 10, clientY: 10 });
    assert.ok(dialog.isConnected);
    pointer(10, 10);
    fireEvent.click(dialog, { clientX: 10, clientY: 10 });
    assert.ok(!screen.queryByRole('dialog'));
    assert.ok(document.activeElement === trigger);

    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    assert.ok(!screen.queryByRole('dialog'));
    fireEvent.click(trigger);
    dialog = screen.getByRole('dialog');
    fireEvent(dialog, new window.Event('cancel', { bubbles: false }));
    assert.ok(!screen.queryByRole('dialog'));
    assert.ok(team.isConnected);
});

test('support derives validation from the amount and does not create checkout in an effect', async () => {
    let checkouts = 0;
    setApi({
        supportInfo: async () => ({ sandbox: true }),
        startSupportCheckout: async () => {
            checkouts++;
        },
    });
    render(
        <StrictMode>
            <MemoryRouter><SupportForm /></MemoryRouter>
        </StrictMode>,
    );
    const button = screen.getByRole('button', { name: 'Continue to PayPal' }) as HTMLButtonElement;
    assert.equal(button.disabled, true);
    await waitFor(() => assert.equal(button.disabled, false));
    assert.equal(checkouts, 0);

    const amount = screen.getByRole('spinbutton', { name: 'Amount (USD)' });
    for (const invalid of ['4.99', '', '-5', '5.001', '1000000', '1e2']) {
        fireEvent.change(amount, { target: { value: invalid } });
        assert.equal(button.disabled, true, invalid);
    }
    fireEvent.change(amount, { target: { value: '5.00' } });
    assert.equal(button.disabled, false);
});

test('checkout prevents duplicate submissions and requires explicit approval-open confirmation', async () => {
    const response = deferred<any>();
    const inputs: unknown[] = [];
    setApi({
        supportInfo: async () => ({ sandbox: true }),
        startSupportCheckout: async (input: unknown) => {
            inputs.push(input);
            return response.promise;
        },
    });
    render(<MemoryRouter><SupportForm /></MemoryRouter>);
    const button = screen.getByRole('button', { name: 'Continue to PayPal' }) as HTMLButtonElement;
    await waitFor(() => assert.equal(button.disabled, false));
    fireEvent.click(screen.getByRole('radio', { name: 'Monthly' }));
    const form = button.closest('form')!;
    act(() => {
        fireEvent.submit(form);
        fireEvent.submit(form);
    });
    assert.deepEqual(inputs, [{ amount: '5', kind: 'monthly' }]);
    assert.equal(button.disabled, true);

    await act(async () => response.resolve({}));
    assert.match(screen.getByRole('status').textContent || '', /Could not open PayPal/);
    assert.doesNotMatch(screen.getByRole('status').textContent || '', /Finish reviewing/);
    assert.equal(button.disabled, false);
});

test('successful browser opening asks for approval without claiming a completed payment', async () => {
    setApi({
        supportInfo: async () => ({ sandbox: false }),
        startSupportCheckout: async () => ({ opened: true }),
    });
    render(<MemoryRouter><SupportForm /></MemoryRouter>);
    const button = screen.getByRole('button', { name: 'Continue to PayPal' }) as HTMLButtonElement;
    await waitFor(() => assert.equal(button.disabled, false));
    assert.ok(!screen.queryByText(/PayPal sandbox/));
    fireEvent.click(button);
    await waitFor(() =>
        assert.equal(
            screen.getByRole('status').textContent,
            'Finish reviewing your payment in PayPal.',
        ),
    );
});

test('unavailable support stays disabled and reports the error', async () => {
    setApi({
        supportInfo: async () => {
            throw new Error('Unavailable');
        },
    });
    render(<MemoryRouter><SupportForm /></MemoryRouter>);
    await waitFor(() =>
        assert.match(screen.getByRole('status').textContent || '', /Support is unavailable/),
    );
    assert.equal(
        (screen.getByRole('button', { name: 'Continue to PayPal' }) as HTMLButtonElement).disabled,
        true,
    );
});

test('the footer shows the current year and cleans up its refresh timer in Strict Mode', () => {
    const originalSet = window.setInterval;
    const originalClear = window.clearInterval;
    const timers = new Set<number>();
    let next = 0;
    window.setInterval = (() => {
        timers.add(++next);
        return next;
    }) as unknown as typeof window.setInterval;
    window.clearInterval = (id) => {
        if (typeof id === 'number') timers.delete(id);
    };
    try {
        const view = render(
            <StrictMode>
                <Footer />
            </StrictMode>,
        );
        const link = screen.getByRole('link', { name: 'TNTMusicStudios' });
        assert.equal(link.getAttribute('href'), 'mailto:tntmusicstudios2018@gmail.com');
        assert.equal(link.closest('p')!.textContent, `Copyright © ${new Date().getFullYear()} TNTMusicStudios`);
        assert.equal(timers.size, 1);
        view.unmount();
        assert.equal(timers.size, 0);
    } finally {
        window.setInterval = originalSet;
        window.clearInterval = originalClear;
    }
});

test('restart stays guarded while pending and can recover from blocked or failed installation', async () => {
    const updates = stateSource<any>({ status: 'ready', version: '1.12.0-beta2', message: 'Update ready.' });
    const response = deferred<any>();
    let installs = 0;
    setApi({
        getVersion: async () => '1.12.0-beta1',
        getUpdateState: updates.get,
        onUpdateState: updates.subscribe,
        installDesktopUpdate: async () => { installs++; return response.promise; },
    });
    render(<DesktopUpdates />);
    await waitFor(() => assert.ok(screen.getByRole('alertdialog')));
    fireEvent.click(screen.getByRole('button', { name: 'Restart now' }));
    fireEvent.click(screen.getByRole('button', { name: 'Restart now' }));
    assert.equal(installs, 1);
    assert.equal((screen.getByRole('button', { name: 'Restart later' }) as HTMLButtonElement).disabled, true);

    updates.emit({ status: 'ready', version: '1.12.0-beta2', message: 'Finish playing and wait for score uploads before restarting.' });
    await act(async () => response.resolve(updates.get()));
    assert.match(screen.getByRole('status').textContent || '', /Finish playing/);
    assert.equal((screen.getByRole('button', { name: 'Restart later' }) as HTMLButtonElement).disabled, false);

    window.api.installDesktopUpdate = async () => { throw new Error('IPC failed'); };
    fireEvent.click(screen.getByRole('button', { name: 'Restart now' }));
    await waitFor(() => assert.match(screen.getByRole('status').textContent || '', /Could not restart/));
    assert.ok(screen.getByRole('alertdialog'));
    fireEvent.click(screen.getByRole('button', { name: 'Restart later' }));
    assert.ok(!screen.queryByRole('alertdialog'));
});


test('the version opens bundled current and historical release notes without network access', async () => {
    setApi({
        getVersion: async () => '1.12.0-beta5',
        getUpdateState: async () => ({ status: 'disabled', message: 'Updates are available in installed Windows builds.' }),
        onUpdateState: () => () => {},
    });
    render(<Footer><DesktopVersion /></Footer>);
    const version = await screen.findByRole('button', { name: 'Changelog for Rock Buddy 1.12.0-beta5' });
    assert.ok(!screen.queryByRole('dialog'));

    fireEvent.click(version);
    const dialog = screen.getByRole('dialog', { name: 'Changelog' });
    assert.equal((dialog as HTMLDialogElement).open, true);
    assert.equal(document.documentElement.style.overflow, 'hidden');
    assert.ok(within(dialog).getByRole('heading', { name: 'v1.12.0-beta5' }));
    assert.ok(within(dialog).getByRole('heading', { name: 'v1.11.0' }));
    assert.ok(within(dialog).getByText('Added Rocksmith Learn & Play Edition compatibility.'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    assert.ok(!screen.queryByRole('dialog'));
    assert.equal(document.documentElement.style.overflow, '');

    fireEvent.click(version);
    fireEvent(screen.getByRole('dialog'), new window.Event('cancel', { cancelable: true }));
    assert.ok(!screen.queryByRole('dialog'));
});


test('changelog checks report results and failures without duplicate requests or downloads', async () => {
    const updates = stateSource<any>({ status: 'idle', message: '' });
    const response = deferred<any>();
    let checks = 0;
    setApi({
        getVersion: async () => '1.12.0-beta5',
        getUpdateState: updates.get,
        onUpdateState: updates.subscribe,
        checkDesktopUpdate: async () => { checks++; return response.promise; },
    });
    render(<DesktopVersion />);
    fireEvent.click(await screen.findByRole('button', { name: 'Changelog for Rock Buddy 1.12.0-beta5' }));
    const check = await screen.findByRole('button', { name: 'Check for updates' }) as HTMLButtonElement;
    await waitFor(() => assert.equal(check.disabled, false));

    act(() => { fireEvent.click(check); fireEvent.click(check); });
    assert.equal(checks, 1);
    assert.equal(check.disabled, true);
    updates.emit({ status: 'idle', message: 'Rock Buddy is up to date.' });
    await act(async () => response.resolve({}));
    assert.match(screen.getByRole('status').textContent || '', /up to date/);
    assert.equal(check.disabled, false);

    window.api.checkDesktopUpdate = async () => { throw new Error('IPC failed'); };
    fireEvent.click(check);
    await waitFor(() => assert.match(screen.getByRole('status').textContent || '', /Could not check/));
    assert.equal(check.disabled, false);

    for (const status of ['checking', 'downloading', 'ready', 'installing', 'disabled']) {
        updates.emit({ status, message: 'Updater status' });
        assert.equal(check.disabled, true, status);
    }
});
