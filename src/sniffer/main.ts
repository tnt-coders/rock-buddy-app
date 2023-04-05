import { Sniffer } from "./sniffer";
import { showError } from "./functions";

async function main() {
    try {
        const sniffer = await Sniffer.create();
        sniffer.start();
    }
    catch (error) {
        showError(error);
    }
}

main();