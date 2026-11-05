import { useState } from 'react';
import { request } from '../ui/api';
import { useAuth } from '../ui/Session';
import { useResource } from '../ui/useResource';
import { useAction } from '../ui/useAction';
import { AsyncState } from '../ui/AsyncState';
import { Modal } from '../ui/Modal';
import { useQueryClient } from '@tanstack/react-query';
import { userProfile, userStats, type Profile } from '../ui/pageResources';

const paths = ['overall', 'lead', 'rhythm', 'bass'] as const;

// Keep an unsaved Twitch edit separate from the last profile returned by the server.
function TwitchForm({ profile, onSaved }: {
    profile: Profile;
    onSaved: (profile: Profile) => Promise<void>;
}) {
    const auth = useAuth();
    const action = useAction();
    const [draft, setDraft] = useState<string>();
    const twitch = draft ?? profile.twitch_username ?? '';
    const [saved, setSaved] = useState(false);

    return (
        <form
            className="profile-twitch-form"
            onSubmit={(event) => {
                event.preventDefault();
                void action.run(async () => {
                    await request('data/set_user_profile_data', {
                        auth_data: auth,
                        twitch_username: twitch,
                    });
                    await onSaved({ ...profile, twitch_username: twitch });
                    setDraft(undefined);
                    setSaved(true);
                });
            }}
        >
            <label>
                Twitch:{' '}
                <input
                    value={twitch}
                    disabled={action.pending}
                    onChange={(event) => {
                        setDraft(event.target.value);
                        setSaved(false);
                    }}
                />
            </label>
            <button className="btn-primary" disabled={action.pending}>
                Save
            </button>
            {saved && <span role="status"> Saved</span>}
            <AsyncState error={action.error} />
        </form>
    );
}

// Share profile details and statistics between the current account and player dialogs.
export function ProfileContent({ username }: { username?: string }) {
    const auth = useAuth();
    const client = useQueryClient();
    const profile = useResource(userProfile(auth, username));
    const stats = useResource(userStats(auth, username));

    return (
        <>
            <h1>Profile{profile.data ? ` (${profile.data.username})` : ''}</h1>
            <AsyncState {...profile} retry={profile.reload} />
            {profile.data &&
                (username ? (
                    <p>
                        Twitch:{' '}
                        {profile.data.twitch_username ? (
                            <a
                                href={`https://twitch.tv/${profile.data.twitch_username}`}
                                onClick={(event) => {
                                    event.preventDefault();
                                    window.api.openExternalLink(event.currentTarget.href);
                                }}
                            >
                                {profile.data.twitch_username}
                            </a>
                        ) : (
                            'N/A'
                        )}
                    </p>
                ) : (
                    <TwitchForm profile={profile.data} onSaved={async (saved) => {
                        // Other views of this profile should reread after an edit.
                        await client.invalidateQueries({
                            queryKey: ['resource'],
                            predicate: query => String(query.queryKey[1]).startsWith('profile:'),
                            refetchType: 'none',
                        });
                        await profile.setData(saved);
                    }} />
                ))}
            <AsyncState {...stats} retry={stats.reload} />
            {stats.data && (
                <div className="stats">
                    <StatGroup title="Verified Scores" values={stats.data.verified_scores} />
                    <StatGroup title="Accuracy" values={stats.data.accuracy} percentage />
                    {stats.data.verified_perfect_scores && (
                        <StatGroup
                            title="Verified 100% scores"
                            values={stats.data.verified_perfect_scores}
                            explanation="Distinct arrangements with a saved verified score of exactly 100%. Replays and duplicate chart versions count once."
                        />
                    )}
                </div>
            )}
        </>
    );
}

// Use the same instrument order for every profile statistic.
function StatGroup({
    title,
    values,
    percentage = false,
    explanation,
}: {
    title: string;
    values: Record<(typeof paths)[number], number | null>;
    percentage?: boolean;
    explanation?: string;
}) {
    return (
        <section>
            <h2 title={explanation}>{title}</h2>
            {paths.map((path) => (
                <div className="stats-entry" key={path}>
                    <span className="capitalize">{path}:</span>
                    <span>
                        {percentage ? `${((values[path] ?? 0) * 100).toFixed(2)}%` : values[path]}
                    </span>
                </div>
            ))}
        </section>
    );
}

export function ProfilePage() {
    return (
        <main>
            <ProfileContent />
        </main>
    );
}

export function ProfileDialog({ username, onClose }: { username: string; onClose: () => void }) {
    return (
        <Modal title="Player profile" onClose={onClose}>
            <ProfileContent username={username} />
        </Modal>
    );
}
