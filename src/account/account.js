'use strict';

async function main() {
    const version = await getVersion();
    document.title += ' v' + version;

    const authData = JSON.parse(sessionStorage.getItem('auth_data'));

    const accountInfo = await getAccountInfo(authData);
    if (!accountInfo) {
        api.error('Failed to get account info.');
        return;
    }

    document.getElementById('username').innerText = accountInfo['username'];
    document.getElementById('email').innerText = accountInfo['email'];
}

main();