import { Rocksmith } from './rocksmith';
import { Rocksniffer } from './rocksniffer';
import { SoundEffect } from './sound_effect';
import { UserData } from '../common/user_data';
import { showError, showExclusive } from './functions';
import { approxEqual, buildValidSemver, durationString, getAvailablePaths, logMessage, post } from '../common/functions';
import { displayLASLeaderboard, displaySALeaderboard } from '../common/leaderboard';

// Global
const authData = JSON.parse(window.sessionStorage.getItem('auth_data') as any);

enum VerificationState {
    None,
    Verified,
    MaybeVerified,
    Unverified,
}

export class Sniffer {
    // Refresh rate in milliseconds
    private static readonly refreshRate: number = 100; // milliseconds
    private static readonly rocksnifferTimeout: number = 1000 // milliseconds
    private static readonly snortRate: number = 3000; // milliseconds
    private static readonly pauseThreshold: number = 500; // milliseconds

    private readonly _rocksmith: Rocksmith;
    private readonly _rocksniffer: Rocksniffer;
    private readonly _soundEffect: SoundEffect;

    // Prevent duplicate refreshes
    private _refreshActive: boolean = false;

    // Prevent explosion of error messages
    private _lastErrorMessage: string = '';
    private _syncErrorDisplayed: boolean = false;

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
    private _snort: boolean = true; // Set true on startup to ensure initial snorting
    private _snorted: boolean = false; // Set false on startup to ensure initial snorting
    private _snortCountdown: number = Sniffer.snortRate / 1000; // seconds
    private _timeSinceLastSnort: number = 0;

    // Lurk mode
    private _lurkMode: boolean = false;

    // Debug fields
    private _extraLogging: boolean = false;

    private constructor(rocksmith: Rocksmith, rocksniffer: Rocksniffer, soundEffect: SoundEffect) {
        this._rocksmith = rocksmith;
        this._rocksniffer = rocksniffer;
        this._soundEffect = soundEffect;
    }

    public static async create(): Promise<Sniffer> {
        const rocksmith = await Rocksmith.create();
        const rocksniffer = await Rocksniffer.create();

        // Read sound effect data from user config
        let missSFX = await UserData.get('miss_sfx');
        if (missSFX === null) {
            missSFX = 'none';
        }

        let missSFXPath = null;
        if (missSFX === "custom") {
            missSFXPath = await UserData.get('custom_miss_sfx_path');
        }
        else if (missSFX === "custom_multi") {
            missSFXPath = await UserData.get('custom_miss_sfx_multi_path');
        }

        const soundEffect = await SoundEffect.create(missSFX, missSFXPath);

        const sniffer = new Sniffer(rocksmith, rocksniffer, soundEffect);
        await sniffer.init();

        return sniffer;
    }

    public async start(): Promise<void> {
        const version = await window.api.getVersion();

        // Create a fresh log file
        const currentDate = new Date();
        const year = currentDate.getFullYear();
        const month = (currentDate.getMonth() + 1).toString().padStart(2, '0');
        const day = currentDate.getDate().toString().padStart(2, '0');
        const hours = currentDate.getHours().toString().padStart(2, '0');
        const minutes = currentDate.getMinutes().toString().padStart(2, '0');
        const seconds = currentDate.getSeconds().toString().padStart(2, '0');
        const formattedDate = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
        window.api.writeFile("rock-buddy-log.txt", "Rock Buddy v" + version + "\n\nSniffer started: " + formattedDate + "\n\n");

        setInterval(this.refresh.bind(this), Sniffer.refreshRate);
    }

    public queueSnort(): void {
        const snortButton = document.getElementById('snort') as HTMLButtonElement;
        this._snort = true;
        snortButton.disabled = true;
    }

