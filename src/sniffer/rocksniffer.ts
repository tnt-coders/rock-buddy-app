import { logMessage } from "../common/functions";

export class Rocksniffer {
    public static readonly timeout: number = 100; // milliseconds
    private static readonly requiredVersion: string = 'v0.4.1-buddy';

    private readonly _path: string;
    private _host: string | undefined;
    private _port: number | undefined;

    private constructor(path: string) {
        this._path = path;
    }

    // Locate the bundled reader and load the address of its local data server.
    public static async create() {
        const rocksnifferPath = await window.api.getRocksnifferPath();

        const rocksniffer = new Rocksniffer(rocksnifferPath);

        await rocksniffer.configure();

        return rocksniffer;
    }

    // Read one snapshot with a short timeout and reject incompatible reader versions.
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
                    throw new Error('Unsupported RockSniffer version. Close other RockSniffer instances and restart Rock Buddy to use its packaged reader.');
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

    // Read the local reader address and ensure its data server is enabled.
    private async configure(): Promise<void> {
        const addonConfigFile = await window.api.pathJoin(this._path, 'config', 'addons.json');

        // Give RockSniffer 1000ms to create the file (it creates it on first startup)
        if (!await window.api.waitForFile(addonConfigFile, 1000)) {
            throw new Error('RockSniffer could not start. Install the .NET 8 console runtime, then restart Rock Buddy.');
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