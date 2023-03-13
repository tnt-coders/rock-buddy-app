class Rocksniffer {
  private static requiredVersion: string = 'v0.4.1';

  private _path: string;
  private _host: string | undefined;
  private _port: number | undefined;
  private _connected: boolean = false;

  public constructor(path: string) {
    this._path = path;
  }

  public async connect(): Promise<void> {
    
    await this.verifyPath();

    await this.configure();

    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, 100); // Set timeout of 100ms

    try {
      const response = await fetch('http://' + this._host + ':' + this._port, { signal: controller.signal });
      const data = await response.json();
      clearTimeout(timeout);

      // Verify the version
      if (!data.hasOwnProperty('Version')) {
        throw new Error('Rocksniffer version could not be verified.');
      }
      else if (!await window.api.semverGte(data.Version, Rocksniffer.requiredVersion)) {
        throw new Error('Rocksniffer ' + Rocksniffer.requiredVersion + ' or greater required.');
      }

      this._connected = true;
    }
    catch(error) {
      clearTimeout(timeout);
      throw new Error('Failed to connect to Rocksniffer.');
    }
  }

  public connected(): boolean {
    return this._connected;
  }

  public async sniff(): Promise<JSON | null> {
    if (!this._connected) {
      throw new Error('Rocksniffer connection has not yet been established.');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, 100); // Set timeout of 100ms

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
      return null;
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