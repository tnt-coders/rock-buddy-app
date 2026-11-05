import { Rocksmith } from './rocksmith';
import { Rocksniffer } from './rocksniffer';
import { SoundEffect } from './sound_effect';
import {
    approxEqual,
    buildValidSemver,
    getAvailablePaths,
    logMessage,
    post,
} from '../common/functions';
import type { AuthData, Score, SongInfo, LiveFeed } from '../common/types';

export enum VerificationState {
    None,
    Verified,
    MaybeVerified,
    Unverified,
}

export interface SnifferState {
    activity: 'waiting' | 'sniffing' | 'paused' | 'error';
    status: string;
    error: string | null;
    song: SongInfo | null;
    live: LiveFeed | null;
    paths: string[];
    path: string;
    mode: string;
    difficulty: string;
    lurkMode: boolean;
    canSnort: boolean;
    newVersion: boolean;
    verification: VerificationState;
    verificationMessage: string;
    scoreRevision: number;
    leaderboard: { message: string; scores: Score[] | null; mode: string };
}

// Startup and song selection are normal waiting states, not reader failures.
class SnifferWaiting extends Error {}

// Track one account's gameplay independently of which React page is visible.
export class Sniffer {
    // Refresh rate in milliseconds
    private static readonly refreshRate: number = 100; // milliseconds
    private static readonly rocksnifferTimeout: number = 1000; // milliseconds
    private static readonly pauseThreshold: number = 500; // milliseconds

    private readonly _rocksmith: Rocksmith;
    private readonly _rocksniffer: Rocksniffer;
    private readonly _soundEffect: SoundEffect;

    // Prevent duplicate refreshes
    private _refreshActive: boolean = false;

    // Prevent explosion of error messages
    private _lastErrorMessage: string = '';
    private _syncErrorDisplayed: boolean = false;
    private _syncActive: boolean = false;
    private _syncSongId: string | null = null;
    private _retrySyncAt: number = 0;

    // Game mode/path/difficulty combo box data
    private _preferredPath: string = 'lead';
    private _gameMode: string = 'las';
    private _path: string = 'lead';
    private _difficulty: string = 'hard';

    // Rocksniffer data from last refresh
    private _previousRocksnifferData: any = null;

    // Progress monitor data
    private _nonstopPlayOrScoreAttack: boolean = false;
    private _verified: boolean = true;
    private _inSong: boolean = false;
    private _refreshCounter: number = 0; // When a new song starts we want to allow 5 refreshes before verification checks start
    private _progressTimer: number = 0;
    private _progressTimerSyncOffset: number = 0; // Sometimes more than one refresh occurs between updates on slower PCs
    private _pauseTimer: number = 0;
    private _pauseTimerSyncOffset: number = 0; // Sometimes more than one refresh occurs between updates on slower PCs
    private _maybePaused: boolean = false;
    private _isPaused: boolean = false;
    private _pausedInLast10Minutes: boolean = false;
    private _pauseTime: number = 0;
    private _lastPauseTime: number = 0;
    private _ending: boolean = false;
    private _rocksnifferTimeoutCounter: number = 0;
    private _speedChange = false;

    // Snort data
    private snortRate = 3000; // milliseconds
    private snortRateRequest = 0;
    private unsubscribeUpdates?: () => void;
    private _snort: boolean = true; // Set true on startup to ensure initial snorting
    private _snorted: boolean = false; // Set false on startup to ensure initial snorting
    private _snortCountdown: number = this.snortRate / 1000; // seconds
    private _timeSinceLastSnort: number = 0;

    // Lurk mode
    private _lurkMode: boolean = false;

    // Debug fields
    private _extraLogging: boolean = false;

    private readonly auth: AuthData;
    private stopped = false;
    private timer: ReturnType<typeof setInterval> | undefined;
    private listeners = new Set<() => void>();
    private leaderboardRequest = 0;
    private state: SnifferState = {
        activity: 'waiting',
        status: 'Waiting...',
        error: null,
        song: null,
        live: null,
        paths: [],
        path: 'lead',
        mode: 'las',
        difficulty: 'hard',
        lurkMode: false,
        canSnort: true,
        newVersion: false,
        verification: VerificationState.None,
        verificationMessage: '',
        scoreRevision: 0,
        leaderboard: { message: '', scores: null, mode: 'las' },
    };

    // Capture the account and readers that belong to this gameplay session.
    private constructor(
        rocksmith: Rocksmith,
        rocksniffer: Rocksniffer,
        soundEffect: SoundEffect,
        auth: AuthData,
    ) {
        this._rocksmith = rocksmith;
        this._rocksniffer = rocksniffer;
        this._soundEffect = soundEffect;
        this.auth = auth;
    }

    // React subscribes to immutable snapshots; the engine never touches the DOM.
    public getSnapshot = () => this.state;
    public subscribe = (listener: () => void) => {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    };

    // Notify React of a new snapshot only while this engine is still running.
    private publish(change: Partial<SnifferState>) {
        if (this.stopped) return;
        this.state = { ...this.state, ...change };
        this.listeners.forEach((listener) => listener());
    }

    // Separate normal reader waiting states from failures that need attention.
    private showError(error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        this.publish({ error: message, status: 'Waiting...', activity: error instanceof SnifferWaiting ? 'waiting' : 'error' });
    }

