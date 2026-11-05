import { useState, useRef } from 'react';
import { approxEqual } from '../common/functions';
import { request } from './api';
import { useAuth } from './Session';
import { useResource } from './useResource';
import { AsyncState } from './AsyncState';
import { ProfileDialog } from '../profile/ProfilePage';
import { useColumnMinimums } from './useColumnMinimums';
import { ColumnResizeHandle } from './ColumnResizeHandle';
import { scoreColumns, tableFonts, type TableFont, type ColumnWidths, type ScoreColumn } from './ScoreColumns';

import type { Score } from '../common/types';
export type { Score } from '../common/types';

// Preserve ties and the backend's verified-first ordering.
export function rankedScores(scores: Score[], mode: string) {
    let rank = 0;
    return scores.map((score, index) => {
        const previous = scores[index - 1];
        const tied =
            previous &&
            (mode === 'las'
                ? score.verified === previous.verified &&
                  approxEqual(score.mastery, previous.mastery) &&
                  approxEqual(score.streak, previous.streak)
                : approxEqual(score.badges, previous.badges) &&
                  approxEqual(score.score, previous.score));
        if (!tied) rank = index + 1;
        return { ...score, rank };
    });
}

export function ScoresTable({ scores, mode, hiddenColumns = [], columnWidths, onColumnResize, columnOrder, onColumnReorder, font }: {
    scores: Score[];
    mode: string;
    hiddenColumns?: ScoreColumn[];
    columnWidths?: ColumnWidths | null;
    columnOrder?: ScoreColumn[];
    onColumnReorder?: (from: ScoreColumn, to: ScoreColumn) => void;
    font?: TableFont;
    onColumnResize?: (id: ScoreColumn, width: number, save: boolean, measured?: Partial<ColumnWidths>) => void;
}) {
    const auth = useAuth();
    const [player, setPlayer] = useState<string>();
    const dragging = useRef<ScoreColumn | null>(null);
    const [dropTarget, setDropTarget] = useState<ScoreColumn>();
    const visibleColumns = scoreColumns(mode, columnOrder).filter(({ id }) => id === 'username' || !hiddenColumns.includes(id));
    const resizable = !!onColumnResize;
    const fixedWidths = resizable && !!columnWidths;
    const { table, minimums, measuredWidths } = useColumnMinimums(resizable && scores.length > 0, visibleColumns.map(column => column.id).join(','), font);
    const widthOf = (id: ScoreColumn) => Math.max(columnWidths?.[id] ?? measuredWidths[id] ?? 64, minimums[id] || 0);
    const tableWidth = visibleColumns.reduce((total, { id }) => total + widthOf(id), 0);
    if (!scores.length)
        return (
            <p>
                And this is where I would put my scores... <em>IF I HAD ONE!</em>
            </p>
        );

    return (
        <>
            <table ref={table} className={`leaderboard-data${resizable ? ' resizable-columns' : ''}${fixedWidths ? ' fixed-columns' : ''}`} style={{ ...(fixedWidths ? { width: tableWidth } : {}), ...(font ? { fontFamily: tableFonts[font].family } : {}) }}>
                {fixedWidths && <colgroup>{visibleColumns.map(({ id }) => <col key={id} style={{ width: widthOf(id) }} />)}</colgroup>}
                <thead>
                    <tr>
                        {visibleColumns.map(({ id, label }) => (
                            <th key={id} className={id === 'rank' ? 'rank-cell' : undefined} aria-label={label} data-drop-target={dropTarget === id || undefined}
                                onDragOver={event => {
                                    if (!dragging.current || !onColumnReorder) return;
                                    event.preventDefault();
                                    event.dataTransfer.dropEffect = 'move';
                                    setDropTarget(id);
                                }}
                                onDragLeave={() => setDropTarget(undefined)}
                                onDrop={event => {
                                    if (!dragging.current || !onColumnReorder) return;
                                    event.preventDefault();
                                    onColumnReorder(dragging.current, id);
                                    dragging.current = null;
                                    setDropTarget(undefined);
                                }}>
                                <span data-column-heading={id} className={onColumnReorder ? 'column-drag-label' : undefined}
                                    draggable={!!onColumnReorder} title={onColumnReorder ? 'Drag to reorder' : undefined}
                                    onDragStart={event => {
                                        dragging.current = id;
                                        event.dataTransfer.effectAllowed = 'move';
                                        event.dataTransfer.setData('text/plain', id);
                                    }}
                                    onDragEnd={() => { dragging.current = null; setDropTarget(undefined); }}>{label}</span>
                                {resizable && <ColumnResizeHandle label={label} width={widthOf(id)} minimum={minimums[id]}
                                    onResize={(width, save) => onColumnResize!(id, width, save, measuredWidths)} />}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rankedScores(scores, mode).map((score) => (
                        <tr
                            key={score.user_id}
                            className={score.user_id === auth.user_id ? 'current-user' : undefined}
                        >
                            {visibleColumns.map(({ id }) => (
                                <td key={id} data-column={id} className={id === 'rank' ? 'rank-cell' : id === 'playCount' && score.play_count == null ? 'unknown-value' : undefined}><ScoreCell column={id} score={score} onPlayer={setPlayer} /></td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
            {player && <ProfileDialog username={player} onClose={() => setPlayer(undefined)} />}
        </>
    );
}

// Headers, widths and cells all follow the same ordered list of column IDs.
function ScoreCell({ column, score, onPlayer }: {
    column: ScoreColumn;
    score: Score & { rank: number };
    onPlayer: (username: string) => void;
}) {
    switch (column) {
        case 'rank': return score.rank;
        case 'lastPlayed': return score.last_played ?? 'Unknown';
        case 'playCount': return score.play_count ?? 'Unknown';
        case 'streak': return score.streak;
        case 'username': return <>
            {Boolean(score.king) && <img className="score-badge" src="../images/crown.png" alt="King" />}
            <button className="text-button" onClick={() => onPlayer(score.username)}>{score.username}</button>
        </>;
        case 'mastery': return <>
            {Boolean(score.verified) && (
                <svg className="score-badge verified-score-icon" viewBox="0 0 20 20" role="img" aria-label="Verified">
                    <title>Verified</title>
                    <circle cx="10" cy="10" r="9" fill="#bbf7d0" />
                    <path d="m5.5 10 3 3 6-6" fill="none" stroke="#14532d" strokeWidth="2.5"
                        strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            )}
            {(score.mastery * 100).toFixed(2)}%
        </>;
        case 'score': return <>
            <img className="score-badge" src={`../images/badge-icons/badge-${score.badges}.png`} alt={`Badge ${score.badges}`} />
            {score.score.toLocaleString('en-US')}
        </>;
    }
}

export function Leaderboard({
    song,
    hash,
    path,
    mode,
    difficulty,
}: {
    song: string;
    hash: string;
    path: string;
    mode: string;
    difficulty: string;
}) {
    const auth = useAuth();
    const scores = useResource(
        `scores:${JSON.stringify([auth.user_id, song, hash, path, mode, difficulty])}`,
        () =>
            request<Score[]>(`data/get_scores_${mode}`, {
                auth_data: auth,
                song_key: song,
                psarc_hash: hash,
                arrangement: path,
                ...(mode === 'sa' ? { difficulty } : {}),
            }),
        { live: true },
    );
    return (
        <>
            <AsyncState {...scores} retry={scores.reload} />
            {scores.data && <ScoresTable scores={scores.data} mode={mode} />}
        </>
    );
}

export function ScoreFilters({
    paths,
    path,
    mode,
    difficulty,
    onChange,
    showLabels = false,
}: {
    paths: string[];
    path: string;
    mode: string;
    difficulty: string;
    onChange: (field: 'path' | 'mode' | 'difficulty', value: string) => void;
    showLabels?: boolean;
}) {
    return (
        <div className="score-filters">
            <label>
                {showLabels && <span>Game Mode:</span>}
                <select
                    aria-label="Game mode"
                    value={mode}
                    onChange={(event) => onChange('mode', event.target.value)}
                >
                    <option value="las">Learn a Song</option>
                    <option value="sa">Score Attack</option>
                </select>
            </label>
            <label>
                {showLabels && <span>Path:</span>}
                <select
                    aria-label="Arrangement"
                    value={path}
                    onChange={(event) => onChange('path', event.target.value)}
                >
                    {paths.map((name) => (
                        <option value={name.toLowerCase()} key={name}>
                            {name.charAt(0).toUpperCase() + name.slice(1).toLowerCase()}
                        </option>
                    ))}
                </select>
            </label>
            {mode === 'sa' && (
                <label>
                    {showLabels && <span>Difficulty:</span>}
                    <select
                        aria-label="Difficulty"
                        value={difficulty}
                        onChange={(event) => onChange('difficulty', event.target.value)}
                    >
                        <option value="hard">Hard</option>
                        <option value="master">Master</option>
                    </select>
                </label>
            )}
        </div>
    );
}
