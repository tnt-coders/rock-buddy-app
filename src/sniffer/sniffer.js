'use strict';

// User ID for the current session
const userId = JSON.parse(sessionStorage.getItem('auth_data'))['user_id'];

// Refresh rate (milliseconds)
const g_refreshRate = 100;

// Global Rocksniffer object
let g_rockSniffer = null;

// If the page is starting up we want to immediately pull data
let startup = true;

// Variables to control polling of Rocksniffer and the Rock Buddy server
const pollRate = 1000; // Rocksniffer poll rate
let pollTime = 0; // Add delay to sync data to not overwhelm the server
let requestActive = false;
let currentSong = null;
let sync = true;
let countDown = 10;

// Allow the user to snort data immediately if they wish
const snortRate = 10000; // Rock Buddy server poll rate
let snort = false;
let lastSnort = snortRate; // Allow the user to snort immediately
let snorted = false; // Keep track if a snort has occurred for the current song

// TODO: store these so they persist between sessions
let selectedGameMode = 'las';
let selectedPath = null;
let selectedDifficulty = 'hard';

// Store data globally so we can react to combo box changes quickly
let rocksnifferData = null;
let previousRocksnifferData = null;
let songData = null;
let previousSongData = null;

async function refresh() {
  const snifferData = await g_rockSniffer.sniff();
  if (snifferData === null) {
    return;
  }

  updateSongData(snifferData);

  updateLiveFeedData(snifferData);

  updatePath(snifferData);
}

function updateSongData(snifferData) {
  document.getElementById('album_art').src = 'data:image/jpeg;base64,' + snifferData['songDetails']['albumArt'];
  document.getElementById('artist').innerText = snifferData['songDetails']['artistName'];
  document.getElementById('title').innerText = snifferData['songDetails']['songName'];
  document.getElementById('album').innerText = snifferData['songDetails']['albumName'];
  document.getElementById('year').innerText = snifferData['songDetails']['albumYear'];
  document.getElementById('version').innerText = snifferData['songDetails']['toolkit']['version'];
  document.getElementById('author').innerText = snifferData['songDetails']['toolkit']['author'];
  document.getElementById('leaderboard_header').style.display = 'block';
}

function updateLiveFeedData(snifferData) {
  const gameStage = snifferData['memoryReadout']['gameStage'];

  // If a song is active in learn a song, display live feed data
  if (selectedGameMode === 'las'
    && (gameStage === 'las_game' || gameStage === 'nonstopplaygame')) {

    const notesHit = snifferData['memoryReadout']['noteData']['TotalNotesHit'];
    const totalNotes = snifferData['memoryReadout']['noteData']['TotalNotes'];
    const accuracy = snifferData['memoryReadout']['noteData']['Accuracy'];
    const streak = snifferData['memoryReadout']['noteData']['CurrentHitStreak'];
    const highestStreak = snifferData['memoryReadout']['noteData']['HighestHitStreak'];
    const songTimer = snifferData['memoryReadout']['songTimer'];
    const songLength = snifferData['songDetails']['songLength'];

    document.getElementById('stats_las').style.display = 'block';
    document.getElementById('live_feed_icon').style.backgroundColor = 'green';
    document.getElementById('notes_hit').innerText = notesHit;
    document.getElementById('total_notes').innerText = totalNotes;
    document.getElementById('accuracy').innerText = accuracy.toFixed(2) + '%';
    document.getElementById('streak').innerText = streak;
    document.getElementById('highest_streak').innerText = highestStreak;
    document.getElementById('song_timer').innerText = durationString(songTimer);
    document.getElementById('song_length').innerText = durationString(songLength);
  }
  else {
    document.getElementById('live_feed_icon').style.backgroundColor = 'red';
  }
}

function updatePath(snifferData) {
  const gameStage = snifferData['memoryReadout']['gameStage'];

  // If a song is active in learn a song, update the path to the current path
  if (selectedGameMode === 'las'
    && (gameStage === 'las_game' || gameStage === 'nonstopplaygame')) {

    // Follow the correct arrangment with Rocksniffer
    const arrangementHash = snifferData['memoryReadout']['arrangementID'];
    if (songData !== null) {

      // It takes a second for the arrangement ID to update so check that it exists for the current song
      if (songData['arrangements'].hasOwnProperty(arrangementHash)) {
        const arrangementName = songData['arrangements'][arrangementHash]['name'];

        const pathComboBox = document.querySelector('#path');
        if (pathComboBox.value !== arrangementName.toLowerCase()) {
          pathComboBox.value = arrangementName.toLowerCase();

          let event = new Event('change');
          pathComboBox.dispatchEvent(event);
        }
      }
    }
  }
}