    private async init(): Promise<void> {
        // Bind the snort button to the snort function
        const snortButton = document.getElementById('snort') as HTMLButtonElement;
        snortButton.addEventListener('click', this.queueSnort.bind(this));

        // Get the preferred path
        const preferredPath = await UserData.get('preferred_path');
        if (preferredPath !== null) {
            this._preferredPath = preferredPath;
        }

        // Setup new version alert icon
        const newVersionAlertIconElement = document.getElementById('new_version_alert_icon') as HTMLElement;
        const newVersionAlertPopupElement = document.getElementById('new_version_alert_popup') as HTMLElement;
        const closeNewVersionAlertPopupElement = document.getElementById('close_new_version_alert_popup') as HTMLElement;

        newVersionAlertIconElement.addEventListener('click', async() => {
            newVersionAlertPopupElement.style.display = 'block';
        });

        closeNewVersionAlertPopupElement.addEventListener('click', async() => {
            newVersionAlertPopupElement.style.display = 'none';
        })

        // Setup game mode combo box
        const gameModeElement = document.getElementById('game_mode') as HTMLSelectElement;

        gameModeElement.addEventListener('change', async () => {
            const selectedOption = gameModeElement.options[gameModeElement.selectedIndex];
            this._gameMode = selectedOption.value;

            const scoreAttackElement = document.getElementById('score_attack');
            if (scoreAttackElement !== null) {
                if (this._gameMode === 'las') {
                    scoreAttackElement.style.display = 'none';
                }
                else if (this._gameMode === 'sa') {
                    scoreAttackElement.style.display = 'block';
                }
            }

            // Update the display (keep things feeling responsive)
            try {
                this.queueSnort();
            }
            catch (error) {
                showError(error);
            }
        });

        // Setup path combo box
        const pathElement = document.getElementById('path') as HTMLSelectElement;

        pathElement.addEventListener('change', async () => {
            const selectedOption = pathElement.options[pathElement.selectedIndex];
            this._path = selectedOption.value;

            // Update the display (keep things feeling responsive)
            try {
                this.queueSnort();
            }
            catch (error) {
                showError(error);
            }
        });

        // Setup difficulty combo box
        const difficultyElement = document.getElementById('difficulty') as HTMLSelectElement;

        difficultyElement.addEventListener('change', async () => {
            const selectedOption = difficultyElement.options[difficultyElement.selectedIndex];
            this._difficulty = selectedOption.value;

            // Update the display (keep things feeling responsive)
            try {
                this.queueSnort();
            }
            catch (error) {
                showError(error);
            }
        });

        // Setup verification elements
        const verifiedElement = document.getElementById('verified') as HTMLElement;
        const verifiedPopupElement = document.getElementById('verified_popup') as HTMLElement;
        const closeVerifiedPopupElement = document.getElementById('close_verified_popup') as HTMLElement;

        verifiedElement.addEventListener('click', async () => {
            verifiedPopupElement.style.display = 'block';
        });

        closeVerifiedPopupElement.addEventListener('click', async() => {
            verifiedPopupElement.style.display = 'none';
        });

        const maybeVerifiedElement = document.getElementById('maybe_verified') as HTMLElement;
        const maybeVerifiedPopupElement = document.getElementById('maybe_verified_popup') as HTMLElement;
        const closeMaybeVerifiedPopupElement = document.getElementById('close_maybe_verified_popup') as HTMLElement;

        maybeVerifiedElement.addEventListener('click', async () => {
            maybeVerifiedPopupElement.style.display = 'block';
        });

        closeMaybeVerifiedPopupElement.addEventListener('click', async() => {
            maybeVerifiedPopupElement.style.display = 'none';
        });

        const unverifiedElement = document.getElementById('unverified') as HTMLElement;
        const unverifiedPopupElement = document.getElementById('unverified_popup') as HTMLElement;
        const closeUnverifiedPopupElement = document.getElementById('close_unverified_popup') as HTMLElement;

        unverifiedElement.addEventListener('click', async () => {
            unverifiedPopupElement.style.display = 'block';
        });

        closeUnverifiedPopupElement.addEventListener('click', async() => {
            unverifiedPopupElement.style.display = 'none';
        });

        const lurkMode = await UserData.get('lurk_mode');
        if (lurkMode !== null) {
            this._lurkMode = lurkMode;
        }

        const lurkModeNotificationElement = document.getElementById('lurk_mode_notification') as HTMLElement;
        if (this._lurkMode) {
            lurkModeNotificationElement.style.display = 'block';
        }
        else {
            lurkModeNotificationElement.style.display = 'none';
        }

        const extraLogging = await UserData.get('extra_logging');
        if (extraLogging !== null) {
            this._extraLogging = extraLogging;
        }
    }

    private async sniff(): Promise<any> {
        const rocksnifferData = await this._rocksniffer.sniff();
        if (rocksnifferData === null) {
            throw new Error("RockSniffer is starting...");
        }
        else if (!rocksnifferData['RocksmithFound']) {
            throw new Error("Waiting for Rocksmith...");
        }
        else if (rocksnifferData['psarcProcessingCount'] > 0) {
            throw new Error("RockSniffer is enumerating DLC... " + rocksnifferData['psarcProcessingCount'] + " files remaining.")
        }
        else if (!rocksnifferData['success']) {
            throw new Error('Navigate to a song in Rocksmith to begin sniffing.');
        }

        return rocksnifferData;
    }