    // Load local readers and account settings, stopping setup if the session is cancelled.
    public static async create(auth: AuthData, signal?: AbortSignal): Promise<Sniffer> {
        signal?.throwIfAborted();
        const rocksmith = await Rocksmith.create();
        signal?.throwIfAborted();
        const rocksniffer = await Rocksniffer.create();
        signal?.throwIfAborted();

        // Capture settings for this account, never whichever account logs in next.
        const read = (key: string) => window.api.storeGet(`user_data.${auth.user_id}.${key}`);
        const missSFX = (await read('miss_sfx')) || 'none';
        const soundPath =
            missSFX === 'custom'
                ? await read('custom_miss_sfx_path')
                : missSFX === 'custom_multi'
                  ? await read('custom_miss_sfx_multi_path')
                  : null;
        const soundEffect = await SoundEffect.create(missSFX, soundPath);
        const sniffer = new Sniffer(rocksmith, rocksniffer, soundEffect, auth);

        try {
            sniffer._preferredPath = (await read('preferred_path')) || 'lead';
            sniffer._lurkMode =
                !!(await read('lurk_mode')) || !!(await read('use_external_rocksniffer'));
            sniffer._extraLogging = !!(await read('extra_logging'));

            // Listen before reading so a late update check can enable instant snorts.
            let previousStatus: string | undefined;
            sniffer.unsubscribeUpdates = window.api.onUpdateState(({ status }) => {
                if (status === previousStatus) return;
                previousStatus = status;

                if (status === 'idle' || status === 'downloading') {
                    void sniffer.refreshSnortRate();
                }
            });
            await sniffer.refreshSnortRate();
            signal?.throwIfAborted();
            sniffer.publish({ lurkMode: sniffer._lurkMode });
            return sniffer;
        } catch (error) {
            sniffer.stop();
            throw error;
        }
    }

    // Apply update results without restarting gameplay or repeating an upload.
    private async refreshSnortRate(): Promise<void> {
        const request = ++this.snortRateRequest;

        try {
            const eligible = await window.api.onLatestBetaVersion();
            if (this.stopped || request !== this.snortRateRequest) return;

            const rate = eligible ? 0 : 3000;
            if (rate === this.snortRate) return;

            this.snortRate = rate;
            this._snortCountdown = rate / 1000;
        } catch {
            // An unavailable update check must not interrupt gameplay.
        }
    }

    // Start one polling timer for this engine.
    public start(): void {
        if (this.timer || this.stopped) return;
        logMessage('Sniffer started');
        this.timer = setInterval(() => void this.refresh(), Sniffer.refreshRate);
    }

    // Stop future submissions immediately, even if a local read is still finishing.
    public stop(): void {
        const wasRunning = this.timer !== undefined;
        this.stopped = true;
        clearInterval(this.timer);
        this.timer = undefined;
        this.unsubscribeUpdates?.();
        this.unsubscribeUpdates = undefined;
        this.listeners.clear();
        this._soundEffect.disable();
        if (wasRunning) window.api.setGameplayActive(false);
    }

    // Reject late requests from a stopped engine or a different signed-in session.
    private async send(url: string, data: any) {
        const current = JSON.parse(window.sessionStorage.getItem('auth_data') || 'null');
        if (
            this.stopped ||
            current?.user_id !== this.auth.user_id ||
            current?.api_key !== this.auth.api_key
        ) {
            throw new Error('This gameplay session has ended.');
        }
        return post(url, data);
    }

    // Request a history sync on the next eligible refresh.
    public queueSnort(): void {
        this._snort = true;
        this.publish({ canSnort: false });
    }

    // Update the leaderboard filters and request a refresh for the new selection.
    public select(field: 'path' | 'mode' | 'difficulty', value: string) {
        if (field === 'path') this._path = value;
        if (field === 'mode') this._gameMode = value;
        if (field === 'difficulty') this._difficulty = value;
        this.publish({ path: this._path, mode: this._gameMode, difficulty: this._difficulty });
        this.queueSnort();
    }

    // Read the game snapshot and turn startup states into waiting messages.
    private async sniff(): Promise<any> {
        const rocksnifferData = await this._rocksniffer.sniff();
        if (rocksnifferData === null) {
            throw new SnifferWaiting('RockSniffer is starting...');
        } else if (!rocksnifferData['RocksmithFound']) {
            throw new SnifferWaiting('Waiting for Rocksmith...');
        } else if (rocksnifferData['psarcProcessingCount'] > 0) {
            throw new SnifferWaiting(
                'RockSniffer is enumerating DLC... ' +
                    rocksnifferData['psarcProcessingCount'] +
                    ' files remaining.',
            );
        } else if (!rocksnifferData['success']) {
            throw new SnifferWaiting('Navigate to a song in Rocksmith to begin sniffing.');
        }

        return rocksnifferData;
    }

