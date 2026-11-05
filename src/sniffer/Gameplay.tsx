import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { Sniffer } from './sniffer';
import { useAuth } from '../ui/Session';
import { errorMessage } from '../ui/api';
import { useQueryClient } from '@tanstack/react-query';

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
