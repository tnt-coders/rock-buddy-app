import { UserData } from '../common/user_data';

export class Rocksmith {
  private static readonly appId: string = '221680';

  private readonly _profilePath: string;
  private _profileData: any;
  private _profileTimestamp: number = 0;
  
  public static async create() {
    const steamUserDataPath = await UserData.get('steam_user_data_path');
    if (steamUserDataPath === null) {
      throw new Error('Steam user data path not set, please check the config.');
    }

    const steamProfile = await UserData.get('steam_profile');
    if (steamProfile === null) {
      throw new Error('Steam profile not set, please check the config.');
    }

    const rocksmithProfile = await UserData.get('rocksmith_profile');
    if (rocksmithProfile === null) {
      throw new Error('Rocksmith profile not set, please check the config.');
    }
    
    const profilePath = await window.api.pathJoin(steamUserDataPath, steamProfile, Rocksmith.appId, 'remote', rocksmithProfile + '_PRFLDB');

    return new Rocksmith(profilePath);
  }

  private constructor(profilePath: string) {
    this._profilePath = profilePath;
  }

  public async newProfileDataAvailable(): Promise<boolean> {
    const profileTimestamp = await window.api.getFileTimestamp(this._profilePath);
    return this._profileTimestamp !== profileTimestamp;
  }

  public async getProfileData(): Promise<any> {
    if (await this.newProfileDataAvailable()) {
      this._profileData = await window.api.readRocksmithData(this._profilePath);
    }
    
    return this._profileData;
  }
};