    // Advance gameplay checks while save-history sync runs separately.
    private async refresh(): Promise<void> {
        if (this.stopped) return;
        this._refreshCounter++;
        this._timeSinceLastSnort += Sniffer.refreshRate;

        if (this._refreshActive === true) {
            // If a refresh is currently active we need to keep track of how much time has passed to properly sync the progress and pause timers
            if (this._inSong) {
                if (!this._isPaused && !this._ending) {
                    this._progressTimerSyncOffset += Sniffer.refreshRate;
                }

                if (this._maybePaused) {
                    this._pauseTimerSyncOffset += Sniffer.refreshRate;
                }
            }

            logMessage('Refresh already active, returning.');
            return;
        }
        this._refreshActive = true;

        // Keep the progress timer in sync even if there was some latency
        // No need to check if we are in a song or paused since these values will be 0 if we are not in a song
        this._progressTimer += this._progressTimerSyncOffset;
        this._pauseTimer += this._pauseTimerSyncOffset;
        this._progressTimerSyncOffset = 0;
        this._pauseTimerSyncOffset = 0;

        try {
            // If we are in a song, update the progress timer
            if (this._inSong) {
                if (!this._isPaused && !this._ending) {
                    this._progressTimer += Sniffer.refreshRate;
                }

                if (this._maybePaused) {
                    this._pauseTimer += Sniffer.refreshRate;
                }
            }

            const rocksnifferData = await this.sniff();
            if (this.stopped) {
                this._refreshActive = false;
                return;
            }

            window.api.setGameplayActive(
                this._inSong || this._ending || rocksnifferData.memoryReadout?.songTimer > 0,
            );

            // The path must be updated before snorting
            this.updatePath(rocksnifferData);

            // Check if it is time to snort
            // Network sync runs separately so connection loss cannot freeze local gameplay.
            if (!this._syncActive && Date.now() >= this._retrySyncAt) {
                this._syncActive = true;
                void this.checkSnort(rocksnifferData)
                    .catch((error) => {
                        this._retrySyncAt = Date.now() + 30000;
                        this._snort = true;
                        const message =
                            'Could not sync song history. Check your profile settings and connection.';
                        logMessage(message);
                        this.publish({
                            leaderboard: { message, scores: null, mode: this._gameMode },
                        });
                    })
                    .finally(() => {
                        this._syncActive = false;
                    });
            }

            this.updateSongInfo(rocksnifferData);
            this.updateLiveFeed(rocksnifferData);

            // Monitor progress
            await this.monitorProgress(rocksnifferData);
            if (this.stopped) {
                this._refreshActive = false;
                return;
            }
            window.api.setGameplayActive(this._inSong || this._ending);

            if (this._soundEffect.enabled()) {
                this._soundEffect.update(
                    rocksnifferData?.memoryReadout?.noteData?.TotalNotesMissed,
                );
            }

            this._previousRocksnifferData = rocksnifferData;
        } catch (error) {
            if (error instanceof Error) {
                if (this._lastErrorMessage !== error.message) {
                    this._lastErrorMessage = error.message;
                    logMessage(error.message);
                }

                if (error.message === 'Rocksniffer timed out.') {
                    this._rocksnifferTimeoutCounter += Rocksniffer.timeout;
                    if (this._rocksnifferTimeoutCounter > Sniffer.rocksnifferTimeout) {
                        const timeoutError = new Error(
                            'Waiting for RockSniffer. Check that .NET 8 is installed and no other application is using port 9002, then restart Rock Buddy.',
                        );
                        this.showError(timeoutError);
                    }

                    this._refreshActive = false;
                    return;
                }
            }

            // Reset the timout counter (error wasn't a timeout)
            this._rocksnifferTimeoutCounter = 0;

            this.showError(error);
            this._refreshActive = false;
            return;
        }

        this.publish({
            status: 'Sniffing...',
            error: null,
            activity: this._isPaused ? 'paused' : this.state.live?.active ? 'sniffing' : 'waiting',
        });

        // Reset the timout counter
        this._rocksnifferTimeoutCounter = 0;

        this._refreshActive = false;
    }

    // Publish the detected song details for the Sniffer screen.
    private updateSongInfo(data: any): void {
        this.publish({ song: data.songDetails });
    }

    // Show live counters and retain the completed run after returning to the song menu.
    private updateLiveFeed(data: any): void {
        // Keep the final run visible when the player returns to the song menu.
        if (!approxEqual(data.memoryReadout.songTimer, 0)) {
            this.publish({
                live: {
                    ...data.memoryReadout,
                    songLength: data.songDetails.songLength,
                    active: true,
                },
            });
        } else if (this.state.live?.active) {
            this.publish({ live: { ...this.state.live, active: false } });
        }
    }

    // Follow the played arrangement during a run and use the saved preference for new songs.
    private updatePath(data: any): void {
        const available = getAvailablePaths(data.songDetails.arrangements);
        const paths = available.map((path) => path.name);
        const previous = this._path;

        // Follow the detected arrangement during gameplay, otherwise prefer the saved path.
        if (!approxEqual(data.memoryReadout.songTimer, 0)) {
            const playing = available.find(
                (path) => path.hash === data.memoryReadout.arrangementID,
            );
            if (playing) this._path = playing.name.toLowerCase();
            if (previous !== this._path) this.queueSnort();
        } else if (
            !this._previousRocksnifferData ||
            data.songDetails.songID !== this._previousRocksnifferData.songDetails.songID
        ) {
            this._path = paths.some((path) => path.toLowerCase() === this._preferredPath)
                ? this._preferredPath
                : paths[0]?.toLowerCase() || '';
        }
        this.publish({ paths, path: this._path });
    }

