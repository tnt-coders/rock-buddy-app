import { Rocksmith } from './rocksmith';
import { Rocksniffer } from './rocksniffer';
import { UserData } from '../common/user_data';
import { showError, showExclusive } from './functions';
import { approxEqual, durationString, getAvailablePaths, logMessage, post } from '../common/functions';

enum VerificationState {
    Verified,
    MaybeVerified,
    Unverified,
}

export class Sniffer {
    // Refresh rate in milliseconds
    private static readonly refreshRate: number = 100; // milliseconds
    private static readonly snortRate: number = 10000; // milliseconds
    private static readonly pauseThreshold: number = 500; // milliseconds

    private readonly _rocksmith: Rocksmith;
    private readonly _rocksniffer: Rocksniffer;

    // Prevent duplicate refreshes
    private _refreshActive: boolean = false;

    // Game mode/path/difficulty combo box data
    private _preferredPath: string = 'lead';
    private _gameMode: string = 'las';
    private _path: string = 'lead';
    private _difficulty: string = 'hard';

    // Rocksniffer data from last refresh
    private _previousRocksnifferData: any = null;
    
    // Progress monitor data
    private _verified: boolean = true;
    private _inSong: boolean = false;
    private _progressTimer: number = 0;
    private _maybePaused: boolean = false;
    private _isPaused: boolean = false;
    private _pauseTimer: number = 0;
    private _pauseTime: number = 0;
    private _lastPauseTime: number = 0;
    private _ending: boolean = false;

    // Snort data
    private _snort: boolean = true; // Set true on startup to ensure initial snorting
    private _snorted: boolean = false; // Set false on startup to ensure initial snorting
    private _snortCountdown: number = 10; // seconds
    private _timeSinceLastSnort: number = 0;

    private constructor(rocksmith: Rocksmith, rocksniffer: Rocksniffer) {
        this._rocksmith = rocksmith;
        this._rocksniffer = rocksniffer;
    }

    public static async create(): Promise<Sniffer> {
        const rocksmith = await Rocksmith.create();
        const rocksniffer = await Rocksniffer.create();

        const sniffer = new Sniffer(rocksmith, rocksniffer);
        await sniffer.init();

        return sniffer;
    }

