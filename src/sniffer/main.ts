import { Sniffer } from "./sniffer";
import { getVersion } from "../common/functions";
import { showError } from "./functions";

let sniffer: Sniffer | null = null;

export function openTwitchAboutPage() {
    window.api.openExternalLink("https://www.twitch.tv/tntmusicstudios/about");
}

export function openGithubIssue63() {
    window.api.openExternalLink("https://github.com/tnt-coders/rock-buddy-app/issues/63");
}

export function openRSModsDownloadPage() {
    window.api.openExternalLink("https://github.com/Lovrom8/RSMods/releases");
}

(window as any).openTwitchAboutPage = openTwitchAboutPage;
(window as any).openGithubIssue63 = openGithubIssue63;
(window as any).openRSModsDownloadPage = openRSModsDownloadPage;

async function main() {
    const version = await getVersion();
    document.title = 'Rock Buddy v' + version;

    window.api.launchRocksniffer();

    try {
        sniffer = await Sniffer.create();
        await sniffer.start();
    }
    catch (error) {
        showError(error);
    }
}

main();