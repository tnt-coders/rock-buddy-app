'use strict';

async function main() {
    const version = await getVersion();
    document.title += ' v' + version;
}

main();