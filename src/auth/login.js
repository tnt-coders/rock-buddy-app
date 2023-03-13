'use strict';

async function generateAuthData(usernameOrEmail, password) {
  const host = await api.getHost();
  const response = await post(host + '/api/auth/login.php', {
    username_or_email: usernameOrEmail,
    password: password
  });

  if ('error' in response) {
    api.error(response['error']);
    return null;
  }

  return response;
}

async function login(event) {
  // Prevents the form from being immediately cleared
  event.preventDefault();

  const usernameOrEmail = document.getElementById('username_or_email').value;
  const password = document.getElementById('password').value;

  const authData = await generateAuthData(usernameOrEmail, password);
  if (authData === null) {
    // Login failed - reset password and let the user know
    document.getElementById('password').value = '';
    return;
  }

  // Login successful - store auth data
  await api.storeSet('auth_data', authData);

  // Email is verified - proceed to application
  window.location.href = '../index.html';
  return;
}

async function resetPassword(event) {
  // Prevents the form from being immediately cleared
  event.preventDefault();

  const usernameOrEmail = document.getElementById('username_or_email').value;
  if (usernameOrEmail.trim() === '') {
    api.error("Please enter your username or email.");
    return;
  }

  const host = await api.getHost();

  let data = {}
  data['username_or_email'] = usernameOrEmail;
  const response = await post(host + '/api/account/send_password_reset_email.php', data);

  if ('error' in response) {
    api.error(response['error']);
    return;
  }

  if (response['success']) {
    api.info('Password reset request for "' + usernameOrEmail + '" sent successfully.' + "\n\n" + 'Check your email for a reset link.');
  }
}