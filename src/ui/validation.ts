export function validateUsername(value: string) {
    if (!/^\w{4,25}$/.test(value))
        throw new Error(
            'Username must be between 4 and 25 characters, using letters, numbers, or underscores.',
        );
}

export function validateEmail(value: string) {
    if (value.length > 255 || !/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(value)) {
        throw new Error('Email is invalid.');
    }
}

// Check password strength before comparing the confirmation field.
export function validatePassword(value: string, confirmation: string) {
    if (
        value.length < 8 ||
        value.length > 255 ||
        value.includes(' ') ||
        !/[A-Z]/.test(value) ||
        !/[a-z]/.test(value) ||
        !/[0-9]/.test(value) ||
        !/[^\w]/.test(value)
    ) {
        throw new Error(
            'Password must be 8–255 characters with an uppercase letter, lowercase letter, number, and special character, without spaces.',
        );
    }
    if (value !== confirmation) throw new Error('Passwords do not match.');
}

// Round the remaining wait up so the message never promises an early username change.
export function usernameWaitMessage(seconds: number) {
    if (seconds >= 86400) {
        const days = Math.ceil(seconds / 86400);
        return `You can change your username in ${days} ${days === 1 ? 'day' : 'days'}.`;
    }
    const minutes = Math.ceil(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const remaining = minutes % 60;
    return `You can change your username in ${hours} ${hours === 1 ? 'hour' : 'hours'} ${remaining} ${remaining === 1 ? 'minute' : 'minutes'}.`;
}