    // Compare consecutive snapshots to detect pauses, speed changes and completed verified runs.
    private async monitorProgress(rocksnifferData: any): Promise<void> {
        // Cannot proceed until we have a previous data set to work with
        if (this._previousRocksnifferData === null) {
            return;
        }

        // If there is no noteData there is nothing to do here
        if (rocksnifferData['memoryReadout']['noteData'] === null) {
            return;
        }

        // Verified scores are not supported for nonstop play or score attack
        // - Nonstop play due to the arrangement hash being invalid in Rocksniffer
        // - Score attack because the game is already strict with verifying score attack scores (although theoretically you could pause a bunch)
        const gameStage = rocksnifferData['memoryReadout']['gameStage'];
        const mode = rocksnifferData['memoryReadout']['mode'];
        if (gameStage === 'nonstopplaygame' || mode === 2) {
            if (this._nonstopPlayOrScoreAttack === false) {
                this._nonstopPlayOrScoreAttack = true;
                logMessage('Verified scores disabled: Nonstop play or score attack detected.');
            }

            this.setVerificationState(VerificationState.None);
            return;
        }

        this._nonstopPlayOrScoreAttack = false;

        // No song data available
        if (
            rocksnifferData['songDetails'] === null ||
            this._previousRocksnifferData['songDetails'] === null
        ) {
            return;
        }

        // Gather arrangement details
        const arrangementID = rocksnifferData['memoryReadout']['arrangementID'];
        const arrangementDetails = rocksnifferData['songDetails']['arrangements'].find(
            (arrangement: any) => arrangement['arrangementID'] === arrangementID,
        );
        const previousArrangementID =
            this._previousRocksnifferData['memoryReadout']['arrangementID'];
        const previousArrangementDetails = this._previousRocksnifferData['songDetails'][
            'arrangements'
        ].find((arrangement: any) => arrangement['arrangementID'] === previousArrangementID);

        // Get the notes in the arrangement
        let startTime = null;
        let arrangementNotes = null;
        let previousArrangementNotes = null;
        if (arrangementDetails !== undefined && previousArrangementDetails !== undefined) {
            // Get data from the first phrase
            const firstPhrase = arrangementDetails['phraseIterations'][0];
            startTime = firstPhrase['startTime'];

            arrangementNotes = arrangementDetails['totalNotes'];
            previousArrangementNotes = previousArrangementDetails['totalNotes'];
        }

        // Get current sniff details
        const songTime = rocksnifferData['memoryReadout']['songTimer'];
        const songLength = rocksnifferData['songDetails']['songLength'];

        // Get previous sniff details
        const previousSongTime = this._previousRocksnifferData['memoryReadout']['songTimer'];
        const previousSongLength = this._previousRocksnifferData['songDetails']['songLength'];

        let seenNotes = null;
        let totalNotesHit = 0;
        if (rocksnifferData['memoryReadout']['noteData'] !== null) {
            seenNotes = rocksnifferData['memoryReadout']['noteData']['totalNotes'];
            totalNotesHit = rocksnifferData['memoryReadout']['noteData']['totalNotesHit'];
        }

        let previousTotalNotesHit = 0;
        if (this._previousRocksnifferData['memoryReadout']['noteData'] !== null) {
            previousTotalNotesHit =
                this._previousRocksnifferData['memoryReadout']['noteData']['totalNotesHit'];
        }

        // Make sure note data exists before pulling it
        let totalNotes = 0;
        if (rocksnifferData['memoryReadout']['noteData'] !== null) {
            totalNotes = rocksnifferData['memoryReadout']['noteData']['TotalNotes'];
        }

        let previousTotalNotes = 0;
        if (this._previousRocksnifferData['memoryReadout']['noteData'] !== null) {
            previousTotalNotes =
                this._previousRocksnifferData['memoryReadout']['noteData']['TotalNotes'];
        }

        // If the Rocksniffer gets hung up for more than a full second, mark the score as unverified
        if (
            !this._ending &&
            !this._isPaused &&
            (this._progressTimerSyncOffset > 1000 || this._pauseTimerSyncOffset > 1000)
        ) {
            if (this._rocksnifferTimeoutCounter > Sniffer.rocksnifferTimeout) {
                this.setVerificationState(
                    VerificationState.Unverified,
                    'Rocksniffer is not responding quickly enough to verify your score. Make sure you are not running any unnecessary programs to minimize system load.\n' +
                        '\n' +
                        'If this problem persists, please turn on extra logging in the config and report the issue.',
                );
            } else {
                this.setVerificationState(
                    VerificationState.Unverified,
                    'The main progress monitoring loop is not responding quickly enough to verify your score. Make sure you are not running any unnecessary programs to minimize system load.\n' +
                        '\n' +
                        'If this problem persists, please turn on extra logging in the config and report the issue.',
                );
            }
        }

        // Calculate the tolerance for speed change detection (either within 99.9% speed or 300ms whichever is higher)
        // Note that the progress timer is resynced when resuming from pause so we need to account for that too
        const songTimeMinusLastPause = songTime - this._lastPauseTime;
        let speedTolerance = songTimeMinusLastPause - songTimeMinusLastPause * 0.999;
        speedTolerance = speedTolerance > 0.3 ? speedTolerance : 0.3;

        const debugInfo = {
            songName: rocksnifferData['songDetails']['songName'],
            artistName: rocksnifferData['songDetails']['artistName'],
            songTime: songTime,
            songLength: songLength,
            previousSongTime: previousSongTime,
            previousSongLength: previousSongLength,
            arrangementNotes: arrangementNotes,
            previousArrangementNotes: previousArrangementNotes,
            seenNotes: seenNotes,
            inSong: this._inSong,
            refreshCounter: this._refreshCounter,
            progressTimer: this._progressTimer,
            maybePaused: this._maybePaused,
            isPaused: this._isPaused,
            pausedInLast10Minutes: this._pausedInLast10Minutes,
            pauseTimer: this._pauseTimer,
            pauseTime: this._pauseTime,
            lastPauseTime: this._lastPauseTime,
            ending: this._ending,
            totalNotes: totalNotes,
            previousTotalNotes: previousTotalNotes,
            speedTolerance: speedTolerance,
        };

        // Song is starting
        if (approxEqual(previousSongTime, 0) && !approxEqual(songTime, 0) && totalNotes === 0) {
            logMessage('SONG STARTING');
            this.setVerificationState(VerificationState.Verified, 'No violations detected.');
            logMessage(debugInfo);

            this._inSong = true;
            this._refreshCounter = 0;
            this._progressTimer = songTime * 1000;
            this._maybePaused = false;
            this._isPaused = false;
            this._pausedInLast10Minutes = false;
            this._pauseTimer = 0;
            this._pauseTime = 0;
            this._lastPauseTime = 0;
            this._ending = false;
            this._speedChange = false;
        }

        // Currently in a song
        else if (!approxEqual(songTime, 0)) {
            if (this._extraLogging) {
                logMessage(debugInfo);
            }

            // Allow 10 refreshes for the song to fully load in.
            if (this._refreshCounter <= 10) {
                this._progressTimer = songTime * 1000;
            }

            // Check if the song restarted (only check after resuming from pause)
            if (!approxEqual(songTime, previousSongTime) && this._isPaused) {
                if (songTime < previousSongTime && songTime < startTime && totalNotes === 0) {
                    logMessage('SONG RESTARTED');

                    // If the user entered riff repeater make sure they exit the song entirely otherwise scores may not verify
                    if (!this._speedChange) {
                        this.setVerificationState(
                            VerificationState.Verified,
                            'No violations detected.',
                        );
                    }

                    this._inSong = true;
                    this._refreshCounter = 0;
                    this._progressTimer = songTime * 1000;
                    this._maybePaused = false;
                    this._isPaused = false;
                    this._pausedInLast10Minutes = false;
                    this._pauseTimer = 0;
                    this._pauseTime = 0;
                    this._lastPauseTime = 0;
                    this._ending = false;

                    return;
                }
            }

            // No point in doing work if the score is already not verified
            if (this._verified === false) {
                return;
            }

            // If we've already determined that the song is ending then don't check for pause/speed change
            if (this._ending) {
                return;
            }

            // If we are at the end of the song don't check for pause or for starting mid song
            if (totalNotes === arrangementNotes) {
                this._ending = true;
                return;
            }

            // Rock Buddy was started during a song (score cannot be verified)
            if (approxEqual(this._progressTimer, 0)) {
                logMessage('LEADERBOARD SNIFFER WAS ENTERED MID SONG');
                this.setVerificationState(
                    VerificationState.Unverified,
                    'Leaderboard sniffer was entered mid-song.',
                );

                this._inSong = true;
                return;
            }

            // Song is paused
            if (approxEqual(songTime, previousSongTime)) {
                // Sometimes the previous data has the same time even without pausing
                // Wait until the pause threshold is met before counting it as a pause
                this._maybePaused = true;
                if (this._pauseTimer < Sniffer.pauseThreshold) {
                    return;
                }

                // If we are already paused, return
                if (this._isPaused) {
                    return;
                }

                // Record the pause time
                this._isPaused = true;
                this._pauseTime = songTime;

                logMessage('SONG PAUSED');
                const warningMessage =
                    'If you pause more than once in a 10 minute period, your score will not be verified.\n' +
                    '\n' +
                    'Note: If you pause a song right as a note is being played it can cause the internal note counter within Rocksmith to malfunction resulting in an unverified score. This is a known issue and I am trying to find a workaround.';
                this.setVerificationState(VerificationState.MaybeVerified, warningMessage);

                // Song was previously paused and it is not the same pause
                if (
                    !approxEqual(this._lastPauseTime, 0) &&
                    !approxEqual(this._pauseTime, this._lastPauseTime)
                ) {
                    // If the song was paused within the last 10 minutes, the score cannot be verified
                    if (this._pauseTime - this._lastPauseTime < 600) {
                        logMessage('SONG REPEATEDLY PAUSED');
                        this.setVerificationState(
                            VerificationState.Unverified,
                            'The song was paused more than once within a 10 minute period.',
                        );

                        return;
                    }
                }
            } else {
                // If the song was paused we need to update the progress timer (the game rewinds slightly)
                if (this._isPaused) {
                    this._pausedInLast10Minutes = true;
                    logMessage('SONG RESUMED');

                    // Subtract the time we waited to ensure the song was paused
                    // It takes 1 refresh to unpause so also subtract the refresh rate
                    this._progressTimer -= Sniffer.pauseThreshold + Sniffer.refreshRate;

                    // Save the last pause time
                    this._lastPauseTime = this._pauseTime;

                    // Ensure that the progress timer and previous song time are within 0.3 second of each other
                    // This prevents users from rewinding or fast forwarding the song
                    if (approxEqual(this._progressTimer / 1000, previousSongTime, 0.3)) {
                        this._progressTimer = songTime * 1000;
                    } else {
                        this.setVerificationState(
                            VerificationState.Unverified,
                            'Song timer did not match after resuming from pause.',
                        );
                        return;
                    }

                    // If the user enters riff repeater, total notes will be reset to 0
                    if (totalNotes < previousTotalNotes) {
                        this.setVerificationState(
                            VerificationState.Unverified,
                            'The user entered riff repeater.\n' +
                                '\n' +
                                'You must fully exit the song and restart for your score to be verified.',
                        );
                        this._speedChange = true;
                        return;
                    }
                }

                // Check if 10 minutes have passed since last pause
                if (
                    this._verified === true &&
                    this._pausedInLast10Minutes &&
                    songTime - this._lastPauseTime > 600
                ) {
                    logMessage('10 MINUTES PASSED SINCE LAST PAUSE');
                    this.setVerificationState(
                        VerificationState.Verified,
                        'No violations detected.',
                    );
                    this._pausedInLast10Minutes = false;
                }

                // If the progress timer gets 0.3 seconds out of sync with the song change to "unverified"
                // 0.3 seconds allows it to be off for two refreshes
                // Also make sure the song is fully loaded (give it 10 seconds because that is the typical amount of leading silence charts have)
                if (
                    !this._maybePaused &&
                    !approxEqual(this._progressTimer / 1000, songTime, speedTolerance)
                ) {
                    this.setVerificationState(
                        VerificationState.Unverified,
                        'Song speed change detected.\n' +
                            '\n' +
                            'You must fully exit the song and restart for your score to be verified.',
                    );
                    this._speedChange = true;
                    return;
                }

                // Ensure the note count has not been tampered with
                if (totalNotesHit < previousTotalNotesHit) {
                    this.setVerificationState(
                        VerificationState.Unverified,
                        'Note data has been tampered with. Offenses will be recorded and repeated offenses may result in a ban.',
                    );
                    return;
                }

                this._maybePaused = false;
                this._isPaused = false;
                this._pauseTimer = 0;
            }
        }

        // Song is ending
        else if (this._inSong && approxEqual(songTime, 0) && !approxEqual(previousSongTime, 0)) {
            logMessage('SONG ENDING');

            // This seems to be happening occasionally, the reason is not yet clear
            if (previousArrangementNotes === null) {
                const errorMessage =
                    'The total number of notes in the arrangement is unknown.\n' +
                    '\n' +
                    'This should never happen. If you get this error please report the issue in the Rock Buddy Discord server and send a log file.';
                this.setVerificationState(VerificationState.Unverified, errorMessage);
            }

            // If there are less notes than expected assume the user had dynamic difficulty on and played on an easier difficulty
            else if (previousTotalNotes < previousArrangementNotes) {
                const errorMessage =
                    'The total number of notes seen was less than the total note count of the arrangement.\n' +
                    '\n' +
                    'Make sure you did not exit the chart early and that dynamic difficulty is disabled.';
                this.setVerificationState(VerificationState.Unverified, errorMessage);
                logMessage('TOTAL NOTES: ' + previousTotalNotes);
                logMessage('ARRANGEMENT NOTES: ' + previousArrangementNotes);
                logMessage('');
            }

            // If there are more notes than expected report an error (although this shouldn't happen)
            else if (previousTotalNotes > previousArrangementNotes) {
                const errorMessage =
                    'The total number of notes seen was greater than the total note count of the arrangement.\n' +
                    '\n' +
                    'Note: If you pause a song right as a note is being played it can cause the internal note counter within Rocksmith to malfunction resulting in an unverified score. This is a known issue and I am trying to find a workaround.\n' +
                    '\n' +
                    'If you did not pause please report this issue.';
                this.setVerificationState(VerificationState.Unverified, errorMessage);
                logMessage('TOTAL NOTES: ' + previousTotalNotes);
                logMessage('ARRANGEMENT NOTES: ' + arrangementNotes);
                logMessage('');
            }

            if (this._verified) {
                // THE SCORE IS VERIFIED!
                this.setVerificationState(VerificationState.Verified, 'Your score is verified!');

                // Record verified score
                await this.recordVerifiedScore(
                    this._previousRocksnifferData,
                    previousArrangementNotes,
                );
            }

            // Create a blank line in the log
            logMessage('');

            this._inSong = false;
            this._progressTimer = 0;
            this._maybePaused = false;
            this._isPaused = false;
            this._pausedInLast10Minutes = false;
            this._pauseTimer = 0;
            this._pauseTime = 0;
            this._lastPauseTime = 0;
            this._ending = false;
        }
    }

