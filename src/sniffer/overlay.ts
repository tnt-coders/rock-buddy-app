import { durationString } from '../common/functions';
import { rankedScores } from '../ui/Leaderboard';
import { VerificationState, type SnifferState } from './sniffer';
import type { GameOverlayTone } from '../ui/desktop-state';

export interface GameOverlayLine {
    text: string;
    tone: GameOverlayTone;
}

// Colour the live line with the same verification result shown on the Sniffer page.
const verificationTones: Record<VerificationState, GameOverlayTone> = {
    [VerificationState.Verified]: 'verified',
    [VerificationState.MaybeVerified]: 'maybe-verified',
    [VerificationState.Unverified]: 'unverified',
    [VerificationState.None]: 'ineligible',
};

// Turn one Sniffer snapshot into the single line shown over the game, or null to hide it.
export function gameOverlayLine(state: SnifferState, userId: number): GameOverlayLine | null {
    // Hide the overlay while Rocksmith or RockSniffer is unavailable or no song is selected.
    if (state.error || !state.song) return null;

    const live = state.live;
    const suffix = state.lurkMode ? ' · Lurk mode' : '';

    // During a song, mirror the live feed counters.
    if (live?.active) {
        const time = `${durationString(live.songTimer)}/${durationString(live.songLength)}`;
        const notes = live.noteData;
        const text = notes
            ? `${notes.TotalNotesHit}/${notes.TotalNotes} (${Number(notes.Accuracy).toFixed(2)}%)` +
              ` · Streak ${notes.CurrentHitStreak}/${notes.HighestHitStreak} · ${time}`
            : time;
        return { text: text + suffix, tone: verificationTones[state.verification] };
    }

    // In the song list, summarise the leaderboard that the Sniffer already downloaded.
    return { text: leaderboardSummary(state, userId) + suffix, tone: 'info' };
}

// Describe the selected arrangement's leaderboard and this account's place on it.
function leaderboardSummary(state: SnifferState, userId: number): string {
    const pathName = state.paths.find((path) => path.toLowerCase() === state.path);
    const label = pathName ?? capitalize(state.path);
    if (!pathName) return `${label} · not available`;

    // Countdown and snort messages are routine loading states; other messages explain a problem.
    const { scores, message, mode } = state.leaderboard;
    if (!scores) {
        const loading = !message || message.startsWith('Snorting') || message === '*Snort*';
        return `${label} · ${loading ? 'loading…' : message}`;
    }

    const ranked = rankedScores(scores, mode);

    // Score Attack is never live-verified, so rank every score for the chosen difficulty.
    if (mode === 'sa') {
        const mine = ranked.find((score) => score.user_id === userId);
        const count = scores.length === 1 ? '1 score' : `${scores.length} scores`;
        return `${label} SA ${capitalize(state.difficulty)} · ${count} · You: ${mine ? `#${mine.rank}` : 'no score'}`;
    }

    // Learn a Song places verified scores first, so a verified rank is the player's place.
    const verifiedCount = scores.filter((score) => Boolean(score.verified)).length;
    if (verifiedCount === 0) return `${label} · no verified scores yet`;

    const mine = ranked.find((score) => score.user_id === userId && Boolean(score.verified));
    return `${label} · ${verifiedCount} verified · You: ${mine ? `#${mine.rank}` : 'no verified score'}`;
}

function capitalize(text: string): string {
    return text ? text[0].toUpperCase() + text.slice(1) : text;
}
