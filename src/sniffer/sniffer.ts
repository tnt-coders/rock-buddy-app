import { Mutex } from 'async-mutex';
import { Rocksmith } from './rocksmith';
import { Rocksniffer } from './rocksniffer';
import { UserData } from '../common/user_data';
import { approxEqual, durationString, getAvailablePaths, post } from '../common/functions';

class Sniffer {
  // Refresh rate in milliseconds
  private static readonly refreshRate: number = 100; // milliseconds
  private static readonly snortRate: number = 10000; // milliseconds
  private static readonly songLengthTolerance: number = 5 // seconds (play time must be within 5 seconds of the length of the song for verified scores)
  private static readonly minPauseRate: number = 10 * 60; // seconds (only allow pausing once every 10 minutes for verified scores)

  private readonly _rocksmith: Rocksmith;
  private readonly _rocksniffer: Rocksniffer;

  // Mutexes for threadsafe access
  private _connectedMutex: Mutex = new Mutex();
  private _refreshSniffActiveMutex: Mutex = new Mutex();
  private _refreshHeaderActiveMutex: Mutex = new Mutex();
  private _refreshMonitorProgressActiveMutex: Mutex = new Mutex();
  private _rocksnifferDataMutex: Mutex = new Mutex();

  // Used to prevent duplicate refreshing
  private _refreshSniffActive: boolean = false;
  private _refreshHeaderActive: boolean = false;
  private _refreshMonitorProgressActive: boolean = false;

  // Connected status with RockSniffer
  private _connected: boolean = false;

  // Song data
  private _rocksmithData: any = null;
  private _previousRocksmithData: any = null;
  private _rocksnifferData: any = null;
  private _previousRocksnifferData: any = null;

  // Monitoring 
  private _pauseTime: number = 0;         // Song timer when the song is paused
  private _lastPauseTime: number = 0;     // Tracks when the song was last paused
  private _refreshCounter: number = 0;    // Tracks how many refreshes happened during the song
  private _verifiedScore: boolean = true; // Determines if a score is verified or not

  // Snort state
  private _snort: boolean = true;
  private _snorted: boolean = false;

  // Game mode/path/difficulty combo box data
  private _preferredPath: string | null = null;
  private _gameMode: string = 'las';
  private _path: string = 'lead';
  private _difficulty: string = 'hard';

  private constructor(rocksmith: Rocksmith, rocksniffer: Rocksniffer) {
    this._rocksmith = rocksmith;
    this._rocksniffer = rocksniffer;
  }

  public static async create(): Promise<Sniffer> {
    const rocksmith = await Rocksmith.create();
    const rocksniffer = await Rocksniffer.create();

    const sniffer = new Sniffer(rocksmith, rocksniffer);
    sniffer.init();

    return sniffer;
  }

