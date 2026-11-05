import './dom';
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { StrictMode } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SupportWelcome } from '../../src/support/SupportWelcome';

afterEach(cleanup);

function fixture() {
    const stored = new Map<string, unknown>();
    let writes = 0;
    window.api = {
        storeGet: async (key: string) => stored.get(key),
        storeSet: async (key: string, value: unknown) => { writes++; stored.set(key, value); },
        logMessage: () => {},
    } as unknown as typeof window.api;
    return { stored, writes: () => writes };
}

function Location() { return <output>{useLocation().pathname + useLocation().search}</output>; }
function Preview({ enabled = true }: { enabled?: boolean }) {
    return <StrictMode><MemoryRouter><SupportWelcome enabled={enabled} /><Location /></MemoryRouter></StrictMode>;
}

test('welcome appears once in Strict Mode and stays dismissed after a new renderer starts', async () => {
    const state = fixture();
    const view = render(<Preview />);
    await screen.findByRole('dialog');
    assert.equal(state.stored.get('support_welcome_shown'), true);
    assert.equal(state.writes(), 1);
    fireEvent.click(screen.getByRole('button', { name: 'Maybe later' }));
    assert.ok(!screen.queryByRole('dialog'));
    view.unmount();
    await act(async () => { render(<Preview />); });
    assert.ok(!screen.queryByRole('dialog'));
    assert.equal(state.writes(), 1);
});

test('closing the app while the welcome is open does not show it on the next launch', async () => {
    fixture();
    const view = render(<Preview />);
    await screen.findByRole('dialog');
    view.unmount();
    await act(async () => { render(<Preview />); });
    assert.ok(!screen.queryByRole('dialog'));
});

test('support opens the existing Team donation dialog route without checkout or external actions', async () => {
    fixture();
    render(<Preview />);
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: 'Support Rock Buddy!' }));
    assert.ok(!screen.queryByRole('dialog'));
    assert.ok(screen.getByText('/team?support=1'));
});

test('welcome waits for startup readiness and the close button dismisses it permanently', async () => {
    const state = fixture();
    const view = render(<Preview enabled={false} />);
    assert.equal(state.writes(), 0);
    assert.ok(!screen.queryByRole('dialog'));
    view.rerender(<Preview />);
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    assert.ok(!screen.queryByRole('dialog'));
    view.rerender(<Preview enabled={false} />);
    view.rerender(<Preview />);
    await waitFor(() => assert.equal(state.writes(), 1));
    assert.ok(!screen.queryByRole('dialog'));
});

test('a failed persistence write never displays an invitation that could repeat on startup', async () => {
    fixture();
    window.api.storeSet = async () => { throw new Error('Settings unavailable'); };
    await act(async () => { render(<Preview />); });
    assert.ok(!screen.queryByRole('dialog'));
});
