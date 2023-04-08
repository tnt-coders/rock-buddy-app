document.documentElement.style.setProperty('--streamer-color', '#FFF');
document.documentElement.style.setProperty('--streamer-text-color', '#000');

document.addEventListener("DOMContentLoaded", async function () {
    const theme = localStorage.getItem("theme");
    if (theme) {
        const themeSelect = document.getElementById("theme-select");
        themeSelect.value = theme;

        const themeLink = document.getElementById("theme");
        themeLink.href = await api.pathJoin(await api.getSrcDir(), 'common', theme + '-theme.css');
    }

    if (theme === "streamer") {
        const streamerColor = localStorage.getItem("streamer-color");
        if (streamerColor) {
            const streamerColorInput = document.getElementById("streamer-color");
            streamerColorInput.value = streamerColor;
            setStreamerColor();
        }

        const streamerTextColor = localStorage.getItem("streamer-text-color");
        if (streamerTextColor) {
            const streamerTextColorInput = document.getElementById("streamer-text-color");
            streamerTextColorInput.value = streamerTextColor;
            setStreamerTextColor();
        }
    }
});

async function setTheme() {
    const themeSelect = document.getElementById("theme-select");
    const theme = themeSelect.value;
    const themeLink = document.getElementById("theme");

    if (theme === "streamer") {
        // ...
    } else {
        // remove streamer color settings from local storage
        localStorage.removeItem("streamer-color");
        localStorage.removeItem("streamer-text-color");

        // set default styles
        document.body.style.background = null;
        document.body.style.color = null;
        document.documentElement.style.setProperty('--streamer-color', '#FFF');
        document.documentElement.style.setProperty('--streamer-text-color', '#000');
    }

    themeLink.href = await api.pathJoin(await api.getSrcDir(), 'common', theme + '-theme.css');
    localStorage.setItem("theme", theme);
}

function setStreamerColor() {
    const theme = localStorage.getItem("theme");
    if (theme === "streamer") {
        const streamerColorInput = document.getElementById("streamer-color");
        const streamerColor = streamerColorInput.value;

        document.body.style.background = streamerColor;
        document.documentElement.style.setProperty('--streamer-color', streamerColor);

        localStorage.setItem("streamer-color", streamerColor);
    }
}

function setStreamerTextColor() {
    const theme = localStorage.getItem("theme");
    if (theme === "streamer") {
        const streamerTextColorInput = document.getElementById("streamer-text-color");
        const streamerTextColor = streamerTextColorInput.value;

        document.body.style.color = streamerTextColor;
        document.documentElement.style.setProperty('--streamer-text-color', streamerTextColor);

        localStorage.setItem("streamer-text-color", streamerTextColor);
    }
}