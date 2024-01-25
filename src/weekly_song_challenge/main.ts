import { WeeklySongChallenge } from "./weekly_song_challenge";
import { getVersion } from "../common/functions";

let weeklySongChallenge: WeeklySongChallenge | null = null;

async function main() {
    const version = await getVersion();
    document.title = 'Rock Buddy v' + version;

    weeklySongChallenge = await WeeklySongChallenge.create();
}

main();