import { getVersion, post } from "../common/functions";

async function main() {
    const version = await getVersion();
    document.title += ' v' + version;
}

main();