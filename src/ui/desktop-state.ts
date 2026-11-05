export interface DesktopUpdateState {
    status: 'disabled' | 'idle' | 'checking' | 'downloading' | 'ready' | 'installing' | 'error';
    message: string;
    version?: string | null;
    percent?: number;
}

export interface ConnectionState {
    connected: boolean;
    message: string;
}
