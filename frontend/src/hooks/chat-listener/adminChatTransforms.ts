
// --------------------------------------------------------------------------------
// Timestamp Conversion
// --------------------------------------------------------------------------------
function toIsoTs(ts: unknown): string {
    // If server sends unix seconds or ms
    if (typeof ts === "number") {
        if (ts < 10_000_000_000) { return new Date(ts * 1000).toISOString(); }
        else                     { return new Date(ts       ).toISOString(); }
    }
    if (typeof ts === "string") return ts;
    return new Date().toISOString();
}


export { toIsoTs };
