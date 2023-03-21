import { Rocksmith } from './rocksmith';
import { Rocksniffer } from './rocksniffer';
import { UserData } from '../common/user_data';
import { approxEqual, durationString, post } from '../common/functions';

class Sniffer {
  // Refresh rate in milliseconds
  private static readonly refreshRate: number = 100; // milliseconds
  private static readonly snortRate: number = 10000; // milliseconds
  private static readonly songLengthTolerance: number = 5 // seconds (play time must be within 5 seconds of the length of the song for verified scores)
  private static readonly minPauseRate: number = 10 * 60; // seconds (only allow pausing once every 10 minutes for verified scores)

  private readonly _rocksmith: Rocksmith;
  private readonly _rocksniffer: Rocksniffer;

  // Used to prevent duplicate refreshing
  private _refreshActive: boolean = false;

  // Song data
  private _rocksmithData: any = null;
  private _rocksnifferData: any = null;
  private _previousRocksmithData: any = null;
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
    setInterval(this.refresh.bind(this), Sniffer.refreshRate);
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

  private async getScoresLas(): Promise<any> {
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

  private async monitorProgress(): Promise<void> {
    const songTime = this._rocksnifferData['memoryReadout']['songTimer'];
    const previousSongTime = this._previousRocksnifferData['memoryReadout']['songTimer'];
    const previousSongLength = this._previousRocksnifferData['songDetails']['songLength'];

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

    // Check if a song has started
    if (approxEqual(previousSongTime, 0) && songTime > 0) {

      // Synchronize the counter with the song start time
      this._refreshCounter = songTime * 1000 / Sniffer.refreshRate;
    }

    // Check if the song is paused (limited for verified scores)
    if (approxEqual(songTime, previousSongTime)) {
      this._pauseTime = songTime;

      // If the song was previously paused check if it was long enough ago to keep the score verified
      if (this._lastPauseTime > 0) {
        if (this._pauseTime - this._lastPauseTime < Sniffer.minPauseRate) {
          sussyError();
          this._verifiedScore = false;
        }
      }

      if (this._verifiedScore) {
        sussyWarning();
      }
    }

    // Check if the song was rewound (not allowed for verified scores)
    else if (songTime < previousSongTime) {
      if (this._verifiedScore) {
        sussyError();
        this._verifiedScore = false;
      }
    }

    // The song is no longer paused
    else {
      clearSussyWarning();
      this._lastPauseTime = this._pauseTime;
    }
  }

  private async updateSongInfo(): Promise<void> {
    // Update song info from Rocksniffer
    const albumArtElement = document.getElementById('album_art') as HTMLImageElement;
    const artistElement = document.getElementById('artist') as HTMLElement;
    const titleElement = document.getElementById('title') as HTMLElement;
    const albumElement = document.getElementById('album') as HTMLElement;
    const yearElement = document.getElementById('year') as HTMLElement;
    const versionElement = document.getElementById('version') as HTMLElement;
    const authorElement = document.getElementById('author') as HTMLElement;
    const leaderboardHeaderElement = document.getElementById('leaderboard_header') as HTMLElement;

    albumArtElement.src = 'data:image/jpeg;base64,' + this._rocksnifferData['songDetails']['albumArt'];
    artistElement.innerText = this._rocksnifferData['songDetails']['artistName'];
    titleElement.innerText = this._rocksnifferData['songDetails']['songName'];
    albumElement.innerText = this._rocksnifferData['songDetails']['albumName'];
    yearElement.innerText = this._rocksnifferData['songDetails']['albumYear'];
    versionElement.innerText = this._rocksnifferData['songDetails']['toolkit']['version'];
    authorElement.innerText = this._rocksnifferData['songDetails']['toolkit']['author'];
    leaderboardHeaderElement.style.display = 'block';
  }

  private async updateLiveFeed(): Promise<void> {
    const mode = this._rocksnifferData['memoryReadout']['mode'];
    const songTime = this._rocksnifferData['memoryReadout']['songTimer'];

    const liveFeedIconElement = document.getElementById('live_feed_icon') as HTMLElement;

    // If song time is greater than 0 we are in a song
    if (songTime > 0) {
      liveFeedIconElement.style.backgroundColor = 'green';

      // Mode 1 is learn a song
      if (mode === 1) {
        const statsLasElement = document.getElementById('stats_las') as HTMLElement;
        statsLasElement.style.display = 'block';

        const notesHit = this._rocksnifferData['memoryReadout']['noteData']['TotalNotesHit'];
        const totalNotes = this._rocksnifferData['memoryReadout']['noteData']['TotalNotes'];
        const accuracy = this._rocksnifferData['memoryReadout']['noteData']['Accuracy'];
        const streak = this._rocksnifferData['memoryReadout']['noteData']['CurrentHitStreak'];
        const highestStreak = this._rocksnifferData['memoryReadout']['noteData']['HighestHitStreak'];
        const songTimer = this._rocksnifferData['memoryReadout']['songTimer'];
        const songLength = this._rocksnifferData['songDetails']['songLength'];

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

  private async updatePath(): Promise<void> {
    //TODO
  }

  private async updateLeaderboard(): Promise<void> {
    //TODO
  }

  private async refresh() {

    // If already refreshing, return
    if (this._refreshActive) {
      return;
    }

    // Refresh starting
    this._refreshActive = true;

    // Get Rocksmith and Rocksniffer data
    this._rocksmithData = await this._rocksmith.getProfileData();
    this._rocksnifferData = await this._rocksniffer.sniff();

    if (this._rocksnifferData === null) {
      showError(new Error('Navigate to a song in Rocksmith to begin sniffing...'));
      this._refreshActive = false;
      return;
    }

    if (this._previousRocksnifferData !== null && this._previousRocksmithData !== null) {
      await this.monitorProgress();
    }

    // Allow these to execute in parallel for better performance
    const songInfoPromise = this.updateSongInfo();
    const liveFeedPromise = this.updateLiveFeed();
    const pathPromise = this.updatePath();
    const leaderboardPromise = this.updateLeaderboard();

    await songInfoPromise;
    await liveFeedPromise;
    await pathPromise;
    await leaderboardPromise;

    // Save Rocksmith and Rocksniffer data
    this._previousRocksmithData = this._rocksmithData;
    this._previousRocksnifferData = this._rocksnifferData;

    this._refreshActive = false;
  }
}

// Gets all elements with the provided group class
// Shows all that have the provided name class
// Hides all that don't have the name class
function showExclusive(group: string, name: string): void {
  const elements = document.querySelectorAll('.' + group);
  elements.forEach((element) => {
    const htmlElement = element as HTMLElement;
    if (htmlElement.classList.contains(name)) {
      htmlElement.style.display = 'block';
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