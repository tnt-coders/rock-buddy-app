import { post } from '../common/functions';

export type { AuthData } from '../common/types';

// Keep the existing PHP endpoint contracts behind one renderer API boundary.
export async function request<T = any>(endpoint: string, data: object = {}): Promise<T> {
    const host = await window.api.getHost();
    const response = await post(`${host}/api/${endpoint}.php`, data);
    if (response.error) throw new Error(response.error);
    return response;
}

export function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}
