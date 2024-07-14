import { approxEqual, logMessage } from "../common/functions";

export class Rocksniffer {
    public static readonly timeout: number = 100; // milliseconds
    private static readonly requiredVersion: string = 'v0.4.1-buddy';

    private readonly _path: string;
    private _host: string | undefined;
    private _port: number | undefined;

    private constructor(path: string) {
        this._path = path;
    }

    public static async create() {
        const rocksnifferPath = await window.api.getRocksnifferPath();

        const rocksniffer = new Rocksniffer(rocksnifferPath);

        await rocksniffer.configure();

        return rocksniffer;
    }

    public async sniff(): Promise<any> {
        const controller = new AbortController();
        const timeout = setTimeout(() => {
            controller.abort();
        }, Rocksniffer.timeout);

        let waiting = true;

        try {
            const response = await fetch('http://' + this._host + ':' + this._port, { signal: controller.signal });
            const data = await response.json();
            clearTimeout(timeout);
            waiting = false;

            if (data.hasOwnProperty('Version')) {
                const version = data['Version'];
                const versionRegex = /-buddy$/;
                if (!await window.api.semverGte(version, Rocksniffer.requiredVersion) || !versionRegex.test(version)) {
                    throw new Error("<p>Unsupported version of RockSniffer detected. Please close RockSniffer and use the version packaged with Rock Buddy.<br>"
                                  + "<br>"
                                  + "Note: Rock Buddy should start the correct version of RockSniffer automatically when it is started.</p>");
                }
            }
            else {
                throw new Error("RockSniffer version could not be verified.\n\nRock Buddy may not function as expected.")
            }

            if (data.hasOwnProperty('success')) {
                return data;
            }
            else {
                return null;
            }
        }
        catch (error) {
            if (waiting) {
                logMessage("Rocksniffer timed out.");
                throw new Error("Rocksniffer timed out.");
            }
            
            throw error;
        }
        finally {
            clearTimeout(timeout);
        }
    }

    private async configure(): Promise<void> {
        const addonConfigFile = await window.api.pathJoin(this._path, 'config', 'addons.json');

        // Give RockSniffer 1000ms to create the file (it creates it on first startup)
        if (!await window.api.waitForFile(addonConfigFile, 1000)) {
            throw new Error("<p>Rocksniffer failed to create config/addons.json.<br>"
                          + "<br>"
                          + "This can happen if Rocksniffer fails to start. If this problem persists, try the following:<br>"
                          + "<ul>"
                          + "<li>Ensure <a href=\"https://dotnet.microsoft.com/en-us/download/dotnet/6.0/runtime\">.NET framework 6.0</a> (for console apps) is installed.</li>"
                          + "<li>Try running Rock Buddy as administrator.</li>"
                          + "</ul>"
                          + "<br>"
                          + "If these solutions do not resolve your issue, reach out to me in Discord. The link to my discord server can be found in the <a href=\"#\" onclick=\"openTwitchAboutPage()\">About</a> section on my twitch page.</p>");
        }

        const addonConfig = JSON.parse(await window.api.readFile(addonConfigFile));

        // Verify contents are valid
        if (!addonConfig.hasOwnProperty('enableAddons')
            || !addonConfig.hasOwnProperty('ipAddress')
            || !addonConfig.hasOwnProperty('port')) {
            throw new Error('Rocksniffer config/addons.json is invalid.');
        }

        // Enable addons if they are disabled
        if (!addonConfig.enableAddons) {
            logMessage('Enabling Rocksniffer addons.');
            addonConfig.enableAddons = true;
            await window.api.writeFile(addonConfigFile, JSON.stringify(addonConfig, null, 2));
        }

        this._host = addonConfig.ipAddress;
        this._port = parseInt(addonConfig.port);
    }
}