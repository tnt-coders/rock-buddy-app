import { useSearchParams } from 'react-router-dom';

const members = [
    ['TNTMusicStudios', 'Founder / Lead Developer', 'TNT.png'],
    ['MrsTNT33', 'Admin / Developer', 'MrsTNT.png'],
    ['Recontastic', 'UI Designer / Rubber Ducky', 'recon.png'],
    ['StajiW', 'Special FX / Guru', 'staji.png'],
    ['connor_harkness', 'Natural Product Enhancement', 'connor.png'],
    ['Jimmy_Pants_', 'Cloud Wrangler', 'jimmy-pants.png'],
];

// Show the team and open support through the shared dialog route.
export function TeamPage() {
    const [params, setParams] = useSearchParams();
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
    </main>;
}
