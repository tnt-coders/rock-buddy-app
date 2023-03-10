class Rocksniffer {
  private static requiredVersion: string = 'v0.4.1';

  private _path: string;
  private _host: string | undefined;
  private _port: number | undefined;
  private _connected: boolean = false;

  public static async create(path: string | null): Promise<Rocksniffer> {
    if (path === null) {
      throw new Error('Rocksniffer path is not defined.');
    }

    const rocksniffer = new Rocksniffer(path);
    await rocksniffer.init();
    return rocksniffer;
  }

  public connected(): boolean {
    return this._connected;
  }

  public async sniff(): Promise<JSON | null> {
    if (!this._connected) {
      return null;
    }

    try {
      const response = await fetch('http://' + this._host + ':' + this._port);
      const data = await response.json();
      if (data.hasOwnProperty('success') && data.success === true) {
        return data;
      }
      else {
        return null;
      }
    }
    catch {
      return null;
    }
  }

  private constructor(path: string) {
    this._path = path;
  }

  private async init(): Promise<void> {
    await this.verifyPath();
    await this.verifyVersion();
    await this.connect();
  }

  private async verifyPath(): Promise<void> {
    if (!await window.api.directoryExists(this._path)) {
      throw new Error('Rocksniffer path not found.');
    }
  }

  private async verifyVersion(): Promise<void> {
    const regex = /RockSniffer\s(\d+\.\d+\.\d+)$/i;
    const match = regex.exec(this._path);
    const version = match ? match[1] : null;

    if (version === null) {
      throw new Error('Rocksniffer version could not be verified.');
    }

    if (!await window.api.semverGte(version, Rocksniffer.requiredVersion)) {
      throw new Error('Rocksniffer v0.4.1 or greater required.');
    }
  }

  private async connect(): Promise<void> {
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
    this._connected = true;
  }
};