export class Rocksniffer {
    public static readonly timeout: number = 200; // milliseconds
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
                          + "This can happen if Rock Buddy is not run with sufficient permissions. Please try running as administrator.</p>"
            );
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
            console.log('Enabling Rocksniffer addons.');
            addonConfig.enableAddons = true;
            await window.api.writeFile(addonConfigFile, JSON.stringify(addonConfig, null, 2));
        }

        this._host = addonConfig.ipAddress;
        this._port = parseInt(addonConfig.port);
    }
}