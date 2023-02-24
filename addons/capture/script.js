//How often to poll the addon service (in milliseconds)
var pollrate = 1000;

function refresh() {
	fetch('http://localhost:8080')
    .then(response => response.text())
    .then(data => document.getElementById('data').innerHTML = '<img src="' + data + '">')
    .catch(error => console.error(error));
}

setInterval(refresh, pollrate);