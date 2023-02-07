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

async function logout() {
  sessionStorage.removeItem('user_id');
  await api.deleteAuthData();
  window.location.href = 'auth/login.html';
  return;
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