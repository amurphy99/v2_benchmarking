
// --------------------------------------------------------------------------------
// Format a topics value (string[] from DB) into display text
// --------------------------------------------------------------------------------
export function formatTopics(raw: string[] | null | undefined): string {
    if (!raw || raw.length === 0) return "—";
    return raw.filter(Boolean).join(", ");
}

// --------------------------------------------------------------------------------
// Session type for analysis display components
// --------------------------------------------------------------------------------
export type SessionLike = {
    topics      ?: string[] | null;
    sentiment   ?: string   | null;
    emotion     ?: string   | null;
    summary     ?: string   | null;
    risk_level  ?: number   | null;
    risk_quotes ?: string[] | null;
    risk_reason ?: string   | null;
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