    private async refresh(): Promise<void> {
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

            logMessage("Refresh already active, returning.");
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

            // The path must be updated before snorting
            this.updatePath(rocksnifferData);

            // Check if it is time to snort
            await this.checkSnort(rocksnifferData);

            this.updateSongInfo(rocksnifferData);
            this.updateLiveFeed(rocksnifferData);

            // Monitor progress
            await this.monitorProgress(rocksnifferData);

            if (this._soundEffect.enabled()) {
                this._soundEffect.update(rocksnifferData?.memoryReadout?.noteData?.TotalNotesMissed);
            }

            this._previousRocksnifferData = rocksnifferData;
        }
        catch (error) {
            if (error instanceof Error) {
                if (this._lastErrorMessage !== error.message) {
                    this._lastErrorMessage = error.message;
                    logMessage(error.message);
                }
                
                if (error.message === "Rocksniffer timed out.") {
                    this._rocksnifferTimeoutCounter += Rocksniffer.timeout;
                    if (this._rocksnifferTimeoutCounter > Sniffer.rocksnifferTimeout) {
                        const timeoutError = new Error("<p>Waiting for Rocksniffer...<br>"
                                                     + "<br>"
                                                     + "If this takes more than a few seconds Rocksniffer may have failed to start. If this problem persists, try the following:<br>"
                                                     + "<ul>"
                                                     + "<li>Ensure <a href=\"https://dotnet.microsoft.com/en-us/download/dotnet/6.0/runtime\">.NET framework 6.0</a> (for console apps) is installed.</li>"
                                                     + "<li>Try running Rock Buddy as administrator.</li>"
                                                     + "<li>Ensure no other app is using the port Rock Buddy uses for Rocksniffer (port 9002 by default).</li>"
                                                     + "</ul>"
                                                     + "<br>"
                                                     + "If none of these solutions resolve your issue, reach out to me in Discord. The link to my discord server can be found in the <a href=\"#\" onclick=\"openTwitchAboutPage()\">About</a> section on my twitch page.</p>");
                        showError(timeoutError);
                    }

                    this._refreshActive = false;
                    return;
                }
            }

            // Reset the timout counter (error wasn't a timeout)
            this._rocksnifferTimeoutCounter = 0;
            
            showError(error);
            this._refreshActive = false;
            return;
        }

        // Update the status
        const statusElement = document.getElementById('status') as HTMLElement;
        statusElement.innerText = 'Sniffing...';

        // Show connected state
        showExclusive('group1', 'connected');

        // Reset the timout counter
        this._rocksnifferTimeoutCounter = 0;

