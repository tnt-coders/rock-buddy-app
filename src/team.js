'use strict';

function openTwitchTNT() {
  api.openExternalLink('https://www.twitch.tv/tntmusicstudios');
}

function openTwitchRecon() {
  api.openExternalLink('https://www.twitch.tv/recontastic');
}

VanillaTilt.init(document.querySelectorAll(".card"), {
  max: 5,
  speed: 1000,
  transition: true,
});

VanillaTilt.init(document.querySelectorAll(".buddycard"), {
  max: 15,
  speed: 1000,
  transition: true,
});