import { approxEqual, post } from "./functions";

async function getScoresLAS(song_key: string, psarc_hash: string, arrangement: string): Promise<any> {
    const authData = JSON.parse(window.sessionStorage.getItem('auth_data') as any);

    const host = await window.api.getHost();
    const response = await post(host + '/api/data/get_scores_las.php', {
        auth_data: authData,
        song_key: song_key,
        psarc_hash: psarc_hash,
        arrangement: arrangement
    });

    if ('error' in response) {
        window.api.error(response['error']);
        return null;
    }

    return response;
}

async function getScoresSA(song_key: string, psarc_hash: string, arrangement: string, difficulty: string): Promise<any> {
    const authData = JSON.parse(window.sessionStorage.getItem('auth_data') as any);

    const host = await window.api.getHost();
    const response = await post(host + '/api/data/get_scores_sa.php', {
        auth_data: authData,
        song_key: song_key,
        psarc_hash: psarc_hash,
        arrangement: arrangement,
        difficulty: difficulty
    });

    if ('error' in response) {
        window.api.error(response['error']);
        return null;
    }

    return response;
}

export async function displayLASLeaderboard(song_key: string, psarc_hash: string, arrangement: string): Promise<void> {
    const authData = JSON.parse(window.sessionStorage.getItem('auth_data') as any);

    const leaderboardDataElement = document.getElementById('leaderboard_data') as HTMLElement;

    const scores = await getScoresLAS(song_key, psarc_hash, arrangement);

    // If scores are null we ran into an error that should already be displayed
    if (scores === null) {
        return;
    }

    if (scores.length === 0) {
        const message = document.createElement('p');
        message.innerHTML = 'And this is where I would put my scores... <em>IF I HAD ONE!</em>';
        leaderboardDataElement.innerHTML = '';
        leaderboardDataElement.appendChild(message);
        return;
    }

    // Create the table element
    const table = document.createElement('table');
    table.classList.add('leaderboard-data');
    table.style.width = '100%';

    // Create the header row
    const headerSection = document.createElement('thead');
    const headerRow = document.createElement('tr');
    const headers = ['Rank', 'Username', 'Last Played', 'Play Count', 'Streak', 'Mastery'];
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
    const columns = ['rank', 'username', 'last_played', 'play_count', 'streak', 'mastery'];
    const columnsAlign = ['right', 'left', 'left', 'right', 'right', 'right'];

    // Keep track of rank
    let rank = 0;
    let lastVerified: boolean | null = null;
    let lastMastery: number | null = null;
    let lastStreak: number | null = null;
    let tieCount = 0;

    scores.forEach((row: any) => {
        const dataRow = document.createElement('tr');

        // Handle the situation where a tie occurs
        let tie = false;
        if (lastVerified !== null && lastMastery !== null && lastStreak !== null) {
            if (row['verified'] === lastVerified && approxEqual(row['mastery'], lastMastery) && approxEqual(row['streak'], lastStreak)) {
                tie = true;
                tieCount++;
            }
        }
        if (!tie) {
            rank += (tieCount + 1);
            tieCount = 0;
        }

        // Populate data for each column
        let columnIndex = 0;
        columns.forEach((column) => {
            const dataCell = document.createElement('td');
            dataCell.style.fontFamily = 'Roboto Mono, monospace';
            dataCell.style.paddingLeft = '5px';
            dataCell.style.paddingRight = '5px';
            if (column === 'rank') {
                dataCell.appendChild(document.createTextNode(rank.toString()));
                dataCell.style.textAlign = columnsAlign[columnIndex];
            }
            else if (column === 'username') {
                const usernameElement = document.createElement('div');
                usernameElement.style.display = 'flex';
                usernameElement.style.flexDirection = 'row';

                if (row['king']) {
                    const kingElement = document.createElement('img');
                    kingElement.src = `./../../images/crown.png`;
                    kingElement.width = 15;
                    kingElement.height = 15;
                    kingElement.style.alignSelf = 'center';
                    kingElement.style.marginRight = '5px';
                    usernameElement.appendChild(kingElement);
                }

                const usernameText = document.createTextNode(row[column]);
                usernameElement.appendChild(usernameText);

                dataCell.appendChild(usernameElement);
                dataCell.style.textAlign = columnsAlign[columnIndex];
            }
            else if (column === 'last_played' || column === 'play_count') {
                if (row[column] === null) {
                    dataCell.appendChild(document.createTextNode('Unknown'));
                    dataCell.style.textAlign = 'left';
                }
                else {
                    dataCell.appendChild(document.createTextNode(row[column]));
                    dataCell.style.textAlign = columnsAlign[columnIndex];
                }
            }
            else if (column === 'mastery') {
                const masteryElement = document.createElement('div');
                masteryElement.style.display = 'flex';
                masteryElement.style.flexDirection = 'row';
                
                if (row['verified']) {
                    const verifiedElement = document.createElement('img');
                    verifiedElement.src = `./../../images/verification-icons/verified-badge.png`;
                    verifiedElement.width = 15;
                    verifiedElement.height = 15;
                    verifiedElement.style.alignSelf = 'center';
                    masteryElement.appendChild(verifiedElement);
                }

                const scoreSpan = document.createElement('span');
                scoreSpan.appendChild(document.createTextNode((row[column] * 100).toFixed(2) + '%'));
                scoreSpan.style.marginLeft = 'auto';
                masteryElement.appendChild(scoreSpan);

                dataCell.appendChild(masteryElement);
                dataCell.style.textAlign = columnsAlign[columnIndex];
            }
            else {
                dataCell.appendChild(document.createTextNode(row[column]));
                dataCell.style.textAlign = columnsAlign[columnIndex];
            }
            
            dataRow.appendChild(dataCell);
            columnIndex++;
        });

        // Highlight the row of the current user
        if (row['user_id'] === authData['user_id']) {
            dataRow.classList.add('current-user');
        }

        // Add the row to the table
        bodySection.appendChild(dataRow);

        lastVerified = row['verified'];
        lastMastery = row['mastery'];
        lastStreak = row['streak'];
    });

    table.appendChild(bodySection);

    leaderboardDataElement.innerHTML = '';
    leaderboardDataElement.appendChild(table);
}