    public start(): void {
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

        // Setup game mode combo box
        const gameModeElement = document.getElementById('game_mode') as HTMLSelectElement;

        gameModeElement?.addEventListener('change', async () => {
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
    }

    private async sniff(): Promise<any> {
        const rocksnifferData = await this._rocksniffer.sniff();
        if (rocksnifferData === null || !rocksnifferData['success']) {
            throw new Error('Navigate to a song in Rocksmith to begin sniffing.');
        }

        return rocksnifferData;
    }

    private async refresh(): Promise<void> {
        this._timeSinceLastSnort += Sniffer.refreshRate;

        // If we are in a song, update the progress timer
        if (this._inSong) {
            if (!this._isPaused) {
                this._progressTimer += Sniffer.refreshRate;
            }

            if (this._maybePaused) {
                this._pauseTimer += Sniffer.refreshRate;
            }
        }

        if (this._refreshActive === true) {
            return;
        }
        this._refreshActive = true;

        try {
            const rocksnifferData = await this.sniff();

            this.updateSongInfo(rocksnifferData);
            this.updateLiveFeed(rocksnifferData);
            this.updatePath(rocksnifferData);
            this.monitorProgress(rocksnifferData);

            // Check if it is time to snort
            await this.checkSnort(rocksnifferData);

            this._previousRocksnifferData = rocksnifferData;
        }
        catch (error) {
            showError(error);
            this._refreshActive = false;
            return;
        }

        // Update the status
        const statusElement = document.getElementById('status') as HTMLElement;
        statusElement.innerText = 'Sniffing...';

        // Show connected state
        showExclusive('group1', 'connected');

        this._refreshActive = false;
    }

    private updateSongInfo(rocksnifferData: any): void {
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
        if (songTime > 0) {

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
        else if (this._previousRocksnifferData !== null &&
            rocksnifferData['songDetails']['songID'] !== this._previousRocksnifferData['songDetails']['songID']) {

            // Default to the preferred path
            if (this._preferredPath in hashMap) {
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

    private monitorProgress(rocksnifferData: any): void {

        // Cannot proceed until we have a previous data set to work with
        if (this._previousRocksnifferData === null) {
            return;
        }

        const songName = rocksnifferData['songDetails']['songName'];
        const artistName = rocksnifferData['songDetails']['artistName'];
        const songTime = rocksnifferData['memoryReadout']['songTimer'];
        const songLength = rocksnifferData['songDetails']['songLength'];
        const totalNotes = rocksnifferData['memoryReadout']['noteData']['TotalNotes'];
        const previousSongTime = this._previousRocksnifferData['memoryReadout']['songTimer'];
        const previousSongLength = this._previousRocksnifferData['songDetails']['songLength'];

        let data: { [key: string]: any } = {
            song_name: songName,
            artist_name: artistName,
            in_song: this._inSong,
            maybe_paused: this._maybePaused,
            is_paused: this._isPaused,
            pause_timer: this._pauseTimer,
            pause_time: this._pauseTime,
            last_pause_time: this._lastPauseTime,
            progress_timer: this._progressTimer,
            song_time: songTime,
            previous_song_time: previousSongTime,
            song_length: songLength,
            previous_song_length: previousSongLength,
        };

        // Check if the song was restarted
        if (this._inSong && songTime < previousSongTime && songTime < 5 && totalNotes === 0) {
            logMessage("SONG RESTARTING");
            logMessage(JSON.stringify(data));
            this.setVerificationState(VerificationState.Verified, "No violations detected.");

            this._inSong = true;
            this._progressTimer = songTime * 1000;
            this._maybePaused = false;
            this._isPaused = false;
            this._pauseTimer = 0;
            this._pauseTime = 0;
            this._lastPauseTime = 0;
        }

        // Currently in a song
        else if (!approxEqual(songTime, 0) && !approxEqual(previousSongTime, 0)) {
            logMessage(JSON.stringify(data));

            // No point in doing work if the score is already not verified
            if (this._verified === false) {
                return;
            }

            // Rock Buddy was started during a song (score cannot be verified)
            if (approxEqual(this._progressTimer, 0)) {
                this.setVerificationState(VerificationState.Unverified, "Rock Buddy was started mid-song.");
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

                // If we are at the end of the song don't check for pause
                if (approxEqual(songTime, songLength, 0.1)) {
                    logMessage("AT END OF SONG");
                    this._ending = true;
                    return;
                }

                this.setVerificationState(VerificationState.MaybeVerified, "If you pause more than once in a 10 minute period, your score will not be verified.");
                logMessage("SONG PAUSED");

                // Record the pause time
                this._isPaused = true;
                this._pauseTime = songTime;

                // Song was previously paused and it is not the same pause
                if (!approxEqual(this._lastPauseTime, 0) && !approxEqual(this._pauseTime, this._lastPauseTime)) {

                    // If the song was paused within the last 10 minutes, the score cannot be verified
                    if (this._pauseTime - this._lastPauseTime < 600) {
                        this.setVerificationState(VerificationState.Unverified, "The song was paused more than once within a 10 minute period.");
                        return;
                    }
                }                
            }
            else {

                // If the song was paused we need to update the progress timer (the game rewinds slightly)
                if (this._isPaused) {

                    // Subtract the 0.5 seconds we waited to ensure the song was paused
                    // It takes 1 refresh to unpause so also subtract the refresh rate
                    this._progressTimer -= Sniffer.pauseThreshold + Sniffer.refreshRate;

                    // Ensure that the progress timer and previous song time are within 0.3 second of each other
                    // This prevents users from rewinding or fast forwarding the song
                    if (approxEqual(this._progressTimer / 1000, previousSongTime, 0.3)) {
                        this._progressTimer = songTime * 1000;
                    }
                    else {
                        this.setVerificationState(VerificationState.Unverified, "Song timer did not match after resuming from pause.");
                        return;
                    }
                }

                // If the progress timer gets 0.3 seconds out of sync with the song change to "unverified"
                // 0.3 seconds allows it to be off for two refreshes
                if (!approxEqual(this._progressTimer / 1000, songTime, 0.3)) {
                    this.setVerificationState(VerificationState.Unverified, "Song speed change detected.");
                    return;
                }

                this._maybePaused = false;
                this._isPaused = false;
                this._pauseTimer = 0;
                this._lastPauseTime = this._pauseTime;
            }
        }

        // Song is starting
        else if (!approxEqual(songTime, 0) && totalNotes === 0) {
            logMessage("SONG STARTING");
            logMessage(JSON.stringify(data));

            this.setVerificationState(VerificationState.Verified, "No violations detected.");

            this._inSong = true;
            this._progressTimer = songTime * 1000;
            this._maybePaused = false;
            this._isPaused = false;
            this._pauseTimer = 0;
            this._pauseTime = 0;
            this._lastPauseTime = 0;
        }

        // Song is ending
        else if (!approxEqual(previousSongTime, 0) || (this._inSong && approxEqual(songTime, 0) && approxEqual(previousSongTime, 0))) {
            logMessage("SONG ENDING");
            logMessage(JSON.stringify(data));

            // Final verification steps
            if (this._verified) {

                // Check that the progress timer is within 5 seconds of the song length
                if (approxEqual(this._progressTimer / 1000, previousSongLength, 5)) {
                    this.setVerificationState(VerificationState.Verified, "Your score is verified!");
                    logMessage("VERIFIED");

                    //TODO: record verified score
                }
                else {
                    this.setVerificationState(VerificationState.Unverified, "The song timer did not match the song length.");
                }
            }

            this._inSong = false;
            this._progressTimer = 0;
            this._maybePaused = false;
            this._isPaused = false;
            this._pauseTimer = 0;
            this._pauseTime = 0;
            this._lastPauseTime = 0;
        }
    }

    private setVerificationState(state: VerificationState, message: string): void {
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
        }

        return;
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
            this._snortCountdown = 10;

            // If new profile data is available AND the song is changing, snort the previous song data
            // This fixes a bug where rock buddy data would not be updated after playing a song in nonstop play
            if (newProfileDataAvailable && rocksnifferData['memoryReadout']['gameStage'] === 'NonStopPlay_Hub') {
                this.snort(this._previousRocksnifferData);
                return;
            }
        }

        // If it has been over 10 seconds since the last snort, enable the snort button
        if (!this._snort && this._timeSinceLastSnort / 1000 >= 10) {
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
            this.snort(rocksnifferData);
        }
        else if (!this._snorted) {
            const leaderboardDataElement = document.getElementById('leaderboard_data') as HTMLElement;
            leaderboardDataElement.innerHTML = '';
            leaderboardDataElement.appendChild(document.createTextNode('Snorting data in ' + Math.ceil(this._snortCountdown)));
            this._snortCountdown -= Sniffer.refreshRate / 1000; // convert to secondss
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

        // Define object to hold snort data
        let snortData: any = {};

        // Get basic song metadata
        snortData['song_key'] = rocksnifferData['songDetails']['songID'];
        snortData['psarc_hash'] = rocksnifferData['songDetails']['psarcFileHash'];
        snortData['title'] = rocksnifferData['songDetails']['songName'];
        snortData['artist'] = rocksnifferData['songDetails']['artistName'];
        snortData['album'] = rocksnifferData['songDetails']['albumName'];
        snortData['year'] = rocksnifferData['songDetails']['albumYear'];

        const availablePaths = getAvailablePaths(rocksnifferData['songDetails']['arrangements']);

        // Define object to hold arrangement data
        snortData['arrangements'] = {};

        // Loop athrough each arrangement
        rocksnifferData['songDetails']['arrangements'].forEach((arrangement: any) => {
            let arrangementData: any = {};

            const hash = arrangement['arrangementID'];
            arrangementData['hash'] = hash;

            // Get the name of the arrangement
            availablePaths.forEach((path) => {
                if (path.hash === hash) {
                    arrangementData['name'] = path['name'];
                }
            });

            const lasDataExists = rocksmithData['Stats']['Songs'].hasOwnProperty(hash);
            const saDataExists = rocksmithData['SongsSA'].hasOwnProperty(hash);
            if (lasDataExists) {
                arrangementData['mastery'] = rocksmithData['Stats']['Songs'][hash]['MasteryPeak'];
                arrangementData['last_accuracy'] = rocksmithData['Stats']['Songs'][hash]['AccuracyGlobal'];
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
        await this.syncWithServer(snortData);

        this._timeSinceLastSnort = 0;
        this._snorted = true;

        // Show the leaderboard
        await this.showLeaderboard(rocksnifferData);
    }

    private async syncWithServer(snortData: any): Promise<void> {
        const authData = JSON.parse(window.sessionStorage.getItem('auth_data') as any);

        const host = await window.api.getHost();
        const response = await post(host + '/api/data/sniffer_sync.php', {
            auth_data: authData,
            song_data: snortData
        });

        if ('error' in response) {
            window.api.error(response['error']);
        }
    }

    private async getScoresLAS(rocksnifferData: any): Promise<any> {
        const authData = JSON.parse(window.sessionStorage.getItem('auth_data') as any);

        const host = await window.api.getHost();
        const response = await post(host + '/api/data/get_scores_las.php', {
            auth_data: authData,
            song_key: rocksnifferData['songDetails']['songID'],
            psarc_hash: rocksnifferData['songDetails']['psarcFileHash'],
            arrangement: this._path
        });

        if ('error' in response) {
            window.api.error(response['error']);
            return null;
        }

        return response;
    }

    private async getScoresSA(rocksnifferData: any): Promise<any> {
        const authData = JSON.parse(window.sessionStorage.getItem('auth_data') as any);

        const host = await window.api.getHost();
        const response = await post(host + '/api/data/get_scores_sa.php', {
            auth_data: authData,
            song_key: rocksnifferData['songDetails']['songID'],
            psarc_hash: rocksnifferData['songDetails']['psarcFileHash'],
            arrangement: this._path,
            difficulty: this._difficulty
        });

        if ('error' in response) {
            window.api.error(response['error']);
            return null;
        }

        return response;
    }

    private async showLeaderboard(rocksnifferData: any): Promise<void> {
        if (!this._snorted) {
            this.queueSnort();
            return;
        }

        if (this._gameMode === 'las') {
            this.displayLASLeaderboard(rocksnifferData);
        }
        else if (this._gameMode === 'sa') {
            this.displaySALeaderboard(rocksnifferData);
        }
    }

    private async displayLASLeaderboard(rocksnifferData: any): Promise<void> {
        const authData = JSON.parse(window.sessionStorage.getItem('auth_data') as any);

        const leaderboardDataElement = document.getElementById('leaderboard_data') as HTMLElement;

        const scores = await this.getScoresLAS(rocksnifferData);

        if (scores.length === 0) {
            const message = document.createElement('p');
            message.innerHTML = 'And this is where I would put my scores... <em>IF I HAD ONE!</em>';
            leaderboardDataElement.innerHTML = '';
            leaderboardDataElement.appendChild(message);
            return;
        }

        // Create the table element
        const table = document.createElement('table');
        table.style.width = '100%';

        // Create the header row
        const headerRow = document.createElement('tr');
        const headers = ['Rank', 'Username', 'Last Played', 'Play Count', 'Streak', 'Mastery'];
        headers.forEach((header) => {
            const headerCell = document.createElement('th');
            headerCell.style.fontFamily = 'Roboto Mono, monospace';
            headerCell.appendChild(document.createTextNode(header));
            headerRow.appendChild(headerCell);
        });

        table.appendChild(headerRow);

        // Create data rows
        const columns = ['rank', 'username', 'last_played', 'play_count', 'streak', 'mastery'];
        const columnsAlign = ['right', 'left', 'left', 'right', 'right', 'right'];

        // Keep track of rank
        let rank = 1;
        let lastMastery: number | null = null;
        let lastStreak: number | null = null;
        let tieCount = 0;
        scores.forEach((row: any) => {
            const dataRow = document.createElement('tr');

            // Populate data for each column
            let columnIndex = 0;
            columns.forEach((column) => {
                const dataCell = document.createElement('td');
                dataCell.style.fontFamily = 'Roboto Mono, monospace';
                if (column === 'rank') {
                    dataCell.appendChild(document.createTextNode(rank.toString()));
                }
                else if (column === 'mastery') {
                    const percentage = (row[column] * 100).toFixed(2) + '%';
                    dataCell.appendChild(document.createTextNode(percentage));
                }
                else {
                    dataCell.appendChild(document.createTextNode(row[column]));
                }
                dataCell.style.textAlign = columnsAlign[columnIndex++];
                dataRow.appendChild(dataCell);
            });

            // Handle the situation where a tie occurs
            let tie = false;
            if (lastMastery !== null && lastStreak !== null) {
                if (approxEqual(row['mastery'], lastMastery) && approxEqual(row['streak'], lastStreak)) {
                    tie = true;
                    tieCount++;
                }
            }
            if (!tie) {
                rank += (tieCount + 1);
                tieCount = 0;
            }
            lastMastery = row['mastery'];
            lastStreak = row['streak'];

            // Highlight the row of the current user
            if (row['user_id'] === authData['user_id']) {
                dataRow.classList.add('current-user');
            }

            // Add the row to the table
            table.appendChild(dataRow);
        })

        leaderboardDataElement.innerHTML = '';
        leaderboardDataElement.appendChild(table);
    }

    private async displaySALeaderboard(rocksnifferData: any): Promise<void> {
        const authData = JSON.parse(window.sessionStorage.getItem('auth_data') as any);

        const leaderboardDataElement = document.getElementById('leaderboard_data') as HTMLElement;

        const scores = await this.getScoresSA(rocksnifferData);
        console.log(scores);

        if (scores.length === 0) {
            const message = document.createElement('p');
            message.innerHTML = 'And this is where I would put my scores... <em>IF I HAD ONE!</em>';
            leaderboardDataElement.innerHTML = '';
            leaderboardDataElement.appendChild(message);
            return;
        }

        // Create the table element
        const table = document.createElement('table');
        table.style.width = '100%';

        // Create the header row
        const headerRow = document.createElement('tr');
        const headers = ['Rank', 'Username', 'Last Played', 'Play Count', 'Score'];
        headers.forEach((header) => {
            const headerCell = document.createElement('th');
            headerCell.style.fontFamily = 'Roboto Mono, monospace';
            headerCell.appendChild(document.createTextNode(header));
            headerRow.appendChild(headerCell);
        });

        table.appendChild(headerRow);

        // Create data rows
        const columns = ['rank', 'username', 'last_played', 'play_count', 'score'];
        const columnsAlign = ['right', 'left', 'left', 'right', 'right'];

        // Keep track of rank
        let rank = 1;
        let lastScore: number | null = null;
        let lastBadges: number | null = null;
        let tieCount = 0;
        scores.forEach((row: any) => {
            const dataRow = document.createElement('tr');

            // Populate data for each column
            let columnIndex = 0;
            columns.forEach((column) => {
                const dataCell = document.createElement('td');
                dataCell.style.fontFamily = 'Roboto Mono, monospace';
                if (column === 'rank') {
                    dataCell.appendChild(document.createTextNode(rank.toString()));
                }
                else if (column === 'score') {

                    const scoreElement = document.createElement('div');
                    scoreElement.style.display = 'flex';
                    scoreElement.style.flexDirection = 'row';
                    
                    const badgeElement = document.createElement('img');
                    badgeElement.src = `./../../images/badge-icons/badge-${row['badges']}.png`;
                    badgeElement.width = 15;
                    badgeElement.height = 15;
                    badgeElement.style.marginLeft = '5px';

                    const scoreSpan = document.createElement('span');
                    scoreSpan.appendChild(document.createTextNode(row[column].toLocaleString('en-US')));
                    scoreSpan.style.marginLeft = 'auto';

                    scoreElement.appendChild(badgeElement);
                    scoreElement.appendChild(scoreSpan);

                    dataCell.appendChild(scoreElement);
                }
                else {
                    dataCell.appendChild(document.createTextNode(row[column]));
                }
                dataCell.style.textAlign = columnsAlign[columnIndex++];
                dataRow.appendChild(dataCell);
            });

            // Handle the situation where a tie occurs
            let tie = false;
            if (lastScore !== null && lastBadges !== null) {
                if (approxEqual(row['badges'], lastBadges) && approxEqual(row['score'], lastScore)) {
                    tie = true;
                    tieCount++;
                }
            }
            if (!tie) {
                rank += (tieCount + 1);
                tieCount = 0;
            }
            lastScore = row['score'];
            lastBadges = row['badges'];

            // Highlight the row of the current user
            if (row['user_id'] === authData['user_id']) {
                dataRow.classList.add('current-user');
            }

            // Add the row to the table
            table.appendChild(dataRow);
        })

        leaderboardDataElement.innerHTML = '';
        leaderboardDataElement.appendChild(table);
    }
};
