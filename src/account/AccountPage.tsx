import { Link } from 'react-router-dom';
import { request } from '../ui/api';
import { useAuth, useSession } from '../ui/Session';
import { useResource } from '../ui/useResource';
import { AsyncState } from '../ui/AsyncState';
import { useAction } from '../ui/useAction';
import { accountInfo } from '../ui/pageResources';

export function AccountPage() {
    const auth = useAuth();
    const { logout } = useSession();
    const action = useAction();
    const account = useResource(accountInfo(auth));

    return (
        <main>
            <h1>Account</h1>
            <AsyncState {...account} retry={account.reload} />
            {account.data && (
                <dl className="account-fields">
                    <dt>Username</dt>
                    <dd>
                        <span>{account.data.username}</span>
                        <Link to="/account/username" aria-label="Change username">Change</Link>
                    </dd>
                    <dt>Email</dt>
                    <dd>
                        <span>{account.data.email}</span>
                        <Link to="/account/email" aria-label="Change email">Change</Link>
                    </dd>
                    <dt>Password</dt>
                    <dd>
                        <span>******</span>
                        <Link to="/account/password" aria-label="Change password">Change</Link>
                    </dd>
                </dl>
            )}
            <button
                className="btn-primary"
                disabled={action.pending}
                onClick={() => void action.run(logout)}
            >
                Logout
            </button>
            <AsyncState error={action.error} />
        </main>
    );
}

export function ActivationPage() {
    const auth = useAuth();
    const { refresh, logout } = useSession();
    const action = useAction();
    const account = useResource(`activation:${auth.user_id}`, () =>
        request('account/get_account_info', auth),
    );

    return (
        <main className="center-page">
            <h1>Activate your account</h1>
            <AsyncState {...account} retry={account.reload} />
            {account.data && <p>Check {account.data.email} for your activation link.</p>}
            <button
                disabled={action.pending}
                onClick={() =>
                    void action.run(async () => {
                        await request('account/send_activation_email', auth);
                        window.api.info('Email sent.');
                    })
                }
            >
                Send activation email
            </button>
            <p>
                <Link to="/account/email">Change email</Link>
            </p>
            <button disabled={action.pending} onClick={() => void action.run(refresh)}>
                I've activated my account
            </button>
            <button disabled={action.pending} onClick={() => void action.run(logout)}>
                Logout
            </button>
            <AsyncState error={action.error} />
        </main>
    );
}
