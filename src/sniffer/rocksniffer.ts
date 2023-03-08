class Rocksniffer {
  private static requiredVersion: string = 'v0.4.1';

  private path: string;
  private host: string | undefined;
  private port: number | undefined;
  private connected: boolean = false;

  public static async create(path: string): Promise<Rocksniffer> {
    const rocksniffer = new Rocksniffer(path);
    await rocksniffer.init();
    return rocksniffer;
  }

  public async sniff(): Promise<JSON | null> {
    if (!this.connected) {
      return null;
    }

    try {
      const response = await fetch('http://' + this.host + ':' + this.port);
      const data = await response.json();
      if (data.hasOwnProperty('Success') && data.Success === true) {
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
    this.path = path;
  }

  private async init(): Promise<void> {
    await this.verifyPath();
    await this.verifyVersion();
    await this.connect();
  }

  private async verifyPath(): Promise<void> {
    if (!await window.api.directoryExists(this.path)) {
      throw new Error('Rocksniffer path not found.');
    }
  }

  private async verifyVersion(): Promise<void> {
    const regex = /RockSniffer\s(\d+\.\d+\.\d+)$/i;
    const match = regex.exec(this.path);
    const version = match ? match[1] : null;

    if (version === null) {
      throw new Error('Rocksniffer version could not be verified.');
    }

    if (!await window.api.semverGte(version, Rocksniffer.requiredVersion)) {
      throw new Error('Rocksniffer v0.4.1 or greater required.');
    }
  }

  private async connect(): Promise<void> {
    const addonConfigFile = await window.api.pathJoin(this.path, 'config', 'addons.json');
    const addonConfig = JSON.parse(await window.api.readFile(addonConfigFile));

    // Verify contents are valid
    if (!addonConfig.hasOwnProperty('enableAddons')
      || !addonConfig.hasOwnProperty('host')
      || !addonConfig.hasOwnProperty('port')) {
      throw new Error('Rocksniffer config/addons.json is invalid.');
    }

    // Enable addons if they are disabled
    if (!addonConfig.enableAddons) {
      console.log('Enabling Rocksniffer addons.');
      addonConfig.enableAddons = true;
      await window.api.writeFile(addonConfigFile, JSON.stringify(addonConfig, null, 2));
    }

    this.host = addonConfig.host;
    this.port = parseInt(addonConfig.port);
    this.connected = true;
  }
};