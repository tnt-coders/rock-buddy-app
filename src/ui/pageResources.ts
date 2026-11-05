import { request, type AuthData } from './api';

export interface Resource<T> {
    key: string;
    read: () => Promise<T>;
    live?: boolean;
    cache?: boolean;
}

export interface Rank {
    user_id: number;
    username: string;
    points: number;
    king?: boolean | 0 | 1;
}
type Paths = 'overall' | 'lead' | 'rhythm' | 'bass';
export interface Profile {
    username: string;
    twitch_username: string | null;
}
interface Stats {
    verified_perfect_scores?: Record<Paths, number>;
    verified_scores: Record<Paths, number>;
    accuracy: Record<Paths, number>;
}

// Navigation and page rendering share keys and captured credentials.
export const rankSummary = (auth: AuthData): Resource<Record<Paths, Rank[]>> => ({
    key: `ranks:${auth.user_id}`,
    read: () => request('data/get_ranks_top3', { auth_data: auth }),
    live: true,
});

export const userProfile = (auth: AuthData, username?: string): Resource<Profile> => ({
    key: `profile:${auth.user_id}:${username || 'self'}`,
    read: () => request('data/get_user_profile_data', {
        auth_data: auth, ...(username ? { username } : { user_id: auth.user_id }),
    }),
});

export const userStats = (auth: AuthData, username?: string): Resource<Stats> => ({
    key: `stats:${auth.user_id}:${username || 'self'}`,
    read: () => request('data/get_user_stats', {
        auth_data: auth, ...(username ? { username } : { user_id: auth.user_id }),
    }),
    live: true,
});

export const accountInfo = (auth: AuthData): Resource<{ username: string; email: string }> => ({
    key: `account:${auth.user_id}`,
    read: () => request('account/get_account_info', auth),
});

export function pageResources(path: string, auth: AuthData): Resource<unknown>[] {
    switch (path) {
        case '/rank': return [rankSummary(auth)];
        case '/profile': return [userProfile(auth), userStats(auth)];
        case '/account': return [accountInfo(auth)];
        default: return [];
    }
}
