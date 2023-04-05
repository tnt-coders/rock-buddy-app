import { UserData } from '../common/user_data';

export class Rocksniffer {
  private static readonly requiredVersion: string = 'v0.4.1';
  private static readonly timeout: number = 100; // milliseconds

  private readonly _path: string;
  private _host: string | undefined;
  private _port: number | undefined;

  private constructor(path: string) {
    this._path = path;
  }

  public static async create() {
    const rocksnifferPath = await UserData.get('rocksniffer_path');
    if (rocksnifferPath !== null) {
      const rocksniffer = new Rocksniffer(rocksnifferPath);

      await rocksniffer.verifyPath();

      await rocksniffer.configure();

      return rocksniffer;
    }
    else {
      throw new Error('Rocksniffer path not set, please check the config.');
    }
  }

  public async sniff(): Promise<any> {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, Rocksniffer.timeout);

    try {
      const response = await fetch('http://' + this._host + ':' + this._port, { signal: controller.signal });
      const data = await response.json();
      clearTimeout(timeout);
      if (data.hasOwnProperty('success') && data.success === true) {
        return data;
      }
      else {
        return null;
      }
    }
    catch(error) {
      clearTimeout(timeout);
      throw new Error('Waiting for Rocksniffer...');
    }
  }

  private async verifyPath(): Promise<void> {
    if (!await window.api.directoryExists(this._path)) {
      throw new Error('Rocksniffer path not found.');
    }
  }

  private async configure(): Promise<void> {
    const addonConfigFile = await window.api.pathJoin(this._path, 'config', 'addons.json');
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