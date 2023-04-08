'use strict';

async function main() {
    const version = await getVersion();
    document.title += ' v' + version;

    const auth = await checkAuthentication()
    if (!auth) {
        // Authentication failed - navigate to login
        window.location.href = './auth/login.html';
        return;
    }

    // Verify the user's email
    const authData = JSON.parse(sessionStorage.getItem('auth_data'));
    const activated = await checkAccountActivation(authData);
    if (!activated) {
        // Verification failed - redirect to account activation
        window.location.href = './account/activation.html'
        return;
    }

    // Authentication successful - proceed
    window.location.href = './sniffer/sniffer.html';
    return;
}

main();