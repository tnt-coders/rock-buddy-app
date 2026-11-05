import { createContext, useContext, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';

type SearchState = { input: string; query: string; revision: number };
const SearchContext = createContext<{
    search: SearchState;
    setSearch: Dispatch<SetStateAction<SearchState>>;
} | null>(null);

// Keep the last search when leaving its page, but discard it with the login session.
export function SearchStateProvider({ children }: { children: ReactNode }) {
    const [search, setSearch] = useState<SearchState>({ input: '', query: '', revision: 0 });
    return <SearchContext value={{ search, setSearch }}>{children}</SearchContext>;
}

export function useSearchState() {
    const state = useContext(SearchContext);
    if (!state) {
        throw new Error('SearchStateProvider is missing.');
    }
    return state;
}
