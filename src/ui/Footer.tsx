import { useEffect, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

// Keep the year current even when a window stays open across New Year's midnight.
export function Footer({ children, links }: { children?: ReactNode; links?: ReactNode }) {
    const [year, setYear] = useState(() => new Date().getFullYear());

    useEffect(() => {
        const refresh = () => setYear(new Date().getFullYear());
        const timer = window.setInterval(refresh, 60_000);
        window.addEventListener('focus', refresh);

        return () => {
            window.clearInterval(timer);
            window.removeEventListener('focus', refresh);
        };
    }, []);

    return (
        <footer>
            {children}
            <p>Copyright &copy; {year}{' '}
                <a href="mailto:tntmusicstudios2018@gmail.com" title="Email tntmusicstudios2018@gmail.com" onClick={event => {
                    event.preventDefault();
                    window.api.openExternalLink(event.currentTarget.href);
                }}>TNTMusicStudios</a>
            </p>
            {links}
        </footer>
    );
}

// Open support above the current page without changing its path or saved inputs.
export function FooterLinks() {
    const [params, setParams] = useSearchParams();
    function openSupport() {
        const next = new URLSearchParams(params);
        next.set('support', '1');
        setParams(next, { replace: true });
    }

    return <div className="footer-links">
        <button type="button" className="footer-support" onClick={openSupport} aria-label="Support Rock Buddy" title="Support Rock Buddy" aria-haspopup="dialog">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" height="24" width="24" fill="currentColor" aria-hidden="true" focusable="false">
                <path d="M0.95,13.3q-0.45-0.9-0.7-1.82T0,9.6Q0,6.8 1.9,4.9T6.6,3q1.58,0 3,0.66T12,5.5q0.98-1.18 2.4-1.84T17.4,3q2.8,0 4.7,1.9T24,9.6q0,0.95-0.25,1.88t-0.7,1.82q-0.27-0.47-0.65-0.85t-0.88-0.6q0.22-0.58 0.35-1.13Q22,10.17 22,9.6q0-1.95-1.32-3.28T17.4,5q-2.03,0-3.11,1.11Q13.2,7.22 12,8.6Q10.8,7.2 9.71,6.1T6.6,5Q4.65,5 3.33,6.32T2,9.6q0,0.57 0.13,1.13q0.13,0.55 0.35,1.13q-0.5,0.22-0.88,0.6T0.95,13.3ZM0,22V20.43q0-1.1 1.11-1.76T4,18q0.33,0 0.63,0.01T5.2,18.08q-0.35,0.5-0.53,1.07Q4.5,19.73 4.5,20.38V22H0Zm6,0V20.38q0-1.63 1.66-2.63t4.34-1q2.7,0 4.35,1T18,20.38V22H6Zm13.5,0V20.38q0-0.65-0.16-1.23q-0.16-0.57-0.49-1.07q0.27-0.05 0.56-0.06T20,18q1.8,0 2.9,0.66T24,20.43V22H19.5ZM12,18.75q-1.42,0-2.55,0.38T8.13,20H15.9q-0.22-0.5-1.34-0.88T12,18.75ZM4,17q-0.82,0-1.41-0.59T2,15q0-0.85 0.59-1.43T4,13q0.85,0 1.43,0.57T6,15q0,0.82-0.57,1.41T4,17Zm16,0q-0.82,0-1.41-0.59T18,15q0-0.85 0.59-1.43T20,13q0.85,0 1.43,0.57T22,15q0,0.82-0.57,1.41T20,17Zm-8-1q-1.25,0-2.13-0.88T9,13q0-1.28 0.88-2.14T12,10q1.28,0 2.14,0.86Q15,11.73 15,13q0,1.25-0.86,2.13T12,16Zm0-4q-0.42,0-0.71,0.29T11,13t0.29,0.71T12,14t0.71-0.29Q13,13.43 13,13t-0.29-0.71T12,12Zm0,1Zm0.03,7Z" />
            </svg>
        </button>
        <Link className="team-link" to="/team">Team</Link>
    </div>;
}
