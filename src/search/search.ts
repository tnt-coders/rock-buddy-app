import { post, sortPaths } from "../common/functions";
import { displayLASLeaderboard, displaySALeaderboard } from "../common/leaderboard";
import { UserData } from '../common/user_data';

const authData = JSON.parse(window.sessionStorage.getItem('auth_data') as any);

interface SongInfo {
    artist: string;
    title: string;
    album: string;
    year: string;
}

export class Search {
    private _input: string = '';
    private _page: number = 0;

    private _artist: string = '';
    private _title: string = '';
    private _album: string = '';
    private _year: number = 0;
    private _charts: any = null;
    private _chartIndex: number = 0;
    private _path: string = 'lead';
    private _gameMode: string = 'las';
    private _difficulty: string = 'hard';

    private readonly _searchBarElement = document.getElementById('search_bar') as HTMLInputElement;
    private readonly _leaderboardPopupElement = document.getElementById('leaderboard_popup') as HTMLElement;
    private readonly _closeLeaderboardPopupElement = document.getElementById('close_leaderboard_popup') as HTMLElement;
    private readonly _artistElement = document.getElementById('artist') as HTMLElement;
    private readonly _titleElement = document.getElementById('title') as HTMLElement;
    private readonly _albumElement = document.getElementById('album') as HTMLElement;
    private readonly _yearElement = document.getElementById('year') as HTMLElement;
    private readonly _chartElement = document.getElementById('chart') as HTMLSelectElement;
    private readonly _pathElement = document.getElementById('path') as HTMLSelectElement;
    private readonly _gameModeElement = document.getElementById('game_mode') as HTMLSelectElement;
    private readonly _scoreAttackElement = document.getElementById('score_attack') as HTMLElement;
    private readonly _difficultyElement = document.getElementById('difficulty') as HTMLSelectElement;

    constructor () {
        // Setup search bar
        this._searchBarElement.addEventListener("keyup", (event) => {
            if (event.key === "Enter") {
                this._input = this._searchBarElement.value;
                this._page = 0;
                this.display();
            }
        });

        // Setup close button for leaderboard popup
        this._closeLeaderboardPopupElement.addEventListener("click", (event) => {
            this._leaderboardPopupElement.style.display = 'none';
        });

        // Setup charts combo box
        this._chartElement.addEventListener('change', async() => {
            const selectedOption = this._chartElement.options[this._chartElement.selectedIndex];
            this._chartIndex = parseInt(selectedOption.value);

            this.displayLeaderboardPopup();
        });

        // Setup game mode combo box
        this._gameModeElement.addEventListener('change', async () => {
            const selectedOption = this._gameModeElement.options[this._gameModeElement.selectedIndex];
            this._gameMode = selectedOption.value;

            if (this._gameMode === 'las') {
                this._scoreAttackElement.style.display = 'none';
            }
            else if (this._gameMode === 'sa') {
                this._scoreAttackElement.style.display = 'block';
            }

            // Update the display
            this.displayLeaderboardPopup();
        });

        // Setup path combo box
        this._pathElement.addEventListener('change', async () => {
            const selectedOption = this._pathElement.options[this._pathElement.selectedIndex];
            this._path = selectedOption.value;

            // Update the display
            this.displayLeaderboardPopup();
        });

        // Setup difficulty combo box
        this._difficultyElement.addEventListener('change', async () => {
            const selectedOption = this._difficultyElement.options[this._difficultyElement.selectedIndex];
            this._difficulty = selectedOption.value;

            // Update the display
            this.displayLeaderboardPopup();
        });

        // Add prevPage

        // Add nextPage
    }

