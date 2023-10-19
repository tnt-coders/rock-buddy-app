import { post } from '../common/functions';

const authData = JSON.parse(window.sessionStorage.getItem('auth_data') as any);

export class Stats {
    private readonly _verifiedScoresOverallElement = document.getElementById('verified_scores_overall') as HTMLElement;
    private readonly _verifiedScoresLeadElement = document.getElementById('verified_scores_lead') as HTMLElement;
    private readonly _verifiedScoresRhythmElement = document.getElementById('verified_scores_rhythm') as HTMLElement;
    private readonly _verifiedScoresBassElement = document.getElementById('verified_scores_bass') as HTMLElement;
    private readonly _accuracyOverallElement = document.getElementById('accuracy_overall') as HTMLElement;
    private readonly _accuracyLeadElement = document.getElementById('accuracy_lead') as HTMLElement;
    private readonly _accuracyRhythmElement = document.getElementById('accuracy_rhythm') as HTMLElement;
    private readonly _accuracyBassElement = document.getElementById('accuracy_bass') as HTMLElement;

    public static async create(): Promise<Stats> {
        const stats = new Stats();
        await stats.init();
        return stats;
    }

    private async init(): Promise<void> {
        const host = await window.api.getHost();
        const response = await post(host + '/api/data/get_stats_user.php', {
            auth_data: authData
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
};