    // Keep the internal verification flag and visible explanation in sync.
    private setVerificationState(state: VerificationState, message = ''): void {
        if (state === VerificationState.Verified) this._verified = true;
        if (state === VerificationState.Unverified || state === VerificationState.None)
            this._verified = false;
        if (this.state.verification !== state || this.state.verificationMessage !== message) {
            logMessage(`Verification: ${VerificationState[state]} ${message}`);
            this.publish({ verification: state, verificationMessage: message });
        }
    }

    // Submit the completed live score once; this path does not save failed uploads for retry.
    private async recordVerifiedScore(rocksnifferData: any, totalNotes: number): Promise<void> {
        // Define object to hold snort data
        let data: any = {};

        // Get basic song metadata
        data['song_key'] = rocksnifferData['songDetails']['songID'];
        data['psarc_hash'] = rocksnifferData['songDetails']['psarcFileHash'];
        data['arrangement_hash'] = rocksnifferData['memoryReadout']['arrangementID'];
        data['streak'] = rocksnifferData['memoryReadout']['noteData']['HighestHitStreak'];
        data['mastery'] = rocksnifferData['memoryReadout']['noteData']['Accuracy'] / 100;
        data['total_notes'] = totalNotes;

        let version = rocksnifferData['songDetails']['toolkit']['version'];
        if (version.trim() == 'test') {
            // Test versions of songs are not supported
            return;
        }

        logMessage('RECORDING SCORE');
        logMessage(data);

        const host = await window.api.getHost();

        // Do not record the score in lurk mode
        if (!this._lurkMode) {
            const response = await this.send(host + '/api/data/record_verified_score.php', {
                auth_data: this.auth,
                song_data: data,
            });

            if ('error' in response) {
                window.api.error(
                    response.connectionError
                        ? 'Your verified score could not be uploaded. It will not be retried automatically. Reconnect before playing another song.'
                        : response['error'],
                );
            } else {
                this.publish({ scoreRevision: this.state.scoreRevision + 1 });
            }
        }

        // Show the leaderboard
        await this.showLeaderboard(rocksnifferData);
    }