async function updateLeaderboardData() {
  pollTime += pollRate;
  lastSnort += pollRate;

  if (requestActive) {
    console.warn('A request is already active, returning.');
    return;
  }

  requestActive = true;

  rocksnifferData = await g_rockSniffer.sniff();
  if (rocksnifferData === null) {
    requestActive = false;
  }
  else if (rocksnifferData['success']) {
    showClass('ready');

    if (snort === false && lastSnort >= snortRate) {
      document.getElementById('snort').disabled = false;
    }

    // If user data file is updated, trigger a snort
    const steamUserDataPath = sessionStorage.getItem('steam_user_data_path');
    const steamProfile = sessionStorage.getItem('steam_profile');
    const rocksmithProfile = sessionStorage.getItem('rocksmith_profile');
    const newData = await api.checkForNewRocksmithProfileData(steamUserDataPath, steamProfile, rocksmithProfile);

    // If we are switching songs, don't keep syncing
    let previousSong = false;
    if (rocksnifferData['songDetails']['songID'] !== currentSong) {
      countDown = 10; // Reset countdown on song change

      // When the song changes we are not in a song
      document.getElementById('live_feed_icon').style.backgroundColor = 'red';
      document.getElementById('stats_las').style.display = 'none';

      sync = true;
      pollTime = 0;
      lastSnort = snortRate; // Allow user to snort immediately
      snorted = false;

      // If new data is detected right as a song is switching, snort the previous song data
      if (newData && previousSongData !== null) {
        await syncData(true);
        requestActive = false;
        return;
      }
      else {
        currentSong = rocksnifferData['songDetails']['songID'];
      }
    }

    // If we have not switched songs for 10 seconds perform a sync and display the data
    if (startup === true || newData === true || snort === true || (pollTime >= snortRate && sync === true)) {
      startup = false; // We have started now so set to false
      sync = false; // Don't keep syncing indefinitely
      snort = false; // Don't keep snorting indefinitely
      document.getElementById('snort').disabled = true;
      lastSnort = 0;

      const leaderboardData = document.getElementById('leaderboard_data');
      leaderboardData.innerHTML = '';
      const snortText = document.createElement('em');
      snortText.textContent = '*Snort*';
      leaderboardData.appendChild(snortText);
      leaderboardData.style.display = 'block';

      selectedPath = await getPreferredPath();

      $('div.status').html('Snorting data...');

      await syncData();
      snorted = true;
      countDown = 10; // Reset countdown

      await displayLeaderboardData();
    }
    else if (pollTime < snortRate && sync === true) {
      const leaderboardData = document.getElementById('leaderboard_data');
      leaderboardData.innerHTML = '';
      leaderboardData.appendChild(document.createTextNode('Snorting data in ' + countDown--));
      leaderboardData.style.display = 'block';
    }

    previousRocksnifferData = rocksnifferData;

    $('div.status').html('Sniffing...');
  }
  else {
    showClass('connected');
  }

  requestActive = false;
}

async function snortData() {
  snort = true;
  document.getElementById('snort').disabled = true;
}

async function syncWithServer(songData) {
  const authData = JSON.parse(sessionStorage.getItem('auth_data'));

  const host = await api.getHost();
  const response = await post(host + '/api/data/sniffer_sync.php', {
    auth_data: authData,
    song_data: songData
  });

  if ('error' in response) {
    api.error(response['error']);
    return null;
  }

  return response;
}

