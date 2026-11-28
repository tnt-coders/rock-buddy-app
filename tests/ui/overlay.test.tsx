import './dom';
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { act, cleanup, render } from '@testing-library/react';
import { gameOverlayLine } from '../../src/sniffer/overlay';
import { VerificationState, type SnifferState } from '../../src/sniffer/sniffer';
import { GameOverlay } from '../../src/overlay/GameOverlay';
import type { Score } from '../../src/common/types';
import type { GameOverlayState } from '../../src/ui/desktop-state';

afterEach(cleanup);

const me = 7;

function score(user_id: number, verified: boolean, mastery: number): Score {
    return {
        user_id, username: `Player ${user_id}`, king: false, verified, last_played: null,
        play_count: 1, streak: 100, mastery, score: 1000 * user_id, badges: 1,
    };
}

// A Sniffer snapshot in the song list with a loaded Lead leaderboard.
function menuState(change: Partial<SnifferState> = {}): SnifferState {
    return {
        activity: 'sniffing', status: 'Sniffing...', error: null,
        song: {
            songID: 'song', psarcFileHash: 'hash', albumArt: '', artistName: 'Weezer',
            songName: "Say It Ain't So", albumName: 'Weezer', albumYear: 1994, songLength: 180,
            toolkit: { version: '1', author: 'Charter' },
        },
        live: null, paths: ['Lead', 'Rhythm', 'Bass'], path: 'lead', pathLocked: false,
        mode: 'las', difficulty: 'hard', lurkMode: false, canSnort: true, newVersion: false,
        verification: VerificationState.None, verificationMessage: '', scoreRevision: 0,
        leaderboard: { message: '', scores: [], mode: 'las' },
        ...change,
    };
}

function liveState(verification: VerificationState): SnifferState {
    return menuState({
        verification,
        live: {
            active: true, mode: 0, songTimer: 100, songLength: 180,
            noteData: { TotalNotesHit: 390, TotalNotes: 390, Accuracy: 100, CurrentHitStreak: 390, HighestHitStreak: 390 },
        },
    });
}

test('the live line mirrors the live feed and is coloured by verification', () => {
    assert.deepEqual(gameOverlayLine(liveState(VerificationState.Verified), me), {
        text: '390/390 (100.00%) · Streak 390/390 · 01:40/03:00', tone: 'verified',
    });
    assert.equal(gameOverlayLine(liveState(VerificationState.MaybeVerified), me)?.tone, 'maybe-verified');
    assert.equal(gameOverlayLine(liveState(VerificationState.Unverified), me)?.tone, 'unverified');
    assert.equal(gameOverlayLine(liveState(VerificationState.None), me)?.tone, 'ineligible');
});

test('the song list line counts verified scores and finds this account', () => {
    const scores = [score(1, true, 1), score(2, true, 0.99), score(me, true, 0.98), score(4, false, 1)];
    assert.equal(
        gameOverlayLine(menuState({ leaderboard: { message: '', scores, mode: 'las' } }), me)?.text,
        'Lead · 3 verified · You: #3',
    );

    // An unverified score alone does not give this account a verified place.
    const unverifiedOnly = [score(1, true, 1), score(me, false, 1)];
    assert.equal(
        gameOverlayLine(menuState({ leaderboard: { message: '', scores: unverifiedOnly, mode: 'las' } }), me)?.text,
        'Lead · 1 verified · You: no verified score',
    );

    assert.equal(gameOverlayLine(menuState(), me)?.text, 'Lead · no verified scores yet');
});

test('the song list line reports loading, missing paths and lurk mode', () => {
    const loading = menuState({ leaderboard: { message: 'Snorting data in 3', scores: null, mode: 'las' } });
    assert.equal(gameOverlayLine(loading, me)?.text, 'Lead · loading…');

    const locked = menuState({ paths: ['Bass'], path: 'lead', pathLocked: true });
    assert.equal(gameOverlayLine(locked, me)?.text, 'Lead · not available');

    assert.equal(gameOverlayLine(menuState({ lurkMode: true }), me)?.text, 'Lead · no verified scores yet · Lurk mode');
});

test('the overlay hides when no song is detected or the reader reports a problem', () => {
    assert.equal(gameOverlayLine(menuState({ song: null }), me), null);
    assert.equal(gameOverlayLine(menuState({ error: 'Waiting for Rocksmith...' }), me), null);
});

test('the overlay view renders only what the main process sends', () => {
    let listener: ((state: GameOverlayState | null) => void) | undefined;
    let unsubscribed = false;
    (window as any).api = {
        onGameOverlayState: (callback: typeof listener) => {
            listener = callback;
            return () => { unsubscribed = true; };
        },
        getGameOverlayState: async () => null,
    };

    const view = render(<GameOverlay />);
    assert.ok(view.container.textContent === '');

    act(() => listener?.({ text: 'Lead · 3 verified · You: #3', tone: 'info', corner: 'top-left', size: 'large' }));
    const text = view.container.querySelector('.game-overlay-text');
    assert.ok(text?.textContent === 'Lead · 3 verified · You: #3');
    assert.ok(text?.classList.contains('large') === true);
    assert.ok(view.container.querySelector('.game-overlay-frame.top-left') !== null);

    act(() => listener?.(null));
    assert.ok(view.container.textContent === '');

    view.unmount();
    assert.ok(unsubscribed);
});

test('the overlay view shows a line that was sent before it subscribed', async () => {
    const line: GameOverlayState = { text: 'Lead · 12 verified · You: #5', tone: 'info', corner: 'top-right', size: 'medium' };
    (window as any).api = {
        onGameOverlayState: () => () => {},
        getGameOverlayState: async () => line,
    };

    const view = render(<GameOverlay />);
    await act(async () => {});
    assert.ok(view.container.querySelector('.game-overlay-text')?.textContent === line.text);
});

test('a pushed line is not replaced by an older fetched line', async () => {
    let listener: ((state: GameOverlayState | null) => void) | undefined;
    let answer: ((state: GameOverlayState | null) => void) | undefined;
    (window as any).api = {
        onGameOverlayState: (callback: typeof listener) => {
            listener = callback;
            return () => {};
        },
        getGameOverlayState: () => new Promise<GameOverlayState | null>((resolve) => { answer = resolve; }),
    };

    const view = render(<GameOverlay />);
    act(() => listener?.({ text: 'newer', tone: 'verified', corner: 'top-right', size: 'medium' }));
    await act(async () => answer?.({ text: 'older', tone: 'info', corner: 'top-right', size: 'medium' }));
    assert.ok(view.container.querySelector('.game-overlay-text')?.textContent === 'newer');
});
