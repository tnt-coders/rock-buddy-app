'use strict';

async function requestUsernameChange(newUsername, password) {
    const authData = JSON.parse(sessionStorage.getItem('auth_data'));

    const host = await api.getHost();
    const response = await post(host + '/api/account/change_username.php', {
        auth_data: authData,
        new_username: newUsername,
        password: password
    });

    if ('error' in response) {
        api.error(response['error']);
        return false;
    }

    return response['success'];
}

async function changeUsername(event) {
    // Prevents the form from being immediately cleared
    event.preventDefault();

    const newUsername = document.getElementById('new_username').value;
    const password = document.getElementById('password').value;

    // Make sure the new username is valid
    if (!validateUsername(newUsername)) {
        document.getElementById('new_username').value = '';
        document.getElementById('password').value = '';
        return;
    }

    const status = await requestUsernameChange(newUsername, password);
    if (!status) {
        document.getElementById('password').value = '';
        return;
    }

    api.info('Username changed successfully.');
    history.back();
    return;
}

async function main() {
    const version = await getVersion();
    document.title = 'Rock Buddy v' + version;
}

main();