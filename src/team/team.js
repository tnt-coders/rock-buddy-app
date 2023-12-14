'use strict';

function openTwitchTNT() {
    api.openExternalLink('https://www.twitch.tv/tntmusicstudios');
}

function openTwitchMrsTNT() {
    api.openExternalLink('https://www.twitch.tv/mrstnt33');
}

function openTwitchRecon() {
    api.openExternalLink('https://www.twitch.tv/recontastic');
}

function openTwitchStaji() {
    api.openExternalLink('https://www.twitch.tv/stajiw');
}

function openTwitchConnor() {
    api.openExternalLink('https://www.twitch.tv/connor_harkness');
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

async function main() {
    const version = await getVersion();
    document.title = 'Rock Buddy v' + version;
}

main();