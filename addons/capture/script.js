//How often to poll the addon service (in milliseconds)
var pollrate = 100;

if (!addonsEnabled) {
  document.getElementById('data').innerText = 'Addons are disabled, to enable addons set enabled to true in addons/config.json.';
  process.exit(0);
}

function refresh() {
	fetch('http://' + addonsHost + ':' + addonsPort)
    .then(response => response.text())
    .then(data => document.getElementById('data').innerHTML = '<img src="' + data + '">')
    .catch(error => console.error(error));
}

setInterval(refresh, pollrate);