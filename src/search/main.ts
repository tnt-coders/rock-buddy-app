import { Search } from "./search";
import { getVersion, checkAlwaysSniff } from "../common/functions";

let search: Search | null = null;

async function main() {
    const version = await getVersion();
    document.title = 'Rock Buddy v' + version;

    // Create the search element
    search = new Search();

    checkAlwaysSniff();
}

main();