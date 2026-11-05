import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal } from '../ui/Modal';

// Installation-wide and deliberately unversioned: upgrades and account changes
// must never reset this invitation.
const seenKey = 'support_welcome_shown';

export function SupportWelcome({ enabled }: { enabled: boolean }) {
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);

    useEffect(() => {
        if (!enabled) return;
        let active = true;
        void (async () => {
            try {
                if (await window.api.storeGet(seenKey) || !active) return;
                // Persist before presenting, including when the app closes while
                // the dialog is open. A failed settings write must not cause nagging.
                await window.api.storeSet(seenKey, true);
                if (active) setOpen(true);
            } catch {
                window.api.logMessage('The community welcome could not be initialized.');
            }
        })();
        return () => { active = false; };
    }, [enabled]);

    if (!open) return null;
    return <Modal title="Thank you for being part of the Rock Buddy community!"
        className="support-welcome" onClose={() => setOpen(false)} dismissOnBackdrop>
        <img className="support-welcome-logo" src="../images/icon-256x256.png" alt="Rock Buddy" width={88} height={88} />
        <p>Rock Buddy is a passion project made possible by an amazing community of musicians like you! Keeping Rock Buddy running, improving, and growing takes time and resources, but your encouragement and support make it all worthwhile.</p>
        <p>If you enjoy using Rock Buddy, please consider making a small donation to help support its continued development. Every contribution, big or small, helps keep Rock Buddy alive and getting better!</p>
        <div className="support-welcome-actions">
            <button className="btn-primary" onClick={() => {
                setOpen(false);
                navigate('/team?support=1');
            }}>Support Rock Buddy!</button>
            <button className="text-button" onClick={() => setOpen(false)}>Maybe later</button>
        </div>
        <p className="support-welcome-signoff">You ROCK! <img src="../images/peepoLove.png" alt="peepoLove" width={36} height={36} /></p>
    </Modal>;
}