    // Sync when the song or save changes, respecting the account's snort delay.
    private async checkSnort(rocksnifferData: any): Promise<void> {
        const previousData = this._previousRocksnifferData;
        const newProfileDataAvailable = await this._rocksmith.newProfileDataAvailable();

        if (rocksnifferData['songDetails']['songID'] !== this._syncSongId) {
            this._syncSongId = rocksnifferData['songDetails']['songID'];

            // Hide the new version alert icon until after snorting is completed
            this.publish({ newVersion: false });

            // Allow the user to snort immediately
            this.publish({ canSnort: true });
            this._snorted = false;

            // Reset the snort countdown
            this._snortCountdown = this.snortRate / 1000;

            // If new profile data is available AND the song is changing, snort the previous song data
            // This fixes a bug where rock buddy data would not be updated after playing a song in nonstop play
            if (
                previousData &&
                newProfileDataAvailable &&
                rocksnifferData['memoryReadout']['gameStage'] === 'NonStopPlay_Hub'
            ) {
                await this.snort(previousData);
                return;
            }
        }

        // Enable the snort button once this account's delay has passed
        if (!this._snort && this._timeSinceLastSnort / 1000 >= this.snortRate / 1000) {
            this.publish({ canSnort: true });
        }

        // If enough time has passed and we have not already snorted, snort
        if (
            this._snorted === false &&
            this._snortCountdown <= 0 &&
            this._timeSinceLastSnort > this.snortRate
        ) {
            this._snort = true;
        }

        // If the game has just been saved snort to keep things in sync
        if (
            newProfileDataAvailable &&
            rocksnifferData['memoryReadout']['gameStage'] !== 'MainMenu'
        ) {
            this._snort = true;
        }

        if (this._snort) {
            this._snort = false;
            await this.snort(rocksnifferData);
        } else if (!this._snorted) {
            this.publish({
                leaderboard: {
                    message: 'Snorting data in ' + Math.ceil(this._snortCountdown),
                    scores: null,
                    mode: this._gameMode,
                },
            });
            this._snortCountdown -= Sniffer.refreshRate / 1000; // convert to seconds
        }
    }

