import { Stats } from "./stats";
import { getVersion } from "../common/functions";

let stats: Stats | null = null;

async function main() {
    const version = await getVersion();
    document.title = 'Rock Buddy v' + version;

    stats = await Stats.create();
}

main();