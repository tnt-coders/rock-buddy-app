async function checkEmailVerification(userId) {
  const host = await api.getHost();
  try {
    const response = await fetch(host + '/api/auth/check_email_verification.php', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        user_id: userId
      })
    });

    if (response.ok) {
      // Successfully checked if the user is verified
      const data = await response.json();
      return data['verified'];
    }
    else {
      // Failed to check verification
      const data = await response.json();
      api.error(data['error']);
      return false;
    }
  } catch (error) {
    api.error(error.toString());
    return false;
  }
}

async function sendVerificationEmail(userId) {
  const host = await api.getHost();
  try {
    const response = await fetch(host + '/api/auth/send_verification_email.php', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        user_id: userId
      })
    });

    if (response.ok) {
      // Email sent successfully
      return true;
    }
    else {
      // Email failed to send
      const data = await response.json();
      api.error(data['error']);
      return false;
    }
  } catch (error) {
    api.error(error.toString());
    return false;
  }
}