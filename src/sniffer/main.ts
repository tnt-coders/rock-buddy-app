import { Sniffer } from "./sniffer";
import { showError } from "./functions";

let sniffer: Sniffer | null = null;

async function main() {
    try {
        sniffer = await Sniffer.create();
        sniffer.start();
    }
    catch (error) {
        showError(error);
    }
}

function snort(): void {
    sniffer?.queueSnort();
}

main();