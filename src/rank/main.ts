import { getVersion, post } from "../common/functions";

function getRandomVerb() {
    const verbs: string[] = [
        "Annihilated",
        "Assaulted",
        "Axed",
        "Battered",
        "Beaten",
        "Befouled",
        "Besmirched",
        "Bested",
        "Blighted",
        "Bludgeoned",
        "Butchered",
        "Conquered",
        "Crushed",
        "Debased",
        "Decapitated",
        "Decimated",
        "Defaced",
        "Defamed",
        "Defeated",
        "Defiled",
        "Demolished",
        "Desecrated",
        "Destroyed",
        "Dethroned",
        "Disgraced",
        "Dishonored",
        "Dismantled",
        "Executed",
        "Killed",
        "Marred",
        "Massacred",
        "Murdered",
        "Obliterated",
        "Pummeled",
        "Quashed",
        "Quelled",
        "Ruined",
        "Shamed",
        "Shattered",
        "Slashed",
        "Slaughtered",
        "Slayed",
        "Smacked",
        "Soiled",
        "Squashed",
        "Squelched",
        "Stomped",
        "Sullied",
        "Tarnished",
        "Thrashed",
        "Thwarted",
        "Trampled",
        "Trashed",
        "Triumphed",
        "Trounced",
        "Unalived",
        "Vanquished",
        "Wrecked",
    ];
    
    const randomIndex = Math.floor(Math.random() * verbs.length);
    return verbs[randomIndex];
}

