// Show initial loading or errors without hiding data already displayed by the page.
export function AsyncState({
    loading,
    error,
    retry,
    hasData = false,
}: {
    loading?: boolean;
    error?: string;
    retry?: () => void;
    hasData?: boolean;
}) {
    if (error)
        return (
            <div role="alert">
                <p>{hasData ? `Showing previous data. ${error}` : error}</p>
                {retry && <button onClick={retry}>Retry</button>}
            </div>
        );
    return loading ? (
        <div className="page-placeholder" role="status" aria-label="Loading">
            <span>Loading…</span>
            <div aria-hidden="true" className="placeholder-line" />
            <div aria-hidden="true" className="placeholder-line" />
            <div aria-hidden="true" className="placeholder-line" />
        </div>
    ) : null;
}
