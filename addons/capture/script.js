//How often to poll the addon service (in milliseconds)
var pollrate = 100;

function refresh() {
	fetch('http://' + addonsHost + ':' + addonsPort)
    .then(response => response.text())
    .then(data => document.getElementById('data').innerHTML = '<img src="' + data + '">')
    .catch(error => console.error(error));
}

setInterval(refresh, pollrate);