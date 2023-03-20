async function getVersion(): Promise<string | null> {
  let version = sessionStorage.getItem('version');
  if (version === null) {
    version = await window.api.getVersion();

    if (version !== null) {
      sessionStorage.setItem('version', version);
    }
  }

  return version;
}

export function approxEqual(a: number, b: number, tolerance = 0.0001): boolean {
  return Math.abs(a - b) <= tolerance;
}

//Convert a number to a duration "hh:mm:ss"
export function durationString(tSeconds: number) {
  let hh = Math.floor(tSeconds / 3600);
  let mm = Math.floor((tSeconds - (hh * 3600)) / 60);
  let ss = Math.floor(tSeconds % 60);

  let hhStr = hh.toString();
  let mmStr = mm.toString();
  let ssStr = ss.toString();
  if (hh < 10) { hhStr = "0" + hhStr; }
  if (mm < 10) { mmStr = "0" + mmStr; }
  if (ss < 10) { ssStr = "0" + ssStr; }

  if (hh > 0) {
    return hhStr + ":" + mmStr + ":" + ssStr;
  } else {
    return mmStr + ":" + ssStr;
  }
}

export async function post(url: string, data: any) {
  // Add version number to the data
  data['version'] = await getVersion();

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

  const responseJson = await response.json();
  if (responseJson.hasOwnProperty('error') && responseJson['error'] === 'Invalid API key.') {
    window.api.error("Your API key has expired.\n\nPlease log back in to verify your identity.");
    window.location.href = './logout.html';
  }

  return responseJson;
}