async function get_ranks_top3() {
    const authData = JSON.parse(window.sessionStorage.getItem('auth_data') as any);

    const host = await window.api.getHost();
    const response = await post(host + '/api/data/get_ranks_top3.php', {
        auth_data: authData,
    });

    if ('error' in response) {
        window.api.error(response['error']);
        return;
    }

    // King of Rocksmith
    const kingElement = document.getElementById('king') as HTMLElement;
    const kingVerbElement = document.getElementById('king_verb') as HTMLElement;
    const kingPointsElement = document.getElementById('king_points') as HTMLElement;
    kingElement.innerText = response['overall'][0]['username'];
    kingVerbElement.innerText = "Scores " + getRandomVerb() + ":";
    kingPointsElement.innerText = response['overall'][0]['points'];

    // Overall top 3
    const overall1Element = document.getElementById('overall_1') as HTMLElement;
    const overall1VerbElement = document.getElementById('overall_1_verb') as HTMLElement;
    const overall1PointsElement = document.getElementById('overall_1_points') as HTMLElement;
    overall1Element.innerText = response['overall'][0]['username'];
    overall1VerbElement.innerText = "Scores " + getRandomVerb() + ":";
    overall1PointsElement.innerText = response['overall'][0]['points'];

    const overall2Element = document.getElementById('overall_2') as HTMLElement;
    const overall2VerbElement = document.getElementById('overall_2_verb') as HTMLElement;
    const overall2PointsElement = document.getElementById('overall_2_points') as HTMLElement;
    overall2Element.innerText = response['overall'][1]['username'];
    overall2VerbElement.innerText = "Scores " + getRandomVerb() + ":";
    overall2PointsElement.innerText = response['overall'][1]['points'];

    const overall3Element = document.getElementById('overall_3') as HTMLElement;
    const overall3VerbElement = document.getElementById('overall_3_verb') as HTMLElement;
    const overall3PointsElement = document.getElementById('overall_3_points') as HTMLElement;
    overall3Element.innerText = response['overall'][2]['username'];
    overall3VerbElement.innerText = "Scores " + getRandomVerb() + ":";
    overall3PointsElement.innerText = response['overall'][2]['points'];

    // Lead top 3
    const lead1Element = document.getElementById('lead_1') as HTMLElement;
    const lead1VerbElement = document.getElementById('lead_1_verb') as HTMLElement;
    const lead1PointsElement = document.getElementById('lead_1_points') as HTMLElement;
    lead1Element.innerText = response['lead'][0]['username'];
    lead1VerbElement.innerText = "Scores " + getRandomVerb() + ":";
    lead1PointsElement.innerText = response['lead'][0]['points'];

    const lead2Element = document.getElementById('lead_2') as HTMLElement;
    const lead2VerbElement = document.getElementById('lead_2_verb') as HTMLElement;
    const lead2PointsElement = document.getElementById('lead_2_points') as HTMLElement;
    lead2Element.innerText = response['lead'][1]['username'];
    lead2VerbElement.innerText = "Scores " + getRandomVerb() + ":";
    lead2PointsElement.innerText = response['lead'][1]['points'];

    const lead3Element = document.getElementById('lead_3') as HTMLElement;
    const lead3VerbElement = document.getElementById('lead_3_verb') as HTMLElement;
    const lead3PointsElement = document.getElementById('lead_3_points') as HTMLElement;
    lead3Element.innerText = response['lead'][2]['username'];
    lead3VerbElement.innerText = "Scores " + getRandomVerb() + ":";
    lead3PointsElement.innerText = response['lead'][2]['points'];

    // Rhythm top 3
    const rhythm1Element = document.getElementById('rhythm_1') as HTMLElement;
    const rhythm1VerbElement = document.getElementById('rhythm_1_verb') as HTMLElement;
    const rhythm1PointsElement = document.getElementById('rhythm_1_points') as HTMLElement;
    rhythm1Element.innerText = response['rhythm'][0]['username'];
    rhythm1VerbElement.innerText = "Scores " + getRandomVerb() + ":";
    rhythm1PointsElement.innerText = response['rhythm'][0]['points'];

    const rhythm2Element = document.getElementById('rhythm_2') as HTMLElement;
    const rhythm2VerbElement = document.getElementById('rhythm_2_verb') as HTMLElement;
    const rhythm2PointsElement = document.getElementById('rhythm_2_points') as HTMLElement;
    rhythm2Element.innerText = response['rhythm'][1]['username'];
    rhythm2VerbElement.innerText = "Scores " + getRandomVerb() + ":";
    rhythm2PointsElement.innerText = response['rhythm'][1]['points'];

    const rhythm3Element = document.getElementById('rhythm_3') as HTMLElement;
    const rhythm3VerbElement = document.getElementById('rhythm_3_verb') as HTMLElement;
    const rhythm3PointsElement = document.getElementById('rhythm_3_points') as HTMLElement;
    rhythm3Element.innerText = response['rhythm'][2]['username'];
    rhythm3VerbElement.innerText = "Scores " + getRandomVerb() + ":";
    rhythm3PointsElement.innerText = response['rhythm'][2]['points'];

    // Bass top 3
    const bass1Element = document.getElementById('bass_1') as HTMLElement;
    const bass1VerbElement = document.getElementById('bass_1_verb') as HTMLElement;
    const bass1PointsElement = document.getElementById('bass_1_points') as HTMLElement;
    bass1Element.innerText = response['bass'][0]['username'];
    bass1VerbElement.innerText = "Scores " + getRandomVerb() + ":";
    bass1PointsElement.innerText = response['bass'][0]['points'];

    const bass2Element = document.getElementById('bass_2') as HTMLElement;
    const bass2VerbElement = document.getElementById('bass_2_verb') as HTMLElement;
    const bass2PointsElement = document.getElementById('bass_2_points') as HTMLElement;
    bass2Element.innerText = response['bass'][1]['username'];
    bass2VerbElement.innerText = "Scores " + getRandomVerb() + ":";
    bass2PointsElement.innerText = response['bass'][1]['points'];

    const bass3Element = document.getElementById('bass_3') as HTMLElement;
    const bass3VerbElement = document.getElementById('bass_3_verb') as HTMLElement;
    const bass3PointsElement = document.getElementById('bass_3_points') as HTMLElement;
    bass3Element.innerText = response['bass'][2]['username'];
    bass3VerbElement.innerText = "Scores " + getRandomVerb() + ":";
    bass3PointsElement.innerText = response['bass'][2]['points'];
}