    // Import only the detected song's saved history, then refresh its leaderboard.
    private async snort(rocksnifferData: any) {
        this.publish({
            status: 'Snorting data...',
            leaderboard: { message: '*Snort*', scores: null, mode: this._gameMode },
        });

        // Grab current Rocksmith profile data
        const rocksmithData = await this._rocksmith.getProfileData();
        if (rocksmithData === null && this._rocksmith.importHistory) {
            throw new Error(
                'Failed to read Rocksmith profile data. Please check your config settings.',
            );
        }

        // Define object to hold snort data
        let snortData: any = {};

        // Get basic song metadata
        snortData['song_key'] = rocksnifferData['songDetails']['songID'];
        snortData['psarc_hash'] = rocksnifferData['songDetails']['psarcFileHash'];
        snortData['title'] = rocksnifferData['songDetails']['songName'];
        snortData['artist'] = rocksnifferData['songDetails']['artistName'];
        snortData['album'] = rocksnifferData['songDetails']['albumName'];
        snortData['year'] = rocksnifferData['songDetails']['albumYear'];
        snortData['author'] = rocksnifferData['songDetails']['toolkit']['author'];
        snortData['version'] = rocksnifferData['songDetails']['toolkit']['version'];

        const availablePaths = getAvailablePaths(rocksnifferData['songDetails']['arrangements']);

        // Define object to hold arrangement data
        snortData['arrangements'] = {};

        if (this._extraLogging) {
            logMessage('SONG: ' + snortData['artist'] + ' - ' + snortData['title']);
        }

        // Collect history for each arrangement contained in this song.
        rocksnifferData['songDetails']['arrangements'].forEach((arrangement: any) => {
            let arrangementData: any = {};

            const hash = arrangement['arrangementID'];
            arrangementData['hash'] = hash;
            arrangementData['note_data_hash'] = arrangement['noteDataHash'];

            // Get the name of the arrangement
            availablePaths.forEach((path) => {
                if (path.hash === hash) {
                    arrangementData['name'] = path['name'];
                }
            });

            if (this._extraLogging) {
                logMessage(
                    'ARRANGEMENT: ' +
                        arrangementData['name'] +
                        ' - ' +
                        arrangementData['note_data_hash'],
                );
            }

            // Match saved history to arrangement hashes, independently of the live verified score.
            const lasDataExists =
                rocksmithData !== null && rocksmithData['Stats']['Songs'].hasOwnProperty(hash);
            const saDataExists =
                rocksmithData !== null && rocksmithData['SongsSA'].hasOwnProperty(hash);
            if (lasDataExists) {
                arrangementData['mastery'] = rocksmithData['Stats']['Songs'][hash]['MasteryPeak'];
                arrangementData['streak'] = rocksmithData['Stats']['Songs'][hash]['Streak'];

                // Missing save fields stay unknown; live verification does not provide these values.
                arrangementData['las_last_played'] =
                    rocksmithData['Stats']['Songs'][hash]['DateLAS'];
                arrangementData['las_play_count'] =
                    rocksmithData['Stats']['Songs'][hash]['PlayedCount'];
            }

            // Import Score Attack results separately from Learn a Song mastery.
            if (saDataExists) {
                arrangementData['scores'] = {};
                arrangementData['badges'] = {};

                // Scores
                // Keep easy and medium commented out in case we want to add them later
                //arrangementData['scores']['easy'] = rocksmithData['SongsSA'][hash]['HighScores']['Easy'];
                //arrangementData['scores']['medium'] = rocksmithData['SongsSA'][hash]['HighScores']['Medium'];
                arrangementData['scores']['hard'] =
                    rocksmithData['SongsSA'][hash]['HighScores']['Hard'];
                arrangementData['scores']['master'] =
                    rocksmithData['SongsSA'][hash]['HighScores']['Master'];

                // Strikes
                // Keep easy and medium commented out in case we want to add them later
                //arrangementData['badges']['easy'] = rocksmithData['SongsSA'][hash]['Badges']['Easy'];
                //arrangementData['badges']['medium'] = rocksmithData['SongsSA'][hash]['Badges']['Medium'];
                arrangementData['badges']['hard'] =
                    rocksmithData['SongsSA'][hash]['Badges']['Hard'];
                arrangementData['badges']['master'] =
                    rocksmithData['SongsSA'][hash]['Badges']['Master'];

                arrangementData['sa_last_played'] =
                    rocksmithData['Stats']['Songs'][hash]?.['DateSA'];
                arrangementData['sa_play_count'] = rocksmithData['SongsSA'][hash]['PlayCount'];
            }

            snortData['arrangements'][hash] = arrangementData;
        });

        // Sync the data with the server
        const synced = await this.syncWithServer(snortData);

        this._timeSinceLastSnort = 0;
        this._snorted = synced;
        if (!synced) this._snort = true;

        // Show the leaderboard
        // A slow response for the previous song must not replace the new song's leaderboard.
        const currentSong = this._previousRocksnifferData?.songDetails?.songID;
        if (synced && (!currentSong || currentSong === rocksnifferData.songDetails.songID)) {
            await this.showLeaderboard(rocksnifferData);
        }
    }

