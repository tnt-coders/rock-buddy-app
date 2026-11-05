export interface AuthData {
    user_id: number;
    api_key: string;
    [key: string]: unknown;
}

// Preserve the API's numeric flags and missing history values at the renderer boundary.
export interface Score {
    user_id: number;
    username: string;
    king: boolean | 0 | 1;
    verified?: boolean | 0 | 1;
    last_played: string | null;
    play_count: number | null;
    streak: number;
    mastery: number;
    score: number;
    badges: number;
}

// Presentation fields shared by the game service and React views.
export interface SongInfo {
    songID: string;
    psarcFileHash: string;
    albumArt: string;
    artistName: string;
    songName: string;
    albumName: string;
    albumYear: number;
    songLength: number;
    toolkit: { version: string; author: string };
}

export interface LiveFeed {
    active: boolean;
    mode: number;
    songTimer: number;
    songLength: number;
    noteData: {
        TotalNotesHit: number;
        TotalNotes: number;
        Accuracy: number;
        CurrentHitStreak: number;
        HighestHitStreak: number;
    } | null;
}
