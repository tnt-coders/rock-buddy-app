import { useSearchParams } from 'react-router-dom';
import { SupportDialog } from '../support/SupportDialog';

const members = [
    ['TNTMusicStudios', 'Founder / Lead Developer', 'TNT.png'],
    ['MrsTNT33', 'Admin / Developer', 'MrsTNT.png'],
    ['Recontastic', 'UI Designer / Rubber Ducky', 'recon.png'],
    ['StajiW', 'Special FX / Guru', 'staji.png'],
    ['connor_harkness', 'Natural Product Enhancement', 'connor.png'],
    ['Jimmy_Pants_', 'Cloud Wrangler', 'jimmy-pants.png'],
];

export function TeamPage() {
    const [params, setParams] = useSearchParams();
    const supportOpen = params.get('support') === '1';
    function closeSupport() {
        const next = new URLSearchParams(params);
        next.delete('support');
        setParams(next, { replace: true });
    }

    return <main className="team-page">
        <div className="team-heading">
            <h1>Team Members</h1>
        </div>
        <ul className="list-team-members">{members.map(([name, role, image]) => <li key={name}>
            <a href={`https://www.twitch.tv/${name.toLowerCase()}`} onClick={event => { event.preventDefault(); window.api.openExternalLink(event.currentTarget.href); }}>
                <img src={`../images/${image}`} alt={name} /><span className="member-title">{name}</span><span className="member-title-hover">{role}</span>
            </a>
        </li>)}</ul>
        <div className="team-support-actions">
            <button className="team-support" type="button" aria-haspopup="dialog"
                onClick={() => setParams({ ...Object.fromEntries(params), support: '1' })}>
                Support Rock Buddy!
            </button>
        </div>
        {supportOpen && <SupportDialog onClose={closeSupport} />}
    </main>;
}