    // Sync chart metadata and permitted history, then check for a newer chart version.
    private async syncWithServer(snortData: any): Promise<boolean> {
        const host = await window.api.getHost();

        logMessage(snortData['version']);
        if (snortData['version'].trim() == 'test') {
            this.publish({
                leaderboard: {
                    message: 'Test versions of songs are not supported.',
                    scores: null,
                    mode: this._gameMode,
                },
            });
            return false;
        }

        const sync_response = await this.send(host + '/api/data/sniffer_sync.php', {
            auth_data: this.auth,
            song_data: snortData,
            lurk_mode: this._lurkMode || !this._rocksmith.importHistory,
        });

        if ('error' in sync_response) {
            this._retrySyncAt = Date.now() + Math.max(30000, sync_response.retryAfterMs || 0);
            this.publish({
                leaderboard: {
                    message: 'Scores could not be refreshed. Retrying shortly.',
                    scores: null,
                    mode: this._gameMode,
                },
            });
            if (!this._syncErrorDisplayed) {
                window.api.error(sync_response['error']);
                this._syncErrorDisplayed = true;
            }
            return false;
        }

        // Let cached statistics know that the server accepted new profile history.
        if (!this._lurkMode && this._rocksmith.importHistory) {
            this.publish({ scoreRevision: this.state.scoreRevision + 1 });
        }

        // Clear the sync warning only after the server has accepted the request.
        // It is safe to display it again
        this._syncErrorDisplayed = false;
        this._retrySyncAt = 0;

        // Check chart versions only after the metadata sync succeeds.
        const version_response = await this.send(host + '/api/data/get_versions.php', {
            auth_data: this.auth,
            song_data: snortData,
        });

        if ('error' in version_response) {
            this._retrySyncAt = Date.now() + 30000;
            window.api.error(version_response['error']);
            return false;
        }

        if ('versions' in version_response) {
            const currentVersion = snortData['version'].trim();
            const versionsAvailable = version_response['versions'];

            // Show the alert icon based on whether a new version is detected
            this.publish({
                newVersion: !(await this.isLatestVersion(currentVersion, versionsAvailable)),
            });
        }

        return true;
    }

    // Compare known chart versions when all version strings can be interpreted safely.
    private async isLatestVersion(currentVersion: string, versionsAvailable: string[]) {
        // No known versions, treat it as latest
        if (versionsAvailable.length === 0) {
            return true;
        }

        // If the current version is not valid semver, we can't compare it so treat it as latest
        currentVersion = buildValidSemver(currentVersion);
        if ((await window.api.semverValid(currentVersion)) === null) {
            return true;
        }

        // Use a regular for loop instead of forEach since it calls an async function within and we want to wait
        let invalid = false;
        for (let i = 0; i < versionsAvailable.length; ++i) {
            versionsAvailable[i] = buildValidSemver(versionsAvailable[i]);
            if ((await window.api.semverValid(versionsAvailable[i])) === null) {
                invalid = true;
                break;
            }
        }

        // If any version in the list is not valid semver, we can't compare so treat the current as latest
        if (invalid) {
            return true;
        }

        // Get the latest version available
        const latestVersionAvailable = await window.api.semverMaxSatisfying(versionsAvailable, '*');

        // Check if the chart is up to date
        return await window.api.semverGte(currentVersion, latestVersionAvailable);
    }

    // Load scores for the current filters and discard replies for older selections.
    private async showLeaderboard(data: any): Promise<void> {
        if (!this._snorted) {
            this.queueSnort();
            return;
        }

        // Capture the requested filters before waiting for the server.
        const requestId = ++this.leaderboardRequest;
        const song = data.songDetails;
        const mode = this._gameMode;
        const path = this._path;
        const difficulty = this._difficulty;
        const host = await window.api.getHost();
        const scores = await this.send(`${host}/api/data/get_scores_${mode}.php`, {
            auth_data: this.auth,
            song_key: song.songID,
            psarc_hash: song.psarcFileHash,
            arrangement: path,
            ...(mode === 'sa' ? { difficulty } : {}),
        });

        // A delayed reply cannot replace a different song, chart, or selection.
        const current = this._previousRocksnifferData?.songDetails;
        if (
            requestId !== this.leaderboardRequest ||
            mode !== this._gameMode ||
            path !== this._path ||
            difficulty !== this._difficulty ||
            (current &&
                (current.songID !== song.songID || current.psarcFileHash !== song.psarcFileHash))
        )
            return;
        this.publish({
            leaderboard: {
                message: scores.error || '',
                scores: Array.isArray(scores) ? scores : null,
                mode,
            },
        });
    }
}
