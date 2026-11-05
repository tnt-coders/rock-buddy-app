import { useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import { durationString } from '../common/functions';
import { Sniffer, VerificationState } from './sniffer';
import { useGameplay } from './Gameplay';
import { AsyncState } from '../ui/AsyncState';
import { ScoreFilters, ScoresTable } from '../ui/Leaderboard';
import { Modal } from '../ui/Modal';
import { useAuth } from '../ui/Session';
import { ColumnPicker, useSnifferColumns } from '../ui/ScoreColumns';

// Render the shared engine snapshot with this account's saved column preferences.
function SnifferView({ engine }: { engine: Sniffer }) {
    const auth = useAuth();
    const columns = useSnifferColumns(auth.user_id);
    const state = useSyncExternalStore(engine.subscribe, engine.getSnapshot);
    const [popup, setPopup] = useState<'verification' | 'version'>();
    const song = state.song;
    const live = state.live;
    const notes = live?.noteData;
    const badge =
        state.verification === VerificationState.Verified
            ? 'verified'
            : state.verification === VerificationState.MaybeVerified
              ? 'maybe-verified'
              : 'unverified';

    return (
        <main className="sniffer-page">
            <div className="page-heading">
                <h1>Leaderboard Sniffer</h1>
                {state.lurkMode && <strong className="lurk-mode-notice">LURK MODE ON (SCORES WILL NOT BE RECORDED)</strong>}
                <div className="sniffer-actions">
                    <span role="status">{state.status}</span>
                    {song && <button id="snort" title="Force an immediate refresh of the data."
                        disabled={!state.canSnort} onClick={() => engine.queueSnort()}>Snort</button>}
                </div>
            </div>
            {state.error && <p role="status">{state.error}</p>}
            {song && (
                <>
                    <div className="sniffer-summary">
                        <div className="song-info">
                            <img
                                className="coveralbum"
                                src={`data:image/jpeg;base64,${song.albumArt}`}
                                alt={`${song.albumName} cover`}
                            />
                            <div className="song-details">
                                <h2 title={song.artistName}>{song.artistName}</h2>
                                <h2 title={song.songName}>{song.songName}</h2>
                                <p className="song-album" title={`${song.albumName} (${song.albumYear})`}>
                                    {song.albumName} ({song.albumYear})
                                </p>
                                <p className="song-version" title={`Version ${song.toolkit.version} - ${song.toolkit.author}`}>
                                    Version {song.toolkit.version} - {song.toolkit.author}
                                </p>
                                {state.newVersion && (
                                    <button onClick={() => setPopup('version')}>New chart version</button>
                                )}
                            </div>
                        </div>
                        <div className="live-data">
                            <div className="live-heading">
                                <span
                                    className="circle"
                                    style={{ backgroundColor: live?.active ? 'green' : 'red' }}
                                />
                                <strong>Live Feed</strong>
                            </div>
                            {state.verification !== VerificationState.None && (
                                <button
                                    className="text-button live-verification"
                                    onClick={() => setPopup('verification')}
                                >
                                    <img
                                        className="verification-badge"
                                        src={`../images/verification-icons/${badge}.png`}
                                        alt={VerificationState[state.verification]}
                                    />
                                </button>
                            )}
                            {notes && (
                                <>
                                    <span className="live-accuracy">
                                        <b>Accuracy:</b> {notes.TotalNotesHit}/{notes.TotalNotes} ({Number(notes.Accuracy).toFixed(2)}%)
                                    </span>
                                    <span className="live-streak" title="Current / highest streak">
                                        <b>Streak:</b> {notes.CurrentHitStreak}/{notes.HighestHitStreak}
                                    </span>
                                    <span className="live-time">
                                        <b>Time:</b> {durationString(live.songTimer)}/{durationString(live.songLength)}
                                    </span>
                                </>
                            )}
                        </div>
                    </div>
                    <div className="score-toolbar">
                        <ScoreFilters
                            paths={state.paths}
                            path={state.path}
                            mode={state.mode}
                            difficulty={state.difficulty}
                            showLabels
                            onChange={(field, value) => engine.select(field, value)}
                        />
                        <ColumnPicker
                            mode={state.mode}
                            hidden={columns.hidden}
                            onChange={columns.change}
                            error={columns.error}
                            onResetWidths={columns.resetWidths}
                            order={columns.order} onOrderChange={columns.changeOrder}
                            font={columns.font} onFontChange={columns.changeFont}
                        />
                    </div>
                    <div id="leaderboard_data">
                        {state.leaderboard.message && (
                            <p role="status">{state.leaderboard.message}</p>
                        )}
                        {state.leaderboard.scores && (
                            <ScoresTable
                                scores={state.leaderboard.scores}
                                mode={state.leaderboard.mode}
                                hiddenColumns={columns.hidden}
                                columnWidths={columns.widths}
                                onColumnResize={columns.resize}
                                columnOrder={columns.order} onColumnReorder={columns.reorder} font={columns.font}
                            />
                        )}
                    </div>
                </>
            )}
            {popup && (
                <Modal
                    title={
                        popup === 'version'
                            ? 'New chart version'
                            : VerificationState[state.verification]
                    }
                    onClose={() => setPopup(undefined)}
                >
                    <p>
                        {popup === 'version'
                            ? 'A newer version of this chart has been played by another user.'
                            : state.verificationMessage}
                    </p>
                </Modal>
            )}
        </main>
    );
}

// Show engine startup errors or the live view without creating another reader.
export function SnifferPage() {
    const auth = useAuth();
    const { engine, error, retry } = useGameplay();

    if (engine) return <SnifferView key={auth.user_id} engine={engine} />;

    return (
        <main>
            <h1>Leaderboard Sniffer</h1>
            <AsyncState loading={!error} error={error} retry={retry} />
            {error && (
                <p>
                    <Link to="/config">Config</Link>
                </p>
            )}
        </main>
    );
}
