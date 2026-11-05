import { useState } from 'react';
import { request } from '../ui/api';
import { useAuth } from '../ui/Session';
import { useResource } from '../ui/useResource';
import { AsyncState } from '../ui/AsyncState';
import { Modal } from '../ui/Modal';
import { ProfileDialog } from '../profile/ProfilePage';
import { rankVerbs } from './verbs';
import { rankSummary, type Rank } from '../ui/pageResources';

const paths = ['overall', 'lead', 'rhythm', 'bass'] as const;

function RankCard({
    player,
    rank,
    onSelect,
}: {
    player: Rank;
    rank?: number;
    onSelect: () => void;
}) {
    const [verb] = useState(() => rankVerbs[Math.floor(Math.random() * rankVerbs.length)]);
    return (
        <div className={rank ? 'rank rank-card' : 'king rank-card'}>
            {rank ? (
                <h2 className={['gold', 'silver', 'bronze'][rank - 1]}>{rank}</h2>
            ) : (
                <img src="../images/rock-king.png" alt="King of Rocksmith" />
            )}
            <div>
                <button className="text-button" onClick={onSelect}>
                    <strong>{player.username}</strong>
                </button>
                <p>
                    Scores {verb}: {player.points}
                </p>
            </div>
        </div>
    );
}

function RankDialog({ path, onClose }: { path: string; onClose: () => void }) {
    const auth = useAuth();
    const [player, setPlayer] = useState<string>();
    const ranks = useResource(`rank:${auth.user_id}:${path}`, () =>
        request<Rank[]>(`data/get_ranks_${path}`, { auth_data: auth }),
        { live: true },
    );
    return (
        <Modal title={`${path[0].toUpperCase()}${path.slice(1)} rankings`} onClose={onClose}>
            <AsyncState {...ranks} retry={ranks.reload} />
            {ranks.data && (
                <table>
                    <thead>
                        <tr>
                            <th>Rank</th>
                            <th>Username</th>
                            <th>Points</th>
                        </tr>
                    </thead>
                    <tbody>
                        {ranks.data.map((row, index) => (
                            <tr
                                key={row.user_id}
                                className={
                                    row.user_id === auth.user_id ? 'current-user' : undefined
                                }
                            >
                                <td>{index + 1}</td>
                                <td>
                                    {Boolean(row.king) && (
                                        <img
                                            className="score-badge"
                                            src="../images/crown.png"
                                            alt="King"
                                        />
                                    )}
                                    <button
                                        className="text-button"
                                        onClick={() => setPlayer(row.username)}
                                    >
                                        {row.username}
                                    </button>
                                </td>
                                <td>{row.points}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
            {player && <ProfileDialog username={player} onClose={() => setPlayer(undefined)} />}
        </Modal>
    );
}

export function RankPage() {
    const auth = useAuth();
    const [player, setPlayer] = useState<string>();
    const [expanded, setExpanded] = useState<string>();
    const ranks = useResource(rankSummary(auth));
    const king = ranks.data?.overall[0];

    return (
        <main>
            <div className="rank-page-heading">
                <h1>Rank</h1>
                <p id="disclaimer">Your rank is based on the verified scores you defeat or tie.</p>
            </div>
            <AsyncState {...ranks} retry={ranks.reload} />
            {king && (
                <>
                    <h2>King of Rocksmith</h2>
                    <RankCard player={king} onSelect={() => setPlayer(king.username)} />
                </>
            )}
            {ranks.data && (
                <div className="rank-grid">
                    {paths.map((path) => (
                        <section key={path}>
                            <h3 className="capitalize">{path}</h3>
                            {ranks.data![path].map((row, index) => (
                                <RankCard
                                    key={row.user_id ?? row.username}
                                    player={row}
                                    rank={index + 1}
                                    onSelect={() => setPlayer(row.username)}
                                />
                            ))}
                            <button
                                className="expand-button"
                                aria-label={`Show all ${path} rankings`}
                                onClick={() => setExpanded(path)}
                            >
                                ...
                            </button>
                        </section>
                    ))}
                </div>
            )}
            {expanded && <RankDialog path={expanded} onClose={() => setExpanded(undefined)} />}
            {player && <ProfileDialog username={player} onClose={() => setPlayer(undefined)} />}
        </main>
    );
}
