import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { request } from '../ui/api';
import { useSession } from '../ui/Session';
import { useAction } from '../ui/useAction';
import { validateEmail, validatePassword, validateUsername } from '../ui/validation';

// Use the same form for sign-in and signup while keeping their requests separate.
export function AuthPage({ signup = false }: { signup?: boolean }) {
    const session = useSession();
    const navigate = useNavigate();
    const action = useAction();
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmation, setConfirmation] = useState('');
    const [notice, setNotice] = useState('');

    if (session.state.auth) return <Navigate to="/" replace />;

    // Create an account or sign in, then clear the password fields even if the request fails.
    function submit(event: FormEvent) {
        event.preventDefault();
        void action.run(async () => {
            try {
                if (signup) {
                    validateUsername(username);
                    validateEmail(email);
                    validatePassword(password, confirmation);
                    await request('auth/sign_up', { username, email, password });
                    window.api.info('User created successfully.');
                    navigate('/login', { replace: true });
                } else {
                    await session.login(username, password);
                    navigate('/', { replace: true });
                }
            } finally {
                setPassword('');
                setConfirmation('');
            }
        });
    }

    // Request a reset email for the entered account without signing the user in.
    function resetPassword() {
        void action.run(async () => {
            if (!username.trim()) throw new Error('Please enter your username or email.');
            await request('account/send_password_reset_email', { username_or_email: username });
            setNotice('Check your email for a reset link.');
        });
    }

    return (
        <main className="auth-page">
            <h1>{signup ? 'Sign Up' : 'Rock Buddy'}</h1>
            <form onSubmit={submit}>
                <fieldset disabled={action.pending}>
                    <input
                        aria-label={signup ? 'Username' : 'Username or email'}
                        placeholder={signup ? 'Username' : 'Username or email'}
                        autoComplete="username"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        required
                    />
                    {signup && (
                        <input
                            aria-label="Email"
                            placeholder="Email"
                            type="email"
                            autoComplete="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                        />
                    )}
                    <input
                        aria-label="Password"
                        placeholder="Password"
                        type="password"
                        autoComplete={signup ? 'new-password' : 'current-password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                    />
                    {signup && (
                        <input
                            aria-label="Confirm password"
                            placeholder="Confirm password"
                            type="password"
                            autoComplete="new-password"
                            value={confirmation}
                            onChange={(e) => setConfirmation(e.target.value)}
                            required
                        />
                    )}
                    <button className="btn btn-primary" type="submit">
                        {action.pending ? 'Please wait...' : signup ? 'Sign Up' : 'Log In'}
                    </button>
                    {!signup && (
                        <button className="text-button" type="button" onClick={resetPassword}>
                            Forgot password?
                        </button>
                    )}
                </fieldset>
            </form>
            {(action.error || session.state.error) && (
                <p role="alert">{action.error || session.state.error}</p>
            )}
            {notice && <p role="status">{notice}</p>}
            <p>
                <Link to={signup ? '/login' : '/signup'}>{signup ? 'Log In' : 'Sign Up'}</Link>
            </p>
            <img className="rockbuddy" src="../images/rock-buddy.png" alt="Rock Buddy" />
        </main>
    );
}
