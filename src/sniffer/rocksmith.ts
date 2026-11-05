export class Rocksmith {
    private readonly _profilePath: string;
    private _profileData: any;
    private _profileTimestamp: number = 0;
    public readonly importHistory: boolean;

    // Find the selected save, or continue without history when discovery is ambiguous.
    public static async create() {
        // Local save selection is only for historical scores, not account ownership.
        const config = await window.api.resolveRocksmithConfig();
        return new Rocksmith(config?.profilePath ?? '', !!config?.profilePath);
    }

    private constructor(profilePath: string, importHistory: boolean) {
        this._profilePath = profilePath;
        this.importHistory = importHistory;
    }

    // Check the save timestamp before reading its contents again.
    public async newProfileDataAvailable(): Promise<boolean> {
        if (!this.importHistory) return false;
        const profileTimestamp = await window.api.getFileTimestamp(this._profilePath);
        return this._profileTimestamp !== profileTimestamp;
    }

    // Reuse decoded history until Rocksmith writes a newer save.
    public async getProfileData(): Promise<any> {
        if (!this.importHistory) return null;
        if (await this.newProfileDataAvailable()) {
            this._profileTimestamp = await window.api.getFileTimestamp(this._profilePath);
            this._profileData = await window.api.readRocksmithData(this._profilePath);
        }

        return this._profileData;
    }
};