async function display_leaderboard(type: string) {
    const authData = JSON.parse(window.sessionStorage.getItem('auth_data') as any);
    const host = await window.api.getHost();
    const response = await post(host + '/api/data/get_ranks_' + type + '.php', {
        auth_data: authData,
    });

    if ('error' in response) {
        window.api.error(response['error']);
        return;
    }

    const ranks = response;

    // Create the table element
    const table = document.createElement('table');
    table.classList.add('leaderboard-data');
    table.style.width = '100%';

    // Create the header row
    const headerSection = document.createElement('thead');
    const headerRow = document.createElement('tr');
    const headers = ['Rank', 'Username', 'Scores Defeated'];
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
    const columns = ['rank', 'username', 'points'];
    const columnsAlign = ['right', 'left', 'right'];

    // Keep track of rank
    let rank = 0;

    // Build each row
    ranks.forEach((row: any) => {
        const dataRow = document.createElement('tr');

        // Increment the rank
        rank++;

        // Populate data for each column
        let columnIndex = 0;
        columns.forEach((column) => {
            const dataCell = document.createElement('td');
            dataCell.style.fontFamily = 'Roboto Mono, monospace';
            dataCell.style.paddingLeft = '5px';
            dataCell.style.paddingRight = '5px';
            if (column === 'rank') {
                dataCell.appendChild(document.createTextNode(rank.toString()));
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
            }
            else {
                dataCell.appendChild(document.createTextNode(row[column]));
            }

            dataCell.style.textAlign = columnsAlign[columnIndex++];
            dataRow.appendChild(dataCell);
        });

        // Highlight the row of the current user
        if (row['user_id'] === authData['user_id']) {
            dataRow.classList.add('current-user');
        }

        // Add the row to the table
        bodySection.appendChild(dataRow);
    });

    table.appendChild(bodySection);

    // Get the parent element
    const leaderboardElement = document.getElementById(type + '_leaderboard') as HTMLElement;
    leaderboardElement.innerHTML = '';
    leaderboardElement.appendChild(table);
}

async function create_popup_elements() {

    // Overall
    const overallExpandElement = document.getElementById('overall_expand') as HTMLElement;
    const overallPopupElement = document.getElementById('overall_popup') as HTMLElement;
    const closeOverallPopupElement = document.getElementById('close_overall_popup') as HTMLElement;

    overallExpandElement.addEventListener('click', async () => {
        overallPopupElement.style.display = 'block';

        display_leaderboard('overall');
    });

    closeOverallPopupElement.addEventListener('click', async() => {
        overallPopupElement.style.display = 'none';
    });

    // Lead
    const leadExpandElement = document.getElementById('lead_expand') as HTMLElement;
    const leadPopupElement = document.getElementById('lead_popup') as HTMLElement;
    const closeLeadPopupElement = document.getElementById('close_lead_popup') as HTMLElement;

    leadExpandElement.addEventListener('click', async () => {
        leadPopupElement.style.display = 'block';

        display_leaderboard('lead');
    });

    closeLeadPopupElement.addEventListener('click', async() => {
        leadPopupElement.style.display = 'none';
    });

    // Rhythm
    const rhythmExpandElement = document.getElementById('rhythm_expand') as HTMLElement;
    const rhythmPopupElement = document.getElementById('rhythm_popup') as HTMLElement;
    const closeRhythmPopupElement = document.getElementById('close_rhythm_popup') as HTMLElement;

    rhythmExpandElement.addEventListener('click', async () => {
        rhythmPopupElement.style.display = 'block';

        display_leaderboard('rhythm');
    });

    closeRhythmPopupElement.addEventListener('click', async() => {
        rhythmPopupElement.style.display = 'none';
    });

    // Bass
    const bassExpandElement = document.getElementById('bass_expand') as HTMLElement;
    const bassPopupElement = document.getElementById('bass_popup') as HTMLElement;
    const closeBassPopupElement = document.getElementById('close_bass_popup') as HTMLElement;

    bassExpandElement.addEventListener('click', async () => {
        bassPopupElement.style.display = 'block';

        display_leaderboard('bass');
    });

    closeBassPopupElement.addEventListener('click', async() => {
        bassPopupElement.style.display = 'none';
    });
}

async function main() {
    const version = await getVersion();
    document.title += ' v' + version;

    const disclaimerElement = document.getElementById('disclaimer') as HTMLElement;
    disclaimerElement.innerText = "*Your rank is calculated hourly based on number of verified scores you defeat (or tie).";

    get_ranks_top3();

    create_popup_elements();
}

main();