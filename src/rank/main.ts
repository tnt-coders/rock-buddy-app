import { getVersion, post } from "../common/functions";

async function main() {
    const version = await getVersion();
    document.title += ' v' + version;

    const authData = JSON.parse(window.sessionStorage.getItem('auth_data') as any);

    const host = await window.api.getHost();
    const response = await post(host + '/api/data/get_top3_overall.php', {
        auth_data: authData,
    });

    if ('error' in response) {
        window.api.error(response['error']);
        return;
    }

    const kingElement = document.getElementById('king') as HTMLElement;
    kingElement.innerText = response[0]['username'];

    const kingPointsElement = document.getElementById('king_points') as HTMLElement;
    kingPointsElement.innerText = response[0]['points'];
}

main();