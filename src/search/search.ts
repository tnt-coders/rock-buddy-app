import { post } from "../common/functions";
import { displayLASLeaderboard, displaySALeaderboard } from "../common/leaderboard";

const authData = JSON.parse(window.sessionStorage.getItem('auth_data') as any);

interface SongInfo {
    artist: string;
    title: string;
    album: string;
    year: string;
}

export class Search {
    private _input: string = "";
    private _page: number = 0;

    private readonly _searchBarElement = document.getElementById('search_bar') as HTMLInputElement;
    private readonly _leaderboardPopupElement = document.getElementById('leaderboard_popup') as HTMLElement;
    private readonly _closeLeaderboardPopupElement = document.getElementById('close_leaderboard_popup') as HTMLElement;
    private readonly _artistElement = document.getElementById('artist') as HTMLElement;
    private readonly _titleElement = document.getElementById('title') as HTMLElement;
    private readonly _albumElement = document.getElementById('album') as HTMLElement;
    private readonly _yearElement = document.getElementById('year') as HTMLElement;
    private readonly _chartElement = document.getElementById('chart') as HTMLSelectElement;

    constructor () {
        this._searchBarElement.addEventListener("keyup", (event) => {
            if (event.key === "Enter") {
                this._input = this._searchBarElement.value;
                this._page = 0;
                this.display();
            }
        });

        this._closeLeaderboardPopupElement.addEventListener("click", (event) => {
            this._leaderboardPopupElement.style.display = 'none';
        });

        // Add event listener for prevPage

        // Add event listener for nextPage
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
                await this.buildLeaderboardPopup(row['artist'], row['title'], row['album'], row['year']);
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

    private async buildLeaderboardPopup(artist: string, title: string, album: string, year: number) {
        const host = await window.api.getHost();
        const response = await post(host + '/api/data/get_song_data.php', {
            auth_data: authData,
            artist: artist,
            title: title,
            album: album,
            year: year
        });

        if ('error' in response) {
            window.api.error(response['error']);
            return;
        }

        // Update the song info
        this._artistElement.innerText = artist;
        this._titleElement.innerText = title;
        this._albumElement.innerText = album;
        this._yearElement.innerText = year.toString();

        let seenCharts: any = {};

        // Build available charts popup
        this._chartElement.innerHTML = '';
        let index = 0;
        response.forEach((chart: any) => {
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

            if (index === 0) {
                option.selected = true;
            }

            this._chartElement.appendChild(option);
            index++;
        });

        //displayLASLeaderboard(row['song_key'], row['psarc_hash'], preferredPath);
    }
}