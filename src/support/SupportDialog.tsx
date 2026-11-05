import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supportAmount } from '../support-amount';
import { Modal } from '../ui/Modal';

type CheckoutState =
    | { status: 'idle' | 'pending' | 'opened' }
    | { status: 'error'; message: string };

// Keep the current screen mounted while support is open above it.
export function SupportOverlay() {
    const [params, setParams] = useSearchParams();
    if (params.get('support') !== '1') return null;

    function closeSupport() {
        const next = new URLSearchParams(params);
        next.delete('support');
        setParams(next, { replace: true });
    }

    return <SupportDialog onClose={closeSupport} />;
}

// Keep the support form inside the app and leave PayPal approval to the browser.
export function SupportDialog({ onClose }: { onClose: () => void }) {
    return <Modal title="Support Rock Buddy" className="support-dialog" onClose={onClose} dismissOnBackdrop
        titleAccessory={<img className="support-title-emote" src="../images/peepoLove.png" alt="" width={28} height={28} />}>
        <SupportForm />
    </Modal>;
}

// Collect the amount and frequency, then hand payment approval to the browser.
export function SupportForm() {
    const [checkoutSession] = useState(() => crypto.randomUUID());
    const [amount, setAmount] = useState('5');
    const [kind, setKind] = useState<'once' | 'monthly'>('once');
    const [environment, setEnvironment] = useState<{ sandbox: boolean } | null>(null);
    const [checkout, setCheckout] = useState<CheckoutState>({ status: 'idle' });
    // This lock also blocks two submissions before React commits the disabled button.
    const checkoutPending = useRef(false);
    const amountValid = supportAmount(amount) !== null;
    const submitting = checkout.status === 'pending';

    // Check the payment environment before enabling checkout.
    useEffect(() => {
        let mounted = true;

        window.api.supportInfo(checkoutSession).then(info => {
            if (!mounted) return;
            setEnvironment(info);
        }).catch(() => {
            if (!mounted) return;
            setCheckout({ status: 'error', message: 'Support is unavailable. Close and reopen this dialog to try again.' });
        });

        return () => { mounted = false; };
    }, [checkoutSession]);

    // Submit once per click and never report an opened browser as a completed payment.
    async function startCheckout(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!environment || !amountValid || checkoutPending.current) return;

        checkoutPending.current = true;
        setCheckout({ status: 'pending' });

        try {
            const result = await window.api.startSupportCheckout({ amount, kind });
            if (result.opened === true) {
                setCheckout({ status: 'opened' });
            } else {
                setCheckout({ status: 'error', message: result.error || 'Could not open PayPal. Please retry this checkout.' });
            }
        } catch {
            setCheckout({ status: 'error', message: 'Could not open PayPal. Please retry this checkout.' });
        } finally {
            checkoutPending.current = false;
        }
    }

    // Open the matching sandbox or live PayPal subscription settings.
    async function manageSupport() {
        try {
            await window.api.manageSupport();
        } catch {
            setCheckout({ status: 'error', message: 'Could not open PayPal. Please try again.' });
        }
    }

    const message = checkout.status === 'error' ? checkout.message
        : checkout.status === 'opened' ? 'Finish reviewing your payment in PayPal.' : '';

    return (
        <div className="support-page">
            <p className="support-thanks">Community support makes Rock Buddy possible. Thank you for being part of it!</p>
            <p className="support-thanks">You can support Rock Buddy with a one-time or monthly donation.</p>
            {environment?.sandbox && <p id="sandbox-note" className="sandbox-note">PayPal sandbox · No real payments</p>}

            <form id="support-form" onSubmit={startCheckout}>
                <fieldset className="frequency" disabled={submitting}>
                    <legend className="sr-only">Payment frequency</legend>
                    <label>
                        <input type="radio" name="kind" value="once" checked={kind === 'once'} onChange={() => setKind('once')} />
                        <span>One time</span>
                    </label>
                    <label>
                        <input type="radio" name="kind" value="monthly" checked={kind === 'monthly'} onChange={() => setKind('monthly')} />
                        <span>Monthly</span>
                    </label>
                </fieldset>

                <label htmlFor="support-amount">Amount (USD)</label>
                <input
                    id="support-amount"
                    name="amount"
                    type="number"
                    inputMode="decimal"
                    min="5"
                    max="999999.99"
                    step="0.01"
                    required
                    disabled={submitting}
                    value={amount}
                    onChange={event => setAmount(event.currentTarget.value)}
                />
                <p id="monthly-note" className="muted" hidden={kind !== 'monthly'}>Repeats monthly until you cancel.</p>
                <button id="support-submit" type="submit" disabled={!environment || submitting || !amountValid}>
                    {submitting ? 'Opening PayPal…' : 'Continue to PayPal'}
                </button>
                <p id="support-status" role="status" className={checkout.status === 'error' ? 'error' : undefined}>
                    {message}
                </p>
            </form>

            <button type="button" id="support-manage" className="text-button" onClick={manageSupport} disabled={submitting}>Manage monthly support</button>
        </div>
    );
}