    private async display() {
        const host = await window.api.getHost();
        const response = await post(host + '/api/data/search.php', {
            auth_data: authData,
            input: this._input,
            page: this._page
        });

        if ('error' in response) {
            window.api.error(response['error']);
            return;
        }

        // Create the table element
        const table = document.createElement('table');
        table.classList.add('table');
        table.style.width = '100%';

        // Create the header row
        const headerSection = document.createElement('thead');
        const headerRow = document.createElement('tr');
        const headers = ['Artist', 'Title', 'Album', 'Year'];
        headers.forEach((header) => {
            const headerCell = document.createElement('th');
            headerCell.style.fontFamily = 'Roboto Mono, monospace';
            headerCell.appendChild(document.createTextNode(header));
            headerRow.appendChild(headerCell);
        });

        headerSection.appendChild(headerRow);
        table.appendChild(headerSection);

        const bodySection = document.createElement('tbody');

        // Create data rows
        const columns = ['artist', 'title', 'album', 'year'];
        const columnsAlign = ['left', 'left', 'left', 'right'];

        // Build each row
        response.forEach((row: any) => {
            const dataRow = document.createElement('tr');

            // Populate data for each column
            let columnIndex = 0;
            columns.forEach((column) => {
                const dataCell = document.createElement('td');
                dataCell.style.fontFamily = 'Roboto Mono, monospace';
                dataCell.style.paddingLeft = '5px';
                dataCell.style.paddingRight = '5px';
                dataCell.style.whiteSpace = 'nowrap';
                dataCell.style.overflow = 'hidden';
                dataCell.style.textOverflow = 'ellipsis';
                dataCell.style.maxWidth = '200px';
                dataCell.title = row[column];
                dataCell.appendChild(document.createTextNode(row[column]));
                dataCell.style.textAlign = columnsAlign[columnIndex++];
                dataRow.appendChild(dataCell);
            });

            dataRow.addEventListener("click", async (event) => {
                this._artist = row['artist'];
                this._title = row['title'];
                this._album = row['album'];
                this._year = row['year'];

                // Reset chart index
                this._chartIndex = 0;

                // Set path to preferred path to start
                const preferredPath = await UserData.get('preferred_path');
                if (preferredPath !== null) {
                    this._path = preferredPath;
                }

                await this.initLeaderboardPopup();
                await this.displayLeaderboardPopup();
                this._leaderboardPopupElement.style.display = 'block';
            });

            // Add the row to the table
            bodySection.appendChild(dataRow);
        });

        table.appendChild(bodySection);

        // Get the parent element
        const leaderboardElement = document.getElementById('search_results') as HTMLElement;
        leaderboardElement.innerHTML = '';
        leaderboardElement.appendChild(table);
    }

    private async initLeaderboardPopup() {
        // Update the song info
        this._artistElement.innerText = this._artist;
        this._titleElement.innerText = this._title;
        this._albumElement.innerText = this._album;
        this._yearElement.innerText = this._year.toString();

        // Get avialable charts
        const host = await window.api.getHost();
        const charts = await post(host + '/api/data/get_available_charts.php', {
            auth_data: authData,
            artist: this._artist,
            title: this._title,
            album: this._album,
            year: this._year
        });

        if ('error' in charts) {
            window.api.error(charts['error']);
            return;
        }

        this._charts = charts;

        let seenCharts: any = {};

        // Build available charts popup
        this._chartElement.innerHTML = '';
        let index = 0;
        this._charts.forEach((chart: any) => {
            const entry = 'Version ' + chart['version'] + ' - ' + chart['author'];
            const option = document.createElement('option');

            if (seenCharts.hasOwnProperty(entry)) {
                seenCharts[entry]++;
                option.text = entry + ' (' + seenCharts[entry] + ')';
            }
            else {
                option.text = entry;
                seenCharts[entry] = 0;
            }
            
            option.value = index.toString();

            if (index === this._chartIndex) {
                option.selected = true;
            }

            this._chartElement.appendChild(option);
            index++;
        });

        const availablePaths = await post(host + '/api/data/get_paths_from_psarc_hash.php', {
            auth_data: authData,
            psarc_hash: this._charts[this._chartIndex]['psarc_hash']
        });

        const sortedPaths = sortPaths(availablePaths);
        console.log(sortedPaths);

        // Update the path combo box with available paths
        this._pathElement.innerHTML = '';
        sortedPaths.forEach((path: string) => {
            const option = document.createElement('option');
            option.text = path;
            option.value = path.toLowerCase();

            if (option.value === this._path) {
                option.selected = true;
            }

            this._pathElement.appendChild(option);
        });
    }

    private async displayLeaderboardPopup() {
        const selectedChart = this._charts[this._chartIndex];

        if (this._gameMode === 'las') {
            await displayLASLeaderboard(selectedChart['song_key'], selectedChart['psarc_hash'], this._path);
        }
        else if (this._gameMode === 'sa') {
            await displaySALeaderboard(selectedChart['song_key'], selectedChart['psarc_hash'], this._path, this._difficulty);
        }
    }
}