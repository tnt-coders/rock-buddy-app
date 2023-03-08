import { API } from './preload.ts';

declare global {
  interface Window { api: typeof API }
}