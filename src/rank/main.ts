import { getVersion, post } from "../common/functions";

function getRandomVerb() {
    const verbs: string[] = [
        "Annihilated",
        "Assaulted",
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
        "Slaughtered",
        "Slayed",
        "Smacked",
        "Soiled",
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
        "Vanquished",
        "Wrecked",
    ];
    
    const randomIndex = Math.floor(Math.random() * verbs.length);
    return verbs[randomIndex];
}

async function get_ranks() {
    const authData = JSON.parse(window.sessionStorage.getItem('auth_data') as any);

    const host = await window.api.getHost();
    const response = await post(host + '/api/data/get_ranks.php', {
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

async function get_rank() {
    const authData = JSON.parse(window.sessionStorage.getItem('auth_data') as any);

    const host = await window.api.getHost();
    const response = await post(host + '/api/data/get_rank.php', {
        auth_data: authData,
    });

    if ('error' in response) {
        window.api.error(response['error']);
        return;
    }

    // User overall rank
    const overallUserRankElement = document.getElementById('overall_user_rank') as HTMLElement;
    const overallUserVerbElement = document.getElementById('overall_user_verb') as HTMLElement;
    const overallUserPointsElement = document.getElementById('overall_user_points') as HTMLElement;
    overallUserRankElement.innerText = response['overall']['rank'];
    overallUserVerbElement.innerText = "Scores " + getRandomVerb() + ":";
    overallUserPointsElement.innerText = response['overall']['points'];

    // User lead rank
    const leadUserRankElement = document.getElementById('lead_user_rank') as HTMLElement;
    const leadUserVerbElement = document.getElementById('lead_user_verb') as HTMLElement;
    const leadUserPointsElement = document.getElementById('lead_user_points') as HTMLElement;
    leadUserRankElement.innerText = response['lead']['rank'];
    leadUserVerbElement.innerText = "Scores " + getRandomVerb() + ":";
    leadUserPointsElement.innerText = response['lead']['points'];

    // User rhythm rank
    const rhythmUserRankElement = document.getElementById('rhythm_user_rank') as HTMLElement;
    const rhythmUserVerbElement = document.getElementById('rhythm_user_verb') as HTMLElement;
    const rhythmUserPointsElement = document.getElementById('rhythm_user_points') as HTMLElement;
    rhythmUserRankElement.innerText = response['rhythm']['rank'];
    rhythmUserVerbElement.innerText = "Scores " + getRandomVerb() + ":";
    rhythmUserPointsElement.innerText = response['rhythm']['points'];

    // User bass rank
    const bassUserRankElement = document.getElementById('bass_user_rank') as HTMLElement;
    const bassUserVerbElement = document.getElementById('bass_user_verb') as HTMLElement;
    const bassUserPointsElement = document.getElementById('bass_user_points') as HTMLElement;
    bassUserRankElement.innerText = response['bass']['rank'];
    bassUserVerbElement.innerText = "Scores " + getRandomVerb() + ":";
    bassUserPointsElement.innerText = response['bass']['points'];
}

async function main() {
    const version = await getVersion();
    document.title += ' v' + version;

    const disclaimerElement = document.getElementById('disclaimer') as HTMLElement;
    disclaimerElement.innerText = "*Rank data is calculated daily based on number of verified scores " + getRandomVerb().toLowerCase() + ".";

    get_ranks();

    get_rank();
}

main();