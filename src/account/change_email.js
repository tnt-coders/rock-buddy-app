'use strict';

async function requestEmailChange(newEmail, password) {
    const authData = JSON.parse(sessionStorage.getItem('auth_data'));

    const host = await api.getHost();
    const response = await post(host + '/api/account/change_email.php', {
        auth_data: authData,
        new_email: newEmail,
        password: password
    });

    if ('error' in response) {
        api.error(response['error']);
        return false;
    }

    return response['success'];
}

async function changeEmail(event) {
    // Prevents the form from being immediately cleared
    event.preventDefault();

    const newEmail = document.getElementById('new_email').value;
    const password = document.getElementById('password').value;

    // Make sure the new username is valid
    if (!validateEmail(newEmail)) {
        document.getElementById('new_email').value = '';
        document.getElementById('password').value = '';
        return;
    }

    const status = await requestEmailChange(newEmail, password);
    if (!status) {
        document.getElementById('password').value = '';
        return;
    }

    api.info('Email changed successfully.');
    window.location.href = './activation.html';
    return;
}

async function main() {
    const version = await getVersion();
    document.title += ' v' + version;
}

main();