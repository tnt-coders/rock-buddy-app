import { post } from '../common/functions';

const authData = JSON.parse(window.sessionStorage.getItem('auth_data') as any);

export class Profile {
    private readonly _saveButtonElement = document.getElementById('save_button') as HTMLElement;

    // Title
    private readonly _titleElement = document.getElementById('title') as HTMLElement;

    // Profile data
    private readonly _twitchUsenameElement = document.getElementById('twitch_username') as HTMLInputElement;

    // Stats
    private readonly _verifiedScoresOverallElement = document.getElementById('verified_scores_overall') as HTMLElement;
    private readonly _verifiedScoresLeadElement = document.getElementById('verified_scores_lead') as HTMLElement;
    private readonly _verifiedScoresRhythmElement = document.getElementById('verified_scores_rhythm') as HTMLElement;
    private readonly _verifiedScoresBassElement = document.getElementById('verified_scores_bass') as HTMLElement;
    private readonly _accuracyOverallElement = document.getElementById('accuracy_overall') as HTMLElement;
    private readonly _accuracyLeadElement = document.getElementById('accuracy_lead') as HTMLElement;
    private readonly _accuracyRhythmElement = document.getElementById('accuracy_rhythm') as HTMLElement;
    private readonly _accuracyBassElement = document.getElementById('accuracy_bass') as HTMLElement;

    public static async create(): Promise<Profile> {
        const profile = new Profile();
        await profile.init();
        return profile;
    }

    private async load(): Promise<void> {
        this.updateProfile();
        this.updateStats();
    }

    private async save(): Promise<void> {
        const twitchUsername = this._twitchUsenameElement.value;

        const host = await window.api.getHost();
        const response = await post(host + '/api/data/set_user_profile_data.php', {
            auth_data: authData,
            twitch_username: twitchUsername
        });

        if ('error' in response) {
            window.api.error(response['error']);
            return;
        }
    }

    private async updateProfile(): Promise<void> {
        const host = await window.api.getHost();

        const response = await post(host + '/api/data/get_user_profile_data.php', {
            auth_data: authData,
            user_id: authData.user_id
        });

        if ('error' in response) {
            window.api.error(response['error']);
            return;
        }

        // Update the display
        this._titleElement.innerText = 'Profile (' + response['username'] + ')';
        this._twitchUsenameElement.value = response['twitch_username'];
    }

    private async updateStats(): Promise<void> {
        const host = await window.api.getHost();

        const response = await post(host + '/api/data/get_user_stats.php', {
            auth_data: authData,
            user_id: authData.user_id
        });

        if ('error' in response) {
            window.api.error(response['error']);
            return;
        }

        // Update the display
        this._verifiedScoresOverallElement.innerText = response['verified_scores']['overall'];
        this._verifiedScoresLeadElement.innerText = response['verified_scores']['lead'];
        this._verifiedScoresRhythmElement.innerText = response['verified_scores']['rhythm'];
        this._verifiedScoresBassElement.innerText = response['verified_scores']['bass'];
        this._accuracyOverallElement.innerText = (response['accuracy']['overall'] * 100).toFixed(2) + '%';
        this._accuracyLeadElement.innerText = (response['accuracy']['lead'] * 100).toFixed(2) + '%';
        this._accuracyRhythmElement.innerText = (response['accuracy']['rhythm'] * 100).toFixed(2) + '%';
        this._accuracyBassElement.innerText = (response['accuracy']['bass'] * 100).toFixed(2) + '%';
    }

    private async init(): Promise<void> {
        this._saveButtonElement.addEventListener('click', this.save.bind(this));
        this.load();
    }
};