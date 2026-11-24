import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { Sniffer } from './sniffer';
import { gameOverlayLine } from './overlay';
import { useAuth } from '../ui/Session';
import { errorMessage } from '../ui/api';
import { useQueryClient } from '@tanstack/react-query';
import type { GameOverlayCorner, GameOverlaySize, GameOverlayState } from '../ui/desktop-state';

const overlayCorners: GameOverlayCorner[] = ['top-right', 'top-left', 'bottom-right', 'bottom-left'];
const overlaySizes: GameOverlaySize[] = ['small', 'medium', 'large'];

type Runtime = { engine: Sniffer | null; error?: string; paused: boolean; retry: () => void };
const GameplayContext = createContext<Runtime | null>(null);

// The account owns one engine; switching UI screens does not create another poller.
export function GameplayProvider({ children }: { children: ReactNode }) {
    const auth = useAuth();
    const client = useQueryClient();
    const { pathname } = useLocation();
    const configuring = pathname === '/config';
    const [engine, setEngine] = useState<Sniffer | null>(null);
    const [error, setError] = useState<string>();
    const [revision, setRevision] = useState(0);

    useEffect(() => {
        if (configuring) return;
        const controller = new AbortController();
        let running: Sniffer | undefined;
        setEngine(null);
        setError(undefined);

        // Skip Strict Mode's discarded setup before prompting or launching the reader.
        void Promise.resolve().then(async () => {
            if (controller.signal.aborted) return;
            try {
                window.api.launchRocksniffer();
                running = await Sniffer.create(auth, controller.signal);
                if (controller.signal.aborted) {
                    running.stop();
                    return;
                }
                running.start();
                setEngine(running);
            } catch (failure) {
                if (!controller.signal.aborted) setError(errorMessage(failure));
            }
        });

        return () => {
            controller.abort();
            running?.stop();
        };
    }, [auth, configuring, revision]);

    // Successful uploads refresh visible statistics and mark other score views stale.
    useEffect(() => {
        if (!engine) return;
        let previousRevision = engine.getSnapshot().scoreRevision;
        return engine.subscribe(() => {
            const current = engine.getSnapshot().scoreRevision;
            if (current === previousRevision) return;
            previousRevision = current;
            void client.invalidateQueries({
                queryKey: ['resource'],
                predicate: query => /^(stats|rank|ranks|scores):/.test(String(query.queryKey[1])),
            });
        });
    }, [client, engine]);

    // Mirror the running engine into the optional in-game overlay; it never starts another reader.
    useEffect(() => {
        if (!engine) return;
        let cancelled = false;
        let unsubscribe: (() => void) | undefined;
        let previous = '';

        void (async () => {
            // Read this account's overlay settings; Config stops the engine, so edits apply on return.
            const read = (key: string) => window.api.storeGet(`user_data.${auth.user_id}.${key}`);
            const enabled = (await read('game_overlay')) === true;
            const savedCorner = await read('game_overlay_corner');
            const savedSize = await read('game_overlay_size');
            if (cancelled || !enabled) return;

            const corner = overlayCorners.includes(savedCorner) ? savedCorner : 'top-right';
            const size = overlaySizes.includes(savedSize) ? savedSize : 'medium';

            // The engine publishes every refresh, so only send the overlay a changed line.
            const send = () => {
                const line = gameOverlayLine(engine.getSnapshot(), auth.user_id);
                const next: GameOverlayState | null = line ? { ...line, corner, size } : null;
                const key = JSON.stringify(next);
                if (key === previous) return;
                previous = key;
                window.api.setGameOverlay(next);
            };
            send();
            unsubscribe = engine.subscribe(send);
        })();

        // Hide a visible overlay when gameplay stops, Config opens, or the account signs out.
        return () => {
            cancelled = true;
            unsubscribe?.();
            if (previous && previous !== 'null') window.api.setGameOverlay(null);
        };
    }, [auth.user_id, engine]);

    return (
        <GameplayContext value={{ engine, error, paused: configuring, retry: () => setRevision((value) => value + 1) }}>
            {children}
        </GameplayContext>
    );
}

export function useGameplay() {
    const value = useContext(GameplayContext);
    if (!value) throw new Error('GameplayProvider is missing.');
    return value;
}
