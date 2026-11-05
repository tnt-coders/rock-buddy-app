import { Fragment, useRef, type ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useSession } from './Session';
import { HeaderThemeChooser } from './Theme';
import { usePagePrefetch } from './PagePrefetch';

const pages = ['Sniffer', 'Search', 'Rank', 'Profile', 'Config', 'Account'];

// Offer a way back to login on public pages, or sign out of the current session.
export function HeaderAccount() {
    const { state, logout } = useSession();
    const signingOut = useRef(false);

    // Ignore repeat clicks while the saved login is being removed.
    async function signOut() {
        if (signingOut.current) return;
        signingOut.current = true;

        try {
            await logout();
        } catch {
            // The session has already closed, so report storage failures outside that screen.
            window.api.error('You are signed out, but Rock Buddy could not remove your saved login. It may sign you in again when reopened.');
        } finally {
            signingOut.current = false;
        }
    }

    if (state.status === 'signed-out') {
        return <NavLink className="header-tab" to="/login">Sign in</NavLink>;
    }

    if (!state.auth) return null;

    return (
        <button className="header-signout" type="button" aria-label="Sign out" title="Sign out"
            onClick={() => void signOut()}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 5H4v14h5M10 12h11m-4-4 4 4-4 4" />
            </svg>
        </button>
    );
}

// Show account-appropriate navigation and warm page data on hover or keyboard focus.
export function AppHeader({ compact = false, children }: { compact?: boolean; children?: ReactNode }) {
    const prefetch = usePagePrefetch();
    const links = compact ? [] : pages;
    return (
        <nav className="navtop" aria-label="Main navigation">
            <Link className="header-brand" to="/sniffer">
                <img src="../images/icon-256x256.png" width={28} height={28} alt="" />
                <span className="header-title">Rock Buddy</span>
            </Link>
            {links.map((name) => (
                <Fragment key={name}>
                {name === 'Config' && <HeaderThemeChooser />}
                <NavLink
                    className="header-tab"
                    to={`/${name.toLowerCase()}`}
                    onMouseEnter={() => prefetch(`/${name.toLowerCase()}`)}
                    onFocus={() => prefetch(`/${name.toLowerCase()}`)}
                    aria-label={name}
                    style={compact ? { marginLeft: 'auto' } : undefined}
                >
                    {name}
                </NavLink>
                </Fragment>
            ))}
            {children}
        </nav>
    );
}
