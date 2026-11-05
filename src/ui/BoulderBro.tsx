import { useEffect, useState } from 'react';
import { Modal } from './Modal';

// Recognize the hidden key sequence without counting keys typed into text fields.
export function BoulderBro() {
    const [visible, setVisible] = useState(false);
    useEffect(() => {
        const sequence = 'ArrowUpArrowUpArrowDownArrowDownArrowLeftArrowRightArrowLeftArrowRightba';
        let keys = '';
        const onKey = (event: KeyboardEvent) => {
            if (
                event.target instanceof HTMLInputElement ||
                event.target instanceof HTMLTextAreaElement
            )
                return;
            keys = (keys + event.key).slice(-sequence.length);
            if (keys === sequence) setVisible(true);
        };
        window.addEventListener('keyup', onKey);
        return () => window.removeEventListener('keyup', onKey);
    }, []);
    return visible ? (
        <Modal
            title="You found Boulder Bro, Rock Buddy's big brother!"
            onClose={() => setVisible(false)}
        >
            <img className="boulder-bro" src="../images/boulder-bro.png" alt="Boulder Bro" />
        </Modal>
    ) : null;
}