async function syncData(previousSong = false) {
  let snifferData = null;
  if (previousSong) {
    snifferData = previousRocksnifferData;
  }
  else {
    snifferData = rocksnifferData;
  }

  const rocksmithData = await getRocksmithProfileData();

  songData = {};

  // Get basic song metadata
  songData['song_key'] = snifferData['songDetails']['songID'];
  songData['psarc_hash'] = snifferData['songDetails']['psarcFileHash'];
  songData['title'] = snifferData['songDetails']['songName'];
  songData['artist'] = snifferData['songDetails']['artistName'];
  songData['album'] = snifferData['songDetails']['albumName'];
  songData['year'] = snifferData['songDetails']['albumYear'];

  // Loop through each arrangement
  songData['arrangements'] = {};

  // Get available paths for song
  let availablePaths = getAvailablePaths(snifferData['songDetails']['arrangements']);
  let availablePathNames = availablePaths.map((path) => {
    return path.name.toLowerCase();
  });

  snifferData['songDetails']['arrangements'].forEach((arrangement) => {
    const hash = arrangement['arrangementID'];

    let arrangementData = {};

    let path = null;
    availablePaths.forEach((availablePath) => {
      if (availablePath.hash === hash) {
        path = availablePath;
      }
    });

    // This should never happen but add check just in case
    if (path === null) {
      console.error('Invalid path encountered: ' + hash);
      return;
    }

    arrangementData['name'] = path['name'];
    arrangementData['hash'] = hash;

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

    songData['arrangements'][hash] = arrangementData;
  });

  // If the selected path doesn't exist for this song, update it to one that does
  if (!availablePathNames.includes(selectedPath)) {
    selectedPath = availablePathNames[0];
  }

  // Build the paths combo box with the available options
  const pathComboBox = document.querySelector('#path');
  pathComboBox.innerHTML = '';
  availablePaths.forEach((path) => {
    const option = document.createElement('option');
    option.text = path['name'];
    option.value = path['name'].toLowerCase();

    if (option.value === selectedPath) {
      option.selected = true;
    }

    pathComboBox.appendChild(option);
  });

  await syncWithServer(songData);

  if (!previousSong) {
    previousSongData = songData;
  }
}

async function getScoresLAS(snifferData) {
  const authData = JSON.parse(sessionStorage.getItem('auth_data'));

  const host = await api.getHost();
  const response = await post(host + '/api/data/get_scores_las.php', {
    auth_data: authData,
    song_key: snifferData['songDetails']['songID'],
    psarc_hash: snifferData['songDetails']['psarcFileHash'],
    arrangement: selectedPath
  });

  if ('error' in response) {
    api.error(response['error']);
    return null;
  }

  return response;
}

