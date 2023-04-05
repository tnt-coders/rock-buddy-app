import { Mutex } from 'async-mutex';
import { Rocksmith } from './rocksmith';
import { Rocksniffer } from './rocksniffer';
import { UserData } from '../common/user_data';
import { showError, showExclusive } from './functions';
import { approxEqual, durationString, getAvailablePaths } from '../common/functions';

export class Sniffer {
    // Refresh rate in milliseconds
    private static readonly refreshRate: number = 100; // milliseconds
    private static readonly snortRate: number = 10000; // milliseconds

    private readonly _rocksmith: Rocksmith;
    private readonly _rocksniffer: Rocksniffer;

    // Prevent duplicate refreshes
    private _refreshActive: boolean = false;
    private _refreshLeaderboardActive: boolean = false;

    // Game mode/path/difficulty combo box data
    private _preferredPath: string | null = null;
    private _gameMode: string = 'las';
    private _path: string = 'lead';
    private _difficulty: string = 'hard';

    // Snort data
    private _snort = true; // Set to true on startup to ensure initial snorting
    private _snortCountdown: number = 10; // seconds
    private _timeSinceLastSnort: number = 0;
    private _currentSong: string | null = null;
    private _previousSongData: any = null;

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

        // Get the preferred path
        this._preferredPath = await UserData.get('preferred_path');
        if (this._preferredPath === null) {
            this._preferredPath = 'lead';
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
                await this.showLeaderboard();
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
                await this.showLeaderboard();
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
                await this.showLeaderboard();
            }
            catch (error) {
                showError(error);
            }
        });

        // Setup sussy warning
        const sussyWarningElement = document.getElementById('sussy_warning') as HTMLElement;
        const sussyWarningCloseElement = document.getElementById('sussy_warning_close') as HTMLElement;

        sussyWarningCloseElement.addEventListener('click', () => {
            sussyWarningElement.style.display = 'none';
        });

        // Setup sussy error
        const sussyErrorElement = document.getElementById('sussy_error') as HTMLElement;
        const sussyErrorCloseElement = document.getElementById('sussy_error_close') as HTMLElement;

        sussyErrorCloseElement.addEventListener('click', () => {
            sussyErrorElement.style.display = 'none';
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

        if (this._refreshActive === true) {
            return;
        }

        try {
            const rocksnifferData = await this.sniff();
            this.updateSongInfo(rocksnifferData);
            this.updateLiveFeed(rocksnifferData);
            this.updatePath(rocksnifferData);
            this.updateLeaderboard(rocksnifferData);
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
        if (songTime > 0) {
            liveFeedIconElement.style.backgroundColor = 'green';

            // Mode 1 is learn a song
            if (mode === 1) {
                const statsLasElement = document.getElementById('stats_las') as HTMLElement;
                statsLasElement.style.display = 'block';

                const notesHit = rocksnifferData['memoryReadout']['noteData']['TotalNotesHit'];
                const totalNotes = rocksnifferData['memoryReadout']['noteData']['TotalNotes'];
                const accuracy = rocksnifferData['memoryReadout']['noteData']['Accuracy'];
                const streak = rocksnifferData['memoryReadout']['noteData']['CurrentHitStreak'];
                const highestStreak = rocksnifferData['memoryReadout']['noteData']['HighestHitStreak'];
                const songTimer = rocksnifferData['memoryReadout']['songTimer'];
                const songLength = rocksnifferData['songDetails']['songLength'];

                const notesHitElement = document.getElementById('notes_hit') as HTMLElement;
                const totalNotesElement = document.getElementById('total_notes') as HTMLElement;
                const accuracyElement = document.getElementById('accuracy') as HTMLElement;
                const streakElement = document.getElementById('streak') as HTMLElement;
                const highestStreakElement = document.getElementById('highest_streak') as HTMLElement;
                const songTimerElement = document.getElementById('song_timer') as HTMLElement;
                const songLengthElement = document.getElementById('song_length') as HTMLElement;

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
                //TODO score attack live feed
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
    }

    private async updateLeaderboard(rocksnifferData: any): Promise<void> {
        const snortButton = document.getElementById('snort') as HTMLButtonElement;

        let snortData = {};
       //  snortData['song_key'] = 1;

        if (rocksnifferData['songDetauls']['songID'] !== this._currentSong) {
            this._currentSong = rocksnifferData['songDetauls']['songID'];
        }

        // If enough time has passed, snort
        if (this._snort === false && this._timeSinceLastSnort > Sniffer.snortRate) {
            snortButton.disabled = false;
        }

        if (this._snort) {

        }
        else {

        }
    }







    ///////////////////////////////////

    private async showLeaderboard(): Promise<void> {
        // if (!this._snorted) {
        //     this.snort();
        //     return;
        // }

        if (this._gameMode === 'las') {
            //this.displayLasLeaderboard();
        }
        else if (this._gameMode === 'sa') {
            //TODO
            showError(new Error('Score attack leaderboards are not yet available. Check back soon!'));
            //this.displaySaLeaderboard();
        }
    }

//     private async displayLasLeaderboard(): Promise<void> {
//         const scoresLas = await this.getScoresLas();

//         if (scoresLas.length === 0) {
//             // No scores found
//             return;
//         }

//         // Create the table element
//         const table = document.createElement('table');
//         table.style.width = '100%';

//         // Create the header row
//         const headerRow = document.createElement('tr');
//         const headers = ['Rank', 'Username', 'Last Played', 'Play Count', 'Streak', 'Mastery'];
//         headers.forEach((header) => {
//             const headerCell = document.createElement('th');
//             headerCell.style.fontFamily = "Roboto Mono, monospace";
//             headerCell.appendChild(document.createTextNode(header));
//             headerRow.appendChild(headerCell);
//         });

//         table.appendChild(headerRow);

//         // Create data rows
//         const columns = ['rank', 'username', 'last_played', 'play_count', 'streak', 'mastery'];
//         const columnsAlign = ['right', 'left', 'left', 'right', 'right', 'right'];

//         // Keep track of rank
//         let rank = 1;
//         let lastMastery: number | null = null;
//         let lastStreak: number | null = null;
//         let tieCount = 0;
//         scoresLas.forEach((row: any) => {
//             const dataRow = document.createElement('tr');

//             // Populate data for each column
//             let columnIndex = 0;
//             columns.forEach((column) => {
//                 const dataCell = document.createElement('td');
//                 dataCell.style.fontFamily = "Roboto Mono, monospace";
//                 if (column === 'rank') {
//                     dataCell.appendChild(document.createTextNode(rank.toString()));
//                 }
//                 else if (column === 'mastery') {
//                     const percentage = (row[column] * 100).toFixed(2) + '%';
//                     dataCell.appendChild(document.createTextNode(percentage));
//                 }
//                 else {
//                     dataCell.appendChild(document.createTextNode(row[column]));
//                 }
//                 dataCell.style.textAlign = columnsAlign[columnIndex++];
//                 dataRow.appendChild(dataCell);
//             });

//             // Handle the situation where a tie occurs
//             let tie = false;
//             if (lastMastery !== null && lastStreak !== null) {
//                 if (approxEqual(row['mastery'], lastMastery) && approxEqual(row['streak'], lastStreak)) {
//                     tie = true;
//                     tieCount++;
//                 }
//             }

//             if (!tie) {
//                 rank += (tieCount + 1);
//                 tieCount = 0;
//             }

//             // Add the row to the table
//             table.appendChild(dataRow);
//         })
//     }
};
