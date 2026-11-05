import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { request } from '../ui/api';
import { useAuth, useSession } from '../ui/Session';
import { useAction } from '../ui/useAction';
import { useResource } from '../ui/useResource';
import { AsyncState } from '../ui/AsyncState';
import { useQueryClient } from '@tanstack/react-query';
import { invalidatePageData } from '../ui/PageData';
import {
    usernameWaitMessage,
    validateUsername,
    validateEmail,
    validatePassword,
} from '../ui/validation';

// Share account-edit validation, cooldowns and password cleanup across the three forms.
export function ChangeAccountPage({ field }: { field: 'username' | 'email' | 'password' }) {
    const auth = useAuth();
    const client = useQueryClient();
    const session = useSession();
    const navigate = useNavigate();
    const action = useAction();
    const [value, setValue] = useState('');
    const [password, setPassword] = useState('');
    const [confirmation, setConfirmation] = useState('');
    const [remaining, setRemaining] = useState(0);

    // Fetch the username cooldown before allowing a username change.
    const info = useResource(`change:${auth.user_id}:${field}`, async () => {
        if (field !== 'username') return { deadline: 0 };
        const account = await request('account/get_account_info', auth);
        const seconds = account.username_change_wait_seconds;
        return {
            deadline:
                performance.now() + (Number.isFinite(seconds) ? Math.max(0, seconds) * 1000 : 0),
        };
    });

    // Use a monotonic deadline so a local clock adjustment cannot extend the wait.
    useEffect(() => {
        if (!info.data) return;
        const update = () =>
            setRemaining(Math.max(0, (info.data!.deadline - performance.now()) / 1000));
        update();
        const timer = setInterval(update, 1000);
        return () => clearInterval(timer);
    }, [info.data]);

    // Validate the edit, save it, and refresh any pages that show the changed account.
    function submit(event: FormEvent) {
        event.preventDefault();
        if (remaining > 0 || info.loading || info.refreshing || info.error) return;
        void action.run(async () => {
            try {
                if (field === 'username') validateUsername(value);
                if (field === 'email') validateEmail(value);
                if (field === 'password') validatePassword(value, confirmation);
                await request(`account/change_${field}`, {
                    auth_data: auth,
                    [`new_${field}`]: value,
                    password,
                });

                // Refresh cached names and recheck activation after changing the email address.
                await invalidatePageData(client);
                if (field === 'email') await session.refresh();
                navigate(field === 'email' ? '/activation' : '/account', { replace: true });
            } finally {
                // Do not retain either the old or new password after a submission attempt.
                setPassword('');
                if (field === 'password') {
                    setValue('');
                    setConfirmation('');
                }
            }
        });
    }

    return (
        <main className="auth-page">
            <h1>Change {field}</h1>
            <AsyncState {...info} retry={info.reload} />
            {field === 'username' && (
                <p>
                    {remaining > 0
                        ? usernameWaitMessage(remaining)
                        : 'Warning: You can only change your username once every 30 days.'}
                </p>
            )}
            <form onSubmit={submit}>
                <fieldset
                    disabled={action.pending || info.loading || info.refreshing || !!info.error || remaining > 0}
                >
                    <input
                        aria-label={`New ${field}`}
                        placeholder={`New ${field}`}
                        type={field === 'username' ? 'text' : field}
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        required
                    />
                    {field === 'password' && (
                        <input
                            aria-label="Confirm new password"
                            placeholder="Confirm new password"
                            type="password"
                            value={confirmation}
                            onChange={(e) => setConfirmation(e.target.value)}
                            required
                        />
                    )}
                    <input
                        aria-label="Current password"
                        placeholder="Current password"
                        type="password"
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                    />
                    <button className="btn-primary" type="submit">
                        Change {field}
                    </button>
                </fieldset>
            </form>
            <AsyncState error={action.error} />
            <p>
                <Link to="/account">Go back</Link>
            </p>
        </main>
    );
}
