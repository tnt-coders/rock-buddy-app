import { Search } from "./search";
import { getVersion } from "../common/functions";

let search: Search | null = null;

async function main() {
    const version = await getVersion();
    document.title += ' v' + version;

    // Create the search element
    search = new Search();
}

main();