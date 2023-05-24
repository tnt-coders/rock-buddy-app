import { Sniffer } from "./sniffer";
import { getVersion } from "../common/functions";
import { showError } from "./functions";

let sniffer: Sniffer | null = null;

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