import { Sniffer } from "./sniffer";
import { getVersion } from "../common/functions";
import { showError } from "./functions";

let sniffer: Sniffer | null = null;

export function openTwitchAboutPage() {
    window.api.openExternalLink("https://www.twitch.tv/tntmusicstudios/about");
}

export function openGithubIssue58() {
    window.api.openExternalLink("https://github.com/tnt-coders/rock-buddy-app/issues/58");
}

(window as any).openTwitchAboutPage = openTwitchAboutPage;
(window as any).openGithubIssue58 = openGithubIssue58;

async function main() {
    const version = await getVersion();
    document.title += ' v' + version;

    window.api.launchRocksniffer();

    try {
        sniffer = await Sniffer.create();
        sniffer.start();
    }
    catch (error) {
        showError(error);
    }
}

main();