import './dom';
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SessionProvider, useSession } from '../../src/ui/Session';
import { ScoresTable, type Score } from '../../src/ui/Leaderboard';
import { ColumnPicker, useSnifferColumns } from '../../src/ui/ScoreColumns';

window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
window.HTMLDialogElement.prototype.close = function () { this.open = false; };

const scores: Score[] = [{
    user_id: 1, username: 'Player', king: true, verified: true,
    last_played: '2026-10-14', play_count: 12, streak: 100, mastery: 0.95,
    score: 123456, badges: 3,
}];

function Preferences({ userId, mode }: { userId: number; mode: string }) {
    const columns = useSnifferColumns(userId);
    return (
        <>
            <ColumnPicker mode={mode} hidden={columns.hidden} onChange={columns.change} error={columns.error} onResetWidths={columns.resetWidths} order={columns.order} onOrderChange={columns.changeOrder} font={columns.font} onFontChange={columns.changeFont} />
            <ScoresTable scores={scores} mode={mode} hiddenColumns={columns.hidden} columnWidths={columns.widths} onColumnResize={columns.resize} columnOrder={columns.order} onColumnReorder={columns.reorder} font={columns.font} />
        </>
    );
}

function SignedIn({ mode, customizable }: { mode: string; customizable: boolean }) {
    const { state } = useSession();
    if (!state.auth) {
        return null;
    }
    return customizable
        ? <Preferences key={state.auth.user_id} userId={state.auth.user_id} mode={mode} />
        : <ScoresTable scores={scores} mode={mode} />;
}

// Use the real table and session provider while keeping every request synthetic.
function preview(userId = 1, mode = 'las', customizable = true) {
    window.api = {
        storeGet: async () => ({ user_id: userId, api_key: 'synthetic' }),
        getHost: async () => 'https://example.invalid',
        getVersion: async () => '1.12.0-beta1',
        requestBackend: async (url: string) => url.endsWith('authenticate.php')
            ? { success: true } : { activated: true },
    } as unknown as typeof window.api;
    return render(
        <SessionProvider><SignedIn mode={mode} customizable={customizable} /></SessionProvider>,
    );
}

afterEach(() => {
    cleanup();
    window.localStorage.clear();
    sessionStorage.clear();
});

