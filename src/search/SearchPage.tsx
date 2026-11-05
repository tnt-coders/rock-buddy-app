import { useState } from 'react';
import { sortPaths } from '../common/functions';
import { request } from '../ui/api';
import { useAuth } from '../ui/Session';
import { useResource } from '../ui/useResource';
import { AsyncState } from '../ui/AsyncState';
import { Modal } from '../ui/Modal';
import { Leaderboard, ScoreFilters } from '../ui/Leaderboard';
import { useSearchState } from '../ui/SearchState';
import { useQueryClient } from '@tanstack/react-query';

interface Song {
    artist: string;
    title: string;
    album: string;
    year: number;
}
interface Chart {
    song_key: string;
    psarc_hash: string;
    version: string;
    author: string;
}

// Load one chart's paths and use the saved preference until the user changes it.
function ChartScores({ chart }: { chart: Chart }) {
    const auth = useAuth();
    const [selection, setSelection] = useState({ path: '', mode: 'las', difficulty: 'hard' });
    const paths = useResource(
        `paths:${JSON.stringify([auth.user_id, chart.song_key, chart.psarc_hash])}`,
        async () => {
            const [available, preferred] = await Promise.all([
                request<string[]>('data/get_paths_from_psarc', {
                    auth_data: auth,
                    song_key: chart.song_key,
                    psarc_hash: chart.psarc_hash,
                }),
                window.api.storeGet(`user_data.${auth.user_id}.preferred_path`),
            ]);
            return {
                available: sortPaths(available),
                preferred: String(preferred || 'lead').toLowerCase(),
            };
        },
    );
    const available = paths.data?.available || [];

    // Prefer the configured path, falling back to an available path rather than a score.
    const wanted = selection.path || paths.data?.preferred;
    const path =
        available.find((name) => name.toLowerCase() === wanted)?.toLowerCase() ||
        available[0]?.toLowerCase();

    return (
        <>
            <AsyncState {...paths} retry={paths.reload} />
            {path && (
                <>
                    <ScoreFilters
                        {...selection}
                        path={path}
                        paths={available}
                        onChange={(field, value) =>
                            setSelection((current) => ({ ...current, [field]: value }))
                        }
                    />
                    <Leaderboard
                        song={chart.song_key}
                        hash={chart.psarc_hash}
                        {...selection}
                        path={path}
                    />
                </>
            )}
        </>
    );
}

// Let the user choose a chart version and view its scores without leaving Search.
function SongDialog({ song, onClose }: { song: Song; onClose: () => void }) {
    const auth = useAuth();
    const [index, setIndex] = useState(0);
    const charts = useResource(`charts:${JSON.stringify([auth.user_id, song])}`, () =>
        request<Chart[]>('data/get_available_charts', { auth_data: auth, ...song }),
    );
    const chart = charts.data?.[index];

    return (
        <Modal title={`${song.artist} — ${song.title}`} className="song-dialog" onClose={onClose}>
            <p className="song-metadata" title={`${song.album} (${song.year})`}>
                {song.album} ({song.year})
            </p>
            <AsyncState {...charts} retry={charts.reload} />
            {charts.data && (
                <select
                    aria-label="Chart"
                    value={index}
                    onChange={(event) => setIndex(Number(event.target.value))}
                >
                    {charts.data.map((entry, i) => (
                        <option key={i} value={i}>
                            Version {entry.version} - {entry.author} ({i + 1})
                        </option>
                    ))}
                </select>
            )}
            {chart && <ChartScores key={`${chart.song_key}:${chart.psarc_hash}`} chart={chart} />}
            {charts.data?.length === 0 && <p>No charts found.</p>}
        </Modal>
    );
}

// Load matching songs and keep the selected song dialog attached to these results.
function SearchResults({ query }: { query: string }) {
    const auth = useAuth();
    const [song, setSong] = useState<Song>();
    const results = useResource(`search:${JSON.stringify([auth.user_id, query])}`, () =>
        request<Song[]>('data/search', { auth_data: auth, input: query, page: 0 }),
    );

    return (
        <>
            <AsyncState {...results} retry={results.reload} />
            {results.data?.length === 0 && <p>No songs found.</p>}
            {!!results.data?.length && (
                <table className="search-results">
                    <thead>
                        <tr>
                            {['Artist', 'Title', 'Album', 'Year'].map((label) => (
                                <th key={label}>{label}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {results.data.map((item, index) => (
                            <tr key={index} onClick={() => setSong(item)}>
                                <td title={item.artist}>{item.artist}</td>
                                <td title={item.title}>
                                    <button className="text-button" onClick={() => setSong(item)}>
                                        {item.title}
                                    </button>
                                </td>
                                <td title={item.album}>{item.album}</td>
                                <td title={String(item.year)}>{item.year}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
            {song && <SongDialog song={song} onClose={() => setSong(undefined)} />}
        </>
    );
}

// Preserve the search between page visits and refresh it on an explicit submission.
export function SearchPage() {
    const auth = useAuth();
    const client = useQueryClient();
    const { search, setSearch } = useSearchState();
    return (
        <main>
            <h1>Search</h1>
            <form
                className="search-form"
                onSubmit={(event) => {
                    event.preventDefault();
                    const query = search.input.trim();
                    if (!query) return;

                    // An explicit search refreshes even a recently cached result.
                    void client.invalidateQueries({
                        queryKey: ['resource', `search:${JSON.stringify([auth.user_id, query])}`],
                        exact: true,
                    });
                    setSearch(current => ({ ...current, query, revision: current.revision + 1 }));
                }}
            >
                <input
                    aria-label="Search songs"
                    placeholder="Search..."
                    value={search.input}
                    onChange={(event) => setSearch(current => ({ ...current, input: event.target.value }))}
                />
                <button className="btn-primary">Search</button>
            </form>
            {search.query && <SearchResults key={search.revision} query={search.query} />}
        </main>
    );
}
