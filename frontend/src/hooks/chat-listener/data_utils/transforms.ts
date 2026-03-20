
// --------------------------------------------------------------------------------
// Timestamp Conversion
// --------------------------------------------------------------------------------
export function toIsoTs(ts: unknown): string {
    // Already ISO (or any date string parseable by Date)
    if (typeof ts === "string") {
        const parsed = Date.parse(ts);
        return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date().toISOString();
    }

    // Unix seconds or unix milliseconds (if it's in seconds (10 digits-ish), convert to ms)
    if (typeof ts === "number" && Number.isFinite(ts)) {
        const ms = ts < 10_000_000_000 ? ts * 1000 : ts;
        return new Date(ms).toISOString();
    }

    // Date object
    if (ts instanceof Date && Number.isFinite(ts.getTime())) {
        return ts.toISOString();
    }

    // Fallback: now
    return new Date().toISOString();
}