        this._refreshActive = false;
    }

    private updateSongInfo(rocksnifferData: any): void {
        // Hide the alert icon until snort
        if (!this._snorted) {
            const newVersionAlertIconElement = document.getElementById('new_version_alert_icon') as HTMLElement;
            newVersionAlertIconElement.style.visibility = 'hidden';
        }

        const albumArtElement = document.getElementById('album_art') as HTMLImageElement;
        const artistElement = document.getElementById('artist') as HTMLElement;
        const titleElement = document.getElementById('title') as HTMLElement;
        const albumElement = document.getElementById('album') as HTMLElement;
        const yearElement = document.getElementById('year') as HTMLElement;
        const versionElement = document.getElementById('version') as HTMLElement;
        const authorElement = document.getElementById('author') as HTMLElement;

        albumArtElement.src = 'data:image/jpeg;base64,' + rocksnifferData['songDetails']['albumArt'];
        artistElement.innerText = rocksnifferData['songDetails']['artistName'];
        titleElement.innerText = rocksnifferData['songDetails']['songName'];
        albumElement.innerText = rocksnifferData['songDetails']['albumName'];
        yearElement.innerText = rocksnifferData['songDetails']['albumYear'];
        versionElement.innerText = rocksnifferData['songDetails']['toolkit']['version'];
        authorElement.innerText = rocksnifferData['songDetails']['toolkit']['author'];
    }

    private updateLiveFeed(rocksnifferData: any): void {
        const mode = rocksnifferData['memoryReadout']['mode'];
        const songTime = rocksnifferData['memoryReadout']['songTimer'];

        const liveFeedIconElement = document.getElementById('live_feed_icon') as HTMLElement;

        // If song time is greater than 0 we are in a song
        if (!approxEqual(songTime, 0)) {
            liveFeedIconElement.style.backgroundColor = 'green';

            const liveFeedLASElements = document.getElementsByClassName('live-data-las') as HTMLCollectionOf<HTMLElement>;
            const liveFeedSAElements = document.getElementsByClassName('live-data-sa') as HTMLCollectionOf<HTMLElement>;

            // Mode 1 is learn a song
            if (mode === 1) {

                Array.from(liveFeedLASElements).forEach(element => {
                    element.style.display = 'flex';
                });

                Array.from(liveFeedSAElements).forEach(element => {
                    element.style.display = 'none';
                });

                const notesHit = rocksnifferData['memoryReadout']['noteData']['TotalNotesHit'];
                const totalNotes = rocksnifferData['memoryReadout']['noteData']['TotalNotes'];
                const accuracy = rocksnifferData['memoryReadout']['noteData']['Accuracy'];
                const streak = rocksnifferData['memoryReadout']['noteData']['CurrentHitStreak'];
                const highestStreak = rocksnifferData['memoryReadout']['noteData']['HighestHitStreak'];
                const songTimer = rocksnifferData['memoryReadout']['songTimer'];
                const songLength = rocksnifferData['songDetails']['songLength'];

                const notesHitElement = document.getElementById('las_notes_hit') as HTMLElement;
                const totalNotesElement = document.getElementById('las_total_notes') as HTMLElement;
                const accuracyElement = document.getElementById('las_accuracy') as HTMLElement;
                const streakElement = document.getElementById('las_streak') as HTMLElement;
                const highestStreakElement = document.getElementById('las_highest_streak') as HTMLElement;
                const songTimerElement = document.getElementById('las_song_timer') as HTMLElement;
                const songLengthElement = document.getElementById('las_song_length') as HTMLElement;

                notesHitElement.innerText = notesHit;
                totalNotesElement.innerText = totalNotes;
                accuracyElement.innerText = accuracy.toFixed(2) + '%';
                streakElement.innerText = streak;
                highestStreakElement.innerText = highestStreak;
                songTimerElement.innerText = durationString(songTimer);
                songLengthElement.innerText = durationString(songLength);
            }

            // Mode 2 is score attack
            else if (mode === 2) {
                
                Array.from(liveFeedLASElements).forEach(element => {
                    element.style.display = 'none';
                });

                Array.from(liveFeedSAElements).forEach(element => {
                    element.style.display = 'flex';
                });

                const notesHit = rocksnifferData['memoryReadout']['noteData']['TotalNotesHit'];
                const totalNotes = rocksnifferData['memoryReadout']['noteData']['TotalNotes'];
                const accuracy = rocksnifferData['memoryReadout']['noteData']['Accuracy'];
                const streak = rocksnifferData['memoryReadout']['noteData']['CurrentHitStreak'];
                const highestStreak = rocksnifferData['memoryReadout']['noteData']['HighestHitStreak'];
                const songTimer = rocksnifferData['memoryReadout']['songTimer'];
                const songLength = rocksnifferData['songDetails']['songLength'];

                const notesHitElement = document.getElementById('sa_notes_hit') as HTMLElement;
                const totalNotesElement = document.getElementById('sa_total_notes') as HTMLElement;
                const accuracyElement = document.getElementById('sa_accuracy') as HTMLElement;
                const streakElement = document.getElementById('sa_streak') as HTMLElement;
                const highestStreakElement = document.getElementById('sa_highest_streak') as HTMLElement;
                const songTimerElement = document.getElementById('sa_song_timer') as HTMLElement;
                const songLengthElement = document.getElementById('sa_song_length') as HTMLElement;

                notesHitElement.innerText = notesHit;
                totalNotesElement.innerText = totalNotes;
                accuracyElement.innerText = accuracy.toFixed(2) + '%';
                streakElement.innerText = streak;
                highestStreakElement.innerText = highestStreak;
                songTimerElement.innerText = durationString(songTimer);
                songLengthElement.innerText = durationString(songLength);
            }
        }
        else {
            liveFeedIconElement.style.backgroundColor = 'red';
        }
    }

    private updatePath(rocksnifferData: any): void {
        const availablePaths = getAvailablePaths(rocksnifferData['songDetails']['arrangements']);

        let hashMap: any = {}

        // Update the path combo box with available paths
        const pathElement = document.getElementById('path') as HTMLSelectElement;
        pathElement.innerHTML = '';
        availablePaths.forEach((availablePath) => {
            const option = document.createElement('option');
            option.text = availablePath.name;
            option.value = availablePath.name.toLowerCase();

            if (option.value === this._path) {
                option.selected = true;
            }

            pathElement.appendChild(option);

            // Also make a map of hashes to path name so we can use it later
            hashMap[availablePath.hash] = availablePath.name.toLowerCase();
        });

        // If the user is in a song, follow the path they are playing
        const songTime = rocksnifferData['memoryReadout']['songTimer'];
        if (!approxEqual(songTime, 0)) {

            // Follow the correct arrangment with Rocksniffer
            const arrangementHash = rocksnifferData['memoryReadout']['arrangementID'];

            // Need to check if the path exists (this is because Rocksniffer is bugged in nonstop play)
            // NOTE: in nonstop play the arrangement hash will be wrong and it will not automatically follow the correct path
            if (hashMap.hasOwnProperty(arrangementHash)) {
                const arrangementKey = hashMap[arrangementHash];
                if (pathElement.value !== arrangementKey) {
                    pathElement.value = arrangementKey;
                    const event = new Event('change');
                    pathElement.dispatchEvent(event);
                }
            }
        }

        // If we are in a new song update the path to the preferred path
        // If that path doesn't exist choose the first available path instead
        else if (this._previousRocksnifferData === null ||
            rocksnifferData['songDetails']['songID'] !== this._previousRocksnifferData['songDetails']['songID']) {

            // Default to the preferred path
            if (Object.values(hashMap).includes(this._preferredPath)) {
                this._path = this._preferredPath;
            }
            else {
                this._path = availablePaths[0].name.toLowerCase();
            }

            // Update the path combo box to the user's selected path
            // DO NOT trigger the path change event (this is intentional so it doesn't snort immediately)
            Array.from(pathElement.options).forEach((option) => {
                if (option.value === this._path) {
                    option.selected = true;
                    return;
                }
            });
        }
    }

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
                logMessage("Verified scores disabled: Nonstop play or score attack detected.");
            }

            this.setVerificationState(VerificationState.None);
            return;
        }

        this._nonstopPlayOrScoreAttack = false;

        // No song data available
        if (rocksnifferData['songDetails'] === null || this._previousRocksnifferData['songDetails'] === null) {
            return;
        } 

        // Gather arrangement details
        const arrangementID = rocksnifferData['memoryReadout']['arrangementID'];
        const arrangementDetails = rocksnifferData['songDetails']['arrangements'].find(
            (arrangement: any) => arrangement['arrangementID'] === arrangementID
        );
        const previousArrangementID = this._previousRocksnifferData['memoryReadout']['arrangementID'];
        const previousArrangementDetails = this._previousRocksnifferData['songDetails']['arrangements'].find(
            (arrangement: any) => arrangement['arrangementID'] === previousArrangementID
        );   

        // Get the notes in the arrangement
        let startTime = null;
        let arrangementNotes =  null;
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
            previousTotalNotesHit = this._previousRocksnifferData['memoryReadout']['noteData']['totalNotesHit'];
        }

        // Make sure note data exists before pulling it
        let totalNotes = 0;
        if (rocksnifferData['memoryReadout']['noteData'] !== null) {
            totalNotes = rocksnifferData['memoryReadout']['noteData']['TotalNotes'];
        }

        let previousTotalNotes = 0;
        if (this._previousRocksnifferData['memoryReadout']['noteData'] !== null) {
            previousTotalNotes = this._previousRocksnifferData['memoryReadout']['noteData']['TotalNotes'];
        }

        // If the Rocksniffer gets hung up for more than a full second, mark the score as unverified
        if (!this._ending && !this._isPaused && (this._progressTimerSyncOffset > 1000 || this._pauseTimerSyncOffset > 1000)) {
            if (this._rocksnifferTimeoutCounter > Sniffer.rocksnifferTimeout) {
                this.setVerificationState(VerificationState.Unverified, "Rocksniffer is not responding quickly enough to verify your score. Make sure you are not running any unnecessary programs to minimize system load.\n"
                                                                      + "\n"
                                                                      + "If this problem persists, please turn on extra logging in the config and report the issue.");
            }
            else {
                this.setVerificationState(VerificationState.Unverified, "The main progress monitoring loop is not responding quickly enough to verify your score. Make sure you are not running any unnecessary programs to minimize system load.\n"
                                                                      + "\n"
                                                                      + "If this problem persists, please turn on extra logging in the config and report the issue.");
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
            speedTolerance: speedTolerance
        }

        // Song is starting
        if (approxEqual(previousSongTime, 0) && !approxEqual(songTime, 0) && totalNotes === 0) {
            logMessage("SONG STARTING");
            this.setVerificationState(VerificationState.Verified, "No violations detected.");
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

            // Verify the u ser has the latest RSMods
            const modsActive = rocksnifferData['memoryReadout']['modsActive'];
            if (!modsActive) {
                this.setVerificationState(VerificationState.Unverified, "Verified scores disabled: Requires RSMods v1.2.7.3 or later.");
                return;
            }

            // Allow 10 refreshes for the song to fully load in.
            if (this._refreshCounter <= 10) {
                this._progressTimer = songTime * 1000;
            }

            // Check if the song restarted (only check after resuming from pause)
            if (!approxEqual(songTime, previousSongTime) && this._isPaused) {
                if (songTime < previousSongTime && songTime < startTime && totalNotes === 0) {
                    logMessage("SONG RESTARTED");

                    // If the user entered riff repeater make sure they exit the song entirely otherwise scores may not verify
                    if (!this._speedChange) {
                        this.setVerificationState(VerificationState.Verified, "No violations detected.");
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
                logMessage("LEADERBOARD SNIFFER WAS ENTERED MID SONG");
                this.setVerificationState(VerificationState.Unverified, "Leaderboard sniffer was entered mid-song.");

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

                logMessage("SONG PAUSED");
                const warningMessage = "If you pause more than once in a 10 minute period, your score will not be verified.\n"
                                     + "\n"
                                     + "Note: If you pause a song right as a note is being played it can cause the internal note counter within Rocksmith to malfunction resulting in an unverified score. This is a known issue and I am trying to find a workaround.";
                this.setVerificationState(VerificationState.MaybeVerified, warningMessage);

                // Song was previously paused and it is not the same pause
                if (!approxEqual(this._lastPauseTime, 0) && !approxEqual(this._pauseTime, this._lastPauseTime)) {

                    // If the song was paused within the last 10 minutes, the score cannot be verified
                    if (this._pauseTime - this._lastPauseTime < 600) {
                        logMessage("SONG REPEATEDLY PAUSED");
                        this.setVerificationState(VerificationState.Unverified, "The song was paused more than once within a 10 minute period.");

                        return;
                    }
                }                
            }
            else {

                // If the song was paused we need to update the progress timer (the game rewinds slightly)
                if (this._isPaused) {
                    this._pausedInLast10Minutes = true;
                    logMessage("SONG RESUMED");

                    // Subtract the time we waited to ensure the song was paused
                    // It takes 1 refresh to unpause so also subtract the refresh rate
                    this._progressTimer -= Sniffer.pauseThreshold + Sniffer.refreshRate;

                    // Save the last pause time
                    this._lastPauseTime = this._pauseTime;

                    // Ensure that the progress timer and previous song time are within 0.3 second of each other
                    // This prevents users from rewinding or fast forwarding the song
                    if (approxEqual(this._progressTimer / 1000, previousSongTime, 0.3)) {
                        this._progressTimer = songTime * 1000;
                    }
                    else {
                        this.setVerificationState(VerificationState.Unverified, "Song timer did not match after resuming from pause.");
                        return;
                    }

                    // If the user enters riff repeater, total notes will be reset to 0
                    if (totalNotes < previousTotalNotes) {
                        this.setVerificationState(VerificationState.Unverified, "The user entered riff repeater.\n"
                                                                              + "\n"
                                                                              + "You must fully exit the song and restart for your score to be verified.");
                        this._speedChange = true;
                        return;
                    }
                }

                // Check if 10 minutes have passed since last pause
                if (this._verified === true && this._pausedInLast10Minutes && songTime - this._lastPauseTime > 600) {
                    logMessage("10 MINUTES PASSED SINCE LAST PAUSE");
                    this.setVerificationState(VerificationState.Verified, "No violations detected.");
                    this._pausedInLast10Minutes = false;
                }

                // If the progress timer gets 0.3 seconds out of sync with the song change to "unverified"
                // 0.3 seconds allows it to be off for two refreshes
                // Also make sure the song is fully loaded (give it 10 seconds because that is the typical amount of leading silence charts have)
                if (!this._maybePaused && !approxEqual(this._progressTimer / 1000, songTime, speedTolerance)) {
                    this.setVerificationState(VerificationState.Unverified, "Song speed change detected.\n"
                                                                          + "\n"
                                                                          + "You must fully exit the song and restart for your score to be verified.");
                    this._speedChange = true;
                    return;
                }

                // Ensure the note count has not been tampered with
                if (totalNotesHit < previousTotalNotesHit) {
                    this.setVerificationState(VerificationState.Unverified, "Note data has been tampered with. Offenses will be recorded and repeated offenses may result in a ban.");
                    return;
                }

                this._maybePaused = false;
                this._isPaused = false;
                this._pauseTimer = 0;
            }
        }

        // Song is ending
        else if (this._inSong && approxEqual(songTime, 0) && !approxEqual(previousSongTime, 0)) {

            logMessage("SONG ENDING");

            // If there are less notes than expected assume the user had dynamic difficulty on and played on an easier difficulty
            if (previousTotalNotes < previousArrangementNotes) {
                const errorMessage = "The total number of notes seen was less than the total note count of the arrangement.\n"
                                   + "\n"
                                   + "Make sure you did not exit the chart early and that dynamic difficulty is disabled.";
                this.setVerificationState(VerificationState.Unverified, errorMessage);
                logMessage("TOTAL NOTES: " + previousTotalNotes);
                logMessage("ARRANGEMENT NOTES: " + arrangementNotes);
                logMessage("");
            }

            // If there are more notes than expected report an error (although this shouldn't happen)
            else if (previousTotalNotes > previousArrangementNotes) {
                const errorMessage = "The total number of notes seen was greater than the total note count of the arrangement.\n"
                                   + "\n"
                                   + "Note: If you pause a song right as a note is being played it can cause the internal note counter within Rocksmith to malfunction resulting in an unverified score. This is a known issue and I am trying to find a workaround.\n"
                                   + "\n"
                                   + "If you did not pause please report this issue.";
                this.setVerificationState(VerificationState.Unverified, errorMessage);
                logMessage("TOTAL NOTES: " + previousTotalNotes);
                logMessage("ARRANGEMENT NOTES: " + arrangementNotes);
                logMessage("");
            }

            if (this._verified) {

                // THE SCORE IS VERIFIED!
                this.setVerificationState(VerificationState.Verified, "Your score is verified!");

                // Record verified score
                await this.recordVerifiedScore(this._previousRocksnifferData);
            }

            // Create a blank line in the log
            logMessage("");

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

    private setVerificationState(state: VerificationState, message: string = ""): void {
        const verifiedElement = document.getElementById('verified') as HTMLElement;
        const verifiedMessageElement = document.getElementById('verified_message') as HTMLElement;

        const maybeVerifiedElement = document.getElementById('maybe_verified') as HTMLElement;
        const maybeVerifiedMessageElement = document.getElementById('maybe_verified_message') as HTMLElement;

        const unverifiedElement = document.getElementById('unverified') as HTMLElement;
        const unverifiedMessageElement = document.getElementById('unverified_message') as HTMLElement;

        switch (state) {
            case VerificationState.Verified:
                logMessage("VERIFICATION STATUS CHANGED TO VERIFIED: " + message);

                verifiedElement.style.display = 'block';
                maybeVerifiedElement.style.display = 'none';
                unverifiedElement.style.display = 'none';

                verifiedMessageElement.innerText = message;

                this._verified = true;
                break;

            case VerificationState.MaybeVerified:
                logMessage("VERIFICATION STATUS CHANGED TO MAYBE VERIFIED: " + message);

                verifiedElement.style.display = 'none';
                maybeVerifiedElement.style.display = 'block';
                unverifiedElement.style.display = 'none';

                maybeVerifiedMessageElement.innerText = message;

                break;

            case VerificationState.Unverified:
                logMessage("VERIFICATION STATUS CHANGED TO UNVERIFIED: " + message);

                verifiedElement.style.display = 'none';
                maybeVerifiedElement.style.display = 'none';
                unverifiedElement.style.display = 'block';

                unverifiedMessageElement.innerText = message;

                this._verified = false;
                break;
            case VerificationState.None:
                verifiedElement.style.display = 'none';
                maybeVerifiedElement.style.display = 'none';
                unverifiedElement.style.display = 'none';

                this._verified = false;
                break;
        }
    }

    private async recordVerifiedScore(rocksnifferData: any): Promise<void> {
        
        // Define object to hold snort data
        let data: any = {};

        // Get basic song metadata
        data['song_key'] = rocksnifferData['songDetails']['songID'];
        data['psarc_hash'] = rocksnifferData['songDetails']['psarcFileHash'];
        data['arrangement_hash'] = rocksnifferData['memoryReadout']['arrangementID'];
        data['streak'] = rocksnifferData['memoryReadout']['noteData']['HighestHitStreak'];
        data['mastery'] = rocksnifferData['memoryReadout']['noteData']['Accuracy'] / 100;

        logMessage("RECORDING SCORE");
        logMessage(data);

        const host = await window.api.getHost();

        // Do not record the score in lurk mode
        if (!this._lurkMode) {
            const response = await post(host + '/api/data/record_verified_score.php', {
                auth_data: authData,
                song_data: data
            });

            if ('error' in response) {
                window.api.error(response['error']);
            }
        }

        // Show the leaderboard
        await this.showLeaderboard(rocksnifferData);
    }

    private async checkSnort(rocksnifferData: any): Promise<void> {
        const snortButton = document.getElementById('snort') as HTMLButtonElement;

        const newProfileDataAvailable = await this._rocksmith.newProfileDataAvailable();

        if (this._previousRocksnifferData !== null &&
            rocksnifferData['songDetails']['songID'] !== this._previousRocksnifferData['songDetails']['songID']) {

            // Allow the user to snort immediately
            snortButton.disabled = false;
            this._snorted = false;

            // Reset the snort countdown
            this._snortCountdown = Sniffer.snortRate / 1000;

            // If new profile data is available AND the song is changing, snort the previous song data
            // This fixes a bug where rock buddy data would not be updated after playing a song in nonstop play
            if (newProfileDataAvailable && rocksnifferData['memoryReadout']['gameStage'] === 'NonStopPlay_Hub') {
                await this.snort(this._previousRocksnifferData);
                return;
            }
        }

        // If it has been over 10 seconds since the last snort, enable the snort button
        if (!this._snort && this._timeSinceLastSnort / 1000 >= Sniffer.snortRate / 1000) {
            snortButton.disabled = false;
        }

        // If enough time has passed and we have not already snorted, snort
        if (this._snorted === false && this._snortCountdown <= 0 && this._timeSinceLastSnort > Sniffer.snortRate) {
            this._snort = true;
        }

        // If the game has just been saved snort to keep things in sync
        if (newProfileDataAvailable && rocksnifferData['memoryReadout']['gameStage'] !== 'MainMenu') {
            this._snort = true;
        }

        if (this._snort) {
            this._snort = false;
            await this.snort(rocksnifferData);
        }
        else if (!this._snorted) {
            const leaderboardDataElement = document.getElementById('leaderboard_data') as HTMLElement;
            leaderboardDataElement.innerHTML = '';
            leaderboardDataElement.appendChild(document.createTextNode('Snorting data in ' + Math.ceil(this._snortCountdown)));
            this._snortCountdown -= Sniffer.refreshRate / 1000; // convert to seconds
        }
    }

    private async snort(rocksnifferData: any) {
        const statusElement = document.getElementById('status') as HTMLElement;
        statusElement.innerHTML = 'Snorting data...';

        const leaderboardDataElement = document.getElementById('leaderboard_data') as HTMLElement;
        leaderboardDataElement.innerHTML = '';
        const snortText = document.createElement('em');
        snortText.textContent = '*Snort*';
        leaderboardDataElement.appendChild(snortText);

        // Grab current Rocksmith profile data
        const rocksmithData = await this._rocksmith.getProfileData();
        if (rocksmithData === null) {
            throw new Error("Failed to read Rocksmith profile data. Please check your config settings.");
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

        //TODO: change to extra logging later
        //if (this._extraLogging) {
            logMessage("SONG: " + snortData['artist'] + " - " + snortData['title']);
        //}

        // Loop athrough each arrangement
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

            //TODO: change to extra logging later
            //if (this._extraLogging) {
                logMessage("ARRANGEMENT: " + arrangementData['name'] + " - " + arrangementData['note_data_hash']);
            //}

            const lasDataExists = rocksmithData['Stats']['Songs'].hasOwnProperty(hash);
            const saDataExists = rocksmithData['SongsSA'].hasOwnProperty(hash);
            if (lasDataExists) {
                arrangementData['mastery'] = rocksmithData['Stats']['Songs'][hash]['MasteryPeak'];
                arrangementData['streak'] = rocksmithData['Stats']['Songs'][hash]['Streak'];
                arrangementData['las_last_played'] = rocksmithData['Stats']['Songs'][hash]['DateLAS'];
                arrangementData['las_play_count'] = rocksmithData['Stats']['Songs'][hash]['PlayedCount'];
            }
            if (saDataExists) {
                arrangementData['scores'] = {};
                arrangementData['badges'] = {};

                // Scores
                // Keep easy and medium commented out in case we want to add them later
                //arrangementData['scores']['easy'] = rocksmithData['SongsSA'][hash]['HighScores']['Easy'];
                //arrangementData['scores']['medium'] = rocksmithData['SongsSA'][hash]['HighScores']['Medium'];
                arrangementData['scores']['hard'] = rocksmithData['SongsSA'][hash]['HighScores']['Hard'];
                arrangementData['scores']['master'] = rocksmithData['SongsSA'][hash]['HighScores']['Master'];

                // Strikes
                // Keep easy and medium commented out in case we want to add them later
                //arrangementData['badges']['easy'] = rocksmithData['SongsSA'][hash]['Badges']['Easy'];
                //arrangementData['badges']['medium'] = rocksmithData['SongsSA'][hash]['Badges']['Medium'];
                arrangementData['badges']['hard'] = rocksmithData['SongsSA'][hash]['Badges']['Hard'];
                arrangementData['badges']['master'] = rocksmithData['SongsSA'][hash]['Badges']['Master'];

                arrangementData['sa_last_played'] = rocksmithData['Stats']['Songs'][hash]['DateSA'];
                arrangementData['sa_play_count'] = rocksmithData['SongsSA'][hash]['PlayCount'];
            }

            snortData['arrangements'][hash] = arrangementData;
        });

        // Sync the data with the server
        const synced = await this.syncWithServer(snortData);

        this._timeSinceLastSnort = 0;
        this._snorted = true;

        // Show the leaderboard
        if (synced) {
            await this.showLeaderboard(rocksnifferData);
        }
    }

    private async syncWithServer(snortData: any): Promise<boolean> {
        const host = await window.api.getHost();

        const sync_response = await post(host + '/api/data/sniffer_sync.php', {
            auth_data: authData,
            song_data: snortData,
            lurk_mode: this._lurkMode
        });

        if ('error' in sync_response) {
            if (sync_response['error'] === 'Test versions of songs are not supported.') {
                const leaderboardDataElement = document.getElementById('leaderboard_data') as HTMLElement;
                leaderboardDataElement.innerText = sync_response['error'];
            }
            else if (!this._syncErrorDisplayed) {
                window.api.error(sync_response['error']);
                this._syncErrorDisplayed = true;
            }
            return false;
        }

        // If we make it this far it means we aren't getting the same sync error repeatedly
        // It is safe to display it again
        this._syncErrorDisplayed = false;

        const version_response = await post(host + '/api/data/get_versions.php', {
            auth_data: authData,
            song_data: snortData
        });

        if ('error' in version_response) {
            window.api.error(version_response['error']);
            return false;
        }

        if ('versions' in version_response) {
            const currentVersion = snortData['version'].trim();
            const versionsAvailable = version_response['versions'];

            // Show the alert icon based on whether a new version is detected
            const newVersionAlertIconElement = document.getElementById('new_version_alert_icon') as HTMLElement;
            if (!await this.isLatestVersion(currentVersion, versionsAvailable)) {
                newVersionAlertIconElement.style.visibility = 'visible';
            }
        }

        return true;
    }

    private async isLatestVersion(currentVersion: string, versionsAvailable: string[]) {

        // No known versions, treat it as latest
        if (versionsAvailable.length === 0) {
            return true;
        }

        // If the current version is not valid semver, we can't compare it so treat it as latest
        currentVersion = buildValidSemver(currentVersion);
        if (await window.api.semverValid(currentVersion) === null) {
            return true;
        }

        // Use a regular for loop instead of forEach since it calls an async function within and we want to wait
        let invalid = false;
        for (let i = 0; i < versionsAvailable.length; ++i) {

            versionsAvailable[i] = buildValidSemver(versionsAvailable[i])
            if (await window.api.semverValid(versionsAvailable[i]) === null) {
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

    private async showLeaderboard(rocksnifferData: any): Promise<void> {
        if (!this._snorted) {
            this.queueSnort();
            return;
        }

        if (this._gameMode === 'las') {
            displayLASLeaderboard(rocksnifferData['songDetails']['songID'], rocksnifferData['songDetails']['psarcFileHash'], this._path);
        }
        else if (this._gameMode === 'sa') {
            displaySALeaderboard(rocksnifferData['songDetails']['songID'], rocksnifferData['songDetails']['psarcFileHash'], this._path, this._difficulty);
        }
    }
};