  public async start(): Promise<void> {
    setInterval(this.refreshSniff.bind(this), Sniffer.refreshRate);
    setInterval(this.refreshHeaderData.bind(this), Sniffer.refreshRate);
    setInterval(this.refreshMonitorProgress.bind(this), Sniffer.refreshRate);
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

  private async getConnected(): Promise<boolean> {
    const release = await this._connectedMutex.acquire();
    const connected = this._connected;
    release();
    return connected;
  }

  private async getRefreshSniffActive(): Promise<boolean> {
    const release = await this._refreshSniffActiveMutex.acquire();
    const refreshSniffActive = this._refreshSniffActive;
    release();
    return refreshSniffActive;
  }

  private async getRefreshHeaderActive(): Promise<boolean> {
    const release = await this._refreshHeaderActiveMutex.acquire();
    const refreshHeaderActive = this._refreshHeaderActive;
    release();
    return refreshHeaderActive;
  }

  private async getRefreshMonitorProgressActive(): Promise<boolean> {
    const release = await this._refreshMonitorProgressActiveMutex.acquire();
    const refreshMonitorProgressActive = this._refreshMonitorProgressActive;
    release();
    return refreshMonitorProgressActive;
  }

  private async setConnected(connected: boolean): Promise<void> {
    const release = await this._connectedMutex.acquire();
    this._connected = connected;
    release();
  }

  private async setRefreshSniffActive(refreshSniffActive: boolean): Promise<void> {
    const release = await this._refreshSniffActiveMutex.acquire();
    this._refreshSniffActive = refreshSniffActive;
    release();
  }

  private async setRefreshHeaderActive(refreshHeaderActive: boolean): Promise<void> {
    const release = await this._refreshHeaderActiveMutex.acquire();
    this._refreshHeaderActive = refreshHeaderActive;
    release();
  }

  private async setRefreshMonitorProgressActive(refreshMonitorProgressActive: boolean): Promise<void> {
    const release = await this._refreshMonitorProgressActiveMutex.acquire();
    this._refreshMonitorProgressActive = refreshMonitorProgressActive;
    release();
  }

  private async showLeaderboard(): Promise<void> {
    if (!this._snorted) {
      this.snort();
      return;
    }

    if (this._gameMode === 'las') {
      this.displayLasLeaderboard();
    }
    else if (this._gameMode === 'sa') {
      //TODO
      showError(new Error('Score attack leaderboards are not yet available. Check back soon!'));
      //this.displaySaLeaderboard();
    }
  }

  private async displayLasLeaderboard(): Promise<void> {
    const scoresLas = await this.getScoresLas();

    if (scoresLas.length === 0) {
      // No scores found
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
      headerCell.style.fontFamily = "Roboto Mono, monospace";
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
    scoresLas.forEach((row: any) => {
      const dataRow = document.createElement('tr');

      // Populate data for each column
      let columnIndex = 0;
      columns.forEach((column) => {
        const dataCell = document.createElement('td');
        dataCell.style.fontFamily = "Roboto Mono, monospace";
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

      // Add the row to the table
      table.appendChild(dataRow);
    })
  }

  private async getScoresLas(rocksnifferData: any): Promise<any> {
    const authData = sessionStorage.getItem('auth_data');
    if (authData !== null) {
      const host = await window.api.getHost();
      const response = await post(host + '/api/data/get_scores_las.php', {
        auth_data: authData,
        song_key: this._rocksnifferData['songDetails']['songID'],
        psarc_hash: this._rocksnifferData['songDetails']['psarcFileHash'],
        arrangement: this._path
      });

      if ('error' in response) {
        throw new Error(response.error);
      }

      return response;
    }
  }

  private async snort(): Promise<void> {
    this._snort = true;
    const snortElement = document.getElementById('snort') as HTMLButtonElement;
    snortElement.disabled = true;
  }

  private async refreshSniff(): Promise<void> {
    const refreshSniffActive = await this.getRefreshSniffActive();
    if (refreshSniffActive === true) {
      return;
    }

    await this.setRefreshSniffActive(true);

    try {

      const release = await this._rocksnifferDataMutex.acquire();
      try {
        this._previousRocksnifferData = this._rocksnifferData;
        this._rocksnifferData = await this._rocksniffer.sniff();
        if (this._rocksnifferData === null) {
          throw new Error('Navigate to a song in Rocksmith to begin sniffing.');
        }
      }
      finally {
        release();
      }

      // Update the status
      const statusElement = document.getElementById('status') as HTMLElement;
      statusElement.innerText = 'Sniffing...';

      // Show connected state
      await this.setConnected(true);
      showExclusive('group1', 'connected');
    }
    catch (error) {
      await this.setConnected(false);
      showError(error);
    }

    await this.setRefreshSniffActive(false);
  }
  private async refreshHeaderData(): Promise<void> {
    const refreshHeaderActive = await this.getRefreshHeaderActive();
    if (refreshHeaderActive === true) {
      return;
    }

    await this.setRefreshHeaderActive(true);

    const connected = await this.getConnected();
    if (!connected) {
      await this.setRefreshHeaderActive(false);
      return;
    }

    try {
      const release = await this._rocksnifferDataMutex.acquire();
      const rocksnifferData = this._rocksnifferData;
      release();

      this.updateSongInfo(rocksnifferData);
      this.updateLiveFeed(rocksnifferData);
      this.updatePath(rocksnifferData);

      // Show header info
      const leaderboardHeaderElement = document.getElementById('leaderboard_header') as HTMLElement;
      leaderboardHeaderElement.style.display = 'block';
    }
    catch (error) {
      showError(error);
    }

    await this.setRefreshHeaderActive(false);
  }

  private async refreshMonitorProgress(): Promise<void> {
    if (this._refreshMonitorProgressActive === true) {
      return;
    }

    await this.setRefreshMonitorProgressActive(true);

    const connected = await this.getConnected();
    if (!connected) {
      await this.setRefreshMonitorProgressActive(false);
      return;
    }

    try {
      const release = await this._rocksnifferDataMutex.acquire();
      const rocksnifferData = this._rocksnifferData;
      const previousRocksnifferData = this._previousRocksnifferData;
      release();

      if (previousRocksnifferData === null) {
        await this.setRefreshMonitorProgressActive(false);
        return;
      }

      this.monitorProgress(rocksnifferData, previousRocksnifferData);
    }
    catch (error) {
      showError(error);
    }

    await this.setRefreshMonitorProgressActive(false);
  }

  private monitorProgress(rocksnifferData: any, previousRocksnifferData: any): void {
    const songTime = rocksnifferData['memoryReadout']['songTimer'];
    const previousSongTime = previousRocksnifferData['memoryReadout']['songTimer'];
    const previousSongLength = previousRocksnifferData['songDetails']['songLength'];

    // If song time is 0 we are not in a song
    // Reset values and return
    if (approxEqual(songTime, 0)) {

      // If we were just in a song, check if the score is verified. If it is record it!
      if (previousSongTime > 0) {

        // NOTE: "previous" values are used here because in nonstop play the current song data will be wrong
        // If the completion time is more than 5 seconds off from the song
        if (!approxEqual(previousSongTime, previousSongLength, Sniffer.songLengthTolerance)) {
          if (this._verifiedScore) {
            sussyError();
            this._verifiedScore = false;
          }
        }

        if (this._verifiedScore) {
          //TODO record verified score
        }
      }

      this._refreshCounter = 0;
      this._pauseTime = 0;
      this._verifiedScore = true;

      return;
    }
  }
  //   const songTime = this._rocksnifferData['memoryReadout']['songTimer'];
  //   const previousSongTime = this._previousRocksnifferData['memoryReadout']['songTimer'];
  //   const previousSongLength = this._previousRocksnifferData['songDetails']['songLength'];

  //   // If song time is 0 we are not in a song
  //   // Reset values and return
  //   if (approxEqual(songTime, 0)) {

  //     // If we were just in a song, check if the score is verified. If it is record it!
  //     if (previousSongTime > 0) {

  //       // NOTE: "previous" values are used here because in nonstop play the current song data will be wrong
  //       // If the completion time is more than 5 seconds off from the song
  //       if (!approxEqual(previousSongTime, previousSongLength, Sniffer.songLengthTolerance)) {
  //         if (this._verifiedScore) {
  //           sussyError();
  //           this._verifiedScore = false;
  //         }
  //       }

  //       if (this._verifiedScore) {
  //         //TODO record verified score
  //       }
  //     }

  //     this._refreshCounter = 0;
  //     this._pauseTime = 0;
  //     this._verifiedScore = true;
  //     return;
  //   }

  //   // Check if a song has started
  //   if (approxEqual(previousSongTime, 0) && songTime > 0) {

  //     // Synchronize the counter with the song start time
  //     this._refreshCounter = songTime * 1000 / Sniffer.refreshRate;
  //   }

  //   // Check if the song is paused (limited for verified scores)
  //   if (approxEqual(songTime, previousSongTime)) {
  //     this._pauseTime = songTime;

  //     // If the song was previously paused check if it was long enough ago to keep the score verified
  //     if (this._lastPauseTime > 0) {
  //       if (this._pauseTime - this._lastPauseTime < Sniffer.minPauseRate) {
  //         sussyError();
  //         this._verifiedScore = false;
  //       }
  //     }

  //     if (this._verifiedScore) {
  //       sussyWarning();
  //     }
  //   }

  //   // Check if the song was rewound (not allowed for verified scores)
  //   else if (songTime < previousSongTime) {
  //     if (this._verifiedScore) {
  //       sussyError();
  //       this._verifiedScore = false;
  //     }
  //   }

  //   // The song is no longer paused
  //   else {
  //     clearSussyWarning();
  //     this._lastPauseTime = this._pauseTime;
  //   }
  // }

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
    availablePaths.forEach((path) => {
      const option = document.createElement('option');
      option.text = path.name;
      option.value = path.name.toLowerCase();

      if (option.value === this._path) {
        option.selected = true;
      }

      pathElement.appendChild(option);

      // Also make a map of hashes to path name so we can use it later
      hashMap[path.hash] = path.name.toLowerCase();
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

  private async updateLeaderboard(): Promise<void> {
    //TODO
  }

//   private async refresh() {

//     // If already refreshing, return
//     if (this._refreshActive) {
//       return;
//     }

//     // Refresh starting
//     this._refreshActive = true;

//     try {
//       // Get Rocksmith and Rocksniffer data
//       this._rocksmithData = await this._rocksmith.getProfileData();
//       this._rocksnifferData = await this._rocksniffer.sniff();

//       showExclusive('group1', 'connected');
//     }
//     catch (error) {
//       showError(error);
//     }

//     this._refreshActive = false;
//   }
// }
}

// Gets all elements with the provided group class
// Shows all that have the provided name class
// Hides all that don't have the name class
function showExclusive(group: string, name: string): void {
  const elements = document.querySelectorAll('.' + group);
  elements.forEach((element) => {
    const htmlElement = element as HTMLElement;
    if (htmlElement.classList.contains(name)) {
      if (htmlElement.classList.contains('inline')) {
        htmlElement.style.display = 'inline-block';
      }
      else {
        htmlElement.style.display = 'block';
      }
    }
    else {
      htmlElement.style.display = 'none';
    }
  });
}

// Handles an error and displays it on screen
function showError(error: any): void {
  if (error instanceof Error) {
    const p = document.createElement('p');
    p.textContent = error.message;
    const errorElement = document.getElementById('error');

    if (errorElement !== null) {
      errorElement.innerHTML = '';
      errorElement.appendChild(p);
      showExclusive('group1', 'error');
    }
    else {
      console.error(error.message);
    }
  }
  else {
    throw error;
  }
}

function sussyWarning(): void {
  const sussyWarningElement = document.getElementById('sussy_warning') as HTMLElement;
  sussyWarningElement.style.display = 'block';
}

function clearSussyWarning(): void {
  const sussyWarningElement = document.getElementById('sussy_warning') as HTMLElement;
  sussyWarningElement.style.display = 'none';
}

function sussyError(): void {
  const sussyErrorElement = document.getElementById('sussy_error') as HTMLElement;
  sussyErrorElement.style.display = 'block';
}

async function main() {
  try {
    const sniffer = await Sniffer.create();
    sniffer.start();
  }
  catch (error) {
    showError(error);
  }
}

main();