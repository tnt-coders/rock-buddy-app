'use strict';

async function requestPasswordChange(newPassword, password) {
    const authData = JSON.parse(sessionStorage.getItem('auth_data'));

    const host = await api.getHost();
    const response = await post(host + '/api/account/change_password.php', {
        auth_data: authData,
        new_password: newPassword,
        password: password
    });

    if ('error' in response) {
        api.error(response['error']);
        return false;
    }

    return response['success'];
}

async function changePassword(event) {
    // Prevents the form from being immediately cleared
    event.preventDefault();

    const password = document.getElementById('password').value;
    const newPassword = document.getElementById('new_password').value;
    const confirmNewPassword = document.getElementById('confirm_new_password').value;

    // Make sure the new username is valid
    if (!validatePassword(newPassword, confirmNewPassword)) {
        document.getElementById('password').value = '';
        document.getElementById('new_password').value = '';
        document.getElementById('confirm_new_password').value = '';
        return;
    }

    const status = await requestPasswordChange(newPassword, password);
    if (!status) {
        document.getElementById('password').value = '';
        document.getElementById('new_password').value = '';
        document.getElementById('confirm_new_password').value = '';
        return;
    }

    api.info('Password changed successfully.');
    history.back();
    return;
}

async function main() {
    const version = await getVersion();
    document.title += ' v' + version;
}

main();