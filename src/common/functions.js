'use strict';

function sessionUpdate() {
  // Get current page and previous page so we can implement "back" functionality
  const currentPage = sessionStorage.getItem('current_page');
  if (currentPage !== window.location.href) {
    sessionStorage.setItem('current_page', window.location.href);
    sessionStorage.setItem('previous_page', currentPage);
  }
}

function back() {
  const previousPage = sessionStorage.getItem('previous_page');
  if (previousPage !== null) {
    window.location.href = previousPage;
    return;
  }
}

async function getVersion() {
  let version = sessionStorage.getItem('version');
  if (version === null) {
    version = await api.getVersion();
    sessionStorage.setItem('version', version);
  }

  return version;
}

async function post(url, data) {
  // Add version number to the data
  data['version'] = await getVersion();

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
    api.error(response['error']);
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
  const authData = await api.storeGet('auth_data');
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
    api.error(response['error']);
    return null;
  }

  return response;
}

async function checkAccountActivation(authData) {
  const host = await api.getHost();
  const response = await post(host + '/api/account/check_account_activation.php', authData);

  if ('error' in response) {
    api.error(response['error']);
    return false;
  }

  return response['activated'];
}

async function sendActivationEmail(authData) {
  const host = await api.getHost();
  const response = await post(host + '/api/account/send_activation_email.php', authData);

  if ('error' in response) {
    api.error(response['error']);
    return false;
  }

  return response['success'];
}

function validateUsername(username) {
  // Should not contain special characters
  const specialChars = /[^\w]/g;
  if (username.match(specialChars)) {
    api.error('Username cannot contain special characters.');
    return false;
  }

  // Should not contain any spaces
  if (username.indexOf(' ') !== -1) {
    api.error('Username cannot contain spaces.');
    return false;
  }

  // Check username length
  if (username.length < 4 || username.length > 25) {
    api.error('Username must be between 4 and 25 characters.');
    return false;
  }

  return true;
}

function validateEmail(email) {
  const regex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!regex.test(email)) {
    api.error('Email is invalid.');
    return false;
  }

  if (email.length < 5 || email.length > 255) {
    api.error('Email must be between 5 and 255 characters.');
    return;
  }

  return true;
}

function validatePassword(password, confirmPassword) {
  // Password must contain:
  // 1 uppercase letter
  // 1 lowercase letter
  // 1 number
  // 1 special character
  const upperCase = /[A-Z]/g;
  const lowerCase = /[a-z]/g;
  const numbers = /[0-9]/g;
  const specialChars = /[^\w]/g;
  if (!upperCase.test(password)
    || !lowerCase.test(password)
    || !numbers.test(password)
    || !specialChars.test(password)
    || password.length < 8) {
    api.error("Password must contain:\n"
      + "1 uppercase letter,\n"
      + "1 lowercase letter,\n"
      + "1 number\n"
      + "1 special character\n"
      + 'and be at least 8 characters long.');
    return false;
  }

  // Should not contain any spaces
  if (password.indexOf(' ') !== -1) {
    api.error('Password cannot contain spaces.');
    return false;
  }

  // Check password length
  if (password.length < 8 || password.length > 255) {
    api.error('Password must be between 8 and 255 characters.');
    return false;
  }

  // Password and confirm password must match
  if (password !== confirmPassword) {
    api.error('Passwords do not match.');
    return false;
  }

  return true;
}

//Convert a number to a duration "hh:mm:ss"
function durationString(tSeconds) {
	var hh = Math.floor(tSeconds / 3600);
	var mm = Math.floor((tSeconds - (hh * 3600)) / 60);
	var ss = Math.floor(tSeconds % 60);

	if(hh < 10) {hh = "0"+hh;}
	if(mm < 10) {mm = "0"+mm;}
	if(ss < 10) {ss = "0"+ss;}

	if(hh > 0) {
		return hh+":"+mm+":"+ss;
	} else {
		return mm+":"+ss;
	}
}