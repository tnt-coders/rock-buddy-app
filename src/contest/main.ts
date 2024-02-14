import { Contest } from "./contest";
import { getVersion } from "../common/functions";

let contest: Contest | null = null;

async function main() {
    const version = await getVersion();
    document.title = 'Rock Buddy v' + version;

    contest = await Contest.create();
}

main();