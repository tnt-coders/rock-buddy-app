export class Rocksmith {
    private readonly _profilePath: string;
    private _profileData: any;
    private _profileTimestamp: number = 0;
    public readonly importHistory: boolean;

    public static async create() {
        // Local save selection is only for historical scores, not account ownership.
        const config = await window.api.resolveRocksmithConfig();
        return new Rocksmith(config?.profilePath ?? '', !!config?.profilePath);
    }

    private constructor(profilePath: string, importHistory: boolean) {
        this._profilePath = profilePath;
        this.importHistory = importHistory;
    }

    public async newProfileDataAvailable(): Promise<boolean> {
        if (!this.importHistory) return false;
        const profileTimestamp = await window.api.getFileTimestamp(this._profilePath);
        return this._profileTimestamp !== profileTimestamp;
    }

    public async getProfileData(): Promise<any> {
        if (!this.importHistory) return null;
        if (await this.newProfileDataAvailable()) {
            this._profileTimestamp = await window.api.getFileTimestamp(this._profilePath);
            this._profileData = await window.api.readRocksmithData(this._profilePath);
        }

        return this._profileData;
    }
};
