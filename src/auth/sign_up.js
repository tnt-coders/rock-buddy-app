'use strict';

async function insertUser(username, email, password) {
    const host = await api.getHost();
    const response = await post(host + '/api/auth/sign_up.php', {
        username: username,
        email: email,
        password: password
    });

    if ('error' in response) {
        api.error(response['error']);
        return null;
    }

    return response['user_id'];
}

async function signUp(event) {
    // Prevents the form from being immediately cleared
    event.preventDefault();

    const username = document.getElementById('username').value;
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirm_password').value;

    if (!validateUsername(username)) {
        document.getElementById('username').value = '';
        return;
    }
    if (!validateEmail(email)) {
        document.getElementById('email').value = '';
        return;
    }
    if (!validatePassword(password, confirmPassword)) {
        document.getElementById('password').value = '';
        document.getElementById('confirm_password').value = '';
        return;
    }

    const userId = await insertUser(username, email, password);
    if (userId !== null) {
        api.info('User created successfully.');

        // Redirect to login
        window.location.href = 'login.html';
        return;
    }
}

async function main() {
    const version = await getVersion();
    document.title = 'Rock Buddy v' + version;
}

main();