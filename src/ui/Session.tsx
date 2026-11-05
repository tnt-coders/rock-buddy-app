import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { request, errorMessage, type AuthData } from './api';
import { PageDataProvider } from './PageData';
import { SearchStateProvider } from './SearchState';

type SessionState =
    | { status: 'loading' | 'signed-out'; auth: null; error?: string }
    | { status: 'ready' | 'activation'; auth: AuthData; error?: string }
    | { status: 'error'; auth: null; error: string };

const signedOut: SessionState = { status: 'signed-out', auth: null };
const SessionContext = createContext<{
    state: SessionState;
    login: (username: string, password: string) => Promise<void>;
    logout: () => Promise<void>;
    refresh: () => Promise<void>;
} | null>(null);

// Keep the bridge's per-user configuration in sync with the authenticated account.
function remember(auth: AuthData | null) {
    if (auth) {
        sessionStorage.setItem('auth_data', JSON.stringify(auth));
        sessionStorage.setItem('user_id', String(auth.user_id));
    } else {
        sessionStorage.removeItem('auth_data');
        sessionStorage.removeItem('user_id');
    }
}

// Check saved credentials and determine whether the account still needs activation.
async function validate(auth: AuthData): Promise<SessionState> {
    const result = await request('auth/authenticate', auth);
    if (!result.success) return signedOut;
    if (result.updated) await window.api.clearRocksnifferCache();

    const activation = await request('account/check_account_activation', auth);
    return { status: activation.activated ? 'ready' : 'activation', auth };
}

// Own the signed-in account and replace its private page cache when it changes.
export function SessionProvider({ children }: { children: ReactNode }) {
    const [state, setState] = useState<SessionState>({ status: 'loading', auth: null });

    // Recheck the saved login after a connection failure or an account change.
    async function refresh() {
        setState({ status: 'loading', auth: null });
        try {
            const auth = await window.api.storeGet('auth_data');
            const next = auth ? await validate(auth) : signedOut;
            remember(next.auth);
            setState(next);
        } catch (error) {
            setState({ status: 'error', auth: null, error: errorMessage(error) });
        }
    }

    // Defer startup so Strict Mode's discarded effect cannot start a second login.
    useEffect(() => {
        let active = true;
        void Promise.resolve().then(async () => {
            if (!active) return;
            try {
                const auth = await window.api.storeGet('auth_data');
                if (!active) return;
                const next = auth ? await validate(auth) : signedOut;
                if (active) {
                    remember(next.auth);
                    setState(next);
                }
            } catch (error) {
                if (active) setState({ status: 'error', auth: null, error: errorMessage(error) });
            }
        });

        // Close protected screens when the API rejects the current session.
        const expire = () => {
            remember(null);
            setState({ ...signedOut, error: 'Please log back in to verify your identity.' });
        };
        window.addEventListener('session-expired', expire);
        return () => {
            active = false;
            window.removeEventListener('session-expired', expire);
        };
    }, []);

    // Validate a fresh login before saving its credentials and opening protected pages.
    async function login(username: string, password: string) {
        const auth = await request<AuthData>('auth/login', {
            username_or_email: username,
            password,
        });
        const next = await validate(auth);
        if (!next.auth) throw new Error('Unable to sign in. Please try again.');
        await window.api.storeSet('auth_data', auth);
        remember(auth);
        setState(next);
    }

    // End the current session and remove its saved credentials.
    async function logout() {
        // Clear the renderer session first so an old gameplay request cannot keep submitting.
        remember(null);
        setState(signedOut);
        await window.api.storeDelete('auth_data');
    }

    return (
        <SessionContext value={{ state, login, logout, refresh }}>
            <PageDataProvider key={state.auth?.user_id ?? 'signed-out'}>
                <SearchStateProvider>{children}</SearchStateProvider>
            </PageDataProvider>
        </SessionContext>
    );
}

export function useSession() {
    const session = useContext(SessionContext);
    if (!session) throw new Error('SessionProvider is missing.');
    return session;
}

// Require account credentials before a protected screen starts its requests.
export function useAuth() {
    const { state } = useSession();
    if (!state.auth) throw new Error('This page requires a signed-in account.');
    return state.auth;
}