test('hiding a column removes its header and cells, persists after remount, and can be reset', async () => {
    const view = preview();
    await screen.findByRole('columnheader', { name: 'Play Count' });
    fireEvent.click(screen.getByRole('button', { name: 'Columns' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Play Count' }));
    assert.ok(!screen.queryByRole('columnheader', { name: 'Play Count' }));
    assert.ok(!screen.queryByRole('cell', { name: '12' }));
    assert.equal(screen.getAllByRole('columnheader').length, screen.getAllByRole('cell').length);
    assert.equal((screen.getByRole('checkbox', { name: 'Username' }) as HTMLInputElement).disabled, true);
    view.unmount();

    preview();
    await screen.findByRole('table');
    assert.ok(!screen.queryByRole('columnheader', { name: 'Play Count' }));
    fireEvent.click(screen.getByRole('button', { name: 'Columns' }));
    fireEvent.click(screen.getByRole('button', { name: 'Show all' }));
    assert.ok(screen.getByRole('columnheader', { name: 'Play Count' }));
    assert.ok(screen.getByRole('cell', { name: '12' }));
});

test('preferences are account-specific and other leaderboard views keep all columns', async () => {
    window.localStorage.setItem('sniffer-hidden-columns:1', '["rank","lastPlayed","mastery"]');
    const first = preview();
    await screen.findByRole('table');
    assert.ok(!screen.queryByRole('columnheader', { name: 'Mastery' }));
    first.unmount();

    const other = preview(2);
    await screen.findByRole('columnheader', { name: 'Mastery' });
    assert.equal(screen.getAllByRole('columnheader').length, 6);
    other.unmount();

    preview(1, 'las', false);
    await screen.findByRole('columnheader', { name: 'Mastery' });
    assert.equal(screen.getAllByRole('columnheader').length, 6);
});

test('Score Attack offers its own score column and preserves hidden Learn a Song choices', async () => {
    window.localStorage.setItem('sniffer-hidden-columns:1', '["mastery","streak"]');
    preview(1, 'sa');
    await screen.findByRole('table');
    fireEvent.click(screen.getByRole('button', { name: 'Columns' }));
    assert.ok(!screen.queryByRole('checkbox', { name: 'Mastery' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Score' }));
    assert.ok(!screen.queryByRole('columnheader', { name: 'Score' }));
    assert.ok(!screen.queryByRole('cell', { name: /123,456/ }));
    assert.deepEqual(JSON.parse(window.localStorage.getItem('sniffer-hidden-columns:1')!), ['streak', 'mastery', 'score']);
});

test('invalid saved preferences fall back safely and cannot hide usernames', async () => {
    window.localStorage.setItem('sniffer-hidden-columns:1', 'broken json');
    const first = preview();
    await screen.findByRole('table');
    assert.equal(screen.getAllByRole('columnheader').length, 6);
    first.unmount();

    window.localStorage.setItem('sniffer-hidden-columns:1', '["username","unknown","rank"]');
    preview();
    await waitFor(() => assert.ok(screen.getByRole('columnheader', { name: 'Username' })));
    assert.ok(!screen.queryByRole('columnheader', { name: 'Rank' }));
    assert.equal(screen.getAllByRole('columnheader').length, 5);
});


test('column widths persist across remounts and game modes without changing other accounts or Search', async () => {
    const first = preview();
    const divider = await screen.findByRole('separator', { name: 'Resize Username' });
    const before = Number(divider.getAttribute('aria-valuenow'));
    fireEvent.keyDown(divider, { key: 'ArrowRight' });
    assert.equal(Number(divider.getAttribute('aria-valuenow')), before + 10);
    assert.equal(JSON.parse(window.localStorage.getItem('sniffer-column-widths:1')!).username, before + 10);
    first.unmount();

    const restored = preview(1, 'sa');
    assert.equal(Number((await screen.findByRole('separator', { name: 'Resize Username' })).getAttribute('aria-valuenow')), before + 10);
    fireEvent.click(screen.getByRole('button', { name: 'Columns' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Score' }));
    restored.unmount();

    const other = preview(2);
    assert.equal(Number((await screen.findByRole('separator', { name: 'Resize Username' })).getAttribute('aria-valuenow')), before);
    other.unmount();

    preview(1, 'las', false);
    await screen.findByRole('table');
    assert.ok(!screen.queryByRole('separator'));
});


test('invalid widths fall back safely and resetting widths leaves hidden columns alone', async () => {
    window.localStorage.setItem('sniffer-column-widths:1', '{"username":300,"rank":-10,"mastery":"wide","score":99999}');
    window.localStorage.setItem('sniffer-hidden-columns:1', '["playCount"]');
    preview();
    const divider = await screen.findByRole('separator', { name: 'Resize Username' });
    assert.equal(divider.getAttribute('aria-valuenow'), '300');
    assert.equal(screen.getByRole('separator', { name: 'Resize Rank' }).getAttribute('aria-valuenow'), '64');
    fireEvent.keyDown(divider, { key: 'Home' });
    fireEvent.keyDown(divider, { key: 'ArrowLeft' });
    assert.equal(divider.getAttribute('aria-valuenow'), '64');
    fireEvent.keyDown(divider, { key: 'End' });
    fireEvent.keyDown(divider, { key: 'ArrowRight' });
    assert.equal(divider.getAttribute('aria-valuenow'), '800');

    fireEvent.click(screen.getByRole('button', { name: 'Columns' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset widths' }));
    assert.equal((screen.getByRole('table') as HTMLTableElement).style.width, '');
    assert.ok(!screen.getByRole('table').querySelector('colgroup'));
    assert.ok(!screen.queryByRole('columnheader', { name: 'Play Count' }));
    assert.equal(window.localStorage.getItem('sniffer-column-widths:1'), null);
});

test('default columns fill the table naturally and first resize preserves the measured neighboring widths', async () => {
    const original = HTMLElement.prototype.getBoundingClientRect;
    const widths = [90, 240, 200, 100, 110, 130];
    HTMLElement.prototype.getBoundingClientRect = function () {
        const rect = original.call(this);
        if (this.tagName !== 'TH') return rect;
        const index = [...this.parentElement!.children].indexOf(this);
        return { ...rect, width: widths[index], x: 0, y: 0, top: 0, left: 0, right: widths[index], bottom: 20, height: 20, toJSON: () => ({}) };
    };
    try {
        preview();
        const divider = await screen.findByRole('separator', { name: 'Resize Username' });
        assert.equal((screen.getByRole('table') as HTMLTableElement).style.width, '');
        assert.ok(!screen.getByRole('table').querySelector('colgroup'));
        assert.equal(divider.getAttribute('aria-valuenow'), '240');
        fireEvent.keyDown(divider, { key: 'ArrowRight' });
        const saved = JSON.parse(window.localStorage.getItem('sniffer-column-widths:1')!);
        assert.equal(saved.username, 250);
        assert.equal(saved.rank, 90);
        assert.equal(saved.lastPlayed, 200);
        assert.equal((screen.getByRole('table') as HTMLTableElement).style.width, '880px');
    } finally {
        cleanup();
        HTMLElement.prototype.getBoundingClientRect = original;
    }
});


// Reordering must move the cells and their widths, not just change the headings.
test('order and font survive remounts, preserve widths and hidden columns, and stay account-specific', async () => {
    window.localStorage.setItem('sniffer-column-widths:1', '{"username":270}');
    window.localStorage.setItem('sniffer-hidden-columns:1', '["playCount"]');
    const first = preview();
    await screen.findByRole('table');
    fireEvent.click(screen.getByRole('button', { name: 'Columns' }));
    fireEvent.click(screen.getByRole('button', { name: 'Move Username left' }));
    fireEvent.change(screen.getByLabelText('Font'), { target: { value: 'georgia' } });
    assert.equal(screen.getAllByRole('columnheader')[0].getAttribute('aria-label'), 'Username');
    assert.match(screen.getAllByRole('cell')[0].textContent || '', /Player/);
    assert.equal(document.querySelector('col')?.style.width, '270px');
    assert.match(screen.getByRole('table').style.fontFamily, /Georgia/);
    first.unmount();

    const restored = preview();
    await screen.findByRole('table');
    assert.equal(screen.getAllByRole('columnheader')[0].getAttribute('aria-label'), 'Username');
    assert.match(screen.getByRole('table').style.fontFamily, /Georgia/);
    assert.ok(!screen.queryByRole('columnheader', { name: 'Play Count' }));
    fireEvent.click(screen.getByRole('button', { name: 'Columns' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset order' }));
    assert.equal(screen.getAllByRole('columnheader')[0].getAttribute('aria-label'), 'Rank');
    assert.ok(!screen.queryByRole('columnheader', { name: 'Play Count' }));
    assert.match(screen.getByRole('table').style.fontFamily, /Georgia/);
    restored.unmount();

    preview(2);
    await screen.findByRole('table');
    assert.equal(screen.getAllByRole('columnheader')[0].getAttribute('aria-label'), 'Rank');
    assert.match(screen.getByRole('table').style.fontFamily, /monospace/);
});


test('header drops reorder cells and shared fields retain their order between game modes', async () => {
    const first = preview();
    const username = await screen.findByRole('columnheader', { name: 'Username' });
    const mastery = screen.getByRole('columnheader', { name: 'Mastery' });
    const dataTransfer = { setData() {}, effectAllowed: '', dropEffect: '' };
    fireEvent.dragStart(mastery.querySelector('.column-drag-label')!, { dataTransfer });
    fireEvent.dragOver(username, { dataTransfer });
    fireEvent.drop(username, { dataTransfer });
    assert.deepEqual(screen.getAllByRole('columnheader').map(e => e.getAttribute('aria-label')), ['Rank', 'Mastery', 'Username', 'Last Played', 'Play Count', 'Streak']);
    assert.match(screen.getAllByRole('cell')[1].textContent || '', /95.00%/);
    first.unmount();

    const second = preview(1, 'sa');
    await screen.findByRole('table');
    fireEvent.click(screen.getByRole('button', { name: 'Columns' }));
    fireEvent.click(screen.getByRole('button', { name: 'Move Username left' }));
    second.unmount();

    preview();
    await screen.findByRole('table');
    assert.deepEqual(screen.getAllByRole('columnheader').map(e => e.getAttribute('aria-label')), ['Username', 'Mastery', 'Rank', 'Last Played', 'Play Count', 'Streak']);
});


test('invalid order and font settings fall back without duplicate or missing columns', async () => {
    window.localStorage.setItem('sniffer-column-order:1', '["username","username","missing"]');
    window.localStorage.setItem('sniffer-table-font:1', 'constructor');
    preview();
    await screen.findByRole('table');
    assert.equal(screen.getAllByRole('columnheader').length, 6);
    assert.equal(screen.getAllByRole('cell').length, 6);
    assert.match(screen.getByRole('table').style.fontFamily, /monospace/);
});


// Simulate intrinsic heading measurements; JSDOM itself has no layout engine.
test('heading widths constrain restored sizes and keyboard resizing after a font change', async () => {
    const original = window.HTMLElement.prototype.getBoundingClientRect;
    window.HTMLElement.prototype.getBoundingClientRect = function () {
        const rectangle = original.call(this);
        if (this.dataset.columnHeading === 'username') {
            const width = this.closest('table')?.style.fontFamily.includes('Georgia') ? 160 : 120;
            return { ...rectangle, width };
        }
        return rectangle;
    };
    try {
        window.localStorage.setItem('sniffer-column-widths:1', '{"username":64}');
        preview();
        const divider = await screen.findByRole('separator', { name: 'Resize Username' });
        assert.equal(divider.getAttribute('aria-valuemin'), '122');
        assert.equal(divider.getAttribute('aria-valuenow'), '122');
        fireEvent.keyDown(divider, { key: 'ArrowLeft' });
        assert.equal(JSON.parse(window.localStorage.getItem('sniffer-column-widths:1')!).username, 122);

        fireEvent.click(screen.getByRole('button', { name: 'Columns' }));
        fireEvent.change(screen.getByLabelText('Font'), { target: { value: 'georgia' } });
        assert.equal(divider.getAttribute('aria-valuemin'), '162');
        assert.equal(divider.getAttribute('aria-valuenow'), '162');
        fireEvent.keyDown(divider, { key: 'Home' });
        assert.equal(JSON.parse(window.localStorage.getItem('sniffer-column-widths:1')!).username, 162);
    } finally {
        cleanup();
        window.HTMLElement.prototype.getBoundingClientRect = original;
    }
});
