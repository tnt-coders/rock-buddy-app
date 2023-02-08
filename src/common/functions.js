'use strict';

function sessionUpdate() {
  // Get current page and previous page so we can implement "back" functionality
  const currentPage = sessionStorage.getItem('current_page');
  if (currentPage !== null) {
    sessionStorage.setItem('previous_page', currentPage);
  }

  sessionStorage.setItem('current_page', window.location.href);
}

function back() {
  const previousPage = sessionStorage.getItem('previous_page');
  if (previousPage !== null) {
    window.location.href = previousPage;
    return;
  }
} 

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

async function getAccountInfo(authData) {
  const host = await api.getHost();
  const response = await post(host + '/api/account/get_account_info.php', authData);

  if ('error' in response) {
    console.error(response['error']);
    return null;
  }

  return response;
}

async function checkAccountActivation(authData) {
  const host = await api.getHost();
  const response = await post(host + '/api/account/check_account_activation.php', authData);

  if ('error' in response) {
    console.error(response['error']);
    return false;
  }

  return response['activated'];
}

async function sendActivationEmail(authData) {
  const host = await api.getHost();
  const response = await post(host + '/api/account/send_activation_email.php', authData);

  if ('error' in response) {
    console.error(response['error']);
    return false;
  }

  return response['success'];
}