async function displayLeaderboardData() {

  // If snorting has not happened for the current song yet force a snort
  // after the snort displayData will be called again by the refresh
  if (!snorted) {
    snortData();
    return;
  }

  const leaderboardData = document.getElementById('leaderboard_data');
  if (selectedGameMode === 'las') {
    const scoresLAS = await getScoresLAS(rocksnifferData);
    if (scoresLAS === null) {
      // An error has occurred
      return;
    }

    if (scoresLAS.length === 0) {
      leaderboardData.innerHTML = '';
      leaderboardData.appendChild(document.createTextNode('No scores found.'));
      leaderboardData.style.display = 'block';
      return;
    }

    // Create table element
    const table = document.createElement('table');
    table.border = 1;
    table.style.width = '100%';

    // Create header row
    const headerRow = document.createElement('tr');

    const headers = ['Rank', 'Username', 'Last Played', 'Play Count', 'Streak', 'Mastery'];
    headers.forEach((header) => {
      const headerCell = document.createElement('th');
      headerCell.style.fontFamily = "Roboto Mono, monospace";
      headerCell.appendChild(document.createTextNode(header));
      headerRow.appendChild(headerCell);
    })

    table.appendChild(headerRow);

    // Create data rows
    const columns = ['rank', 'username', 'last_played', 'play_count', 'streak', 'mastery'];
    const columnsAlign = ['right', 'left', 'left', 'right', 'right', 'right'];

    // Keep track of rank
    let rank = 1;
    scoresLAS.forEach((row) => {
      const dataRow = document.createElement('tr');

      // Populate data for each column
      let columnIndex = 0;
      columns.forEach((column) => {
        const dataCell = document.createElement('td');
        dataCell.style.fontFamily = "Roboto Mono, monospace";
        if (column === 'rank') {
          dataCell.appendChild(document.createTextNode(rank++));
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

      // Add the row to the table
      table.appendChild(dataRow);
    })

    leaderboardData.innerHTML = '';
    leaderboardData.appendChild(table);
    leaderboardData.style.display = 'block';
  }
  else {
    const data = document.createElement('div');
    data.appendChild(document.createTextNode('Selected game mode not yet supported. Check back soon!'));

    leaderboardData.innerHTML = '';
    leaderboardData.appendChild(data);
    leaderboardData.style.display = 'block';
  }
}

async function checkForNewRocksmithProfileData() {
  const steamUserDataPath = sessionStorage.getItem('steam_user_data_path');
  const steamProfile = sessionStorage.getItem('steam_profile');
  const rocksmithProfile = sessionStorage.getItem('rocksmith_profile');

  return await api.checkForNewRocksmithProfileData(steamUserDataPath, steamProfile, rocksmithProfile);
}

async function getRocksmithProfileData() {
  const steamUserDataPath = sessionStorage.getItem('steam_user_data_path');
  const steamProfile = sessionStorage.getItem('steam_profile');
  const rocksmithProfile = sessionStorage.getItem('rocksmith_profile');

  return await api.getRocksmithProfileData(steamUserDataPath, steamProfile, rocksmithProfile);
}

async function showClass(className) {
  const classNames = {
    loading: document.getElementsByClassName('loading'),
    error: document.getElementsByClassName('error'),
    waiting: document.getElementsByClassName('waiting'),
    connected: document.getElementsByClassName('connected'),
    ready: document.getElementsByClassName('ready')
  };

  const classNameKeys = Object.keys(classNames);
  classNameKeys.forEach((c) => {
    if (className === c) {
      for (let i = 0; i < classNames[c].length; i++) {
        classNames[c][i].style.display = 'block';
      }
    }
    else {
      for (let i = 0; i < classNames[c].length; i++) {
        classNames[c][i].style.display = 'none';
      }
    }
  });
}

async function connectToRocksmith() {
  let steamUserDataPath = sessionStorage.getItem('steam_user_data_path');
  let steamProfile = sessionStorage.getItem('steam_profile');
  let rocksmithProfile = sessionStorage.getItem('rocksmith_profile');

  if (steamUserDataPath === null || steamProfile === null || rocksmithProfile === null) {
    steamUserDataPath = await api.storeGet('user_data.' + userId + '.steam_user_data_path');
    steamProfile = await api.storeGet('user_data.' + userId + '.steam_profile');
    rocksmithProfile = await api.storeGet('user_data.' + userId + '.rocksmith_profile');

    if (steamUserDataPath === null || steamProfile === null || rocksmithProfile === null) {
      document.getElementById('error').innerHTML = '<p>Could not find Rocksmith user data. Check that your config settings are correct.</p>';
      showClass('error');
      return false;
    }

    sessionStorage.setItem('steam_user_data_path', steamUserDataPath);
    sessionStorage.setItem('steam_profile', steamProfile);
    sessionStorage.setItem('rocksmith_profile', rocksmithProfile);
  }

  return true;
}

async function getPreferredPath() {
  let preferredPath = sessionStorage.getItem('preferred_path');
  if (preferredPath === null) {
    preferredPath = await api.storeGet('user_data.' + userId + '.preferred_path');

    if (preferredPath === null) {
      preferredPath = 'lead';
    }

    sessionStorage.setItem('preferred_path', preferredPath);
  }

  return preferredPath;
}

async function main() {
  const rocksmithConnected = await connectToRocksmith();

  // Connect to Rocksniffer
  const rocksnifferPath = await api.storeGet('user_data.' + userId + '.rocksniffer_path');
  g_rockSniffer = new Rocksniffer(rocksnifferPath);

  while (!g_rockSniffer.connected()) {
    try {
      await g_rockSniffer.connect();
      showClass('connected');
    }
    catch (error) {
      if (error.message === 'Failed to connect to Rocksniffer.') {
        showClass('waiting');
      }
      else {
        document.getElementById('error').innerHTML = '<p>' + error.message + '</p>';
        showClass('error');
      }

      await sleep(1000);
    }
  }

  // Setup combo boxes
  const gameModeComboBox = document.querySelector('#game_mode');

  gameModeComboBox.addEventListener('change', async () => {
    const selectedOption = gameModeComboBox.options[gameModeComboBox.selectedIndex];
    selectedGameMode = selectedOption.value;

    if (selectedGameMode === 'las') {
      document.getElementById('score_attack').style.display = 'none';
    }
    else if (selectedGameMode == 'sa') {
      document.getElementById('stats_las').style.display = 'none';
      document.getElementById('score_attack').style.display = 'block';
    }

    // Update the display (keep things feeling responsive)
    await displayLeaderboardData();
  });

  const pathComboBox = document.querySelector('#path');
  pathComboBox.addEventListener('change', async () => {
    const selectedOption = pathComboBox.options[pathComboBox.selectedIndex];
    selectedPath = selectedOption.value;

    // Update the display (keep things feeling responsive)
    await displayLeaderboardData();
  });

  const difficultyComboBox = document.querySelector('#difficulty');
  difficultyComboBox.addEventListener('change', async () => {
    const selectedOption = difficultyComboBox.options[difficultyComboBox.selectedIndex];
    selectedDifficulty = selectedOption.value;

    // Update the display (keep things feeling responsive)
    await displayLeaderboardData();
  });

  if (rocksmithConnected) {
    setInterval(refresh, g_refreshRate);

    setInterval(updateLeaderboardData, pollRate);
  }
}

main();