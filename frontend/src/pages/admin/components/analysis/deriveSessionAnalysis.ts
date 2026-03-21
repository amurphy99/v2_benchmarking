
// --------------------------------------------------------------------------------
// Format a topics value (string[] from DB, or legacy string) into display text
// --------------------------------------------------------------------------------
export function formatTopics(raw: unknown): string {
    if (Array.isArray(raw))      { return raw.filter(Boolean).join(", "); }
    if (typeof raw !== "string") { return "—"; }
    const s = raw.trim();
    try {
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed)) return parsed.filter(Boolean).join(", ");
    } catch {}
    return s
        .replace(/[\[\]"']/g, "")
        .split  (",")
        .map    ((t) => t.trim())
        .filter (Boolean)
        .join   (", ");
}

// --------------------------------------------------------------------------------
// Session type for analysis display components
// --------------------------------------------------------------------------------
export type SessionLike = {
    topics      ?: string[] | string | null;
    sentiment   ?: string        | null;
    emotion     ?: string        | null;
    summary     ?: string        | null;
    risk_level  ?: number        | null;
    risk_quotes ?: string[]      | null;
    risk_reason ?: string        | null;
};

// --------------------------------------------------------------------------------
// Derive all display-ready analysis fields from a session object
// --------------------------------------------------------------------------------
export function deriveSessionAnalysis(session: SessionLike) {
    return {
        topics         : formatTopics(session.topics),
        sentiment      : session.sentiment   ?? "neutral",
        emotion        : session.emotion     ?? "neutral",
        summary        : session.summary     ?? "—",
        risk_rating    : session.risk_level  ?? null,
        risk_quotes    : session.risk_quotes ?? [],
        risk_reasoning : session.risk_reason ?? "—",
    };
}
