import { post } from "./functions";

export async function displayProfile(username: string): Promise<void> {
    const authData = JSON.parse(window.sessionStorage.getItem('auth_data') as any);

    const host = await window.api.getHost();
    const profile_response = await post(host + '/api/data/get_user_profile_data.php', {
        auth_data: authData,
        username: username 
    });

    if ('error' in profile_response) {
        window.api.error(profile_response['error']);
        return;
    }

    const profilePopup = document.createElement('div');
    profilePopup.classList.add('modal');

    // Create close icon
    const closeIcon = document.createElement('span');
    closeIcon.classList.add('close');
    closeIcon.innerHTML = '&times;';
    closeIcon.addEventListener('click', () => {
        profilePopup.style.display = 'none';
    });
    profilePopup.appendChild(closeIcon);

    // Create heading
    const header = document.createElement('h1');
    header.innerText = 'Profile (' + profile_response['username'] + ')';
    profilePopup.appendChild(header);

    // Create profile data
    const profileData = document.createElement('div');
    profileData.classList.add('profile');

    // Create twitch data
    const twitchData = document.createElement('div');
    twitchData.classList.add('twitch-data');

    const twitchLabel = document.createElement('span');
    twitchLabel.classList.add('profile-label');
    twitchLabel.innerText = 'Twitch:';
    twitchData.appendChild(twitchLabel);

    const twitchLink = document.createElement('a');
    twitchLink.href = '#';
    twitchLink.innerText = 'https://twitch.tv/' + profile_response['twitch_username'];
    twitchLink.addEventListener('click', () => {
        window.api.openExternalLink(twitchLink.innerText);
    })
    twitchData.appendChild(twitchLink);

    profileData.appendChild(twitchData);

    // Create stats
    const statsDiv = document.createElement('div');
    statsDiv.classList.add('stats');

    // Verified scores stats
    const verifiedScoresHeader = document.createElement('h2');
    verifiedScoresHeader.innerText = 'Verified Scores';
    statsDiv.appendChild(verifiedScoresHeader);

    // Verified scores overall
    const verifiedScoresOverallDiv = document.createElement('div');
    verifiedScoresOverallDiv.classList.add('stats-entry');
    const verifiedScoresOverallLabel = document.createElement('span');
    verifiedScoresOverallLabel.innerText = 'Overall:';
    verifiedScoresOverallDiv.appendChild(verifiedScoresOverallLabel);
    const verifiedScoresOverallValue = document.createElement('span');
    verifiedScoresOverallValue.innerText = 'Loading...';
    verifiedScoresOverallDiv.appendChild(verifiedScoresOverallValue);
    statsDiv.appendChild(verifiedScoresOverallDiv);

    // Verified scores lead
    const verifiedScoresLeadDiv = document.createElement('div');
    verifiedScoresLeadDiv.classList.add('stats-entry');
    const verifiedScoresLeadLabel = document.createElement('span');
    verifiedScoresLeadLabel.innerText = 'Lead:';
    verifiedScoresLeadDiv.appendChild(verifiedScoresLeadLabel);
    const verifiedScoresLeadValue = document.createElement('span');
    verifiedScoresLeadValue.innerText = 'Loading...';
    verifiedScoresLeadDiv.appendChild(verifiedScoresLeadValue);
    statsDiv.appendChild(verifiedScoresLeadDiv);

    // Verified scores rhythm
    const verifiedScoresRhythmDiv = document.createElement('div');
    verifiedScoresRhythmDiv.classList.add('stats-entry');
    const verifiedScoresRhythmLabel = document.createElement('span');
    verifiedScoresRhythmLabel.innerText = 'Rhythm:';
    verifiedScoresRhythmDiv.appendChild(verifiedScoresRhythmLabel);
    const verifiedScoresRhythmValue = document.createElement('span');
    verifiedScoresRhythmValue.innerText = 'Loading...';
    verifiedScoresRhythmDiv.appendChild(verifiedScoresRhythmValue);
    statsDiv.appendChild(verifiedScoresRhythmDiv);

    // Verified scores bass
    const verifiedScoresBassDiv = document.createElement('div');
    verifiedScoresBassDiv.classList.add('stats-entry');
    const verifiedScoresBassLabel = document.createElement('span');
    verifiedScoresBassLabel.innerText = 'Bass:';
    verifiedScoresBassDiv.appendChild(verifiedScoresBassLabel);
    const verifiedScoresBassValue = document.createElement('span');
    verifiedScoresBassValue.innerText = 'Loading...';
    verifiedScoresBassDiv.appendChild(verifiedScoresBassValue);
    statsDiv.appendChild(verifiedScoresBassDiv);

    // Accuracy stats
    const accuracyHeader = document.createElement('h2');
    accuracyHeader.innerText = 'Verified Scores';
    statsDiv.appendChild(accuracyHeader);

    // Accuracy overall
    const accuracyOverallDiv = document.createElement('div');
    accuracyOverallDiv.classList.add('stats-entry');
    const accuracyOverallLabel = document.createElement('span');
    accuracyOverallLabel.innerText = 'Overall:';
    accuracyOverallDiv.appendChild(accuracyOverallLabel);
    const accuracyOverallValue = document.createElement('span');
    accuracyOverallValue.innerText = 'Loading...';
    accuracyOverallDiv.appendChild(accuracyOverallValue);
    statsDiv.appendChild(accuracyOverallDiv);

    // Accuracy lead
    const accuracyLeadDiv = document.createElement('div');
    accuracyLeadDiv.classList.add('stats-entry');
    const accuracyLeadLabel = document.createElement('span');
    accuracyLeadLabel.innerText = 'Lead:';
    accuracyLeadDiv.appendChild(accuracyLeadLabel);
    const accuracyLeadValue = document.createElement('span');
    accuracyLeadValue.innerText = 'Loading...';
    accuracyLeadDiv.appendChild(accuracyLeadValue);
    statsDiv.appendChild(accuracyLeadDiv);

    // Accuracy rhythm
    const accuracyRhythmDiv = document.createElement('div');
    accuracyRhythmDiv.classList.add('stats-entry');
    const accuracyRhythmLabel = document.createElement('span');
    accuracyRhythmLabel.innerText = 'Rhythm:';
    accuracyRhythmDiv.appendChild(accuracyRhythmLabel);
    const accuracyRhythmValue = document.createElement('span');
    accuracyRhythmValue.innerText = 'Loading...';
    accuracyRhythmDiv.appendChild(accuracyRhythmValue);
    statsDiv.appendChild(accuracyRhythmDiv);

    // Accuracy bass
    const accuracyBassDiv = document.createElement('div');
    accuracyBassDiv.classList.add('stats-entry');
    const accuracyBassLabel = document.createElement('span');
    accuracyBassLabel.innerText = 'Bass:';
    accuracyBassDiv.appendChild(accuracyBassLabel);
    const accuracyBassValue = document.createElement('span');
    accuracyBassValue.innerText = 'Loading...';
    accuracyBassDiv.appendChild(accuracyBassValue);
    statsDiv.appendChild(accuracyBassDiv);

    profileData.appendChild(statsDiv);

    profilePopup.appendChild(profileData);

    document.body.appendChild(profilePopup);

    profilePopup.style.display = 'block';

    const stats_response = await post(host + '/api/data/get_user_stats.php', {
        auth_data: authData,
        username: username
    });

    if ('error' in stats_response) {
        window.api.error(stats_response['error']);
        return;
    }

    verifiedScoresOverallValue.innerText = stats_response['verified_scores']['overall'];
    verifiedScoresLeadValue.innerText = stats_response['verified_scores']['lead'];
    verifiedScoresRhythmValue.innerText = stats_response['verified_scores']['rhythm'];
    verifiedScoresBassValue.innerText = stats_response['verified_scores']['bass'];

    accuracyOverallValue.innerText = (stats_response['accuracy']['overall'] * 100).toFixed(2) + '%';;
    accuracyLeadValue.innerText = (stats_response['accuracy']['lead'] * 100).toFixed(2) + '%';;
    accuracyRhythmValue.innerText = (stats_response['accuracy']['rhythm'] * 100).toFixed(2) + '%';;
    accuracyBassValue.innerText = (stats_response['accuracy']['bass'] * 100).toFixed(2) + '%';;
}