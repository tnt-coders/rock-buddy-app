import { post } from "../common/functions";
import { displayLASLeaderboard, displaySALeaderboard } from "../common/leaderboard";

interface SongInfo {
    artist: string;
    title: string;
    album: string;
    year: string;
    version: string;
    author: string;
}

export class Search {
    private _input: string = "";
    private _page: number = 0;

    constructor () {
        const searchBarElement = document.getElementById('search_bar') as HTMLInputElement;
        searchBarElement.addEventListener("keyup", (event) => {
            if (event.key === "Enter") {
                this._input = searchBarElement.value;
                this._page = 0;
                this.display();
            }
        });

        // Add event listener for prevPage

        // Add event listener for nextPage
    }

    private updateSongInfo(songInfo: SongInfo): void {
        const artistElement = document.getElementById('artist') as HTMLElement;
        const titleElement = document.getElementById('title') as HTMLElement;
        const albumElement = document.getElementById('album') as HTMLElement;
        const yearElement = document.getElementById('year') as HTMLElement;
        const versionElement = document.getElementById('version') as HTMLElement;
        const authorElement = document.getElementById('author') as HTMLElement;

        artistElement.innerText = songInfo.artist;
        titleElement.innerText = songInfo.title;
        albumElement.innerText = songInfo.album;
        yearElement.innerText = songInfo.year;
        versionElement.innerText = songInfo.version;
        authorElement.innerText = songInfo.author;
    }

    private async display() {
        const authData = JSON.parse(window.sessionStorage.getItem('auth_data') as any);

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

        // Get leaderboard popup element outside loop for efficiency
        const leaderboardPopupElement = document.getElementById('leaderboard_popup') as HTMLElement;
        const closeLeaderboardPopupElement = document.getElementById('close_leaderboard_popup') as HTMLElement;
        const preferredPath = await window.api.storeGet('user_data.' + authData['user_id'] + '.preferred_path') as string
        closeLeaderboardPopupElement.addEventListener("click", (event) => {
            leaderboardPopupElement.style.display = 'none';
        });

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

            dataRow.addEventListener("click", (event) => {
                const songInfo : SongInfo = {
                    artist: row['artist'],
                    title: row['title'],
                    album: row['album'],
                    year: row['year'],
                    version: "Unknown",
                    author: "Unknown"
                };

                this.updateSongInfo(songInfo);
                //displayLASLeaderboard(row['song_key'], row['psarc_hash'], preferredPath);
                leaderboardPopupElement.style.display = 'block';
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
}