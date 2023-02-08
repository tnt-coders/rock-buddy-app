'use strict';

async function post(url, data) {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });

    // If the response is not OK log the response text
    if (!response.ok) {
      console.error(response.status + ': ' + response.statusText);
    }

    return await response.json();
  } catch (error) {
    return JSON.stringify({
      error: error.toString()
    });
  }
}

async function authenticate(authData) {
  const host = await api.getHost();
  const response = await post(host + '/api/auth/authenticate.php', authData);

  if ('error' in response) {
    console.error(response['error']);
    return false;
  }

  if (response['success']) {
    // User has been authenticated, set the auth data for the active session
    sessionStorage.setItem('auth_data', JSON.stringify(authData));
  }

  return response['success'];
}

async function checkEmailVerification(userId) {
  const host = await api.getHost();
  const response = await post(host + '/api/auth/check_email_verification.php', {
    user_id: userId
  });

  if ('error' in response) {
    console.error(response['error']);
    return false;
  }

  return response['verified'];
}

async function checkAuthentication() {
  if (sessionStorage.getItem('auth_data') !== null) {
    return true;
  }

  // Get stored authentication data
  const authData = await api.getAuthData();
  if (authData === null) {
    return false;
  }

  // Authenticate
  const authStatus = await authenticate(authData);
  if (!authStatus) {
    return false;
  }

  return true;
}

async function sendVerificationEmail(userId) {
  const host = await api.getHost();
  const response = await post(host + '/api/auth/send_verification_email.php', {
    user_id: userId
  });

  if ('error' in response) {
    console.error(response['error']);
    return false;
  }

  return response['success'];
}