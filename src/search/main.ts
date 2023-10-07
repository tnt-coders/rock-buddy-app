import { getVersion, post } from "../common/functions";
import { displayLASLeaderboard, displaySALeaderboard } from "../common/leaderboard";

async function search(input: string) {
    const authData = JSON.parse(window.sessionStorage.getItem('auth_data') as any);

    const host = await window.api.getHost();
    const response = await post(host + '/api/data/search.php', {
        auth_data: authData,
        input: input,
    });

    if ('error' in response) {
        window.api.error(response['error']);
        return;
    }

    console.log(response);

    // Create the table element
    const table = document.createElement('table');
    table.classList.add('table');
    table.style.width = '100%';

    // Create the header row
    const headerSection = document.createElement('thead');
    const headerRow = document.createElement('tr');
    const headers = ['Artist', 'Title', 'Album', 'Year', 'Author', 'Version'];
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
    const columns = ['artist', 'title', 'album', 'year', 'author', 'version'];
    const columnsAlign = ['left', 'left', 'left', 'right', 'left', 'right'];

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
            dataCell.style.maxWidth = '170px';
            dataCell.title = row[column];
            dataCell.appendChild(document.createTextNode(row[column]));
            dataCell.style.textAlign = columnsAlign[columnIndex++];
            dataRow.appendChild(dataCell);
        });

        dataRow.addEventListener("click", (event) => {
            displayLASLeaderboard(row['song_key'], row['psarc_hash'], preferredPath);
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

async function main() {
    const version = await getVersion();
    document.title += ' v' + version;

    const searchBarElement = document.getElementById('search_bar') as HTMLInputElement;
    searchBarElement.addEventListener("keyup", (event) => {
        if (event.key === "Enter") {
            search(searchBarElement.value);
        }
    });
}

main();