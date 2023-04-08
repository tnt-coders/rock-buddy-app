'use strict';

sessionStorage.clear();
api.storeDelete('auth_data');
window.location.href = './login.html';

async function main() {
    const version = await getVersion();
    document.title += ' v' + version;
}

main();