export async function displaySALeaderboard(song_key: string, psarc_hash: string, arrangement: string, difficulty: string): Promise<void> {
    const authData = JSON.parse(window.sessionStorage.getItem('auth_data') as any);

    const leaderboardDataElement = document.getElementById('leaderboard_data') as HTMLElement;

    const scores = await getScoresSA(song_key, psarc_hash, arrangement, difficulty);

    // If scores are null we ran into an error that should already be displayed
    if (scores === null) {
        return;
    }

    if (scores.length === 0) {
        const message = document.createElement('p');
        message.innerHTML = 'And this is where I would put my scores... <em>IF I HAD ONE!</em>';
        leaderboardDataElement.innerHTML = '';
        leaderboardDataElement.appendChild(message);
        return;
    }

    // Create the table element
    const table = document.createElement('table');
    table.classList.add('leaderboard-data');
    table.style.width = '100%';

    // Create the header row
    const headerSection = document.createElement('thead');
    const headerRow = document.createElement('tr');
    const headers = ['Rank', 'Username', 'Last Played', 'Play Count', 'Score'];
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
    const columns = ['rank', 'username', 'last_played', 'play_count', 'score'];
    const columnsAlign = ['right', 'left', 'left', 'right', 'right'];

    // Keep track of rank
    let rank = 0;
    let lastScore: number | null = null;
    let lastBadges: number | null = null;
    let tieCount = 0;

    scores.forEach((row: any) => {
        const dataRow = document.createElement('tr');

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

        // Populate data for each column
        let columnIndex = 0;
        columns.forEach((column) => {
            const dataCell = document.createElement('td');
            dataCell.style.fontFamily = 'Roboto Mono, monospace';
            dataCell.style.paddingLeft = '5px';
            dataCell.style.paddingRight = '5px';
            if (column === 'rank') {
                dataCell.appendChild(document.createTextNode(rank.toString()));
                dataCell.style.textAlign = columnsAlign[columnIndex];
            }
            else if (column === 'username') {
                const usernameElement = document.createElement('div');
                usernameElement.style.display = 'flex';
                usernameElement.style.flexDirection = 'row';

                if (row['king']) {
                    const kingElement = document.createElement('img');
                    kingElement.src = `./../../images/crown.png`;
                    kingElement.width = 15;
                    kingElement.height = 15;
                    kingElement.style.alignSelf = 'center';
                    kingElement.style.marginRight = '5px';
                    usernameElement.appendChild(kingElement);
                }

                const usernameText = document.createTextNode(row[column]);
                usernameElement.appendChild(usernameText);

                dataCell.appendChild(usernameElement);
                dataCell.style.textAlign = columnsAlign[columnIndex];
            }
            else if (column === 'last_played' || column === 'play_count') {
                if (row[column] === null) {
                    dataCell.appendChild(document.createTextNode('Unknown'));
                    dataCell.style.textAlign = 'left';
                }
                else {
                    dataCell.appendChild(document.createTextNode(row[column]));
                    dataCell.style.textAlign = columnsAlign[columnIndex];
                }
            }
            else if (column === 'score') {

                const scoreElement = document.createElement('div');
                scoreElement.style.display = 'flex';
                scoreElement.style.flexDirection = 'row';
                
                const badgeElement = document.createElement('img');
                badgeElement.src = `./../../images/badge-icons/badge-${row['badges']}.png`;
                badgeElement.width = 15;
                badgeElement.height = 15;
                badgeElement.style.alignSelf = 'center';

                const scoreSpan = document.createElement('span');
                scoreSpan.appendChild(document.createTextNode(row[column].toLocaleString('en-US')));
                scoreSpan.style.marginLeft = 'auto';

                scoreElement.appendChild(badgeElement);
                scoreElement.appendChild(scoreSpan);

                dataCell.appendChild(scoreElement);
                dataCell.style.textAlign = columnsAlign[columnIndex];
            }
            else {
                dataCell.appendChild(document.createTextNode(row[column]));
                dataCell.style.textAlign = columnsAlign[columnIndex];
            }

            dataRow.appendChild(dataCell);
            columnIndex++;
        });

        // Highlight the row of the current user
        if (row['user_id'] === authData['user_id']) {
            dataRow.classList.add('current-user');
        }

        // Add the row to the table
        bodySection.appendChild(dataRow);

        lastScore = row['score'];
        lastBadges = row['badges'];
    })

    table.appendChild(bodySection);

    leaderboardDataElement.innerHTML = '';
    leaderboardDataElement.appendChild(table);
}