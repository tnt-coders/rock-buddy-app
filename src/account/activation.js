'use strict';

async function resendActivationEmail() {
    const authData = JSON.parse(sessionStorage.getItem('auth_data'));
    const emailSent = await sendActivationEmail(authData);
    if (emailSent) {
        api.info('Email sent.');
    }
    else {
        api.error('Failed to send email.');
    }
}

async function redirectToHomepage() {
    window.location.href = '../index.html';
    return;
}

async function main() {
    const version = await getVersion();
    document.title = 'Rock Buddy v' + version;

    const authData = JSON.parse(sessionStorage.getItem('auth_data'));

    const accountInfo = await getAccountInfo(authData);
    if (!accountInfo) {
        api.error('Failed to get account info.');
        return;
    }

    // Send an activation email if one has never been sent
    if (accountInfo['token_timestamp'] === null) {
        sendActivationEmail(authData);
    }

    document.getElementById('email').innerText = accountInfo['email'];
}

VanillaTilt.init(document.querySelectorAll(".card"), {
    max: 5,
    speed: 1000,
    transition: true,
})

VanillaTilt.init(document.querySelectorAll(".buddycard"), {
    max: 15,
    speed: 1000,
    transition: true,
})

main();